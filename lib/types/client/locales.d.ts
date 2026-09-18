/**
 * Locale dictionaries for the suggested-replies Web surface.
 *
 * @module @anionex/dsh-suggested-replies/client/locales
 */
/** Keys used by the input dock and settings section. */
export type SuggestedRepliesKey = 'title' | 'hint' | 'loading' | 'branchHint' | 'regenerate' | 'dismiss' | 'settings.nav' | 'settings.title' | 'settings.description' | 'settings.generation.title' | 'settings.displayMode.label' | 'settings.displayMode.description' | 'settings.displayMode.latest' | 'settings.displayMode.all' | 'settings.reasoningEffort.label' | 'settings.reasoningEffort.description' | 'settings.reasoningEffort.off' | 'settings.reasoningEffort.auto' | 'settings.suggestionCount.label' | 'settings.suggestionCount.description' | 'settings.suggestionCount.disabled' | 'settings.sanitize.title' | 'settings.redactSecrets.label' | 'settings.redactSecrets.description' | 'settings.stripControls.label' | 'settings.stripControls.description' | 'settings.singleLine.label' | 'settings.singleLine.description' | 'settings.filter.title' | 'settings.filterMetaText.label' | 'settings.filterMetaText.description' | 'settings.filterEvaluative.label' | 'settings.filterEvaluative.description' | 'settings.filterAssistantVoice.label' | 'settings.filterAssistantVoice.description' | 'settings.filterTooLong.label' | 'settings.filterTooLong.description' | 'settings.manual.title' | 'settings.manualShortcut.label' | 'settings.manualShortcut.description' | 'settings.manualReplacesDraft.label' | 'settings.manualReplacesDraft.description' | 'settings.regenerate' | 'settings.regenerate.hint';
/** Locale namespace registered by the client plugin. */
export declare const NS = "suggested-replies";
/** English copy. */
export declare const en: Record<SuggestedRepliesKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<SuggestedRepliesKey, string>;
