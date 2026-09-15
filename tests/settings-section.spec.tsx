// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SuggestedRepliesSection } from '../src/client/SuggestedRepliesSection.tsx'
import { zh } from '../src/client/locales.ts'
import type { ConfigResponse } from '../src/rpc.ts'

afterEach(cleanup)

const fullConfig: ConfigResponse = {
  enabled: true,
  reasoningEffort: 'off',
  suggestionCount: 3,
  redactSecrets: true,
  stripControls: true,
  singleLine: true,
  filterMetaText: true,
  filterEvaluative: true,
  filterAssistantVoice: true,
  filterTooLong: true,
  manualShortcut: 'Mod+Shift+Space',
  manualReplacesDraft: true,
}

describe('SuggestedRepliesSection', () => {
  it('renders heading and master switch after loading config', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: fullConfig }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    const title = await screen.findByRole('heading', { name: '回复建议' })
    const toggle = screen.getByRole('switch', { name: '启用回复建议' })
    expect(title.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.getByText('点击建议只会把文字填入输入框，由你确认后发送，不会自动发出消息。')).toBeTruthy()
  })

  it('renders all toggle switches and selects after config loads', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: fullConfig }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    await screen.findByRole('heading', { name: '回复建议' })
    // Master switch + 8 config toggles = 9 total
    expect(screen.getAllByRole('switch')).toHaveLength(9)
    // Two selects: reasoningEffort + suggestionCount
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })

  it('sends config.set on toggle change', async () => {
    const rpc = {
      call: vi.fn().mockImplementation((_channel: string, endpoint: string) => {
        if (endpoint === 'config.get') return Promise.resolve({ ok: true, value: fullConfig })
        if (endpoint === 'config.set') return Promise.resolve({ ok: true, value: { ...fullConfig, redactSecrets: false } })
        return Promise.resolve({ ok: true })
      }),
    }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    await screen.findByRole('heading', { name: '回复建议' })
    const redactToggle = screen.getByRole('switch', { name: '掩蔽密钥' })
    redactToggle.click()
    expect(rpc.call).toHaveBeenCalledWith('/suggested-replies', 'config.set', { redactSecrets: false })
  })
})
