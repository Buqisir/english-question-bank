import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { computeSourceRevision } from '../../shared/paper-selection/sourceProjection.mjs'
import { paperFontFaces } from '../../shared/papersurface/paperFonts.mjs'
import { renderPaginatedPaper } from '../draft-paper/paginationRenderer.mjs'

// Bump when anything that changes page geometry outside the paginated HTML
// digest changes (measurement, font delivery, base edition).
export const PERSONAL_BASE_LAYOUT_VERSION = 'eqb-personal-base-layout-v1'
export const PERSONAL_LAYOUT_REF_SCHEMA = 'eqb-personal-layout-ref-v1'
export const PERSONAL_LAYOUT_API_SCHEMA = 'eqb-personal-paper-layout-api-v1'
export const PERSONAL_BASE_PAPER_FONT_URL_PREFIX = '/fonts/paper/'

// The base is always the ordinary student A4 paper — the same natural pipeline
// the draft's default PDF export uses (no page-count target, no writing check),
// which keeps legacy_opaque papers renderable. Eligibility is therefore only
// "the canonical structure is complete", decided by the prepare step.
export const PERSONAL_BASE_EDITION = 'naturalStudentA4'

const PAPER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,160}$/u
const CACHE_MAX_ENTRIES = 4
const RENDERS_PER_MINUTE = 6
const PX_PER_MM = 96 / 25.4
const A4 = { widthMm: 210, heightMm: 297 }

function fail(code, message, status, details) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (details !== undefined) error.details = details
  return error
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')

}

// Paged.js stamps every render session with fresh UUID bookkeeping (data-ref,
// data-following, ...). It is per-render state, not layout meaning, so the
// bound paginated-HTML digest normalizes it; replays of the same plan then
// reproduce this digest byte for byte.
const PAGEDJS_RENDER_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export function stablePaginatedHtmlDigest(paginatedHtml) {
  return `sha256:${sha256(paginatedHtml.replace(PAGEDJS_RENDER_UUID, 'eqb-uuid'))}`
}

const paperFontIdentity = Object.freeze({
  registry: 'paper-font-faces',
  digest: `sha256:${sha256(stableStringify(paperFontFaces))}`,
  faces: paperFontFaces.map(({ family, style, weight, sha256: digest }) => ({ family, style, weight, sha256: digest })),
})

const roundMm = (value) => Math.round(value * 100) / 100

async function measurePages(page) {
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')].map((element) => {
    const box = element.getBoundingClientRect()
    const area = element.querySelector('.pagedjs_area')?.getBoundingClientRect()
    return {
      width: box.width,
      height: box.height,
      margins: area ? {
        top: area.top - box.top,
        right: box.right - area.right,
        bottom: box.bottom - area.bottom,
        left: area.left - box.left,
      } : null,
    }
  }))
  return boxes.map(({ width, height, margins }) => ({
    widthMm: roundMm(width / PX_PER_MM),
    heightMm: roundMm(height / PX_PER_MM),
    marginsMm: margins && Object.fromEntries(Object.entries(margins).map(([side, px]) => [side, roundMm(px / PX_PER_MM)])),
  }))
}

// Reads the rendered page boxes from the same Chromium page; it never
// changes the document, so the renderer's own output stays authoritative.
export function measuringRender(render = renderPaginatedPaper) {
  return async (html, options = {}) => {
    let pageGeometry = null
    const result = await render(html, {
      ...options,
      inspect: async (page) => {
        const inspection = typeof options.inspect === 'function' ? await options.inspect(page) : null
        pageGeometry = await measurePages(page)
        return inspection
      },
    })
    return { ...result, pageGeometry }
  }
}

function paperFormat(pages) {
  const first = pages[0]
  const portrait = first.heightMm >= first.widthMm
  const a4 = Math.abs(first.widthMm - A4.widthMm) <= 1 && Math.abs(first.heightMm - A4.heightMm) <= 1
  return { size: a4 ? 'A4' : 'custom', orientation: portrait ? 'portrait' : 'landscape' }
}

export function personalLayoutRef({
  paperId, sourceRevision, consumption, prepared, result, pages, paginatedHtmlDigest, printHtmlDigest,
  layoutVersion = PERSONAL_BASE_LAYOUT_VERSION,
}) {
  return {
    schemaVersion: PERSONAL_LAYOUT_REF_SCHEMA,
    layoutVersion,
    paperId,
    sourceRevision,
    source: {
      publicationDigest: consumption.publicationDigest ?? null,
      sourceAssetVersion: consumption.sourceAssetVersion ?? null,
      sourceAssetDigest: consumption.sourceAssetDigest ?? null,
      visibleStructureDigest: consumption.visibleStructureDigest ?? null,
      authorityRef: consumption.authorityRef ?? null,
    },
    product: {
      edition: PERSONAL_BASE_EDITION,
      versionType: 'student',
      contentScope: 'whole-paper',
      includeListening: true,
      groupIds: prepared.renderedGroupIds,
      mode: 'natural',
    },
    fonts: paperFontIdentity,
    paper: paperFormat(pages),
    pageCount: pages.length,
    pages,
    printHtmlDigest,
    paginatedHtmlDigest,
  }
}

export function personalLayoutId(layoutRef) {
  return `lay_${sha256(stableStringify(layoutRef)).slice(0, 24)}`
}

let fontPathBySha
function paperFontPathBySha() {
  fontPathBySha ??= new Map(paperFontFaces.map((face) => [face.sha256, face.path]))
  return fontPathBySha
}

/*
 * The renderer embeds the paper fonts as data URIs (tens of MB). The app
 * already serves those exact files from /fonts/paper/, so the iframe copy
 * points there instead; only faces whose bytes match the manifest are swapped.
 *
 * Hand-rolled scan, not String.replace with a callback: V8 builds the result
 * of a global regex replace recursively per match and blows the stack on
 * multi-MB base64 matches (Node 24 on CI: RangeError Maximum call stack size
 * exceeded). Slicing never recurses. Same rule for the reverse direction.
 */
export function servePaperFontsFromAppOrigin(html) {
  const bySha = paperFontPathBySha()
  const marker = 'data:font/otf;base64,'
  const parts = []
  let rest = html
  let at = rest.indexOf(marker)
  while (at >= 0) {
    const quote = rest[at - 1]
    const quoted = quote === '"' || quote === "'"
    const open = quoted ? `url(${quote}` : 'url('
    const start = at - open.length
    const isFontUrl = start >= 0 && rest.startsWith(open, start)
    const end = rest.indexOf(quoted ? quote : ')', at + marker.length)
    const closesCleanly = end >= 0 && (!quoted || rest[end + 1] === ')')
    const base64 = closesCleanly ? rest.slice(at + marker.length, end) : ''
    if (!isFontUrl || !closesCleanly || !/^[A-Za-z0-9+/=]+$/u.test(base64)) {
      // Not a whole data-font URL we own; keep it verbatim and continue.
      parts.push(rest.slice(0, at + marker.length))
      rest = rest.slice(at + marker.length)
      at = rest.indexOf(marker)
      continue
    }
    const after = end + (quoted ? 2 : 1)
    const fontPath = bySha.get(sha256(Buffer.from(base64, 'base64')))
    parts.push(rest.slice(0, start))
    parts.push(fontPath ? `url("${PERSONAL_BASE_PAPER_FONT_URL_PREFIX}${fontPath}")` : rest.slice(start, after))
    rest = rest.slice(after)
    at = rest.indexOf(marker)
  }
  parts.push(rest)
  return parts.join('')
}

const inlineFontBytesByPath = new Map()

/*
 * The reverse of servePaperFontsFromAppOrigin: the stage-5 measure pass runs
 * the cached paginated HTML in a bare Chromium page with no app origin, so
 * the /fonts/paper/ URLs must become data URIs again before setContent.
 * Bytes are read (and sha-checked) once per face; unknown paths stay as-is.
 */
export function inlinePaperFontsForServer(html) {
  const byPath = new Map(paperFontFaces.map((face) => [face.path, face]))
  const marker = '/fonts/paper/'
  const parts = []
  let rest = html
  let at = rest.indexOf(marker)
  while (at >= 0) {
    const quote = rest[at - 1]
    const quoted = quote === '"' || quote === "'"
    const open = quoted ? `url(${quote}` : 'url('
    const start = at - open.length
    const isFontUrl = start >= 0 && rest.startsWith(open, start)
    const end = rest.indexOf(quoted ? quote : ')', at + marker.length)
    const closesCleanly = end >= 0 && (!quoted || rest[end + 1] === ')')
    const fontPath = closesCleanly ? rest.slice(at + marker.length, end) : ''
    const face = closesCleanly ? byPath.get(fontPath) : undefined
    if (!isFontUrl || !face) {
      parts.push(rest.slice(0, at + marker.length))
      rest = rest.slice(at + marker.length)
      at = rest.indexOf(marker)
      continue
    }
    let bytes = inlineFontBytesByPath.get(fontPath)
    if (!bytes) {
      bytes = readFileSync(new URL(`../../app/public/fonts/paper/${fontPath}`, import.meta.url))
      if (sha256(bytes) !== face.sha256) {
        const error = new Error(`Paper font integrity mismatch: ${fontPath}`)
        error.code = 'PERSONAL_FONT_ASSET_MISMATCH'
        throw error
      }
      inlineFontBytesByPath.set(fontPath, bytes)
    }
    const after = end + (quoted ? 2 : 1)
    parts.push(rest.slice(0, start))
    parts.push(`url("data:font/otf;base64,${bytes.toString('base64')}")`)
    rest = rest.slice(after)
    at = rest.indexOf(marker)
  }
  parts.push(rest)
  return parts.join('')
}

// Replays the base render. Stage-5 composition passes its own render here so
// the overlay is drawn onto exactly this paper.
export function renderPersonalBaseLayout(input, { render = renderPaginatedPaper } = {}) {
  return render(input.printHtml)
}

export function createPersonalPaperLayoutRuntime({
  loadCanonicalConsumption,
  draftPaperStore,
  render = renderPaginatedPaper,
  resolvePaperTitle = () => undefined,
  now = () => Date.now(),
} = {}) {
  const cache = new Map()
  const inFlight = new Map()
  const renderWindows = new Map()

  function cacheGet(key) {
    const entry = cache.get(key)
    if (!entry) return undefined
    cache.delete(key)
    cache.set(key, entry)
    return entry
  }

  function cacheSet(key, entry) {
    cache.delete(key)
    cache.set(key, entry)
    while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
  }

  function throttle(userId) {
    const nowMs = now()
    const recent = (renderWindows.get(userId) || []).filter((at) => at > nowMs - 60_000)
    if (recent.length >= RENDERS_PER_MINUTE) {
      throw fail('PERSONAL_LAYOUT_RATE_LIMITED', '纸张版生成太频繁，稍后再试', 429)
    }
    recent.push(nowMs)
    renderWindows.set(userId, recent)
  }

  function loadSources(paperId) {
    if (typeof paperId !== 'string' || !PAPER_ID_PATTERN.test(paperId)) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', '试卷编号不正确', 400)
    }
    let screen
    let print
    try {
      screen = loadCanonicalConsumption({ paperId, consumerId: 'screen' })
      print = loadCanonicalConsumption({ paperId, consumerId: 'print_pdf' })
    } catch {
      throw fail('PERSONAL_LAYER_SOURCE_UNAVAILABLE', '这张卷子暂时不能批注', 404)
    }
    if (screen?.disposition !== 'ready' || print?.disposition !== 'ready') {
      throw fail('PERSONAL_LAYER_SOURCE_UNAVAILABLE', '这张卷子暂时不能批注', 404)
    }
    if (screen.publicationDigest !== print.publicationDigest || screen.sourceAssetDigest !== print.sourceAssetDigest) {
      throw fail('PERSONAL_LAYOUT_SOURCE_STALE', '卷子正在更新，稍后再打开纸张版', 409)
    }
    return { sourceRevision: computeSourceRevision(screen), print }
  }

  function prepare(paperId, print) {
    try {
      return draftPaperStore.preparePublishedPaperNaturalStudent(print, { title: resolvePaperTitle(paperId) })
    } catch (error) {
      if (error?.code === 'CANONICAL_PUBLICATION_CHANGED') {
        throw fail('PERSONAL_LAYOUT_SOURCE_STALE', '卷子正在更新，稍后再打开纸张版', 409)
      }
      throw fail('PERSONAL_LAYOUT_UNAVAILABLE', '这张卷子没有可用的完整纸张版', 422)
    }
  }

  async function build(paperId, sourceRevision, print) {
    const prepared = prepare(paperId, print)
    let result
    try {
      result = await draftPaperStore.renderPreparedNaturalStudent(prepared, { render: measuringRender(render) })
    } catch {
      throw fail('PERSONAL_LAYOUT_RENDER_FAILED', '纸张版暂时生成失败，稍后重试', 503)
    }
    const geometry = result.pageGeometry
    if (!Array.isArray(geometry) || geometry.length !== result.pageCount || geometry.length === 0
      || geometry.some(({ widthMm, heightMm }) => !(widthMm > 0 && heightMm > 0))) {
      throw fail('PERSONAL_LAYOUT_RENDER_FAILED', '纸张版暂时生成失败，稍后重试', 503)
    }
    const pages = geometry.map((page, index) => ({ pageId: `p${index + 1}`, index, ...page }))
    const layoutRef = personalLayoutRef({
      paperId,
      sourceRevision,
      consumption: print,
      prepared,
      result,
      pages,
      paginatedHtmlDigest: stablePaginatedHtmlDigest(result.paginatedHtml),
      printHtmlDigest: `sha256:${sha256(prepared.html)}`,
    })
    return {
      layoutRef,
      layoutId: personalLayoutId(layoutRef),
      edition: PERSONAL_BASE_EDITION,
      pages,
      paginatedHtml: servePaperFontsFromAppOrigin(result.paginatedHtml),
    }
  }

  async function resolveLayout(userId, paperId, requestedRevision) {
    const { sourceRevision, print } = loadSources(paperId)
    if (requestedRevision !== undefined && requestedRevision !== sourceRevision) {
      // Same stale-revision code the layer's commit path already uses.
      throw fail('PERSONAL_LAYER_SOURCE_MISMATCH', '卷子已经更新，纸张版需要按新卷重新打开', 409, {
        currentSourceRevision: sourceRevision,
      })
    }
    const key = [paperId, sourceRevision, PERSONAL_BASE_LAYOUT_VERSION].join('\u0000')
    const cached = cacheGet(key)
    if (cached) return { entry: cached, print, cache: 'hit' }
    let pending = inFlight.get(key)
    let cacheState = 'shared'
    if (!pending) {
      throttle(userId)
      cacheState = 'miss'
      pending = build(paperId, sourceRevision, print)
        .then((entry) => {
          cacheSet(key, entry)
          return entry
        })
        .finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    return { entry: await pending, print, cache: cacheState }
  }

  async function getLayout(userId, { paperId, sourceRevision } = {}) {
    const { entry, cache: cacheState } = await resolveLayout(userId, paperId, sourceRevision)
    return {
      cache: cacheState,
      body: {
        schemaVersion: PERSONAL_LAYOUT_API_SCHEMA,
        paperId,
        sourceRevision: entry.layoutRef.sourceRevision,
        layoutRef: entry.layoutRef,
        layoutId: entry.layoutId,
        edition: entry.edition,
        pages: entry.pages.map(({ pageId, index, widthMm, heightMm }) => ({ pageId, index, widthMm, heightMm })),
        paginatedHtml: entry.paginatedHtml,
      },
    }
  }

  // The exact print HTML behind a layout, rebuilt rather than cached (it
  // embeds the fonts), and refused if it no longer matches that layout.
  async function baseRenderInput(userId, { paperId, layoutId } = {}) {
    const { entry, print } = await resolveLayout(userId, paperId)
    if (layoutId !== undefined && layoutId !== entry.layoutId) {
      throw fail('PERSONAL_LAYOUT_MISMATCH', '纸张版已经变化，请重新核对批注位置', 409, { currentLayoutId: entry.layoutId })
    }
    const prepared = prepare(paperId, print)
    if (`sha256:${sha256(prepared.html)}` !== entry.layoutRef.printHtmlDigest) {
      throw fail('PERSONAL_LAYOUT_MISMATCH', '纸张版已经变化，请重新核对批注位置', 409, { currentLayoutId: entry.layoutId })
    }
    return {
      layoutId: entry.layoutId,
      layoutRef: entry.layoutRef,
      printHtml: prepared.html,
      edition: entry.edition,
    }
  }

  return { getLayout, baseRenderInput }
}
