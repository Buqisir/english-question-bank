import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { decideLineJoin } from './ocr-join-decisions.mjs'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { prepareSourceReferences, validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'

const sha = `sha256:${'a'.repeat(64)}`
const source = (page, documentId = 'answers') => ({
  documentSha256: sha,
  locator: { kind: 'page_region', documentId, page, region: { x: .1, y: .2, width: .8, height: .02 } },
})
function boundary() {
  return {
    content: 'reference', previous: { role: 'body', text: 'We found a place where we could', right: .9, page: 1 },
    current: computeLineFacts({ text: 'learn together.', page: 2, left: .2 }),
    geometry: { unit: 'normalized', previousMargin: { left: .1, right: .9 }, margin: { left: .2, right: .6 } },
    roles: { hasParagraph: true },
    location: { before: { documentId: 'answers', page: 1, itemId: 'before' },
      after: { documentId: 'answers', page: 2, itemId: 'after' } },
    referenceContext: { entryKind: 'essays', before: source(1), after: source(2), furnitureOnly: true },
  }
}

test('cross-page rule uses each page’s own margin and preserves decision locations', () => {
  const input = boundary()
  const before = structuredClone(input)
  const decision = decideLineJoin(input)
  assert.equal(decision.reason, 'reference.cross-page-continuation')
  assert.equal(decision.action, 'join')
  assert.deepEqual(decision.location, input.location)
  assert.deepEqual(decision.reviews, [])
  assert.deepEqual(input, before)
})

const uncertain = [
  ['sentence-final full stop', i => { i.previous.text += '.' }],
  ['sentence-final punctuation before closing quotes', i => { i.previous.text += '!”' }],
  ['ellipsis', i => { i.previous.text += '…' }],
  ['unresolved hyphen', i => { i.previous.text += '-' }],
  ['next-line indent', i => { i.current = computeLineFacts({ text: 'learn together.', page: 2, left: .24 }) }],
  ['short previous line despite a narrower next-page margin', i => { i.previous.right = .7 }],
  ['non-adjacent pages', i => { i.current = computeLineFacts({ text: 'learn together.', page: 3, left: .2 }); i.referenceContext.after = source(3) }],
  ['decreasing pages', i => { i.current = computeLineFacts({ text: 'learn together.', page: 1, left: .2 }); i.previous.page = 2; i.referenceContext.before = source(2); i.referenceContext.after = source(1) }],
  ['different documents', i => { i.referenceContext.after = source(2, 'other') }],
  ['different documents with equal page numbers', i => { i.current = computeLineFacts({ text: 'learn together.', page: 1, left: .2 }); i.referenceContext.after = source(1, 'other') }],
  ['different document SHA', i => { i.referenceContext.after.documentSha256 = `sha256:${'b'.repeat(64)}` }],
  ['non-page locator', i => { i.referenceContext.after.locator = { kind: 'docx_part', documentId: 'answers' } }],
  ['unbound document SHA', i => { i.referenceContext.after.documentSha256 = null }],
  ['missing previous-page margin', i => { delete i.geometry.previousMargin }],
  ['missing current-line geometry', i => { i.current = computeLineFacts({ text: 'learn together.', page: 2 }) }],
  ['intervening non-furniture content', i => { i.referenceContext.furnitureOnly = false }],
  ['unknown intervening content', i => { delete i.referenceContext.furnitureOnly }],
]
for (const [name, change] of uncertain) test(`cross-page uncertainty stays split with one review: ${name}`, () => {
  const input = boundary()
  change(input)
  const decision = decideLineJoin(input)
  assert.equal(decision.action, 'review')
  assert.equal(decision.resolution, 'separate')
  assert.equal(decision.reviews.length, 1)
})

for (const [name, change] of [
  ['scoring', i => { i.referenceContext.entryKind = 'scoring' }],
  ['non-body previous paragraph', i => { i.previous.role = 'salutation' }],
  ['non-body next paragraph', i => { i.roles.special = 'title' }],
  ['uppercase next line', i => { i.current = computeLineFacts({ text: 'Learn together.', page: 2, left: .2 }) }],
]) test(`cross-page continuation cannot apply to ${name}`, () => {
  const input = boundary()
  change(input)
  assert.equal(decideLineJoin(input).resolution, 'separate')
})

const line = (text, y, left = .1, width = .8) => ({ text, y, left, width })
function fixture(pageLines) {
  const evidencePages = []
  const pages = pageLines.map((rows, p) => {
    const observations = []
    const orderedItems = rows.map(({ text, y, left, width }, n) => {
      const observationIds = Array.from({ length: 4 }, (_, k) => {
        const observationId = `p${p + 1}-r${n}-w${k}`
        observations.push({ observationId, region: { x: left + width * k / 4, y, width: width / 4, height: .02 } })
        return observationId
      })
      return { itemId: `p${p + 1}-i${n}`, text, observationIds }
    })
    evidencePages.push({ page: p + 1, observations })
    return { page: p + 1, orderedItems }
  })
  return [
    { paperId: 'paper-synthetic-continuation', documents: [{ documentId: 'answers', role: 'official_answers',
      sha256: sha, mediaType: 'application/pdf', pageCount: pages.length }],
    groups: [{ groupId: 'writing-continuation', writingTask: { taskType: 'continuation' } }] },
    { documents: [{ documentId: 'answers', pages: evidencePages }] },
    { documents: [{ documentId: 'answers', pages }] },
  ]
}
const heading = [line('第二节 读后续写', .2), line('参考范文', .24)]
const paragraphs = output => output.groups[0].essays.entries.flatMap(e => e.paragraphs)

test('reference English hyphen glue retains a compound without a space', () => {
  const input = fixture([[...heading, line('We provide AI-', .3), line('based feedback.', .34)]])
  assert.deepEqual(paragraphs(buildSourceReferences(...input)).map(p => p.text), ['We provide AI-based feedback.'])
})

for (const [previous, current, expected] of [
  ['He understood Lucas', 'was trying to help.', 'He understood Lucas was trying to help.'],
  ['Get that paint off your', 'face before dinner.', 'Get that paint off your face before dinner.'],
  ['We provide AI-', 'based feedback.', 'We provide AI-based feedback.'],
]) test(`reference English wrapping vetoes false indented paragraphs: ${previous}`, () => {
  const input = fixture([[...heading, line(previous, .3), line(current, .34, .14, .76)]])
  assert.deepEqual(paragraphs(buildSourceReferences(...input)).map(p => p.text), [expected])
})

for (const [previous, current, expected] of [
  ['说明功能：清晰阐述平台的主要功能，如AI口语测评、个', '性化词汇推送等，需准确且简洁。',
    '说明功能：清晰阐述平台的主要功能，如AI口语测评、个性化词汇推送等，需准确且简洁。'],
  ['阐述帮助：说明平台对学习的具体帮助，如提升口语流利', '度、提高记词效率等，体现平台的实用价值。',
    '阐述帮助：说明平台对学习的具体帮助，如提升口语流利度、提高记词效率等，体现平台的实用价值。'],
  ['结尾表达：合理表达希望对方尝试并反馈的意愿，使邮件', '有完整的收尾。',
    '结尾表达：合理表达希望对方尝试并反馈的意愿，使邮件有完整的收尾。'],
]) test(`reference Chinese scoring wrapping vetoes false indented paragraphs: ${previous}`, () => {
  const input = fixture([[line('第二节 读后续写', .2), line('参考范文', .24), line('A complete sample.', .28),
    line('评分标准', .32), line(previous, .36), line(current, .4, .14, .76)]])
  const scoring = buildSourceReferences(...input).groups[0].scoring
  assert.deepEqual(scoring.entries.flatMap(e => e.paragraphs.map(p => p.text)), [expected])
})

for (const [previous, current] of [
  ['We finished our work.', 'Another day began.'],
  ['We finished our work!”', 'Another day began.'],
  ['We considered this:', 'another approach followed.'],
]) test(`reference veto preserves English paragraph boundary: ${previous}`, () => {
  const input = fixture([[...heading, line(previous, .3), line(current, .34, .14, .76)]])
  assert.deepEqual(paragraphs(buildSourceReferences(...input)).map(p => p.text), [previous, current])
})

for (const [previous, current] of [
  ...['。', '！', '？', '；', '：', '。”）'].map(end => [`评分正文${end}`, '新的评分段落。']),
  ...['阐述帮助：说明具体帮助。', '一、评分侧重点', '（一）评分侧重点', '1. 评分侧重点',
    '①评分侧重点', '· 评分侧重点', '●评分侧重点'].map(text => ['评分正文尚未结束', text]),
]) test(`reference veto preserves Chinese sentence/label boundary: ${current}/${previous}`, () => {
  const input = fixture([[...heading, line('A complete sample.', .28), line('评分标准', .32),
    line(previous, .36), line(current, .4, .14, .76)]])
  const scoring = buildSourceReferences(...input).groups[0].scoring
  assert.deepEqual(scoring.entries.flatMap(e => e.paragraphs.map(p => p.text)), [previous, current])
})

for (const [name, previousText] of [
  ['space before closing quote', 'He said, “The project is finished. ”'],
  ['closing guillemet', 'He said, «The project is finished.»'],
  ['adjacent closing quote', 'He said, “The project is finished.”'],
  ['spaces between nested closers', 'He said, “The project is finished! ” ）'],
  ...['”', '’', '"', "'", '»', ')', ']', '）', '】', '」', '』'].map(closer =>
    [`question mark before spaced ${closer}`, `The project is finished? ${closer}`]),
  ...['-', '‐', '—', ',', ':', ';', '，', '：', '；'].map(mark =>
    [`deferred punctuation ${mark} before spaced closers`, `We considered another method${mark} ” 】`]),
  ['unknown trailing punctuation', 'The project is finished ※'],
  ['unsupported closer', 'The project is finished. 〉'],
  ['closers without a preceding word', '” 】'],
]) test(`producer preserves split paragraphs and review for ${name}`, () => {
  const nextText = 'iPhone users can try another method.'
  const result = buildSourceReferences(...fixture([
    [...heading, line(previousText, .7)],
    [line(nextText, .2)],
  ]))
  const captured = paragraphs(result)
  assert.deepEqual(captured.map(p => p.text), [previousText, nextText])
  assert(captured.every(p => !p.continuationSources))
  assert.deepEqual(captured.map(p => p.source.locator.page), [1, 2])
  assert.deepEqual(result.review, [{ itemId: 'p2-i0',
    issue: 'paragraph continues across a page turn; split into two located paragraphs' }])
})

test('producer inspects spaced closing suffixes without rewriting unfinished text', () => {
  const previousText = 'He said, “We could learn ” ）'
  const nextText = 'together and share our ideas.'
  const result = buildSourceReferences(...fixture([
    [...heading, line(previousText, .7)],
    [line(nextText, .2)],
  ]))
  assert.equal(paragraphs(result).length, 1)
  assert.equal(paragraphs(result)[0].text, `${previousText} ${nextText}`)
  assert.deepEqual(paragraphs(result)[0].continuationSources.map(s => s.locator.page), [2])
  assert.deepEqual(result.review, [])
})

test('producer groups regions by page and validates through the deployed reader schema and semantics', () => {
  const input = fixture([
    [...heading, line('We found a place where we could', .7), line('英语参考答案 第1页', .94)],
    [line('英语参考答案 第2页', .03), line('learn together and', .2), line('share our ideas.', .24)],
  ])
  const result = buildSourceReferences(...input)
  const [paragraph] = paragraphs(result)
  assert.equal(paragraphs(result).length, 1)
  assert.equal(paragraph.text, 'We found a place where we could learn together and share our ideas.')
  assert.deepEqual(paragraph.source.locator, { kind: 'page_region', documentId: 'answers', page: 1,
    region: { x: .1, y: .7, width: .8, height: .02 } })
  assert.deepEqual(paragraph.continuationSources, [{ documentSha256: sha,
    locator: { kind: 'page_region', documentId: 'answers', page: 2,
      region: { x: .1, y: .2, width: .8, height: .06 } } }])
  assert.equal(result.review.length, 2) // Only the two excluded furniture items.
  const binding = { materialization: input[0], sourceDigest: sha, candidateDigest: sha }
  const sidecar = { ...prepareSourceReferences(binding), groups: result.groups }
  assert.deepEqual(validateSourceReferences({ ...binding, sidecar }), [])
})

test('producer retains consecutive fragments across three pages', () => {
  const result = buildSourceReferences(...fixture([
    [...heading, line('We found a place where we could', .7)],
    [line('learn together and', .2)],
    [line('share our ideas.', .2)],
  ]))
  const [paragraph] = paragraphs(result)
  assert.equal(paragraphs(result).length, 1)
  assert.deepEqual([paragraph.source, ...paragraph.continuationSources].map(s => s.locator.page), [1, 2, 3])
})

for (const [name, pages] of [
  ['sentence-final punctuation', [[...heading, line('We finished our work.', .7)], [line('and returned later.', .2)]]],
  ['non-adjacent pages', [[...heading, line('We found a place where we could', .7)], [], [line('learn together.', .2)]]],
]) test(`producer keeps split locators for ${name}`, () => {
  const result = buildSourceReferences(...fixture(pages))
  assert.equal(paragraphs(result).length, 2)
  assert(paragraphs(result).every(p => !p.continuationSources))
  assert.equal(result.review.filter(r => r.issue.includes('across a page turn')).length, 1)
})

test('a task scoring heading switches capture instead of joining rubric text into a cross-page essay', () => {
  const result = buildSourceReferences(...fixture([
    [...heading, line('We found a place where we could', .7)],
    [line('读后续写评分细则', .15), line('learn together.', .2)],
  ]))
  assert.deepEqual(paragraphs(result).map(p => [p.text, p.source.locator.page]),
    [['We found a place where we could', 1]])
  assert.equal(paragraphs(result)[0].continuationSources, undefined)
  const [scoring] = result.groups[0].scoring.entries
  assert.equal(scoring.sourceLabel, '读后续写评分细则')
  assert.deepEqual(scoring.paragraphs.map(p => [p.text, p.source.locator.page]), [['learn together.', 2]])
  assert.deepEqual(result.review, [])
})
