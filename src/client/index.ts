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

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SuggestedRepliesSection, type SuggestedRepliesSectionInjected } from './SuggestedRepliesSection.tsx'
import { SuggestionBubbles, type SuggestionBubblesInjected } from './SuggestionBubbles.tsx'
import { SuggestionActions, type SuggestionActionsInjected } from './SuggestionActions.tsx'
import { en, NS, zh, type SuggestedRepliesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy used by the suggested replies actions and settings section. */
    'suggested-replies': SuggestedRepliesKey
  }
}

/** Required client services: slots, locale registration, and settings RPC transport. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the hidden dock, assistant-actions bubbles, and settings section.
 * @param ctx - browser client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-suggested-replies: dictionaries')
  const connection = ctx.connection as unknown as ConnectionHandle
  const rpc = connection.rpc

  // Hidden dock: captures inputActions.setDraft into module-level cache
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'suggested-replies',
    order: 15,
    locale: NS,
    inject: (): SuggestionBubblesInjected => ({ rpc }),
  }, SuggestionBubbles))
  // Assistant-actions: renders suggestion bubbles below the latest AI message
  const actionsInjected = (): SuggestionActionsInjected => ({ rpc })
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'suggested-replies',
    order: 20,
    locale: NS,
    inject: actionsInjected,
  }, SuggestionActions))

  // Settings section
  const settingsInjected = (): SuggestedRepliesSectionInjected => ({ rpc })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'suggested-replies',
    order: 70,
    label: () => ctx.locale.bind(NS)('settings.nav'),
    locale: NS,
    inject: settingsInjected,
  }, SuggestedRepliesSection))
}
