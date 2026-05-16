#!/usr/bin/env node
/**
 * Verification: Reading Analysis View State Module (Cut 4).
 *
 * Scope: the pure module
 *   app/src/features/reading-analysis/viewState/readingAnalysisViewState.ts
 * — no React, no jsdom, no Playwright. Node 24's TS-stripping handles the
 * `.ts` import directly (matches the existing
 * verify-reading-analysis-{selector,linking,route}.mjs scripts).
 *
 * What this locks in:
 *   The Cut-3 on-screen behavior must NOT change. Every phase tag
 *   ('demo' / 'real-with-evidence' / 'real-without-evidence' / 'blocked'),
 *   every headline / body string, and every `note` template are asserted
 *   byte-for-byte against the values the old inline route produced.
 *
 * Coverage:
 *
 *   getInitialReadingAnalysisViewState:
 *     1. demo alias + no groupId               → demo fixture, '示例数据'
 *     2. product entry + no groupId            → blocked '缺少题组参数'
 *     3. demo alias + groupId                  → blocked '正在加载阅读解析…'
 *     4. product entry + groupId               → blocked '正在加载阅读解析…'
 *
 *   deriveReadingAnalysisViewState — fetch outcomes:
 *     5. fetch error                           → blocked '加载失败' incl. message
 *     6. fetch missing                         → blocked '加载失败' incl. groupId
 *     7. fetch ok + selector null (defensive)  → blocked '正在加载阅读解析…'
 *     8. (rare) deriving with no groupId       → blocked '缺少题组参数'
 *
 *   deriveReadingAnalysisViewState — selector failures:
 *     9. each of the 4 SelectReadingAnalysisFailureReason values
 *        produces the right headline/body
 *
 *   deriveReadingAnalysisViewState — selector OK:
 *    10. zero annotations                      → 'real-without-evidence',
 *                                                note ends with '（暂无证据标注）'
 *    11. ≥1 annotation, zero warnings          → 'real-with-evidence',
 *                                                no warning suffix
 *    12. ≥1 annotation, N warnings             → suffix '（N 条提醒）'
 *    13. URL questionNo wins over fallback
 *    14. URL questionNo absent → first question's questionNo
 *    15. title fallback chain:
 *        passage.title → passageTitle → title → groupId
 *
 * Run:  node scripts/verify-reading-analysis-view-state.mjs
 * Exit: 0 on all-pass, 1 otherwise.
 */

import path from 'node:path'

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}: ${detail || 'failed'}`)
  }
}

function assertEqual(name, actual, expected) {
  const ok = actual === expected
  assert(
    name,
    ok,
    ok
      ? ''
      : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

const here = path.dirname(new URL(import.meta.url).pathname)
const modulePath = path.resolve(
  here,
  '..',
  'app',
  'src',
  'features',
  'reading-analysis',
  'viewState',
  'readingAnalysisViewState.ts',
)

const mod = await import(modulePath)
const {
  getInitialReadingAnalysisViewState,
  deriveReadingAnalysisViewState,
} = mod

console.log('=== Reading Analysis View State Module verification (Cut 4) ===\n')

/* ──────────────────────── tiny demo-fixture stub ──────────────────────── */

// We don't import the real `READING_ANALYSIS_FIXTURE` — the pure module is
// agnostic to what the demo fixture actually is, it just holds onto the
// reference. A sentinel object is enough to verify "we got the demo state
// AND it carries the demo fixture".
const DEMO_FIXTURE_SENTINEL = { __demo__: true }

function makeRealFixture({ annotations = [] } = {}) {
  // The selector's `fixture` shape only requires `.annotations.length`
  // for the View State Module's branching.
  return { annotations }
}

function makeSelectorOk({ annotations = [], warnings = [] } = {}) {
  return {
    ok: true,
    fixture: makeRealFixture({ annotations }),
    warnings,
    quoteDiagnostics: [],
  }
}

/* ───────────────── getInitialReadingAnalysisViewState ─────────────────── */

console.log('-- getInitialReadingAnalysisViewState --')

{
  const state = getInitialReadingAnalysisViewState({
    query: { source: 'demo-alias', groupId: null, questionNo: null },
    demoFixture: DEMO_FIXTURE_SENTINEL,
  })
  assertEqual('demo alias + no groupId → phase=demo', state.phase, 'demo')
  assertEqual('demo alias + no groupId → note=示例数据', state.note, '示例数据')
  assert(
    'demo alias + no groupId → fixture is the injected demo fixture',
    state.phase === 'demo' && state.fixture === DEMO_FIXTURE_SENTINEL,
    JSON.stringify(state),
  )
}

{
  const state = getInitialReadingAnalysisViewState({
    query: { source: 'view-param', groupId: null, questionNo: null },
    demoFixture: DEMO_FIXTURE_SENTINEL,
  })
  assertEqual(
    'product entry + no groupId → phase=blocked',
    state.phase,
    'blocked',
  )
  if (state.phase === 'blocked') {
    assertEqual(
      'product entry + no groupId → headline=缺少题组参数',
      state.headline,
      '缺少题组参数',
    )
    assertEqual(
      'product entry + no groupId → body literal',
      state.body,
      '阅读解析需要 ?view=reading-analysis&groupId=<id>。',
    )
  }
}

for (const source of ['demo-alias', 'view-param']) {
  const state = getInitialReadingAnalysisViewState({
    query: { source, groupId: 'g-X', questionNo: null },
    demoFixture: DEMO_FIXTURE_SENTINEL,
  })
  assertEqual(
    `${source} + groupId → phase=blocked (loading placeholder)`,
    state.phase,
    'blocked',
  )
  if (state.phase === 'blocked') {
    assertEqual(
      `${source} + groupId → headline=正在加载阅读解析…`,
      state.headline,
      '正在加载阅读解析…',
    )
    assertEqual(
      `${source} + groupId → body shows the groupId`,
      state.body,
      '题组 g-X',
    )
  }
}

/* ─────────────── deriveReadingAnalysisViewState — fetch ───────────────── */

console.log('\n-- deriveReadingAnalysisViewState: fetch outcomes --')

{
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: { kind: 'error', message: 'boom' },
    selectorResult: null,
  })
  assertEqual('fetch error → phase=blocked', state.phase, 'blocked')
  if (state.phase === 'blocked') {
    assertEqual(
      'fetch error → headline=加载失败',
      state.headline,
      '加载失败',
    )
    assertEqual(
      'fetch error → body composes groupId + message',
      state.body,
      '无法加载题组 g-1：boom',
    )
  }
}

{
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: { kind: 'missing' },
    selectorResult: null,
  })
  assertEqual('fetch missing → phase=blocked', state.phase, 'blocked')
  if (state.phase === 'blocked') {
    assertEqual(
      'fetch missing → headline=加载失败',
      state.headline,
      '加载失败',
    )
    assertEqual(
      'fetch missing → body says 不存在',
      state.body,
      '题组 g-1 不存在。',
    )
  }
}

{
  // Defensive: fetch ok but selectorResult somehow null → loading.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: { kind: 'ok', detail: { id: 'g-1', questions: [] } },
    selectorResult: null,
  })
  assertEqual(
    'fetch ok + selectorResult null → phase=blocked (loading)',
    state.phase,
    'blocked',
  )
  if (state.phase === 'blocked') {
    assertEqual(
      'fetch ok + selectorResult null → headline=正在加载阅读解析…',
      state.headline,
      '正在加载阅读解析…',
    )
  }
}

{
  // Defensive: derive called without a groupId — should still produce a
  // sensible blocked screen rather than crash.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: null, questionNo: null },
    fetchOutcome: { kind: 'error', message: 'unused' },
    selectorResult: null,
  })
  assertEqual('derive without groupId → phase=blocked', state.phase, 'blocked')
  if (state.phase === 'blocked') {
    assertEqual(
      'derive without groupId → headline=缺少题组参数',
      state.headline,
      '缺少题组参数',
    )
  }
}

/* ─────────── deriveReadingAnalysisViewState — selector failures ──────── */

console.log('\n-- deriveReadingAnalysisViewState: selector failures --')

const FAILURE_CASES = [
  {
    reason: 'empty-passage',
    body: '该题组没有阅读原文，无法生成证据标注。',
  },
  {
    reason: 'no-questions',
    body: '该题组没有可用的题目。',
  },
  {
    reason: 'question-not-found',
    body: '在该题组里没有找到指定的题号。',
  },
  {
    reason: 'unsupported-question-type',
    body: '阅读解析当前只支持标准的四选一阅读题。',
  },
]

for (const c of FAILURE_CASES) {
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: {
      kind: 'ok',
      detail: { id: 'g-1', questions: [{ questionNo: '1' }] },
    },
    selectorResult: { ok: false, reason: c.reason },
  })
  assertEqual(
    `selector reason=${c.reason} → phase=blocked`,
    state.phase,
    'blocked',
  )
  if (state.phase === 'blocked') {
    assertEqual(
      `selector reason=${c.reason} → headline=暂不支持该题组的阅读解析`,
      state.headline,
      '暂不支持该题组的阅读解析',
    )
    assertEqual(
      `selector reason=${c.reason} → body literal`,
      state.body,
      c.body,
    )
  }
}

/* ─────────────── deriveReadingAnalysisViewState — OK paths ────────────── */

console.log('\n-- deriveReadingAnalysisViewState: selector OK --')

{
  // Zero annotations → real-without-evidence + 暂无证据标注 suffix.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: '2' },
    fetchOutcome: {
      kind: 'ok',
      detail: {
        id: 'g-1',
        passage: { title: 'Phone Box' },
        questions: [{ questionNo: '1' }, { questionNo: '2' }],
      },
    },
    selectorResult: makeSelectorOk({ annotations: [], warnings: [] }),
  })
  assertEqual(
    'zero annotations → phase=real-without-evidence',
    state.phase,
    'real-without-evidence',
  )
  if (state.phase === 'real-without-evidence') {
    assertEqual(
      'zero annotations → note literal',
      state.note,
      '真实数据：Phone Box · 第 2 题（暂无证据标注）',
    )
  }
}

{
  // ≥1 annotation, zero warnings → real-with-evidence, no warning suffix.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: '3' },
    fetchOutcome: {
      kind: 'ok',
      detail: {
        passage: { title: 'Take Back Our Streets' },
        questions: [{ questionNo: '1' }],
      },
    },
    selectorResult: makeSelectorOk({
      annotations: [{ id: 'a1' }],
      warnings: [],
    }),
  })
  assertEqual(
    '≥1 annotation, no warnings → phase=real-with-evidence',
    state.phase,
    'real-with-evidence',
  )
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      '≥1 annotation, no warnings → note has no suffix',
      state.note,
      '真实数据：Take Back Our Streets · 第 3 题',
    )
  }
}

{
  // ≥1 annotation, 2 warnings → suffix '（2 条提醒）'.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: '1' },
    fetchOutcome: {
      kind: 'ok',
      detail: {
        passage: { title: 'Houseplant Boom' },
        questions: [{ questionNo: '1' }],
      },
    },
    selectorResult: makeSelectorOk({
      annotations: [{ id: 'a1' }],
      warnings: ['w-1', 'w-2'],
    }),
  })
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      '≥1 annotation + 2 warnings → suffix （2 条提醒）',
      state.note,
      '真实数据：Houseplant Boom · 第 1 题（2 条提醒）',
    )
  } else {
    assert('phase=real-with-evidence', false, JSON.stringify(state))
  }
}

{
  // URL questionNo wins.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: '7' },
    fetchOutcome: {
      kind: 'ok',
      detail: {
        passage: { title: 'X' },
        questions: [{ questionNo: '1' }, { questionNo: '2' }],
      },
    },
    selectorResult: makeSelectorOk({ annotations: [{}] }),
  })
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      'URL questionNo wins over questions[0].questionNo',
      state.note,
      '真实数据：X · 第 7 题',
    )
  } else {
    assert('URL questionNo: phase real-with-evidence', false, JSON.stringify(state))
  }
}

{
  // questionNo null → fallback to questions[0].questionNo.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: {
      kind: 'ok',
      detail: {
        passage: { title: 'X' },
        questions: [{ questionNo: '5' }, { questionNo: '6' }],
      },
    },
    selectorResult: makeSelectorOk({ annotations: [{}] }),
  })
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      'no URL questionNo → uses questions[0].questionNo',
      state.note,
      '真实数据：X · 第 5 题',
    )
  } else {
    assert('fallback questionNo: phase', false, JSON.stringify(state))
  }
}

{
  // No questions[0].questionNo at all → '1' final fallback.
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-1', questionNo: null },
    fetchOutcome: {
      kind: 'ok',
      detail: { passage: { title: 'X' }, questions: [] },
    },
    selectorResult: makeSelectorOk({ annotations: [{}] }),
  })
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      'no questions[0] → questionNo defaults to "1"',
      state.note,
      '真实数据：X · 第 1 题',
    )
  } else {
    assert('default-1 questionNo: phase', false, JSON.stringify(state))
  }
}

/* Title fallback chain: passage.title → passageTitle → title → groupId. */

console.log('\n-- deriveReadingAnalysisViewState: title fallback chain --')

const titleCases = [
  {
    name: 'passage.title wins',
    detail: {
      passage: { title: '  passage-title  ' },
      passageTitle: 'passageTitle',
      title: 'title',
      questions: [{ questionNo: '1' }],
    },
    expectedTitlePart: 'passage-title',
  },
  {
    name: 'passageTitle when passage.title empty',
    detail: {
      passage: { title: '   ' },
      passageTitle: 'passageTitle',
      title: 'title',
      questions: [{ questionNo: '1' }],
    },
    expectedTitlePart: 'passageTitle',
  },
  {
    name: 'title when passage missing',
    detail: {
      title: 'title',
      questions: [{ questionNo: '1' }],
    },
    expectedTitlePart: 'title',
  },
  {
    name: 'groupId when nothing else available',
    detail: { questions: [{ questionNo: '1' }] },
    expectedTitlePart: 'g-fallback',
  },
]

for (const c of titleCases) {
  const state = deriveReadingAnalysisViewState({
    query: { source: 'view-param', groupId: 'g-fallback', questionNo: null },
    fetchOutcome: { kind: 'ok', detail: c.detail },
    selectorResult: makeSelectorOk({ annotations: [{}] }),
  })
  if (state.phase === 'real-with-evidence') {
    assertEqual(
      `title fallback: ${c.name}`,
      state.note,
      `真实数据：${c.expectedTitlePart} · 第 1 题`,
    )
  } else {
    assert(
      `title fallback (${c.name}): phase=real-with-evidence`,
      false,
      JSON.stringify(state),
    )
  }
}

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
