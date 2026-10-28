import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeDrawingAreaSourceInput } from '../../test-fixtures/paper-canonical/applicationDrawingAreaFixture.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { validateNck1SourceMaterialization, resolveWritingGivenBlocks } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { nck1MultipleWritingNoticesAuthorityRef as current, nck1WritingGivenRefsAuthorityRef as old,
  nck1CrossPageProducerIssueAuthorityRef as previous } from '../../shared/paper-canonical/authority.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { confirmMaterializationWritingGivens } from './materialization-writing-givens.mjs'
import { assertNck1ApplicationChrome } from './lib-nck1-new-paper-locks.mjs'
import { buildAnswerOnlyHtml } from '../../server/answer-renderer.mjs'
import { produceNck1DocxMaterialization } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { prepareSpellingReview } from '../../server/paper-import/spellingReview.mjs'
const options = { allowMultipleApplicationNotices: true }
function fixture() {
  const input = makeDrawingAreaSourceInput({ drawing: false, listening: false })
  const raw = JSON.parse(Buffer.from(input.materializationBytes))
  raw.schemaVersion = 'nck1-source-materialization-v7'
  const group = raw.groups[7]
  const paragraph = (text, id) => ({ ...structuredClone(group.blocks[0]), blockId: `block:multi-${id}`, content: [{ kind: 'text', text }] })
  group.blocks.splice(-2, 0, paragraph('注意：', 'label'), paragraph('（1）词数80左右；', 'count'),
    paragraph('（2）请按格式作答。', 'format'), paragraph('参考词汇：World Youth Skills Day', 'vocabulary'))
  group.writingTask.givenBlockRefs = group.blocks.slice(-2).map(block => block.blockId)
  return { input, raw, group }
}
const inputFor = ({ input, raw }) => ({ ...input, materializationBytes: Buffer.from(JSON.stringify(raw)) })

const reviewedCountCases = [
  ['ordinary numeral word class', '（1）词数80左右；（2）注意冠词、数词和介词的使用。', true],
  ['unknown 数个词 quantity', '（1）词数80左右；（2）请写数个词。', false],
  ['unknown 数个单词 quantity', '（1）词数80左右；（2）请写数个单词。', false],
  ['word class does not hide quantity', '（1）词数80左右；（2）注意数词的使用并请写数个词。', false],
  ['ordinary connective guidance', '（1）词数80左右；（2）请使用恰当的连接词，使行文连贯。', true],
  ['ordinary spelling guidance', '（1）词数80左右；（2）请避免单词拼写错误。', true],
  ['ordinary word classes', '（1）词数80左右；（2）注意名词、动词和形容词的使用。', true],
  ['ordinary wording guidance', '（1）词数80左右；（2）注意措词，避免重复使用同一个单词。', true],
  ['ordinary bare wording guidance', '（1）词数80左右；（2）注意措词，避免单词重复。', true],
  ['same word repetition', '（1）词数80左右；（2）避免重复使用同一个单词。', true],
  ['same lexical item repetition', '（1）词数80左右；（2）不要反复使用同一个词。', true],
  ['identity determiner without classifier', '（1）词数80左右；（2）不要反复使用同一词。', true],
  ['reference within count clause', '（1）词数80左右并避免重复使用同一个单词。', true],
  ['reference before consistent count', '（1）避免重复使用同一个单词并请写80个单词。', true],
  ['reference does not hide conflicting count', '（1）词数80左右；（2）避免重复使用同一个单词并请写100个单词。', false],
  ['reference does not hide unknown quantity', '（1）词数80左右；（2）避免重复使用同一个单词并请写若干单词。', false],
  ['reference does not hide decimal', '（1）词数80左右；（2）避免重复使用同一个单词并请写80.5个单词。', false],
  ['reference cannot satisfy explicit count prefix', '（1）词数80左右；（2）词数为同一个单词。', false],
  ['ordinary English wording', '（1）词数80左右；（2）Use appropriate linking words and check word spelling.', true],
  ['ordinary own words', '（1）词数80左右；（2）Express your opinion in your own words.', true],
  ['ordinary guidance in count clause', '（1）词数80左右并注意单词拼写。', true],
  ['unknown quantity several', '（1）词数80左右；（2）请写几个单词。', false],
  ['unknown English quantity', '（1）词数80左右；（2）Write several words.', false],
  ['English spelled quantity', '（1）词数80左右；（2）Write eighty words.', false],
  ['compact English decimal', '（1）词数80左右；（2）Write 80.5words.', false],
  ['review conflicting 个单词', '（1）词数80左右；（2）请写100个单词。', false],
  ['review decimal prefix', '（1）词数80.5左右。', false],
  ['review conflicting 词', '（1）词数80左右；（2）请写100词。', false],
  ['review normal control', '（1）词数80左右；（2）请按格式作答。', true],
  ['consistent 个单词', '（1）词数80左右；（2）请写80个单词。', true],
  ['consistent 单词', '（1）请写80单词。', true],
  ['consistent unit-only 个单词', '（1）请写80个单词。', true],
  ['consistent English', '（1）Write 80 words.', true],
  ['conflicting 单词', '（1）词数80左右；（2）请写100单词。', false],
  ['Chinese digits', '（1）词数八十左右。', false],
  ['Chinese digit unit after valid count', '（1）词数80左右；（2）请写八十个单词。', false],
  ['unknown unit declaration after punctuation', '（1）词数80左右。请写若干单词。', false],
  ['unknown prefix declaration after punctuation', '（1）词数80左右.词数若干。', false],
  ['unknown declaration before valid count', '（1）请写若干单词，词数80左右。', false],
  ['range', '（1）词数80至100。', false],
  ['same-endpoint range', '（1）请写80-80个单词。', false],
  ['Chinese endpoint range', '（1）词数80至一百。', false],
  ['missing declaration', '（1）请按格式作答。', false],
  ['decimal unit after valid count', '（1）词数80左右；（2）请写80.5个单词。', false],
  ['integer-valued decimal', '（1）词数80.0左右。', false],
  ['fullwidth decimal', '（1）词数８０．５左右。', false],
  ['decimal comma', '（1）词数80,5左右。', false],
  ['decimal Chinese punctuation', '（1）词数80。5左右。', false],
  ['fraction', '（1）请写80/80个单词。', false],
  ['long integer prefix', '（1）词数8000左右。', false],
  ['exponent prefix', '（1）词数80e0左右。', false],
  ['negative unit count', '（1）请写-80个单词。', false],
  ['mixed numeral suffix', '（1）词数80万左右。', false],
]
for (const [name, text, accepted] of reviewedCountCases) test(`public word-count ruling: ${name}`, () => {
  const f = fixture()
  const start = f.group.blocks.findIndex(block => block.blockId === 'block:multi-label')
  f.group.blocks.splice(start, 3, { ...structuredClone(f.group.blocks[start]),
    content: [{ kind: 'text', text: `注意：${text}` }] })
  const input = inputFor(f)
  const imported = importCanonicalCandidate(input)
  if (accepted) {
    assert.deepEqual(imported.issues, [])
    assert.deepEqual(imported.candidate.authority, current)
    const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
    assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  } else {
    assert(imported.issues.some(issue => issue.code === 'MATERIALIZATION_WRITING_WORD_COUNT_CONFLICT'),
      JSON.stringify(imported.issues))
    const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
    assert(!preview.compilation, 'rejected counts must not compile')
    assert(preview.unresolvedIssues.length)
  }
  for (const materializationAuthorityRef of [old, previous]) {
    const rejected = importCanonicalCandidate(input, undefined, { materializationAuthorityRef })
    assert(rejected.issues.length)
    assert(!compileNck1MaterializationCandidatePreview(rejected.candidate).compilation)
  }
})

test('spelling overlay revalidation retains the same authority capability', () => {
  const input = inputFor(fixture())
  const review = prepareSpellingReview(input.materializationBytes)
  review.reviewedBy = 'import_agent'
  review.reviewedAt = '2026-10-28T00:00:00.000Z'
  for (const target of review.targets) target.decision = 'unchanged'
  const reviewed = { ...input, spellingReviewBytes: Buffer.from(JSON.stringify(review)) }
  assert.deepEqual(importCanonicalCandidate(reviewed).issues, [])
  for (const materializationAuthorityRef of [old, previous]) {
    assert(importCanonicalCandidate(reviewed, undefined, { materializationAuthorityRef }).issues.length)
  }
})

test('public import/compile, authority identity, source observations and downstream chrome', () => {
  const f = fixture()
  assert.deepEqual(validateNck1SourceMaterialization(f.raw, options), [])
  assert(validateNck1SourceMaterialization(f.raw).length)
  const imported = importCanonicalCandidate(inputFor(f))
  assert.deepEqual(imported.issues, [])
  assert.deepEqual(imported.candidate.authority, current)
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  const group = preview.compilation.artifacts.canonicalPaper.questionGroups.find(group => group.variant.family === 'application-writing')
  assert.deepEqual(group.variant.promptBlockRefs, f.group.blocks.slice(0, -2).map(block => block.blockId))
  assert.deepEqual(group.variant.givenSkeleton.parts.map(part => part.blockRef), f.group.writingTask.givenBlockRefs)
  assertNck1ApplicationChrome(group, current)
  for (const authority of [undefined, old, previous]) assert.throws(() => assertNck1ApplicationChrome(group, authority))
  const observations = imported.candidate.interpretation.observations.filter(item => item.observationId.startsWith('observation:application:'))
  assert(observations.length >= 4)
  assert(observations.every(item => item.extraction.version === '18'))
  for (const authorityRef of [undefined, old, previous]) assert.throws(() => buildAnswerOnlyHtml({
    paperName: 'test', materialization: f.raw, authorityRef,
  }), /Answer source is invalid/)
  assert.throws(() => buildAnswerOnlyHtml({ paperName: 'test', materialization: f.raw, authorityRef: current }),
    error => !error.message.includes('Answer source is invalid'), 'new authority reaches independent reference validation')
})

test('cache isolation in both authority orders', () => {
  const input = inputFor(fixture())
  for (const authorities of [[current, old, previous, current], [old, previous, current]]) {
    withNck1MaterializationSourceCache(() => {
      for (const authority of authorities) {
        const result = deriveNck1MaterializationBundle(input, authority)
        assert.equal(result.issues.length === 0, authority === current, JSON.stringify(result.issues))
      }
    })
  }
})

const cases = [
  ['conflicting second count', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数100左右；' }],
  ['target conflict', g => { g.writingTask.wordCountTarget = 100 }],
  ['missing second count', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）内容完整；' }],
  ['two counts in one instruction', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数80左右，词数100左右；' }],
  ['ambiguous range', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数80至100；' }],
  ['ambiguous alternative', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数80或100；' }],
  ['second unparseable declaration', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数80左右，词数若干；' }],
  ['unparseable count', g => { g.blocks.find(b => b.blockId === 'block:multi-count').content[0].text = '（1）词数八十；' }],
  ['no refs', g => { delete g.writingTask.givenBlockRefs }],
  ['empty refs', g => { g.writingTask.givenBlockRefs = [] }],
  ['duplicate refs', g => { g.writingTask.givenBlockRefs[1] = g.writingTask.givenBlockRefs[0] }],
  ['reverse refs', g => { g.writingTask.givenBlockRefs.reverse() }],
  ['only last given', g => { g.writingTask.givenBlockRefs.shift() }],
  ['notice ref', g => { g.writingTask.givenBlockRefs[0] = 'block:multi-count' }],
  ['raw whitespace mismatch', g => { g.writingTask.givenSkeleton[0].text += ' ' }],
  ['missing locator', g => { delete g.blocks.at(-1).source }],
  ['answer-document locator', g => { g.blocks.at(-1).source.documentId = 'answers' }],
  ['invalid locator', g => { g.blocks.at(-1).source.page = 100 }],
  ['non-text given', g => { g.blocks.at(-1).content.push({ kind: 'blank_ref', blankId: 'blank:foreign' }) }],
  ['trailing paragraph', g => { g.blocks.push({ ...structuredClone(g.blocks[0]), blockId: 'block:trailing' }) }],
  ['interleaved table', g => { g.blocks.splice(-1, 0, { kind: 'table', blockId: 'block:gap' }) }],
  ['trailing figure', g => { g.blocks.push({ kind: 'figure', blockId: 'block:gap' }) }],
  ['prompt after first notice', g => { g.writingTask.prompt = g.blocks.at(-1).content[0].text }],
  ['duplicate prompt', g => { g.blocks.splice(1, 0, { ...structuredClone(g.blocks[0]), blockId: 'block:duplicate-prompt' }) }],
  ['figure breaks second notice', g => { const i = g.blocks.findIndex(b => b.blockId === 'block:multi-count'); g.blocks.splice(i, 0, { kind: 'figure', blockId: 'block:gap' }) }],
]
for (const [name, mutate] of cases) test(`reject ${name}`, () => {
  const f = fixture()
  mutate(f.group)
  assert(validateNck1SourceMaterialization(f.raw, options).length, name)
  assert(importCanonicalCandidate(inputFor(f)).issues.length, name)
})

test('older envelopes stay closed and recursive modern envelopes preserve capability', () => {
  for (const version of [4, 6]) {
    const f = fixture()
    f.raw.schemaVersion = `nck1-source-materialization-v${version}`
    assert(validateNck1SourceMaterialization(f.raw, options).length)
    assert(importCanonicalCandidate(inputFor(f)).issues.length)
  }
  const f = fixture()
  f.raw.schemaVersion = 'nck1-source-materialization-v11'
  assert.deepEqual(validateNck1SourceMaterialization(f.raw, options), [])
  assert(importCanonicalCandidate(inputFor(f)).issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'),
    'OCR evidence gate is retained')
  f.raw.schemaVersion = 'nck1-source-materialization-v12'
  f.raw.paragraphJoins = []
  assert.deepEqual(validateNck1SourceMaterialization(f.raw, options).map(issue => issue.code), ['MATERIALIZATION_PARAGRAPH_JOIN_INVALID'])
  assert(importCanonicalCandidate(inputFor(f)).issues.length, 'v12 still requires verified OCR bytes')
})

test('manual helper clones and is idempotent; continuation remains single notice', () => {
  const f = fixture()
  f.raw.schemaVersion = 'nck1-source-materialization-v4'
  const refs = f.group.writingTask.givenBlockRefs
  delete f.group.writingTask.givenBlockRefs
  const before = structuredClone(f.raw)
  const args = { groupId: f.group.groupId, givenBlockRefs: refs, confirmed: true }
  const result = confirmMaterializationWritingGivens(f.raw, args)
  assert.deepEqual(f.raw, before)
  assert.deepEqual(confirmMaterializationWritingGivens(result, args), result)
  assert.throws(() => confirmMaterializationWritingGivens(f.raw, { ...args, confirmed: false }))
  assert.throws(() => confirmMaterializationWritingGivens(f.raw, { ...args, groupId: 'wrong' }))
  const continuation = result.groups[8]
  continuation.blocks.splice(-2, 0, { ...structuredClone(continuation.blocks[0]), blockId: 'block:second-continuation-notice',
    content: [{ kind: 'text', text: '注意：词数150左右。' }] })
  assert(validateNck1SourceMaterialization(result, options).some(issue => issue.code === 'MATERIALIZATION_WRITING_NOTICE_INVALID'))
  assert.equal(resolveWritingGivenBlocks(continuation.blocks, continuation.writingTask, continuation.family, options), null)
})

test('automatic DOCX structure producer keeps all blocks and fails closed on two notices', () => {
  const title = '<w:p><w:r><w:t xml:space="preserve">Should We Join the Reading Club?</w:t></w:r></w:p>'
  const extra = ['注意：', '（1）词数80左右；', '（2）请按格式作答。', '参考词汇：World Youth Skills Day']
  const f = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.includes('Write a short notice')
    ? xml.replace(title, extra.map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('') + title) : xml })
  const result = produceNck1DocxMaterialization({ paperId: f.paperId, documents: f.sourceDocuments })
  assert.equal(result.disposition, 'needs_agent_review')
  const group = result.materialization.groups[7]
  for (const text of extra) assert(group.blocks.some(block => block.content?.some(item => item.text === text)))
  assert.equal(group.writingTask.givenBlockRefs, undefined)
  assert(validateNck1SourceMaterialization(result.materialization).length)
})
