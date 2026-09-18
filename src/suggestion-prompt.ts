/**
 * Prompt construction and strict JSON parsing for suggested replies.
 *
 * @module @anionex/dsh-suggested-replies/suggestion-prompt
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import { hasCJK, truncateToCodePoints } from './sanitize.ts'
import type { SuggestedReply } from './types.ts'

/** Runtime-controlled limits that affect prompt wording and response parsing. */
export interface SuggestionOutputLimits {
  /** Number of candidates the model must return. */
  readonly suggestionCount: number
  /** Maximum characters retained for each ready candidate. */
  readonly maxSuggestionChars: number
}

/**
 * Build the system instruction for one auxiliary next-message prediction call.
 * @param limits - resolved output cardinality and per-candidate text bound.
 * @returns the complete model instruction.
 */
export function buildSuggestionSystemPrompt(limits: SuggestionOutputLimits): string {
  return [
    'You predict the next message a user is likely to send after an AI reply.',
    `Return exactly ${String(limits.suggestionCount)} candidate messages.`,
    'Follow the language used in the recent conversation, preferably its latest user and assistant messages.',
    'Every candidate must be a natural message the user can send directly, with no prefix, quote, explanation, or numbering.',
    'Keep candidates specific, concise, and meaningfully different. Prefer a practical next action, a verification or follow-up question, or a decision or choice when the conversation supports it.',
    `Keep every candidate at most ${String(limits.maxSuggestionChars)} characters.`,
    'Do not invent completed work, decisions, files, results, or facts that are not supported by the conversation.',
    `Return only valid JSON in this exact form: {"suggestions":[${Array.from({ length: limits.suggestionCount }, () => '"..."').join(',')}]}.`,
  ].join('\n')
}

/**
 * Build the conversation prompt supplied beside the system instruction.
 *
 * Candidate prediction is useful only after a visible assistant answer. A
 * context containing no assistant text therefore returns `null` rather than
 * spending an auxiliary model call on an unfinished or tool-only turn.
 * @param messages - recent model-visible conversation messages, oldest first.
 * @returns serialized conversation context, or `null` when no assistant text is available.
 */
export function buildSuggestedRepliesUserPrompt(messages: readonly Message[]): string | null {
  const lines: string[] = []
  let hasAssistantText = false
  let lastTextRole: Message['role'] | undefined

  for (const message of messages) {
    const text = extractPlainText(message)
    if (text === '') continue
    if (message.role === 'assistant') hasAssistantText = true
    lastTextRole = message.role
    lines.push(`${message.role === 'assistant' ? 'Assistant' : 'User'}: ${text}`)
  }

  if (!hasAssistantText || lastTextRole !== 'assistant') return null
  return ['Recent conversation:', ...lines, '', 'Predict the user\'s next message.'].join('\n')
}

/**
 * Parse one model response into candidate messages.
 *
 * A single outer Markdown code fence is accepted defensively, but every other
 * non-JSON response is rejected. The candidate count is a ceiling rather than
 * an exact match: a model that returns two valid candidates when three were
 * requested still yields two bubbles, which is better than discarding a real
 * response in favour of the generic fallback pool.
 * @param raw - model text accumulated from the stream.
 * @param limits - resolved output cardinality and per-candidate text bound.
 * @returns ready candidates, or `null` when the response is unusable.
 */
export function parseSuggestedReplies(
  raw: string,
  limits: SuggestionOutputLimits,
): SuggestedReply[] | null {
  if (limits.suggestionCount <= 0 || limits.maxSuggestionChars <= 0) return null
  const stripped = stripCodeFence(raw.trim())
  if (stripped === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const suggestions = (parsed as { suggestions?: unknown }).suggestions
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null

  const output: SuggestedReply[] = []
  const seen = new Set<string>()
  for (const suggestion of suggestions.slice(0, limits.suggestionCount)) {
    if (typeof suggestion !== 'string') return null
    const bounded = truncateToCodePoints(normalizeCandidate(suggestion), limits.maxSuggestionChars).trim()
    if (bounded === '') return null
    const identity = bounded.toLowerCase()
    if (seen.has(identity)) return null
    seen.add(identity)
    output.push(bounded)
  }
  return output.length > 0 ? output : null
}

/** Deterministic fallback pool, one entry per supported slot count. */
const FALLBACK_EN = [
  'Continue',
  'Could you explain that in more detail?',
  'Can you give me a concrete example?',
  'What should I do next?',
  'Please show me the trade-offs',
  'Are there any risks I should know about?',
] as const

const FALLBACK_ZH = [
  '继续',
  '请详细说明一下',
  '给我一个具体例子',
  '接下来建议做什么？',
  '有哪些需要权衡的地方？',
  '有什么风险需要注意吗？',
] as const

/**
 * Produce a bounded deterministic fallback when the auxiliary model does not
 * return the required JSON. The fallback follows the recent conversation's
 * language and preserves the configured candidate count.
 */
export function fallbackSuggestedReplies(
  conversation: string,
  limits: SuggestionOutputLimits,
): SuggestedReply[] {
  const candidates = hasCJK(conversation) ? FALLBACK_ZH : FALLBACK_EN
  return candidates.slice(0, limits.suggestionCount).map((candidate) =>
    truncateToCodePoints(normalizeCandidate(candidate), limits.maxSuggestionChars).trim() as SuggestedReply)
}

/** Flatten text blocks only; tool calls, tool results, images, and reasoning stay out of the prompt. */
function extractPlainText(message: Message): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return normalizeCandidate(parts.join('\n'))
}

/** Normalize whitespace so candidates fit a single compact bubble without changing their words. */
function normalizeCandidate(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Remove one outer Markdown fence that a model supplied despite the JSON-only instruction. */
function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text)
  return match?.[1] ?? text
}
