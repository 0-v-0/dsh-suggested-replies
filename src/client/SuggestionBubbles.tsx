/**
 * Hidden dock component: captures `inputActions.setDraft` from the
 * `conversation.input.dock` slot and publishes it to the module-level
 * cache consumed by SuggestionActions. Renders nothing.
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

/** Hidden dock component: captures setDraft, renders nothing. */
export function SuggestionBubbles({ inputActions }: SuggestionBubblesProps) {
  useEffect(() => {
    publishSetDraft(inputActions.setDraft)
    return () => { publishSetDraft(undefined) }
  }, [inputActions])

  return null
}
