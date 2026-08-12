/**
 * Durable event and projection types for suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/types
 */

/** One candidate that can be copied into the user's next message draft. */
export type SuggestedReply = string

/** User-editable settings stored under the `suggested-replies` namespace. */
export interface SuggestedRepliesSettings {
  /** Whether completed turns may trigger an auxiliary candidate-generation call. */
  enabled: boolean
}

/** Provider/model route used by one auxiliary candidate-generation call. */
export interface SuggestedRepliesRoute {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
}

/** Payload appended before an auxiliary candidate-generation call starts. */
export interface SuggestedRepliesGeneratingPayload {
  /** The completed turn that supplied the candidate context. */
  turn: number
  /** Route selected from the latest logged request header or Agent defaults. */
  route: SuggestedRepliesRoute
  /** Complete system instruction sent through the provider's system slot. */
  system: string
  /** Complete user-role prompt containing the recent conversation context. */
  prompt: string
  /** Maximum output tokens requested from the auxiliary model. */
  maxTokens: number
}

/** Payload containing every candidate generated for one completed turn. */
export interface SuggestedRepliesPayload {
  /** The completed turn that supplied the candidate context. */
  turn: number
  /** Candidate messages in display order. */
  suggestions: SuggestedReply[]
}

/** Why an active candidate row was explicitly removed before the next turn starts. */
export type SuggestedRepliesClearReason = 'new-input' | 'disabled'

/** Payload for an explicit candidate-row clear. */
export interface SuggestedRepliesClearedPayload {
  /** The lifecycle change that invalidated the current candidates. */
  reason: SuggestedRepliesClearReason
}

/** Current candidate-generation state made available to Web clients. */
export interface SuggestedRepliesState {
  /** The completed turn that supplied the candidate context. */
  turn: number
  /** Whether the auxiliary model call is still running. */
  generating: boolean
  /** Ready candidate messages, or an empty list while loading or after failure. */
  suggestions: SuggestedReply[]
}

/** Projection value before generation or after the row has been cleared. */
export type SuggestedRepliesProjection = SuggestedRepliesState | null

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /**
     * Records every model-visible input of an auxiliary generation for a
     * completed turn. This event is not part of the conversation surface.
     *
     * @param turn - completed turn that supplied the context.
     * @param route - provider and model used by the detached call.
     * @param system - full auxiliary system instruction.
     * @param prompt - full auxiliary user prompt.
     * @param maxTokens - detached-call output token cap.
     * @mode append
     */
    'suggested-replies/generating': SuggestedRepliesGeneratingPayload

    /**
     * Stores candidate next user messages for a completed turn. This event is
     * not model-visible and therefore never changes the agent request history.
     *
     * @param turn - completed turn that supplied the context.
     * @param suggestions - candidate next messages in display order.
     * @mode append
     */
    'suggested-replies/suggestions': SuggestedRepliesPayload

    /**
     * Removes candidates invalidated by new input or a disabled setting. This
     * event is not model-visible.
     *
     * @param reason - lifecycle change that invalidated the candidates.
     * @mode append
     */
    'suggested-replies/cleared': SuggestedRepliesClearedPayload
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** The active suggested-replies state for the session, if any. */
    suggestedReplies: SuggestedRepliesProjection
  }
}
