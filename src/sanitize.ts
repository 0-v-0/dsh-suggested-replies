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
 * earlier one. Specific shapes run before the generic keyed-assignment rule so
 * an informative label (`<openai_api_key>`) survives instead of being flattened
 * to `<redacted>`; the keyed rule still keeps the key name, so the transcript
 * tells the model *what* the user was configuring.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  // Private key blocks (PEM, including RSA/EC/DSA/OPENSSH). Structural, so it
  // runs before any character-level rule can touch the boundary lines. The
  // closing label accepts the short forms as well as `PRIVATE KEY`, because
  // the transcript is whitespace-normalized before redaction runs and a model
  // may shorten a block header when paraphrasing.
  {
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]*PRIVATE )?KEY-----/g,
    label: '<private_key>',
  },
  // AWS access key ids.
  { pattern: /\bAKIA[0-9A-Z]{16,}\b/g, label: '<aws_access_key>' },
  // OpenAI-style sk- tokens (20+ alphanumeric characters after sk-).
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g, label: '<openai_api_key>' },
  // GitHub fine-grained and classic tokens (gho_, ghs_, ghu_, ghp_, github_pat_).
  { pattern: /\bgh[opsu]_[a-zA-Z0-9]{36,}\b/g, label: '<github_token>' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, label: '<github_token>' },
  // Slack tokens (xoxb-, xoxp-, xoxo-, xoxa-).
  { pattern: /\bxox[bpoa]-[a-zA-Z0-9-]+\b/g, label: '<slack_token>' },
  // Stripe publishable/secret keys in both `sk_live_` and `sk_test_` form.
  { pattern: /\b[psr]k_(?:live|test|view|prod|dev)_[A-Za-z0-9]{8,}\b/g, label: '<stripe_key>' },
  // Google API keys (AIza + 33 base64url characters).
  { pattern: /\bAIza[0-9A-Za-z\-_]{33}\b/g, label: '<google_api_key>' },
  // GitLab personal/project access tokens (glpat-, glptt-).
  { pattern: /\bgl(?:pat|ptt)-[0-9A-Za-z_\-]{12,}\b/g, label: '<gitlab_token>' },
  // Compact JWTs (three dot-separated base64url segments starting with eyJ).
  { pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, label: '<jwt_token>' },
  // Generic API keys (rk_ prefix).
  { pattern: /\brk_[a-zA-Z0-9]+\b/g, label: '<api_key>' },
  // Bearer tokens (replaced with a redacted placeholder, not a label).
  { pattern: /\b[Bb]earer\s+[a-zA-Z0-9_.-]+/g, label: 'Bearer [REDACTED_SECRET]' },
  // Last resort: a keyed credential assignment whose value has no known shape.
  // The key name is matched as a tail (`..._key`, `..._token`, `..._secret`,
  // `pwd`, `passwd`, `apikey`), which keeps prose like "the key is here" or
  // "config: myvalue12345" untouched while still catching aws_secret_access_key
  // and auth-token. The key name is preserved in the output so the transcript
  // keeps telling the model what the user was configuring.
  {
    pattern: /(?<key>[A-Za-z0-9_.-]*?(?:[_-]?(?:secret|key|token|password|passwd|pwd)|apikey))\s*[:=]\s*["']?[A-Za-z0-9_\-+\/=]{8,}["']?/gi,
    label: '$<key>: <redacted>',
  },
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
/**
 * Invisible format characters that let displayed text differ from sent text:
 * zero-width space, directional embedding/override marks, direction LRM/RLM,
 * line/paragraph separators, word joiner, invisible math operators, bidi
 * isolates, and the script-level invisible marks used in RTL and CJK text.
 *
 * U+200C (ZWNJ) and U+200D (ZWJ) are deliberately kept: they are load-bearing
 * for correct shaping of Arabic and Hebrew and for multi-code-point emoji, so
 * stripping them would corrupt real user text.
 */
const INVISIBLE_CHARS = /[\u061C\u0EAA\u115F\u1160\u180E\u200B\u200E-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFF9-\uFFFB]/g
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

/** Toggles for the escape/control passes shared by transcript and candidate. */
export interface StripOptions {
  /** Strip ANSI/OSC/CSI escape sequences. */
  readonly stripEscapes: boolean
  /** Strip C0/C1 control chars, invisible format characters, and lone surrogates. */
  readonly stripControls: boolean
}

/**
 * Apply the terminal-injection and invisible-character passes.
 *
 * Shared by the transcript path and the candidate path so the two can never
 * diverge on which bytes are unsafe to ship to the model or to the composer.
 * @param text - input text.
 * @param options - which passes to apply.
 * @returns the input with the selected unsafe characters removed.
 */
export function stripUnsafeCharacters(text: string, options: StripOptions): string {
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
      .replace(INVISIBLE_CHARS, '')
      .replace(LONE_SURROGATE, '')
  }
  return value
}

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
  let value = stripUnsafeCharacters(text, options)

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
 * Report whether `text` contains a CJK ideograph (Unified + Extension A).
 *
 * Exported so the word-count check and the fallback-language detection agree on
 * what counts as CJK; two divergent ranges here misclassify CJK extension-A text.
 * @param text - inspected text.
 * @returns true when any code point falls in the CJK ideograph ranges.
 */
export function hasCJK(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text)
}

/**
 * Compute the UTF-8 byte length of a string.
 * @param text - the string to measure.
 * @returns the number of UTF-8 bytes.
 */
export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** UTF-8 on-the-wire size of one code point. */
function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/**
 * Truncate to at most `max` code points.
 *
 * `String.slice` counts UTF-16 code units, so cutting in the middle of an
 * astral pair leaves a lone surrogate that reappears in the composer and in
 * later model turns. This walks whole code points instead.
 * @param text - input text.
 * @param max - maximum retained code points.
 * @returns the truncated text, with no lone surrogate at the cut.
 */
export function truncateToCodePoints(text: string, max: number): string {
  if (max <= 0) return ''
  if (max >= text.length) return text
  let count = 0
  let end = 0
  for (let i = 0; i < text.length; ) {
    if (count >= max) break
    const codePoint = text.codePointAt(i)
    if (codePoint === undefined) break
    i += codePoint > 0xffff ? 2 : 1
    end = i
    count += 1
  }
  return text.slice(0, end)
}

/**
 * Truncate to at most `max` UTF-8 bytes, on a code point boundary.
 *
 * The auxiliary call has a byte budget that the character budget cannot express
 * for multi-byte text; a 60,000-character CJK transcript is roughly 180 KB.
 * @param text - input text.
 * @param max - maximum retained UTF-8 bytes.
 * @returns the truncated text, with no lone surrogate at the cut.
 */
export function truncateToUtf8Bytes(text: string, max: number): string {
  if (max <= 0) return ''
  if (byteLength(text) <= max) return text
  let bytes = 0
  let end = 0
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i)
    if (codePoint === undefined) break
    bytes += utf8Bytes(codePoint)
    if (bytes > max) break
    i += codePoint > 0xffff ? 2 : 1
    end = i
  }
  return text.slice(0, end)
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
