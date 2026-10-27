/** Suggested replies host plugin with plugin-owned sidecar state. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
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
  lastAssistantMessageIdForTurn,
  seqForMessageId,
  prepareSuggestionRequest,
  resolveConfiguredSuggestionRoute,
  type PreparedSuggestionRequest,
  type SuggestionGenerationConfig,
} from './suggestion-llm.ts'
import { MAX_SUGGESTION_COUNT, type ReasoningEffort, type SuggestedRepliesSettings } from './types.ts'

export type * from './types.ts'
export type { SuggestedRepliesStateSnapshot } from './state.ts'

/** Cordis plugin identity. */
export const name = 'dsh-suggested-replies'
/** Required official extension points. */
export const inject = [
  'agents',
  'connection',
  'webServer',
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
  /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
  reasoningEffort: ReasoningEffort
  /** Maximum UTF-8 bytes of the final framed user prompt sent to the auxiliary model. */
  maxInputBytes: number
  /** Character budget for the transcript sent to the auxiliary model. */
  maxTranscriptChars: number
  /** Mask secrets (API keys, bearer tokens) in the transcript before sending to the model. */
  redactSecrets: boolean
  /** Strip ANSI/OSC/CSI escape sequences from model-generated candidate text. */
  stripEscapes: boolean
  /** Strip control chars, invisible format chars, and lone surrogates from candidate text. */
  stripControls: boolean
  /** Strip code fences and surrounding paired quotes from model output. */
  stripFencesAndQuotes: boolean
  /** Collapse every whitespace run to a single space. */
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
}

/** Config schema with deployment-adjustable generation limits. */
export const Config = z.object({
  suggestionCount: z.number().step(1).min(0).max(MAX_SUGGESTION_COUNT).default(3).description('Number of candidate replies requested per completed turn. 0 disables generation.'),
  contextMessageCount: z.number().step(1).min(2).max(6).default(4).description('Trailing visible conversation messages supplied as context.'),
  maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description('Maximum characters retained for each candidate.'),
  maxTokens: z.number().step(1).min(64).max(1024).default(384).description('Maximum output tokens for the auxiliary model call.'),
  timeoutMs: z.number().step(1).min(1_000).max(30_000).default(15_000).description('Maximum milliseconds an auxiliary model call may run.'),
  suggestionProvider: z.string().required(false).description('Optional explicit provider for auxiliary calls; omitted means inherit the current Session route.'),
  suggestionModel: z.string().required(false).description('Optional explicit model for auxiliary calls; must be paired with suggestionProvider.'),
  reasoningEffort: z.union([z.const('off'), z.const('auto')]).default('off').description('Reasoning effort override: off disables thinking, auto follows model default.'),
  maxInputBytes: z.number().step(1).min(256).max(32_768).default(4096).description('Maximum UTF-8 bytes of the final framed user prompt.'),
  maxTranscriptChars: z.number().step(1).min(1_000).max(60_000).default(12_000).description('Character budget for the transcript sent to the auxiliary model.'),
  redactSecrets: z.boolean().default(true).description('Mask API keys and bearer tokens in transcripts before sending to the model.'),
  stripEscapes: z.boolean().default(true).description('Strip ANSI/OSC/CSI escape sequences from model-generated candidate text. Transcripts are always stripped.'),
  stripControls: z.boolean().default(true).description('Strip control chars, invisible format chars, and lone surrogates from candidate text. Transcripts are always stripped.'),
  stripFencesAndQuotes: z.boolean().default(true).description('Strip code fences and surrounding paired quotes from model output.'),
  collapseWhitespace: z.boolean().default(true).description('Collapse every whitespace run to a single space. Single-lining is controlled separately by singleLine.'),
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
  displayMode: z.union([z.const('latest'), z.const('all')]).default('latest').description('Where to show suggestion toggles: latest assistant message only, or all assistant messages.'),
}) as unknown as z<Config>

/** Project the full plugin config onto the user-editable settings surface. */
function pickSettings(value: SuggestedRepliesSettings): SuggestedRepliesSettings {
  return {
    suggestionCount: value.suggestionCount,
    reasoningEffort: value.reasoningEffort,
    redactSecrets: value.redactSecrets,
    stripControls: value.stripControls,
    singleLine: value.singleLine,
    filterMetaText: value.filterMetaText,
    filterEvaluative: value.filterEvaluative,
    filterAssistantVoice: value.filterAssistantVoice,
    filterTooLong: value.filterTooLong,
    manualShortcut: value.manualShortcut,
    manualReplacesDraft: value.manualReplacesDraft,
    displayMode: value.displayMode,
  }
}

/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
export async function apply(ctx: Context, config: Config): Promise<() => Promise<void>> {
  const store = await SuggestedRepliesStateStore.open(ctx)
  const gate = new GenerationGate()
  const internalSessions = new Set<string>()
  const generationTasks = new Set<Promise<void>>()
  const collapsedSessions = new Set<string>()
  /** Pending drafts for forked sessions: child sessionId → draft text. */
  const pendingDrafts = new Map<string, string>()
  let source: () => SuggestedRepliesSettings = () => pickSettings(config)
  let disposing = false

  const cancelSession = (agent: Agent, flushSession: boolean): void => {
    const key = String(agent.id)
    gate.cancel(key)
    void store.clear(agent.session, flushSession).catch((error: unknown) => {
      if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear Session ${key}: ${String(error)}`)
    })
  }

  // A disabled setting must invalidate the active generation, whether the change
  // arrives through the settings service or through the `config.set` RPC, so a
  // run started under the old snapshot cannot commit stale output.
  const applySettingsChange = (): void => {
    // Abort in-flight runs so none commits output built from the settings
    // snapshot captured at its start.
    gate.cancelAll()
    if (source().suggestionCount === 0) {
      void store.clearAll().catch((error: unknown) => {
        if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear sidecar state: ${String(error)}`)
      })
    }
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
      maxTranscriptChars: config.maxTranscriptChars,
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
      ...suggestionRoute === undefined ? {} : { suggestionRoute },
    }
  }

  const startGenerationForSession = (agent: Agent, turn: number): void => {
    if (source().suggestionCount === 0) return
    if (collapsedSessions.has(String(agent.id))) return
    if (agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) return

    const lease = gate.start(String(agent.id), config.timeoutMs)
    const request = prepareSuggestionRequest(agent, getGenerationConfig(), turn, lease.signal)
    if (request === null) {
      gate.release(lease)
      return
    }
    const messageId = lastAssistantMessageIdForTurn(agent, turn)
    const task = runGeneration(
      ctx,
      store,
      internalSessions,
      gate,
      lease,
      agent,
      turn,
      messageId,
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
    startGenerationForSession(agent, event.data.turn)
  })

  ctx.on('agent/inbox/inserted', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    cancelSession(agent, true)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    // Skip the durability flush: the parent Session log may already be gone,
    // and a stuck loading row must not outlive a disposed agent.
    cancelSession(agent, false)
  })

  const generateFn = async (sessionId: string, turn?: number): Promise<void> => {
    const agent = ctx.agents.get(SessionId(sessionId))
    if (agent === undefined) return
    const resolvedTurn = turn ?? lastCompletedTurn(agent)
    if (resolvedTurn === null) return
    startGenerationForSession(agent, resolvedTurn)
  }

  const dismissFn = async (sessionId: string): Promise<void> => {
    const agent = ctx.agents.get(SessionId(sessionId))
    if (agent === undefined) return
    cancelSession(agent, true)
  }

  registerSuggestedRepliesRpc(
    ctx,
    store,
    () => source(),
    async patch => {
      const settings = ctx.get('settings')
      const next = { ...source(), ...patch }
      if (settings === undefined) {
        // No settings service means no onChange will fire, so the invalidation
        // that path normally provides has to be applied here instead. Without
        // it a patch to `suggestionCount: 0` stops new runs but lets an
        // in-flight one commit and republish stale suggestions.
        source = () => next
        applySettingsChange()
      } else {
        await settings.update(SETTINGS_NAMESPACE, next)
      }
      return source()
    },
    generateFn,
    dismissFn,
    async (sessionId: string, messageId: string, draft: string): Promise<string> => {
      const agent = ctx.agents.get(SessionId(sessionId))
      if (agent === undefined) throw new Error(`dsh-suggested-replies: session ${sessionId} not found for fork`)
      const seq = seqForMessageId(agent, messageId)
      if (seq === null) throw new Error(`dsh-suggested-replies: messageId ${messageId} not found in session ${sessionId}`)
      const childSession = await ctx.sessions.fork(agent.session, seq)
      pendingDrafts.set(String(childSession.id), draft)
      return String(childSession.id)
    },
    (sessionId: string, collapsed: boolean): void => {
      if (collapsed) {
        collapsedSessions.add(sessionId)
      } else {
        collapsedSessions.delete(sessionId)
      }
    },
    (sessionId: string): string | null => {
      const draft = pendingDrafts.get(sessionId)
      if (draft !== undefined) pendingDrafts.delete(sessionId)
      return draft ?? null
    },
  )

  return async () => {
    disposing = true
    gate.cancelAll()
    await Promise.all(generationTasks)
    await store.clearAll()
    internalSessions.clear()
    collapsedSessions.clear()
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
  messageId: string | null,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
): Promise<void> {
  const internalSessionId = SessionId(`session-${randomUUID()}`)
  internalSessions.add(String(internalSessionId))
  try {
    if (!await store.setGenerating(parent.session, turn, messageId, internalSessionId, () => gate.isCurrent(lease))) return
    const suggestions = await generateSuggestedReplies(ctx, parent, internalSessionId, request, config, lease.signal)
    if (suggestions === null) {
      await store.clearGeneration(parent.session, internalSessionId)
      return
    }
    await store.setReady(
      parent.session,
      turn,
      messageId,
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
