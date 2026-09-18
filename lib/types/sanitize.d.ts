/**
 * Transcript redaction, suggestion cleaning, and semantic output filtering.
 *
 * Nothing that reaches the model carries secret-shaped text, and nothing the
 * model returns can inject terminal control into the web composer or read as
 * meta-text instead of a real next prompt. Pure functions, exported for
 * direct unit coverage.
 *
 * Ported from the studyzy/dsh-suggest-prompt project (MIT licensed).
 *
 * @module @anionex/dsh-suggested-replies/sanitize
 */
/** Options controlling structural cleaning of one model output candidate. */
export interface CleanSuggestionOptions {
    /** Strip ANSI/OSC/CSI escape sequences. */
    readonly stripEscapes: boolean;
    /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
    readonly stripControls: boolean;
    /** Strip code fences and surrounding paired quotes. */
    readonly stripFencesAndQuotes: boolean;
    /** Collapse every whitespace run to a single space. */
    readonly collapseWhitespace: boolean;
    /** Force the result to a single line by replacing newlines with spaces. */
    readonly singleLine: boolean;
}
/** Options controlling semantic filtering of cleaned model output. */
export interface FilterOptions {
    /** Filter meta-text like "no suggestion" or "stay silent". */
    readonly filterMetaText: boolean;
    /** Filter error echoes like "api error:" or "error:". */
    readonly filterErrorEcho: boolean;
    /** Filter evaluative phrases like "thanks", "looks good". */
    readonly filterEvaluative: boolean;
    /** Filter assistant-voice phrases like "let me…", "我来…". */
    readonly filterAssistantVoice: boolean;
    /** Filter multi-sentence candidates. */
    readonly filterMultiSentence: boolean;
    /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
    readonly filterTooLong: boolean;
    /** Allow single-word whitelist entries and slash commands. */
    readonly allowSingleCommands: boolean;
    /** Filter residual formatting (newlines, asterisks). */
    readonly filterFormatting: boolean;
}
/**
 * Mask secret-shaped substrings so the auxiliary model never receives them.
 * Uses a single function that applies all redactions sequentially.
 * @param text - transcript text that may contain credentials.
 * @returns the same text with every matched secret replaced by a label.
 */
export declare function redactSecrets(text: string): string;
/** Toggles for the escape/control passes shared by transcript and candidate. */
export interface StripOptions {
    /** Strip ANSI/OSC/CSI escape sequences. */
    readonly stripEscapes: boolean;
    /** Strip C0/C1 control chars, invisible format characters, and lone surrogates. */
    readonly stripControls: boolean;
}
/**
 * Apply the terminal-injection and invisible-character passes.
 *
 * Shared by the transcript path and the candidate path so the two can never
 * diverge on which bytes are unsafe to ship to the model or to the composer.
 * @param text - input text.
 * @param options - which passes to apply.
 * @returns the input with the selected unsafe characters removed.
 */
export declare function stripUnsafeCharacters(text: string, options: StripOptions): string;
/**
 * Structurally clean one raw model output candidate into composer-safe text.
 *
 * Each cleaning step is individually controlled by the options so callers can
 * tune the pipeline. The result is trimmed but not truncated; the caller is
 * responsible for applying `maxSuggestionChars` after filtering.
 * @param text - raw model output.
 * @param options - per-step cleaning toggles.
 * @returns the cleaned text.
 */
export declare function cleanSuggestion(text: string, options: CleanSuggestionOptions): string;
/**
 * Report whether `text` contains a CJK ideograph (Unified + Extension A).
 *
 * Exported so the word-count check and the fallback-language detection agree on
 * what counts as CJK; two divergent ranges here misclassify CJK extension-A text.
 * @param text - inspected text.
 * @returns true when any code point falls in the CJK ideograph ranges.
 */
export declare function hasCJK(text: string): boolean;
/**
 * Compute the UTF-8 byte length of a string.
 * @param text - the string to measure.
 * @returns the number of UTF-8 bytes.
 */
export declare function byteLength(text: string): number;
/**
 * Truncate to at most `max` code points.
 *
 * `String.slice` counts UTF-16 code units, so cutting in the middle of an
 * astral pair leaves a lone surrogate that reappears in the composer and in
 * later model turns. This walks whole code points instead.
 * @param text - input text.
 * @param max - maximum retained code points.
 * @returns the truncated text, with no lone surrogate at the cut.
 */
export declare function truncateToCodePoints(text: string, max: number): string;
/**
 * Truncate to at most `max` UTF-8 bytes, on a code point boundary.
 *
 * The auxiliary call has a byte budget that the character budget cannot express
 * for multi-byte text; a 60,000-character CJK transcript is roughly 180 KB.
 * @param text - input text.
 * @param max - maximum retained UTF-8 bytes.
 * @returns the truncated text, with no lone surrogate at the cut.
 */
export declare function truncateToUtf8Bytes(text: string, max: number): string;
/**
 * Reject cleaned model output that is not a usable next prompt.
 *
 * Returns `true` when the candidate should be dropped silently (not displayed).
 * When `allowSingleCommands` is true and the text matches a known single-word
 * command or starts with `/`, it is allowed regardless of other checks.
 * @param text - cleaned, single-line model output.
 * @param options - per-check filter toggles.
 * @returns true when the suggestion should be filtered out.
 */
export declare function shouldFilterSuggestion(text: string, options: FilterOptions): boolean;
