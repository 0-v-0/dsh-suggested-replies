/**
 * Transcript redaction, suggestion cleaning, and semantic output filtering.
 *
 * Nothing that reaches the model carries secret-shaped text, and nothing the
 * model returns can inject terminal control into the web composer or read as
 * meta-text instead of a real next prompt. Pure functions, exported for
 * direct unit coverage.
 *
 * Ported from the studyzy/dsh-suggest-prompt project (MIT licensed).
 *
 * @module @anionex/dsh-suggested-replies/sanitize
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options controlling structural cleaning of one model output candidate. */
export interface CleanSuggestionOptions {
  /** Strip ANSI/OSC/CSI escape sequences. */
  readonly stripEscapes: boolean
  /** Strip C0/C1 control chars, bidi override marks, and lone surrogates. */
  readonly stripControls: boolean
  /** Strip code fences and surrounding paired quotes. */
  readonly stripFencesAndQuotes: boolean
  /** Collapse every whitespace run to a single space. */
  readonly collapseWhitespace: boolean
  /** Force the result to a single line by replacing newlines with spaces. */
  readonly singleLine: boolean
  /** Maximum retained characters for one candidate (applied after cleaning). */
  readonly maxSuggestionChars: number
}

/** Options controlling semantic filtering of cleaned model output. */
export interface FilterOptions {
  /** Filter meta-text like "no suggestion" or "stay silent". */
  readonly filterMetaText: boolean
  /** Filter error echoes like "api error:" or "error:". */
  readonly filterErrorEcho: boolean
  /** Filter evaluative phrases like "thanks", "looks good". */
  readonly filterEvaluative: boolean
  /** Filter assistant-voice phrases like "let me…", "我来…". */
  readonly filterAssistantVoice: boolean
  /** Filter multi-sentence candidates. */
  readonly filterMultiSentence: boolean
  /** Filter candidates that are too long (>12 English words or ≥100 bytes). */
  readonly filterTooLong: boolean
  /** Allow single-word whitelist entries and slash commands. */
  readonly allowSingleCommands: boolean
  /** Filter residual formatting (newlines, asterisks). */
  readonly filterFormatting: boolean
  /** Maximum retained characters for one candidate. */
  readonly maxSuggestionChars: number
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

/** One secret-shaped pattern and its replacement label. */
interface SecretPattern {
  readonly pattern: RegExp
  readonly label: string
}

/**
 * Common credential shapes masked before the transcript reaches the model.
 * Patterns are applied sequentially so a later pattern sees the output of an
 * earlier one.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  // AWS access key ids.
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: '<aws_access_key>' },
  // OpenAI-style sk- tokens (20+ alphanumeric characters after sk-).
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g, label: '<openai_api_key>' },
  // GitHub fine-grained and classic tokens (gho_, ghs_, ghu_, ghp_).
  { pattern: /\bgh[opsu]_[a-zA-Z0-9]{36}\b/g, label: '<github_token>' },
  // Slack tokens (xoxb-, xoxp-, xoxo-, xoxa-).
  { pattern: /\bxox[bpoa]-[a-zA-Z0-9-]+\b/g, label: '<slack_token>' },
  // Compact JWTs (three dot-separated base64url segments starting with eyJ).
  { pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, label: '<jwt_token>' },
  // Generic API keys (rk_ prefix).
  { pattern: /\brk_[a-zA-Z0-9]+\b/g, label: '<api_key>' },
  // Bearer tokens (replaced with a redacted placeholder, not a label).
  { pattern: /\b[Bb]earer\s+[a-zA-Z0-9_.-]+/g, label: 'Bearer [REDACTED_SECRET]' },
]

/**
 * Mask secret-shaped substrings so the auxiliary model never receives them.
 * Uses a single function that applies all redactions sequentially.
 * @param text - transcript text that may contain credentials.
 * @returns the same text with every matched secret replaced by a label.
 */
export function redactSecrets(text: string): string {
  let out = text
  for (const { pattern, label } of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, label)
  }
  return out
}

// ---------------------------------------------------------------------------
// Suggestion cleaning
// ---------------------------------------------------------------------------

/** CSI escape sequences: `ESC[` followed by parameters and a final byte. */
// oxlint-disable-next-line no-control-regex
const CSI_ESCAPE = /\x1B\[[0-9;]*[a-zA-Z]/g
/** OSC escape sequences: `ESC]` ... terminated by BEL (0x07). */
// oxlint-disable-next-line no-control-regex
const OSC_ESCAPE = /\x1B\][^\x07]*\x07/g
/** Character set designation: `ESC(` followed by one of AB012. */
// oxlint-disable-next-line no-control-regex
const CHARSET_ESCAPE = /\x1B[()][AB012]/g

/** C0 controls (0x00-0x1F) except tab/newline/CR; C1 controls (0x7F-0x9F). */
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g
/** Bidi override marks: U+202A–U+202E and U+2066–U+2069. */
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g
/** Lone surrogate code units (unpaired high or low surrogates). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Triple-backtick code fence surrounding the whole text. */
const BACKTICK_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/
/** Triple-tilde code fence surrounding the whole text. */
const TILDE_FENCE = /^~~~\s*\n([\s\S]*?)\n~~~\s*$/

/** Surrounding paired quotes: straight double, straight single, CJK corner, curly double. */
const PAIRED_QUOTES: readonly RegExp[] = [
  /^"([\s\S]*)"$/,
  /^'([\s\S]*)'$/,
  /^\u300C([\s\S]*)\u300D$/,
  /^\u201C([\s\S]*)\u201D$/,
]

/**
 * Structurally clean one raw model output candidate into composer-safe text.
 *
 * Each cleaning step is individually controlled by the options so callers can
 * tune the pipeline. The result is trimmed but not truncated; the caller is
 * responsible for applying `maxSuggestionChars` after filtering.
 * @param text - raw model output.
 * @param options - per-step cleaning toggles.
 * @returns the cleaned text.
 */
export function cleanSuggestion(text: string, options: CleanSuggestionOptions): string {
  let value = text

  if (options.stripEscapes) {
    value = value
      .replace(CSI_ESCAPE, '')
      .replace(OSC_ESCAPE, '')
      .replace(CHARSET_ESCAPE, '')
  }

  if (options.stripControls) {
    value = value
      .replace(CONTROL_CHARS, '')
      .replace(BIDI_OVERRIDES, '')
      .replace(LONE_SURROGATE, '')
  }

  if (options.stripFencesAndQuotes) {
    value = value.trim()
    const backtick = BACKTICK_FENCE.exec(value)
    if (backtick !== null && backtick[1] !== undefined) value = backtick[1]
    const tilde = TILDE_FENCE.exec(value)
    if (tilde !== null && tilde[1] !== undefined) value = tilde[1]
    value = value.trim()
    for (const quote of PAIRED_QUOTES) {
      const match = quote.exec(value)
      if (match !== null && match[1] !== undefined) {
        value = match[1]
        break
      }
    }
  }

  if (options.collapseWhitespace) {
    value = value.replace(/\s+/g, ' ')
  }

  if (options.singleLine) {
    value = value.replace(/\n/g, ' ')
  }

  return value.trim()
}

// ---------------------------------------------------------------------------
// Semantic filtering
// ---------------------------------------------------------------------------

/** Meta-text the model might emit instead of a suggestion ("no suggestion", "stay silent"). */
const META_TEXT_PATTERNS: readonly RegExp[] = [
  /no suggestion/i,
  /stay silent/i,
  /无建议/,
  /没有建议/,
  /^\s*none\s*$/i,
  /^\s*n\/a\s*$/i,
]

/** Error echo patterns the model might pass through. */
const ERROR_ECHO_PATTERNS: readonly RegExp[] = [
  /^api error:/i,
  /^error:/i,
  /错误:/,
  /请求失败/,
]

/** Evaluative filler the model should never offer as a next prompt. */
const EVALUATIVE_PATTERN = /\b(thanks|thank you|looks good|great|perfect)\b|谢谢|不错|很好|完美|好的/i

/** Assistant-voice phrasing: the suggestion must read as the USER typing. */
const ASSISTANT_VOICE_PATTERN = /^(let me|i'll|i will|i can|我来|我会|我可以|让我)/i

/** Residual formatting: newlines or markdown emphasis asterisks. */
const FORMATTING_PATTERN = /[\n*]/

/** Single-word commands that are valid next prompts when allowSingleCommands is true. */
const ALLOWED_SINGLE_COMMANDS: ReadonlySet<string> = new Set([
  'yes', 'ok', 'no', 'sure',
  '继续', '提交', '取消', '好', '是', '否',
])

/**
 * Report whether `text` contains a CJK unified ideograph.
 * @param text - inspected text.
 * @returns true when any code point falls in the CJK unified ideographs range.
 */
function hasCJK(text: string): boolean {
  return /[\u4e00-\u9fff]/u.test(text)
}

/**
 * Compute the UTF-8 byte length of a string.
 * @param text - the string to measure.
 * @returns the number of UTF-8 bytes.
 */
function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Reject cleaned model output that is not a usable next prompt.
 *
 * Returns `true` when the candidate should be dropped silently (not displayed).
 * When `allowSingleCommands` is true and the text matches a known single-word
 * command or starts with `/`, it is allowed regardless of other checks.
 * @param text - cleaned, single-line model output.
 * @param options - per-check filter toggles.
 * @returns true when the suggestion should be filtered out.
 */
export function shouldFilterSuggestion(text: string, options: FilterOptions): boolean {
  const value = text.trim()
  if (value === '') return true

  const lower = value.toLowerCase()

  // Allow known single-word commands and slash commands before any other check.
  if (options.allowSingleCommands) {
    if (lower.startsWith('/')) return false
    if (ALLOWED_SINGLE_COMMANDS.has(lower)) return false
  }

  if (options.filterMetaText) {
    for (const pattern of META_TEXT_PATTERNS) {
      if (pattern.test(value)) return true
    }
  }

  if (options.filterErrorEcho) {
    for (const pattern of ERROR_ECHO_PATTERNS) {
      if (pattern.test(value)) return true
    }
  }

  if (options.filterEvaluative) {
    if (EVALUATIVE_PATTERN.test(value)) return true
  }

  if (options.filterAssistantVoice) {
    if (ASSISTANT_VOICE_PATTERN.test(value)) return true
  }

  if (options.filterMultiSentence) {
    const asciiBoundaries = (value.match(/[.!?]\s+[A-Z]/g) ?? []).length
    if (asciiBoundaries >= 2) return true
    const cjkPeriods = (value.match(/。/g) ?? []).length
    if (cjkPeriods >= 2) return true
  }

  if (options.filterFormatting) {
    if (FORMATTING_PATTERN.test(value)) return true
  }

  if (options.filterTooLong) {
    const wordCount = value.split(/\s+/).filter(Boolean).length
    if (!hasCJK(value) && wordCount > 12) return true
    if (byteLength(value) >= 100) return true
  }

  return false
}
