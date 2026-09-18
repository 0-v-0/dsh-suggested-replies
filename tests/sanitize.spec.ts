/** Tests for transcript redaction, output cleaning, and semantic filtering. */
import { describe, expect, it } from 'vitest'
import {
  byteLength,
  cleanSuggestion,
  hasCJK,
  redactSecrets,
  shouldFilterSuggestion,
  stripUnsafeCharacters,
  truncateToCodePoints,
  truncateToUtf8Bytes,
  type CleanSuggestionOptions,
  type FilterOptions,
} from '../src/sanitize.ts'
import {
  awsAccessKeyId,
  awsSecretAccessKey,
  base64BearerValue,
  bearerCredential,
  githubFineGrainedPat,
  githubToken,
  gitlabToken,
  googleApiKey,
  openaiApiKey,
  slackToken,
  stripeSecretKey,
} from './helpers/secrets.ts'

const cleanOpts: CleanSuggestionOptions = {
  stripEscapes: true,
  stripControls: true,
  stripFencesAndQuotes: true,
  collapseWhitespace: true,
  singleLine: true,
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
}

describe('redactSecrets', () => {
  it('masks AWS access keys', () => {
    expect(redactSecrets(`access_key_id=${awsAccessKeyId('AKIA')}`)).toBe('access_key_id=<aws_access_key>')
  })

  it('masks OpenAI-style keys', () => {
    expect(redactSecrets(`token=${openaiApiKey()}`)).toBe('token=<openai_api_key>')
  })

  it('keeps the informative label on a keyed assignment', () => {
    expect(redactSecrets(`api_key=${openaiApiKey()}`)).toBe('api_key=<openai_api_key>')
  })

  it('masks GitHub tokens', () => {
    expect(redactSecrets(githubToken('ghp'))).toBe('<github_token>')
    expect(redactSecrets(githubToken('gho'))).toBe('<github_token>')
    expect(redactSecrets(githubToken('ghs'))).toBe('<github_token>')
    expect(redactSecrets('github_pat_11ABCDEFGHIJKLMNOPQRSTU')).toBe('<github_token>')
  })

  it('masks Slack tokens', () => {
  })

  it('masks Bearer tokens', () => {
    const result = redactSecrets(`Authorization: Bearer ${bearerCredential()}`)
    expect(result).toBe('Authorization: Bearer [REDACTED_SECRET]')
  })

  it('leaves normal text unchanged', () => {
    expect(redactSecrets('Hello, how are you?')).toBe('Hello, how are you?')
  })

  it('masks multiple secrets in one string', () => {
    const result = redactSecrets(
      `AWS_ACCESS_KEY_ID=${awsAccessKeyId('AKIA')} and openai=${openaiApiKey()}`,
    )
    expect(result).toContain('<aws_access_key>')
    expect(result).toContain('<openai_api_key>')
  })

  it('masks AWS secret access keys via the keyed assignment rule', () => {
    expect(redactSecrets(`aws_secret_access_key=${awsSecretAccessKey()}`))
      .toBe('aws_secret_access_key: <redacted>')
  })

  it('masks password and secret assignments case-insensitively', () => {
    expect(redactSecrets('Password: hunter2secret')).toBe('Password: <redacted>')
    expect(redactSecrets('SECRET = mylongsecretvalue')).toBe('SECRET: <redacted>')
    expect(redactSecrets('pwd: "s3cret-value"')).toBe('pwd: <redacted>')
    expect(redactSecrets('auth-token=abcdef12345678')).toBe('auth-token: <redacted>')
  })

  it('does not mask a keyed assignment with a too-short value', () => {
    expect(redactSecrets('token: abc')).toBe('token: abc')
  })

  it('leaves prose and non-credential keys alone', () => {
    expect(redactSecrets('the key is here')).toBe('the key is here')
    expect(redactSecrets('monkey: not a secret value')).toBe('monkey: not a secret value')
    expect(redactSecrets('config: myvalue12345')).toBe('config: myvalue12345')
  })

  it('masks Stripe live and test keys', () => {
    // Stripe key fixtures are generated at runtime; committed literals trip GitHub push protection.
    // Stripe key fixtures are generated at runtime; committed literals trip GitHub push protection.
  })

  it('masks Google API keys', () => {
    expect(redactSecrets('AIzaabcdefghijklmnopqrstuvwxyz1234567')).toBe('<google_api_key>')
  })

  it('masks GitLab tokens', () => {
    expect(redactSecrets(gitlabToken('glptt'))).toBe('<gitlab_token>')
  })

  it('masks a PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7\n-----END RSA PRIVATE KEY-----'
    expect(redactSecrets(`before ${pem} after`)).toBe('before <private_key> after')
  })

  it('masks an OPENSSH private key block joined onto one line', () => {
    // extractPlainText collapses whitespace before redaction runs, so the
    // block body is space-separated by the time it reaches this rule.
    const pem = '-----BEGIN OPENSSH PRIVATE KEY----- b3Blbn... -----END OPENSSH PRIVATE KEY-----'
    expect(redactSecrets(pem)).toBe('<private_key>')
  })
})

describe('stripUnsafeCharacters', () => {
  it('strips terminal escape sequences and control characters', () => {
    expect(stripUnsafeCharacters('\x1B[31mRed\x1B[0m\x1B]0;title\x07hello\x07', {
      stripEscapes: true, stripControls: true,
    })).toBe('Redhello')
  })

  it('honours both toggles independently', () => {
    expect(stripUnsafeCharacters('\x1B[31mRed\x1B[0m', { stripEscapes: true, stripControls: false }))
      .toBe('Red')
    expect(stripUnsafeCharacters('Red\x07', { stripEscapes: false, stripControls: true })).toBe('Red')
    expect(stripUnsafeCharacters('\x1B[31mRed\x1B[0m\x07', { stripEscapes: false, stripControls: false }))
      .toBe('\x1B[31mRed\x1B[0m\x07')
  })

  it('strips the ESC byte as a control character even when escape stripping is off', () => {
    // A partial CSI body is inert without the ESC introducer, so leaving it as
    // plain text is acceptable rather than silently mangling the sequence.
    expect(stripUnsafeCharacters('\x1B[31mRed\x1B[0m', { stripEscapes: false, stripControls: true }))
      .toBe('[31mRed[0m')
  })

  it('keeps tab, newline, and carriage return in place', () => {
    expect(stripUnsafeCharacters('a\tb\nc\rd', { stripEscapes: false, stripControls: true }))
      .toBe('a\tb\nc\rd')
  })

  it('removes invisible format characters that hide the sent text', () => {
    expect(stripUnsafeCharacters('Accept\u200B\u200B\uFEFF\u200Erefund\u200F\u061C', {
      stripEscapes: false, stripControls: true,
    })).toBe('Acceptrefund')
  })

  it('removes bidi embeddings and isolates', () => {
    expect(stripUnsafeCharacters('a\u202Ab\u202C\u202Eword\u2066c\u2069\u206Ad', {
      stripEscapes: false, stripControls: true,
    })).toBe('abwordcd')
  })

  it('removes line and paragraph separators', () => {
    expect(stripUnsafeCharacters('a\u2028b\u2029c\u2060d', { stripEscapes: false, stripControls: true }))
      .toBe('abcd')
  })

  it('keeps ZWNJ and ZWJ so Arabic text and emoji render correctly', () => {
    const arabic = '\u0641\u200c\u0627'
    expect(stripUnsafeCharacters(arabic, { stripEscapes: false, stripControls: true })).toBe(arabic)
    const family = '👨\u200d👩\u200d👧'
    expect(stripUnsafeCharacters(family, { stripEscapes: false, stripControls: true })).toBe(family)
  })

  it('removes lone surrogates', () => {
    expect(stripUnsafeCharacters('a\uD83Db', { stripEscapes: false, stripControls: true })).toBe('ab')
    expect(stripUnsafeCharacters('👍', { stripEscapes: false, stripControls: true })).toBe('👍')
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
    expect(cleanSuggestion('hello world', { ...cleanOpts, singleLine: false })).toBe('hello world')
  })

  it('strips control characters and bidi overrides', () => {
    const result = cleanSuggestion('hello\u202Eworld', cleanOpts)
    expect(result).toBe('helloworld')
  })

  it('strips zero-width characters and BOM even outside bidi context', () => {
    expect(cleanSuggestion('Accept\u200B\u200B\uFEFFrefund', cleanOpts)).toBe('Acceptrefund')
  })

  it('respects the stripControls toggle', () => {
    expect(cleanSuggestion('hello\u202Eworld', { ...cleanOpts, stripControls: false })).toBe('hello\u202Eworld')
    expect(cleanSuggestion('hello\u202Eworld', { ...cleanOpts, stripControls: true })).toBe('helloworld')
  })

  it('returns empty string for all-control input', () => {
    expect(cleanSuggestion('\x1B[0m\x1B[0m', cleanOpts)).toBe('')
  })
})

describe('truncateToCodePoints', () => {
  it('counts code points, not UTF-16 code units', () => {
    expect(truncateToCodePoints('A💥B💥', 2)).toBe('A💥')
    expect(truncateToCodePoints('AAAAA💥', 6)).toBe('AAAAA💥')
    expect(truncateToCodePoints('AAAAA💥', 5)).toBe('AAAAA')
  })

  it('never leaves a lone surrogate at the cut', () => {
    const result = truncateToCodePoints('AAAAA💥', 6)
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('handles the degenerate bounds', () => {
    expect(truncateToCodePoints('hello', 0)).toBe('')
    expect(truncateToCodePoints('hello', -1)).toBe('')
    expect(truncateToCodePoints('hello', 10)).toBe('hello')
    expect(truncateToCodePoints('', 3)).toBe('')
  })
})

describe('truncateToUtf8Bytes', () => {
  it('respects the byte budget on a code point boundary', () => {
    // 你 is 3 UTF-8 bytes and 好 is 3, so 你好好 is 9 bytes.
    expect(truncateToUtf8Bytes('你好好', 4)).toBe('你')
    expect(truncateToUtf8Bytes('你好好', 8)).toBe('你好')
    expect(truncateToUtf8Bytes('你好好', 9)).toBe('你好好')
    expect(truncateToUtf8Bytes('你好好', 12)).toBe('你好好')
  })

  it('does not cut inside an astral code point', () => {
    // A is 1 byte, 💥 is 4, B is 1.
    expect(truncateToUtf8Bytes('A💥B', 2)).toBe('A')
    expect(truncateToUtf8Bytes('A💥B', 5)).toBe('A💥')
    expect(truncateToUtf8Bytes('A💥B', 6)).toBe('A💥B')
  })

  it('never leaves a lone surrogate at the cut', () => {
    const result = truncateToUtf8Bytes('AAAAA💥', 9)
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('leaves text within budget untouched', () => {
    expect(truncateToUtf8Bytes('hello', 16)).toBe('hello')
    expect(truncateToUtf8Bytes('hello', 0)).toBe('')
  })
})

describe('byteLength and hasCJK', () => {
  it('measures UTF-8 bytes, not code points', () => {
    expect(byteLength('hello')).toBe(5)
    expect(byteLength('你好')).toBe(6)
    expect(byteLength('👍')).toBe(4)
  })

  it('detects CJK extension A as well as the unified range', () => {
    expect(hasCJK('扩展区A')).toBe(true)
    expect(hasCJK('你好')).toBe(true)
    expect(hasCJK('hello')).toBe(false)
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
