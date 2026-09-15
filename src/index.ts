/** Suggested replies host plugin with plugin-owned sidecar state. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { GenerationGate, type GenerationLease } from './generation-gate.ts'
import { registerSuggestedRepliesRpc } from './rpc.ts'
import { SuggestedRepliesStateStore } from './state.ts'
import {
  generateSuggestedReplies,
  getSessionEvents,
  prepareSuggestionRequest,
  resolveConfiguredSuggestionRoute,
  type PreparedSuggestionRequest,
  type SuggestionGenerationConfig,
} from './suggestion-llm.ts'
import type { ReasoningEffort, SuggestedRepliesSettings, SuggestionOrigin } from './types.ts'

export type * from './types.ts'
export type { SuggestedRepliesStateSnapshot } from './state.ts'

/** Cordis plugin identity. */
export const name = 'dsh-suggested-replies'
/** Required official extension points. */
export const inject = [
  'agents',
  'connection',
  'sessionPersistence',
  'sessions',
  'systemPrompt',
  'tools',
  'workspaceRegistry',
]

/** User-settings namespace used by the master enable switch. */
export const SETTINGS_NAMESPACE = 'suggested-replies'

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
  /** Maximum lifetime of one auxiliary Agent run. */
  timeoutMs: number
  /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
  suggestionProvider?: string
  /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
  suggestionModel?: string
  /** Whether to follow the current Session route instead of an explicit provider/model. */
  followSessionRoute: boolean
  /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
  reasoningEffort: ReasoningEffort
  /** Maximum UTF-8 bytes of the final framed user prompt sent to the auxiliary model. */
  maxInputBytes: number
  /** Number of recent completed turns to retain in the transcript for generation. */
  maxRecentTurns: number
  /** Character budget for the transcript sent to the auxiliary model. */
  maxTranscriptChars: number
  /** Number of conversation turns retained as context (aligns with maxRecentTurns). */
  maxContextTurns: number
  /** Byte budget for the retained context turns JSON. */
  maxContextContextBytes: number
  /** Mask secrets (API keys, bearer tokens) in the transcript before sending to the model. */
  redactSecrets: boolean
  /** Strip ANSI/OSC/CSI escape sequences from the transcript. */
  stripEscapes: boolean
  /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
  stripControls: boolean
  /** Strip code fences and surrounding paired quotes from model output. */
  stripFencesAndQuotes: boolean
  /** Collapse whitespace and force single-line output. */
  collapseWhitespace: boolean
  /** Force candidates to a single line with no embedded newlines. */
  singleLine: boolean
  /** Filter meta-text like “no suggestion” or “stay silent”. */
  filterMetaText: boolean
  /** Filter error echoes like “api error:” or “error:”. */
  filterErrorEcho: boolean
  /** Filter evaluative phrases like “thanks”, “looks good”, “不错”. */
  filterEvaluative: boolean
  /** Filter assistant-voice phrases like “Let me…”, “我来…”. */
  filterAssistantVoice: boolean
  /** Filter multi-sentence candidates. */
  filterMultiSentence: boolean
  /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
  filterTooLong: boolean
  /** Allow single-word whitelist entries (yes/ok/继续) and slash commands. */
  allowSingleCommands: boolean
  /** Filter residual formatting (newlines, asterisks). */
  filterFormatting: boolean
  /** Keyboard shortcut for manual trigger; `disabled` turns it off. */
  manualShortcut: string
  /** Whether manual trigger writes directly to the draft. */
  manualReplacesDraft: boolean
  /** Pass current candidates as negative examples when regenerating manually. */
  manualDedupe: boolean
  /** Maximum retained skipped candidates per cycle for dedup. */
  maxCycleSkipped: number
  /** Maximum interaction outcome records stored in browser localStorage. */
  maxLocalOutcomes: number
  /** Whether to retain recent performance/cost metrics in host memory. */
  recordMetrics: boolean
  /** Exclude non-human events (injected instructions, runtime context) from transcripts. */
  excludeNonHumanEvents: boolean
}

/** Config schema with deployment-adjustable generation limits. */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Enable next-message suggestions after completed turns.'),
  suggestionCount: z.number().step(1).min(2).max(4).default(3).description('Number of candidate replies requested per completed turn.'),
  contextMessageCount: z.number().step(1).min(2).max(6).default(4).description('Trailing visible conversation messages supplied as context.'),
  maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description('Maximum characters retained for each candidate.'),
  maxTokens: z.number().step(1).min(64).max(1024).default(384).description('Maximum output tokens for the auxiliary model call.'),
  timeoutMs: z.number().step(1).min(1_000).max(30_000).default(15_000).description('Maximum milliseconds an auxiliary model call may run.'),
  suggestionProvider: z.string().required(false).description('Optional explicit provider for auxiliary calls; omitted means inherit the current Session route.'),
  suggestionModel: z.string().required(false).description('Optional explicit model for auxiliary calls; must be paired with suggestionProvider.'),
  followSessionRoute: z.boolean().default(true).description('Follow the current Session route instead of an explicit provider/model.'),
  reasoningEffort: z.union([z.const('off'), z.const('auto')]).default('off').description('Reasoning effort override: off disables thinking, auto follows model default.'),
  maxInputBytes: z.number().step(1).min(256).max(32_768).default(4096).description('Maximum UTF-8 bytes of the final framed user prompt.'),
  maxRecentTurns: z.number().step(1).min(1).max(4).default(1).description('Number of recent completed turns retained in the transcript.'),
  maxTranscriptChars: z.number().step(1).min(1_000).max(60_000).default(12_000).description('Character budget for the transcript sent to the auxiliary model.'),
  maxContextTurns: z.number().step(1).min(1).max(10).default(3).description('Number of conversation turns retained as context.'),
  maxContextContextBytes: z.number().step(1).min(1_024).max(65_536).default(16_384).description('Byte budget for retained context turns JSON.'),
  redactSecrets: z.boolean().default(true).description('Mask API keys and bearer tokens in transcripts before sending to the model.'),
  stripEscapes: z.boolean().default(true).description('Strip ANSI/OSC/CSI escape sequences from transcripts.'),
  stripControls: z.boolean().default(true).description('Strip C0/C1 control chars, bidi override marks, and lone surrogates.'),
  stripFencesAndQuotes: z.boolean().default(true).description('Strip code fences and surrounding paired quotes from model output.'),
  collapseWhitespace: z.boolean().default(true).description('Collapse whitespace and force single-line output.'),
  singleLine: z.boolean().default(true).description('Force candidates to a single line with no embedded newlines.'),
  filterMetaText: z.boolean().default(true).description('Filter meta-text like “no suggestion” or “stay silent”.'),
  filterErrorEcho: z.boolean().default(true).description('Filter error echoes like “api error:” or “error:”.'),
  filterEvaluative: z.boolean().default(true).description('Filter evaluative phrases like “thanks”, “looks good”.'),
  filterAssistantVoice: z.boolean().default(true).description('Filter assistant-voice phrases like “Let me…”.'),
  filterMultiSentence: z.boolean().default(true).description('Filter multi-sentence candidates.'),
  filterTooLong: z.boolean().default(true).description('Filter candidates that are too long (>12 English words or ≥100 bytes).'),
  allowSingleCommands: z.boolean().default(true).description('Allow single-word whitelist entries and slash commands.'),
  filterFormatting: z.boolean().default(true).description('Filter residual formatting (newlines, asterisks).'),
  manualShortcut: z.string().default('Mod+Shift+Space').description('Keyboard shortcut for manual trigger; disabled turns it off.'),
  manualReplacesDraft: z.boolean().default(true).description('Whether manual trigger writes directly to the draft.'),
  manualDedupe: z.boolean().default(true).description('Pass current candidates as negative examples when regenerating manually.'),
  maxCycleSkipped: z.number().step(1).min(0).max(50).default(10).description('Maximum retained skipped candidates per cycle for dedup.'),
  maxLocalOutcomes: z.number().step(1).min(0).max(200).default(50).description('Maximum interaction outcome records stored in browser localStorage.'),
  recordMetrics: z.boolean().default(true).description('Retain recent performance/cost metrics in host memory.'),
  excludeNonHumanEvents: z.boolean().default(true).description('Exclude non-human events from transcripts.'),
}) as unknown as z<Config>

/** Settings schema intentionally exposes only the user-facing master switch. */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true).description('Enable suggested replies after completed turns.'),
  reasoningEffort: z.union([z.const('off'), z.const('auto')]).default('off').description('Reasoning effort override.'),
  suggestionCount: z.number().step(1).min(2).max(4).default(3).description('Number of candidate replies per turn.'),
  redactSecrets: z.boolean().default(true).description('Mask API keys and tokens in transcripts.'),
  stripControls: z.boolean().default(true).description('Strip control characters from output.'),
  singleLine: z.boolean().default(true).description('Force single-line output.'),
  filterMetaText: z.boolean().default(true).description('Filter meta-text.'),
  filterEvaluative: z.boolean().default(true).description('Filter evaluative phrases.'),
  filterAssistantVoice: z.boolean().default(true).description('Filter assistant-voice phrases.'),
  filterTooLong: z.boolean().default(true).description('Filter overly long suggestions.'),
  manualShortcut: z.string().default('Mod+Shift+Space').description('Keyboard shortcut for manual trigger.'),
  manualReplacesDraft: z.boolean().default(true).description('Manual trigger writes directly to draft.'),
}) as unknown as z<SuggestedRepliesSettings>

/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
export async function apply(ctx: Context, config: Config): Promise<() => Promise<void>> {
  const store = await SuggestedRepliesStateStore.open(ctx)
  const gate = new GenerationGate()
  const internalSessions = new Set<string>()
  const generationTasks = new Set<Promise<void>>()
  let source: () => SuggestedRepliesSettings = () => ({
    enabled: config.enabled,
    reasoningEffort: config.reasoningEffort,
    suggestionCount: config.suggestionCount,
    redactSecrets: config.redactSecrets,
    stripControls: config.stripControls,
    singleLine: config.singleLine,
    filterMetaText: config.filterMetaText,
    filterEvaluative: config.filterEvaluative,
    filterAssistantVoice: config.filterAssistantVoice,
    filterTooLong: config.filterTooLong,
    manualShortcut: config.manualShortcut,
    manualReplacesDraft: config.manualReplacesDraft,
  })
  let enabledBeforeChange = source().enabled
  let disposing = false

  const cancelSession = (agent: Agent, flushSession: boolean): void => {
    const key = String(agent.id)
    gate.cancel(key)
    void store.clear(agent.session, flushSession).catch((error: unknown) => {
      if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear Session ${key}: ${String(error)}`)
    })
  }

  const clearAll = async (): Promise<void> => {
    gate.cancelAll()
    await store.clearAll()
  }

  const settingsService = ctx.get('settings')
  if (settingsService !== undefined) {
    settingsService.installSection(ctx, SETTINGS_NAMESPACE, SettingsSchema, source(), {
      setSource: next => { source = next },
      onChange: () => {
        const enabled = source().enabled
        if (!enabled && enabledBeforeChange) {
          void clearAll().catch((error: unknown) => {
            if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear sidecar state: ${String(error)}`)
          })
        }
        enabledBeforeChange = enabled
      },
    })
  }

  const suggestionRoute = resolveConfiguredSuggestionRoute(config.suggestionProvider, config.suggestionModel)
  const getGenerationConfig = (): SuggestionGenerationConfig => {
    const s = source()
    return {
      suggestionCount: s.suggestionCount,
      contextMessageCount: config.contextMessageCount,
      maxSuggestionChars: config.maxSuggestionChars,
      maxTokens: config.maxTokens,
      maxInputBytes: config.maxInputBytes,
      maxRecentTurns: config.maxRecentTurns,
      maxTranscriptChars: config.maxTranscriptChars,
      maxContextTurns: config.maxContextTurns,
      maxContextContextBytes: config.maxContextContextBytes,
      reasoningEffort: s.reasoningEffort,
      redactSecrets: s.redactSecrets,
      stripEscapes: config.stripEscapes,
      stripControls: s.stripControls,
      stripFencesAndQuotes: config.stripFencesAndQuotes,
      collapseWhitespace: config.collapseWhitespace,
      singleLine: s.singleLine,
      filterMetaText: s.filterMetaText,
      filterErrorEcho: config.filterErrorEcho,
      filterEvaluative: s.filterEvaluative,
      filterAssistantVoice: s.filterAssistantVoice,
      filterMultiSentence: config.filterMultiSentence,
      filterTooLong: s.filterTooLong,
      allowSingleCommands: config.allowSingleCommands,
      filterFormatting: config.filterFormatting,
      manualReplacesDraft: s.manualReplacesDraft,
      manualDedupe: config.manualDedupe,
      maxCycleSkipped: config.maxCycleSkipped,
      excludeNonHumanEvents: config.excludeNonHumanEvents,
      ...suggestionRoute === undefined ? {} : { suggestionRoute },
    }
  }

  const startGenerationForSession = (agent: Agent, turn: number, _origin: SuggestionOrigin): void => {
    if (!source().enabled) return
    if (agent.inbox.hasPending) return

    const lease = gate.start(String(agent.id), config.timeoutMs)
    const request = prepareSuggestionRequest(agent, getGenerationConfig(), turn, lease.signal)
    if (request === null) {
      gate.release(lease)
      return
    }
    const task = runGeneration(
      ctx,
      store,
      internalSessions,
      gate,
      lease,
      agent,
      turn,
      request,
      getGenerationConfig(),
    ).catch((error: unknown) => {
      if (!disposing) {
        ctx.logger.warn(`dsh-suggested-replies: generation for Session ${String(agent.id)} failed: ${String(error)}`)
      }
    })
    generationTasks.add(task)
    void task.finally(() => { generationTasks.delete(task) })
  }

  ctx.on('session/event', (session, event) => {
    if (internalSessions.has(String(session.id))) return
    if (event.type === 'turn/start') {
      const agent = ctx.agents.get(session.id)
      if (agent?.session === session) cancelSession(agent, true)
      return
    }
    if (event.type !== 'turn/end') return
    if (event.data.reason.kind !== 'completed' && event.data.reason.kind !== 'max-tokens') return
    const agent = ctx.agents.get(session.id)
    if (agent?.session !== session) return
    startGenerationForSession(agent, event.data.turn, 'auto')
  })

  ctx.on('agent/inbox/inserted', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    cancelSession(agent, true)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    gate.cancel(String(agent.id))
  })

  const generateFn = async (sessionId: string, turn?: number): Promise<void> => {
    const agent = ctx.agents.get(SessionId(sessionId))
    if (agent === undefined) return
    const resolvedTurn = turn ?? lastCompletedTurn(agent)
    if (resolvedTurn === null) return
    startGenerationForSession(agent, resolvedTurn, 'manual')
  }

  const dismissFn = async (sessionId: string): Promise<void> => {
    const agent = ctx.agents.get(SessionId(sessionId))
    if (agent === undefined) return
    cancelSession(agent, true)
  }

  registerSuggestedRepliesRpc(
    ctx,
    store,
    () => source().enabled,
    async enabled => {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        source = () => ({ enabled })
        if (!enabled) await clearAll()
        enabledBeforeChange = enabled
        return
      }
      await settings.update(SETTINGS_NAMESPACE, { enabled })
      if (!enabled) await clearAll()
      enabledBeforeChange = source().enabled
    },
    () => {
      const s = source()
      return {
        enabled: s.enabled,
        reasoningEffort: s.reasoningEffort,
        suggestionCount: s.suggestionCount,
        redactSecrets: s.redactSecrets,
        stripControls: s.stripControls,
        singleLine: s.singleLine,
        filterMetaText: s.filterMetaText,
        filterEvaluative: s.filterEvaluative,
        filterAssistantVoice: s.filterAssistantVoice,
        filterTooLong: s.filterTooLong,
        manualShortcut: s.manualShortcut,
        manualReplacesDraft: s.manualReplacesDraft,
      }
    },
    async patch => {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        const prev = source()
        source = () => ({ ...prev, ...patch })
        return source()
      }
      const prev = source()
      const next = { ...prev, ...patch }
      await settings.update(SETTINGS_NAMESPACE, next)
      return source()
    },
    generateFn,
    dismissFn,
  )

  return async () => {
    disposing = true
    gate.cancelAll()
    await Promise.all(generationTasks)
    await store.clearAll()
    internalSessions.clear()
    gate.dispose()
    await store.close()
  }
}

/** Run one freshness-owned internal Agent and commit only its current result. */
async function runGeneration(
  ctx: Context,
  store: SuggestedRepliesStateStore,
  internalSessions: Set<string>,
  gate: GenerationGate,
  lease: GenerationLease,
  parent: Agent,
  turn: number,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
): Promise<void> {
  const internalSessionId = SessionId(`session-${randomUUID()}`)
  internalSessions.add(String(internalSessionId))
  try {
    if (!await store.setGenerating(parent.session, turn, internalSessionId, () => gate.isCurrent(lease))) return
    const suggestions = await generateSuggestedReplies(ctx, parent, internalSessionId, request, config, lease.signal)
    if (suggestions === null) {
      await store.clearGeneration(parent.session, internalSessionId)
      return
    }
    await store.setReady(
      parent.session,
      turn,
      internalSessionId,
      suggestions,
      () => gate.isCurrent(lease),
    )
  } catch (error) {
    await store.clearGeneration(parent.session, internalSessionId).catch(() => undefined)
    if (!lease.signal.aborted) throw error
  } finally {
    internalSessions.delete(String(internalSessionId))
    gate.release(lease)
  }
}

/** Find the last turn that completed normally or hit the max-tokens limit. */
function lastCompletedTurn(agent: Agent): number | null {
  const events = getSessionEvents(agent.session)
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined) continue
    if (event.type === 'turn/end'
      && (event.data.reason.kind === 'completed' || event.data.reason.kind === 'max-tokens')) {
      return event.data.turn
    }
  }
  return null
}
