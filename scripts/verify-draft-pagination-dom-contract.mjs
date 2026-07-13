#!/usr/bin/env node
// draft-desk-b step2 (MF-3, plan.md "步2 — DOM 契约 + 缓存解耦"): verifies
// server/draft-paper/paginationDomContract.mjs's contract (`.preview-page` +
// `data-group-id`) against real renderPaginatedPaper() output, plus the SW-A
// figure-image fix (draftPaperStore.mjs's inlineFigureImages /
// buildDraftPaginationPrintHtml, cr-step1-lite.md "步2/4 必验").
//
// NOT registered in verify-ci.mjs (see scripts/README.md "Runs in CI?" = no) —
// same reason as scripts/verify-draft-pagination-renderer.mjs and
// scripts/verify-draft-pagination-perf.mjs: this launches a real headless
// Chromium instance (playwright-core, channel:'chromium') and the main `verify`
// CI job's `npm ci` never installs a Chromium binary for server/'s
// playwright-core (only the e2e job installs one, for app/'s playwright). See
// those two scripts' headers for the full explanation; SW-B (cr-step1-lite.md)
// tracks the CI-wiring decision for step5.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { applyPaginationDomContract } from '../server/draft-paper/paginationDomContract.mjs'
import { withChromiumPage, closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('Draft-paper pagination DOM contract + SW-A figure-render verify')

// ─── Fixture: same 3-group, one-long-passage shape as
// verify-draft-pagination-renderer.mjs's determinism fixture (proven multi-page,
// with a group that spans multiple pages) — reused here so the split-group merge
// assertions below are exercising a real cross-page split, not a 1-page no-op. ───
function addDraftFooterCss(html, title) {
  return html.replace('</style>', `\n@page { @bottom-center { content: "${title} · " counter(page); font-size: 9pt; color: #666; } }\n</style>`)
}
function makeLongPassage(paragraphCount, marker) {
  const paras = [`MARKER_${marker}_START`]
  for (let i = 0; i < paragraphCount; i++) paras.push(`Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}`)
  paras.push(`MARKER_${marker}_END`)
  return paras.join('\n\n')
}
function makeGroup(id, marker, questionCount, paragraphCount) {
  const questions = []
  for (let i = 0; i < questionCount; i++) {
    questions.push({
      id: `${id}-q${i + 1}`,
      questionNo: i + 1,
      stem: `Question ${i + 1} for ${id}?`,
      answer: 'A',
      explanation: '',
      note: '',
      options: [{ label: 'A', content: 'First' }, { label: 'B', content: 'Second' }, { label: 'C', content: 'Third' }, { label: 'D', content: 'Fourth' }],
    })
  }
  return { id, title: `${id} title`, groupType: 'reading', defaultScore: 2, passage: { title: `${id} passage`, materialText: makeLongPassage(paragraphCount, marker), summary: '' }, questions }
}

const GROUP_SPECS = [
  { id: 'reading-a', marker: 'ALPHA', questionCount: 5, paragraphCount: 20 }, // spans multiple pages
  { id: 'reading-b', marker: 'BRAVO', questionCount: 5, paragraphCount: 4 },
  { id: 'reading-c', marker: 'CHARLIE', questionCount: 5, paragraphCount: 4 },
]
const GROUP_IDS = GROUP_SPECS.map((s) => s.id)

function buildFixtureHtml() {
  const groups = GROUP_SPECS.map((spec) => makeGroup(spec.id, spec.marker, spec.questionCount, spec.paragraphCount))
  const items = groups.map((detail) => ({ detail, score: 2, sectionTitle: '', note: '' }))
  const blocks = [{ type: 'section_header', title: '第一部分 阅读理解' }, ...groups.map((g) => ({ type: 'question_group', questionGroupId: g.id, score: 2 }))]
  const html = buildPrintHtml({ title: 'DOM Contract Fixture', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1 })
  return addDraftFooterCss(html, 'DOM Contract Fixture')
}

// Section-text extraction helper: pull every `<section class="question-group"
// data-group-id="X" ...>...</section>` block's inner text so marker placement
// can be checked per-id. `.question-group` sections never nest (confirmed:
// print-renderer.mjs emits them as flat siblings), so a non-greedy match to the
// next `</section>` is safe.
function sectionsById(html) {
  const byId = new Map()
  const re = /<section class="question-group" data-group-id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g
  let m
  while ((m = re.exec(html))) {
    const [, id, body] = m
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(body)
  }
  return byId
}

async function main() {
  // ─── 1. Multi-page contract shape ───
  const html = buildFixtureHtml()
  const rendered = await renderPaginatedPaper(html)
  assert('fixture actually spans multiple pages (pageCount > 1)', rendered.pageCount > 1, `pageCount=${rendered.pageCount}`)

  const contractHtml = applyPaginationDomContract(rendered.paginatedHtml, { groupIds: GROUP_IDS, pageCount: rendered.pageCount })

  assert('contract output has no <script> tag', !/<script/i.test(contractHtml))

  const previewPageMatches = contractHtml.match(/class="[^"]*\bpreview-page\b[^"]*"/g) || []
  assert(`.preview-page count (${previewPageMatches.length}) equals renderPaginatedPaper's pageCount (${rendered.pageCount})`, previewPageMatches.length === rendered.pageCount)
  const pagedjsPageMatches = contractHtml.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []
  assert(
    'every .pagedjs_page container also carries .preview-page (original pagedjs class preserved, not replaced)',
    pagedjsPageMatches.length === previewPageMatches.length && pagedjsPageMatches.every((tag) => tag.includes('preview-page')),
  )

  const byId = sectionsById(contractHtml)
  assert(`data-group-id is present for all ${GROUP_IDS.length} input groupIds`, GROUP_IDS.every((id) => byId.has(id)), `found ids: ${[...byId.keys()].join(', ')}`)
  assert('no unexpected extra data-group-id values appear', [...byId.keys()].every((id) => GROUP_IDS.includes(id)))

  for (const spec of GROUP_SPECS) {
    const bodies = byId.get(spec.id) || []
    assert(`group ${spec.id}: at least 1 fragment carries data-group-id`, bodies.length >= 1)
    const joined = bodies.join('')
    assert(`group ${spec.id}: MARKER_${spec.marker}_START appears under its own data-group-id`, joined.includes(`MARKER_${spec.marker}_START`))
    assert(`group ${spec.id}: MARKER_${spec.marker}_END appears under its own data-group-id`, joined.includes(`MARKER_${spec.marker}_END`))
    // no other group's fragments leaked this marker
    for (const other of GROUP_SPECS) {
      if (other.id === spec.id) continue
      const otherJoined = (byId.get(other.id) || []).join('')
      assert(`group ${other.id}'s fragments never contain group ${spec.id}'s marker (no cross-group leakage)`, !otherJoined.includes(`MARKER_${spec.marker}`))
    }
  }

  // Split-group merge: reading-a (20 paragraphs) must have split across MORE
  // THAN ONE fragment, all sharing the same data-group-id — the actual "同 group
  // 多片段同 id" assertion spike-gate-dp1.md finding #4 / plan.md step2 asks for.
  const readingAFragments = byId.get('reading-a') || []
  assert('reading-a (the long-passage group) is split into more than 1 fragment (proves this is a real cross-page split, not a same-page no-op)', readingAFragments.length > 1, `fragments=${readingAFragments.length}`)

  // Positional order: the FIRST data-group-id encountered in document order
  // must be groupIds[0], not shuffled — proves the ordering contract, not just
  // presence.
  const firstGroupIdMatch = /data-group-id="([^"]+)"/.exec(contractHtml)
  assert('the first data-group-id encountered in document order is groupIds[0] (positional mapping, not shuffled)', firstGroupIdMatch?.[1] === GROUP_IDS[0], `got ${firstGroupIdMatch?.[1]}`)

  // ─── 2. Fail-loud: a groupIds list that does not match the render must throw ───
  let threwOnMismatch = false
  try {
    applyPaginationDomContract(rendered.paginatedHtml, { groupIds: [GROUP_IDS[0], GROUP_IDS[1]], pageCount: rendered.pageCount })
  } catch {
    threwOnMismatch = true
  }
  assert('applyPaginationDomContract throws when groupIds.length does not match the actual fragment count', threwOnMismatch)

  let threwOnBadPageCount = false
  try {
    applyPaginationDomContract(rendered.paginatedHtml, { groupIds: GROUP_IDS, pageCount: rendered.pageCount + 5 })
  } catch {
    threwOnBadPageCount = true
  }
  assert('applyPaginationDomContract throws when pageCount does not match the actual .pagedjs_page count', threwOnBadPageCount)

  // ─── 3. SW-A: figure image actually loads through renderPaginatedPaper ───
  const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')
  const assetPath = path.join(paperAssetsDir, 'paper-2026-i', 'latest', 'paper-asset.json')
  const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
  const figureGroupId = 'group-2026-i-reading-a'
  const figureGroup = asset.content.groups[figureGroupId]
  assert('SW-A fixture group (group-2026-i-reading-a) exists in paper-2026-i', !!figureGroup)

  if (figureGroup) {
    const materialText = figureGroup.passage.paragraphs.map((p) => p.text).join('\n\n')
    const detailByGroupId = new Map([[figureGroupId, {
      id: figureGroupId,
      title: figureGroup.title,
      groupType: figureGroup.groupType,
      defaultScore: 2,
      passage: { title: figureGroup.title, materialText, summary: materialText },
      questions: [],
    }]])

    const store = createDraftPaperStore({
      exportDir: rootDir,
      getPrintReadyByGroupId: () => new Map(),
      getQuestionGroupDetail: (id) => detailByGroupId.get(id) || null,
      groupTypeLabels: { reading: '阅读理解' },
      isGroupPrintReady: () => ({ ok: true }),
      openDatabase: () => ({ close() {} }),
      openUserDatabase: () => { throw new Error('SW-A fixture never touches a real user db') },
      paperAssetsDir,
      rootDir,
      selectQuestionGroupCards: () => [],
    })

    const fakeDraftPaper = {
      id: 'sw-a-fixture',
      title: 'SW-A Fixture',
      items: [{ id: 'item-1', groupId: figureGroupId, orderIndex: 1, pageBreakBefore: false, groupMissing: false, questionGroup: { defaultScore: 2, groupType: 'reading' } }],
    }
    // buildDraftPrintHtml (called inside the store, via the public buildDraftPrintHtml
    // export) is the same function every OTHER caller uses — imageMode:'file' is what
    // this cut's buildDraftPaginationPrintHtml wiring passes internally; exercised here
    // directly since this fixture has no real sqlite draft to route through
    // getDraftPaperPagination end-to-end.
    const images = []
    const rawHtml = store.buildDraftPrintHtml(fakeDraftPaper, { versionType: 'student', imageMode: 'file', images })
    assert('SW-A fixture: buildDraftPrintHtml collected exactly 1 image', images.length === 1, `images=${images.length}`)

    const IMAGE_MIME_TYPES = { '.png': 'image/png' }
    let inlinedHtml = rawHtml
    for (const image of images) {
      const ext = path.extname(image.relativeName).toLowerCase()
      const mime = IMAGE_MIME_TYPES[ext] || 'application/octet-stream'
      const dataUri = `data:${mime};base64,${readFileSync(image.absoluteSourcePath).toString('base64')}`
      inlinedHtml = inlinedHtml.split(`src="${image.relativeName}"`).join(`src="${dataUri}"`)
    }
    assert('SW-A fixture: inlined HTML embeds a data: URI <img> (no bare relative filename left)', inlinedHtml.includes('<img src="data:image/png;base64,'))
    assert('SW-A fixture: inlined HTML has no lingering bare relative-filename img src', !inlinedHtml.includes(`src="${images[0].relativeName}"`))

    const figureRendered = await renderPaginatedPaper(inlinedHtml)
    const imgInfo = await withChromiumPage(async (page) => {
      await page.setContent(figureRendered.paginatedHtml, { waitUntil: 'load' })
      return page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'))
        return imgs.map((img) => ({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete }))
      })
    })
    assert('SW-A: the paginated output contains at least 1 <img>', imgInfo.length > 0, `imgInfo=${JSON.stringify(imgInfo)}`)
    assert(
      'SW-A: the figure <img> actually loaded real pixels (naturalWidth/naturalHeight > 0) inside renderPaginatedPaper\'s about:blank-based page.setContent()',
      imgInfo.every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
      `imgInfo=${JSON.stringify(imgInfo)}`,
    )

    // Control: WITHOUT the inlining fix (bare relative filename src, exactly what
    // buildDraftPrintHtml's imageMode:'file' produces on its own), the same probe
    // must reproduce the pre-fix broken state — proves the assertion above is
    // actually testing the fix, not a tautology.
    const controlRendered = await renderPaginatedPaper(rawHtml)
    const controlImgInfo = await withChromiumPage(async (page) => {
      await page.setContent(controlRendered.paginatedHtml, { waitUntil: 'load' })
      return page.evaluate(() => Array.from(document.querySelectorAll('img')).map((img) => ({ naturalWidth: img.naturalWidth, complete: img.complete })))
    })
    assert(
      'SW-A control: WITHOUT inlining, the same figure fails to load (naturalWidth stays 0) — confirms the fix is load-bearing, not a no-op',
      controlImgInfo.length > 0 && controlImgInfo.every((img) => img.naturalWidth === 0),
      `controlImgInfo=${JSON.stringify(controlImgInfo)}`,
    )
  }

  await closeChromiumPool()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.error('\nDraft-paper pagination DOM contract + SW-A verify FAILED')
    process.exit(1)
  }
  console.log('\nDraft-paper pagination DOM contract + SW-A verify passed')
}

main().catch(async (error) => {
  console.error('Draft-paper pagination DOM contract + SW-A verify CRASHED:', error)
  await closeChromiumPool().catch(() => {})
  process.exit(1)
})
