import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { prepareObjectiveAnalysis } from '../server/paper-import-ai/deriveReadingAnalysisRanges.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const group = { groupId: 'g', paragraphs: [{ id: 'p', text: '😀 We__41__ (go) home and __42__ (go) out.' }],
  questions: [41, 42].map((n) => ({ id: `q${n}`, blankId: `b${n}`, stem: String(n), prompt: 'go', answerKey: 'went' })) }
const raw = { groups: { g: {
  fullTranslationZh: '😀回家。\n\n然后出门。',
  selectedLongSentences: [{ sentenceId: 's', paragraphId: 'p', sourceText: group.paragraphs[0].text,
    underlineTexts: ['We went home'] }],
  teachingContent: { sourceTextId: 'source',
    completedSourceTexts: [{ textId: 'filled', paragraphId: 'p' }],
    translation: { textId: 'zh', paragraphs: [
      { paragraphId: 'z1', sourceParagraphIds: ['p'], quote: '😀回家。' },
      { paragraphId: 'z2', sourceParagraphIds: ['p'], quote: '然后出门。' },
    ] },
    annotations: [{ annotationId: 'a', kind: 'answer-insertion', questionIds: ['q42'], blankId: 'b42',
      sourceRanges: [{ textId: 'filled', paragraphId: 'p', quote: 'went' }],
      translationRanges: [{ textId: 'zh', paragraphId: 'z2', quote: '出门' }],
    }],
  },
} } }
const saved = structuredClone(raw)
const prepared = prepareObjectiveAnalysis(raw, group)
assert.deepEqual(raw, saved)
const value = prepared.groups.g
assert.equal(value.selectedLongSentences[0].displayText, '😀 We went home and went out.')
assert.deepEqual(value.selectedLongSentences[0].underlineRanges, [{ quote: 'We went home', start: 2, end: 14 }])
assert.deepEqual(value.teachingContent.annotations[0].sourceRanges[0],
  { textId: 'filled', paragraphId: 'p', quote: 'went', start: 19, end: 23 }, 'Use second blank, not first repeated answer')
assert.equal(value.teachingContent.translation.paragraphs[1].start, 6)
assert.equal(value.teachingContent.annotations[0].translationRanges[0].start, 2, 'Paragraph-local, not full translation')
assert.deepEqual(prepareObjectiveAnalysis(prepared, group), prepared)
for (const change of [
  (x) => { x.teachingContent.annotations[0].blankId = 'b41' },
  (x) => { x.teachingContent.annotations[0].sourceRanges[0].quote = 'goes' },
  (x) => { x.teachingContent.annotations[0].translationRanges[0].paragraphId = 'z1' },
  (x) => { x.selectedLongSentences[0].underlineTexts = ['went'] },
  (x) => { x.selectedLongSentences[0].sourceText = 'invented' },
]) {
  const bad = structuredClone(raw)
  change(bad.groups.g)
  assert.throws(() => prepareObjectiveAnalysis(bad, group))
}
const cloze = structuredClone(group)
cloze.questions.forEach((q) => { q.answerKey = 'C'; q.options = { A: 'goes', C: 'went' } })
assert.equal(prepareObjectiveAnalysis(raw, cloze).groups.g.selectedLongSentences[0].displayText,
  '😀 We went home and went out.', 'Cloze uses option text, not letter')
console.log('PASS objective preparation: Unicode, spacing/hints, repeated answer identity, paragraph-local ranges, no mutation, fail-closed anchors')

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { objectiveFixtureGroup, writeStagedAnalyses } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(tmpdir(), 'objective-preparation-'))
try {
  const source = makeFixture()
  writeStagedAnalyses(root, source)
  const answers = new Map(source.answers.map(({ questionId, value }) => [questionId, value]))
  for (const [kind, slot] of [['cloze', 'cloze'], ['grammar', 'grammar-fill']]) {
    const group = objectiveFixtureGroup(source.groups.find((g) => g.slotId === slot), answers)
    const request = { group: kind, sourceGroup: { groupKey: kind, material: {
      paper: { paperId: source.paperId, sourceAssetVersion: 1 }, group } },
    authoritativeAnswers: Object.fromEntries(group.questions.map((q) => [q.id, { questionId: q.id, answer: q.answerKey }])) }
    const analysis = JSON.parse(readFileSync(path.join(root, `analysis-${kind}.json`), 'utf8'))
    const draft = JSON.parse(JSON.stringify(analysis, (key, value) => ['start', 'end', 'displayText'].includes(key) ? undefined : value))
    // Synthetic sentences repeat the same words: retain their explicit occurrence
    // selection rather than pretending omitted offsets are unambiguous.
    draft.groups[group.groupId].selectedLongSentences = structuredClone(analysis.groups[group.groupId].selectedLongSentences)
    for (const item of draft.groups[group.groupId].teachingContent.completedSourceTexts) delete item.text
    const requestPath = path.join(root, `${kind}-request.json`)
    const input = path.join(root, `${kind}-draft.json`)
    const output = path.join(root, `${kind}-prepared.json`)
    writeFileSync(requestPath, JSON.stringify(request))
    writeFileSync(input, JSON.stringify(draft))
    const run = () => spawnSync(process.execPath, ['scripts/import-pipeline/prepare-objective-analysis.mjs', requestPath, input, output],
      { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' })
    const success = run()
    assert.equal(success.status, 0, success.stderr)
    assert.equal(readFileSync(input, 'utf8'), JSON.stringify(draft))
    assert.equal(readFileSync(requestPath, 'utf8'), JSON.stringify(request))
    const accepted = readFileSync(output, 'utf8')
    assert.notEqual(run().status, 0, 'Never overwrite existing output')
    assert.equal(readFileSync(output, 'utf8'), accepted)
    rmSync(output)
    if (kind === 'cloze') Object.values(draft.blanks)[0].correctFit.optionLabel = 'Z'
    else Object.values(draft.blanks)[0].answer = 'FORGED'
    writeFileSync(input, JSON.stringify(draft))
    assert.notEqual(run().status, 0, 'Formal validator still rejects answer drift')
    assert.equal(existsSync(output), false, 'Rejected drafts must not create an accepted output')
    console.log(`PASS ${kind} preparation CLI: accepted schema, immutable inputs, exclusive output, answer rejection`)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}
