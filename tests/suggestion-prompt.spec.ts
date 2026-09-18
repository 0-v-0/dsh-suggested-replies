/** Tests for prompt construction and strict candidate parsing. */
import { describe, expect, it } from 'vitest'
import type { Message } from '@deepseek-ai/dsh-llm'
import {
  buildSuggestedRepliesUserPrompt,
  buildSuggestionSystemPrompt,
  fallbackSuggestedReplies,
  parseSuggestedReplies,
} from '../src/suggestion-prompt.ts'

const limits = { suggestionCount: 3, maxSuggestionChars: 10 }

/** Build a provider-neutral test message with only the fields used by the prompt. */
function message(role: Message['role'], textBlocks: readonly string[], extras: object = {}): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role,
    content: [...textBlocks.map(text => ({ type: 'text' as const, text })), ...Object.values(extras) as never[]],
    source: role === 'assistant'
      ? { kind: 'model', provider: 'p', model: 'm' }
      : { kind: 'user' },
  }
}

describe('buildSuggestionSystemPrompt', () => {
  it('pins count and character limits in the model instruction', () => {
    const prompt = buildSuggestionSystemPrompt(limits)
    expect(prompt).toContain('exactly 3')
    expect(prompt).toContain('at most 10 characters')
    expect(prompt).toContain('"suggestions"')
  })
})

describe('buildSuggestedRepliesUserPrompt', () => {
  it('requires the latest meaningful message to be an assistant answer', () => {
    expect(buildSuggestedRepliesUserPrompt([])).toBeNull()
    expect(buildSuggestedRepliesUserPrompt([message('user', ['question'])])).toBeNull()
    expect(buildSuggestedRepliesUserPrompt([message('assistant', ['answer']), message('user', ['follow-up'])])).toBeNull()
  })

  it('keeps text blocks and excludes non-text blocks', () => {
    const prompt = buildSuggestedRepliesUserPrompt([
      message('user', ['请继续']),
      message('assistant', ['好的', '这里是结果'], { tool: { type: 'tool-call', id: 'secret', name: 'bash', arguments: '{}' } }),
    ])
    expect(prompt).toContain('User: 请继续')
    expect(prompt).toContain('Assistant: 好的 这里是结果')
    expect(prompt).not.toContain('secret')
  })
})

describe('parseSuggestedReplies', () => {
  it('accepts plain and fenced JSON', () => {
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a', 'b', 'c'] }), limits)).toEqual(['a', 'b', 'c'])
    expect(parseSuggestedReplies('```json\n{"suggestions":["a","b","c"]}\n```', limits)).toEqual(['a', 'b', 'c'])
  })

  it('accepts fewer candidates than requested instead of discarding them', () => {
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a', 'b'] }), limits)).toEqual(['a', 'b'])
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a'] }), limits)).toEqual(['a'])
  })

  it('truncates to the requested count when the model overshoots', () => {
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a', 'b', 'c', 'd', 'e'] }), limits))
      .toEqual(['a', 'b', 'c'])
  })

  it('bounds candidates on code points without leaving a lone surrogate', () => {
    // 10 ASCII characters plus one astral code point: the 10-code-point bound
    // drops the emoji rather than cutting it in half.
    const parsed = parseSuggestedReplies(
      JSON.stringify({ suggestions: ['x'.repeat(10) + '💥', 'c', 'y'.repeat(20)] }),
      { suggestionCount: 3, maxSuggestionChars: 10 },
    )
    if (!Array.isArray(parsed)) throw new Error('parseSuggestedReplies returned a non-array result')
    expect(parsed).toEqual(['xxxxxxxxxx', 'c', 'yyyyyyyyyy'])
    expect(parsed.join('')).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('normalizes whitespace and bounds candidates', () => {
    const result = parseSuggestedReplies(JSON.stringify({ suggestions: ['  a\n b  ', 'c', 'x'.repeat(20)] }), limits)
    expect(result).toEqual(['a b', 'c', 'xxxxxxxxxx'])
  })

  it.each([
    '', 'not json', JSON.stringify({}), JSON.stringify({ suggestions: [] }),
    JSON.stringify({ suggestions: ['a', 2, 'c'] }), JSON.stringify({ suggestions: ['a', ' ', 'c'] }),
    JSON.stringify({ suggestions: ['a', 'A', 'c'] }),
    JSON.stringify({ suggestions: ['abcdefghijk-1', 'abcdefghijk-2', 'c'] }),
  ])('rejects malformed response %s', raw => {
    expect(parseSuggestedReplies(raw, limits)).toBeNull()
  })

  it('rejects when generation is disabled or the bound is unusable', () => {
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a', 'b', 'c'] }), { ...limits, suggestionCount: 0 }))
      .toBeNull()
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a'] }), { ...limits, maxSuggestionChars: 0 }))
      .toBeNull()
  })
})

describe('fallbackSuggestedReplies', () => {
  it('returns the first configured candidates in the recent conversation language', () => {
    // A realistic budget: the shared `limits` of 10 chars truncates the pool,
    // which would pin a garbled fallback as the expected output.
    const full = { suggestionCount: 3, maxSuggestionChars: 160 }
    expect(fallbackSuggestedReplies('User: 你好', full)).toEqual(['继续', '请详细说明一下', '给我一个具体例子'])
    expect(fallbackSuggestedReplies('User: Hello', { ...full, suggestionCount: 2 }))
      .toEqual(['Continue', 'Could you explain that in more detail?'])
  })

  it('covers the full configurable candidate range', () => {
    const max = { suggestionCount: 6, maxSuggestionChars: 300 }
    const en = fallbackSuggestedReplies('User: Hello', max)
    const zh = fallbackSuggestedReplies('User: 你好', max)
    expect(en).toHaveLength(6)
    expect(zh).toHaveLength(6)
    expect(new Set(en)).toHaveLength(6)
    expect(new Set(zh)).toHaveLength(6)
  })

  it('bounds each fallback on code points', () => {
    expect(fallbackSuggestedReplies('User: 你好', { suggestionCount: 6, maxSuggestionChars: 1 })).toHaveLength(6)
  })
})
