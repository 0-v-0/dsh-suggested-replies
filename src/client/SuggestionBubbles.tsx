/**
 * Hidden dock component: captures the per-session `setDraft` facade from the
 * `conversation.input.dock` slot and publishes it to the module-level cache
 * consumed by SuggestionActions. Also checks for pending drafts from fork
 * operations and applies them on mount. Renders nothing.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestionBubbles
 */

import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { publishSetDraft } from './SuggestionActions.tsx'

/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'suggested-replies'>
  & SuggestionBubblesInjected

/** Connection capability and draft writer injected by the browser plugin registration. */
export interface SuggestionBubblesInjected {
  readonly rpc: import('@deepseek-ai/dsh-client-connection/client').ClientConnectionRpc
  /** Write the composer draft for the current Session (never submits). */
  readonly setDraft: ((text: string) => void) | undefined
}

/** Hidden dock component: captures setDraft, renders nothing. */
export function SuggestionBubbles({ setDraft, rpc, sessionId }: SuggestionBubblesProps) {
  useEffect(() => {
    publishSetDraft(setDraft)
    return () => { publishSetDraft(undefined) }
  }, [setDraft])

  // Check for pending draft from a fork operation
  useEffect(() => {
    if (setDraft === undefined) return
    let cancelled = false
    void (async () => {
      try {
        const result = await rpc.call('/suggested-replies', 'draft.get', { sessionId }) as
          | { ok: true; value: { draft: string | null } }
          | { ok: false; error: { message: string } }
        if (cancelled) return
        if (result.ok && result.value.draft !== null) {
          setDraft(result.value.draft)
        }
      } catch {
        // ignore — fork draft is best-effort
      }
    })()
    return () => { cancelled = true }
  }, [rpc, sessionId, setDraft])

  return null
}
