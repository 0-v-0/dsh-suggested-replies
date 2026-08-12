/**
 * Session projection for the currently useful suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/projection
 */
import type { Context } from 'cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { SuggestedRepliesProjection } from './types.ts';
/**
 * Fold suggested-replies events into the client-facing state.
 * @param state - current projected state.
 * @param event - newly committed session event.
 * @returns updated state, preserving identity for unrelated events.
 */
export declare function foldSuggestedReplies(state: SuggestedRepliesProjection, event: SessionEvent): SuggestedRepliesProjection;
/**
 * Register the projection when the session-projection capability is composed.
 * @param ctx - plugin host context.
 */
export declare function registerSuggestedRepliesProjection(ctx: Context): void;
