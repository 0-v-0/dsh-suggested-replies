/** Logged auxiliary Agent run that predicts concise next user messages. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type { ReasoningEffort, SuggestionOrigin, SuggestedRepliesRoute, SuggestedReply } from './types.ts';
import { type SuggestionOutputLimits } from './suggestion-prompt.ts';
/** Resolved runtime choices for one suggested-replies model request. */
export interface SuggestionGenerationConfig extends SuggestionOutputLimits {
    /** Number of recent model-visible messages retained as context. */
    readonly contextMessageCount: number;
    /** Maximum output tokens requested from the model. */
    readonly maxTokens: number;
    /** Optional explicit auxiliary route that overrides the conversation route. */
    readonly suggestionRoute?: SuggestedRepliesRoute;
    /** Maximum UTF-8 bytes of the final framed user prompt sent to the auxiliary model. */
    readonly maxInputBytes: number;
    /** Number of recent completed turns to retain in the transcript for generation. */
    readonly maxRecentTurns: number;
    /** Character budget for the transcript sent to the auxiliary model. */
    readonly maxTranscriptChars: number;
    /** Number of conversation turns retained as context (aligns with maxRecentTurns). */
    readonly maxContextTurns: number;
    /** Byte budget for the retained context turns JSON. */
    readonly maxContextContextBytes: number;
    /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
    readonly reasoningEffort: ReasoningEffort;
    /** Mask secrets (API keys, bearer tokens) in the transcript before sending to the model. */
    readonly redactSecrets: boolean;
    /** Strip ANSI/OSC/CSI escape sequences from the transcript. */
    readonly stripEscapes: boolean;
    /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
    readonly stripControls: boolean;
    /** Strip code fences and surrounding paired quotes from model output. */
    readonly stripFencesAndQuotes: boolean;
    /** Collapse whitespace and force single-line output. */
    readonly collapseWhitespace: boolean;
    /** Force candidates to a single line with no embedded newlines. */
    readonly singleLine: boolean;
    /** Filter meta-text like “no suggestion” or “stay silent”. */
    readonly filterMetaText: boolean;
    /** Filter error echoes like “api error:” or “error:”. */
    readonly filterErrorEcho: boolean;
    /** Filter evaluative phrases like “thanks”, “looks good”, “不错”. */
    readonly filterEvaluative: boolean;
    /** Filter assistant-voice phrases like “Let me…”, “我来…”. */
    readonly filterAssistantVoice: boolean;
    /** Filter multi-sentence candidates. */
    readonly filterMultiSentence: boolean;
    /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
    readonly filterTooLong: boolean;
    /** Allow single-word whitelist entries (yes/ok/继续) and slash commands. */
    readonly allowSingleCommands: boolean;
    /** Filter residual formatting (newlines, asterisks). */
    readonly filterFormatting: boolean;
    /** Whether manual trigger writes directly to the draft. */
    readonly manualReplacesDraft: boolean;
    /** Pass current candidates as negative examples when regenerating manually. */
    readonly manualDedupe: boolean;
    /** Maximum retained skipped candidates per cycle for dedup. */
    readonly maxCycleSkipped: number;
    /** Exclude non-human events (injected instructions, runtime context) from transcripts. */
    readonly excludeNonHumanEvents: boolean;
}
/** Complete auxiliary request that the internal Agent logs through official events. */
export interface PreparedSuggestionRequest {
    /** Provider/model route for the internal Agent. */
    readonly route: SuggestedRepliesRoute;
    /** Complete system instruction installed as the Agent's only prompt section. */
    readonly system: string;
    /** Complete user-role prompt sent through the Agent inbox. */
    readonly prompt: string;
    /** Maximum output tokens for the Agent request. */
    readonly maxTokens: number;
    /** Whether this request was triggered automatically or by user action. */
    readonly origin: SuggestionOrigin;
    /** Previously skipped candidates to avoid when regenerating manually. */
    readonly skippedCycle?: readonly string[];
}
/** Select the trailing model-visible conversation messages from a Session. */
export declare function deriveRecentMessages(agent: Agent, contextMessageCount: number): import("@deepseek-ai/dsh-llm").Message[];
/** Resolve the latest logged route, falling back to the Agent creation route. */
export declare function resolveSuggestionRoute(agent: Agent): SuggestedRepliesRoute | null;
/** Validate and normalize an optional explicit auxiliary route. */
export declare function resolveConfiguredSuggestionRoute(provider: string | undefined, model: string | undefined): SuggestedRepliesRoute | undefined;
/** Prepare one internal Agent request when the completed turn has usable text and routing. */
export declare function prepareSuggestionRequest(agent: Agent, config: SuggestionGenerationConfig, turn: number, signal: AbortSignal): PreparedSuggestionRequest | null;
export declare function getSessionEvents(session: Session): readonly SessionEvent[];
/** Extract the last non-empty assistant text produced inside one owned run interval. */
export declare function extractSuggestionText(events: readonly SessionEvent[], firstSeq: number): string | null;
/**
 * Run the auxiliary request through an official Agent Session, archive it
 * before model work starts, flush its log, then dispose the live handle.
 */
export declare function generateSuggestedReplies(ctx: Context, parent: Agent, internalSessionId: SessionId, request: PreparedSuggestionRequest, config: SuggestionGenerationConfig, signal: AbortSignal): Promise<SuggestedReply[] | null>;
