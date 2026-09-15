/**
 * Transcript framing and sanitization pipeline for suggested-reply generation.
 *
 * Orchestrates the sanitization pipeline that wraps the auxiliary model call:
 * recent conversation messages are framed into a user prompt, secrets are
 * redacted from the transcript, reasoning-effort is resolved, and raw model
 * output candidates are cleaned and semantically filtered.
 *
 * @module @anionex/dsh-suggested-replies/generate
 */

import type { ReasoningEffort, SuggestedReply, SuggestedRepliesRoute } from './types.ts'
import { redactSecrets, cleanSuggestion, shouldFilterSuggestion, type CleanSuggestionOptions, type FilterOptions } from './sanitize.ts'

/** Configuration for the generation pipeline. */
export interface GeneratePipelineConfig {
  /** Reasoning effort override: `off` disables thinking, `auto` follows model default. */
  readonly reasoningEffort: ReasoningEffort
  /** Maximum UTF-8 bytes of the final framed user prompt sent to the model. */
  readonly maxInputBytes: number
  /** Number of recent completed turns to retain in the transcript. */
  readonly maxRecentTurns: number
  /** Character budget for the transcript sent to the model. */
  readonly maxTranscriptChars: number
  /** Whether to exclude non-human (injected) events from the transcript. */
  readonly excludeNonHumanEvents: boolean
  /** Whether to mask secrets in the transcript before sending to the model. */
  readonly redactSecrets: boolean
  /** Maximum retained characters for one candidate message. */
  readonly maxSuggestionChars: number
  // Clean options
  /** Strip ANSI/OSC/CSI escape sequences from model output. */
  readonly stripEscapes: boolean
  /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
  readonly stripControls: boolean
  /** Strip code fences and surrounding paired quotes from model output. */
  readonly stripFencesAndQuotes: boolean
  /** Collapse every whitespace run to a single space. */
  readonly collapseWhitespace: boolean
  /** Force the result to a single line by replacing newlines with spaces. */
  readonly singleLine: boolean
  // Filter options
  /** Filter meta-text like "no suggestion" or "stay silent". */
  readonly filterMetaText: boolean
  /** Filter error echoes like "api error:" or "error:". */
  readonly filterErrorEcho: boolean
  /** Filter evaluative phrases like "thanks", "looks good". */
  readonly filterEvaluative: boolean
  /** Filter assistant-voice phrases like "let me…", "我来…". */
  readonly filterAssistantVoice: boolean
  /** Filter multi-sentence candidates. */
  readonly filterMultiSentence: boolean
  /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
  readonly filterTooLong: boolean
  /** Allow single-word whitelist entries and slash commands. */
  readonly allowSingleCommands: boolean
  /** Filter residual formatting (newlines, asterisks). */
  readonly filterFormatting: boolean
}

/** Build the clean options from a GeneratePipelineConfig. */
export function deriveCleanOptions(config: GeneratePipelineConfig): CleanSuggestionOptions {
  return {
    stripEscapes: config.stripEscapes,
    stripControls: config.stripControls,
    stripFencesAndQuotes: config.stripFencesAndQuotes,
    collapseWhitespace: config.collapseWhitespace,
    singleLine: config.singleLine,
    maxSuggestionChars: config.maxSuggestionChars,
  }
}

/** Build the filter options from a GeneratePipelineConfig. */
export function deriveFilterOptions(config: GeneratePipelineConfig): FilterOptions {
  return {
    filterMetaText: config.filterMetaText,
    filterErrorEcho: config.filterErrorEcho,
    filterEvaluative: config.filterEvaluative,
    filterAssistantVoice: config.filterAssistantVoice,
    filterMultiSentence: config.filterMultiSentence,
    filterTooLong: config.filterTooLong,
    allowSingleCommands: config.allowSingleCommands,
    filterFormatting: config.filterFormatting,
    maxSuggestionChars: config.maxSuggestionChars,
  }
}

/**
 * Sanitize the conversation transcript before sending to the model.
 *
 * Applies secret redaction (when enabled) and truncates the result to
 * `maxTranscriptChars` so the framed prompt stays within the byte budget.
 * @param text - raw transcript text.
 * @param config - pipeline configuration supplying toggle and character budget.
 * @returns the sanitized, truncated transcript.
 */
export function sanitizeTranscript(text: string, config: GeneratePipelineConfig): string {
  let result = text
  if (config.redactSecrets) result = redactSecrets(result)
  // Truncate to maxTranscriptChars
  if (result.length > config.maxTranscriptChars) {
    result = result.slice(0, config.maxTranscriptChars)
  }
  return result
}

/**
 * Clean and filter a single model output candidate.
 * @param raw - raw model output string.
 * @param config - pipeline configuration supplying clean and filter toggles.
 * @returns the cleaned, truncated candidate, or `null` when filtered out.
 */
export function processSuggestion(raw: string, config: GeneratePipelineConfig): SuggestedReply | null {
  const cleaned = cleanSuggestion(raw, deriveCleanOptions(config))
  if (cleaned === '') return null
  if (shouldFilterSuggestion(cleaned, deriveFilterOptions(config))) return null
  return cleaned.slice(0, config.maxSuggestionChars).trim() as SuggestedReply
}

/**
 * Process an array of raw candidates, cleaning and filtering each.
 *
 * Deduplicates by case-insensitive identity so the user never sees the same
 * suggestion twice. Order from the model is preserved.
 * @param raw - raw model output strings.
 * @param config - pipeline configuration supplying clean and filter toggles.
 * @returns the deduplicated, cleaned, and filtered candidates.
 */
export function processSuggestions(raw: readonly string[], config: GeneratePipelineConfig): SuggestedReply[] {
  const seen = new Set<string>()
  const output: SuggestedReply[] = []
  for (const candidate of raw) {
    const processed = processSuggestion(candidate, config)
    if (processed === null) continue
    const identity = processed.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    output.push(processed)
  }
  return output
}

/**
 * Build the agent options with reasoning effort override.
 *
 * When `reasoningEffort` is `'off'`, the option is set explicitly so the
 * auxiliary call never spends budget on chain-of-thought. When it is
 * `'auto'`, the option is omitted and the model follows its default.
 * @param route - provider/model route for the auxiliary call.
 * @param maxTokens - maximum output tokens for the request.
 * @param reasoningEffort - reasoning effort override.
 * @returns the resolved agent options object.
 */
export function resolveAgentOptions(
  route: SuggestedRepliesRoute,
  maxTokens: number,
  reasoningEffort: ReasoningEffort,
): { provider: string; model: string; maxTokens: number; reasoningEffort?: ReasoningEffort } {
  const options: { provider: string; model: string; maxTokens: number; reasoningEffort?: ReasoningEffort } = {
    provider: route.provider,
    model: route.model,
    maxTokens,
  }
  if (reasoningEffort === 'off') {
    options.reasoningEffort = 'off'
  }
  return options
}
