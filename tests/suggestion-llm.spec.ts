/** Tests for auxiliary route selection, request assembly, and stream handling. */
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  buildSuggestionCallOptions,
  drainTextStream,
  generateSuggestedReplies,
  prepareSuggestionRequest,
  resolveSuggestionRoute,
  type PreparedSuggestionRequest,
} from '../src/suggestion-llm.ts'

/** Build a minimal Agent face for the pure helpers. */
function agent(options: {
  readonly logged?: { provider: string; model: string }
  readonly fallback?: { provider?: string; model?: string }
  readonly messages?: Message[]
} = {}): Agent {
  return {
    id: 'session-1' as Agent['id'],
    options: options.fallback ?? {},
    session: {
      requestHeader: () => options.logged === undefined ? undefined : { config: options.logged },
      deriveMessages: () => options.messages ?? [],
      events: (options.messages ?? []).flatMap((candidate, index) => candidate.role === 'assistant'
        ? [{
            type: 'assistant/message',
            seq: index,
            time: 0,
            data: { turn: 1, step: 1, message: candidate },
          }]
        : []),
    },
  } as unknown as Agent
}

/** Create a text-only conversation message. */
function textMessage(role: 'user' | 'assistant', text: string): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role,
    content: [{ type: 'text', text }],
    source: role === 'assistant'
      ? { kind: 'model', provider: 'logged-provider', model: 'logged-model' }
      : { kind: 'user' },
  }
}

async function* chunks(values: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  yield* values
}

describe('resolveSuggestionRoute', () => {
  it('prefers the latest logged request route', () => {
    expect(resolveSuggestionRoute(agent({
      logged: { provider: 'logged', model: 'actual' },
      fallback: { provider: 'default', model: 'fallback' },
    }))).toEqual({ provider: 'logged', model: 'actual' })
  })

  it('falls back to Agent options and rejects incomplete routes', () => {
    expect(resolveSuggestionRoute(agent({ fallback: { provider: 'p', model: 'm' } }))).toEqual({ provider: 'p', model: 'm' })
    expect(resolveSuggestionRoute(agent({ fallback: { provider: 'p' } }))).toBeNull()
  })
})

describe('prepareSuggestionRequest', () => {
  it('returns a request whose logged inputs match the dispatched inputs', () => {
    const controller = new AbortController()
    const subject = agent({
      logged: { provider: 'logged', model: 'actual' },
      messages: [textMessage('user', '请实现'), textMessage('assistant', '已经实现完成')],
    })
    const request = prepareSuggestionRequest(
      { get: () => ({}) } as never,
      subject,
      { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 384 },
      1,
      controller.signal,
    )
    expect(request).not.toBeNull()
    expect(request?.log.route).toEqual({ provider: 'logged', model: 'actual' })
    expect(request?.options).toMatchObject({
      provider: request?.log.route.provider,
      model: request?.log.route.model,
      system: request?.log.system,
      maxTokens: request?.log.maxTokens,
      sessionId: 'session-1',
      tools: [],
    })
    expect(request?.options.reasoningEffort).toBeUndefined()
    expect(request?.options.messages).toHaveLength(1)
    expect(request?.options.messages[0]?.content).toEqual([{ type: 'text', text: request?.log.prompt }])
  })

  it('returns null without an LLM service, a route, or a final assistant text', () => {
    const config = { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 384 }
    const signal = new AbortController().signal
    expect(prepareSuggestionRequest({ get: () => undefined } as never, agent(), config, 1, signal)).toBeNull()
    expect(prepareSuggestionRequest({ get: () => ({}) } as never, agent({ messages: [textMessage('assistant', 'answer')] }), config, 2, signal)).toBeNull()
    expect(prepareSuggestionRequest({ get: () => ({}) } as never, agent({
      fallback: { provider: 'p', model: 'm' },
      messages: [textMessage('user', 'latest')],
    }), config, 1, signal)).toBeNull()
  })
})

describe('buildSuggestionCallOptions', () => {
  it('uses the system slot and a single plugin-sourced user message', () => {
    const controller = new AbortController()
    const options = buildSuggestionCallOptions(
      { provider: 'p', model: 'm' }, 'prompt', 'system', 128, controller.signal,
    )
    expect(options).toMatchObject({ provider: 'p', model: 'm', system: 'system', maxTokens: 128, tools: [] })
    expect(options.reasoningEffort).toBeUndefined()
    expect(options.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'prompt' }],
      source: { kind: 'plugin', plugin: 'dsh-suggested-replies' },
    })
  })
})

describe('drainTextStream', () => {
  it('joins deltas only after a normal stop', async () => {
    await expect(drainTextStream(chunks([
      { type: 'text-delta', index: 0, text: 'a' },
      { type: 'reasoning-delta', index: 1, text: 'hidden' },
      { type: 'text-delta', index: 0, text: 'b' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]))).resolves.toBe('ab')
  })

  it('returns null for non-stop or empty completions', async () => {
    await expect(drainTextStream(chunks([{ type: 'finish', reason: { kind: 'max-tokens' } }]))).resolves.toBeNull()
    await expect(drainTextStream(chunks([{ type: 'finish', reason: { kind: 'stop' } }]))).resolves.toBeNull()
  })
})

describe('generateSuggestedReplies', () => {
  it('streams the prepared request and parses candidates', async () => {
    const stream = vi.fn((_options: GenerateOptions) => chunks([
      { type: 'text-delta', index: 0, text: '{"suggestions":["继续实现","运行测试","查看差异"]}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]))
    const request = {
      log: { route: { provider: 'p', model: 'm' }, system: 's', prompt: 'p', maxTokens: 128 },
      options: { provider: 'p', model: 'm', messages: [] },
    } as PreparedSuggestionRequest
    await expect(generateSuggestedReplies(
      { get: () => ({ stream }) } as never,
      request,
      { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 128 },
      new AbortController().signal,
    )).resolves.toEqual(['继续实现', '运行测试', '查看差异'])
    expect(stream).toHaveBeenCalledWith(request.options)
  })

  it('returns null after aborts, malformed output, and thrown streams', async () => {
    const config = { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 128 }
    const request = { log: {}, options: { provider: 'p', model: 'm', messages: [] } } as unknown as PreparedSuggestionRequest
    const controller = new AbortController()
    controller.abort()
    await expect(generateSuggestedReplies({ get: () => ({}) } as never, request, config, controller.signal)).resolves.toBeNull()
    await expect(generateSuggestedReplies({ get: () => ({ stream: () => chunks([
      { type: 'text-delta', index: 0, text: 'not json' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]) }) } as never, request, config, new AbortController().signal)).resolves.toBeNull()
    await expect(generateSuggestedReplies({ get: () => ({ stream: () => { throw new Error('boom') } }) } as never, request, config, new AbortController().signal)).resolves.toBeNull()
  })
})
