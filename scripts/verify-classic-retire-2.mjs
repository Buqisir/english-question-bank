#!/usr/bin/env node
/**
 * Verification: classic-retire-2-detail-view cut.
 *
 * Per plan.md step 4 as amended by PA MF-3 — source assertions only, no
 * duplicate API-behavior assertions (verify-owner-gate.mjs already proves
 * member 403 / owner 200 on the questionGroupRoutes.mjs write surface and
 * GET /api/question-groups/:id being member-open; this script does not
 * re-spawn a server to re-check that).
 *
 * Covers:
 *   1. QuestionGroupDetailView.tsx exists, is props-driven (no internal
 *      useState), and gates every write-surface control + all five AI ops
 *      trace sections behind `isOwnerView`.
 *   2. App.tsx no longer contains the old inline detail-hero JSX — the
 *      extraction actually happened, it isn't just an additional file.
 *   3. ConciergeGroupCard has the 详情 entry wired to `onOpenDetail`, and
 *      the prop is threaded through all three render points (ConciergeDesk
 *      x2, ConciergePaperRow x1) plus App.tsx's instantiation.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  PASS ${name}`)
  } else {
    failed += 1
    console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// ------------------------------------------------------------------ 1. component

const detailView = read('app/src/features/question-detail/QuestionGroupDetailView.tsx')

assert(
  'QuestionGroupDetailView has zero internal useState (props-driven, AdminWorkbench precedent)',
  !/\buseState\s*\(/.test(detailView),
)

assert(
  'QuestionGroupDetailView takes isOwnerView as a prop',
  /isOwnerView\s*:\s*boolean/.test(detailView),
)

// Write-surface controls gated by isOwnerView (plan step 2).
const gatedControls = [
  ['编辑 button (openEditEntry entry)', /isOwnerView && \([\s\S]{0,120}onClick=\{\(\) => onEdit\(selectedDetail\)\}/],
  ['verify/AI解析 button (non-reading)', /isOwnerView &&\s*\n\s*\(selectedDetail\.groupType === 'reading'/],
  ['topic-label generate button', /isOwnerView && \([\s\S]{0,120}onClick=\{onGenerateTopicLabels\}/],
  ['topic-label candidates + bind block', /isOwnerView && topicLabelRecommendations\.length > 0/],
  ['difficulty rating card (teacher-difficulty-card)', /isOwnerView && \([\s\S]{0,60}<div className="teacher-difficulty-card">/],
]
for (const [label, pattern] of gatedControls) {
  assert(`member-hidden control: ${label}`, pattern.test(detailView))
}

// The five AI ops trace sections (PA MF-1) — each must be wrapped in an
// isOwnerView check. These are matched by the field cluster
// (keyFingerprint/requestId/keySource/provider/latency) immediately
// preceded by an isOwnerView guard.
const traceSections = [
  ['topicLabelTrace', /isOwnerView && topicLabelTrace && \(/],
  ['readingParseResult trace', /isOwnerView && readingParseResult && \(\s*\n\s*<p className="detail-message" style=\{\{ marginTop: 12 \}\}>\s*\n\s*Provider: \{readingParseResult\.provider/],
  ['sevenChoicesParseResult trace', /isOwnerView && sevenChoicesParseResult && \(\s*\n\s*<p className="detail-message" style=\{\{ marginTop: 12 \}\}>\s*\n\s*Provider: \{sevenChoicesParseResult\.provider/],
  ['verifyResult trace', /isOwnerView && \(\s*\n\s*<p className="detail-message" style=\{\{ marginBottom: 12 \}\}>\s*\n\s*Provider: \{verifyResult\.provider/],
  ['grammarParseResult trace', /isOwnerView && \(\s*\n\s*<p className="detail-message" style=\{\{ marginBottom: 12 \}\}>\s*\n\s*Provider: \{grammarParseResult\.provider/],
]
for (const [label, pattern] of traceSections) {
  assert(`AI ops trace section hidden from member: ${label}`, pattern.test(detailView))
}

// Member-visible surfaces (plan step 2) must NOT be gated.
assert(
  '加入草稿卷 button stays visible to member (not gated by isOwnerView)',
  /<button\s*\n\s*className="add-button"\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => onAddToBasket\(selectedDetail\)\}/.test(detailView),
)
assert(
  'passage text section is unconditional (member-visible)',
  /<pre className="passage-text">/.test(detailView) && !/isOwnerView[\s\S]{0,40}<pre className="passage-text">/.test(detailView),
)

// ------------------------------------------------------------------ 2. detailHelpers + App.tsx extraction

const detailHelpers = read('app/src/features/question-detail/detailHelpers.ts')
for (const fn of ['getParseSavedAt', 'compactGroupMeta', 'getDifficultyDraftForQuestion', 'formatSavedAt']) {
  assert(`detailHelpers.ts defines ${fn} (single definition)`, new RegExp(`export function ${fn}\\(`).test(detailHelpers))
}

const appTsx = read('app/src/App.tsx')
assert(
  'App.tsx no longer contains the inline detail-hero JSX (extraction actually happened)',
  !appTsx.includes('<article className="detail-hero">'),
)
assert(
  'App.tsx instantiates QuestionGroupDetailView in the detail branch',
  /viewMode === 'detail' \? \(\s*\n\s*<QuestionGroupDetailView/.test(appTsx),
)
assert(
  'App.tsx does not duplicate getParseSavedAt/compactGroupMeta/getDifficultyDraftForQuestion definitions',
  !/^function getParseSavedAt\(/m.test(appTsx) &&
    !/^function compactGroupMeta\(/m.test(appTsx) &&
    !/^function getDifficultyDraftForQuestion\(/m.test(appTsx),
)
assert(
  'App.tsx re-imports the shared helpers from detailHelpers.ts (no duplicated copies)',
  /from '\.\/features\/question-detail\/detailHelpers'/.test(appTsx),
)
assert(
  'classic list detail button (App.tsx) is untouched and still calls openDetail',
  /<button className="detail-button" type="button" onClick=\{\(\) => openDetail\(group\.id\)\}>\s*\n\s*详情/.test(appTsx),
)

// ------------------------------------------------------------------ 3. onOpenDetail threading (SW-4 — all three render points)

const conciergeGroupCard = read('app/src/concierge/ConciergeGroupCard.tsx')
assert(
  'ConciergeGroupCard accepts onOpenDetail prop',
  /onOpenDetail\?\s*:\s*\(group: QuestionGroupCard\) => void/.test(conciergeGroupCard),
)
assert(
  'ConciergeGroupCard renders a 详情 button wired to onOpenDetail',
  /onClick=\{\(\) => onOpenDetail\(group\)\}[\s\S]{0,40}详情/.test(conciergeGroupCard),
)

const conciergePaperRow = read('app/src/concierge/ConciergePaperRow.tsx')
assert(
  'ConciergePaperRow accepts onOpenDetail prop',
  /onOpenDetail\?\s*:\s*\(group: QuestionGroupCard\) => void/.test(conciergePaperRow),
)
assert(
  'ConciergePaperRow passes onOpenDetail down to ConciergeGroupCard',
  /<ConciergeGroupCard[\s\S]{0,300}onOpenDetail=\{onOpenDetail\}/.test(conciergePaperRow),
)

const conciergeDesk = read('app/src/concierge/ConciergeDesk.tsx')
assert(
  'ConciergeDesk accepts onOpenDetail prop',
  /onOpenDetail\?\s*:\s*\(group: QuestionGroupCard\) => void/.test(conciergeDesk),
)
const conciergePaperRowRenderPoints = [...conciergeDesk.matchAll(/<ConciergePaperRow[\s\S]{0,600}?\/>/g)]
assert(
  'ConciergeDesk renders exactly 2 ConciergePaperRow instances (search results + feed)',
  conciergePaperRowRenderPoints.length === 2,
  `found ${conciergePaperRowRenderPoints.length}`,
)
const allRenderPointsPassOnOpenDetail = conciergePaperRowRenderPoints.every((match) =>
  /onOpenDetail=\{onOpenDetail\}/.test(match[0]),
)
assert(
  'ALL ConciergePaperRow render points in ConciergeDesk pass onOpenDetail through (SW-4 — no partial threading)',
  allRenderPointsPassOnOpenDetail,
)

assert(
  'App.tsx wires onOpenDetail={(group) => openDetail(group.id)} into <ConciergeDesk>',
  /<ConciergeDesk[\s\S]{0,400}onOpenDetail=\{\(group\) => openDetail\(group\.id\)\}/.test(appTsx),
)

// ------------------------------------------------------------------

console.log(`\nclassic-retire-2 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
