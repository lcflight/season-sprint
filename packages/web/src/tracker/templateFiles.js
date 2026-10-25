// Fetches the shared tracker templates (packages/tracker-templates/*.pgm) that
// webpack bundles as static assets (see the .pgm rule in vue.config.js).
// Returns { fileName: ArrayBuffer }. New templates (e.g. a ranked header) are
// picked up automatically.

// eslint-disable-next-line no-undef
const ctx = require.context('../../../tracker-templates', false, /\.pgm$/)

export async function loadTemplateFiles() {
  const entries = await Promise.all(
    ctx.keys().map(async (key) => {
      const res = await fetch(ctx(key))
      if (!res.ok) throw new Error(`template ${key}: HTTP ${res.status}`)
      return [key.replace(/^\.\//, ''), await res.arrayBuffer()]
    })
  )
  return Object.fromEntries(entries)
}
