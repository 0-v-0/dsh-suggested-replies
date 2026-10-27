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
import type { Context } from '@deepseek-ai/cordis';
import { type SuggestedRepliesKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy used by the suggested replies actions and settings section. */
        'suggested-replies': SuggestedRepliesKey;
    }
    interface SessionStandardProps {
        /** Current Session identity. */
        sessionId: import('@deepseek-ai/dsh-session/types').SessionId;
    }
    interface SlotMap {
        /** Full-width entries above the composer card (input zone currency). */
        'conversation.input.dock': {
            kind: 'list';
            scope: 'session';
            owner: {
                readonly session: unknown;
                readonly input: unknown;
            };
        };
        /** Ordered actions for one finalized assistant message. */
        'conversation.chat.assistant-actions': {
            kind: 'list';
            scope: 'session';
            owner: {
                readonly messageId: import('@deepseek-ai/dsh-llm/brand').MessageId;
            };
        };
        /** One page inside the Plugins settings section. */
        'settings.section': {
            kind: 'list';
            scope: 'root';
        };
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Slot registry installed by the ui-renderer client feature. */
        slots: import('@deepseek-ai/dsh-client-ui-renderer/client').SlotRegistry;
    }
}
/** Required client services: slots, locale registration, and settings RPC transport. */
export declare const inject: string[];
/**
 * Register the hidden dock, assistant-actions bubbles, and settings section.
 * @param ctx - browser client root context.
 */
export declare function apply(ctx: Context): void;
