// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { SuggestedRepliesSection } from '../src/client/SuggestedRepliesSection.tsx'
import { zh } from '../src/client/locales.ts'
import type { ConfigResponse } from '../src/rpc.ts'

afterEach(cleanup)

const fullConfig: ConfigResponse = {
  suggestionCount: 3,
  reasoningEffort: 'off',
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
  it('renders heading and config fields after loading config', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: fullConfig }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    const title = await screen.findByRole('heading', { name: '回复建议' })
    expect(title).toBeDefined()
    // suggestion count number input
    const numInput = screen.getByDisplayValue('3')
    expect(numInput).toBeDefined()
    expect((numInput as HTMLInputElement).type).toBe('number')
    expect((numInput as HTMLInputElement).min).toBe('0')
    expect((numInput as HTMLInputElement).max).toBe('6')
  })

  it('renders all toggle switches and selects after config loads', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: fullConfig }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    await screen.findByRole('heading', { name: '回复建议' })
    // 8 config toggles (no master switch)
    expect(screen.getAllByRole('switch')).toHaveLength(8)
    // One select: reasoningEffort
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
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

  it('shows disabled note when suggestionCount is 0', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: { ...fullConfig, suggestionCount: 0 } }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    await screen.findByRole('heading', { name: '回复建议' })
    expect(screen.getByText('已关闭（数量为 0）')).toBeDefined()
  })

  it('sends config.set with suggestionCount on number input change', async () => {
    const rpc = {
      call: vi.fn().mockImplementation((_channel: string, endpoint: string) => {
        if (endpoint === 'config.get') return Promise.resolve({ ok: true, value: fullConfig })
        if (endpoint === 'config.set') return Promise.resolve({ ok: true, value: { ...fullConfig, suggestionCount: 5 } })
        return Promise.resolve({ ok: true })
      }),
    }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    await screen.findByRole('heading', { name: '回复建议' })
    const numInput = screen.getByDisplayValue('3')
    fireEvent.change(numInput, { target: { value: '5' } })
    expect(rpc.call).toHaveBeenCalledWith('/suggested-replies', 'config.set', { suggestionCount: 5 })
  })
})
