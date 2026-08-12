/**
 * Settings RPC for the suggested-replies Web surface.
 *
 * @module @dsh-external/dsh-suggested-replies/rpc
 */

import type { Context } from 'cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Dedicated channel for this plugin's settings endpoints. */
export const CHANNEL = '/suggested-replies'

/** Result returned by both settings endpoints. */
export interface SettingsResponse {
  /** Whether future completed turns generate candidates. */
  readonly enabled: boolean
}

/** Payload accepted by `settings.set`. */
export interface SettingsSetPayload {
  /** Requested enabled state. */
  readonly enabled: boolean
}

/** Construct a successful RPC branch. */
function ok(value: SettingsResponse): RpcResult<SettingsResponse> {
  return { ok: true, value }
}

/** Construct a stable RPC error branch. */
function fail(message: string): RpcResult<SettingsResponse> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * Register settings endpoints against the connection service.
 * @param ctx - plugin host context.
 * @param getEnabled - reads the current settings source.
 * @param setEnabled - persists and applies a new enabled state.
 */
export function registerSuggestedRepliesRpc(
  ctx: Context,
  getEnabled: () => boolean,
  setEnabled: (enabled: boolean) => Promise<void>,
): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection as HostConnectionHandle
    connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
      switch (endpoint) {
        case 'settings.get':
          return ok({ enabled: getEnabled() })
        case 'settings.set': {
          if (!isSettingsSetPayload(payload)) return fail('payload must be { enabled: boolean }')
          try {
            await setEnabled(payload.enabled)
            return ok({ enabled: getEnabled() })
          } catch (error) {
            return fail(error instanceof Error ? error.message : String(error))
          }
        }
        default:
          return fail(`unknown endpoint: ${endpoint}`)
      }
    }, { authority: 'trusted-host' })
  })
}

/** Narrow unknown wire data at the RPC boundary. */
function isSettingsSetPayload(value: unknown): value is SettingsSetPayload {
  return value !== null
    && typeof value === 'object'
    && typeof (value as { enabled?: unknown }).enabled === 'boolean'
}
