/** Suggested replies host plugin with plugin-owned sidecar state. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ReasoningEffort, SuggestedRepliesSettings } from './types.ts';
export type * from './types.ts';
export type { SuggestedRepliesStateSnapshot } from './state.ts';
/** Cordis plugin identity. */
export declare const name = "dsh-suggested-replies";
/** Required official extension points. */
export declare const inject: string[];
/** User-settings namespace used by the master enable switch. */
export declare const SETTINGS_NAMESPACE: any;
/** Configurable runtime parameters for candidate generation. */
export interface Config extends SuggestedRepliesSettings {
    /** Candidate messages requested from the auxiliary model. */
    suggestionCount: number;
    /** Trailing visible conversation messages supplied to the auxiliary model. */
    contextMessageCount: number;
    /** Maximum retained characters for one candidate message. */
    maxSuggestionChars: number;
    /** Maximum response tokens requested from the auxiliary model. */
    maxTokens: number;
    /** Maximum lifetime of one auxiliary Agent run. */
    timeoutMs: number;
    /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
    suggestionProvider?: string;
    /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
    suggestionModel?: string;
    /** Whether to follow the current Session route instead of an explicit provider/model. */
    followSessionRoute: boolean;
    /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
    reasoningEffort: ReasoningEffort;
    /** Maximum UTF-8 bytes of the final framed user prompt sent to the auxiliary model. */
    maxInputBytes: number;
    /** Number of recent completed turns to retain in the transcript for generation. */
    maxRecentTurns: number;
    /** Character budget for the transcript sent to the auxiliary model. */
    maxTranscriptChars: number;
    /** Number of conversation turns retained as context (aligns with maxRecentTurns). */
    maxContextTurns: number;
    /** Byte budget for the retained context turns JSON. */
    maxContextContextBytes: number;
    /** Mask secrets (API keys, bearer tokens) in the transcript before sending to the model. */
    redactSecrets: boolean;
    /** Strip ANSI/OSC/CSI escape sequences from the transcript. */
    stripEscapes: boolean;
    /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
    stripControls: boolean;
    /** Strip code fences and surrounding paired quotes from model output. */
    stripFencesAndQuotes: boolean;
    /** Collapse whitespace and force single-line output. */
    collapseWhitespace: boolean;
    /** Force candidates to a single line with no embedded newlines. */
    singleLine: boolean;
    /** Filter meta-text like “no suggestion” or “stay silent”. */
    filterMetaText: boolean;
    /** Filter error echoes like “api error:” or “error:”. */
    filterErrorEcho: boolean;
    /** Filter evaluative phrases like “thanks”, “looks good”, “不错”. */
    filterEvaluative: boolean;
    /** Filter assistant-voice phrases like “Let me…”, “我来…”. */
    filterAssistantVoice: boolean;
    /** Filter multi-sentence candidates. */
    filterMultiSentence: boolean;
    /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
    filterTooLong: boolean;
    /** Allow single-word whitelist entries (yes/ok/继续) and slash commands. */
    allowSingleCommands: boolean;
    /** Filter residual formatting (newlines, asterisks). */
    filterFormatting: boolean;
    /** Keyboard shortcut for manual trigger; `disabled` turns it off. */
    manualShortcut: string;
    /** Whether manual trigger writes directly to the draft. */
    manualReplacesDraft: boolean;
    /** Pass current candidates as negative examples when regenerating manually. */
    manualDedupe: boolean;
    /** Maximum retained skipped candidates per cycle for dedup. */
    maxCycleSkipped: number;
    /** Maximum interaction outcome records stored in browser localStorage. */
    maxLocalOutcomes: number;
    /** Whether to retain recent performance/cost metrics in host memory. */
    recordMetrics: boolean;
    /** Exclude non-human events (injected instructions, runtime context) from transcripts. */
    excludeNonHumanEvents: boolean;
}
/** Config schema with deployment-adjustable generation limits. */
export declare const Config: z<Config>;
/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
export declare function apply(ctx: Context, config: Config): Promise<() => Promise<void>>;
