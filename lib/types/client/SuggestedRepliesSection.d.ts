/**
 * Settings section for the suggested-replies editable config. There is no
 * master switch: `suggestionCount: 0` is the only way to turn generation off.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestedRepliesSection
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Session-independent injected connection face. */
export interface SuggestedRepliesSectionInjected {
    readonly rpc: ClientConnectionRpc;
}
type SuggestedRepliesSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'suggested-replies'> & SuggestedRepliesSectionInjected;
export declare function SuggestedRepliesSection({ rpc, t }: SuggestedRepliesSectionProps): import("react").JSX.Element;
export {};
