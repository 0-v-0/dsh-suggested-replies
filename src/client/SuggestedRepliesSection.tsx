/**
 * Settings section for the suggested-replies master switch and editable config.
 *
 * @module @anionex/dsh-suggested-replies/client/SuggestedRepliesSection
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigResponse, ConfigSetPayload } from '../rpc.ts'

/** Session-independent injected connection face. */
export interface SuggestedRepliesSectionInjected {
  readonly rpc: ClientConnectionRpc
}

type SuggestedRepliesSectionProps =
  & PropsRuntime<'settings.section'>
  & PropsLocale<'suggested-replies'>
  & SuggestedRepliesSectionInjected

type ConfigResult = RpcResult<ConfigResponse>

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }
const introStyle: CSSProperties = {
  padding: '14px 16px', borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))',
}
const titleStyle: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.4 }
const descriptionStyle: CSSProperties = { margin: '4px 0 0', fontSize: 12, lineHeight: 1.55, opacity: 0.65 }
const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 24, padding: '14px 16px',
  border: '1px solid rgba(128, 128, 128, 0.22)', borderRadius: 12,
}
const noteStyle: CSSProperties = {
  marginTop: 14, padding: '10px 12px', borderRadius: 8,
  background: 'rgba(128, 128, 128, 0.12)', fontSize: 13, lineHeight: 1.6,
}
const errorStyle: CSSProperties = {
  marginBottom: 8, padding: '10px 12px', borderRadius: 8,
  background: 'rgba(192, 64, 64, 0.12)', fontSize: 13,
}
const groupStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 0,
  border: '1px solid rgba(128, 128, 128, 0.22)', borderRadius: 12, overflow: 'hidden',
}
const groupHeaderStyle: CSSProperties = {
  margin: 0, padding: '10px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
  background: 'rgba(128, 128, 128, 0.10)', borderBottom: '1px solid rgba(128, 128, 128, 0.22)',
}
const toggleRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 16, padding: '12px 16px',
  borderBottom: '1px solid rgba(128, 128, 128, 0.14)',
}
const toggleLabelStyle: CSSProperties = { fontSize: 14, lineHeight: 1.4 }
const toggleDescStyle: CSSProperties = { fontSize: 12, lineHeight: 1.55, opacity: 0.62, marginTop: 2 }
const selectStyle: CSSProperties = {
  flex: '0 0 auto', padding: '6px 10px', fontSize: 13,
  border: '1px solid rgba(128, 128, 128, 0.3)', borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'inherit',
}

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
        position: 'relative', flex: '0 0 auto', width: 44, height: 26, padding: 0,
        border: 0, borderRadius: 13,
        background: on ? '#2f6fed' : 'rgba(128, 128, 128, 0.35)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span aria-hidden="true" style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', transition: 'left 160ms ease',
      }} />
    </button>
  )
}

function ToggleRow({ label, desc, value, disabled, onChange }: {
  readonly label: string
  readonly desc: string
  readonly value: boolean
  readonly disabled: boolean
  readonly onChange: () => void
}) {
  return (
    <div style={toggleRowStyle}>
      <div>
        <div style={toggleLabelStyle}>{label}</div>
        <div style={toggleDescStyle}>{desc}</div>
      </div>
      <Toggle on={value} label={label} disabled={disabled} onToggle={onChange} />
    </div>
  )
}

function ConfigGroup({ title, children }: {
  readonly title: string
  readonly children: readonly React.ReactNode[]
}) {
  return (
    <div style={groupStyle}>
      <h3 style={groupHeaderStyle}>{title}</h3>
      {children}
    </div>
  )
}

export function SuggestedRepliesSection({ rpc, t }: SuggestedRepliesSectionProps) {
  const [config, setConfig] = useState<ConfigResponse | undefined>()
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const result = await rpc.call('/suggested-replies', 'config.get', {}) as ConfigResult
        if (!mounted) return
        if (result.ok) {
          setConfig(result.value)
        } else {
          setError(result.error.message)
        }
      } catch (cause) {
        if (!mounted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { mounted = false }
  }, [rpc])

  const patch = useCallback(async (p: ConfigSetPayload): Promise<void> => {
    setWriting(true)
    setError(undefined)
    try {
      const result = await rpc.call('/suggested-replies', 'config.set', p) as ConfigResult
      if (result.ok) setConfig(result.value)
      else setError(result.error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setWriting(false)
    }
  }, [rpc])

  if (config === undefined) return <section style={sectionStyle}>{t('loading')}</section>

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
        <Toggle
          on={config.enabled}
          label={t('settings.enabled.label')}
          disabled={writing}
          onToggle={() => void patch({ enabled: !config.enabled })}
        />
      </div>
      {!config.enabled && <div style={noteStyle}>{t('settings.disabled.note')}</div>}

      <ConfigGroup title={t('settings.generation.title')}>
        <div style={toggleRowStyle}>
          <div>
            <div style={toggleLabelStyle}>{t('settings.reasoningEffort.label')}</div>
            <div style={toggleDescStyle}>{t('settings.reasoningEffort.description')}</div>
          </div>
          <select
            style={selectStyle}
            disabled={writing}
            value={config.reasoningEffort}
            onChange={e => void patch({ reasoningEffort: e.target.value })}
          >
            <option value="off">{t('settings.reasoningEffort.off')}</option>
            <option value="auto">{t('settings.reasoningEffort.auto')}</option>
          </select>
        </div>
        <div style={toggleRowStyle}>
          <div>
            <div style={toggleLabelStyle}>{t('settings.suggestionCount.label')}</div>
            <div style={toggleDescStyle}>{t('settings.suggestionCount.description')}</div>
          </div>
          <select
            style={selectStyle}
            disabled={writing}
            value={config.suggestionCount}
            onChange={e => void patch({ suggestionCount: Number(e.target.value) })}
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </div>
      </ConfigGroup>

      <ConfigGroup title={t('settings.sanitize.title')}>
        <ToggleRow
          label={t('settings.redactSecrets.label')}
          desc={t('settings.redactSecrets.description')}
          value={config.redactSecrets}
          disabled={writing}
          onChange={() => void patch({ redactSecrets: !config.redactSecrets })}
        />
        <ToggleRow
          label={t('settings.stripControls.label')}
          desc={t('settings.stripControls.description')}
          value={config.stripControls}
          disabled={writing}
          onChange={() => void patch({ stripControls: !config.stripControls })}
        />
        <ToggleRow
          label={t('settings.singleLine.label')}
          desc={t('settings.singleLine.description')}
          value={config.singleLine}
          disabled={writing}
          onChange={() => void patch({ singleLine: !config.singleLine })}
        />
      </ConfigGroup>

      <ConfigGroup title={t('settings.filter.title')}>
        <ToggleRow
          label={t('settings.filterMetaText.label')}
          desc={t('settings.filterMetaText.description')}
          value={config.filterMetaText}
          disabled={writing}
          onChange={() => void patch({ filterMetaText: !config.filterMetaText })}
        />
        <ToggleRow
          label={t('settings.filterEvaluative.label')}
          desc={t('settings.filterEvaluative.description')}
          value={config.filterEvaluative}
          disabled={writing}
          onChange={() => void patch({ filterEvaluative: !config.filterEvaluative })}
        />
        <ToggleRow
          label={t('settings.filterAssistantVoice.label')}
          desc={t('settings.filterAssistantVoice.description')}
          value={config.filterAssistantVoice}
          disabled={writing}
          onChange={() => void patch({ filterAssistantVoice: !config.filterAssistantVoice })}
        />
        <ToggleRow
          label={t('settings.filterTooLong.label')}
          desc={t('settings.filterTooLong.description')}
          value={config.filterTooLong}
          disabled={writing}
          onChange={() => void patch({ filterTooLong: !config.filterTooLong })}
        />
      </ConfigGroup>

      <ConfigGroup title={t('settings.manual.title')}>
        <ToggleRow
          label={t('settings.manualReplacesDraft.label')}
          desc={t('settings.manualReplacesDraft.description')}
          value={config.manualReplacesDraft}
          disabled={writing}
          onChange={() => void patch({ manualReplacesDraft: !config.manualReplacesDraft })}
        />
      </ConfigGroup>
    </section>
  )
}
