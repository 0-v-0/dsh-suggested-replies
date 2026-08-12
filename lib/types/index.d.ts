/**
 * Suggested replies host plugin.
 *
 * Completed assistant turns create a short-lived auxiliary LLM request. Its
 * result is projected to the Web client as candidate next user messages. New
 * user input cancels the request and clears the row, so an old completion can
 * never reappear after the conversation has moved on.
 *
 * @module @dsh-external/dsh-suggested-replies
 */
import type { Context } from 'cordis';
import z from 'schemastery';
import type { SuggestedRepliesSettings } from './types.ts';
export type * from './types.ts';
/** Cordis plugin identity. */
export declare const name = "dsh-suggested-replies";
/** Host services required before turn-end observation can start. */
export declare const inject: string[];
/** User-settings namespace used by the master enable switch. */
export declare const SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
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
    /** Maximum lifetime of one auxiliary model call. */
    timeoutMs: number;
    /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
    suggestionProvider?: string;
    /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
    suggestionModel?: string;
}
/** Config schema with deployment-adjustable generation limits. */
export declare const Config: z<Config>;
/**
 * Install generation, projection, cancellation, and settings wiring.
 * @param ctx - host plugin context.
 * @param config - resolved composition configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
