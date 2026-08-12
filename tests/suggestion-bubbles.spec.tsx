/** @vitest-environment jsdom */
/** Interaction tests for draft-only candidate bubbles. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SuggestionBubbles, type SuggestionBubblesProps } from '../src/client/SuggestionBubbles.tsx'
import type { SuggestedRepliesProjection } from '../src/types.ts'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

/** Build the complete slot prop face around one projection and input phase. */
function props(projection: SuggestedRepliesProjection | undefined, phase = 'plain') {
  const setDraft = vi.fn()
  const submit = vi.fn()
  const value: SuggestionBubblesProps = {
    useProjection: () => projection,
    useInput: selector => selector({ phase } as never),
    inputActions: { setDraft, submit, addImages: () => true, removeImage: () => undefined, pruneImages: () => undefined },
    t: key => ({ title: '下一步建议', hint: '点击填入输入框', loading: '生成中' })[key as 'title' | 'hint' | 'loading'] ?? key,
  } as SuggestionBubblesProps
  return { value, setDraft, submit }
}

describe('SuggestionBubbles', () => {
  it('renders nothing without projected state', () => {
    const { container } = render(<SuggestionBubbles {...props(null).value} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a loading row in the input dock', () => {
    const { getByRole, container } = render(<SuggestionBubbles {...props({ turn: 1, generating: true, suggestions: [] }).value} />)
    expect(getByRole('status').textContent).toBe('生成中')
    expect(container.querySelector('[data-suggested-replies-dock]')).not.toBeNull()
  })

  it('clicks only setDraft and never submits', () => {
    const kit = props({ turn: 1, generating: false, suggestions: ['继续实现', '运行测试'] })
    const { getByRole } = render(<SuggestionBubbles {...kit.value} />)
    fireEvent.click(getByRole('button', { name: '继续实现' }))
    expect(kit.setDraft).toHaveBeenCalledWith('继续实现')
    expect(kit.submit).not.toHaveBeenCalled()
  })

  it('disables candidate clicks outside the plain input phase', () => {
    const kit = props({ turn: 1, generating: false, suggestions: ['继续实现'] }, 'submitting')
    const { getByRole } = render(<SuggestionBubbles {...kit.value} />)
    const button = getByRole('button', { name: '继续实现' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(kit.setDraft).not.toHaveBeenCalled()
  })

  it('keeps one style tag for multiple mounts and removes it after the last unmount', () => {
    const first = render(<SuggestionBubbles {...props({ turn: 1, generating: false, suggestions: ['a'] }).value} />)
    const second = render(<SuggestionBubbles {...props({ turn: 2, generating: false, suggestions: ['b'] }).value} />)
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('flex-wrap: nowrap')
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('overflow-x: auto')
    first.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    second.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(0)
  })
})
