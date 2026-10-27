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

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SuggestedRepliesSection, type SuggestedRepliesSectionInjected } from './SuggestedRepliesSection.tsx'
import { SuggestionBubbles, type SuggestionBubblesInjected } from './SuggestionBubbles.tsx'
import { SuggestionActions, type SuggestionActionsInjected } from './SuggestionActions.tsx'
import { en, NS, zh, type SuggestedRepliesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy used by the suggested replies actions and settings section. */
    'suggested-replies': SuggestedRepliesKey
  }
  interface SessionStandardProps {
    /** Current Session identity. */
    sessionId: import('@deepseek-ai/dsh-session/types').SessionId
  }
  interface SlotMap {
    /** Full-width entries above the composer card (input zone currency). */
    'conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: {
        readonly session: unknown
        readonly input: unknown
      }
    }
    /** Ordered actions for one finalized assistant message. */
    'conversation.chat.assistant-actions': {
      kind: 'list'
      scope: 'session'
      owner: {
        readonly messageId: import('@deepseek-ai/dsh-llm/brand').MessageId
      }
    }
    /** One page inside the Plugins settings section. */
    'settings.section': {
      kind: 'list'
      scope: 'root'
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Slot registry installed by the ui-renderer client feature. */
    slots: import('@deepseek-ai/dsh-client-ui-renderer/client').SlotRegistry
  }
}

/** Required client services: slots, locale registration, and settings RPC transport. */
export const inject = ['slots', 'locale', 'connection', 'sessions', 'conversation']

/**
 * Register the hidden dock, assistant-actions bubbles, and settings section.
 * @param ctx - browser client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-suggested-replies: dictionaries')
  const connection = ctx.connection as unknown as ConnectionHandle
  const rpc = connection.rpc

  // Hidden dock: captures inputActions.setDraft into module-level cache
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'suggested-replies',
    order: 15,
    locale: NS,
    inject: (sessionId: import('@deepseek-ai/dsh-session/types').SessionId): SuggestionBubblesInjected => {
      // Resolve the per-session input facade so a bubble click can write the
      // draft without ever submitting. `sessions`/`conversation` are injected
      // services (ui-session / ui-conversation).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessions = (ctx as any).sessions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conversation = (ctx as any).conversation
      let setDraft: ((text: string) => void) | undefined
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const actx = (sessions as any)?.scope(sessionId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const service = actx === undefined ? undefined : (conversation as any) ?? (actx as any).get?.('conversation')
        if (service !== undefined) {
          const sessionInput = service.input.for(actx)
          if (sessionInput !== undefined) setDraft = (text: string): void => sessionInput.setDraft(text)
        }
      } catch {
        setDraft = undefined
      }
      return { rpc, setDraft }
    },
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
