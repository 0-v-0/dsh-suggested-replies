/**
 * Session projection for the currently useful suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/projection
 */

import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  SuggestedRepliesGeneratingPayload,
  SuggestedRepliesPayload,
  SuggestedRepliesProjection,
} from './types.ts'

/** Minimal value schema required by the projection registry. */
const schema = {
  parse(value: unknown): unknown {
    return value
  },
} as never

/**
 * Fold suggested-replies events into the client-facing state.
 * @param state - current projected state.
 * @param event - newly committed session event.
 * @returns updated state, preserving identity for unrelated events.
 */
export function foldSuggestedReplies(
  state: SuggestedRepliesProjection,
  event: SessionEvent,
): SuggestedRepliesProjection {
  if (event.type === 'suggested-replies/generating') {
    const payload = event.data as SuggestedRepliesGeneratingPayload
    return { turn: payload.turn, generating: true, suggestions: [] }
  }
  if (event.type === 'suggested-replies/suggestions') {
    const payload = event.data as SuggestedRepliesPayload
    return { turn: payload.turn, generating: false, suggestions: payload.suggestions }
  }
  if (event.type === 'suggested-replies/cleared' || event.type === 'turn/start') return null
  return state
}

/**
 * Register the projection when the session-projection capability is composed.
 * @param ctx - plugin host context.
 */
export function registerSuggestedRepliesProjection(ctx: Context): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'suggestedReplies', SuggestedRepliesProjection>({
      key: 'suggestedReplies',
      schema,
      init: () => null,
      apply: foldSuggestedReplies,
      view: state => state,
      stateVersion: 1,
    })
  })
}
