/** Public value types for suggested replies. */
/** One candidate that can be copied into the user's next message draft. */
export type SuggestedReply = string;
/** Whether a generation was triggered automatically or by user action. */
export type SuggestionOrigin = 'auto' | 'manual';
/** Reasoning effort override for the auxiliary model call. */
export type ReasoningEffort = 'off' | 'auto';
/** User-editable settings stored under the `suggested-replies` namespace. */
export interface SuggestedRepliesSettings {
    /** Whether completed turns may trigger an auxiliary candidate-generation Agent. */
    enabled: boolean;
}
/** Provider/model route used by one auxiliary candidate-generation Agent. */
export interface SuggestedRepliesRoute {
    /** Registered provider route. */
    provider: string;
    /** Provider-owned model id. */
    model: string;
}
