/** Logged auxiliary Agent run that predicts concise next user messages. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import type { ReasoningEffort, SuggestionOrigin, SuggestedRepliesRoute, SuggestedReply } from './types.ts'
import {
  buildSuggestedRepliesUserPrompt,
  buildSuggestionSystemPrompt,
  fallbackSuggestedReplies,
  parseSuggestedReplies,
  type SuggestionOutputLimits,
} from './suggestion-prompt.ts'
import {
  processSuggestions,
  sanitizeTranscript,
  type GeneratePipelineConfig,
} from './generate.ts'

/** Resolved runtime choices for one suggested-replies model request. */
export interface SuggestionGenerationConfig extends SuggestionOutputLimits {
  /** Number of recent model-visible messages retained as context. */
  readonly contextMessageCount: number
  /** Maximum output tokens requested from the model. */
  readonly maxTokens: number
  /** Optional explicit auxiliary route that overrides the conversation route. */
  readonly suggestionRoute?: SuggestedRepliesRoute
  /** Maximum UTF-8 bytes of the final framed user prompt sent to the auxiliary model. */
  readonly maxInputBytes: number
  /** Number of recent completed turns to retain in the transcript for generation. */
  readonly maxRecentTurns: number
  /** Character budget for the transcript sent to the auxiliary model. */
  readonly maxTranscriptChars: number
  /** Number of conversation turns retained as context (aligns with maxRecentTurns). */
  readonly maxContextTurns: number
  /** Byte budget for the retained context turns JSON. */
  readonly maxContextContextBytes: number
  /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
  readonly reasoningEffort: ReasoningEffort
  /** Mask secrets (API keys, bearer tokens) in the transcript before sending to the model. */
  readonly redactSecrets: boolean
  /** Strip ANSI/OSC/CSI escape sequences from the transcript. */
  readonly stripEscapes: boolean
  /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
  readonly stripControls: boolean
  /** Strip code fences and surrounding paired quotes from model output. */
  readonly stripFencesAndQuotes: boolean
  /** Collapse whitespace and force single-line output. */
  readonly collapseWhitespace: boolean
  /** Force candidates to a single line with no embedded newlines. */
  readonly singleLine: boolean
  /** Filter meta-text like “no suggestion” or “stay silent”. */
  readonly filterMetaText: boolean
  /** Filter error echoes like “api error:” or “error:”. */
  readonly filterErrorEcho: boolean
  /** Filter evaluative phrases like “thanks”, “looks good”, “不错”. */
  readonly filterEvaluative: boolean
  /** Filter assistant-voice phrases like “Let me…”, “我来…”. */
  readonly filterAssistantVoice: boolean
  /** Filter multi-sentence candidates. */
  readonly filterMultiSentence: boolean
  /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
  readonly filterTooLong: boolean
  /** Allow single-word whitelist entries (yes/ok/继续) and slash commands. */
  readonly allowSingleCommands: boolean
  /** Filter residual formatting (newlines, asterisks). */
  readonly filterFormatting: boolean
  /** Whether manual trigger writes directly to the draft. */
  readonly manualReplacesDraft: boolean
  /** Pass current candidates as negative examples when regenerating manually. */
  readonly manualDedupe: boolean
  /** Maximum retained skipped candidates per cycle for dedup. */
  readonly maxCycleSkipped: number
  /** Exclude non-human events (injected instructions, runtime context) from transcripts. */
  readonly excludeNonHumanEvents: boolean
}

/** Complete auxiliary request that the internal Agent logs through official events. */
export interface PreparedSuggestionRequest {
  /** Provider/model route for the internal Agent. */
  readonly route: SuggestedRepliesRoute
  /** Complete system instruction installed as the Agent's only prompt section. */
  readonly system: string
  /** Complete user-role prompt sent through the Agent inbox. */
  readonly prompt: string
  /** Maximum output tokens for the Agent request. */
  readonly maxTokens: number
  /** Whether this request was triggered automatically or by user action. */
  readonly origin: SuggestionOrigin
  /** Previously skipped candidates to avoid when regenerating manually. */
  readonly skippedCycle?: readonly string[]
}

/** Select the trailing model-visible conversation messages from a Session. */
export function deriveRecentMessages(agent: Agent, contextMessageCount: number) {
  return agent.session.deriveMessages()
    .filter(message => message.role === 'assistant' || message.source.kind === 'user')
    .slice(-contextMessageCount)
}

/** Resolve the latest logged route, falling back to the Agent creation route. */
export function resolveSuggestionRoute(agent: Agent): SuggestedRepliesRoute | null {
  const logged = agent.session.requestHeader()?.config
  if (logged !== undefined && logged.provider.length > 0 && logged.model.length > 0) {
    return { provider: logged.provider, model: logged.model }
  }
  const { provider, model } = agent.options
  return provider !== undefined && provider.length > 0 && model !== undefined && model.length > 0
    ? { provider, model }
    : null
}

/** Validate and normalize an optional explicit auxiliary route. */
export function resolveConfiguredSuggestionRoute(
  provider: string | undefined,
  model: string | undefined,
): SuggestedRepliesRoute | undefined {
  if (provider === undefined && model === undefined) return undefined
  if (provider === undefined || model === undefined || provider.trim().length === 0 || model.trim().length === 0) {
    throw new Error(
      'dsh-suggested-replies: suggestionProvider and suggestionModel must be set together as a non-empty pair',
    )
  }
  return { provider, model }
}

/** Prepare one internal Agent request when the completed turn has usable text and routing. */
export function prepareSuggestionRequest(
  agent: Agent,
  config: SuggestionGenerationConfig,
  turn: number,
  signal: AbortSignal,
): PreparedSuggestionRequest | null {
  if (signal.aborted || !turnHasAssistantText(agent, turn)) return null
  const route = config.suggestionRoute ?? resolveSuggestionRoute(agent)
  if (route === null) return null
  const rawPrompt = buildSuggestedRepliesUserPrompt(deriveRecentMessages(agent, config.contextMessageCount))
  if (rawPrompt === null) return null
  const prompt = sanitizeTranscript(rawPrompt, config as GeneratePipelineConfig)
  return {
    route,
    system: buildSuggestionSystemPrompt(config),
    prompt,
    maxTokens: config.maxTokens,
    origin: 'auto',
  }
}

export function getSessionEvents(session: Session): readonly SessionEvent[] {
  if (typeof (session as any).snapshotEvents === 'function') {
    return (session as any).snapshotEvents()
  }
  return session.events ?? []
}

function turnHasAssistantText(agent: Agent, turn: number): boolean {
  return getSessionEvents(agent.session).some(event => event.type === 'assistant/message'
    && event.data.turn === turn
    && event.data.message.content.some(block => block.type === 'text' && block.text.trim() !== ''))
}

/** Extract the last non-empty assistant text produced inside one owned run interval. */
export function extractSuggestionText(events: readonly SessionEvent[], firstSeq: number): string | null {
  let started = false
  let text = ''
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') {
      started = true
      continue
    }
    if (!started || event.type !== 'assistant/message') continue
    const joined = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (joined !== '') text = joined
  }
  return text === '' ? null : text
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('suggested replies generation aborted')
}

/**
 * Run the auxiliary request through an official Agent Session, archive it
 * before model work starts, flush its log, then dispose the live handle.
 */
export async function generateSuggestedReplies(
  ctx: Context,
  parent: Agent,
  internalSessionId: SessionId,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
  signal: AbortSignal,
): Promise<SuggestedReply[] | null> {
  signal.throwIfAborted()
  let handle: Awaited<ReturnType<typeof ctx.agents.create>> | undefined
  let output: string | null = null
  let failure: unknown
  let onAbort: (() => void) | undefined

  try {
    handle = await ctx.agents.withoutInitiator(() => ctx.agents.create({
      sessionId: internalSessionId,
      ...(parent.session.header.cwd === undefined ? {} : { meta: { cwd: parent.session.header.cwd } }),
      agentOptions: {
        provider: request.route.provider,
        model: request.route.model,
        maxTokens: request.maxTokens,
        ...(config.reasoningEffort === 'off' ? { reasoningEffort: 'off' } : {}),
      },
      signal,
      setup: (agentCtx) => {
        agentCtx.tools.presentAs('native')
        agentCtx.tools.restrict({ allow: [] })
        agentCtx.systemPrompt.section({
          name: PERSONA_SECTION,
          order: 0,
          text: request.system,
          complete: true,
        })
      },
    }))

    const agent = handle.agent
    try {
      await ctx.workspaceRegistry.archiveSession(internalSessionId)
    } catch (error) {
      throw new Error(
        `dsh-suggested-replies: could not archive internal Session '${internalSessionId}' before generation`,
        { cause: error },
      )
    }
    onAbort = () => { agent.cancel({ kind: 'parent' }) }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()

    await agent.whenIdle()
    signal.throwIfAborted()
    const firstSeq = agent.session.seq
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: request.prompt }],
      source: { kind: 'plugin', plugin: 'dsh-suggested-replies' },
    }))
    await agent.whenIdle()
    if (signal.aborted) throw abortError(signal)
    output = extractSuggestionText(getSessionEvents(agent.session), firstSeq)
  } catch (error) {
    failure = error
  }

  if (handle !== undefined) {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
    try {
      await handle.agent.whenIdle()
      if (!(await ctx.sessions.flush(handle.agent.session))) {
        throw new Error(`dsh-suggested-replies: no durability listener flushed internal Session '${internalSessionId}'`)
      }
    } catch (error) {
      failure ??= error
    } finally {
      await handle.dispose()
    }
  }

  if (failure !== undefined) {
    if (signal.aborted) return null
    throw failure
  }
  if (output === null) return null
  const parsed = parseSuggestedReplies(output, config) ?? fallbackSuggestedReplies(request.prompt, config)
  const processed = processSuggestions(parsed, config as GeneratePipelineConfig)
  return processed.length > 0 ? processed : null
}
