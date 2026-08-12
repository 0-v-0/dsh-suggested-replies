/**
 * Input-dock bubbles that copy a suggested reply into the message draft.
 *
 * @module @dsh-external/dsh-suggested-replies/client/SuggestionBubbles
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'suggested-replies'>;
/** Render loading text or ready bubbles directly above the composer card. */
export declare function SuggestionBubbles({ useProjection, useInput, inputActions, t }: SuggestionBubblesProps): import("react").JSX.Element | null;
