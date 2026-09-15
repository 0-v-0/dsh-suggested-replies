/** Settings and sidecar-state RPC for the suggested-replies Web surface. */

import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SuggestedRepliesSessionIdentity,
  SuggestedRepliesStateSnapshot,
  SuggestedRepliesStateStore,
} from './state.ts'

/** Dedicated channel for this plugin's Web endpoints. */
export const CHANNEL = '/suggested-replies'

/** Client-facing state returned by `state.get` and `state.watch`. */
export type SuggestedRepliesStateResponse = SuggestedRepliesStateSnapshot

/** Payload accepted by `dock.setCollapsed`. */
export interface DockSetCollapsedPayload {
  readonly sessionId: string
  readonly collapsed: boolean
}

/** Payload accepted by `state.get`. */
export interface StateGetPayload {
  /** Parent Session whose sidecar state should be returned. */
  readonly sessionId: string
}

/** Payload accepted by `state.watch`. */
export interface StateWatchPayload extends StateGetPayload {
  /** Session lifecycle observed by the caller. */
  readonly lifecycle: SuggestedRepliesSessionIdentity
  /** Last revision observed by the caller. */
  readonly revision: number
}

/** Payload accepted by `suggestions.generate`. */
export interface GeneratePayload {
  /** Parent Session whose last completed turn should generate candidates. */
  readonly sessionId: string
  /** Optional explicit turn number; omitted means use the last completed turn. */
  readonly turn?: number
}

/** Payload accepted by `suggestions.dismiss`. */
export interface DismissPayload {
  /** Parent Session whose active generation should be dismissed. */
  readonly sessionId: string
}

/** Generic success response returned by manual-trigger endpoints. */
export interface GenerateResult {
  /** Acknowledgement that the action was accepted. */
  readonly ok: true
}

/** Client-facing config snapshot returned by `config.get` and `config.set`. */
export interface ConfigResponse {
  readonly suggestionCount: number
  readonly reasoningEffort: string
  readonly redactSecrets: boolean
  readonly stripControls: boolean
  readonly singleLine: boolean
  readonly filterMetaText: boolean
  readonly filterEvaluative: boolean
  readonly filterAssistantVoice: boolean
  readonly filterTooLong: boolean
  readonly manualShortcut: string
  readonly manualReplacesDraft: boolean
}

/** Payload accepted by `config.set`. */
export interface ConfigSetPayload {
  readonly reasoningEffort?: string
  readonly suggestionCount?: number
  readonly redactSecrets?: boolean
  readonly stripControls?: boolean
  readonly singleLine?: boolean
  readonly filterMetaText?: boolean
  readonly filterEvaluative?: boolean
  readonly filterAssistantVoice?: boolean
  readonly filterTooLong?: boolean
  readonly manualShortcut?: string
  readonly manualReplacesDraft?: boolean
}

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function fail<T>(message: string): RpcResult<T> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/** Register settings and cancellable sidecar-state endpoints. */
export function registerSuggestedRepliesRpc(
  ctx: Context,
  store: SuggestedRepliesStateStore,
  getConfig: () => ConfigResponse,
  setConfig: (payload: ConfigSetPayload) => Promise<ConfigResponse>,
  generateFn: (sessionId: string, turn?: number) => Promise<void>,
  dismissFn: (sessionId: string) => Promise<void>,
  setCollapsedFn: (sessionId: string, collapsed: boolean) => void,
): void {
  const connection = ctx.connection as HostConnectionHandle
  connection.rpc.handle(CHANNEL, async (endpoint, payload, signal) => {
    switch (endpoint) {
      case 'dock.setCollapsed': {
        if (!isDockSetCollapsedPayload(payload)) return fail<GenerateResult>('payload must be { sessionId: string, collapsed: boolean }')
        try {
          setCollapsedFn(payload.sessionId, payload.collapsed)
          return ok<GenerateResult>({ ok: true })
        } catch (error) {
          return fail<GenerateResult>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'state.get': {
        if (!isStateGetPayload(payload)) return fail<SuggestedRepliesStateResponse>('payload must be { sessionId: string }')
        try {
          return ok(await store.get(SessionId(payload.sessionId), signal))
        } catch (error) {
          return fail<SuggestedRepliesStateResponse>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'state.watch': {
        if (!isStateWatchPayload(payload)) {
          return fail<SuggestedRepliesStateResponse>('payload must be { sessionId: string, lifecycle: { createdAt, cwd? }, revision: non-negative safe integer }')
        }
        try {
          return ok(await store.watch(SessionId(payload.sessionId), payload.lifecycle, payload.revision, signal))
        } catch (error) {
          if (signal.aborted) throw error
          return fail<SuggestedRepliesStateResponse>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'suggestions.generate': {
        if (!isGeneratePayload(payload)) return fail<GenerateResult>('payload must be { sessionId: string, turn?: number }')
        try {
          await generateFn(payload.sessionId, payload.turn)
          return ok<GenerateResult>({ ok: true })
        } catch (error) {
          return fail<GenerateResult>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'suggestions.dismiss': {
        if (!isDismissPayload(payload)) return fail<GenerateResult>('payload must be { sessionId: string }')
        try {
          await dismissFn(payload.sessionId)
          return ok<GenerateResult>({ ok: true })
        } catch (error) {
          return fail<GenerateResult>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'config.get':
        return ok<ConfigResponse>(getConfig())
      case 'config.set': {
        if (!isRecord(payload)) return fail<ConfigResponse>('payload must be a config object')
        try {
          const result = await setConfig(payload as ConfigSetPayload)
          return ok<ConfigResponse>(result)
        } catch (error) {
          return fail<ConfigResponse>(error instanceof Error ? error.message : String(error))
        }
      }
      default:
        return fail(`unknown endpoint: ${endpoint}`)
    }
  }, { authority: 'trusted-host' })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDockSetCollapsedPayload(value: unknown): value is DockSetCollapsedPayload {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    && typeof value.collapsed === 'boolean'
}

function isStateGetPayload(value: unknown): value is StateGetPayload {
  return isRecord(value) && typeof value.sessionId === 'string' && value.sessionId.length > 0
}

function isStateWatchPayload(value: unknown): value is StateWatchPayload {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    && isSessionIdentity(value.lifecycle)
    && typeof value.revision === 'number'
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0
}

function isSessionIdentity(value: unknown): value is SuggestedRepliesSessionIdentity {
  if (!isRecord(value)
    || typeof value.createdAt !== 'number'
    || !Number.isSafeInteger(value.createdAt)
    || value.createdAt < 0) return false
  return value.cwd === undefined || typeof value.cwd === 'string'
}

function isGeneratePayload(value: unknown): value is GeneratePayload {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || value.sessionId.length === 0) return false
  return value.turn === undefined || (typeof value.turn === 'number' && Number.isSafeInteger(value.turn) && value.turn >= 0)
}

function isDismissPayload(value: unknown): value is DismissPayload {
  return isRecord(value) && typeof value.sessionId === 'string' && value.sessionId.length > 0
}
