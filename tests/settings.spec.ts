/** Tests for the suggested-replies RPC endpoints. */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  CHANNEL,
  registerSuggestedRepliesRpc,
  type ConfigResponse,
  type SuggestedRepliesStateResponse,
} from '../src/rpc.ts'

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>

/** Capture one registered RPC handler without constructing a Cordis host. */
function makeCtxStub(): { ctx: object; handler: () => RpcHandler } {
  let captured: RpcHandler | undefined
  const ctx = {
    connection: { rpc: { handle: vi.fn((_channel: string, handler: RpcHandler) => {
      captured = handler
      return async () => undefined
    }) } },
    inject: (_deps: readonly string[], callback: (ctx: typeof ctx) => void) => callback(ctx),
  }
  return { ctx, handler: () => captured as RpcHandler }
}

const signal = new AbortController().signal

function state(revision = 0): SuggestedRepliesStateResponse {
  return { lifecycle: { createdAt: 1, cwd: '/work' }, revision, turn: null, phase: 'cleared', suggestions: [] }
}

function storeStub() {
  return {
    get: vi.fn(async () => state()),
    watch: vi.fn(async () => state(2)),
  }
}

const defaultConfig: ConfigResponse = {
  suggestionCount: 3,
  reasoningEffort: 'off',
  redactSecrets: true,
  stripControls: true,
  singleLine: true,
  filterMetaText: true,
  filterEvaluative: true,
  filterAssistantVoice: true,
  filterTooLong: true,
  manualShortcut: 'Mod+Shift+Space',
  manualReplacesDraft: true,
}

function noopGetConfig(): ConfigResponse {
  return { ...defaultConfig }
}

async function noopSetConfig(): Promise<ConfigResponse> {
  return { ...defaultConfig }
}

const noopGenerate = vi.fn(async () => undefined)
const noopDismiss = vi.fn(async () => undefined)
const noopSetCollapsed = vi.fn()

describe('registerSuggestedRepliesRpc', () => {
  it('registers the dedicated trusted channel', () => {
    const { ctx } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopSetCollapsed)
    expect((ctx.connection.rpc.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      CHANNEL,
      expect.any(Function),
      { authority: 'trusted-host' },
    )
  })

  it('gets config via config.get', async () => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopSetCollapsed)
    expect(await handler()('config.get', {}, signal)).toEqual({ ok: true, value: defaultConfig })
  })

  it('sets config via config.set', async () => {
    const { ctx, handler } = makeCtxStub()
    let current = { ...defaultConfig }
    const getConfig = () => current
    const setConfig = async (patch: Record<string, unknown>): Promise<ConfigResponse> => {
      current = { ...current, ...patch }
      return current
    }
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, getConfig, setConfig, noopGenerate, noopDismiss, noopSetCollapsed)
    const result = await handler()('config.set', { suggestionCount: 5 }, signal)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suggestionCount).toBe(5)
  })

  it('handles dock.setCollapsed', async () => {
    const { ctx, handler } = makeCtxStub()
    const setCollapsedFn = vi.fn()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, setCollapsedFn)
    const result = await handler()('dock.setCollapsed', { sessionId: 'session-a', collapsed: true }, signal)
    expect(result).toMatchObject({ ok: true, value: { ok: true } })
    expect(setCollapsedFn).toHaveBeenCalledWith('session-a', true)
  })

  it('returns writer failures and unknown endpoint errors', async () => {
    const { ctx, handler } = makeCtxStub()
    const setConfig = async (): Promise<ConfigResponse> => { throw new Error('write failed') }
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, setConfig, noopGenerate, noopDismiss, noopSetCollapsed)
    expect(await handler()('config.set', { suggestionCount: 0 }, signal)).toMatchObject({ ok: false, error: { message: 'write failed' } })
    expect(await handler()('other', {}, signal)).toMatchObject({ ok: false, error: { message: 'unknown endpoint: other' } })
  })

  it('gets and watches sidecar state with the request signal', async () => {
    const { ctx, handler } = makeCtxStub()
    const store = storeStub()
    registerSuggestedRepliesRpc(ctx as never, store as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopSetCollapsed)

    expect(await handler()('state.get', { sessionId: 'session-a' }, signal))
      .toEqual({ ok: true, value: state() })
    expect(store.get).toHaveBeenCalledWith('session-a', signal)

    expect(await handler()('state.watch', {
      sessionId: 'session-a', lifecycle: { createdAt: 1, cwd: '/work' }, revision: 1,
    }, signal))
      .toEqual({ ok: true, value: state(2) })
    expect(store.watch).toHaveBeenCalledWith('session-a', { createdAt: 1, cwd: '/work' }, 1, signal)
  })

  it.each([
    ['state.get', {}],
    ['state.get', { sessionId: '' }],
    ['state.watch', { sessionId: 's', revision: 1 }],
    ['state.watch', { sessionId: 's', revision: -1 }],
    ['state.watch', { sessionId: 's', revision: 1.5 }],
  ])('rejects malformed %s payload %#', async (endpoint, payload) => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopSetCollapsed)
    expect(await handler()(endpoint, payload, signal)).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})
