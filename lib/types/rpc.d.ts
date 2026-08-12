/**
 * Settings RPC for the suggested-replies Web surface.
 *
 * @module @dsh-external/dsh-suggested-replies/rpc
 */
import type { Context } from 'cordis';
/** Dedicated channel for this plugin's settings endpoints. */
export declare const CHANNEL = "/suggested-replies";
/** Result returned by both settings endpoints. */
export interface SettingsResponse {
    /** Whether future completed turns generate candidates. */
    readonly enabled: boolean;
}
/** Payload accepted by `settings.set`. */
export interface SettingsSetPayload {
    /** Requested enabled state. */
    readonly enabled: boolean;
}
/**
 * Register settings endpoints against the connection service.
 * @param ctx - plugin host context.
 * @param getEnabled - reads the current settings source.
 * @param setEnabled - persists and applies a new enabled state.
 */
export declare function registerSuggestedRepliesRpc(ctx: Context, getEnabled: () => boolean, setEnabled: (enabled: boolean) => Promise<void>): void;
