// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SuggestedRepliesSection } from '../src/client/SuggestedRepliesSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('SuggestedRepliesSection', () => {
  it('shows a concise explanation before the only required switch', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ ok: true, value: { enabled: true } }) }
    render(<SuggestedRepliesSection rpc={rpc as never} t={(key: keyof typeof zh) => zh[key]} />)
    const title = await screen.findByRole('heading', { name: '下一步建议' })
    const toggle = screen.getByRole('switch', { name: '启用下一步建议' })
    expect(title.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.getByText('点击建议只会把文字填入输入框，由你确认后发送，不会自动发出消息。')).toBeTruthy()
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })
})
