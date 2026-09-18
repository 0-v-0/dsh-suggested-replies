/** Tests for transcript framing, budget enforcement, and candidate processing. */
import { describe, expect, it } from 'vitest'
import { openaiApiKey } from './helpers/secrets.ts'
import {
  processSuggestion,
  processSuggestions,
  sanitizeTranscript,
  type GeneratePipelineConfig,
} from '../src/generate.ts'
import { byteLength } from '../src/sanitize.ts'

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const pipeline: GeneratePipelineConfig = {
  reasoningEffort: 'off',
  maxInputBytes: 4096,
  maxRecentTurns: 1,
  maxTranscriptChars: 12_000,
  excludeNonHumanEvents: true,
  redactSecrets: true,
  maxSuggestionChars: 160,
  stripEscapes: true,
  stripControls: true,
  stripFencesAndQuotes: true,
  collapseWhitespace: true,
  singleLine: true,
  filterMetaText: true,
  filterErrorEcho: true,
  filterEvaluative: true,
  filterAssistantVoice: true,
  filterMultiSentence: true,
  filterTooLong: true,
  allowSingleCommands: true,
  filterFormatting: true,
}

const relaxedFiltering: GeneratePipelineConfig = {
  ...pipeline,
  filterMetaText: false,
  filterErrorEcho: false,
  filterEvaluative: false,
  filterAssistantVoice: false,
  filterMultiSentence: false,
  filterTooLong: false,
  filterFormatting: false,
}

describe('sanitizeTranscript', () => {
  it('masks secret-shaped text from the transcript', () => {
    const secret = openaiApiKey()
    const transcript = `User: my api_key=${secret}\nAssistant: done`
    const result = sanitizeTranscript(transcript, pipeline)
    expect(result).toContain('<openai_api_key>')
    expect(result).not.toContain(secret)
  })

  it('stops masking when redactSecrets is disabled', () => {
    const transcript = `api_key=${openaiApiKey()}`
    expect(sanitizeTranscript(transcript, { ...pipeline, redactSecrets: false })).toBe(transcript)
  })

  it('always strips terminal and invisible characters from the transcript', () => {
    // The transcript is the outbound privacy boundary, so the candidate-side
    // stripEscapes/stripControls toggles must not let a user opt out of it.
    const disabled = { ...pipeline, stripEscapes: false, stripControls: false }
    expect(sanitizeTranscript('\x1B[31mRed\x1B[0m\x07\u200B\u202E', disabled)).toBe('Red')
    expect(sanitizeTranscript('\x1B[31mRed\x1B[0m\x07\u200B\u202E', pipeline)).toBe('Red')
  })

  it('enforces the character budget on a code point boundary', () => {
    const config = { ...pipeline, maxTranscriptChars: 5, maxInputBytes: 1 << 20 }
    // 5 ASCII characters plus one astral code point: the 5-code-point bound
    // drops the emoji instead of splitting it across UTF-16 code units.
    expect(sanitizeTranscript('xxxxx💥', config)).toBe('xxxxx')
  })

  it('enforces the UTF-8 byte budget that characters cannot express', () => {
    // Each 你 is 3 UTF-8 bytes, so 21 characters is 63 bytes.
    const transcript = '你'.repeat(21)
    const config = { ...pipeline, maxTranscriptChars: 10_000, maxInputBytes: 32 }
    const result = sanitizeTranscript(transcript, config)
    expect(result).toBe('你'.repeat(10))
    expect(byteLength(result)).toBe(30)
    expect(byteLength(result)).toBeLessThanOrEqual(32)
  })

  it('never leaves a lone surrogate when the byte budget lands mid-pair', () => {
    // 'A' (1 byte) + '💥' (4 bytes) + 'B' (1 byte): a 3-byte budget cuts after A.
    const config = { ...pipeline, maxTranscriptChars: 10_000, maxInputBytes: 3 }
    const result = sanitizeTranscript('A💥B', config)
    expect(result).toBe('A')
    expect(result).not.toMatch(LONE_SURROGATE)
  })

  it('redacts before budgeting so the label, not the secret, gets cut', () => {
    const secret = openaiApiKey()
    const transcript = `api_key=${secret}`
    const roomy = sanitizeTranscript(transcript, { ...pipeline, maxInputBytes: 4096 })
    expect(roomy).toBe('api_key=<openai_api_key>')
    expect(roomy).not.toContain(secret)

    const tight = sanitizeTranscript(transcript, { ...pipeline, maxInputBytes: 12 })
    expect(tight).toBe('api_key=<ope')
    expect(tight).not.toContain(secret)
  })
})

describe('processSuggestion', () => {
  it('cleans quotes and honours the whitespace toggle', () => {
    const config = { ...relaxedFiltering, collapseWhitespace: false, maxSuggestionChars: 100 }
    expect(processSuggestion('"hello   world"', config)).toBe('hello   world')
    expect(processSuggestion('"hello   world"', { ...config, collapseWhitespace: true })).toBe('hello world')
  })

  it('honours the stripEscapes and stripControls toggles on candidates', () => {
    const raw = '\x1B[31mRed\x1B[0m'
    expect(processSuggestion(raw, relaxedFiltering)).toBe('Red')
    expect(processSuggestion(raw, { ...relaxedFiltering, stripEscapes: false, stripControls: false }))
      .toBe(raw)
    expect(processSuggestion('Red\x07', relaxedFiltering)).toBe('Red')
    expect(processSuggestion('Red\x07', { ...relaxedFiltering, stripControls: false })).toBe('Red\x07')
  })

  it('bounds on code points, never leaving a lone surrogate', () => {
    const result = processSuggestion('xxxxx💥', { ...relaxedFiltering, maxSuggestionChars: 5 })
    expect(result).toBe('xxxxx')
    expect(result).not.toMatch(LONE_SURROGATE)
    expect(processSuggestion('A💥B💥C', { ...relaxedFiltering, maxSuggestionChars: 3 })).toBe('A💥B')
  })

  it('trims whitespace left at the cut', () => {
    const config = { ...relaxedFiltering, collapseWhitespace: false, maxSuggestionChars: 6 }
    expect(processSuggestion('hello   world', config)).toBe('hello')
  })

  it('returns null when cleaning empties the candidate', () => {
    expect(processSuggestion('\x1B[0m\x1B[0m', relaxedFiltering)).toBeNull()
  })

  it('returns null when filtering rejects the candidate', () => {
    expect(processSuggestion('no suggestion', pipeline)).toBeNull()
  })
})

describe('processSuggestions', () => {
  it('deduplicates case-insensitively and keeps model order', () => {
    const config = { ...relaxedFiltering, maxSuggestionChars: 40 }
    expect(processSuggestions(['Hello', 'hello', 'world', 'World!', 'WORLD!'], config))
      .toEqual(['Hello', 'world', 'World!'])
  })

  it('drops filtered candidates and keeps the survivors', () => {
    const config = { ...pipeline, maxSuggestionChars: 40 }
    expect(processSuggestions(['no suggestion', 'Run the tests', 'thanks'], config)).toEqual(['Run the tests'])
  })

  it('returns an empty list rather than null when everything is rejected', () => {
    expect(processSuggestions(['no suggestion', ''], pipeline)).toEqual([])
  })
})
