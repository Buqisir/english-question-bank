#!/usr/bin/env node
/**
 * Verification: Reading Analysis evidence-link layer (pure modules).
 *
 * Scope: only the pure rules behind the dashed evidence link. We do NOT
 * spin up React, jsdom, or Playwright here — the modules under
 * `app/src/features/reading-analysis/evidenceLinking/` were extracted with
 * the explicit goal of being testable without a browser.
 *
 * Coverage (per the refactor brief):
 *
 *   quoteAnchors:
 *     1. exact match
 *     2. normalized match (case + whitespace)
 *     3. curly apostrophe vs ASCII
 *     4. dash variants (- vs – vs —)
 *     5. whitespace collapse (NBSP, CJK ideographic space, multi-space)
 *     6. same-sentence multiple non-overlapping annotations
 *     7. overlap fallback (later annotation demoted to sentence-level)
 *     8. missing quote fallback
 *
 *   evidenceLinking:
 *     9.  active link resolve — stem / option / none
 *     10. source priority — option-badge before option-button-legacy;
 *         stem uses link-source only
 *     11. target priority — quote anchor before sentence anchor
 *     12. cubic path is byte-stable for fixed endpoints (and uses a
 *         min control distance of 60 when the endpoints are close)
 *     13. animation instance policy:
 *           - new activeLink id bumps instance
 *           - same activeLink id + geometry recompute does NOT bump
 *           - clear (null) then same link again bumps
 *
 * Run:  node scripts/verify-reading-analysis-linking.mjs
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
    ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

function assertDeepEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  assert(name, a === e, a === e ? '' : `expected ${e}, got ${a}`)
}

const here = path.dirname(new URL(import.meta.url).pathname)
const moduleDir = path.resolve(
  here,
  '..',
  'app',
  'src',
  'features',
  'reading-analysis',
  'evidenceLinking',
)

const quoteAnchors = await import(path.join(moduleDir, 'quoteAnchors.ts'))
const evidenceLinking = await import(path.join(moduleDir, 'evidenceLinking.ts'))
const anchorKeys = await import(path.join(moduleDir, 'anchorKeys.ts'))

const {
  locateQuoteInSentence,
  layoutSentenceAnnotations,
  planSentenceRender,
  normalizeQuoteOnly,
} = quoteAnchors

const {
  findActiveLink,
  sourceSelectorsFor,
  targetSelectorsFor,
  buildCubicPath,
  rectsToEndpoints,
  computeOverlayGeometry,
  advanceAnimationInstance,
  createAnimationInstanceState,
} = evidenceLinking

const {
  ATTR_LINK_SOURCE,
  ATTR_OPTION_ANCHOR,
  ATTR_QUOTE_ANCHOR,
  ATTR_SENTENCE_ID,
  formatStemSourceKey,
  formatOptionSourceKey,
} = anchorKeys

console.log('=== Reading Analysis evidence-link verification ===\n')

/* ─────────────────────────── quoteAnchors ───────────────────────────── */

console.log('-- quoteAnchors: locate + render plan --')

// 1. exact match
{
  const r = locateQuoteInSentence('Climate change is real.', 'change is')
  assertDeepEqual('exact match returns original indices', r, {
    start: 'Climate '.length,
    end: 'Climate change is'.length,
  })
}

// 2. normalized match — case + multi-space
{
  const sentence = 'Climate   Change is REAL.' // 3 internal spaces, mixed case
  const r = locateQuoteInSentence(sentence, 'climate change')
  assertDeepEqual('normalized: case + collapsed spaces map back to original range', r, {
    start: 0,
    end: 'Climate   Change'.length,
  })
}

// 3. curly apostrophe vs ASCII
{
  const sentence = "It\u2019s the team\u2019s call." // curly ’
  const r = locateQuoteInSentence(sentence, "it's")
  assert(
    'curly apostrophe matches ASCII apostrophe',
    r !== null && r.start === 0 && r.end === 4,
    JSON.stringify(r),
  )
}

// 4. dash variants — both en and em dashes match a hyphen quote
{
  const en = 'a \u2013 b' // en dash
  const em = 'a \u2014 b' // em dash
  assert(
    'en dash matches hyphen quote',
    locateQuoteInSentence(en, 'a - b') !== null,
  )
  assert(
    'em dash matches hyphen quote',
    locateQuoteInSentence(em, 'a - b') !== null,
  )
}

// 5. whitespace collapse — NBSP and CJK ideographic space both fold to space
{
  const nbsp = 'a\u00A0\u00A0b' // two NBSP
  const cjk = 'a\u3000b'         // ideographic space
  assert('NBSP collapses to space', locateQuoteInSentence(nbsp, 'a b') !== null)
  assert('ideographic space collapses', locateQuoteInSentence(cjk, 'a b') !== null)
  assert(
    'normalizeQuoteOnly trims and folds',
    normalizeQuoteOnly('  Foo\u00A0\u00A0Bar  ') === 'foo bar',
  )
}

// 8. missing quote fallback
{
  const r = locateQuoteInSentence('Lorem ipsum dolor sit amet.', 'banana')
  assertEqual('missing quote returns null', r, null)
  const empty = locateQuoteInSentence('Anything', '')
  assertEqual('empty quote returns null', empty, null)
}

// 6 + 7. same-sentence multi annotations + overlap fallback
console.log('\n-- quoteAnchors: same-sentence + overlap --')

const sentenceText =
  'The team announced a major change after the meeting concluded yesterday.'
const sentence = { id: 's-1', text: sentenceText }

function ann(id, kind, quote) {
  return {
    id,
    kind,
    target: {
      id: `t-${id}`,
      paragraphIndex: 0,
      sentenceId: 's-1',
      start: 0,
      end: 0,
      quote,
    },
  }
}

// 6. two non-overlapping evidence quotes both accepted, ordered by start.
{
  const a = ann('a', 'evidence', 'major change')
  const b = ann('b', 'trap', 'meeting concluded')
  const layout = layoutSentenceAnnotations(sentenceText, [b, a]) // input out of order
  assertEqual('two non-overlapping anns: 2 accepted', layout.accepted.length, 2)
  assertEqual('two non-overlapping anns: 0 fallback', layout.fallback.length, 0)
  assertEqual(
    'accepted order = start ascending',
    layout.accepted.map((x) => x.annotation.id).join(','),
    'a,b',
  )
}

// 7. overlap fallback — second annotation overlaps first → demoted.
{
  const a = ann('a', 'evidence', 'major change after')
  const b = ann('b', 'trap', 'change after the')
  const layout = layoutSentenceAnnotations(sentenceText, [a, b])
  assertEqual('overlap: only 1 accepted', layout.accepted.length, 1)
  assertEqual(
    'overlap: first (longer at same start would also win) is kept',
    layout.accepted[0].annotation.id,
    'a',
  )
  assertEqual('overlap: second is in fallback', layout.fallback[0].id, 'b')
}

// same start, longer wins (sort tiebreak: end desc).
{
  const aShort = ann('short', 'evidence', 'major')
  const aLong = ann('long', 'evidence', 'major change')
  const layout = layoutSentenceAnnotations(sentenceText, [aShort, aLong])
  assertEqual(
    'same start: longer accepted, shorter falls back',
    layout.accepted[0].annotation.id,
    'long',
  )
  assertEqual('same start fallback id', layout.fallback[0].id, 'short')
}

// render plan: segments cover the sentence text exactly once
{
  const a = ann('a', 'evidence', 'major change')
  const plan = planSentenceRender(sentence, [a])
  const reconstructed = plan.segments.map((s) => s.text).join('')
  assertEqual('render plan: segments concatenate to original', reconstructed, sentenceText)
  const marks = plan.segments.filter((s) => s.kind === 'mark')
  assertEqual('render plan: one mark for one accepted ann', marks.length, 1)
  assertEqual('render plan: mark.annotationId', marks[0].annotationId, 'a')
}

// fallback: missing quote → sentence-level evidence highlight, no mark
{
  const a = ann('miss', 'evidence', 'banana banana')
  const plan = planSentenceRender(sentence, [a])
  assertEqual(
    'missing quote: 0 marks',
    plan.segments.filter((s) => s.kind === 'mark').length,
    0,
  )
  assertEqual('missing quote: hasEvidence', plan.fallback.hasEvidence, true)
  assertEqual('missing quote: fallback kind', plan.fallback.kind, 'evidence')
  assertEqual('missing quote: fallback anchorId', plan.fallback.anchorId, 't-miss')
}

// fallback priority: when both evidence and trap fall back, evidence wins kind
{
  const e = ann('e', 'evidence', 'absent-evi')
  const t = ann('t', 'trap', 'absent-trap')
  const plan = planSentenceRender(sentence, [t, e]) // input order: trap first
  assertEqual('mixed fallback: kind = evidence', plan.fallback.kind, 'evidence')
  assertEqual('mixed fallback: anchorId = evidence id', plan.fallback.anchorId, 't-e')
  assertEqual('mixed fallback: hasTrap also true', plan.fallback.hasTrap, true)
}

/* ───────────────────────── evidenceLinking ─────────────────────────── */

console.log('\n-- evidenceLinking: active link --')

// 9. active link resolve — stem / option / none
{
  const links = [
    { id: 'L-stem', from: { questionId: 'q1' }, toAnnotationId: 'A1', kind: 'support' },
    { id: 'L-A',    from: { questionId: 'q1', optionKey: 'A' }, toAnnotationId: 'A1', kind: 'support' },
    { id: 'L-B',    from: { questionId: 'q1', optionKey: 'B' }, toAnnotationId: 'A2', kind: 'trap' },
  ]
  assertEqual(
    'none → null',
    findActiveLink({ kind: 'none' }, links),
    null,
  )
  assertEqual(
    'stem → stem-only link (no optionKey)',
    findActiveLink({ kind: 'stem', questionId: 'q1' }, links)?.id,
    'L-stem',
  )
  assertEqual(
    'option B → option-B link',
    findActiveLink({ kind: 'option', questionId: 'q1', optionKey: 'B' }, links)?.id,
    'L-B',
  )
  assertEqual(
    'option C without link → null',
    findActiveLink({ kind: 'option', questionId: 'q1', optionKey: 'C' }, links),
    null,
  )
}

// 10. source priority — option uses badge first, then legacy button
console.log('\n-- evidenceLinking: source / target priority --')
{
  assertDeepEqual('none: empty selectors', sourceSelectorsFor({ kind: 'none' }), [])

  // The selectors apply CSS.escape to keys, so e.g. `q:q1` appears as
  // `q\:q1` in the final selector string. We assert by matching the raw
  // characters that survive escaping (`q1`, `A`) plus the attribute name.
  const stemSelectors = sourceSelectorsFor({ kind: 'stem', questionId: 'q1' })
  assertEqual('stem: 1 selector', stemSelectors.length, 1)
  assert(
    'stem: uses link-source attribute and contains question id',
    stemSelectors[0].includes(ATTR_LINK_SOURCE) &&
      stemSelectors[0].includes('q1'),
    stemSelectors[0],
  )

  const optSelectors = sourceSelectorsFor({
    kind: 'option',
    questionId: 'q1',
    optionKey: 'A',
  })
  assertEqual('option: 2 selectors (priority list)', optSelectors.length, 2)
  assert(
    'option priority #1 = option-badge anchor (attr + qid + key)',
    optSelectors[0].includes(ATTR_OPTION_ANCHOR) &&
      optSelectors[0].includes('q1') &&
      optSelectors[0].endsWith('A"]'),
    optSelectors[0],
  )
  assert(
    'option priority #2 = legacy link-source on button (attr + qid + key)',
    optSelectors[1].includes(ATTR_LINK_SOURCE) &&
      optSelectors[1].includes('q1') &&
      optSelectors[1].endsWith('A"]'),
    optSelectors[1],
  )
}

// 11. target priority — quote anchor before sentence anchor
{
  const annotation = {
    id: 'A-1',
    kind: 'evidence',
    target: {
      id: 'A-1',
      paragraphIndex: 0,
      sentenceId: 's-3',
      start: 0,
      end: 0,
      quote: 'whatever',
    },
  }
  const list = targetSelectorsFor(annotation)
  assertEqual('target: 2 selectors', list.length, 2)
  assertEqual('target priority #1 = quote', list[0].kind, 'quote')
  assert(
    'target #1 selector matches quote attr+id',
    list[0].selector.includes(ATTR_QUOTE_ANCHOR) &&
      list[0].selector.includes('A-1'),
    list[0].selector,
  )
  assertEqual('target priority #2 = sentence', list[1].kind, 'sentence')
  assert(
    'target #2 selector matches sentence attr+id',
    list[1].selector.includes(ATTR_SENTENCE_ID) &&
      list[1].selector.includes('s-3'),
    list[1].selector,
  )
}

// 12. cubic path stable
console.log('\n-- evidenceLinking: cubic path geometry --')
{
  const containerRect = { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }
  const sourceRect = { left: 700, top: 100, right: 720, bottom: 120, width: 20, height: 20 }
  const targetRect = { left: 100, top: 400, right: 200, bottom: 416, width: 100, height: 16 }

  const endpoints = rectsToEndpoints(containerRect, sourceRect, targetRect)
  assertDeepEqual(
    'rectsToEndpoints: source = left-mid, target = right-mid, container-relative',
    endpoints,
    { sx: 700, sy: 110, tx: 200, ty: 408 },
  )

  const d = buildCubicPath(endpoints)
  // |dx| = 500, ctrl = max(60, 500*0.45) = 225 → c1=(475,110), c2=(425,408)
  assertEqual(
    'buildCubicPath: byte-stable for known endpoints',
    d,
    'M 700.0 110.0 C 475.0 110.0, 425.0 408.0, 200.0 408.0',
  )

  // Min control distance kicks in when |dx| is small.
  const close = buildCubicPath({ sx: 100, sy: 50, tx: 110, ty: 50 })
  // |dx| = 10 → ctrl = max(60, 4.5) = 60 → c1=(40,50), c2=(170,50)
  assertEqual(
    'buildCubicPath: min control distance = 60',
    close,
    'M 100.0 50.0 C 40.0 50.0, 170.0 50.0, 110.0 50.0',
  )

  const geom = computeOverlayGeometry(containerRect, sourceRect, targetRect)
  assertEqual('computeOverlayGeometry: width', geom.width, 1000)
  assertEqual('computeOverlayGeometry: height', geom.height, 800)
  assertEqual('computeOverlayGeometry: d matches buildCubicPath', geom.d, d)
}

// 13. animation instance policy
console.log('\n-- evidenceLinking: animation instance policy --')
{
  let s = createAnimationInstanceState()
  assertEqual('initial counter is 0', s.counter, 0)
  assertEqual('initial lastLinkId is null', s.lastLinkId, null)

  // Bump on first non-null id.
  s = advanceAnimationInstance(s, 'L-1')
  assertEqual('new activeLink id bumps instance (0 → 1)', s.counter, 1)
  assertEqual('new activeLink id stored', s.lastLinkId, 'L-1')

  // Same activeLink id → no bump even if called many times (geometry recompute).
  const before = s
  s = advanceAnimationInstance(s, 'L-1')
  assert(
    'same activeLink + geometry recompute returns same state object',
    s === before,
  )
  assertEqual('same activeLink id does NOT bump (still 1)', s.counter, 1)
  s = advanceAnimationInstance(s, 'L-1')
  assertEqual('repeated same activeLink still does NOT bump', s.counter, 1)

  // Clear (null) does not bump.
  s = advanceAnimationInstance(s, null)
  assertEqual('clear to null does NOT bump counter', s.counter, 1)
  assertEqual('clear to null updates lastLinkId', s.lastLinkId, null)

  // Same link again after a clear → counts as new, bumps.
  s = advanceAnimationInstance(s, 'L-1')
  assertEqual('clear then same link again bumps (1 → 2)', s.counter, 2)
  assertEqual('after re-bump lastLinkId restored', s.lastLinkId, 'L-1')

  // Switching to a different non-null id also bumps.
  s = advanceAnimationInstance(s, 'L-2')
  assertEqual('switching active link id bumps (2 → 3)', s.counter, 3)
}

/* ───────────────────── evidenceLinking: scroll planner ─────────────────── */

console.log('\n-- evidenceLinking: planScrollIntoView (Cut 2) --')

const {
  planScrollIntoView,
} = evidenceLinking

// Helper to build a "scroller" snapshot.
function scroller({
  top = 0,
  height = 600,
  scrollTop = 0,
  scrollHeight = 2000,
  clientHeight = 600,
}) {
  return {
    scrollerRect: {
      left: 0,
      top,
      right: 800,
      bottom: top + height,
      width: 800,
      height,
    },
    scrollerScrollTop: scrollTop,
    scrollerScrollHeight: scrollHeight,
    scrollerClientHeight: clientHeight,
  }
}

// Helper to build a target rect at a given viewport top, with given height.
function targetAt(top, height = 20) {
  return {
    left: 100,
    top,
    right: 200,
    bottom: top + height,
    width: 100,
    height,
  }
}

// 1. target already comfortably in view → noop
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 200 }),
    targetRect: targetAt(300, 20), // viewport y=300 → content y=500, comfort=[280,520]
  })
  assertEqual('comfortable in view → noop', plan.kind, 'noop')
}

// 2. target above the viewport → scroll up; nextScrollTop puts top at margin
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 1000 }),
    // target at viewport top -50 means it's 50px above the scroller top edge
    // → in content coords, contentTop = 1000 + (-50 - 0) = 950
    targetRect: targetAt(-50, 20),
  })
  assertEqual('above viewport → scroll', plan.kind, 'scroll')
  // contentTop=950, margin=80 → desired scrollTop=950-80=870
  assertEqual('above: nextScrollTop = contentTop - margin', plan.nextScrollTop, 870)
  assertEqual('above: smooth by default', plan.behavior, 'smooth')
}

// 3. target below the viewport → scroll down; nextScrollTop puts bottom at clientHeight - margin
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 100 }),
    // viewport y=580 → content y=680. clientHeight=600, comfort bottom = 100+600-80 = 620.
    // contentBottom = 680+20 = 700 > 620 → needs scroll down.
    // next = contentBottom - clientHeight + margin = 700 - 600 + 80 = 180
    targetRect: targetAt(580, 20),
  })
  assertEqual('below viewport → scroll', plan.kind, 'scroll')
  assertEqual('below: nextScrollTop = contentBottom - clientHeight + margin', plan.nextScrollTop, 180)
}

// 4. target taller than usable viewport → align top with comfort top
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 400, clientHeight: 400, scrollTop: 0 }),
    // usable = 400 - 160 = 240. target height 300 > 240.
    // content y = 0 + (300 - 0) = 300.
    targetRect: targetAt(300, 300),
  })
  assertEqual('overflow target → scroll', plan.kind, 'scroll')
  assertEqual('overflow target: align top with comfort top', plan.nextScrollTop, 300 - 80)
}

// 5. clamping — proposed scrollTop above max is capped to (scrollHeight - clientHeight)
{
  const plan = planScrollIntoView({
    ...scroller({
      top: 0,
      height: 600,
      clientHeight: 600,
      scrollTop: 0,
      scrollHeight: 700, // maxScroll = 100
    }),
    // viewport y=590, height=30 → contentTop=590, contentBottom=620.
    // desiredBottom = 0+600-80 = 520. 620 > 520 → scroll down.
    // unclamped next = 620 - 600 + 80 = 100. maxScroll = 100. clamp leaves 100.
    targetRect: targetAt(590, 30),
  })
  assertEqual('clamp: still scrolls when delta > 0 after clamp', plan.kind, 'scroll')
  assertEqual('clamp: nextScrollTop = scrollHeight - clientHeight', plan.nextScrollTop, 100)
}

// 5a. clamping — when proposed > maxScroll AND already at maxScroll → noop
{
  const plan = planScrollIntoView({
    ...scroller({
      top: 0,
      height: 600,
      clientHeight: 600,
      scrollTop: 100,
      scrollHeight: 700, // maxScroll = 100, already there
    }),
    targetRect: targetAt(580, 20),
  })
  assertEqual('clamp: already at maxScroll → noop (delta=0)', plan.kind, 'noop')
}

// 5b. clamping — negative proposal is capped to 0
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 0 }),
    targetRect: targetAt(20, 20), // contentTop=20, desired=20-80=-60
  })
  // After clamping to >=0, delta from current scrollTop=0 is 0 → noop.
  assertEqual('clamp: negative proposal at top yields noop', plan.kind, 'noop')
}

// 6. tolerance — sub-pixel delta becomes noop
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 100 }),
    // Engineer a scenario where the math says "scroll" but delta < 1.
    // contentTop = 100 + (180 - 0) = 280. desired=180. → would request 180-80=100.
    // delta = 100-100 = 0 → noop (and also hits the needsScroll=false branch first).
    targetRect: targetAt(180, 20),
    tolerance: 1,
  })
  assertEqual('tolerance: zero delta → noop', plan.kind, 'noop')
}

// 7. reduced motion → behavior:'auto'
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 600, scrollTop: 1000 }),
    targetRect: targetAt(-50, 20),
    reducedMotion: true,
  })
  assertEqual('reduced motion: behavior is auto', plan.behavior, 'auto')
  assertEqual('reduced motion: still scrolls', plan.kind, 'scroll')
}

// 8. degenerate viewport (clientHeight too small for 2*margin) → overflow path
{
  const plan = planScrollIntoView({
    ...scroller({ top: 0, height: 100, clientHeight: 100, scrollTop: 0 }),
    targetRect: targetAt(50, 20),
  })
  // usable = 100 - 160 = -60 → degenerate, take overflow branch:
  // contentTop = 0 + (50 - 0) = 50. next = 50 - 80 = -30 → clamp to 0 → delta=0 → noop.
  assertEqual('degenerate viewport at top: clamps to 0 → noop', plan.kind, 'noop')

  const plan2 = planScrollIntoView({
    ...scroller({ top: 0, height: 100, clientHeight: 100, scrollTop: 500, scrollHeight: 5000 }),
    targetRect: targetAt(50, 20),
  })
  // contentTop = 500 + 50 = 550. next = 550 - 80 = 470. delta = 470-500 = -30 → scroll.
  assertEqual('degenerate viewport mid-scroll: scrolls to align top', plan2.kind, 'scroll')
  assertEqual('degenerate viewport: nextScrollTop', plan2.nextScrollTop, 470)
}

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
