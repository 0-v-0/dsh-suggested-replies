/**
 * Package-owned invariant companion for suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-external/dsh-suggested-replies'

/** Cordis companion plugin identity. */
export const name = 'dsh-suggested-replies-invariant'
/** Service required before the package can reserve its invariant namespace. */
export const inject = ['invariants']

/** The durable session log and freshness gate fully own this plugin's mutable relationships. */
const install: InvariantInstaller = () => {}

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
