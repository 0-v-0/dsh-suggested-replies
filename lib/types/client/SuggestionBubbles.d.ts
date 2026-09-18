/**
 * Hidden dock component: captures `inputActions.setDraft` from the
 * `conversation.input.dock` slot and publishes it to the module-level
 * cache consumed by SuggestionActions. Also checks for pending drafts
 * from fork operations and applies them on mount. Renders nothing.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestionBubbles
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'suggested-replies'> & SuggestionBubblesInjected;
/** Connection capability injected by the browser plugin registration. */
export interface SuggestionBubblesInjected {
    readonly rpc: import('@deepseek-ai/dsh-client-connection/client').ClientConnectionRpc;
}
/** Hidden dock component: captures setDraft, renders nothing. */
export declare function SuggestionBubbles({ inputActions, rpc, sessionId }: SuggestionBubblesProps): null;
