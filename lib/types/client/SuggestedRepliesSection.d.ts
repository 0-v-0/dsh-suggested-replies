/**
 * Settings section for the suggested-replies master switch and informational
 * deployment-config overview.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestedRepliesSection
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Session-independent injected connection face. */
export interface SuggestedRepliesSectionInjected {
    /** RPC handle used to load and write the master switch. */
    readonly rpc: ClientConnectionRpc;
}
type SuggestedRepliesSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'suggested-replies'> & SuggestedRepliesSectionInjected;
/** Render, persist the master enable switch, and show deployment-config overview. */
export declare function SuggestedRepliesSection({ rpc, t }: SuggestedRepliesSectionProps): import("react").JSX.Element;
export {};
