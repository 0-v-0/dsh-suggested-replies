/**
 * Auxiliary LLM call that predicts concise next user messages.
 *
 * @module @dsh-external/dsh-suggested-replies/suggestion-llm
 */
import type { Context } from 'cordis';
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SuggestedRepliesGeneratingPayload, SuggestedRepliesRoute, SuggestedReply } from './types.ts';
import { type SuggestionOutputLimits } from './suggestion-prompt.ts';
/** Resolved runtime choices for one suggested-replies model request. */
export interface SuggestionGenerationConfig extends SuggestionOutputLimits {
    /** Number of recent model-visible messages retained as context. */
    readonly contextMessageCount: number;
    /** Maximum output tokens requested from the model. */
    readonly maxTokens: number;
    /** Optional explicit auxiliary route that overrides the conversation route. */
    readonly suggestionRoute?: SuggestedRepliesRoute;
}
/** Complete, loggable auxiliary request prepared before provider dispatch. */
export interface PreparedSuggestionRequest {
    /** Durable event payload that reconstructs every model-visible input. */
    readonly log: Omit<SuggestedRepliesGeneratingPayload, 'turn'>;
    /** Provider-neutral streaming options. */
    readonly options: GenerateOptions;
}
/**
 * Select the trailing visible conversation messages from a session.
 * @param agent - agent whose session owns the conversation.
 * @param contextMessageCount - maximum retained message count.
 * @returns recent messages in chronological order.
 */
export declare function deriveRecentMessages(agent: Agent, contextMessageCount: number): Message[];
/**
 * Resolve the latest logged route, falling back to the Agent creation route.
 * @param agent - agent whose conversation route should be reused.
 * @returns provider/model pair, or `null` when neither source has both fields.
 */
export declare function resolveSuggestionRoute(agent: Agent): SuggestedRepliesRoute | null;
/**
 * Validate and normalize an optional explicit auxiliary route.
 * @param provider - optional configured provider, or `undefined` to inherit.
 * @param model - optional configured model, or `undefined` to inherit.
 * @returns the explicit route, or `undefined` when both fields are omitted.
 */
export declare function resolveConfiguredSuggestionRoute(provider: string | undefined, model: string | undefined): SuggestedRepliesRoute | undefined;
/**
 * Prepare the detached request when the current route and conversation support it.
 * @param ctx - host context that may own an LLM service.
 * @param agent - agent whose completed turn supplied the context.
 * @param config - resolved model-call options.
 * @param turn - completed turn that must contain visible assistant text.
 * @param signal - cancellation signal held by the session generation gate.
 * @returns loggable and dispatchable request, or `null` for an expected no-op.
 */
export declare function prepareSuggestionRequest(ctx: Context, agent: Agent, config: SuggestionGenerationConfig, turn: number, signal: AbortSignal): PreparedSuggestionRequest | null;
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
export declare function buildSuggestionCallOptions(route: SuggestedRepliesRoute, prompt: string, system: string, maxTokens: number, signal: AbortSignal, sessionId?: Agent['id']): GenerateOptions;
/**
 * Drain a stream to plain text, accepting only normal `stop` completion.
 * @param stream - LLM chunks returned by the selected provider.
 * @returns complete output text, or `null` after an aborted or failed finish.
 */
export declare function drainTextStream(stream: AsyncIterable<StreamChunk>): Promise<string | null>;
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
export declare function generateSuggestedReplies(ctx: Context, request: PreparedSuggestionRequest, config: SuggestionGenerationConfig, signal: AbortSignal): Promise<SuggestedReply[] | null>;
