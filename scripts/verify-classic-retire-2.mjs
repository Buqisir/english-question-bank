#!/usr/bin/env node
/**
 * Verification: detail-consume-only cut (formerly classic-retire-2-detail-view).
 *
 * detail-consume-only (ADR-0015, PA MF-1) retired the 网站现场生产 surface
 * from QuestionGroupDetailView.tsx: per-group-type "跑 AI 解析/保存解析",
 * 主题划分/绑定候选, 难度标定 (teacher-difficulty-card), and every AI
 * ops-trace paragraph (provider/model/keySource/keyFingerprint/requestId/
 * latency). This script's assertions are REVERSED from the prior cut: it now
 * asserts those surfaces are ABSENT, while continuing to assert the surfaces
 * this cut explicitly keeps (编辑 button, passage section, 加入草稿卷,
 * onOpenDetail threading) are present.
 *
 * Covers:
 *   1. QuestionGroupDetailView.tsx exists, is props-driven (no internal
 *      useState), keeps 编辑/删除 owner-gated, and no longer contains any of
 *      the retired 现场生产 controls or AI ops-trace sections.
 *   2. App.tsx no longer contains the old inline detail-hero JSX (extraction
 *      still holds) and no longer defines the deleted WRITE handlers.
 *   3. ConciergeGroupCard has the 详情 entry wired to `onOpenDetail`, and the
 *      prop is threaded through all three render points (ConciergeDesk x2,
 *      ConciergePaperRow x1) plus App.tsx's instantiation — unaffected by
 *      this cut, kept green.
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

// Kept owner-only control: 编辑 (低频纠错运维, D1/C3).
assert(
  'member-hidden control still present: 编辑 button (openEditEntry entry)',
  /isOwnerView && \([\s\S]{0,120}onClick=\{\(\) => onEdit\(selectedDetail\)\}/.test(detailView),
)

// Retired 现场生产 controls (D2/C1) — must be ABSENT now.
const retiredControls = [
  ['non-reading AI解析 button (onVerify)', /onClick=\{onVerify\}/],
  ['reading AI解析 button (onAnalyzeReading)', /onClick=\{onAnalyzeReading\}/],
  ['topic-label generate button (onGenerateTopicLabels)', /onGenerateTopicLabels/],
  ['topic-label candidates + bind block', /topic-label-candidates|onBindTopicLabels|onToggleTopicLabel/],
  ['difficulty rating card (teacher-difficulty-card)', /teacher-difficulty-card/],
  ['difficulty review queue (difficulty-review-panel)', /difficulty-review-panel/],
  ['difficulty calibration report', /calibration-report/],
  ['DifficultyProfileGrid render', /<DifficultyProfileGrid/],
  ['synonym-difficulty-card', /synonym-difficulty-card/],
  ['save-parse handlers (onSaveReadingParse/onSaveClozeParse/onSaveSevenChoicesParse/onSaveGrammarParse)', /onSaveReadingParse|onSaveClozeParse|onSaveSevenChoicesParse|onSaveGrammarParse/],
  ['difficulty draft handlers (onSaveQuestionDifficulty/onUpdateDifficultyDraft)', /onSaveQuestionDifficulty|onUpdateDifficultyDraft/],
]
for (const [label, pattern] of retiredControls) {
  assert(`retired 现场生产 control absent: ${label}`, !pattern.test(detailView), 'pattern still matched detailView')
}

// The five AI ops trace sections (PA MF-1, prior cut) are now fully retired —
// none of the ops-trace field clusters should remain anywhere in the file.
// Note: verifyResult.totalLatencyMs ("全量耗时: {ms} ms · 全量调度完成") is a
// DIFFERENT, member-visible field (C2, kept) — it was never gated by
// isOwnerView even before this cut, unlike the four owner-only 全量耗时
// occurrences (topicLabelTrace/readingParseResult/sevenChoicesParseResult/
// grammarParseResult), so it is deliberately excluded from this list.
const traceFieldClusters = [
  ['keyFingerprint', /keyFingerprint/],
  ['requestId ops-trace label ("call trace:")', /call trace:/],
  ['keySource label ("key 来源:")', /key 来源:/],
  ['provider ops-trace label ("Provider:")', /Provider:\s*\{/],
  ['owner-only 全量耗时 (parse-result ops-trace)', /\.totalLatencyMs\s*(!==\s*undefined\s*)?\?\s*` · 全量耗时:/],
]
for (const [label, pattern] of traceFieldClusters) {
  assert(`AI ops trace field retired: ${label}`, !pattern.test(detailView), 'pattern still matched detailView')
}
assert(
  'member-visible verifyResult.totalLatencyMs summary line stays present (C2, not an ops-trace field)',
  /全量耗时: \{verifyResult\.totalLatencyMs\} ms · 全量调度完成/.test(detailView),
)

// Member-visible surfaces (kept, C2/C3) must remain unconditional / present.
assert(
  '加入草稿卷 button stays visible to member (not gated by isOwnerView)',
  /<button\s*\n\s*className="add-button"\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => onAddToBasket\(selectedDetail\)\}/.test(detailView),
)
assert(
  'passage text section is unconditional (member-visible)',
  /<pre className="passage-text">/.test(detailView) && !/isOwnerView[\s\S]{0,40}<pre className="passage-text">/.test(detailView),
)
assert(
  '删除 button stays owner-gated (kept, C3)',
  /isOwnerView && \(\s*\n\s*<button\s*\n\s*className="detail-button danger"/.test(detailView),
)
assert(
  '已绑定话题标签展示 stays unconditional (member-visible, C2)',
  /selectedDetail\.topicLabels\?\.length/.test(detailView),
)
assert(
  '答案对比统计 (answerCompareStats) stays present (member-visible, C2)',
  /answerCompareStats/.test(detailView),
)
assert(
  'AI 答案验证 verify-list stays present (member-visible, C2)',
  /className="verify-list"/.test(detailView),
)

// ------------------------------------------------------------------ 2. detailHelpers + App.tsx extraction

const detailHelpers = read('app/src/features/question-detail/detailHelpers.ts')
for (const fn of ['getParseSavedAt', 'compactGroupMeta', 'formatSavedAt']) {
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
  'App.tsx does not duplicate getParseSavedAt/compactGroupMeta definitions',
  !/^function getParseSavedAt\(/m.test(appTsx) && !/^function compactGroupMeta\(/m.test(appTsx),
)
assert(
  'App.tsx re-imports the shared helpers from detailHelpers.ts (no duplicated copies)',
  /from '\.\/features\/question-detail\/detailHelpers'/.test(appTsx),
)
assert(
  // classic-retire-3: the classic group-list card (with its own inline
  // 详情 button calling openDetail(group.id) directly) was deleted along
  // with the rest of the classic list branch. ConciergeDesk is now the only
  // list renderer and reaches openDetail via its onOpenDetail prop instead.
  'classic list detail button (App.tsx) no longer exists (classic-retire-3)',
  !/<button className="detail-button" type="button" onClick=\{\(\) => openDetail\(group\.id\)\}>\s*\n\s*详情/.test(appTsx),
)
assert(
  'ConciergeDesk still wires onOpenDetail to openDetail(group.id) (classic-retire-3 kept this path)',
  /<ConciergeDesk[\s\S]{0,400}onOpenDetail=\{\(group\) => openDetail\(group\.id\)\}/.test(appTsx),
)

// detail-consume-only: the retired WRITE handlers must no longer be defined
// in App.tsx (their only call site was the detail view's now-deleted props).
const retiredHandlers = [
  'handleVerifyQuestionGroup',
  'handleAnalyzeReadingQuestionGroup',
  'handleSaveReadingParseResult',
  'handleSaveClozeParseResult',
  'handleSaveSevenChoicesParseResult',
  'handleSaveGrammarParseResult',
  'handleGenerateTopicLabels',
  'toggleTopicLabelSelection',
  'handleBindTopicLabels',
  'handleSaveQuestionDifficulty',
  'updateDifficultyDraft',
]
for (const fn of retiredHandlers) {
  assert(
    `App.tsx no longer defines retired handler ${fn}`,
    !new RegExp(`function ${fn}\\(`).test(appTsx),
  )
}

// READ-only state populated by openDetail's回填 must still be defined —
// these are NOT part of the retired surface.
for (const state of ['readingParseResult', 'clozeParseResult', 'sevenChoicesParseResult', 'grammarParseResult', 'verifyResult']) {
  assert(
    `App.tsx still defines READ-only state ${state}`,
    new RegExp(`\\[${state}, set${state[0].toUpperCase()}${state.slice(1)}\\]`).test(appTsx),
  )
}
assert(
  'App.tsx still defines handleBackfillTopicLabels (AI Enhancement batch backfill, distinct from retired handleGenerateTopicLabels)',
  /async function handleBackfillTopicLabels\(/.test(appTsx),
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
assert(
  'ConciergeGroupCard no longer shows a difficulty dot (D3/D4 全站难度下线)',
  !/concierge-difficulty-dot/.test(conciergeGroupCard),
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

console.log(`\nclassic-retire-2 verify (detail-consume-only revision): ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
