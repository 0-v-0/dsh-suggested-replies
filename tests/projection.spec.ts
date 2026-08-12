/** Tests for the suggested-replies session projection fold. */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SuggestedRepliesProjection } from '../src/types.ts'
import { foldSuggestedReplies } from '../src/projection.ts'

/** Build the smallest event accepted by the pure fold. */
function event(type: string, data: unknown): SessionEvent {
  return { type, seq: 0, time: 0, data } as SessionEvent
}

describe('foldSuggestedReplies', () => {
  it('leaves an empty projection empty for unrelated events', () => {
    expect(foldSuggestedReplies(null, event('turn/end', { turn: 1 }))).toBeNull()
  })

  it('preserves the same reference for unrelated events', () => {
    const state: SuggestedRepliesProjection = { turn: 1, generating: false, suggestions: ['a', 'b', 'c'] }
    expect(foldSuggestedReplies(state, event('request/context', {}))).toBe(state)
  })

  it('enters loading state with the generating event', () => {
    const result = foldSuggestedReplies(null, event('suggested-replies/generating', {
      turn: 2,
      route: { provider: 'deepseek', model: 'chat' },
      system: 'system',
      prompt: 'prompt',
      maxTokens: 384,
    }))
    expect(result).toEqual({ turn: 2, generating: true, suggestions: [] })
  })

  it('publishes the latest ready candidates', () => {
    const result = foldSuggestedReplies(
      { turn: 1, generating: true, suggestions: [] },
      event('suggested-replies/suggestions', { turn: 1, suggestions: ['继续实现', '运行测试', '查看差异'] }),
    )
    expect(result).toEqual({ turn: 1, generating: false, suggestions: ['继续实现', '运行测试', '查看差异'] })
  })

  it('allows an empty result to end loading after a provider failure', () => {
    expect(foldSuggestedReplies(
      { turn: 1, generating: true, suggestions: [] },
      event('suggested-replies/suggestions', { turn: 1, suggestions: [] }),
    )).toEqual({ turn: 1, generating: false, suggestions: [] })
  })

  it('clears on explicit invalidation and the next turn boundary', () => {
    const state: SuggestedRepliesProjection = { turn: 1, generating: false, suggestions: ['a', 'b', 'c'] }
    expect(foldSuggestedReplies(state, event('suggested-replies/cleared', { reason: 'new-input' }))).toBeNull()
    expect(foldSuggestedReplies(state, event('turn/start', { turn: 2 }))).toBeNull()
  })

  it('replaces a previous turn with the latest generation', () => {
    const result = foldSuggestedReplies(
      { turn: 1, generating: false, suggestions: ['old'] },
      event('suggested-replies/generating', {
        turn: 2,
        route: { provider: 'p', model: 'm' },
        system: 's',
        prompt: 'p',
        maxTokens: 64,
      }),
    )
    expect(result).toEqual({ turn: 2, generating: true, suggestions: [] })
  })
})
