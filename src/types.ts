/** Public value types for suggested replies. */

/** One candidate that can be copied into the user's next message draft. */
export type SuggestedReply = string

/** Whether a generation was triggered automatically or by user action. */
export type SuggestionOrigin = 'auto' | 'manual'

/** Reasoning effort override for the auxiliary model call. */
export type ReasoningEffort = 'off' | 'auto'

/** User-editable settings stored under the `suggested-replies` namespace. */
export interface SuggestedRepliesSettings {
  /** Number of candidate messages per turn; 0 disables generation. */
  suggestionCount: number
  /** Reasoning effort override: off disables thinking, auto follows model default. */
  reasoningEffort: ReasoningEffort
  /** Mask API keys and tokens in the transcript before sending to the model. */
  redactSecrets: boolean
  /** Remove escape sequences, control characters, and bidi override marks. */
  stripControls: boolean
  /** Ensure each suggestion is a single line with no embedded newlines. */
  singleLine: boolean
  /** Hide meta-text like 'no suggestion' or 'stay silent'. */
  filterMetaText: boolean
  /** Hide evaluative phrases like 'thanks', 'looks good'. */
  filterEvaluative: boolean
  /** Hide assistant-voice phrases like 'Let me…'. */
  filterAssistantVoice: boolean
  /** Hide suggestions exceeding 12 words or 100 bytes. */
  filterTooLong: boolean
  /** Keyboard shortcut for manual trigger; 'disabled' turns it off. */
  manualShortcut: string
  /** Manual trigger writes the first suggestion directly to the draft. */
  manualReplacesDraft: boolean
  /** Where to show suggestion toggles: 'latest' (last assistant msg only) or 'all' (every assistant msg). */
  displayMode: 'all' | 'latest'
}

/** Provider/model route used by one auxiliary candidate-generation Agent. */
export interface SuggestedRepliesRoute {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
}
