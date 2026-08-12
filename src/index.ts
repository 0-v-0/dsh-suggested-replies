/**
 * Suggested replies host plugin.
 *
 * Completed assistant turns create a short-lived auxiliary LLM request. Its
 * result is projected to the Web client as candidate next user messages. New
 * user input cancels the request and clears the row, so an old completion can
 * never reappear after the conversation has moved on.
 *
 * @module @dsh-external/dsh-suggested-replies
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { GenerationGate, type GenerationLease } from './generation-gate.ts'
import {
  generateSuggestedReplies,
  prepareSuggestionRequest,
  resolveConfiguredSuggestionRoute,
  type PreparedSuggestionRequest,
  type SuggestionGenerationConfig,
} from './suggestion-llm.ts'
import { registerSuggestedRepliesProjection } from './projection.ts'
import { registerSuggestedRepliesRpc } from './rpc.ts'
import type { SuggestedRepliesSettings } from './types.ts'

export type * from './types.ts'

/** Cordis plugin identity. */
export const name = 'dsh-suggested-replies'
/** Host services required before turn-end observation can start. */
export const inject = ['agents', 'connection']

/** User-settings namespace used by the master enable switch. */
export const SETTINGS_NAMESPACE = settingsNamespace('suggested-replies')

/** Configurable runtime parameters for candidate generation. */
export interface Config extends SuggestedRepliesSettings {
  /** Candidate messages requested from the auxiliary model. */
  suggestionCount: number
  /** Trailing visible conversation messages supplied to the auxiliary model. */
  contextMessageCount: number
  /** Maximum retained characters for one candidate message. */
  maxSuggestionChars: number
  /** Maximum response tokens requested from the auxiliary model. */
  maxTokens: number
  /** Maximum lifetime of one auxiliary model call. */
  timeoutMs: number
  /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
  suggestionProvider?: string
  /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
  suggestionModel?: string
}

/** Config schema with deployment-adjustable generation limits. */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Enable next-message suggestions after completed turns.'),
  suggestionCount: z.number().step(1).min(2).max(4).default(3).description('Number of candidate replies requested per completed turn.'),
  contextMessageCount: z.number().step(1).min(2).max(6).default(4).description('Trailing visible conversation messages supplied as context.'),
  maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description('Maximum characters retained for each candidate.'),
  maxTokens: z.number().step(1).min(64).max(1024).default(384).description('Maximum output tokens for the auxiliary model call.'),
  timeoutMs: z.number().step(1).min(1_000).max(30_000).default(15_000).description('Maximum milliseconds an auxiliary model call may run.'),
  suggestionProvider: z.string().required(false).description('Optional explicit provider for auxiliary calls; omitted means inherit the conversation route.'),
  suggestionModel: z.string().required(false).description('Optional explicit model for auxiliary calls; must be paired with suggestionProvider.'),
}) as unknown as z<Config>

/**
 * Install generation, projection, cancellation, and settings wiring.
 * @param ctx - host plugin context.
 * @param config - resolved composition configuration.
 */
export function apply(ctx: Context, config: Config): void {
  registerSuggestedRepliesProjection(ctx)

  const gate = new GenerationGate()
  const agents = new Map<string, Agent>()
  const visibleSessions = new Set<string>()
  let source: () => SuggestedRepliesSettings = () => ({ enabled: config.enabled })
  let enabledBeforeChange = source().enabled

  const clearVisibleSession = (key: string, reason: 'new-input' | 'disabled'): void => {
    gate.cancel(key)
    if (!visibleSessions.delete(key)) return
    agents.get(key)?.session.append('suggested-replies/cleared', { reason })
  }

  const clearVisibleSessions = (reason: 'disabled'): void => {
    for (const key of [...visibleSessions]) clearVisibleSession(key, reason)
  }

  installSettingsSection(ctx, SETTINGS_NAMESPACE, SettingsSchema, { enabled: config.enabled }, {
    setSource: next => { source = next },
    onChange: () => {
      const enabled = source().enabled
      if (!enabled && enabledBeforeChange) {
        clearVisibleSessions('disabled')
      }
      enabledBeforeChange = enabled
    },
  })

  const suggestionRoute = resolveConfiguredSuggestionRoute(config.suggestionProvider, config.suggestionModel)
  const generationConfig: SuggestionGenerationConfig = {
    suggestionCount: config.suggestionCount,
    contextMessageCount: config.contextMessageCount,
    maxSuggestionChars: config.maxSuggestionChars,
    maxTokens: config.maxTokens,
    ...suggestionRoute === undefined ? {} : { suggestionRoute },
  }

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      const key = String(session.id)
      gate.cancel(key)
      visibleSessions.delete(key)
      return
    }
    if (event.type !== 'turn/end') return
    if (event.data.reason.kind !== 'completed' && event.data.reason.kind !== 'max-tokens') return
    if (!source().enabled) return
    const agent = ctx.agents.get(session.id)
    if (agent?.session !== session) return
    if (agent.inbox.hasPending) return
    const key = String(agent.id)
    agents.set(key, agent)
    const lease = gate.start(key, config.timeoutMs)
    const request = prepareSuggestionRequest(ctx, agent, generationConfig, event.data.turn, lease.signal)
    if (request === null) {
      gate.release(lease)
      return
    }
    visibleSessions.add(key)
    queueMicrotask(() => {
      if (!gate.isCurrent(lease)) return
      agent.session.append('suggested-replies/generating', { turn: event.data.turn, ...request.log })
      void runGeneration(ctx, agent, event.data.turn, request, generationConfig, gate, lease).catch((error: unknown) => {
        ctx.logger.warn(`dsh-suggested-replies: generation for session ${String(agent.id)} failed: ${String(error)}`)
      })
    })
  })

  ctx.on('agent/inbox/inserted', ({ agent }) => {
    const key = String(agent.id)
    agents.set(key, agent)
    clearVisibleSession(key, 'new-input')
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const key = String(agent.id)
    gate.cancel(key)
    agents.delete(key)
    visibleSessions.delete(key)
  })

  ctx.effect(() => () => {
    gate.dispose()
    agents.clear()
    visibleSessions.clear()
  }, 'dsh-suggested-replies: abort active generations')

  registerSuggestedRepliesRpc(
    ctx,
    () => source().enabled,
    async enabled => {
      const settings = ctx.get('settings')
      if (settings !== undefined) {
        await settings.update(SETTINGS_NAMESPACE, { enabled })
      } else {
        source = () => ({ enabled })
        enabledBeforeChange = enabled
        if (!enabled) clearVisibleSessions('disabled')
      }
    },
  )
}

/** Settings schema intentionally exposes only the user-facing master switch. */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true).description('Enable suggested replies after completed turns.'),
}) as unknown as z<SuggestedRepliesSettings>

/**
 * Resolve one detached generation and append only if its lease is current.
 * @param ctx - plugin host context.
 * @param agent - agent whose session receives the result.
 * @param turn - completed turn associated with the candidates.
 * @param request - fully logged auxiliary request.
 * @param config - resolved generation configuration.
 * @param gate - session freshness and cancellation gate.
 * @param lease - current generation capability.
 */
async function runGeneration(
  ctx: Context,
  agent: Agent,
  turn: number,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
  gate: GenerationGate,
  lease: GenerationLease,
): Promise<void> {
  try {
    const suggestions = await settleGeneration(ctx, request, config, lease.signal)
    if (!gate.owns(lease)) return
    agent.session.append('suggested-replies/suggestions', { turn, suggestions: suggestions ?? [] })
  } finally {
    gate.release(lease)
  }
}

/**
 * Resolve promptly when cancellation or the gate timeout fires, even if an
 * adapter fails to settle its iterator after aborting.
 * @param ctx - plugin host context.
 * @param request - fully logged auxiliary request.
 * @param config - resolved output limits.
 * @param signal - gate-owned cancellation signal.
 * @returns ready candidates, or `null` after invalidation or generation failure.
 */
function settleGeneration(
  ctx: Context,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
  signal: AbortSignal,
): Promise<Awaited<ReturnType<typeof generateSuggestedReplies>>> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: Awaited<ReturnType<typeof generateSuggestedReplies>>): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = (): void => { finish(null) }
    if (signal.aborted) {
      finish(null)
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void generateSuggestedReplies(ctx, request, config, signal).then(finish, () => { finish(null) })
  })
}
