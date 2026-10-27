/**
 * Tests for the suggested-replies RPC endpoints.
 *
 * `SessionId` is a host-injected peer import, so it is stubbed before the
 * module under test is loaded. The real package resolves to the same value
 * for plain session ids, so the stub does not change any assertion below.
 */
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import {
  CHANNEL,
  isConfigSetPayload,
  registerSuggestedRepliesRpc,
  type ConfigResponse,
  type SuggestedRepliesStateResponse,
} from '../src/rpc.ts'

vi.mock('@deepseek-ai/dsh-session', () => ({ SessionId: (value: string) => value }))

/** HTTP route handler registered on the trusted channel. */
type RpcHttpHandler = (req: unknown, res: unknown) => Promise<void>

/** Capture one registered route handler without constructing a Cordis host. */
function makeCtxStub(): { ctx: object; handler: () => RpcHttpHandler } {
  let captured: RpcHttpHandler | undefined
  const ctx = {
    inject: (_deps: readonly string[], callback: (child: {
      effect: (fn: () => unknown) => unknown
      webServer: { register: (route: { kind: string; path: string; handler: RpcHttpHandler }) => () => undefined }
    }) => void) => {
      callback({
        effect: (fn: () => unknown) => fn(),
        webServer: {
          register: vi.fn((route: { kind: string; path: string; handler: RpcHttpHandler }) => {
            captured = route.handler
            return () => undefined
          }),
        },
      })
    },
  }
  return { ctx, handler: () => captured as RpcHttpHandler }
}

/** Drive one client-request envelope through the route handler and unwrap the result. */
async function invoke(handler: RpcHttpHandler, endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>> {
  let status = 0
  let body: unknown
  const res = {
    writeHead: (code: number) => { status = code },
    end: (raw: unknown) => { body = typeof raw === 'string' ? JSON.parse(raw) : raw },
    on: vi.fn(() => undefined),
  }
  const req = Readable.from([JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: endpoint, payload })]) as unknown as {
    url: string; method: string; headers: Record<string, string>
  }
  req.url = `${CHANNEL}/${endpoint}`
  req.method = 'POST'
  req.headers = { 'content-type': 'application/json' }
  await handler(req as never, res as never)
  if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(body)}`)
  return (body as { type: string; rpcId: string; result: ConnectionRpcResult<unknown> }).result
}

const signal = new AbortController().signal

function state(revision = 0): SuggestedRepliesStateResponse {
  return { lifecycle: { createdAt: 1, cwd: '/work' }, revision, turn: null, messageId: null, phase: 'cleared', suggestions: [] }
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
  displayMode: 'latest',
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
const noopFork = vi.fn(async () => 'child-session')
const noopGetDraft = vi.fn(() => null)
describe('registerSuggestedRepliesRpc', () => {
  it('registers the dedicated trusted channel', () => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    expect(handler()).toEqual(expect.any(Function))
  })

  it('gets config via config.get', async () => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    expect(await invoke(handler(), 'config.get', {})).toEqual({ ok: true, value: defaultConfig })
  })

  it('sets config via config.set', async () => {
    const { ctx, handler } = makeCtxStub()
    let current = { ...defaultConfig }
    const getConfig = () => current
    const setConfig = async (patch: Record<string, unknown>): Promise<ConfigResponse> => {
      current = { ...current, ...patch }
      return current
    }
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, getConfig, setConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    const result = await invoke(handler(), 'config.set', { suggestionCount: 5 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suggestionCount).toBe(5)
  })

  it('handles dock.setCollapsed', async () => {
    const { ctx, handler } = makeCtxStub()
    const setCollapsedFn = vi.fn()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, setCollapsedFn, noopGetDraft)
    const result = await invoke(handler(), 'dock.setCollapsed', { sessionId: 'session-a', collapsed: true })
    expect(result).toMatchObject({ ok: true, value: { ok: true } })
    expect(setCollapsedFn).toHaveBeenCalledWith('session-a', true)
  })

  it('returns writer failures and unknown endpoint errors', async () => {
    const { ctx, handler } = makeCtxStub()
    const setConfig = async (): Promise<ConfigResponse> => { throw new Error('write failed') }
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, setConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    expect(await invoke(handler(), 'config.set', { suggestionCount: 0 })).toMatchObject({ ok: false, error: { message: 'write failed' } })
    expect(await invoke(handler(), 'other', {})).toMatchObject({ ok: false, error: { message: 'unknown endpoint: other' } })
  })

  it('gets and watches sidecar state with the request signal', async () => {
    const { ctx, handler } = makeCtxStub()
    const store = storeStub()
    registerSuggestedRepliesRpc(ctx as never, store as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)

    expect(await invoke(handler(), 'state.get', { sessionId: 'session-a' }))
      .toEqual({ ok: true, value: state() })
    expect(store.get).toHaveBeenCalledWith('session-a', expect.any(AbortSignal))

    expect(await invoke(handler(), 'state.watch', {
      sessionId: 'session-a', lifecycle: { createdAt: 1, cwd: '/work' }, revision: 1,
    }))
      .toEqual({ ok: true, value: state(2) })
    expect(store.watch).toHaveBeenCalledWith('session-a', { createdAt: 1, cwd: '/work' }, 1, expect.any(AbortSignal))
  })

  it.each([
    ['state.get', {}],
    ['state.get', { sessionId: '' }],
    ['state.watch', { sessionId: 's', revision: 1 }],
    ['state.watch', { sessionId: 's', revision: -1 }],
    ['state.watch', { sessionId: 's', revision: 1.5 }],
  ])('rejects malformed %s payload %#', async (endpoint, payload) => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    expect(await invoke(handler(), endpoint, payload)).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('surfaces a config.get failure as an error result', async () => {
    const { ctx, handler } = makeCtxStub()
    const failingGetConfig = (): ConfigResponse => { throw new Error('settings unavailable') }
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, failingGetConfig, noopSetConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)
    expect(await invoke(handler(), 'config.get', {})).toMatchObject({ ok: false, error: { message: 'settings unavailable' } })
  })

  it.each([
    { suggestionCount: 7 },
    { suggestionCount: -1 },
    { suggestionCount: 2.5 },
    { suggestionCount: '3' },
    { reasoningEffort: 'high' },
    { displayMode: 'everywhere' },
    { redactSecrets: 'yes' },
    { manualShortcut: 42 },
    { suggestionCount: 3, unknownKey: true },
    null,
  ])('rejects an out-of-contract settings patch %j without calling the writer', async payload => {
    const { ctx, handler } = makeCtxStub()
    const setConfig = vi.fn(async (): Promise<ConfigResponse> => defaultConfig)
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, noopGetConfig, setConfig, noopGenerate, noopDismiss, noopFork, noopSetCollapsed, noopGetDraft)

    expect(await invoke(handler(), 'config.set', payload)).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(setConfig).not.toHaveBeenCalled()
  })

  it.each([
    { suggestionCount: 0 },
    { suggestionCount: 6, reasoningEffort: 'auto', displayMode: 'all' },
    { redactSecrets: false, filterTooLong: false },
    { manualShortcut: 'Mod+Shift+Space' },
    { suggestionCount: undefined },
    {},
  ])('accepts an in-contract settings patch %j', payload => {
    expect(isConfigSetPayload(payload)).toBe(true)
  })
})
