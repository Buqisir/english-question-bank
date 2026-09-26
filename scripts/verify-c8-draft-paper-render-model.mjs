#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function createDraftPaperRenderFixture() {
  const groupTypeLabels = {
    reading: '阅读理解',
    cloze: '完形填空',
    seven_choices: '七选五',
    grammar_cloze: '语法填空',
    writing: '写作',
    continuation: '读后续写',
    listening: '听力',
    other: '其他',
  }

  const groups = {
    'reading-a': {
      id: 'reading-a',
      title: 'Reading A',
      groupType: 'reading',
      defaultScore: 2,
      passage: { materialText: 'Alpha passage.', summary: '' },
      questions: [
        {
          stem: 'Question A?',
          options: [
            { label: 'A', content: 'First' },
            { label: 'B', content: 'Second' },
            { label: 'C', content: 'Third' },
            { label: 'D', content: 'Fourth' },
          ],
          answer: 'A',
          explanation: 'Alpha explanation.',
          note: '',
        },
      ],
    },
    'cloze-a': {
      id: 'cloze-a',
      title: 'Cloze A',
      groupType: 'cloze',
      defaultScore: 3,
      // draft-numbering-style: 'cloze' is a BLANK_BEARING_GROUP_TYPE — the
      // renderer's hard consistency assertion requires in-text blank count
      // to equal question count (1 blank __41__ == the 1 question below).
      passage: { materialText: 'Beta passage. __41__ more text.', summary: '' },
      questions: [
        {
          stem: 'Question B?',
          options: [
            { label: 'A', content: 'One' },
            { label: 'B', content: 'Two' },
            { label: 'C', content: 'Three' },
            { label: 'D', content: 'Four' },
          ],
          answer: 'B',
          explanation: 'Beta explanation.',
          note: '',
        },
      ],
    },
    'reading-b': {
      id: 'reading-b',
      title: 'Reading B',
      groupType: 'reading',
      defaultScore: 4,
      passage: { materialText: 'Gamma passage.', summary: '' },
      questions: [
        {
          stem: 'Question C?',
          options: [
            { label: 'A', content: 'Left' },
            { label: 'B', content: 'Right' },
            { label: 'C', content: 'Up' },
            { label: 'D', content: 'Down' },
          ],
          answer: 'C',
          explanation: 'Gamma explanation.',
          note: '',
        },
      ],
    },
  }

  const store = createDraftPaperStore({
    exportDir: '/tmp/eqb-h9-draft-render-run-form',
    getQuestionGroupDetail: (groupId) => groups[groupId] || null,
    groupTypeLabels,
    isGroupPrintReady: () => ({ ok: true, reason: null }),
    openDatabase: () => {
      throw new Error('openDatabase should not be called in the render run-form fixture')
    },
    rootDir,
    selectQuestionGroupCards: () => [],
  })

  const draftPaper = {
    id: 'draft-paper-test',
    title: 'H9 Draft',
    items: [
      {
        id: 'item-1',
        groupId: 'reading-a',
        orderIndex: 1,
        pageBreakBefore: false,
        groupType: 'reading',
        defaultScore: 2,
        questionGroup: { groupType: 'reading', defaultScore: 2 },
      },
      {
        id: 'item-2',
        groupId: 'cloze-a',
        orderIndex: 2,
        pageBreakBefore: true,
        groupType: 'cloze',
        defaultScore: 3,
        questionGroup: { groupType: 'cloze', defaultScore: 3 },
      },
      {
        id: 'item-3',
        groupId: 'reading-b',
        orderIndex: 3,
        pageBreakBefore: false,
        groupType: 'reading',
        defaultScore: 4,
        questionGroup: { groupType: 'reading', defaultScore: 4 },
      },
    ],
  }

  return { store, draftPaper }
}

console.log('C8 verify: draft paper render model')

const server = read('server/api.mjs')
const draftRoutes = read('server/draft-paper/draftPaperRoutes.mjs')
const draftStore = read('server/draft-paper/draftPaperStore.mjs')
const printRenderer = read('server/print-renderer.mjs')
// H9/C8 originally forbade touching print-renderer.mjs rendering logic.
// Restart cut ③ (docs/cuts/restart-2026-07-mainline/plan.md) was the first
// authorized, narrow supersession (isMetaStub() stub-hiding).
//
// 刀⑤ render-fidelity Chunk B (docs/cuts/render-fidelity/plan.md, PA-reviewed
// docs/cuts/render-fidelity/pa.md) is a SECOND, larger authorized
// supersession: it explicitly scopes in server/print-renderer.mjs to bring
// page margins / line-height / font stacks in line with
// docs/product/exam-paper-format-standards.md v2 (token-sourced), add
// paperBlankPattern-driven blank-marker styling (standard §6), and add the
// writing/continuation answer box (standard §8). That is a broad,
// deliberate rendering-logic rewrite — not the kind of narrow tweak an
// exact-line allow-list can track without becoming an unmaintainable
// transcript of the whole diff. Once 刀⑤ Chunk B lands on main, this
// baseline-diff freeze naturally re-arms against FUTURE unrelated drift
// (the new main already contains the authorized state), exactly as it did
// after restart-cut-③. For this cut we retire the line-level allow-list
// check itself rather than transcribe an unmaintainable copy of the diff;
// the C8/H9 behavioral assertions below (draft render model, footer
// injection, outline extraction, workbench boundaries) are unaffected and
// remain the real regression guard for THIS script's actual scope.
const draftRenderFixture = createDraftPaperRenderFixture()
const draftHtml = draftRenderFixture.store.buildDraftPrintHtml(draftRenderFixture.draftPaper)
const draftBody = draftHtml.slice(draftHtml.indexOf('<body'))
const firstSection = draftBody.indexOf('第一部分 阅读理解')
const firstQuestion = draftBody.indexOf('Question A?')
const pageBreak = draftBody.indexOf('<div class="page-break"></div>')
const secondSection = draftBody.indexOf('第二部分 完形填空')
const thirdSection = draftBody.indexOf('第三部分 阅读理解')

assert('draft render produces printable HTML via buildDraftPrintHtml', draftHtml.includes('<!DOCTYPE html>') && draftHtml.includes('H9 Draft'))
// draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): small-question
// numbering is WHOLE-PAPER continuous, "N." no parens (round-1's per-group
// reset to `(1)` is retired — owner QA verdict B). All 3 groups here
// (reading-a / cloze-a / reading-b) have exactly 1 question each, so they
// number 1, 2, 3 continuously across the whole draft paper.
assert('draft render numbers group 1 (reading-a) as 1.', draftBody.includes('<span class="qnum">1.</span>'))
assert('draft render numbers group 2 (cloze-a) as 2. (continues, not reset)', draftBody.includes('<span class="qnum">2.</span>'))
assert('draft render numbers group 3 (reading-b) as 3. (continues, not reset)', draftBody.includes('<span class="qnum">3.</span>'))
assert('draft render never emits the round-1 group-local "(1)" numbering format', !/<span class="qnum">\(\d+\)<\/span>/.test(draftBody))
// draft-numbering-style v2: 大题头由阿拉伯数字改汉字 (一、二、三…) —
// this fixture has 2 reading groups + 1 cloze group in that order.
assert('draft render 大题头 uses Chinese numerals (一/二/三), not Arabic digits', draftBody.includes('<div class="group-header">一、') && draftBody.includes('<div class="group-header">二、') && draftBody.includes('<div class="group-header">三、'))
assert('draft render uses exam print style', !draftBody.includes('group-meta'))
assert('draft render uses student version only', !draftBody.includes('【答案】') && !draftBody.includes('【解析】'))
assert('draft render emits section headers in type order', firstSection >= 0 && secondSection > firstSection && thirdSection > secondSection)
assert('draft render emits a page break before the second group only', firstSection >= 0 && firstQuestion > firstSection && pageBreak > firstQuestion && secondSection > pageBreak)
assert('draft render reopens a new section when group type returns later', thirdSection > secondSection)
assert('draft render keeps the standard complete footer', draftHtml.includes('英语试题第 ') && draftHtml.includes(' 页（共 ') && draftHtml.includes(' 页）') && draftHtml.includes('counter(pages)'))
assert('draft store does not override the standard footer with a product title', !draftStore.includes('addDraftFooterCss'))
assert(
  'print renderer owns page and total-page counters',
  /content:\s*"\$\{paperTypographyRuntime\.footerContract\.prefix\}"\s*counter\(page\)\s*"\$\{paperTypographyRuntime\.footerContract\.pageSuffix\}"\s*counter\(pages\)\s*"\$\{paperTypographyRuntime\.footerContract\.totalSuffix\}"/.test(printRenderer),
)
// draft-desk-b step4 (MF-2/MF-7, plan.md "步4 — PDF 换引擎收口 + Vivliostyle
// 草稿卷退役"): exportDraftPaperPdf no longer calls buildDraftPrintHtml +
// Vivliostyle CLI directly (that whole line, including `imageMode: 'file'` +
// `images: printImages`, is retired — see draftPaperStore.mjs's doc comment on
// exportDraftPaperPdf). It now consumes getDraftPaperPagination's pdfBytes — the
// SAME paged.js render that produced the on-screen paginated HTML — so parity is
// a construction guarantee. Natural turnover of the exact-source-text regex, not
// a change to what the assertion actually proves (the PDF endpoint still routes
// through the shared pipeline rather than rendering its own copy).
assert(
  'draft PDF endpoint consumes getDraftPaperPagination\'s pdfBytes (paged.js pipeline, Vivliostyle CLI line retired)',
  /const pagination = await getDraftPaperPagination\(userId, draftPaperId, \{ versionType: normalizedVersionType \}\)/.test(draftStore)
    && /body: pagination\.pdfBytes/.test(draftStore)
    && draftRoutes.includes('exportDraftPaperPdf'),
)
assert('empty export uses Chinese reason', draftStore.includes('请先添加题组') || draftRoutes.includes('请先添加题组'))

const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
// draft-desk-a: DraftPaperOutline.tsx retired (plan.md target form 3) —
// its aggregated-list rendering (drag/reorder + per-item source metadata +
// page-break controls) is replaced by DraftPaperRail.tsx (整卷页目录语言:
// title + count only, no source metadata) plus the paper-hover sticker
// (裁点1, rendered inline in DraftPaperWorkbench.tsx) for move/page-break/
// delete actions. Assertions below updated in lockstep; see draft-desk-a's
// plan.md Forbidden clause (verify assertions may be updated同刀 when they
// directly conflict with the assigned refactor).
const rail = read('app/src/features/draft-paper/DraftPaperRail.tsx')
const workbenchCss = read('app/src/features/draft-paper/DraftPaperWorkbench.css')
const previewHtml = read('app/src/features/draft-paper/draftPaperPreviewHtml.ts')
assert('preview uses iframe srcDoc from A4 preview HTML', /<iframe[\s\S]{0,120}srcDoc=\{previewHtml\}/.test(workbench))
assert('preview HTML generation lives outside workbench', workbench.includes("from './draftPaperPreviewHtml'") && !/function buildA4PreviewHtml/.test(workbench))
// draft-desk-b step3 (MF-3, plan.md "步3 — 前端吃分页 HTML + 常驻叠按钮"):
// server/draft-paper/paginationRenderer.mjs + paginationDomContract.mjs is now
// the SOLE pagination source (tech-recon.md "屏幕分页管线" / "parity 现状判断"
// — this cut exists specifically to retire the client's own independent
// pagination guess). buildA4PreviewHtml no longer paginates or owns page
// sizing (210mm/20mm padding were client-computed page-box dimensions that
// paged.js now owns server-side) — it only layers a thin screen-only card
// stylesheet on top of the already-paginated, already-contract-tagged HTML.
// Assertions updated in the same step per plan.md's step5 prediction ("门可能
// 被退役客户端分页触及，预判并同刀更新该门").
assert(
  'preview no longer owns page sizing/padding (paged.js computes this server-side now)',
  !previewHtml.includes('width: 210mm') && !previewHtml.includes('padding: 20mm 18mm'),
)
assert(
  'preview no longer re-paginates client-side (the retired paginateA4Preview greedy box-measuring pagination is gone)',
  !previewHtml.includes('paginateA4Preview') && !previewHtml.includes('function flatten('),
)
assert(
  'preview still hooks its screen card styling onto the server DOM contract\'s .preview-page class',
  previewHtml.includes('buildA4PreviewHtml') && previewHtml.includes('.preview-page'),
)
assert('preview iframe does not add a second mat color', previewHtml.includes('html {\n    background: transparent') && previewHtml.includes('body {\n    background: transparent') && workbenchCss.includes('.draft-a4-sheet iframe {\n  background: transparent'))
// teal-repaint C1/C7: mat 渐变从暖纸 #FAFAF7/#F4F2EC 改为中性 #F6F6F4/#EDEDEA
// （owner 墨绿契约 — bg/surface-2 新值），断言同步。
// draft-workbench-visual-unify (D8): the gradient mat was replaced with a
// flat surface-strong token per DESIGN.md's Flat-By-Default rule — the
// desk keeps its nested-layer identity via a solid fill instead of a
// two-stop gradient.
// warm-paper-promotion (色温法, owner 拍板 2026-07-10): the desk goes warm
// again — `--paper-desk-bg` (index.css, reuses paper-browse's `--paper-bg`
// warm cream) instead of the neutral `--surface-strong` — but it is STILL a
// flat token fill, never a gradient (去渐变桌 constraint carried forward
// from D8 unchanged).
assert('preview outer desk keeps subtle paper mat', /\.draft-preview-desk\s*\{[^}]*background:\s*var\(--paper-desk-bg\)/.test(workbenchCss))
// draft-desk-a: the iframe no longer pins a fixed 1188px CSS height — it
// grows to its rendered content's real height (multi-page drafts now scroll
// via the desk itself, not a fixed single-page window; see plan.md's
// technical constraint + DraftPaperWorkbench.tsx's nativeContentHeight
// state, read from the loaded iframe's own contentDocument).
assert('preview iframe height is driven by measured content, not a fixed CSS pin', !workbenchCss.includes('height: 1188px') && workbench.includes('nativeContentHeight'))
assert('workbench no longer opens a separate HTML print document', !/document\.write\(paginatedHtml\)/.test(workbench))
assert('A4 preview has no edit callbacks inside iframe', !/iframe[\s\S]{0,200}onClick/.test(workbench))
assert('rail extraction lives in its own component', workbench.includes("from './DraftPaperRail'") && workbench.includes('<DraftPaperRail'))
// 裁点1 (plan.md): the rail is a pure list (title + count, no source
// metadata) — move/page-break/delete now live on the paper-hover sticker in
// Workbench.tsx itself, not on a per-row outline control.
assert('rail component is a pure list (no per-row source metadata)', !rail.includes('compactSource'))
// Quiet rail: keep secondary counts in the full tooltip, not on every row.
assert(
  'rail does not repeat ordinals or question counts on each visible row',
  !rail.includes('className="draft-paper-rail-count"') && !rail.includes('className="draft-paper-rail-no"'),
)
assert(
  'rail row does NOT repeat groupTypeLabel inside the trailing count span (old complaint: 题型 X 阅读 X 4 行复读)',
  !/draft-paper-rail-count[^<]*groupTypeLabel/.test(rail),
)
assert(
  'rail row carries a title tooltip with the full label · 题型 · N 题',
  rail.includes('const rowTitle = isMissing ? undefined : `${label} · ${groupTypeText} · ${questionCount} 题`') &&
    rail.includes('title={rowTitle}'),
)
assert('workbench gates the page-break sticker action on non-first items (mirrors the old canPageBreakBefore = index > 0 rule)', workbench.includes('canPageBreakBefore = fullIndex > 0'))
// draft-desk-b step3 (PO-1, plan.md "PO 决策"): page-break suggestion display
// was DEFERRED that cut (owner 2026-07-12) — collected by print-form
// (docs/cuts/print-form/plan.md Must Do 5): pageBreakSuggestions now comes
// from the `/pagination` route response (real, pagination-derived, not the
// old DraftPaper.pageBreakSuggestions heuristic field) and renders as a quiet
// annotation badge (`.draft-group-suggestion`) inside the workbench's
// persistent per-group action cluster — never injected into the preview
// iframe's own HTML string (draftPaperPreviewHtml.ts stays a thin,
// presentational wrapper; see that module's own updated doc comment).
assert('page-break suggestions render as a quiet annotation badge in the workbench (PO-1 收账)', workbench.includes('draft-group-suggestion') && workbench.includes('建议前置分页'))
assert('suggestion badge click reuses the existing 前置分页 PATCH, not a second implementation', /draft-group-suggestion[\s\S]{0,200}togglePageBreak\(item, true\)/.test(workbench))
assert('the preview iframe HTML itself still carries no suggestion markup (draftPaperPreviewHtml.ts stays presentational-only)', !previewHtml.includes('break-hint') && !previewHtml.includes('draft-group-suggestion'))
assert('workbench no longer owns outline rendering details', !workbench.includes('compactSource(item)') && !workbench.includes('draft-outline-panel'))
assert('workbench exposes PDF download', workbench.includes('下载 PDF'))
assert('workbench prints through PDF only', !workbench.includes('浏览器打印') && !workbench.includes('browserPrint') && !workbench.includes('printWindow'))
assert('workbench has no answer export label', !workbench.includes('答案版'))
assert('workbench has no explanation export label', !workbench.includes('解析版'))
// C8 (trust-cracks) — undo toast 措辞: "题组已删除" → "题组已移出" (the remove
// action button is itself called 移除; the group stays in the question bank,
// undo only reverts this draft's removal, so "删除" over-claimed destruction).
assert('undo toast reads 题组已移出 (not 题组已删除)', workbench.includes('<span>题组已移出</span>') && !workbench.includes('题组已删除'))

if (failed > 0) {
  console.error(`\nC8 draft paper render model verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 draft paper render model verify passed: ${passed} passed, 0 failed`)
