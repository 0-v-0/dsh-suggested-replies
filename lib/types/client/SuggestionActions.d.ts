/**
 * Assistant-actions slot entry. Renders the suggestion toggle inline in the
 * MessageIconActions row; in `latest` display mode only the message matching
 * the current sidecar row renders it, while `all` mode renders it on every
 * assistant message and switches click-to-draft for a fork at that message.
 * `setDraft` comes from a module-level cache populated by the hidden dock
 * component.
 *
 * Layout: a compact icon toggle button (28×28, matching other action buttons).
 * When expanded, an absolutely positioned dropdown pops upward above the
 * button — it does not push siblings or affect the row layout. The dropdown
 * scrolls internally when content exceeds its max-height.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestionActions
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Called by the hidden dock component to publish its inputActions.setDraft. */
export declare function publishSetDraft(fn: ((text: string) => void) | undefined): void;
/** Connection capability injected by the browser plugin registration. */
export interface SuggestionActionsInjected {
    readonly rpc: ClientConnectionRpc;
}
/** Full prop currency supplied by the `conversation.chat.assistant-actions` slot. */
export type SuggestionActionsProps = PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'suggested-replies'> & SuggestionActionsInjected;
export declare function SuggestionActions({ rpc, messageId, sessionId, t }: SuggestionActionsProps): import("react").JSX.Element | null;
