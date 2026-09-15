/**
 * Settings section for the suggested-replies master switch and informational
 * deployment-config overview.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestedRepliesSection
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsResponse } from '../rpc.ts'
import type { SuggestedRepliesKey } from './locales.ts'

/** Session-independent injected connection face. */
export interface SuggestedRepliesSectionInjected {
  /** RPC handle used to load and write the master switch. */
  readonly rpc: ClientConnectionRpc
}

type SuggestedRepliesSectionProps =
  & PropsRuntime<'settings.section'>
  & PropsLocale<'suggested-replies'>
  & SuggestedRepliesSectionInjected

type SettingsResult = RpcResult<SettingsResponse>

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }
const introStyle: CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))',
}
const titleStyle: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.4 }
const descriptionStyle: CSSProperties = { margin: '4px 0 0', fontSize: 12, lineHeight: 1.55, opacity: 0.65 }
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 24,
  padding: '14px 16px',
  border: '1px solid rgba(128, 128, 128, 0.22)',
  borderRadius: 12,
}
const noteStyle: CSSProperties = {
  marginTop: 14,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(128, 128, 128, 0.12)',
  fontSize: 13,
  lineHeight: 1.6,
}
const errorStyle: CSSProperties = {
  marginBottom: 8,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(192, 64, 64, 0.12)',
  fontSize: 13,
}
const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  border: '1px solid rgba(128, 128, 128, 0.22)',
  borderRadius: 12,
  overflow: 'hidden',
}
const groupHeaderStyle: CSSProperties = {
  margin: 0,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.02em',
  background: 'rgba(128, 128, 128, 0.10)',
  borderBottom: '1px solid rgba(128, 128, 128, 0.22)',
}
const infoRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '12px 16px',
  borderBottom: '1px solid rgba(128, 128, 128, 0.14)',
}
const infoLabelStyle: CSSProperties = { fontSize: 14, lineHeight: 1.4 }
const infoDescStyle: CSSProperties = { fontSize: 12, lineHeight: 1.55, opacity: 0.62 }

/** Accessible switch with host-theme-neutral styling. */
function Toggle({ on, label, disabled, onToggle }: {
  readonly on: boolean
  readonly label: string
  readonly disabled: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 44,
        height: 26,
        padding: 0,
        border: 0,
        borderRadius: 13,
        background: on ? '#2f6fed' : 'rgba(128, 128, 128, 0.35)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  )
}

/** One read-only informational row: a label plus a muted description. */
function InfoRow({ labelKey, descKey, t }: {
  readonly labelKey: SuggestedRepliesKey
  readonly descKey: SuggestedRepliesKey
  readonly t: (key: SuggestedRepliesKey) => string
}) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{t(labelKey)}</div>
      <div style={infoDescStyle}>{t(descKey)}</div>
    </div>
  )
}

/** A titled group of read-only informational rows. */
function ConfigGroup({ titleKey, items, t }: {
  readonly titleKey: SuggestedRepliesKey
  readonly items: ReadonlyArray<readonly [SuggestedRepliesKey, SuggestedRepliesKey]>
  readonly t: (key: SuggestedRepliesKey) => string
}) {
  return (
    <div style={groupStyle}>
      <h3 style={groupHeaderStyle}>{t(titleKey)}</h3>
      {items.map(([labelKey, descKey]) => (
        <InfoRow key={labelKey} labelKey={labelKey} descKey={descKey} t={t} />
      ))}
    </div>
  )
}

/** Render, persist the master enable switch, and show deployment-config overview. */
export function SuggestedRepliesSection({ rpc, t }: SuggestedRepliesSectionProps) {
  const [enabled, setEnabled] = useState<boolean | undefined>()
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const result = await rpc.call('/suggested-replies', 'settings.get', {}) as SettingsResult
        if (!mounted) return
        if (result.ok) {
          setEnabled(result.value.enabled)
        } else {
          setEnabled(true)
          setError(result.error.message)
        }
      } catch (cause) {
        if (!mounted) return
        setEnabled(true)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { mounted = false }
  }, [rpc])

  const toggle = async (): Promise<void> => {
    if (enabled === undefined || writing) return
    setWriting(true)
    setError(undefined)
    try {
      const result = await rpc.call('/suggested-replies', 'settings.set', { enabled: !enabled }) as SettingsResult
      if (result.ok) setEnabled(result.value.enabled)
      else setError(result.error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setWriting(false)
    }
  }

  if (enabled === undefined) return <section style={sectionStyle}>{t('loading')}</section>

  return (
    <section style={sectionStyle}>
      {error !== undefined && <div style={errorStyle} role="alert">{error}</div>}
      <header style={introStyle}>
        <h2 style={titleStyle}>{t('settings.title')}</h2>
        <p style={descriptionStyle}>{t('settings.description')}</p>
      </header>
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: 15, lineHeight: 1.4 }}>{t('settings.enabled.label')}</div>
          <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.5, opacity: 0.62 }}>{t('settings.enabled.description')}</div>
        </div>
        <Toggle on={enabled} label={t('settings.enabled.label')} disabled={writing} onToggle={() => void toggle()} />
      </div>
      {!enabled && <div style={noteStyle}>{t('settings.disabled.note')}</div>}
      <ConfigGroup
        titleKey="settings.generation.title"
        t={t}
        items={[
          ['settings.reasoningEffort.label', 'settings.reasoningEffort.description'],
          ['settings.suggestionCount.label', 'settings.suggestionCount.description'],
        ]}
      />
      <ConfigGroup
        titleKey="settings.sanitize.title"
        t={t}
        items={[
          ['settings.redactSecrets.label', 'settings.redactSecrets.description'],
          ['settings.stripControls.label', 'settings.stripControls.description'],
          ['settings.singleLine.label', 'settings.singleLine.description'],
        ]}
      />
      <ConfigGroup
        titleKey="settings.filter.title"
        t={t}
        items={[
          ['settings.filterMetaText.label', 'settings.filterMetaText.description'],
          ['settings.filterEvaluative.label', 'settings.filterEvaluative.description'],
          ['settings.filterAssistantVoice.label', 'settings.filterAssistantVoice.description'],
          ['settings.filterTooLong.label', 'settings.filterTooLong.description'],
        ]}
      />
      <ConfigGroup
        titleKey="settings.manual.title"
        t={t}
        items={[
          ['settings.manualShortcut.label', 'settings.manualShortcut.description'],
          ['settings.manualReplacesDraft.label', 'settings.manualReplacesDraft.description'],
        ]}
      />
      <div style={noteStyle}>{t('settings.config.note')}</div>
    </section>
  )
}
