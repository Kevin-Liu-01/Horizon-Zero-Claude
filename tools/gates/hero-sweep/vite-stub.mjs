/**
 * Node module hooks for the hero-sweep bench: Vite's `?raw` and `?url` imports (src/core/ktx2.js) resolve to an
 * empty string, so `src/hero/**` can be imported in Node. Registered by `load.mjs` before it imports the game.
 */
export async function resolve(spec, ctx, next) {
  if (/\?(raw|url)$/.test(spec)) return { url: 'data:text/javascript,export default ""', shortCircuit: true };
  return next(spec, ctx);
}

/** `import.meta.glob(...)` (src/core/assets.js) is Vite's: in Node it yields no modules. */
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes('/src/') && r.source) {
    const s = String(r.source);
    if (s.includes('import.meta.glob(')) return { ...r, source: s.split('import.meta.glob(').join('((..._g) => ({}))(') };
  }
  return r;
}
