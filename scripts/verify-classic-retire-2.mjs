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
 *
 * detail-slim (owner 2026-07-08, retires the remaining C2-era production
 * scaffolding per ADR-0015): the per-question answer-compare box
 * (`showCompareBox`), the `answer-compare-summary` stats block, the AI 验证
 * `verify-list` section, and the topic-label confidence percentage are no
 * longer owner-gated — they are DELETED entirely (production verification
 * now runs in the import pipeline, not on this page). This script's
 * assertions for those four surfaces are REVERSED again: they now assert
 * ABSENCE (not "owner-gated presence") to guard against regression.
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

// figure-render cut (fig-token P0) opened this component's "props-driven,
// zero internal useState" invariant with ONE deliberate exception (the old
// figure-manifest fetch); similar-passages-entry (E6) added a second pair
// (similarPassagesOpen/similarPassagesRequest). detail-page-redesign
// (2026-07-15) rewrote the component around a new async「一张纸」paper
// mount, which retires the old standalone figuresState fetch (figures are
// now fetched as part of the same paper-asset load effect that builds the
// PaperSurface model) and replaces it with two narrow state pairs of its
// own: `load` (the paper-asset fetch/build result) + `expanded` (露一角 ↔
// 展开卷面 toggle). Count is still an EXACT assertion (4, not "at least
// 4") — any OTHER/future internal state still fails this check. The old
// regex (`\buseState\s*\(`) had a blind spot — it never matched a
// generic-typed call (`useState<T>(...)`) — kept fixed to count ALL
// useState calls (with or without a generic).
const useStateCallCount = (detailView.match(/\buseState\s*[<(]/g) || []).length
assert(
  'QuestionGroupDetailView has exactly four internal useState calls (一张纸 load+expanded + similar-passages-entry panel state; props-driven otherwise)',
  useStateCallCount === 4,
  `found ${useStateCallCount} useState call(s)`,
)
assert(
  'one useState is the 一张纸 load declaration (paper-asset fetch/build result)',
  /const \[load, setLoad\] = useState<LoadState>/.test(detailView),
)
assert(
  'one useState is the 一张纸 expanded declaration (露一角 ↔ 展开卷面 toggle)',
  /const \[expanded, setExpanded\] = useState\(false\)/.test(detailView),
)
assert(
  'one useState is the similar-passages-entry similarPassagesOpen declaration',
  /const \[similarPassagesOpen, setSimilarPassagesOpen\] = useState/.test(detailView),
)
assert(
  'one useState is the similar-passages-entry similarPassagesRequest declaration',
  /const \[similarPassagesRequest, setSimilarPassagesRequest\] = useState</.test(detailView),
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
  'AI 验证结果 section (verifyResult.totalLatencyMs / verifyResult.verifiedCount summary) is gone (detail-slim, owner 2026-07-08)',
  !/全量耗时: \{verifyResult\.totalLatencyMs\} ms · 全量调度完成/.test(detailView) &&
    !/AI 答案验证/.test(detailView),
)

// Member-visible surfaces (kept, C2/C3) must remain unconditional / present.
// detail-page-redesign (2026-07-15): 加入草稿卷 moved from `.add-button` to
// the new speed-look-head primary action `.peek-btn--primary`, still calling
// onAddToBasket(selectedDetail), still unconditional (not isOwnerView-gated).
assert(
  '加入草稿卷 button stays visible to member (not gated by isOwnerView)',
  /<button\s*\n\s*className="peek-btn peek-btn--primary"\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => onAddToBasket\(selectedDetail\)\}/.test(
    detailView,
  ),
)
// detail-page-redesign (2026-07-15): the bespoke 语篇渲染 passage section
// (`<pre className="passage-text">`) is fully retired per spec 退役清单 —
// replaced by the read-only「一张纸」PaperSurface mount (asserted read-only
// in verify-detail-redesign.mjs). This check flips from "passage text is
// member-visible" to "the paper-mount wrapper (`.peek-paper`) is member-
// visible" — same underlying guarantee (this content surface must not be
// owner-gated), moved to the new surface that replaced it.
{
  const peekPaperIdx = detailView.indexOf('className={`peek-paper')
  const immediatelyBefore = detailView.slice(0, peekPaperIdx).trimEnd()
  assert(
    '一张纸 paper-mount wrapper (.peek-paper) is unconditional (member-visible, not gated by isOwnerView)',
    peekPaperIdx > -1 && !immediatelyBefore.endsWith('isOwnerView && ('),
    `preceding token: ...${immediatelyBefore.slice(-40)}`,
  )
}
// detail-page-redesign (2026-07-15): 删除 moved from `.detail-button danger`
// to the new次位 `.peek-btn--minor.peek-btn--danger`, still isOwnerView-gated.
assert(
  '删除 button stays owner-gated (kept, C3)',
  /isOwnerView && \(\s*\n\s*<button\s*\n\s*className="peek-btn peek-btn--minor peek-btn--danger"/.test(detailView),
)
assert(
  '已绑定话题标签展示 stays unconditional (member-visible, C2)',
  /selectedDetail\.topicLabels\?\.length/.test(detailView),
)
// detail-slim (owner 2026-07-08): these four production-scaffolding
// surfaces are fully DELETED (not just owner-gated) — absence guards
// prevent regression back into a "gate it again" half-measure.
assert(
  '答案对比统计 (answerCompareStats) is gone — no dangling computed var or summary block',
  !/answerCompareStats/.test(detailView),
)
assert(
  'AI 答案验证 verify-list section is gone (no verify-list class, no verify-item rendering)',
  !/verify-list/.test(detailView) && !/verify-item/.test(detailView),
)
assert(
  'per-question answer-compare box is gone (no showCompareBox, no 待对比/状态未保存 labels)',
  !/showCompareBox/.test(detailView) && !/待对比/.test(detailView) && !/状态未保存/.test(detailView),
)
assert(
  'topic-label confidence percentage is gone (labels themselves still render, just no %)',
  !/topicLabel\.confidence/.test(detailView) &&
    /selectedDetail\.topicLabels\?\.length/.test(detailView),
)
assert(
  '看解析 entry (paperSurfaceLabel-driven) is present, gated on hasPaperSurfaceAnalysis + paperSurfaceHref + paperSurfaceLabel (detail-slim add)',
  /selectedDetail\.hasPaperSurfaceAnalysis[\s\S]{0,80}selectedDetail\.paperSurfaceHref[\s\S]{0,80}selectedDetail\.paperSurfaceLabel/.test(detailView) &&
    /\{selectedDetail\.paperSurfaceLabel\}/.test(detailView),
)
// flow-panel 刀 3 narrows this assertion (plan-authorized, docs/cuts/
// flow-panel/plan.md 刀 3 Scope): 看解析 no longer links straight to the
// raw analysis href — it now navigates to the整卷页讲评态 via the shared
// buildPaperBrowseLectureHref helper (server href unmodified; the
// conversion is a pure front-end transform, see
// app/src/concierge/paperSurfaceHref.ts). The original MF-1 intent is kept
// intact: 看解析 must NOT literally call onOpenPaperBrowse(selectedDetail),
// which is 看整卷's own handler — a separate onOpenPaperBrowseLecture
// handler now backs the SPA fast-path instead.
assert(
  '看解析 entry navigates to the paper-browse 讲评态 via buildPaperBrowseLectureHref(selectedDetail.paperSurfaceHref) (flow-panel 刀 3 migration; CR MF-1 intent preserved — does not call onOpenPaperBrowse(selectedDetail), which is 看整卷)',
  /href=\{buildPaperBrowseLectureHref\(selectedDetail\.paperSurfaceHref\)/.test(detailView) &&
    !/paperSurfaceLabel[\s\S]{0,300}onOpenPaperBrowse\(selectedDetail\)/.test(
      detailView.slice(detailView.indexOf('hasPaperSurfaceAnalysis')),
    ),
)

// ------------------------------------------------------------------ 2. detailHelpers + App.tsx extraction

const detailHelpers = read('app/src/features/question-detail/detailHelpers.ts')
for (const fn of ['compactGroupMeta', 'formatSavedAt']) {
  assert(`detailHelpers.ts defines ${fn} (single definition)`, new RegExp(`export function ${fn}\\(`).test(detailHelpers))
}
assert(
  'detailHelpers.ts no longer defines getParseSavedAt (detail-slim: lost its last caller when the per-question compare box was deleted)',
  !/export function getParseSavedAt\(/.test(detailHelpers),
)

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
// legacy-import-retire (ADR-0016 cut 3, ~2026-07-06) deleted the legacy import
// modal's draft-preview JSX, which was compactPreview's only remaining call
// site in App.tsx — so App.tsx no longer imports anything from
// detailHelpers.ts at all. The "no duplicated copies" intent of this check
// still holds via the assertion above (getParseSavedAt/compactGroupMeta are
// not redefined inline); this just stops requiring an import that has no
// remaining consumer.
assert(
  'App.tsx does not duplicate compactPreview either (no dangling inline copy)',
  !/^function compactPreview\(/m.test(appTsx),
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

// READ-only state populated by openDetail's回填. detail-page-redesign
// (2026-07-15) retires clozeParseResult/sevenChoicesParseResult/
// grammarParseResult/verifyResult — they existed solely to feed the old
// detail page's per-question AI-analysis sections, which are now
// structurally gone (spec 负空间①). readingParseResult is the one
// survivor: the new 速览头 chips need its per-question `questionType`
// (spec chips 数据契约 §阅读).
assert(
  'App.tsx still defines READ-only state readingParseResult',
  /\[readingParseResult, setReadingParseResult\]/.test(appTsx),
)
for (const retiredState of ['clozeParseResult', 'sevenChoicesParseResult', 'grammarParseResult', 'verifyResult']) {
  assert(
    `App.tsx no longer defines retired READ-only state ${retiredState} (detail-page-redesign — its only reader was the retired detail-page AI-analysis section)`,
    !new RegExp(`\\[${retiredState}, set${retiredState[0].toUpperCase()}${retiredState.slice(1)}\\]`).test(appTsx),
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
// C3c (trust-cracks): the 详情 entry moved from a <button onClick> to a real
// <a href="?view=detail&groupId=…"> with an onClick preventDefault SPA
// fast-path (same family as 看解析/配相似 — 中键/新标签 now work). Assert
// the anchor form + the SPA fast-path still calls onOpenDetail(group).
assert(
  'ConciergeGroupCard renders a 详情 <a href> wired to onOpenDetail via preventDefault',
  /href=\{`\?view=detail&groupId=\$\{encodeURIComponent\(group\.id\)\}`\}[\s\S]{0,200}onOpenDetail\(group\)[\s\S]{0,40}详情/.test(
    conciergeGroupCard,
  ),
)
assert(
  'ConciergeGroupCard 详情 is no longer a <button> (C3c: real link)',
  !/<button[\s\S]{0,80}onClick=\{\(\) => onOpenDetail\(group\)\}/.test(conciergeGroupCard),
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
// similar-passages-entry (E6) threads 5 more props (questionGroupById,
// expandedSimilarGroupId, similarPassagesRequest, onToggleSimilar,
// onRetrySimilar) through each render point — widened from 600 to 900 to
// keep clearing both call sites (measured ~775/816 chars post-cut).
const conciergePaperRowRenderPoints = [...conciergeDesk.matchAll(/<ConciergePaperRow[\s\S]{0,900}?\/>/g)]
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
