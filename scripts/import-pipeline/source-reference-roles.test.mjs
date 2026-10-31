import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkedSourceReferences as buildSourceReferences } from './ocr-writing-ownership-test-helpers.mjs'
import { validateWritingRoleDeclarations, resolveWritingRoleDeclarations } from '../../server/paper-import/sourceReferenceRoleDeclarations.mjs'
import { sourceReferenceWritingLifecycle } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences, validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'

function roleFixture(texts, { taskTypes = ['application', 'continuation'], declarations = [], regions = [], lastQuestion, bytes } = {}) {
  const observations = texts.map((text, i) => ({
    observationId: `o${i}`, region: { x: .1, y: .15 + i * .03, width: .8, height: .02, ...regions[i] },
  }))
  const materialization = {
    paperId: 'paper-role-fixture',
    documents: [{ documentId: 'answers', role: 'official_answers', mediaType: 'application/pdf',
      sha256: sha256(bytes ?? 'answers'), pageCount: 1 }],
    groups: [
      ...(lastQuestion ? [{ questions: [{ sourceNumber: lastQuestion }] }] : []),
      ...taskTypes.map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
    ],
  }
  const confirmation = { documents: [{ documentId: 'answers', pages: [{ page: 1, visualClassifications: [],
    orderedItems: texts.map((text, i) => ({ itemId: `i${i}`, text, observationIds: [`o${i}`] })) }] }] }
  const evidence = { documents: [{ documentId: 'answers', pages: [{ observations }] }] }
  const items = new Map(confirmation.documents[0].pages[0].orderedItems.map((item, i) => [item.itemId, { item, index: i }]))
  const validated = validateWritingRoleDeclarations(declarations.map(entry => ({
    itemId: entry.itemId ?? `i${entry.at}`, page: 1,
    quote: entry.quote ?? texts[entry.at],
    role: entry.role, taskType: entry.taskType, reason: entry.reason ?? 'test fixture',
  })), { materialization, confirmation })
  return { materialization, evidence, confirmation, declarations: validated }
}

function build(fixture, options = {}) {
  return buildSourceReferences(fixture.materialization, fixture.evidence, fixture.confirmation,
    { writingRoleDeclarations: fixture.declarations, ...options })
}

test('declarations must quote the confirmed item exactly, on its page, without repeats', () => {
  const texts = ['第四部分 写作', '【参考范文】', 'A sample letter.', '【评分细则】', 'One scoring rule.']
  const { materialization, confirmation } = roleFixture(texts)
  const base = { page: 1, role: 'sample-heading', taskType: 'application', reason: 'fixture' }
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', quote: 'wrong quote' }], { materialization, confirmation }),
    /quote must equal the confirmed item text exactly/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', page: 9, quote: texts[1] }], { materialization, confirmation }),
    /page 9 differs from the confirmed page/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'missing', quote: 'x' }], { materialization, confirmation }),
    /does not name a confirmed answer-document item/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', quote: texts[1], role: 'unknown' }], { materialization, confirmation }),
    /role must be one of/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', quote: texts[1] },
      { ...base, itemId: 'i1', quote: texts[1] }], { materialization, confirmation }),
    /repeats the declaration/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', quote: texts[1] },
      { ...base, itemId: 'i1', quote: texts[1], role: 'scoring-heading' }], { materialization, confirmation }),
    /conflicts with the earlier/)
  assert.throws(() => validateWritingRoleDeclarations(
    [{ ...base, itemId: 'i1', quote: texts[1], taskType: 'question' }], { materialization, confirmation }),
    /taskType must be application or continuation/)
})

test('a declared sample heading must capture essay body or fail hard', () => {
  // The declared sample heading is immediately followed by scoring prose and
  // nothing else: it cannot silently degrade to not_supplied.
  const fixture = roleFixture(['【参考范文】', '【评分细则】', 'Some scoring rule.'], {
    declarations: [{ at: 0, role: 'sample-heading', taskType: 'application' },
      { at: 1, role: 'scoring-heading', taskType: 'application' }],
  })
  assert.throws(() => build(fixture), err =>
    err.code === 'SOURCE_REFERENCE_ROLE_DECLARATION_INVALID' && /captured no essay body/.test(err.message))
})

test('a bare 【参考范文】 declaration both names the task and starts its essay', () => {
  const fixture = roleFixture([
    '第四部分 写作', '【参考范文】', 'Dear Sam,', 'Our class planted herbs.', 'Yours,', 'Li Hua',
    '【评分细则】', 'Some scoring rule.',
    '【参考范文】', 'Mia opened the garden gate.', '【评分细则】', 'Another scoring rule.',
  ], {
    declarations: [
      { at: 1, role: 'sample-heading', taskType: 'application' },
      { at: 6, role: 'scoring-heading', taskType: 'application' },
      { at: 8, role: 'sample-heading', taskType: 'continuation' },
      { at: 10, role: 'scoring-heading', taskType: 'continuation' },
    ],
  })
  const result = build(fixture)
  assert.deepEqual(result.groups.map(group => group.essays.state), ['captured', 'captured'])
  assert.equal(result.groups[0].essays.entries[0].paragraphs.map(p => p.text).join(' '),
    'Dear Sam, Our class planted herbs. Yours, Li Hua')
  assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text),
    ['Mia opened the garden gate.'])
  assert.deepEqual(result.groups.map(group => group.scoring.state), ['captured', 'captured'])
})

test('a repeated declared section heading switches the same task to scoring without erasing essays', () => {
  // 徐州-style: sample then a second 第一节/第二节 pair reopening rubrics.
  const fixture = roleFixture([
    '第一节 应用文', '参考范文', 'Dear Sam,', 'Our class planted herbs.', 'Yours,', 'Li Hua',
    '第二节 读后续写', '参考范文', 'Mia opened the garden gate.',
    '第一节', '评分原则', 'Application scoring rule.',
    '第二节', '评分原则', 'Continuation scoring rule.',
  ], {
    declarations: [
      { at: 9, role: 'section-heading', taskType: 'application' },
      { at: 12, role: 'section-heading', taskType: 'continuation' },
    ],
  })
  const result = build(fixture)
  assert.deepEqual(result.groups.map(group => group.essays.state), ['captured', 'captured'])
  assert.equal(result.groups[0].essays.entries[0].paragraphs.map(p => p.text).join(' '),
    'Dear Sam, Our class planted herbs. Yours, Li Hua')
  assert.equal(result.groups[1].essays.entries[0].paragraphs.map(p => p.text).join(' '),
    'Mia opened the garden gate.')
})

test('identical input without declarations keeps the legacy output', () => {
  const texts = ['第一节 应用文', '参考范文', 'Dear Sam,', 'Our class planted herbs.', 'Yours,', 'Li Hua',
    '第二节 读后续写', '参考范文', 'Mia opened the garden gate.']
  const without = roleFixture(texts)
  const legacy = buildSourceReferences(without.materialization, without.evidence, without.confirmation)
  const empty = buildSourceReferences(without.materialization, without.evidence, without.confirmation,
    { writingRoleDeclarations: [] })
  assert.deepEqual(empty.groups, legacy.groups)
  assert.equal(empty.writingRoleDeclarations, undefined)
})

test('admission accepts a sealed declaration artifact and rejects a forged one', () => {
  const bytes = Buffer.from('%PDF-1.4\nrole fixture\n')
  const fixture = roleFixture([
    '【参考范文】', 'Dear Sam,', 'Our class planted herbs.', 'Yours,', 'Li Hua',
    '【参考范文】', 'Mia opened the garden gate.',
  ], {
    bytes,
    declarations: [
      { at: 0, role: 'sample-heading', taskType: 'application' },
      { at: 5, role: 'sample-heading', taskType: 'continuation' },
    ],
  })
  const result = build(fixture)
  const materialization = fixture.materialization
  const input = { materialization, sourceDigest: sha256('src'), candidateDigest: sha256('cand'), sourceInput: {
    documents: [{ documentId: 'answers', bytes }],
    ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(fixture.evidence)),
      confirmationBytes: Buffer.from(JSON.stringify(fixture.confirmation)) },
  } }
  const sidecar = { ...prepareSourceReferences({ ...input, materialization }), groups: result.groups,
    writingRoleDeclarations: fixture.declarations }
  assert.doesNotThrow(() => assertSourceReferenceAdmission({ ...input, sidecar }))
  const forged = structuredClone(sidecar)
  forged.writingRoleDeclarations = [{ ...fixture.declarations[0], quote: 'tampered quote' }]
  assert.throws(() => assertSourceReferenceAdmission({ ...input, sidecar: forged }),
    err => err.code === 'SOURCE_REFERENCE_ROLE_DECLARATION_INVALID')
})
