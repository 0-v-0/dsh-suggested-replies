/** Settings and sidecar-state RPC for the suggested-replies Web surface. */
import type { Context } from '@deepseek-ai/cordis';
import { type SuggestedRepliesSettings } from './types.ts';
import type { SuggestedRepliesSessionIdentity, SuggestedRepliesStateSnapshot, SuggestedRepliesStateStore } from './state.ts';
/** Dedicated channel for this plugin's Web endpoints. */
export declare const CHANNEL = "/suggested-replies";
/** Client-facing state returned by `state.get` and `state.watch`. */
export type SuggestedRepliesStateResponse = SuggestedRepliesStateSnapshot;
/** Payload accepted by `dock.setCollapsed`. */
export interface DockSetCollapsedPayload {
    readonly sessionId: string;
    readonly collapsed: boolean;
}
/** Payload accepted by `state.get`. */
export interface StateGetPayload {
    /** Parent Session whose sidecar state should be returned. */
    readonly sessionId: string;
}
/** Payload accepted by `state.watch`. */
export interface StateWatchPayload extends StateGetPayload {
    /** Session lifecycle observed by the caller. */
    readonly lifecycle: SuggestedRepliesSessionIdentity;
    /** Last revision observed by the caller. */
    readonly revision: number;
}
/** Payload accepted by `suggestions.generate`. */
export interface GeneratePayload {
    /** Parent Session whose last completed turn should generate candidates. */
    readonly sessionId: string;
    /** Optional explicit turn number; omitted means use the last completed turn. */
    readonly turn?: number;
}
/** Payload accepted by `suggestions.dismiss`. */
export interface DismissPayload {
    /** Parent Session whose active generation should be dismissed. */
    readonly sessionId: string;
}
/**
 * Acknowledgement response shared by the manual-trigger endpoints
 * (`suggestions.generate`, `suggestions.dismiss`) and `dock.setCollapsed`.
 */
export interface GenerateResult {
    /** Acknowledgement that the action was accepted. */
    readonly ok: true;
}
/**
 * Client-facing config snapshot returned by `config.get` and `config.set`.
 * Derived from the settings contract so the two cannot drift; `reasoningEffort`
 * is widened to `string` because the RPC boundary serializes the union.
 */
export type ConfigResponse = Omit<SuggestedRepliesSettings, 'reasoningEffort'> & {
    readonly reasoningEffort: string;
};
/** Payload accepted by `config.set`: a partial patch of the settings contract. */
export type ConfigSetPayload = Partial<SuggestedRepliesSettings>;
/** Payload accepted by `draft.get`. */
export interface DraftGetPayload {
    readonly sessionId: string;
}
/** Result returned by `draft.get`. */
export interface DraftGetResult {
    readonly draft: string | null;
}
/** Payload accepted by `suggestions.fork`. */
export interface ForkPayload {
    /** Parent Session to fork from. */
    readonly sessionId: string;
    /** MessageId of the assistant message to fork at. */
    readonly messageId: string;
    /** Draft text to set in the forked session. */
    readonly draft: string;
}
/** Result returned by `suggestions.fork`. */
export interface ForkResult {
    readonly ok: true;
    readonly sessionId: string;
}
/**
 * Validate and bounds-check a settings patch before it reaches host state.
 * Unknown keys are rejected so an arbitrary object cannot be merged into settings.
 * @param value - untrusted RPC payload.
 * @returns whether the payload is a valid settings patch.
 */
export declare function isConfigSetPayload(value: unknown): value is ConfigSetPayload;
/** Register settings and cancellable sidecar-state endpoints. */
export declare function registerSuggestedRepliesRpc(ctx: Context, store: SuggestedRepliesStateStore, getConfig: () => ConfigResponse, setConfig: (payload: ConfigSetPayload) => Promise<ConfigResponse>, generateFn: (sessionId: string, turn?: number) => Promise<void>, dismissFn: (sessionId: string) => Promise<void>, forkFn: (sessionId: string, messageId: string, draft: string) => Promise<string>, setCollapsedFn: (sessionId: string, collapsed: boolean) => void, getDraftFn: (sessionId: string) => string | null): void;
