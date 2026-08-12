/**
 * Input-dock bubbles that copy a suggested reply into the message draft.
 *
 * @module @dsh-external/dsh-suggested-replies/client/SuggestionBubbles
 */

import { useEffect, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SuggestedRepliesProjection } from '../types.ts'

/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'suggested-replies'>

const STYLE_TAG_ID = 'dsh-suggested-replies-style'
let styleUsers = 0

const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 0;
}
.dsh-suggested-replies-loading {
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  max-width: min(100%, 320px);
  overflow: hidden;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-suggested-replies-bubble:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  background: var(--dsw-alias-interactive-bg-hover, rgba(47, 111, 237, 0.12));
}
.dsh-suggested-replies-bubble:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed);
  outline-offset: 2px;
}
.dsh-suggested-replies-bubble:disabled { cursor: default; opacity: .52; }
`

const ROOT_STYLE: CSSProperties = { display: 'contents' }

/** Render loading text or ready bubbles directly above the composer card. */
export function SuggestionBubbles({ useProjection, useInput, inputActions, t }: SuggestionBubblesProps) {
  const projection = useProjection('suggestedReplies') as SuggestedRepliesProjection | undefined
  const phase = useInput(state => state.phase)

  useEffect(() => {
    styleUsers += 1
    if (document.getElementById(STYLE_TAG_ID) === null) {
      const tag = document.createElement('style')
      tag.id = STYLE_TAG_ID
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }
    return () => {
      styleUsers -= 1
      if (styleUsers !== 0) return
      document.getElementById(STYLE_TAG_ID)?.remove()
    }
  }, [])

  if (projection === undefined || projection === null) return null

  if (projection.generating) {
    return (
      <div style={ROOT_STYLE}>
        <div className="dsh-suggested-replies-dock" data-suggested-replies-dock="">
          <div className="dsh-suggested-replies-row dsh-suggested-replies-loading" role="status">{t('loading')}</div>
        </div>
      </div>
    )
  }

  if (projection.suggestions.length === 0) return null
  const disabled = phase !== 'plain'

  return (
    <div style={ROOT_STYLE}>
      <div className="dsh-suggested-replies-dock" data-suggested-replies-dock="">
        <div className="dsh-suggested-replies-row" aria-label={t('title')}>
          <span className="dsh-suggested-replies-label">{t('title')}</span>
          {projection.suggestions.map((text, index) => (
            <button
              key={`${projection.turn}-${index}`}
              type="button"
              className="dsh-suggested-replies-bubble"
              disabled={disabled}
              title={t('hint')}
              onClick={() => inputActions.setDraft(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
