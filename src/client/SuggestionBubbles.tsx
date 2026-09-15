/**
 * Input-dock bubbles that copy a suggested reply into the message draft.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestionBubbles
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SuggestedRepliesStateResponse } from '../rpc.ts'

/** Connection capability injected by the browser plugin registration. */
export interface SuggestionBubblesInjected {
  /** RPC transport used to read and watch this Session's sidecar state. */
  readonly rpc: ClientConnectionRpc
}

/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'suggested-replies'>
  & SuggestionBubblesInjected

type StateResult = RpcResult<SuggestedRepliesStateResponse>

interface ObservedState {
  readonly sessionId: SuggestionBubblesProps['sessionId']
  readonly value: SuggestedRepliesStateResponse
}

const STYLE_TAG_ID = 'dsh-suggested-replies-style'
const COLLAPSE_KEY = 'dsh-suggested-replies-collapsed'
let styleUsers = 0

const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.dsh-suggested-replies-header-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-header-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.10));
}
.dsh-suggested-replies-chevron {
  display: inline-block;
  font-size: 10px;
  transition: transform 160ms ease;
}
.dsh-suggested-replies-chevron-collapsed {
  transform: rotate(-90deg);
}
.dsh-suggested-replies-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
  overflow: hidden;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  overflow: hidden;
  padding: 7px 12px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 10px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 120ms ease, background 120ms ease;
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
.dsh-suggested-replies-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.dsh-suggested-replies-regenerate {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.dsh-suggested-replies-regenerate:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  color: var(--dsw-alias-state-business-primary, #2f6fed);
}
.dsh-suggested-replies-regenerate:disabled { cursor: default; opacity: .52; }
`

const ROOT_STYLE: CSSProperties = { display: 'contents' }

function loadCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function saveCollapsed(v: boolean): void {
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

/** Render loading text or ready bubbles directly above the composer card. */
export function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }: SuggestionBubblesProps) {
  const [observed, setObserved] = useState<ObservedState | undefined>()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const phase = useInput(state => state.phase)
  const state = observed !== undefined && observed.sessionId === sessionId
    ? observed.value
    : undefined

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const publish = (value: SuggestedRepliesStateResponse): void => {
      if (!signal.aborted) setObserved({ sessionId, value })
    }
    const clear = (): void => {
      if (signal.aborted) return
      setObserved(current => current?.sessionId === sessionId ? undefined : current)
    }

    void (async () => {
      try {
        const initial = await rpc.call(
          '/suggested-replies', 'state.get', { sessionId }, signal,
        ) as StateResult
        if (signal.aborted) return
        if (!initial.ok) { clear(); return }

        let current = initial.value
        publish(current)

        while (!signal.aborted) {
          const watched = await rpc.call(
            '/suggested-replies', 'state.watch',
            { sessionId, lifecycle: current.lifecycle, revision: current.revision },
            signal,
          ) as StateResult
          if (signal.aborted) return
          if (!watched.ok) { clear(); return }
          current = watched.value
          publish(current)
        }
      } catch {
        clear()
      }
    })()

    return () => controller.abort()
  }, [rpc, sessionId])

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

  // Notify host of collapsed state on mount and when toggled
  useEffect(() => {
    void rpc.call('/suggested-replies', 'dock.setCollapsed', { sessionId, collapsed })
  }, [rpc, sessionId, collapsed])

  const hasVisibleSuggestions = state !== undefined
    && state.phase !== 'cleared'
    && state.phase !== 'generating'
    && state.suggestions.length > 0

  useEffect(() => {
    if (!hasVisibleSuggestions) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      void rpc.call('/suggested-replies', 'suggestions.dismiss', { sessionId })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [rpc, sessionId, hasVisibleSuggestions])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod || !event.shiftKey || event.code !== 'Space') return
      if (event.isComposing) return
      event.preventDefault()
      void rpc.call('/suggested-replies', 'suggestions.generate', { sessionId })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [rpc, sessionId])

  // When expanding and no suggestions exist, lazily trigger generation
  const lazyState = state
  useEffect(() => {
    if (lazyState === undefined) return
    if (collapsed) return
    if (lazyState.phase === 'generating') return
    if (lazyState.suggestions.length > 0) return
    void rpc.call('/suggested-replies', 'suggestions.generate', { sessionId })
  }, [rpc, sessionId, collapsed, lazyState])

  if (state === undefined || state.phase === 'generating') return null

  const disabled = phase !== 'plain'
  const showBubbles = state.suggestions.length > 0
  const toggleCollapsed = (): void => {
    const next = !collapsed
    setCollapsed(next)
    saveCollapsed(next)
    void rpc.call('/suggested-replies', 'dock.setCollapsed', { sessionId, collapsed: next })
  }

  return (
    <div style={ROOT_STYLE}>
      <div className="dsh-suggested-replies-dock" data-suggested-replies-dock="">
        <div className="dsh-suggested-replies-header">
          <button
            type="button"
            className="dsh-suggested-replies-header-btn"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={t('title')}
          >
            <span className={`dsh-suggested-replies-chevron${collapsed ? ' dsh-suggested-replies-chevron-collapsed' : ''}`}>▼</span>
            {t('title')}
          </button>
          <div className="dsh-suggested-replies-actions">
            <button
              type="button"
              className="dsh-suggested-replies-regenerate"
              disabled={disabled}
              title={t('regenerate')}
              aria-label={t('regenerate')}
              onClick={() => void rpc.call('/suggested-replies', 'suggestions.generate', { sessionId })}
            >
              ✨
            </button>
          </div>
        </div>
        {!collapsed && showBubbles && (
          <div className="dsh-suggested-replies-list">
            {state.suggestions.map((text, index) => (
              <button
                key={`${state.turn}-${index}`}
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
        )}
      </div>
    </div>
  )
}
