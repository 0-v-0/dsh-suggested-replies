/** Tests for transcript redaction, output cleaning, and semantic filtering. */
import { describe, expect, it } from 'vitest'
import {
  cleanSuggestion,
  redactSecrets,
  shouldFilterSuggestion,
  type CleanSuggestionOptions,
  type FilterOptions,
} from '../src/sanitize.ts'

const cleanOpts: CleanSuggestionOptions = {
  stripEscapes: true,
  stripControls: true,
  stripFencesAndQuotes: true,
  collapseWhitespace: true,
  singleLine: true,
  maxSuggestionChars: 160,
}

const filterOpts: FilterOptions = {
  filterMetaText: true,
  filterErrorEcho: true,
  filterEvaluative: true,
  filterAssistantVoice: true,
  filterMultiSentence: true,
  filterTooLong: true,
  allowSingleCommands: true,
  filterFormatting: true,
  maxSuggestionChars: 160,
}

describe('redactSecrets', () => {
  it('masks AWS access keys', () => {
    expect(redactSecrets('key=AKIAIOSFODNN7EXAMPLE')).toBe('key=<aws_access_key>')
  })

  it('masks OpenAI-style keys', () => {
    expect(redactSecrets('token=sk-abcdefghijklmnopqrstuvwxyz1234567890')).toBe('token=<openai_api_key>')
  })

  it('masks GitHub tokens', () => {
    expect(redactSecrets('ghp_1234567890abcdefghijklmnopqrstuvwxyz12345')).toBe('<github_token>')
    expect(redactSecrets('gho_1234567890abcdefghijklmnopqrstuvwxyz12345')).toBe('<github_token>')
    expect(redactSecrets('ghs_1234567890abcdefghijklmnopqrstuvwxyz12345')).toBe('<github_token>')
  })

  it('masks Slack tokens', () => {
    expect(redactSecrets('xoxb-1234567890-abcdef')).toBe('<slack_token>')
    expect(redactSecrets('xoxp-1234567890-abcdef')).toBe('<slack_token>')
  })

  it('masks Bearer tokens', () => {
    const result = redactSecrets('Authorization: Bearer abc123def456')
    expect(result).toBe('Authorization: Bearer [REDACTED_SECRET]')
  })

  it('leaves normal text unchanged', () => {
    expect(redactSecrets('Hello, how are you?')).toBe('Hello, how are you?')
  })

  it('masks multiple secrets in one string', () => {
    const result = redactSecrets('AWS=AKIAIOSFODNN7EXAMPLE and key=sk-abcdefghijklmnopqrstuvwxyz1234567890')
    expect(result).toContain('<aws_access_key>')
    expect(result).toContain('<openai_api_key>')
  })
})

describe('cleanSuggestion', () => {
  it('strips ANSI escape sequences', () => {
    const result = cleanSuggestion('\x1B[31mRed text\x1B[0m', cleanOpts)
    expect(result).toBe('Red text')
  })

  it('strips code fences', () => {
    const result = cleanSuggestion('```json\n{"suggestions":["hello"]}\n```', cleanOpts)
    expect(result).toBe('{"suggestions":["hello"]}')
  })

  it('strips surrounding quotes', () => {
    expect(cleanSuggestion('"hello world"', cleanOpts)).toBe('hello world')
    expect(cleanSuggestion('「你好」', cleanOpts)).toBe('你好')
  })

  it('collapses whitespace to single line', () => {
    expect(cleanSuggestion('hello\nworld', cleanOpts)).toBe('hello world')
    expect(cleanSuggestion('hello   world', cleanOpts)).toBe('hello world')
  })

  it('does not truncate in cleanSuggestion (truncation is in processSuggestion)', () => {
    const opts = { ...cleanOpts, maxSuggestionChars: 5 }
    expect(cleanSuggestion('hello world', opts)).toBe('hello world')
  })

  it('strips control characters and bidi overrides', () => {
    const result = cleanSuggestion('hello\u202Eworld', cleanOpts)
    expect(result).toBe('helloworld')
  })

  it('returns empty string for all-control input', () => {
    expect(cleanSuggestion('\x1B[0m\x1B[0m', cleanOpts)).toBe('')
  })
})

describe('shouldFilterSuggestion', () => {
  it('filters meta-text', () => {
    expect(shouldFilterSuggestion('no suggestion', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('无建议', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('stay silent', filterOpts)).toBe(true)
  })

  it('filters error echoes', () => {
    expect(shouldFilterSuggestion('api error: timeout', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('error: invalid response', filterOpts)).toBe(true)
  })

  it('filters evaluative phrases', () => {
    expect(shouldFilterSuggestion('thanks for the help', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('looks good to me', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('不错', filterOpts)).toBe(true)
  })

  it('filters assistant voice', () => {
    expect(shouldFilterSuggestion('Let me help you with that', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('我来帮你处理', filterOpts)).toBe(true)
  })

  it('filters overly long suggestions', () => {
    const long = 'this is a very long suggestion that exceeds the twelve word limit by quite a bit'
    expect(shouldFilterSuggestion(long, filterOpts)).toBe(true)
  })

  it('allows single-word whitelist commands', () => {
    expect(shouldFilterSuggestion('继续', filterOpts)).toBe(false)
    expect(shouldFilterSuggestion('ok', filterOpts)).toBe(false)
    expect(shouldFilterSuggestion('yes', filterOpts)).toBe(false)
  })

  it('allows slash commands', () => {
    expect(shouldFilterSuggestion('/help', filterOpts)).toBe(false)
    expect(shouldFilterSuggestion('/run tests', filterOpts)).toBe(false)
  })

  it('allows normal suggestions', () => {
    expect(shouldFilterSuggestion('Run the tests', filterOpts)).toBe(false)
    expect(shouldFilterSuggestion('请详细说明', filterOpts)).toBe(false)
  })

  it('filters residual formatting', () => {
    expect(shouldFilterSuggestion('hello\nworld', filterOpts)).toBe(true)
    expect(shouldFilterSuggestion('*italic text*', filterOpts)).toBe(true)
  })
})
