/**
 * Persistence and freshness core: row schema invariants, sidecar mutations,
 * identity fencing, waiter wake-up, and operation serialization.
 *
 * The storage-domain package is a host-injected peer, so it is replaced with a
 * pass-through stub before the module under test is loaded.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-storage-domain', () => ({
  defineDomain: (spec: unknown) => spec,
  domainTable: (schema: unknown) => ({ schema }),
}))

import { SuggestedRepliesStateStore, suggestedRepliesRowSchema } from '../src/state.ts'

/** Minimal host context: session registry, persistence lookup, logger, effects. */
function makeCtx() {
  const sessions = new Map<string, { id: string; header: { id: string; createdAt: number; cwd?: string } }>()
  const warn = vi.fn()
  const ctx = {
    logger: { warn },
    sessions: {
      get: (id: string) => sessions.get(String(id)),
      flush: vi.fn(async () => true),
    },
    sessionPersistence: {
      inspect: vi.fn(async (id: string) => {
        const session = sessions.get(String(id))
        if (session === undefined) throw new Error(`unknown session ${String(id)}`)
        return { meta: session.header }
      }),
    },
    effect: vi.fn(),
  }
  return { ctx, sessions, warn }
}

/** One parent Session: an id plus the lifecycle header it is fenced to. */
function makeSession(id: string, createdAt = 1) {
  const header = { id, createdAt }
  return { id, header }
}

/** Flush every pending microtask so a parked watcher has registered its listeners. */
async function tick(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

describe('suggestedRepliesRowSchema', () => {
  const base = { session: { createdAt: 1 }, revision: 1, turn: 0 }

  it('requires generationSessionId while generating', () => {
    const result = suggestedRepliesRowSchema.safeParse({ ...base, phase: 'generating', suggestions: [] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['generationSessionId'])
  })

  it('forbids generationSessionId outside the generating phase', () => {
    const result = suggestedRepliesRowSchema.safeParse({ ...base, phase: 'cleared', suggestions: [], generationSessionId: 'gen-1' })
    expect(result.success).toBe(false)
  })

  it('forbids suggestions outside the ready phase', () => {
    const result = suggestedRepliesRowSchema.safeParse({ ...base, phase: 'cleared', suggestions: ['继续实现'] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['suggestions'])
  })

  it('defaults messageId to null and accepts a ready row', () => {
    const result = suggestedRepliesRowSchema.safeParse({ ...base, phase: 'ready', suggestions: ['继续实现'] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.messageId).toBeNull()
  })
})

describe('SuggestedRepliesStateStore', () => {
  it('returns an empty cleared snapshot before any row exists', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)

    const snapshot = await store.get('s-1')

    expect(snapshot.revision).toBe(0)
    expect(snapshot.turn).toBeNull()
    expect(snapshot.messageId).toBeNull()
    expect(snapshot.phase).toBe('cleared')
    expect(snapshot.suggestions).toEqual([])
  })

  it('stores a loading row carrying the assistant message anchor', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)

    const started = await store.setGenerating(session, 4, 'msg-9', 'gen-1', () => true)

    expect(started).toBe(true)
    const snapshot = await store.get('s-1')
    expect(snapshot.revision).toBe(1)
    expect(snapshot.turn).toBe(4)
    expect(snapshot.messageId).toBe('msg-9')
    expect(snapshot.phase).toBe('generating')
  })

  it('commits candidates only over the exact generation row that produced them', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 4, 'msg-9', 'gen-1', () => true)

    expect(await store.setReady(session, 4, 'msg-9', 'gen-1', ['继续实现'], () => true)).toBe(true)
    const ready = await store.get('s-1')
    expect(ready.revision).toBe(2)
    expect(ready.phase).toBe('ready')
    expect(ready.suggestions).toEqual(['继续实现'])
  })

  it('rejects stale commits for a superseded turn, generation, or revoked lease', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 4, 'msg-9', 'gen-1', () => true)

    expect(await store.setReady(session, 5, 'msg-9', 'gen-1', ['too late'], () => true)).toBe(false)
    expect(await store.setReady(session, 4, 'msg-9', 'gen-2', ['wrong run'], () => true)).toBe(false)
    expect(await store.setReady(session, 4, 'msg-9', 'gen-1', ['aborted'], () => false)).toBe(false)

    const snapshot = await store.get('s-1')
    expect(snapshot.phase).toBe('generating')
    expect(snapshot.revision).toBe(1)
  })

  it('clears a row while preserving its turn and message anchor', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 4, 'msg-9', 'gen-1', () => true)

    expect(await store.clearGeneration(session, 'gen-1')).toBe(true)
    const snapshot = await store.get('s-1')
    expect(snapshot.revision).toBe(2)
    expect(snapshot.turn).toBe(4)
    expect(snapshot.messageId).toBe('msg-9')
    expect(snapshot.phase).toBe('cleared')
    expect(snapshot.suggestions).toEqual([])

    // A second clear is a no-op, and a stale generation id never rewrites the row.
    expect(await store.clear(session, false)).toBe(false)
    expect(await store.clearGeneration(session, 'gen-1')).toBe(false)
    expect((await store.get('s-1')).revision).toBe(2)
  })

  it('ignores rows whose stored lifecycle no longer matches the header', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1', 1)
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 1, 'msg-1', 'gen-1', () => true)

    // Recycled Session id: same id, new createdAt. The stored row is fenced out.
    const recycled = makeSession('s-1', 2)
    sessions.set('s-1', recycled)

    const snapshot = await store.get('s-1')
    expect(snapshot.revision).toBe(0)
    expect(snapshot.phase).toBe('cleared')
    expect(snapshot.messageId).toBeNull()

    expect(await store.clear(recycled, false)).toBe(false)
    expect(await store.clearGeneration(recycled, 'gen-1')).toBe(false)
  })

  it('serializes concurrent operations for one Session in issue order', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)

    await Promise.all([
      store.setGenerating(session, 1, 'msg-1', 'gen-1', () => true),
      store.setGenerating(session, 2, 'msg-2', 'gen-2', () => true),
      store.setGenerating(session, 3, 'msg-3', 'gen-3', () => true),
    ])

    const snapshot = await store.get('s-1')
    expect(snapshot.revision).toBe(3)
    expect(snapshot.turn).toBe(3)
    expect(snapshot.messageId).toBe('msg-3')
  })

  it('clears every non-cleared row across Sessions', async () => {
    const { ctx, sessions } = makeCtx()
    const first = makeSession('s-1')
    const second = makeSession('s-2')
    sessions.set('s-1', first)
    sessions.set('s-2', second)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(first, 1, 'msg-1', 'gen-1', () => true)
    await store.setReady(first, 1, 'msg-1', 'gen-1', ['继续实现'], () => true)
    await store.setGenerating(second, 1, 'msg-2', 'gen-2', () => true)
    await store.clear(second, false)

    await store.clearAll()

    expect((await store.get('s-1')).phase).toBe('cleared')
    expect((await store.get('s-1')).suggestions).toEqual([])
    // s-2 was already cleared by the explicit call, so clearAll must not rewrite it.
    expect((await store.get('s-2')).revision).toBe(2)
  })

  it('wakes parked watchers when the row revision changes', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 1, 'msg-1', 'gen-1', () => true)

    const watch = store.watch('s-1', { createdAt: 1 }, 1, new AbortController().signal)
    await tick()
    await store.setReady(session, 1, 'msg-1', 'gen-1', ['继续实现'], () => true)

    const snapshot = await watch
    expect(snapshot.revision).toBe(2)
    expect(snapshot.phase).toBe('ready')
    expect(snapshot.suggestions).toEqual(['继续实现'])
  })

  it('rejects new operations and wakes waiters after close', async () => {
    const { ctx, sessions } = makeCtx()
    const session = makeSession('s-1')
    sessions.set('s-1', session)
    const store = SuggestedRepliesStateStore.inMemory(ctx)
    await store.setGenerating(session, 1, 'msg-1', 'gen-1', () => true)

    const watch = store.watch('s-1', { createdAt: 1 }, 1, new AbortController().signal)
    await tick()
    await store.close()

    await expect(store.setGenerating(session, 1, 'msg-1', 'gen-2', () => true)).rejects.toThrow(/disposing/)
    await expect(watch).rejects.toThrow(/disposed/)
  })
})
