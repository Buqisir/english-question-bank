#!/usr/bin/env node
// verify-resource: browser-render
// #489 5c compose pass: takes the same fixture and seeds as the 5b measure
// script, runs composePersonalExport + renderPaginatedPaper({ compose }) for
// real and keeps the evidence in .scratch/export-evidence/ (gitignored). The
// contract tests prove the compose hook is byte-neutral by default and that
// a changed base or a diagnostic-bearing plan refuses to export; the PDF
// evidence proves the composed product actually prints (base text, note
// cards and the 附页 sheet with its 附N entries are extractable, and the
// pages rasterize).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import {
  createPersonalPaperLayoutRuntime,
  stablePaginatedHtmlDigest,
} from '../server/personal-paper-layer/layout.mjs'
import { measurePersonalExportPlan, withChromiumPage } from '../server/personal-paper-layer/exportPlan.mjs'
import { composePersonalExport } from '../server/personal-paper-layer/exportComposer.mjs'
import {
  APPENDIX_MARKER_HEIGHT_MM,
  APPENDIX_MARKER_WIDTH_MM,
  buildPersonalLayerSource,
  normalizePersonalObjectInput,
} from '../shared/personal-paper-layer/index.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const PDFTOTEXT = '/opt/homebrew/bin/pdftotext'
const PDFTOPPM = '/opt/homebrew/bin/pdftoppm'

let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

// ---- the fixture harness from verify-personal-export-plan.mjs (in-process:
// no API server — the compose pass consumes the plan and the print HTML
// directly, exactly the shape the upper export route will hand it) ----------

const FAMILY_GROUP_TYPE = {
  reading: 'reading',
  'seven-choices': 'sevenChoices',
  cloze: 'cloze',
  'grammar-fill': 'grammarFill',
  'application-writing': 'writing',
  'continuation-writing': 'writing',
}

function canonicalServerAsset(committedAsset, consumption) {
  const asset = JSON.parse(committedAsset.toString('utf8'))
  const sourceGroups = Object.values(asset.content.groups)
  const alignedGroups = {}
  const alignedQuestions = {}
  const alignedAnswers = {}
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const template = asset.content.groups[groupId]
        ?? sourceGroups.find((group) => group.groupType === FAMILY_GROUP_TYPE[selection.familyContractId])
      if (!template) throw new Error(`no asset template for ${selection.familyContractId}`)
      const canonicalGroup = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      const aligned = { ...structuredClone(template), groupId }
      aligned.questionIds = canonicalGroup.questions.map((question) => question.questionId)
      alignedGroups[groupId] = aligned
      for (const [index, question] of canonicalGroup.questions.entries()) {
        const nativeId = template.questionIds?.[index] ?? null
        alignedQuestions[question.questionId] = {
          questionId: question.questionId,
          questionNo: Number(question.questionNo) || index + 1,
          stem: question.stem ?? '',
        }
        const nativeAnswer = nativeId ? asset.answerKey?.answers?.[nativeId] : null
        if (nativeAnswer) alignedAnswers[question.questionId] = { ...nativeAnswer }
      }
    }
  }
  asset.content.groups = alignedGroups
  asset.content.questions = alignedQuestions
  asset.answerKey.answers = alignedAnswers
  asset.content.blocks = asset.content.blocks.filter((block) => block.type !== 'group' || alignedGroups[block.groupId])
  const blockGroupIds = new Set(asset.content.blocks.filter((block) => block.type === 'group').map((block) => block.groupId))
  for (const groupId of Object.keys(alignedGroups)) {
    if (!blockGroupIds.has(groupId)) asset.content.blocks.push({ type: 'group', groupId })
  }
  return JSON.stringify(asset)
}

// ---- run ---------------------------------------------------------------------

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-export-pdf-'))
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
mkdirSync(paperAssetsDir, { recursive: true })
const evidenceDir = path.join(rootDir, '.scratch', 'export-evidence')
mkdirSync(evidenceDir, { recursive: true })

let db = null
try {
  const canonical = makeClozeGrammarCanonicalReferenceFixture()
  const asset = JSON.parse(new TextDecoder().decode(canonical.sourceAsset))
  const paperId = asset.paper.paperId
  db = new DatabaseSync(path.join(paperAssetsDir, 'publication.sqlite'))
  const published = publishCanonicalPaperPublication({
    rootDir: paperAssetsDir,
    db,
    request: canonical.request,
    sourceAssetVersion: 1,
    sourceAsset: canonical.sourceAsset,
  })
  if (published.status !== 'published') throw new Error(`publication failed: ${JSON.stringify(published)}`)
  const committedAsset = readFileSync(path.join(rootDir, 'app/public/paper-assets', paperId, 'latest/paper-asset.json'))
  const versionDir = path.join(paperAssetsDir, paperId, 'versions', published.versionName)
  writeFileSync(path.join(versionDir, 'paper-asset.json'), committedAsset)
  const canonicalRuntime = createCanonicalConsumerRuntime({ rootDir: paperAssetsDir, db })
  const printConsumption = canonicalRuntime.load({ paperId, consumerId: 'print_pdf' })
  mkdirSync(path.join(paperAssetsDir, paperId, 'latest'), { recursive: true })
  writeFileSync(path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
    canonicalServerAsset(committedAsset, printConsumption))
  writeFileSync(path.join(versionDir, 'import-meta.json'), `${JSON.stringify({
    paginationPlanBinding: {
      schemaVersion: 'paper-pagination-binding-v1',
      paperId,
      sourceAssetVersion: printConsumption.sourceAssetVersion,
      sourceDigest: printConsumption.sourceAssetDigest,
      canonicalSourceDigest: printConsumption.sourceAssetDigest,
      candidateDigest: null,
      planDigest: null,
    },
  })}\n`)

  const screenConsumption = canonicalRuntime.load({ paperId, consumerId: 'screen' })
  const source = buildPersonalLayerSource(screenConsumption)
  const assetAnswerKey = JSON.parse(committedAsset.toString('utf8')).answerKey
  const answers = new Map(Object.entries(assetAnswerKey.answers).map(([questionId, answer]) => [questionId, answer.answer]))
  const details = new Map(canonicalConsumptionPrintPayload(printConsumption, paperId, answers).details)
  const unused = () => { throw new Error('the export compose pass must not open a draft database') }
  const draftPaperStore = createDraftPaperStore({
    getQuestionGroupDetail: (groupId) => (details.has(groupId) ? structuredClone(details.get(groupId)) : null),
    groupTypeLabels: {},
    openDatabase: unused,
    openUserDatabase: unused,
    paperAssetsDir,
    resolveCanonicalConsumption: (input) => canonicalRuntime.resolveForItems(input),
    selectQuestionGroupCards: unused,
  })
  const layoutRuntime = createPersonalPaperLayoutRuntime({ loadCanonicalConsumption: (input) => canonicalRuntime.load(input), draftPaperStore })
  const layout = (await layoutRuntime.getLayout('verify-export-owner', { paperId })).body
  const printHtml = (await layoutRuntime.baseRenderInput('verify-export-owner', { paperId, layoutId: layout.layoutId })).printHtml

  const noteStream = source.streams.find((item) => item.role === 'passage-body' && item.text.length > 260)
  if (!noteStream) throw new Error('no long passage-body stream for anchors')
  const anchor = (start, end) => ({
    paperId,
    sourceRevision: source.sourceRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    segments: [{ streamId: noteStream.streamId, start, end, exactText: noteStream.text.slice(start, end) }],
  })
  const anchorText = (text) => {
    const start = noteStream.text.indexOf(text)
    if (start < 0) throw new Error(`anchor text missing: ${text}`)
    return anchor(start, start + text.length)
  }
  const doc = (text) => createPersonalTextDocumentFromPlainText(text)
  const pageOne = layout.pages[0].pageId
  const pageTwo = layout.pages[1]?.pageId ?? pageOne

  // Healthy seeds only: every object must compose, so nothing may carry a
  // diagnostic (the diagnostic seeds come back in their own negative case).
  const healthySeeds = [
    {
      id: 'pdf-hl-crossline',
      type: 'highlight',
      style: { color: 'yellow' },
      textAnchor: anchor(0, 60),
    },
    {
      id: 'pdf-ul-red',
      type: 'underline',
      style: { ink: 'red' },
      textAnchor: anchor(70, 90),
    },
    {
      id: 'pdf-note-auto-1',
      type: 'anchored-note',
      // Long enough to wrap in the ~20mm margin card: its text is verified by
      // a rect-bounded pdftotext extraction (whole-page extraction interleaves
      // the wrapped fragments with the body lines sharing its baselines).
      document: doc('第一条成品旁注。'),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'auto-near-anchor' },
    },
    {
      id: 'pdf-note-fixed',
      type: 'anchored-note',
      document: doc('手摆旁注，随卷导出。'),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 20, yMm: 250, widthMm: 56 },
    },
    {
      id: 'pdf-box-1',
      type: 'text-box',
      document: doc('成品文字框'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 30, yMm: 40, widthMm: 60 },
    },
    {
      id: 'pdf-appendix-note',
      type: 'anchored-note',
      document: doc('转附页旁注。'),
      textAnchor: anchorText('most of my classmates thought of Ohio'),
      placement: {
        kind: 'appendix',
        origin: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageTwo, xMm: 30, yMm: 30, widthMm: 56 },
      },
    },
    {
      id: 'pdf-appendix-box',
      type: 'text-box',
      document: doc('旧出处文字框'),
      placement: {
        kind: 'appendix',
        origin: { kind: 'page-position', layoutId: 'old-layout-1990', pageId: pageOne, xMm: 30, yMm: 30, widthMm: 60 },
      },
    },
  ]
  const objects = healthySeeds.map((input) => normalizePersonalObjectInput(source, input))

  const plan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects,
  })
  writeFileSync(path.join(evidenceDir, 'export-plan.json'), JSON.stringify(plan, null, 2))
  check('the healthy plan carries no diagnostics', Array.isArray(plan.diagnostics) && plan.diagnostics.length === 0,
    JSON.stringify(plan.diagnostics))
  check('the healthy plan has marks, cards and a two-entry appendix',
    plan.marks.length === 2 && plan.cards.length === 3 && plan.appendix.length === 2 && plan.markers.length === 1,
    JSON.stringify({ marks: plan.marks.length, cards: plan.cards.length, appendix: plan.appendix.length, markers: plan.markers.length }))

  // ---- the 5c marker-collision case: a note card parked on the appendix
  // marker's resting spot must push the marker clear, in the plan itself ----
  const restingMarker = plan.markers.find((marker) => marker.objectId === 'pdf-appendix-note')
  if (!restingMarker) throw new Error('appendix marker missing from the healthy plan')
  const collisionPlan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects: [...objects, normalizePersonalObjectInput(source, {
      id: 'pdf-note-marker-block',
      type: 'anchored-note',
      document: doc('占位旁注。'),
      textAnchor: anchorText('as a whole different world'),
      // Narrow card parked on the resting marker rect (centered chips start
      // width/2 left of xMm, +1mm slack): it covers the un-avoided marker
      // completely while staying inside the left margin's white space, so the
      // evidence page shows a margin-dodging marker, not a text-covering card.
      placement: {
        kind: 'page-position',
        layoutId: layout.layoutId,
        pageId: restingMarker.pageId,
        xMm: Math.round((restingMarker.xMm - APPENDIX_MARKER_WIDTH_MM / 2 - 1) * 100) / 100,
        yMm: restingMarker.yMm,
        widthMm: 17,
      },
    })],
  })
  check('the collision plan carries no diagnostics', collisionPlan.diagnostics.length === 0,
    JSON.stringify(collisionPlan.diagnostics))
  const dodgedMarker = collisionPlan.markers.find((marker) => marker.objectId === 'pdf-appendix-note')
  const blockCard = collisionPlan.cards.find((card) => card.objectId === 'pdf-note-marker-block')
  check('the blocked appendix marker steps down and reports moved in the plan',
    dodgedMarker && blockCard && dodgedMarker.moved === 'down' && dodgedMarker.blocked === false
      && dodgedMarker.yMm > restingMarker.yMm,
    JSON.stringify({ resting: restingMarker, dodged: dodgedMarker }))
  const dodgedRect = {
    left: dodgedMarker.xMm - (dodgedMarker.centered ? APPENDIX_MARKER_WIDTH_MM / 2 : 0),
    top: dodgedMarker.yMm,
    width: APPENDIX_MARKER_WIDTH_MM,
    height: APPENDIX_MARKER_HEIGHT_MM,
  }
  const clearOfCard = (rect, card) => rect.left + rect.width + 1 <= card.xMm || card.xMm + card.widthMm + 1 <= rect.left
    || rect.top + rect.height + 1 <= card.yMm || card.yMm + card.heightMm + 1 <= rect.top
  check('the plan marker rect and the parked card rect do not intersect',
    clearOfCard(dodgedRect, blockCard),
    JSON.stringify({ markerRect: dodgedRect, card: { xMm: blockCard.xMm, yMm: blockCard.yMm, widthMm: blockCard.widthMm, heightMm: blockCard.heightMm } }))
  writeFileSync(path.join(evidenceDir, 'export-plan-collision.json'), JSON.stringify(collisionPlan, null, 2))

  // ---- negative: a plan with diagnostics never reaches the render pass ------
  const diagnosticSeeds = [
    {
      id: 'pdf-note-overflow',
      type: 'anchored-note',
      document: doc(Array.from({ length: 6 }, (_, line) => `溢出旁注第${line + 1}行，故意写得比较长以便撑出页底。`).join('\n')),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 20, yMm: 285, widthMm: 56 },
    },
    {
      id: 'pdf-box-old',
      type: 'text-box',
      document: doc('旧版式文字框'),
      placement: { kind: 'page-position', layoutId: 'old-layout-1990', pageId: pageOne, xMm: 30, yMm: 30, widthMm: 60 },
    },
  ]
  const diagnosticPlan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects: [...objects, ...diagnosticSeeds.map((input) => normalizePersonalObjectInput(source, input))],
  })
  check('the diagnostic plan really carries diagnostics', diagnosticPlan.diagnostics.length > 0,
    JSON.stringify(diagnosticPlan.diagnostics))
  // 本步在脚本里直接断言：diagnostics 非空时脚本不调用成品遍（模拟上层拒导）。
  let diagnosticsGate = null
  try { composePersonalExport({ printHtml, plan: diagnosticPlan, layoutRef: layout.layoutRef }) } catch (error) { diagnosticsGate = error }
  check('composePersonalExport refuses a plan with diagnostics (PERSONAL_EXPORT_HAS_DIAGNOSTICS)',
    diagnosticsGate?.code === 'PERSONAL_EXPORT_HAS_DIAGNOSTICS',
    JSON.stringify(diagnosticsGate && { code: diagnosticsGate.code, message: diagnosticsGate.message }))

  // ---- contract: the compose hook is byte-neutral by default ----------------
  const marksOnlyPlan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects: objects.filter((object) => object.type === 'highlight' || object.type === 'underline'),
  })
  const marksOnlyComposed = composePersonalExport({ printHtml, plan: marksOnlyPlan, layoutRef: layout.layoutRef })
  check('a marks-only plan leaves the print HTML byte-identical (no appendix, no text cards)',
    marksOnlyComposed.printHtml === printHtml)
  const plain = await renderPaginatedPaper(printHtml)
  check('the compose-omitted render is byte-identical to the recorded base layout',
    stablePaginatedHtmlDigest(plain.paginatedHtml) === layout.layoutRef.paginatedHtmlDigest
    && plain.pageCount === layout.pages.length,
    `render ${stablePaginatedHtmlDigest(plain.paginatedHtml).slice(0, 24)} vs recorded ${layout.layoutRef.paginatedHtmlDigest.slice(0, 24)}`)

  // ---- the real composed render (the collision fixture rides along, so the
  // page PNGs show the dodged marker next to the parked note card) -----------
  const composed = composePersonalExport({ printHtml, plan: collisionPlan, layoutRef: layout.layoutRef })
  check('an appendix-bearing plan appends the appendix sheet and style block before </body>',
    composed.printHtml !== printHtml
    && composed.printHtml.trimEnd().endsWith('</html>')
    && composed.printHtml.includes('class="personal-appendix"')
    && composed.printHtml.includes('@page personal-appendix'),
    `base ${printHtml.length} bytes -> composed ${composed.printHtml.length} bytes`)

  const renderStartedAt = Date.now()
  const rendered = await renderPaginatedPaper(composed.printHtml, { compose: composed.compose })
  const renderMs = Date.now() - renderStartedAt
  const composedPageCount = (rendered.paginatedHtml.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  const appendixPageCount = composedPageCount - collisionPlan.pageCount
  check('the composed render has the base pages plus at least one appendix page',
    rendered.pageCount === composedPageCount && composedPageCount > collisionPlan.pageCount,
    `base ${collisionPlan.pageCount} + appendix ${appendixPageCount} = ${composedPageCount}`)

  // ---- PDF evidence ------------------------------------------------------------
  const pdfPath = path.join(evidenceDir, 'personal-export-composed.pdf')
  writeFileSync(pdfPath, rendered.pdfBytes)
  writeFileSync(path.join(evidenceDir, 'paginated-composed.html'), rendered.paginatedHtml)
  const pdfBytes = statSync(pdfPath).size
  console.log(`INFO composed render ${renderMs} ms, PDF ${(pdfBytes / 1024).toFixed(0)} KiB, ${composedPageCount} pages`)

  const txtPath = path.join(evidenceDir, 'personal-export-composed.txt')
  execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', pdfPath, txtPath])
  const pdfText = readFileSync(txtPath, 'utf8')
  // pdftotext wraps card text across lines, so match against whitespace-free
  // text on both sides.
  const flat = (value) => value.replace(/\s+/gu, '')
  const flatPdf = flat(pdfText)
  const baseSentence = flat(noteStream.text.slice(0, 40))
  check('pdftotext finds the base sentence on the paginated base', flatPdf.includes(baseSentence),
    JSON.stringify(baseSentence))
  check('pdftotext finds the fixed note card text in the PDF', flatPdf.includes(flat('手摆旁注，随卷导出。')))
  // pdftotext crop options are pixel coordinates at 72dpi (1pt = 1px); the
  // plan speaks page-internal mm. Whole-page extraction interleaves a wrapped
  // margin card's fragments with the body lines sharing its baselines, so
  // wrapped cards are verified within their own plan rect instead.
  const mmToPt = (mm) => (mm * 72) / 25.4
  const extractRectText = (pageNo, rect, slackMm = 1) => {
    const outPath = path.join(evidenceDir, `rect-extract-p${pageNo}-x${Math.round(rect.xMm)}.txt`)
    execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', '-f', String(pageNo), '-l', String(pageNo),
      '-x', String(Math.max(0, Math.round(mmToPt(rect.xMm - slackMm)))),
      '-y', String(Math.max(0, Math.round(mmToPt(rect.yMm - slackMm)))),
      '-W', String(Math.round(mmToPt(rect.widthMm + 2 * slackMm))),
      '-H', String(Math.round(mmToPt(rect.heightMm + 2 * slackMm))),
      pdfPath, outPath])
    return readFileSync(outPath, 'utf8')
  }
  const autoCard = collisionPlan.cards.find((card) => card.objectId === 'pdf-note-auto-1')
  const autoCardPage = collisionPlan.pages.findIndex((page) => page.pageId === autoCard?.pageId) + 1
  const autoCardText = autoCard ? extractRectText(autoCardPage, { xMm: autoCard.xMm, yMm: autoCard.yMm, widthMm: autoCard.widthMm, heightMm: autoCard.heightMm }) : ''
  check('pdftotext extracts the wrapped auto note card text within its own rect',
    autoCardText !== '' && flat(autoCardText).includes(flat('第一条成品旁注。')),
    JSON.stringify({ card: autoCard && { pageId: autoCard.pageId, xMm: autoCard.xMm, yMm: autoCard.yMm, widthMm: autoCard.widthMm, heightMm: autoCard.heightMm }, text: autoCardText.slice(0, 120) }))
  check('pdftotext finds the text box text in the PDF', flatPdf.includes(flat('成品文字框')))
  check('pdftotext finds the appendix body and the 附页 footer',
    flatPdf.includes(flat('转附页旁注。')) && /附页\s*\d+/.test(pdfText),
    pdfText.slice(-300).replace(/\n+/gu, ' | '))
  check('pdftotext finds the hanging 附1 marker for the appendix entry', /附\s*1/.test(pdfText))

  const highlightMark = collisionPlan.marks.find((mark) => mark.type === 'highlight')
  const highlightPageIndex = collisionPlan.pages.findIndex((page) => page.pageId === highlightMark?.pageId) + 1
  const markerPageIndex = collisionPlan.pages.findIndex((page) => page.pageId === dodgedMarker?.pageId) + 1
  const shots = [
    { name: 'first-page', page: 1 },
    { name: 'highlight-page', page: highlightPageIndex },
    // The parked card and the dodged 附N marker are on the anchor page.
    { name: 'marker-page', page: markerPageIndex },
    { name: 'appendix-first', page: collisionPlan.pageCount + 1 },
  ]
  const pngs = []
  for (const shot of shots) {
    execFileSync(PDFTOPPM, ['-png', '-r', '80', '-f', String(shot.page), '-l', String(shot.page), pdfPath,
      path.join(evidenceDir, shot.name)])
  }
  for (const name of readdirSync(evidenceDir)) {
    if (name.endsWith('.png')) pngs.push(name)
  }
  check('pdftoppm rasterized first page, highlight page, marker page and first appendix page',
    pngs.length >= 4 && pngs.every((name) => statSync(path.join(evidenceDir, name)).size > 0),
    pngs.sort().join(', '))

  // ---- the highlight must print under the glyphs (5c zoom regression) --------
  // Whole-page checks above can pass while an opaque highlight bar hides the
  // text, so the rendered highlight page is analyzed pixel by pixel: the
  // highlight color must be present AND dark glyph pixels must survive at a
  // density comparable to the same text line's unhighlighted remainder.
  const HIGHLIGHT_DPI = 200
  execFileSync(PDFTOPPM, ['-png', '-r', String(HIGHLIGHT_DPI), '-f', String(highlightPageIndex),
    '-l', String(highlightPageIndex), pdfPath, path.join(evidenceDir, 'highlight-page-200dpi')])
  const dpiPngName = readdirSync(evidenceDir).filter((name) => name.startsWith('highlight-page-200dpi') && name.endsWith('.png'))[0]
  if (!dpiPngName) throw new Error('200dpi highlight page raster missing')
  const highlightPage = collisionPlan.pages[highlightPageIndex - 1]
  const hlRects = highlightMark.rectsMm
  // The anchor's own words must extract within the highlight's union rect.
  const hlUnion = {
    xMm: Math.min(...hlRects.map((rect) => rect.xMm)),
    yMm: Math.min(...hlRects.map((rect) => rect.yMm)),
  }
  hlUnion.widthMm = Math.max(...hlRects.map((rect) => rect.xMm + rect.widthMm)) - hlUnion.xMm
  hlUnion.heightMm = Math.max(...hlRects.map((rect) => rect.yMm + rect.heightMm)) - hlUnion.yMm
  const highlightedWords = noteStream.text.slice(0, 60)
  const hlRectText = extractRectText(highlightPageIndex, hlUnion, 2)
  check('pdftotext extracts the highlighted words within the highlight rect',
    hlRectText !== '' && flat(hlRectText).includes(flat(highlightedWords)),
    JSON.stringify({ union: hlUnion, text: hlRectText.slice(0, 160) }))

  const highlightEvidence = await withChromiumPage(async (analysisPage) => analysisPage.evaluate(async ({ src, rects, union, contentLeftMm, contentRightMm, dpi }) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('png decode failed'))
      image.src = src
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const pxPerMm = dpi / 25.4
    const sample = (x0Mm, y0Mm, x1Mm, y1Mm) => {
      const sx = Math.max(0, Math.floor(x0Mm * pxPerMm))
      const sy = Math.max(0, Math.floor(y0Mm * pxPerMm))
      const ex = Math.min(image.width, Math.ceil(x1Mm * pxPerMm))
      const ey = Math.min(image.height, Math.ceil(y1Mm * pxPerMm))
      if (ex <= sx || ey <= sy) return null
      const data = ctx.getImageData(sx, sy, ex - sx, ey - sy).data
      let highlight = 0
      let dark = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (0.2126 * r + 0.7152 * g + 0.0722 * b < 100) dark += 1
        if (Math.abs(r - 249) < 50 && Math.abs(g - 224) < 50 && Math.abs(b - 138) < 70) highlight += 1
      }
      return { highlight, dark, total: (ex - sx) * (ey - sy) }
    }
    const inside = { highlight: 0, dark: 0, total: 0 }
    const control = { dark: 0, total: 0 }
    for (const rect of rects) {
      const part = sample(rect.xMm, rect.yMm, rect.xMm + rect.widthMm, rect.yMm + rect.heightMm)
      if (part) {
        inside.highlight += part.highlight
        inside.dark += part.dark
        inside.total += part.total
      }
      // Same row band, text column, minus the row-overlapping highlight
      // rects' own spans (plus a 0.5mm fringe): the same line's
      // unhighlighted glyphs are the density reference.
      const rowOverlap = (other) => other.yMm - 0.5 < rect.yMm + rect.heightMm
        && other.yMm + other.heightMm + 0.5 > rect.yMm
      const spans = rects.filter(rowOverlap)
        .map((other) => [other.xMm - 0.5, other.xMm + other.widthMm + 0.5])
      let bands = [[contentLeftMm + 0.5, contentRightMm - 0.5]]
      for (const [lo, hi] of spans) {
        bands = bands.flatMap(([a, b]) => {
          if (hi <= a || lo >= b) return [[a, b]]
          return [...(lo > a ? [[a, lo]] : []), ...(hi < b ? [[hi, b]] : [])]
        })
      }
      for (const [a, b] of bands) {
        const bandPart = sample(a, rect.yMm, b, rect.yMm + rect.heightMm)
        if (bandPart) {
          control.dark += bandPart.dark
          control.total += bandPart.total
        }
      }
    }
    // 200dpi crop of the highlighted line for eyeball evidence.
    const padPx = 4 * pxPerMm
    const cx = Math.max(0, Math.floor(union.xMm * pxPerMm - padPx))
    const cy = Math.max(0, Math.floor(union.yMm * pxPerMm - padPx))
    const cw = Math.min(image.width - cx, Math.ceil(union.widthMm * pxPerMm + 2 * padPx))
    const ch = Math.min(image.height - cy, Math.ceil(union.heightMm * pxPerMm + 2 * padPx))
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cw
    cropCanvas.height = ch
    cropCanvas.getContext('2d').drawImage(image, cx, cy, cw, ch, 0, 0, cw, ch)
    return {
      inside,
      control,
      imageSize: { width: image.width, height: image.height },
      cropDataUrl: cropCanvas.toDataURL('image/png'),
    }
  }, {
    src: `data:image/png;base64,${readFileSync(path.join(evidenceDir, dpiPngName)).toString('base64')}`,
    rects: hlRects,
    union: hlUnion,
    contentLeftMm: highlightPage.contentLeftMm,
    contentRightMm: highlightPage.contentRightMm,
    dpi: HIGHLIGHT_DPI,
  }).catch((error) => ({ error: error.message })))
  check('the 200dpi highlight page raster decodes and its rects carry highlight color',
    highlightEvidence.inside && highlightEvidence.inside.total > 0
      && highlightEvidence.inside.highlight / highlightEvidence.inside.total >= 0.05
      && highlightEvidence.imageSize.width > highlightEvidence.imageSize.height / 2,
    JSON.stringify(highlightEvidence.error ?? highlightEvidence))
  check('glyph pixels survive inside the highlight rects at a density comparable to the same line outside',
    highlightEvidence.control && highlightEvidence.control.total > 0 && highlightEvidence.control.dark > 0
      && highlightEvidence.inside.dark / highlightEvidence.inside.total
        >= 0.3 * (highlightEvidence.control.dark / highlightEvidence.control.total),
    JSON.stringify(highlightEvidence.error ?? {
      insideDarkRatio: highlightEvidence.inside && highlightEvidence.inside.total > 0
        ? +(highlightEvidence.inside.dark / highlightEvidence.inside.total).toFixed(4) : null,
      controlDarkRatio: highlightEvidence.control && highlightEvidence.control.total > 0
        ? +(highlightEvidence.control.dark / highlightEvidence.control.total).toFixed(4) : null,
    }))
  const cropPath = path.join(evidenceDir, 'highlight-zoom.png')
  writeFileSync(cropPath, Buffer.from(highlightEvidence.cropDataUrl.split(',')[1], 'base64'))
  check('the 200dpi crop of the highlighted line is kept as highlight-zoom.png',
    statSync(cropPath).size > 0)

  // ---- negative: a tampered base digest refuses to export ---------------------
  const tampered = {
    ...collisionPlan,
    basePageTextDigests: collisionPlan.basePageTextDigests.map((digest, index) => (
      index === 0 ? `sha256:${'0'.repeat(64)}` : digest)),
  }
  const tamperedComposed = composePersonalExport({ printHtml, plan: tampered, layoutRef: layout.layoutRef })
  let baseChanged = null
  try { await renderPaginatedPaper(tamperedComposed.printHtml, { compose: tamperedComposed.compose }) } catch (error) { baseChanged = error }
  check('a tampered base digest is refused with PERSONAL_EXPORT_BASE_CHANGED',
    baseChanged?.code === 'PERSONAL_EXPORT_BASE_CHANGED',
    JSON.stringify(baseChanged && { code: baseChanged.code, details: baseChanged.details }))
} finally {
  await closeChromiumPool()
  if (db) db.close()
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\nevidence kept in ${evidenceDir}`)
console.log(failed === 0 ? 'verify-personal-export-pdf: all checks passed' : `verify-personal-export-pdf: ${failed} failed (${passed} passed)`)
process.exit(failed === 0 ? 0 : 1)
