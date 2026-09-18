/**
 * Suggested replies browser plugin.
 *
 * Two slots are registered:
 * 1. `conversation.input.dock` (order 15) — hidden component that captures
 *    `inputActions.setDraft` and publishes it to a module-level cache.
 * 2. `conversation.chat.assistant-actions` (order 20) — renders suggestion
 *    bubbles below the latest finalized assistant message. Gets `setDraft`
 *    from the module-level cache populated by the dock component.
 *
 * @module @anionex/dsh-suggested-replies/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type SuggestedRepliesKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy used by the suggested replies actions and settings section. */
        'suggested-replies': SuggestedRepliesKey;
    }
}
/** Required client services: slots, locale registration, and settings RPC transport. */
export declare const inject: string[];
/**
 * Register the hidden dock, assistant-actions bubbles, and settings section.
 * @param ctx - browser client root context.
 */
export declare function apply(ctx: ClientContext): void;
