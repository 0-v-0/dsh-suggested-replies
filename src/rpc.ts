/** Settings and sidecar-state RPC for the suggested-replies Web surface. */

import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MAX_SUGGESTION_COUNT, type SuggestedRepliesSettings } from './types.ts'
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

/**
 * Client-facing config snapshot returned by `config.get` and `config.set`.
 * Derived from the settings contract so the two cannot drift; `reasoningEffort`
 * is widened to `string` because the RPC boundary serializes the union.
 */
export type ConfigResponse =
  & Omit<SuggestedRepliesSettings, 'reasoningEffort'>
  & { readonly reasoningEffort: string }

/** Payload accepted by `config.set`: a partial patch of the settings contract. */
export type ConfigSetPayload = Partial<SuggestedRepliesSettings>

/** Payload accepted by `draft.get`. */
export interface DraftGetPayload {
  readonly sessionId: string
}

/** Result returned by `draft.get`. */
export interface DraftGetResult {
  readonly draft: string | null
}

/** Payload accepted by `suggestions.fork`. */
export interface ForkPayload {
  /** Parent Session to fork from. */
  readonly sessionId: string
  /** MessageId of the assistant message to fork at. */
  readonly messageId: string
  /** Draft text to set in the forked session. */
  readonly draft: string
}

/** Result returned by `suggestions.fork`. */
export interface ForkResult {
  readonly ok: true
  readonly sessionId: string
}

/** Settings keys that always carry a boolean value. */
const CONFIG_BOOLEAN_KEYS = [
  'redactSecrets', 'stripControls', 'singleLine', 'filterMetaText',
  'filterEvaluative', 'filterAssistantVoice', 'filterTooLong', 'manualReplacesDraft',
] as const

/**
 * Validate and bounds-check a settings patch before it reaches host state.
 * Unknown keys are rejected so an arbitrary object cannot be merged into settings.
 * @param value - untrusted RPC payload.
 * @returns whether the payload is a valid settings patch.
 */
export function isConfigSetPayload(value: unknown): value is ConfigSetPayload {
  if (!isRecord(value)) return false
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue
    if (CONFIG_BOOLEAN_KEYS.includes(key as (typeof CONFIG_BOOLEAN_KEYS)[number])) {
      if (typeof field !== 'boolean') return false
      continue
    }
    switch (key) {
      case 'suggestionCount':
        if (typeof field !== 'number' || !Number.isInteger(field) || field < 0 || field > MAX_SUGGESTION_COUNT) return false
        break
      case 'reasoningEffort':
        if (field !== 'off' && field !== 'auto') return false
        break
      case 'displayMode':
        if (field !== 'latest' && field !== 'all') return false
        break
      case 'manualShortcut':
        if (typeof field !== 'string') return false
        break
      default:
        return false
    }
  }
  return true
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
  forkFn: (sessionId: string, messageId: string, draft: string) => Promise<string>,
  setCollapsedFn: (sessionId: string, collapsed: boolean) => void,
  getDraftFn: (sessionId: string) => string | null,
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
      case 'suggestions.fork': {
        if (!isForkPayload(payload)) return fail<ForkResult>('payload must be { sessionId: string, messageId: string, draft: string }')
        try {
          const childId = await forkFn(payload.sessionId, payload.messageId, payload.draft)
          return ok<ForkResult>({ ok: true, sessionId: childId })
        } catch (error) {
          return fail<ForkResult>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'draft.get': {
        if (!isStateGetPayload(payload)) return fail<DraftGetResult>('payload must be { sessionId: string }')
        return ok<DraftGetResult>({ draft: getDraftFn(payload.sessionId) })
      }
      case 'config.get': {
        try {
          return ok<ConfigResponse>(getConfig())
        } catch (error) {
          return fail<ConfigResponse>(error instanceof Error ? error.message : String(error))
        }
      }
      case 'config.set': {
        if (!isConfigSetPayload(payload)) return fail<ConfigResponse>('payload must be a settings patch')
        try {
          return ok<ConfigResponse>(await setConfig(payload))
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

/** Payload guard shared by every endpoint addressed by one non-empty session id. */
function hasSessionId(value: unknown): value is StateGetPayload {
  return isRecord(value) && typeof value.sessionId === 'string' && value.sessionId.length > 0
}

function isDockSetCollapsedPayload(value: unknown): value is DockSetCollapsedPayload {
  if (!hasSessionId(value)) return false
  return typeof (value as DockSetCollapsedPayload).collapsed === 'boolean'
}

function isStateGetPayload(value: unknown): value is StateGetPayload {
  return hasSessionId(value)
}

function isStateWatchPayload(value: unknown): value is StateWatchPayload {
  if (!hasSessionId(value)) return false
  const payload = value as StateWatchPayload
  return isSessionIdentity(payload.lifecycle)
    && typeof payload.revision === 'number'
    && Number.isSafeInteger(payload.revision)
    && payload.revision >= 0
}

function isSessionIdentity(value: unknown): value is SuggestedRepliesSessionIdentity {
  if (!isRecord(value)
    || typeof value.createdAt !== 'number'
    || !Number.isSafeInteger(value.createdAt)
    || value.createdAt < 0) return false
  return value.cwd === undefined || typeof value.cwd === 'string'
}

function isGeneratePayload(value: unknown): value is GeneratePayload {
  if (!hasSessionId(value)) return false
  const payload = value as GeneratePayload
  return payload.turn === undefined
    || (typeof payload.turn === 'number' && Number.isSafeInteger(payload.turn) && payload.turn >= 0)
}

function isDismissPayload(value: unknown): value is DismissPayload {
  return hasSessionId(value)
}

function isForkPayload(value: unknown): value is ForkPayload {
  if (!hasSessionId(value)) return false
  const payload = value as ForkPayload
  return typeof payload.messageId === 'string' && payload.messageId.length > 0 && typeof payload.draft === 'string'
}
