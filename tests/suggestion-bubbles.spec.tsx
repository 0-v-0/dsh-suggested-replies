/** @vitest-environment jsdom */
/** Interaction and RPC lifecycle tests for SuggestionActions (assistant-actions slot). */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { SuggestionActions, type SuggestionActionsProps } from '../src/client/SuggestionActions.tsx'
import { SuggestionBubbles } from '../src/client/SuggestionBubbles.tsx'
import type { SuggestedRepliesStateResponse } from '../src/rpc.ts'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

const generating = (revision = 1, turn = 1, messageId = 'msg-1'): SuggestedRepliesStateResponse => ({
  lifecycle: { createdAt: 1, cwd: '/work' },
  revision,
  turn,
  messageId,
  phase: 'generating',
  suggestions: [],
})

const ready = (
  suggestions: readonly string[],
  revision = 2,
  turn = 1,
  messageId = 'msg-1',
): SuggestedRepliesStateResponse => ({
  lifecycle: { createdAt: 1, cwd: '/work' },
  revision,
  turn,
  messageId,
  phase: 'ready',
  suggestions,
})

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

/** Build the complete assistant-actions slot prop face. */
function props(rpc: ClientConnectionRpc, messageId = 'msg-1', sessionId = 'session-1') {
  return {
    rpc,
    messageId,
    sessionId,
    t: (key: string) => ({ title: '回复建议', hint: '点击填入输入框', loading: '正在生成回复建议...', regenerate: '重新生成建议' })[key] ?? key,
  } as unknown as SuggestionActionsProps
}

function rpcReturning(initial: SuggestedRepliesStateResponse) {
  const watch = deferred<{ ok: true; value: SuggestedRepliesStateResponse }>()
  let nextWatch = watch.promise
  const call = vi.fn((
    _channel: string,
    endpoint: string,
    _payload: unknown,
    _signal?: AbortSignal,
  ) => {
    if (endpoint === 'state.get') return Promise.resolve({ ok: true, value: initial })
    if (endpoint === 'config.get') return Promise.resolve({ ok: true, value: { displayMode: 'latest' } })
    if (endpoint === 'draft.get') return Promise.resolve({ ok: true, value: { draft: null } })
    if (endpoint === 'dock.setCollapsed') return Promise.resolve({ ok: true, value: { ok: true } })
    if (endpoint === 'suggestions.generate') return Promise.resolve({ ok: true, value: { ok: true } })
    const response = nextWatch
    nextWatch = new Promise(() => {})
    return response
  })
  return { rpc: { call } as unknown as ClientConnectionRpc, call, watch }
}

describe('SuggestionActions', () => {
  it('renders nothing while generating, then shows bubbles when ready', async () => {
    const kit = rpcReturning(generating(4, 7))
    const component = props(kit.rpc, 'msg-1', 'session-a')
    const { container, getByRole } = render(<SuggestionActions {...component} />)

    // While generating: hidden
    await waitFor(() => expect(kit.call).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')

    // After ready: bubbles appear
    await act(async () => kit.watch.resolve({ ok: true, value: ready(['继续实现'], 5, 7, 'msg-1') }))
    expect(await waitFor(() => getByRole('button', { name: '继续实现' }))).toBeDefined()
  })

  it('renders nothing when messageId does not match state', async () => {
    const kit = rpcReturning(ready(['继续实现'], 2, 1, 'other-msg'))
    const { container } = render(<SuggestionActions {...props(kit.rpc, 'msg-1', 'session-a')} />)
    await waitFor(() => expect(kit.call).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('clicks use cached setDraft from hidden dock', async () => {
    // Mount hidden dock first to publish setDraft
    const setDraft = vi.fn()
    const submit = vi.fn()
    render(<SuggestionBubbles {...{
      rpc: {} as never,
      sessionId: 'session-a',
      useInput: (s: (state: { phase: string }) => unknown) => s({ phase: 'plain' }),
      inputActions: { setDraft, submit, addImages: () => true, removeImage: () => undefined, pruneImages: () => undefined },
      t: () => '',
    } as never} />)

    const kit = rpcReturning(ready(['继续实现', '运行测试']))
    const { getByRole } = render(<SuggestionActions {...props(kit.rpc, 'msg-1', 'session-1')} />)

    fireEvent.click(await waitFor(() => getByRole('button', { name: '继续实现' })))
    expect(setDraft).toHaveBeenCalledWith('继续实现')
    expect(submit).not.toHaveBeenCalled()
  })

  it('aborts the active watch on unmount', async () => {
    const kit = rpcReturning(ready(['继续实现'], 6, 1, 'msg-1'))
    const { unmount } = render(<SuggestionActions {...props(kit.rpc, 'msg-1', 'session-1')} />)
    await waitFor(() => expect(kit.call).toHaveBeenCalled())
    // Find the state.watch signal
    const watchCall = kit.call.mock.calls.find((c: unknown[]) => c[1] === 'state.watch')
    const signal = watchCall?.[3] as AbortSignal | undefined
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('keeps one style tag for multiple mounts and removes it after the last unmount', () => {
    const kit = rpcReturning(ready(['a']))
    const first = render(<SuggestionActions {...props(kit.rpc, 'msg-1', 'first')} />)
    const second = render(<SuggestionActions {...props(kit.rpc, 'msg-2', 'second')} />)
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('inline-flex')
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('dsh-sr-toggle')
    first.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    second.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(0)
  })
})
