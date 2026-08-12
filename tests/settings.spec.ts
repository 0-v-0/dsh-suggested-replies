/** Tests for the suggested-replies settings RPC. */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { CHANNEL, registerSuggestedRepliesRpc, type SettingsResponse } from '../src/rpc.ts'

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

describe('registerSuggestedRepliesRpc', () => {
  it('registers the dedicated trusted channel', () => {
    const { ctx } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, () => true, async () => undefined)
    expect((ctx.connection.rpc.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      CHANNEL,
      expect.any(Function),
      { authority: 'trusted-host' },
    )
  })

  it('gets and sets the enabled state', async () => {
    const { ctx, handler } = makeCtxStub()
    let enabled = true
    registerSuggestedRepliesRpc(ctx as never, () => enabled, async next => { enabled = next })
    expect(await handler()('settings.get', {}, signal)).toEqual({ ok: true, value: { enabled: true } })
    expect(await handler()('settings.set', { enabled: false }, signal)).toEqual({ ok: true, value: { enabled: false } } satisfies RpcResult<SettingsResponse>)
  })

  it.each([{}, null, { enabled: 'false' }, []])('rejects malformed set payload %#', async payload => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, () => true, async () => undefined)
    const result = await handler()('settings.set', payload, signal)
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('returns writer failures and unknown endpoint errors', async () => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, () => true, async () => { throw new Error('write failed') })
    expect(await handler()('settings.set', { enabled: false }, signal)).toMatchObject({ ok: false, error: { message: 'write failed' } })
    expect(await handler()('other', {}, signal)).toMatchObject({ ok: false, error: { message: 'unknown endpoint: other' } })
  })
})
