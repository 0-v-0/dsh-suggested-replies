/**
 * Runtime-generated credential fixtures for the redaction tests.
 *
 * Committing literal key-shaped strings trips GitHub push protection even for
 * vendor documentation examples, so every positive fixture is assembled from a
 * random alphabet here. Each generator keeps the exact length and character
 * class the matching redaction rule in `src/sanitize.ts` requires, and negative
 * fixtures (too-short or prose values) stay literal in the specs.
 */

function randomFrom(alphabet: string, length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

const UPPER_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** AWS long-term (`AKIA`) or STS (`ASIA`) access key id: prefix + 16 upper/digits. */
export const awsAccessKeyId = (prefix: 'AKIA' | 'ASIA'): string => `${prefix}${randomFrom(UPPER_DIGITS, 16)}`

/** AWS secret access key: 40 characters of the base64 alphabet. */
export const awsSecretAccessKey = (): string => randomFrom(`${ALPHANUMERIC}+/`, 40)

/** OpenAI-style key: `sk-` + 36 alphanumeric characters. */
export const openaiApiKey = (): string => `sk-${randomFrom(ALPHANUMERIC, 36)}`

/** GitHub classic token: `ghp_`/`gho_`/`ghs_`/`ghu_` + 36 alphanumeric characters. */
export const githubToken = (prefix: 'ghp' | 'gho' | 'ghs' | 'ghu'): string =>
  `${prefix}_${randomFrom(ALPHANUMERIC, 36)}`

/** GitHub fine-grained PAT head: `github_pat_` + 22 token characters. */
export const githubFineGrainedPat = (): string => `github_pat_${randomFrom(`${ALPHANUMERIC}_`, 22)}`

/** Slack bot/user token: `xoxb-`/`xoxp-` + two dash-separated parts. */
export const slackToken = (kind: 'xoxb' | 'xoxp'): string =>
  `${kind}-${randomFrom('0123456789', 10)}-${randomFrom(ALPHANUMERIC, 8)}`

/** Stripe live/test secret key: `sk_<env>_` + 24 alphanumeric characters. */
export const stripeSecretKey = (env: 'live' | 'test'): string => `sk_${env}_${randomFrom(ALPHANUMERIC, 24)}`

/** Google API key: `AIza` + exactly 35 base64url characters, 39 in total. */
export const googleApiKey = (): string => `AIza${randomFrom(`${ALPHANUMERIC}-_`, 35)}`

/** GitLab PAT (`glpat-`) or trigger token (`glptt-`): prefix + 20 token characters. */
export const gitlabToken = (prefix: 'glpat' | 'glptt'): string =>
  `${prefix}-${randomFrom(`${ALPHANUMERIC}_-`, 20)}`

/** Arbitrary bearer credential value: 12 alphanumeric characters. */
export const bearerCredential = (): string => randomFrom(ALPHANUMERIC, 12)

/**
 * Base64 (not base64url) bearer value: the value contains `+`, `/`, and `=`
 * padding that base64url omits. The second dot-separated segment is pinned to
 * start with a literal so the value can never shape-match the JWT rule.
 */
export const base64BearerValue = (): string =>
  `eyJhbGciOiJIUzI1NiJ9.q${randomFrom(ALPHANUMERIC, 4)}+/${randomFrom(ALPHANUMERIC, 4)}==.sig`
