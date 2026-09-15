/**
 * Assistant-actions slot entry: renders suggestion bubbles below the latest
 * finalized assistant message. Gets `setDraft` from a module-level cache
 * populated by the hidden dock component.
 *
 * Layout: a compact icon toggle button sits inline in the MessageIconActions
 * row (28×28, matching other action buttons). When expanded, an absolutely
 * positioned dropdown drops straight down below the button — it does not
 * push siblings or affect the row layout. The dropdown scrolls internally
 * when content exceeds its max-height.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestionActions
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SuggestedRepliesStateResponse } from '../rpc.ts'

/** Module-level cache for setDraft, populated by the hidden dock component. */
let cachedSetDraft: ((text: string) => void) | undefined

/** Called by the hidden dock component to publish its inputActions.setDraft. */
export function publishSetDraft(fn: ((text: string) => void) | undefined): void {
  cachedSetDraft = fn
}

/** Connection capability injected by the browser plugin registration. */
export interface SuggestionActionsInjected {
  readonly rpc: ClientConnectionRpc
}

/** Full prop currency supplied by the `conversation.chat.assistant-actions` slot. */
export type SuggestionActionsProps =
  & PropsRuntime<'conversation.chat.assistant-actions'>
  & PropsLocale<'suggested-replies'>
  & SuggestionActionsInjected

type StateResult = RpcResult<SuggestedRepliesStateResponse>

interface ObservedState {
  readonly messageId: string
  readonly value: SuggestedRepliesStateResponse
}

const STYLE_TAG_ID = 'dsh-suggested-replies-style'
const COLLAPSE_KEY = 'dsh-suggested-replies-collapsed'
let styleUsers = 0

const CSS_TEXT = `
.dsh-sr-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.dsh-sr-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: 28px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  transition: background 80ms ease, color 80ms ease;
}
.dsh-sr-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.10));
  color: var(--dsw-alias-label-secondary, #494e58);
}
.dsh-sr-toggle svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px));
  height: calc(15px + var(--dsh-content-font-delta, 0px));
}
.dsh-sr-toggle[data-active="true"] {
  color: var(--dsw-alias-state-business-primary, #2f6fed);
}
.dsh-sr-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 6px;
  border: 0;
  border-radius: 20px;
  background: var(--dsw-specific-menu, #ffffff);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, #d8dce2);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, #a2a4a6);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, #7f8287);
  box-shadow: var(--dsw-elevation-prominent, 0 -4px 12px rgba(0, 0, 0, 0.08));
}
.dsh-sr-dropdown-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.dsh-sr-dropdown-title {
  flex: 1;
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #68707d);
  white-space: nowrap;
}
.dsh-sr-regen {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
.dsh-sr-regen:hover {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  color: var(--dsw-alias-state-business-primary, #2f6fed);
}
.dsh-sr-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-sr-bubble {
  box-sizing: border-box;
  overflow: hidden;
  padding: 5px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 8px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 120ms ease, background 120ms ease;
}
.dsh-sr-bubble:hover {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  background: var(--dsw-alias-interactive-bg-hover, rgba(47, 111, 237, 0.12));
}
`

const wrapStyle: CSSProperties = { position: 'relative', display: 'inline-flex', alignItems: 'center' }

function loadCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function saveCollapsed(v: boolean): void {
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

export function SuggestionActions({ rpc, messageId, sessionId, t }: SuggestionActionsProps) {
  const [observed, setObserved] = useState<ObservedState | undefined>()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click outside the dropdown to collapse
  useEffect(() => {
    if (collapsed) return
    const onPointerDown = (event: MouseEvent): void => {
      const el = wrapRef.current
      if (el !== null && el !== undefined && !el.contains(event.target as Node)) {
        setCollapsed(true)
        saveCollapsed(true)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [collapsed])
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const publish = (value: SuggestedRepliesStateResponse): void => {
      if (!signal.aborted) setObserved({ messageId, value })
    }
    const clear = (): void => {
      if (signal.aborted) return
      setObserved(current => current?.messageId === messageId ? undefined : current)
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
  }, [rpc, sessionId, messageId])

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

  const state = observed !== undefined && observed.messageId === messageId
    ? observed.value
    : undefined

  // Lazy-load: when expanded and no suggestions exist, trigger generation
  const lazyState = state
  useEffect(() => {
    if (lazyState === undefined) return
    if (collapsed) return
    if (lazyState.phase === 'generating') return
    if (lazyState.suggestions.length > 0) return
    // Only trigger if this messageId matches the state's messageId
    if (lazyState.messageId !== null && lazyState.messageId !== messageId) return
    void rpc.call('/suggested-replies', 'suggestions.generate', { sessionId })
  }, [rpc, sessionId, collapsed, lazyState, messageId])

  if (state === undefined || state.phase === 'generating') return null

  // Only render if this is the message the suggestions belong to
  if (state.messageId !== null && state.messageId !== messageId) return null

  const showBubbles = state.suggestions.length > 0
  const toggleCollapsed = (): void => {
    const next = !collapsed
    setCollapsed(next)
    saveCollapsed(next)
  }

  return (
    <div ref={wrapRef} className="dsh-sr-wrap" style={wrapStyle}>
      <button
        type="button"
        className="dsh-sr-toggle"
        data-active={!collapsed}
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        title={t('title')}
        aria-label={t('title')}
      >
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="5.5" cy="7" r="0.7" fill="currentColor" />
          <circle cx="8" cy="7" r="0.7" fill="currentColor" />
          <circle cx="10.5" cy="7" r="0.7" fill="currentColor" />
        </svg>
      </button>
      {!collapsed && (
        <div className="dsh-sr-dropdown">
          <div className="dsh-sr-dropdown-header">
            <span className="dsh-sr-dropdown-title">{t('title')}</span>
            <button
              type="button"
              className="dsh-sr-regen"
              title={t('regenerate')}
              aria-label={t('regenerate')}
              onClick={() => void rpc.call('/suggested-replies', 'suggestions.generate', { sessionId })}
            >
              ✨
            </button>
          </div>
          {showBubbles && (
            <div className="dsh-sr-list">
              {state.suggestions.map((text, index) => (
                <button
                  key={`${state.turn}-${index}`}
                  type="button"
                  className="dsh-sr-bubble"
                  title={t('hint')}
                  onClick={() => { if (cachedSetDraft !== undefined) cachedSetDraft(text) }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
