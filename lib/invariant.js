//#region src/invariant.ts
const PACKAGE_NAME = "@dsh-external/dsh-suggested-replies";
/** Cordis companion plugin identity. */
const name = "dsh-suggested-replies-invariant";
/** Service required before the package can reserve its invariant namespace. */
const inject = ["invariants"];
/** The durable session log and freshness gate fully own this plugin's mutable relationships. */
const install = () => {};
/** Register the package invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
