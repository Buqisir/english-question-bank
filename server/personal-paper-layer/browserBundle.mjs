/*
 * Builds the browser script the personal-export measure pass runs inside
 * Chromium (#489 5a): the shared anchor→DOM, note placement, appendix
 * ordering and ink-probe functions as one IIFE on the
 * `__eqbPersonalOverlay` global. Bundled once per process and cached.
 */
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

let cached = null

export async function personalOverlayBrowserScript() {
  cached ??= await buildPersonalOverlayBrowserScript()
  return cached
}

async function buildPersonalOverlayBrowserScript() {
  const entryPoint = fileURLToPath(new URL('../../shared/personal-paper-layer/browserEntry.mjs', import.meta.url))
  let result
  try {
    result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      globalName: '__eqbPersonalOverlay',
    })
  } catch (error) {
    throw bundleFailed(error)
  }
  const code = result.outputFiles[0].text
  // A browser measure pass must not drag Node builtins in — fail here rather
  // than inside a render worker.
  if (code.includes('node:') || /\brequire\(/u.test(code)) {
    throw bundleFailed(new Error('bundle references node builtins or require'))
  }
  return {
    code,
    digest: `sha256:${createHash('sha256').update(code).digest('hex')}`,
  }
}

function bundleFailed(cause) {
  const error = new Error(`personal overlay browser bundle failed: ${cause.message}`, { cause })
  error.code = 'PERSONAL_EXPORT_BUNDLE_FAILED'
  return error
}
