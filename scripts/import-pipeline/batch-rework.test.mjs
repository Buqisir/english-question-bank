import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { metadataReworkFeedback } from './metadata-rework.mjs'
import { resolveVisualParts, visualBatches } from './pdf-visual-shards.mjs'

const load = name => JSON.parse(readFileSync(new URL(`../../server/paper-import-ai/${name}`, import.meta.url)))
const controlledValues = { grammarFacets: load('grammar-fill-facets-v2.json'), grammarSimilarity: load('grammar-fill-similarity-v1.json') }
for (const fixture of [
  { paper: 'jining', number: 58, blankType: 'no-hint', hint: null, answer: 'whose',
    before: 'grammar-fill.no-hint.conjunction.relative-clause', route: 'possessive-determiner',
    textBefore: 'Started by a Chinese-American TikToker Sherry Xliruli, ',
    textAfter: ' video attracted 1.4 million views, the trend sees netizens worldwide playfully embracing routines like wearing house slippers, drinking hot water, practicing Ba Duan Jin exercises, and prioritizing wellness.',
    correct: 'grammar-fill.no-hint.conjunction.relative-clause', legalRoute: 'missing-possessive',
    features: ['human', 'non-restrictive'], role: null },
  { paper: 'yantai', number: 63, blankType: 'given', hint: 'back', answer: 'Backed',
    before: 'grammar-fill.given.verb.finite', route: 'past-participle',
    textBefore: 'Local farmers have benefited a lot. ',
    textAfter: ' (back) by the Green Technology Confucius Institute, the two countries have launched extensive cooperation in education, talent training and technological transfer.',
    correct: 'grammar-fill.given.verb.non-finite', legalRoute: 'adverbial-passive',
    features: ['preposed', 'passive-relation'], role: 'adverbial' },
]) test(`${fixture.paper}: real grammar rework supplies all blank-type candidates and permits facet changes`, () => {
  const questionId = `question:${fixture.paper}:${fixture.number}`
  const blankId = `blank:${fixture.paper}:${fixture.number}`
  const current = { questionId, facetKey: fixture.before, role: null, similarityProfile: { route: fixture.route, features: [] } }
  const issue = { code: 'PUBLIC_METADATA_GRAMMAR_SIMILARITY_INVALID', path: '$.groups[0].metadata.questions[0].similarityProfile', message: 'route/features do not match facet' }
  const feedback = metadataReworkFeedback({
    request: { controlledValues, deterministic: [{ groupId: 'grammar', grammarSourceFacts: {
      [questionId]: { blankId, blankType: fixture.blankType, hint: fixture.hint, answer: fixture.answer },
    } }], sourceGroups: [{ groupId: 'grammar', questions: [{ questionId }], blocks: [{ blockId: 'p1', content: [
      { kind: 'text', text: fixture.textBefore }, { kind: 'blank_ref', blankId }, { kind: 'text', text: fixture.textAfter },
    ] }] }] },
    authored: { groups: [{ groupId: 'grammar', family: 'grammar-fill', metadata: { questions: [current] } }] }, issues: [issue],
  })
  assert.match(feedback.instruction, /允许重新判断并修改 facetKey、role/)
  const question = feedback.grammarQuestions[0]
  assert.equal(question.answer, fixture.answer)
  assert.equal(question.context[0].text, `${fixture.textBefore}[${fixture.answer}]${fixture.textAfter}`)
  assert.deepEqual(question.current, current)
  assert.deepEqual(question.errors, [issue])
  assert.equal(question.candidates.length, controlledValues.grammarFacets.filter(facet => facet.blank_type === fixture.blankType).length)
  const legal = question.candidates.find(candidate => candidate.facetKey === fixture.correct)
  assert.ok(legal.routes.includes(fixture.legalRoute))
  fixture.features.forEach(feature => assert.ok(legal.features.includes(feature)))
  assert.ok(legal.roles.includes(fixture.role))
  assert.ok(question.candidates.every(candidate => candidate.facetKey.startsWith(`grammar-fill.${fixture.blankType}.`)))
})

const images = Array.from({ length: 12 }, (_, index) => `/pdf/page-${index + 1}.png`)
const sha256 = `sha256:${'a'.repeat(64)}`
const part = (extra = {}) => ({ sha256, blocking: [], needsContext: [], notes: [], checkedImages: images, ...extra })
test('seven-choice bank on next page is re-read and resolved; shards overlap forwards too', async () => {
  assert.ok(visualBatches(images)[1].includes(images[8]))
  let calls = 0
  const result = await resolveVisualParts({ images, sha256,
    parts: [part({ needsContext: [{ reason: '第8页七选五正文后未见选项库', pages: [8] }] })],
    recheck: async request => {
      calls++
      assert.deepEqual(request.pages, [7, 8, 9])
      return part({ checkedImages: request.images, decisions: [
        { id: request.issues[0].id, status: 'resolved', pages: [9], evidence: '第9页A–G选项完整且未拆分' },
      ] })
    } })
  assert.equal(calls, 1)
  assert.deepEqual(result.blocking, [])
  assert.equal(result.contextResolutions.length, 1)
})
test('confirmed defects remain blocking, unresolved context also blocks, and wrong SHA is rejected', async () => {
  const result = await resolveVisualParts({ images, sha256,
    parts: [part({ blocking: ['第3页作答框被裁切'], needsContext: [{ reason: '待核选项库', pages: [8] }] })],
    recheck: async request => part({ checkedImages: request.images, decisions: [
      { id: request.issues[0].id, status: 'blocking', reason: '第9页缺少G选项' },
    ] }) })
  assert.equal(result.blocking[0], '第3页作答框被裁切')
  assert.match(result.blocking[1], /第9页缺少G选项/)
  const unresolved = await resolveVisualParts({ images, sha256,
    parts: [part({ needsContext: [{ reason: '待核选项库', pages: [8] }] })],
    recheck: async request => part({ checkedImages: request.images, decisions: [
      { id: request.issues[0].id, status: 'needsContext', reason: '仍缺上下文' },
    ] }) })
  assert.match(unresolved.blocking[0], /仍无法确认/)
  await assert.rejects(resolveVisualParts({ images, sha256,
    parts: [part({ needsContext: [{ reason: '待核', pages: [8] }] })],
    recheck: async request => part({ sha256: 'wrong', checkedImages: request.images }) }), /SHA/)
})

const choiceDoubt = { reason: '选项库只有 A–F，需核对 G', pages: [8] }
const resolveDoubts = (issues, recheck) => resolveVisualParts({ images, sha256,
  parts: [part({ needsContext: issues })], recheck })
const resolvedDecision = issue => ({ id: issue.id, status: 'resolved', pages: [9],
  evidence: '第9页可见完整的 A–G 七个选项，选项库未拆页' })

test('empty recheck cannot silently drop the original doubt even with correct SHA and every image', async () => {
  for (const decisions of [undefined, []]) {
    const result = await resolveDoubts([choiceDoubt], async request => part({
      checkedImages: request.images, ...(decisions ? { decisions } : {}),
    }))
    assert.equal(result.blocking.length, 1)
    assert.match(result.blocking[0], /选项库只有 A–F，需核对 G.*缺少唯一逐项裁决/)
  }
})

test('a partial adjudication leaves every unanswered doubt blocking', async () => {
  const result = await resolveDoubts([choiceDoubt, { reason: '需核对作答框下沿', pages: [9] }],
    async request => part({ checkedImages: request.images, decisions: [resolvedDecision(request.issues[0])] }))
  assert.equal(result.blocking.length, 1)
  assert.match(result.blocking[0], /需核对作答框下沿.*缺少唯一逐项裁决/)
})

test('resolved needs nonempty evidence and a page actually included in this recheck', async () => {
  for (const invalid of [
    { evidence: undefined }, { evidence: '' }, { evidence: ' \n' },
    { pages: undefined }, { pages: [] }, { pages: [1] }, { pages: ['9'] },
  ]) {
    const result = await resolveDoubts([choiceDoubt], async request => part({
      checkedImages: request.images, decisions: [{ ...resolvedDecision(request.issues[0]), ...invalid }],
    }))
    assert.equal(result.blocking.length, 1)
    assert.match(result.blocking[0], /resolved 缺少有效页码或证据/)
  }
})

test('all original doubts can be resolved explicitly and IDs are stable and distinct', async () => {
  const doubts = [choiceDoubt, { reason: '需核对作答框下沿', pages: [9] }, choiceDoubt]
  const collect = async issues => resolveDoubts(issues, async request => {
    assert.equal(new Set(request.issues.map(issue => issue.id)).size, request.issues.length)
    return part({ checkedImages: request.images, decisions: request.issues.map(resolvedDecision) })
  })
  const first = await collect(doubts)
  const second = await collect(doubts)
  assert.deepEqual(first.blocking, [])
  assert.deepEqual(first.contextResolutions[0].issues, second.contextResolutions[0].issues)
  assert.equal(first.contextResolutions[0].result.decisions.length, doubts.length)
})

test('duplicate decisions, unknown IDs and invalid statuses cannot pass', async () => {
  for (const decisions of [
    issue => [resolvedDecision(issue), resolvedDecision(issue)],
    issue => [resolvedDecision(issue), { ...resolvedDecision(issue), id: 'unknown' }],
    issue => [{ ...resolvedDecision(issue), status: 'pass' }],
  ]) {
    const result = await resolveDoubts([choiceDoubt], async request => part({
      checkedImages: request.images, decisions: decisions(request.issues[0]),
    }))
    assert.ok(result.blocking.length > 0)
  }
})
