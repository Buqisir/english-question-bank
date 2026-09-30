#!/usr/bin/env node
// verify-resource: browser-render
// Foundation checks for the #489 personal-export pipeline (5a): the shared
// overlay browser bundle (esbuild → IIFE on __eqbPersonalOverlay) and the
// personal-font @font-face data-URI builder, both exercised in a real
// Chromium page like the production measure pass will.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { personalOverlayBrowserScript } from '../server/personal-paper-layer/browserBundle.mjs'
import { assertPersonalFontAsset, personalFontFaceCss, personalFontFaceUrlCss } from '../server/personal-paper-layer/personalFonts.mjs'
import { inlinePaperFontsForServer, servePaperFontsFromAppOrigin } from '../server/personal-paper-layer/layout.mjs'
import { PERSONAL_FONT_PRESETS } from '../shared/personal-text/fontRegistry.mjs'
import { paperFontFaces } from '../shared/papersurface/paperFonts.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appRequire = createRequire(path.join(rootDir, 'app/package.json'))
const { chromium } = appRequire('playwright')

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}
function codeOf(fn) {
  try {
    fn()
    return null
  } catch (error) {
    return error.code || error.message
  }
}

// ---- browser bundle ---------------------------------------------------------

const bundleStartedAt = Date.now()
const bundle = await personalOverlayBrowserScript()
const bundleMs = Date.now() - bundleStartedAt
const bundleAgain = await personalOverlayBrowserScript()
check('the overlay bundle builds with non-empty code', typeof bundle.code === 'string' && bundle.code.length > 0)
check('the bundle digest is stable across calls', bundle.digest === bundleAgain.digest && bundle.digest.startsWith('sha256:'),
  `${bundle.digest} vs ${bundleAgain.digest}`)
check('the bundle references no node builtins or require', !bundle.code.includes('node:') && !bundle.code.includes('require('))
check('the bundle installs the __eqbPersonalOverlay global', bundle.code.includes('__eqbPersonalOverlay'))
console.log(`bundle: ${(bundle.code.length / 1024).toFixed(1)} KB, digest ${bundle.digest}, built in ${bundleMs} ms`)

// ---- personal fonts ---------------------------------------------------------

const { css: fontCss, digest: fontDigest } = personalFontFaceCss()
const fontResultAgain = personalFontFaceCss()
check('the personal font css builds and caches', fontResultAgain === personalFontFaceCss() && fontResultAgain.css === fontCss && fontResultAgain.digest === fontDigest)
const registeredFaces = [...new Map(Object.values(PERSONAL_FONT_PRESETS)
  .flatMap((preset) => preset.assets).map((asset) => [asset.file, asset])).values()]
check('every registered personal font face has one @font-face',
  (fontCss.match(/@font-face/gu) || []).length === registeredFaces.length
  && registeredFaces.every((face) => fontCss.includes(`'${face.family}'`)),
  `${registeredFaces.length} faces`)
check('the font registry digest is a stable sha256', fontDigest.startsWith('sha256:') && fontDigest === personalFontFaceCss().digest)
const defaultPreset = PERSONAL_FONT_PRESETS.default
check('the 常规 preset uses the bundled paper fonts with real bold faces',
  defaultPreset.requiresAssets === true && defaultPreset.syntheticBold === false
  && defaultPreset.cssFamily === "'EQB Termes', 'EQB Source Han Serif', serif"
  && defaultPreset.assets.length === 4
  && defaultPreset.assets.every((entry) => entry.root === 'paper'),
  JSON.stringify(defaultPreset))
check('the 常规 preset alone embeds exactly the bundled paper faces (no host fallback)',
  !personalFontFaceCss({ presetIds: ['default'] }).css.includes('Xiaolai')
  && !personalFontFaceCss({ presetIds: ['default'] }).css.includes('Fuzzy')
  && (personalFontFaceCss({ presetIds: ['default'] }).css.match(/@font-face/gu) || []).length === defaultPreset.assets.length,
  personalFontFaceCss({ presetIds: ['default'] }).css.slice(0, 200))
check('export pages reuse the paper-declared 常规 faces but still verify them',
  personalFontFaceUrlCss({ presetIds: ['default'], paperFacesDeclared: true }).css === ''
  && JSON.stringify(personalFontFaceUrlCss({ presetIds: ['default'], paperFacesDeclared: true }).faces.map((face) => [face.family, face.weight]).sort())
    === JSON.stringify(defaultPreset.assets.map((entry) => [entry.family, entry.weight]).sort()),
  JSON.stringify(personalFontFaceUrlCss({ presetIds: ['default'], paperFacesDeclared: true }).faces))
check('the Fuzzy Bubbles preset pulls its Xiaolai fallback in',
  personalFontFaceCss({ presetIds: ['fuzzy-xiaolai'] }).css.includes('EQB Xiaolai SC')
  && personalFontFaceCss({ presetIds: ['fuzzy-xiaolai'] }).css.includes('EQB Fuzzy Bubbles'))
console.log(`font css: ${(fontCss.length / 1024 / 1024).toFixed(2)} MB, digest ${fontDigest}`)
check('tampered font bytes fail the registry sha check',
  codeOf(() => assertPersonalFontAsset(registeredFaces[0], 'tampered bytes')) === 'PERSONAL_FONT_ASSET_MISMATCH')
check('genuine font bytes pass the registry sha check in every asset root',
  registeredFaces.every((face) => codeOf(() => assertPersonalFontAsset(
    face,
    readFileSync(path.join(rootDir, 'app/public/fonts', face.root, face.file)),
  )) !== 'PERSONAL_FONT_ASSET_MISMATCH'))

// ---- paper-font URL swap survives multi-MB data URIs ------------------------
// Regression: the old regex-callback replace blew V8's stack on the real
// paginated HTML under Node 24 (CI RangeError). The scan must handle genuine
// faces, unknown data URIs and quoted/unquoted URLs without recursion.
{
  const face = paperFontFaces[0]
  const genuine = readFileSync(new URL(`../app/public/fonts/paper/${face.path}`, import.meta.url)).toString('base64')
  const unknown = Buffer.from('not a registered face').toString('base64')
  const html = `<style>@font-face{src:url("data:font/otf;base64,${genuine}")}</style>`
    + `<style>@font-face{src:url(data:font/otf;base64,${unknown})}</style>`
    + `<p>tail</p>`
  const swapped = servePaperFontsFromAppOrigin(html)
  check('multi-MB data URIs swap to app-origin font URLs without a stack overflow',
    swapped.includes(`url("/fonts/paper/${face.path}")`)
    && swapped.includes(`url(data:font/otf;base64,${unknown})`)
    && swapped.endsWith('<p>tail</p>'),
    `${(html.length / 1024 / 1024).toFixed(1)} MB in`)
  check('the server inline pass restores the data URIs byte for byte',
    inlinePaperFontsForServer(swapped) === html)
}

// ---- the bundle and the fonts run in a real page ----------------------------

let browser = null
try {
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage()
  await page.setContent('<p>hello world</p>')
  await page.addScriptTag({ content: bundle.code })
  check('the bundle exposes the four overlay functions on the global', await page.evaluate(() => {
    const api = window.__eqbPersonalOverlay
    return Boolean(api)
      && typeof api.printSegmentToDomRanges === 'function'
      && typeof api.placeNoteNearAnchor === 'function'
      && typeof api.orderAppendixEntries === 'function'
      && typeof api.inkFreeRect === 'function'
  }))
  // The probe over the words must see ink; the blank area below must not.
  const ink = await page.evaluate(() => {
    const api = window.__eqbPersonalOverlay
    const box = document.querySelector('p').getBoundingClientRect()
    return {
      overText: api.inkFreeRect(document, { left: box.left, top: box.top, width: box.width, height: box.height }, 12),
      blank: api.inkFreeRect(document, { left: box.left, top: box.bottom + 40, width: 200, height: 60 }, 12),
    }
  })
  check('inkFreeRect reports ink over text and none on blank space',
    ink.overText === false && ink.blank === true, JSON.stringify(ink))

  await page.setContent('<p>x</p>')
  await page.addStyleTag({ content: fontCss })
  const loaded = await page.evaluate(async (faces) => Promise.all(faces.map(async (face) => ({
    family: face.family,
    weight: face.weight,
    loaded: (await document.fonts.load(`${face.weight} 16px "${face.family}"`)).length > 0,
  }))), registeredFaces)
  check('every personal font face loads from the injected css in the browser',
    loaded.length === registeredFaces.length && loaded.every((face) => face.loaded), JSON.stringify(loaded))
} finally {
  if (browser) await browser.close()
}

console.log(failed === 0 ? '\nverify-personal-export-foundation: all checks passed' : `\nverify-personal-export-foundation: ${failed} failed`)
// Let Node exit on its own once Chromium's child processes are gone: an
// immediate process.exit() leaves exiting helpers in the process group, and
// the verify-ci reaper's kill(-pgid) then fails with EPERM on macOS.
process.exitCode = failed === 0 ? 0 : 1
