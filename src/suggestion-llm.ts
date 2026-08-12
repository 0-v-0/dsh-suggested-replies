/**
 * Auxiliary LLM call that predicts concise next user messages.
 *
 * @module @dsh-external/dsh-suggested-replies/suggestion-llm
 */

import type { Context } from 'cordis'
import type {
  GenerateOptions,
  LlmService,
  Message,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SuggestedRepliesGeneratingPayload, SuggestedRepliesRoute, SuggestedReply } from './types.ts'
import {
  buildSuggestedRepliesUserPrompt,
  buildSuggestionSystemPrompt,
  parseSuggestedReplies,
  type SuggestionOutputLimits,
} from './suggestion-prompt.ts'

/** Resolved runtime choices for one suggested-replies model request. */
export interface SuggestionGenerationConfig extends SuggestionOutputLimits {
  /** Number of recent model-visible messages retained as context. */
  readonly contextMessageCount: number
  /** Maximum output tokens requested from the model. */
  readonly maxTokens: number
  /** Optional explicit auxiliary route that overrides the conversation route. */
  readonly suggestionRoute?: SuggestedRepliesRoute
}

/** Complete, loggable auxiliary request prepared before provider dispatch. */
export interface PreparedSuggestionRequest {
  /** Durable event payload that reconstructs every model-visible input. */
  readonly log: Omit<SuggestedRepliesGeneratingPayload, 'turn'>
  /** Provider-neutral streaming options. */
  readonly options: GenerateOptions
}

/**
 * Select the trailing visible conversation messages from a session.
 * @param agent - agent whose session owns the conversation.
 * @param contextMessageCount - maximum retained message count.
 * @returns recent messages in chronological order.
 */
export function deriveRecentMessages(agent: Agent, contextMessageCount: number): Message[] {
  return agent.session.deriveMessages().slice(-contextMessageCount)
}

/**
 * Resolve the latest logged route, falling back to the Agent creation route.
 * @param agent - agent whose conversation route should be reused.
 * @returns provider/model pair, or `null` when neither source has both fields.
 */
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

/**
 * Validate and normalize an optional explicit auxiliary route.
 * @param provider - optional configured provider, or `undefined` to inherit.
 * @param model - optional configured model, or `undefined` to inherit.
 * @returns the explicit route, or `undefined` when both fields are omitted.
 */
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

/**
 * Prepare the detached request when the current route and conversation support it.
 * @param ctx - host context that may own an LLM service.
 * @param agent - agent whose completed turn supplied the context.
 * @param config - resolved model-call options.
 * @param turn - completed turn that must contain visible assistant text.
 * @param signal - cancellation signal held by the session generation gate.
 * @returns loggable and dispatchable request, or `null` for an expected no-op.
 */
export function prepareSuggestionRequest(
  ctx: Context,
  agent: Agent,
  config: SuggestionGenerationConfig,
  turn: number,
  signal: AbortSignal,
): PreparedSuggestionRequest | null {
  if (ctx.get('llm') === undefined || signal.aborted) return null
  if (!turnHasAssistantText(agent, turn)) return null
  const route = config.suggestionRoute ?? resolveSuggestionRoute(agent)
  if (route === null) return null
  const prompt = buildSuggestedRepliesUserPrompt(deriveRecentMessages(agent, config.contextMessageCount))
  if (prompt === null) return null
  const system = buildSuggestionSystemPrompt(config)
  return {
    log: { route, system, prompt, maxTokens: config.maxTokens },
    options: buildSuggestionCallOptions(route, prompt, system, config.maxTokens, signal, agent.id),
  }
}

/** Test whether the completed turn itself contributed visible assistant text. */
function turnHasAssistantText(agent: Agent, turn: number): boolean {
  return agent.session.events.some(event => event.type === 'assistant/message'
    && event.data.turn === turn
    && event.data.message.content.some(block => block.type === 'text' && block.text.trim() !== ''))
}

/**
 * Assemble the standalone LLM request from already resolved inputs.
 * @param route - provider/model route reused from the conversation.
 * @param prompt - recent conversation serialized for the user role.
 * @param system - complete auxiliary model instruction.
 * @param maxTokens - detached-call output token cap.
 * @param signal - cancellation signal held by the session generation gate.
 * @param sessionId - session identity used by global LLM middleware routing.
 * @returns ready provider-neutral LLM options.
 */
export function buildSuggestionCallOptions(
  route: SuggestedRepliesRoute,
  prompt: string,
  system: string,
  maxTokens: number,
  signal: AbortSignal,
  sessionId?: Agent['id'],
): GenerateOptions {
  return {
    provider: route.provider,
    model: route.model,
    system,
    messages: [localMessage(prompt)],
    tools: [],
    maxTokens,
    signal,
    ...sessionId === undefined ? {} : { sessionId },
  }
}

/** Construct the minimum valid provider-neutral message for this auxiliary request. */
function localMessage(text: string): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-suggested-replies' },
  }
}

/**
 * Drain a stream to plain text, accepting only normal `stop` completion.
 * @param stream - LLM chunks returned by the selected provider.
 * @returns complete output text, or `null` after an aborted or failed finish.
 */
export async function drainTextStream(stream: AsyncIterable<StreamChunk>): Promise<string | null> {
  const parts: string[] = []
  let completed = false
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      parts.push(chunk.text)
      continue
    }
    if (chunk.type === 'finish' && chunk.reason.kind === 'stop') completed = true
  }
  if (!completed) return null
  const output = parts.join('')
  return output === '' ? null : output
}

/**
 * Generate ready candidates, returning null for expected provider, parsing, or
 * cancellation failures. The caller's freshness gate decides whether a result
 * may still be appended after this promise settles.
 * @param ctx - host context carrying the optional LLM service.
 * @param request - prepared request whose inputs were logged before dispatch.
 * @param config - resolved output and context limits.
 * @param signal - session-specific cancellation signal.
 * @returns parsed candidates, or `null` when no usable result was produced.
 */
export async function generateSuggestedReplies(
  ctx: Context,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
  signal: AbortSignal,
): Promise<SuggestedReply[] | null> {
  const llm = ctx.get('llm') as LlmService | undefined
  if (llm === undefined || signal.aborted) return null

  try {
    const output = await drainTextStream(llm.stream(request.options))
    return output === null || signal.aborted ? null : parseSuggestedReplies(output, config)
  } catch {
    return null
  }
}
