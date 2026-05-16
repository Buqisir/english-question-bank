#!/usr/bin/env node
/**
 * Verification: selectReadingAnalysisFromDetail (Reading Analysis layer V0).
 *
 * The selector turns a real `QuestionGroupDetail` (+ optional sidecar) into
 * the same `ReadingAnalysisFixture` shape the V0 view consumes. We exercise
 * every documented branch with synthetic detail/sidecar fixtures so the
 * verify never depends on the live SQLite or AI.
 *
 * Eight cases per the PRD:
 *   1. groupId + sidecar full-hit → ok=true, all anns + links wired.
 *   2. sidecar quote miss → ok=true, entry dropped, warnings recorded.
 *   3. questionNo not found → ok=false reason=question-not-found.
 *   4. no questions at all → ok=false reason=no-questions.
 *   5. non-4-option question → ok=false reason=unsupported-question-type.
 *   6. empty passage → ok=false reason=empty-passage.
 *   7. empty sidecar → ok=true, anns=[], links=[].
 *   8. same sentence evidence + trap → both anns kept, warning recorded.
 */

import path from 'node:path'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

const here = path.dirname(new URL(import.meta.url).pathname)
const selectorMod = await import(
  path.resolve(here, '..', 'app', 'src', 'features', 'reading-analysis', 'selectors', 'selectReadingAnalysis.ts')
)
const { selectReadingAnalysisFromDetail, splitParagraphs, splitSentences, normalizeQuote } = selectorMod

console.log('=== Reading Analysis Selector verification ===\n')

// ── Helpers ───────────────────────────────────────────────────────────────
function makeDetail(overrides = {}) {
  return {
    id: 'g-test',
    title: 'Test group',
    source: 'test',
    sourceType: 'self_made',
    year: 2025,
    region: 'test',
    paperName: 'test',
    section: 'test',
    passageTitle: 'Test Passage',
    summary: '',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'medium',
    tags: [],
    topicLabels: [],
    hit: '',
    answerPreview: '',
    defaultScore: 2.5,
    instruction: '',
    note: '',
    sourceDetail: { id: '', publisher: '', originalUrl: '', fileRef: '', note: '' },
    passage: {
      id: 'p-test',
      title: 'Test Passage',
      materialText:
        'The first sentence introduces the topic. The second sentence develops the idea further.\u3000\u3000A new paragraph begins here. It ends with another sentence.',
      summary: '',
      theme: '',
      discourseType: '',
      wordCount: null,
      note: '',
    },
    questions: [
      {
        id: 'q-1',
        questionNo: '1',
        questionType: '阅读理解',
        stem: 'What is the topic?',
        answer: 'B',
        explanation: '',
        difficulty: 'medium',
        score: 2.5,
        displayOrder: 1,
        note: '',
        options: [
          { id: 'o1', label: 'A', content: 'Wrong A', displayOrder: 1 },
          { id: 'o2', label: 'B', content: 'Correct B', displayOrder: 2 },
          { id: 'o3', label: 'C', content: 'Wrong C', displayOrder: 3 },
          { id: 'o4', label: 'D', content: 'Wrong D', displayOrder: 4 },
        ],
      },
    ],
    ...overrides,
  }
}

// ── Test 0: paragraph + sentence splitter sanity ─────────────────────────
console.log('Test 0: splitter primitives')
{
  const para = splitParagraphs(
    'Para one S1. Para one S2.\u3000\u3000Para two S1. Para two S2.',
  )
  assert('splitParagraphs: 2 paragraphs from 全角 double space', para.length === 2, `got ${para.length}`)

  const blank = splitParagraphs('Para one.\n\nPara two.')
  assert('splitParagraphs: 2 paragraphs from blank line', blank.length === 2, `got ${blank.length}`)

  const sent = splitSentences('Hello world. This is fine. Mr. Smith arrived.')
  assert('splitSentences: ≥ 2 sentences', sent.length >= 2, `got ${JSON.stringify(sent)}`)

  assert('normalizeQuote collapses CJK + curly chars',
    normalizeQuote('  Don\u2019t   stop\u3000\u3000now ') === "don't stop now",
    `got: "${normalizeQuote('  Don\u2019t   stop\u3000\u3000now ')}"`)
}

// ── Test 1: full-hit sidecar ─────────────────────────────────────────────
console.log('\nTest 1: groupId + sidecar full-hit → ok=true, anns + links wired')
{
  const detail = makeDetail()
  const sidecar = {
    entries: [
      {
        groupId: 'g-test',
        questionNo: '1',
        kind: 'evidence',
        quote: 'first sentence introduces the topic',
      },
      {
        groupId: 'g-test',
        questionNo: '1',
        optionLabel: 'A',
        kind: 'trap',
        quote: 'A new paragraph begins here',
      },
    ],
  }
  const r = selectReadingAnalysisFromDetail({ detail, sidecar })
  assert('ok=true', r.ok === true, JSON.stringify(r))
  if (!r.ok) throw new Error('test 1 failed')
  assert('passage paragraphs = 2', r.fixture.passage.paragraphs.length === 2, `got ${r.fixture.passage.paragraphs.length}`)
  assert('question.options length = 4', r.fixture.question.options.length === 4, '')
  assert('option B is the correct one',
    r.fixture.question.options.find((o) => o.key === 'B').correct === true, '')
  assert('option A is NOT correct',
    r.fixture.question.options.find((o) => o.key === 'A').correct === false, '')
  assert('annotations length = 2 (one per matched entry)', r.fixture.annotations.length === 2, `got ${r.fixture.annotations.length}`)
  assert('links length = 2 (one per matched entry)', r.fixture.links.length === 2, `got ${r.fixture.links.length}`)
  // Stem-only entry → from has no optionKey.
  const stemLink = r.fixture.links.find((l) => !l.from.optionKey)
  assert('stem-only entry → link without optionKey', !!stemLink, '')
  assert('stem entry → support link kind', stemLink.kind === 'support', `got ${stemLink?.kind}`)
  // Option-A trap entry → from.optionKey = A, kind = trap.
  const optLink = r.fixture.links.find((l) => l.from.optionKey === 'A')
  assert('option A entry → link kind=trap', optLink && optLink.kind === 'trap', JSON.stringify(optLink))
  // toAnnotationId resolves.
  for (const link of r.fixture.links) {
    assert(`link ${link.id} resolves to a real annotation`,
      r.fixture.annotations.some((a) => a.id === link.toAnnotationId), '')
  }
  assert('warnings empty for full-hit', r.warnings.length === 0, JSON.stringify(r.warnings))
  // Quote diagnostics: every entry recorded, both as `hit`, no reason needed.
  assert('quoteDiagnostics length = 2', r.quoteDiagnostics.length === 2, `got ${r.quoteDiagnostics.length}`)
  assert('every diagnostic status=hit', r.quoteDiagnostics.every((d) => d.status === 'hit'),
    JSON.stringify(r.quoteDiagnostics.map((d) => d.status)))
  assert('hit diagnostics carry no reason on distinct sentences',
    r.quoteDiagnostics.every((d) => d.reason === undefined), JSON.stringify(r.quoteDiagnostics))
}

// ── Test 2: quote miss ───────────────────────────────────────────────────
console.log('\nTest 2: sidecar quote not present → entry dropped + warning')
{
  const detail = makeDetail()
  const sidecar = {
    entries: [
      {
        groupId: 'g-test',
        questionNo: '1',
        kind: 'evidence',
        quote: 'this exact phrase does not appear anywhere',
      },
      {
        groupId: 'g-test',
        questionNo: '1',
        kind: 'evidence',
        quote: 'first sentence introduces the topic',
      },
    ],
  }
  const r = selectReadingAnalysisFromDetail({ detail, sidecar })
  assert('ok=true even with one miss', r.ok === true, '')
  if (!r.ok) throw new Error('test 2 failed')
  assert('only the matched entry → 1 annotation', r.fixture.annotations.length === 1, `got ${r.fixture.annotations.length}`)
  assert('only the matched entry → 1 link', r.fixture.links.length === 1, `got ${r.fixture.links.length}`)
  assert('warnings include quote-miss', r.warnings.some((w) => w.startsWith('quote-miss')), JSON.stringify(r.warnings))
  // Diagnostics: both entries recorded — one miss, one hit.
  assert('quoteDiagnostics length = 2', r.quoteDiagnostics.length === 2, `got ${r.quoteDiagnostics.length}`)
  const missDiag = r.quoteDiagnostics.find((d) => d.status === 'miss')
  const hitDiag = r.quoteDiagnostics.find((d) => d.status === 'hit')
  assert('miss diagnostic recorded', !!missDiag, '')
  assert('miss reason is one of the bounded vocabulary',
    missDiag && ['not_found', 'cross_sentence', 'multiple_matches'].includes(missDiag.reason),
    `got reason=${missDiag?.reason}`)
  assert('miss diagnostic carries quote', missDiag?.quote.includes('does not appear'), `got: ${missDiag?.quote}`)
  assert('miss diagnostic carries questionNo + kind',
    missDiag?.questionNo === '1' && missDiag?.kind === 'evidence',
    JSON.stringify(missDiag))
  assert('hit diagnostic recorded', !!hitDiag, '')
}

// ── Test 3: questionNo not found ─────────────────────────────────────────
console.log('\nTest 3: questionNo missing → reason=question-not-found')
{
  const r = selectReadingAnalysisFromDetail({
    detail: makeDetail(),
    questionNo: '42',
  })
  assert('ok=false', r.ok === false, '')
  assert('reason=question-not-found', !r.ok && r.reason === 'question-not-found', `got ${r.reason}`)
}

// ── Test 4: no questions ─────────────────────────────────────────────────
console.log('\nTest 4: detail with no questions → reason=no-questions')
{
  const r = selectReadingAnalysisFromDetail({
    detail: makeDetail({ questions: [] }),
  })
  assert('ok=false', r.ok === false, '')
  assert('reason=no-questions', !r.ok && r.reason === 'no-questions', `got ${r.reason}`)
}

// ── Test 5: not 4 options ────────────────────────────────────────────────
console.log('\nTest 5: question with ≠ 4 options → reason=unsupported-question-type')
{
  const detail = makeDetail()
  detail.questions[0].options = detail.questions[0].options.slice(0, 3)
  const r = selectReadingAnalysisFromDetail({ detail })
  assert('ok=false', r.ok === false, '')
  assert('reason=unsupported-question-type', !r.ok && r.reason === 'unsupported-question-type', `got ${r.reason}`)
}

// ── Test 5b: 4 options but one mislabeled ────────────────────────────────
console.log('\nTest 5b: 4 options but missing label B → reason=unsupported-question-type')
{
  const detail = makeDetail()
  detail.questions[0].options = [
    { id: 'o1', label: 'A', content: 'Wrong A', displayOrder: 1 },
    { id: 'o2', label: 'A', content: 'Dup A', displayOrder: 2 },
    { id: 'o3', label: 'C', content: 'Wrong C', displayOrder: 3 },
    { id: 'o4', label: 'D', content: 'Wrong D', displayOrder: 4 },
  ]
  const r = selectReadingAnalysisFromDetail({ detail })
  assert('reason=unsupported-question-type', !r.ok && r.reason === 'unsupported-question-type', `got ${r.reason}`)
}

// ── Test 6: empty passage ────────────────────────────────────────────────
console.log('\nTest 6: empty passage materialText → reason=empty-passage')
{
  const detail = makeDetail()
  detail.passage.materialText = '   '
  const r = selectReadingAnalysisFromDetail({ detail })
  assert('ok=false', r.ok === false, '')
  assert('reason=empty-passage', !r.ok && r.reason === 'empty-passage', `got ${r.reason}`)
}

// ── Test 7: empty sidecar → ok with no anns / links ──────────────────────
console.log('\nTest 7: no sidecar provided → ok=true, anns=[], links=[]')
{
  const r = selectReadingAnalysisFromDetail({ detail: makeDetail() })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 7 failed')
  assert('annotations empty', r.fixture.annotations.length === 0, `got ${r.fixture.annotations.length}`)
  assert('links empty', r.fixture.links.length === 0, '')
  assert('passage and question still rendered', r.fixture.passage.paragraphs.length > 0 && r.fixture.question.options.length === 4, '')
  assert('warnings empty', r.warnings.length === 0, '')
}

// ── Test 8: same sentence evidence + trap ────────────────────────────────
console.log('\nTest 8: same sentence both evidence + trap → both kept + warning')
{
  const detail = makeDetail()
  const sidecar = {
    entries: [
      { groupId: 'g-test', questionNo: '1', kind: 'evidence', quote: 'first sentence introduces the topic' },
      { groupId: 'g-test', questionNo: '1', optionLabel: 'A', kind: 'trap', quote: 'first sentence introduces the topic' },
    ],
  }
  const r = selectReadingAnalysisFromDetail({ detail, sidecar })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 8 failed')
  assert('annotations length = 2', r.fixture.annotations.length === 2, `got ${r.fixture.annotations.length}`)
  const sentenceIds = new Set(r.fixture.annotations.map((a) => a.target.sentenceId))
  assert('both annotations target the same sentence', sentenceIds.size === 1, JSON.stringify([...sentenceIds]))
  const kinds = new Set(r.fixture.annotations.map((a) => a.kind))
  assert('annotations include both evidence + trap', kinds.has('evidence') && kinds.has('trap'), JSON.stringify([...kinds]))
  assert('warnings include same-sentence-evidence-and-trap',
    r.warnings.some((w) => w.startsWith('same-sentence-evidence-and-trap')),
    JSON.stringify(r.warnings))
  assert('links length = 2', r.fixture.links.length === 2, '')
  // Diagnostics: both hits, the second one tagged same_sentence_multi.
  assert('all diagnostics status=hit', r.quoteDiagnostics.every((d) => d.status === 'hit'),
    JSON.stringify(r.quoteDiagnostics))
  assert('second hit diagnostic reason=same_sentence_multi',
    r.quoteDiagnostics[1]?.reason === 'same_sentence_multi',
    JSON.stringify(r.quoteDiagnostics))
}

// ── Test 9: questionNo=2 selects the second question ─────────────────────
console.log('\nTest 9: questionNo selects the right question')
{
  const detail = makeDetail()
  detail.questions = [
    detail.questions[0],
    {
      ...detail.questions[0],
      id: 'q-2',
      questionNo: '2',
      stem: 'Second question stem',
      answer: 'C',
    },
  ]
  const r = selectReadingAnalysisFromDetail({ detail, questionNo: '2' })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 9 failed')
  assert('selects q-2', r.fixture.question.id === 'q-2', `got ${r.fixture.question.id}`)
  assert('correct option follows answer (C)',
    r.fixture.question.options.find((o) => o.key === 'C').correct === true, '')
}

// ── Test 10: option label normalization (e.g. "(A)") ─────────────────────
console.log('\nTest 10: option labels with punctuation are normalized to A-D')
{
  const detail = makeDetail()
  detail.questions[0].options = [
    { id: 'o1', label: '(A)', content: 'A', displayOrder: 1 },
    { id: 'o2', label: 'B.', content: 'B', displayOrder: 2 },
    { id: 'o3', label: ' C ', content: 'C', displayOrder: 3 },
    { id: 'o4', label: 'D', content: 'D', displayOrder: 4 },
  ]
  detail.questions[0].answer = '(B)'
  const r = selectReadingAnalysisFromDetail({ detail })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 10 failed')
  assert('B is correct after normalization',
    r.fixture.question.options.find((o) => o.key === 'B').correct === true, '')
}

// ── Test 11: passage title falls back gracefully ─────────────────────────
console.log('\nTest 11: passage title falls back through detail.passage.title → passageTitle → title')
{
  const detail = makeDetail({
    title: 'GroupTitleOnly',
    passageTitle: '',
    passage: { ...makeDetail().passage, title: '' },
  })
  const r = selectReadingAnalysisFromDetail({ detail })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 11 failed')
  assert('falls back to detail.title', r.fixture.passage.title === 'GroupTitleOnly', `got: ${r.fixture.passage.title}`)
}

// ── Test 12: quote diagnostic miss reasons ───────────────────────────────
console.log('\nTest 12: quote miss reason classification (cross_sentence vs not_found)')
{
  const detail = makeDetail()
  const sidecar = {
    entries: [
      // Cross-sentence quote: contains an internal terminator+space+letter.
      {
        groupId: 'g-test',
        questionNo: '1',
        kind: 'evidence',
        quote: 'first sentence introduces the topic. The second sentence develops the idea',
      },
      // Truly absent quote.
      {
        groupId: 'g-test',
        questionNo: '1',
        kind: 'evidence',
        quote: 'this phrase is nowhere in the text',
      },
    ],
  }
  const r = selectReadingAnalysisFromDetail({ detail, sidecar })
  assert('ok=true', r.ok === true, '')
  if (!r.ok) throw new Error('test 12 failed')
  assert('quoteDiagnostics length = 2', r.quoteDiagnostics.length === 2, `got ${r.quoteDiagnostics.length}`)
  assert('all diagnostics status=miss', r.quoteDiagnostics.every((d) => d.status === 'miss'),
    JSON.stringify(r.quoteDiagnostics))
  const reasons = r.quoteDiagnostics.map((d) => d.reason)
  assert('cross_sentence reason emitted for terminator-containing quote',
    reasons.includes('cross_sentence'), JSON.stringify(reasons))
  assert('not_found reason emitted for absent quote',
    reasons.includes('not_found'), JSON.stringify(reasons))
  assert('groupId on diagnostics matches detail.id',
    r.quoteDiagnostics.every((d) => d.groupId === detail.id), '')
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
