#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSupportedMarkerSequence } from './paper-normalization-test-helpers.mjs'
import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { analyzeSevenChoicesImportCandidate, buildSevenChoicesAnalysisMessages } from '../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { validatePaperImportPackage } from '../server/paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function assertRejects(name, fn, pattern) {
  return Promise.resolve().then(() => fn()).then(
    () => { throw new Error(`${name}\nexpected rejection`) },
    (error) => {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : String(error)
      assert(name, pattern.test(message), message)
    },
  )
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// ---- Splitter ----

function fixtureSevenChoicesText() {
  return `
第二部分 阅读
第一节
阅读下列短文，从每题所给的A、B、C、D四个选项中选出最佳选项。
A
Cloud farms can help small villages predict weather changes.
21. What does the village use to plan the harvest?
A. A notebook B. A weather app C. A city map D. A music lesson
21-24 ABCD
B
Museum volunteers keep old letters safe.
22. Why do volunteers scan letters?
A. To sell them B. To print posters C. To preserve them D. To change dates
C
Library lends tools on weekends.
23. What is special about the library?
A. It lends tools B. It closes early C. It grows apples D. It teaches driving
D
Students built a bridge after testing models.
24. What did students do before building?
A. Bought tickets B. Tested models C. Painted walls D. Wrote songs
第二节
阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。
Running is a great way to get in shape. 36 , keep these things in mind.
Slowly easing into a training program will help. 37 .
Beginners might think they need to run every day. 38 .
Not wearing the right equipment is another mistake. 39 .
Finally, comparing yourself to others can be discouraging. 40 .
A. Not taking rest days
B. If you're just starting out
C. Comparing yourself to others
D. Running can be uncomfortable at times
E. It's important not to use the same muscles
F. While you don't need expensive equipment
G. Experts suggest increasing your distance by no more than 10% each week
36-40 BAGED
第三部分 语言运用
`
}

function assertSplitterTextFixture() {
  const result = parseReadingCandidatesFromText(fixtureSevenChoicesText(), {
    sourceFilename: 'i2-fixture.docx',
    paperId: 'paper-i2-fixture',
  })

  assert('I2 fixture extracts 4 reading groups', result.readingGroups.length === 4)
  assert('I2 fixture parses seven choices group', Boolean(result.sevenChoicesGroup))
  const sc = result.sevenChoicesGroup
  assert('I2 fixture seven choices has 5 questions', sc.questions.length === 5)
  assert('I2 fixture seven choices has 7 options', sc.optionBank.length === 7)
  assert('I2 fixture seven choices answers match range', sc.questions.map((q) => q.answerKey).join('') === 'BAGED')
  assert('I2 fixture seven choices not in skipped', !result.skipped.some((s) => s.reason === 'seven_choices_deferred_to_i2'))
  assert('I2 fixture skipped contains non-reading sections', result.skipped.some((s) => s.reason.includes('grammar') || s.reason.includes('cloze')))
}

function assertSplitterMissingOptionBank() {
  const text = `
第二节
阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。
Some passage about running.
36-40 BAGED
第三部分 语言运用
`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'i2-no-options.docx',
    paperId: 'paper-i2-no-options',
  })
  assert('missing option bank produces null group', result.sevenChoicesGroup === null)
  assert('missing option bank produces observable error', result.sevenChoicesError && result.sevenChoicesError.reason === 'seven_choices_missing_option_bank')
  assert('missing option bank does not keep legacy deferred skip', !result.skipped.some((s) => s.reason === 'seven_choices_deferred_to_i2'))
}

function assertSplitterIncompleteOptionBank() {
  const text = `
第二节
阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。
Some passage about running. 36 . 37 . 38 . 39 . 40 .
A. Option A text here.
B. Option B text here.
C. Option C text here.
B. Duplicate label that means D is missing.
E. Option E text here.
F. Option F text here.
G. Option G text here.
36-40 FEGBC
第三部分 语言运用
`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'i2-incomplete-options.docx',
    paperId: 'paper-i2-incomplete-options',
  })
  assert('incomplete A-G option bank produces null group', result.sevenChoicesGroup === null)
  assert('incomplete A-G option bank produces observable error', result.sevenChoicesError && result.sevenChoicesError.reason === 'seven_choices_missing_option_bank')
  assert('incomplete A-G option bank does not keep legacy deferred skip', !result.skipped.some((s) => s.reason === 'seven_choices_deferred_to_i2'))
}

function assertSplitterMissingAnswers() {
  const text = `
第二节
阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。
Running is great. 36 , keep these things in mind. 37 . 38 . 39 . 40 .
A. Option A text here.
B. Option B text here.
C. Option C text here.
D. Option D text here.
E. Option E text here.
F. Option F text here.
G. Option G text here.
第三部分 语言运用
`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'i2-no-answers.docx',
    paperId: 'paper-i2-no-answers',
  })
  const sc = result.sevenChoicesGroup
  assert('missing answers still parses group structure', Boolean(sc))
  assert('missing answers result in empty answer keys', sc.questions.every((q) => !q.answerKey))
}

// ---- Analysis builder ----

function scFixtureInput() {
  return {
    paper: {
      paperId: 'paper-i2-analysis-fixture',
      sourceFilename: 'i2-analysis.docx',
      sourceHash: 'abc456',
    },
    group: {
      groupId: 'group-i2-analysis-seven-choices',
      groupType: 'sevenChoices',
      title: '七选五',
      order: 4,
      paragraphs: [
        { id: 'para-i2-seven-p1', text: 'Running is a great way to get in shape and just about everyone can do it. 36 , keep these things in mind to help you increase your chances of running success.' },
        { id: 'para-i2-seven-p2', text: 'Slowly easing into a training program will help reduce the risk of injury. 37 .' },
      ],
      optionBank: [
        { label: 'A', text: 'Not taking rest days' },
        { label: 'B', text: 'If you are just starting out' },
        { label: 'C', text: 'Comparing yourself to others' },
        { label: 'D', text: 'Running can be uncomfortable at times' },
        { label: 'E', text: 'It is important not to use the same muscles' },
        { label: 'F', text: 'While you do not need expensive equipment' },
        { label: 'G', text: 'Experts suggest increasing your distance by no more than 10% each week' },
      ],
      questions: [
        { id: 'q-i2-analysis-036', stem: '36', answerKey: 'B', blankId: 'blank-i2-analysis-036' },
        { id: 'q-i2-analysis-037', stem: '37', answerKey: 'G', blankId: 'blank-i2-analysis-037' },
        { id: 'q-i2-analysis-038', stem: '38', answerKey: 'A', blankId: 'blank-i2-analysis-038' },
        { id: 'q-i2-analysis-039', stem: '39', answerKey: 'E', blankId: 'blank-i2-analysis-039' },
        { id: 'q-i2-analysis-040', stem: '40', answerKey: 'D', blankId: 'blank-i2-analysis-040' },
      ],
      blankIds: ['blank-i2-analysis-036', 'blank-i2-analysis-037', 'blank-i2-analysis-038', 'blank-i2-analysis-039', 'blank-i2-analysis-040'],
    },
    providerId: 'deepseek-v4-pro',
  }
}

function validScAnalysis(input = scFixtureInput()) {
  const group = input.group
  return {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: input.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [group.groupId],
    meta: {
      generatedBy: 'external-ai',
      model: 'stub',
      promptVersion: 'seven-choices-analysis-v1',
      reviewStatus: 'reviewed',
    },
    groups: {
      [group.groupId]: {
        overview: '跑步新手常见错误及建议。',
        discourseStructure: { summary: '介绍五个跑步误区。', units: [] },
      },
    },
    questions: Object.fromEntries(
      group.questions.map((q) => [
        q.id,
        {
          blankId: q.blankId,
          positionFacet: 'seven-choices.position.paragraph-middle',
          roleFacet: 'seven-choices.role.cohesion',
          primaryMechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment',
          topicClues: ['running', 'training', 'injury'],
          contextEvidence: {
            paragraphId: group.paragraphs[0].id,
            beforeQuote: 'Running is a great way',
            afterQuote: 'keep these things in mind',
          },
          mechanismSignals: [
            {
              mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment',
              signalText: 'keep these things in mind',
              signalSide: 'context-after',
              targetText: 'starting out',
              relation: '上下文话题场匹配。',
            },
            {
              mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment',
              signalText: group.optionBank.find(({ label }) => label === q.answerKey).text,
              signalSide: 'option',
              targetText: 'keep these things in mind',
              relation: '选项与上下文话题一致。',
            },
          ],
          optionFit: {
            correctOptionLabel: q.answerKey,
            fitSummary: '选项与上下文话题场匹配。',
            matchedClues: [{ contextSide: 'keep these things in mind', optionSide: q.answerKey, relation: 'topic match' }],
          },
          teachingNote: '通过话题场匹配解题。',
        },
      ]),
    ),
  }
}

function stubProvider(payload) {
  return async () => ({
    rawText: JSON.stringify(payload),
    provider: 'stub-provider',
    model: 'stub',
    latencyMs: 7,
  })
}

async function assertAnalysisValidation() {
  const input = scFixtureInput()
  const result = await analyzeSevenChoicesImportCandidate(input, {
    providerCallers: { deepseek: stubProvider(validScAnalysis(input)) },
    requestId: 'i2-verify',
  })
  assert('valid seven-choices analysis passes', result.analysis.schemaVersion === 'seven-choices-analysis-v1' && result.requestId === 'i2-verify')

  for (const field of ['positionFacet', 'roleFacet', 'primaryMechanismFacet']) {
    await assertRejects(`uncontrolled ${field} fails for seven-choices`, () => {
      const bad = validScAnalysis(input)
      bad.questions[input.group.questions[0].id][field] = 'legacy-or-invented-value'
      return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
    }, new RegExp(field))
  }

  await assertRejects('blankId mismatch fails for seven-choices', () => {
    const bad = validScAnalysis(input)
    bad.questions[input.group.questions[0].id].blankId = 'blank-other'
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /blankId does not match/)

  await assertRejects('wrong schema fails for seven-choices', () => {
    const bad = { ...validScAnalysis(input), schemaVersion: 'wrong' }
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /schemaVersion/)

  await assertRejects('wrong group fails for seven-choices', () => {
    const bad = { ...validScAnalysis(input), targetGroups: ['group-other'] }
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /targetGroups/)

  await assertRejects('missing question fails for seven-choices', () => {
    const bad = validScAnalysis(input)
    delete bad.questions[input.group.questions[0].id]
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /questionIds/)

  await assertRejects('answer conflict fails for seven-choices', () => {
    const bad = validScAnalysis(input)
    const firstQ = input.group.questions[0]
    bad.questions[firstQ.id].optionFit.correctOptionLabel = 'C'
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /答案解析版不一致/)

  await assertRejects('bad signal quote fails for seven-choices', () => {
    const bad = validScAnalysis(input)
    const firstQ = input.group.questions[0]
    bad.questions[firstQ.id].mechanismSignals[0].signalText = 'nonexistent text in passage'
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /精确匹配原文/)

  await assertRejects('option-side signal from a distractor fails for seven-choices', () => {
    const bad = validScAnalysis(input)
    const firstQ = input.group.questions[0]
    const distractor = input.group.optionBank.find(({ label }) => label !== firstQ.answerKey)
    bad.questions[firstQ.id].mechanismSignals[1].signalText = distractor.text
    return analyzeSevenChoicesImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /未在正答选项中精确定位/)
}

function assertPromptBuilding() {
  const input = scFixtureInput()
  const messages = buildSevenChoicesAnalysisMessages(input)
  assert('seven-choices messages include prompt', messages.length === 2 && messages[0].role === 'system')
  const userContent = messages[1].content
  assert('seven-choices user message includes paperId', userContent.includes(input.paper.paperId))
  assert('seven-choices user message includes option bank', userContent.includes('optionBank'))
  assert('seven-choices user message includes answer key', userContent.includes('"answerKey"'))
}

// ---- Package builder ----

function scFixtureParseResult() {
  const paper = {
    paperId: 'paper-i2-package',
    sourceFilename: 'i2-package.docx',
    sourceHash: 'a'.repeat(64),
    answerSourceFilename: 'i2-package-answer.docx',
  }
  const readingGroups = ['A', 'B', 'C', 'D'].map((label, index) => {
    const lower = label.toLowerCase()
    const groupId = `group-i2-package-reading-${lower}`
    return {
      groupId,
      title: `Reading ${label}`,
      order: index,
      paragraphs: [{ id: `para-i2-${lower}-p1`, text: `Reading ${label} passage text.` }],
      questions: [{
        id: `q-i2-package-${String(21 + index).padStart(3, '0')}`,
        stem: `Question ${21 + index}?`,
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answerKey: 'A',
      }],
    }
  })
  return {
    paper,
    readingGroups,
    skipped: [],
    sevenChoicesGroup: {
      groupId: 'group-i2-package-seven-choices',
      groupType: 'sevenChoices',
      title: '七选五',
      order: 4,
      paragraphs: [
        { id: 'para-i2-seven-p1', text: 'Running is a great way to get in shape. 36 , keep these things in mind.' },
      ],
      optionBank: [
        { label: 'A', text: 'Option A text' }, { label: 'B', text: 'Option B text' },
        { label: 'C', text: 'Option C text' }, { label: 'D', text: 'Option D text' },
        { label: 'E', text: 'Option E text' }, { label: 'F', text: 'Option F text' },
        { label: 'G', text: 'Option G text' },
      ],
      questions: [36, 37, 38, 39, 40].map((no) => ({
        id: `q-i2-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'B',
        blankId: `blank-i2-package-${String(no).padStart(3, '0')}`,
      })),
      blankIds: [36, 37, 38, 39, 40].map((no) => `blank-i2-package-${String(no).padStart(3, '0')}`),
    },
    clozeGroup: {
      groupId: 'group-i2-package-cloze',
      groupType: 'cloze',
      title: '完形填空',
      order: 5,
      paragraphs: [{
        id: 'para-i2-cloze-p1',
        text: `Cloze passage with ${buildSupportedMarkerSequence(41, 15)}.`,
      }],
      questions: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map((no) => ({
        id: `q-i2-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'B',
        blankId: `blank-i2-package-${String(no).padStart(3, '0')}`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
      })),
      blankIds: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map((no) => `blank-i2-package-${String(no).padStart(3, '0')}`),
    },
    grammarFillGroup: {
      groupId: 'group-i2-package-grammar-fill',
      groupType: 'grammarFill',
      title: '语法填空',
      order: 6,
      paragraphs: [{
        id: 'para-i2-gf-p1',
        text: `Grammar fill passage with ${buildSupportedMarkerSequence(56, 10)}.`,
      }],
      questions: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => ({
        id: `q-i2-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'word',
        blankId: `blank-i2-package-${String(no).padStart(3, '0')}`,
        prompt: no === 56 ? 'be' : null,
      })),
      blankIds: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => `blank-i2-package-${String(no).padStart(3, '0')}`),
    },
    applicationGroup: {
      groupId: 'group-i2-package-writing-application',
      groupType: 'writing',
      title: '应用文写作',
      order: 7,
      paragraphs: [{ id: 'para-i2-app-p1', text: '应用文写作场景.' }],
      questions: [],
    },
    continuationGroup: {
      groupId: 'group-i2-package-writing-continuation',
      groupType: 'writing',
      title: '读后续写',
      order: 8,
      paragraphs: [{ id: 'para-i2-cont-p1', text: 'Continuation material text.' }],
      continuationStarters: ['Paragraph 1 starter.', 'Paragraph 2 starter.'],
      questions: [],
    },
  }
}

function scFixtureReadingAnalyses(parseResult) {
  return Object.fromEntries(
    parseResult.readingGroups.map((group) => [
      group.groupId,
      {
        schemaVersion: 'reading-choice-analysis-v1',
        paperId: parseResult.paper.paperId,
        sourceAssetVersion: 1,
        targetGroups: [group.groupId],
        meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'reading-choice-analysis-v1', reviewStatus: 'reviewed' },
        groups: { [group.groupId]: { overview: `${group.title} 概览。` } },
        questions: Object.fromEntries(group.questions.map((q) => [
          q.id,
          {
            skill: { primary: 'detail' },
            questionFocus: q.stem,
            stemTranslationZh: '题干翻译',
            optionAnalysis: ['A', 'B', 'C', 'D'].map((label) => ({
              label, optionTranslationZh: `${label} 选项`, status: label === q.answerKey ? 'correct' : 'wrong',
            })),
            locationParaphrases: [],
          },
        ])),
      },
    ]),
  )
}

function scFixtureAnalysis(parseResult) {
  const sc = parseResult.sevenChoicesGroup
  return {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [sc.groupId],
    meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'seven-choices-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [sc.groupId]: { overview: '七选五概览。' } },
    questions: Object.fromEntries(sc.questions.map((q) => [
      q.id,
      {
        blankId: q.blankId,
        positionFacet: 'seven-choices.position.paragraph-middle',
        roleFacet: 'seven-choices.role.cohesion',
        primaryMechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment',
        topicClues: ['running', 'training'],
        contextEvidence: { paragraphId: sc.paragraphs[0].id, beforeQuote: 'Running is a great', afterQuote: 'keep these things' },
        mechanismSignals: [
          { mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment', signalText: 'keep these things', signalSide: 'context-after', targetText: 'training', relation: '话题场匹配。' },
          { mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment', signalText: 'Option B', signalSide: 'option', targetText: 'training', relation: '选项匹配。' },
        ],
        optionFit: { correctOptionLabel: q.answerKey, fitSummary: '选项与上下文匹配。', matchedClues: [] },
        teachingNote: '话题场匹配解题。',
      },
    ])),
  }
}

function scFixtureClozeAnalysis(parseResult) {
  const cl = parseResult.clozeGroup
  return {
    schemaVersion: 'cloze-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [cl.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [cl.groupId]: { overview: '完形填空概览。', affectiveArc: '情感平稳。' } },
    blanks: Object.fromEntries(
      cl.questions.map((q) => [
        q.id,
        {
          blankId: q.blankId,
          blankNo: Number(q.stem),
          pos: 'verb',
          correctFit: { optionLabel: q.answerKey, reason: '搭配合理。' },
          distractorGlosses: ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey).map((l) => ({
            optionLabel: l, optionText: q.options[l], meaning: `表示"${q.options[l]}"。`,
          })),
          evidence: [{ type: 'collocation-partner', signalText: 'Cloze passage', signalSide: 'context-before', relation: '话题词呼应。' }],
          teachingNote: '通过施受关系判断。',
        },
      ]),
    ),
  }
}

function scMinimalGrammarFillAnalysis(parseResult) {
  const gf = parseResult.grammarFillGroup
  return {
    schemaVersion: 'grammar-fill-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [gf.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'grammar-fill-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [gf.groupId]: { overview: '语法填空概览。' } },
    blanks: Object.fromEntries(gf.questions.map((q) => [
      q.id,
      {
        blankId: q.blankId, blankNo: Number(q.stem),
        blankType: 'no-hint', hint: null,
        facetKey: 'grammar-fill.no-hint.preposition',
        answer: q.answerKey,
        role: null, path: null,
        reason: '介词填空示例。',
        evidence: [{ type: 'governing-word', signalText: 'Grammar fill passage', signalSide: 'passage', relation: '示例证据。' }],
        teachingNote: '通过搭配判断介词。',
      },
    ])),
  }
}

function assertPackageBuilder() {
  const parseResult = scFixtureParseResult()
  const sourceBuffer = Buffer.from('PK i2 package docx')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  parseResult.paper.sourceHash = sourceHash
  const grammarFillAnalysis = scMinimalGrammarFillAnalysis(parseResult)

  // Successful build with seven-choices.
  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: scFixtureReadingAnalyses(parseResult),
    sevenChoicesGroup: parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: scFixtureAnalysis(parseResult),
    clozeGroup: parseResult.clozeGroup,
    clozeAnalysis: scFixtureClozeAnalysis(parseResult),
    grammarFillGroup: parseResult.grammarFillGroup,
    grammarFillAnalysis,
    applicationGroup: parseResult.applicationGroup,
    continuationGroup: parseResult.continuationGroup,
    sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
  })
  assert('I2 package includes seven-choices analysis file', files.some((f) => f.fileName === 'seven-choices-analysis-v1.json'))
  const scFile = files.find((f) => f.fileName === 'seven-choices-analysis-v1.json')
  assert('I2 seven-choices analysis file is valid JSON', scFile && scFile.buffer.length > 10)

  const validation = validatePaperImportPackage(files)
  assert('I2 package passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  const paperAsset = JSON.parse(files.find((f) => f.fileName === 'paper-asset.json').buffer.toString())
  const scGroupInAsset = Object.values(paperAsset.content.groups).find((g) => g.groupType === 'sevenChoices')
  assert('I2 paper asset includes seven choices group', Boolean(scGroupInAsset))
  assert('I2 paper asset seven choices has 5 questions', scGroupInAsset.questionIds.length === 5)
  assert('I2 paper asset seven choices has option bank', Array.isArray(scGroupInAsset.optionBank) && scGroupInAsset.optionBank.length === 7)
  assert('I2 layout tree includes seven choices section', paperAsset.layoutTree.parts[0].sections.some((s) => s.title.includes('七选五')))

  // Block publish: missing seven-choices analysis when group present.
  assertRejects('I2 blocks publish when seven-choices analysis missing', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: null,
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: scFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少 AI 解析/)

  // Block publish: missing answer key for seven-choices.
  const noAnswerGroup = JSON.parse(JSON.stringify(parseResult.sevenChoicesGroup))
  noAnswerGroup.questions[0].answerKey = ''
  assertRejects('I2 blocks publish when seven-choices answer missing', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...parseResult, sevenChoicesGroup: noAnswerGroup },
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: noAnswerGroup,
      sevenChoicesAnalysis: scFixtureAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: scFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少答案解析版答案/)

  // Block publish: answer conflict.
  const conflictAnalysis = scFixtureAnalysis(parseResult)
  conflictAnalysis.questions[parseResult.sevenChoicesGroup.questions[0].id].optionFit.correctOptionLabel = 'C'
  assertRejects('I2 blocks publish when seven-choices answer conflicts', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: conflictAnalysis,
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: scFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /答案冲突/)

  // Four-family completeness: an incomplete paper (reading only, no seven-choices) is rejected.
  // Writing groups intentionally omitted — seven-choices gate fires first (packageBuilder:197).
  assertRejects('I2 rejects publish without seven-choices (four-family completeness)', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...parseResult, sevenChoicesGroup: null },
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      clozeGroup: parseResult.clozeGroup,
      grammarFillGroup: parseResult.grammarFillGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少七选五/)

  // Six-family completeness: missing application writing is rejected.
  assertRejects('I2 rejects publish without application writing (six-family completeness)', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: scFixtureAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: scFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: null,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少应用文写作/)

  // Six-family completeness: missing continuation writing is rejected.
  assertRejects('I2 rejects publish without continuation writing (six-family completeness)', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: scFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: scFixtureAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: scFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: null,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少读后续写/)
}

// ---- Real DOCX ----

async function assertRealDocx() {
  const canonicalPath = path.join(repoRoot, 'docs/sources/paper-2024-jslk-english/2024-jslk-english-source.docx')
  const canonical = await parseReadingDocxBuffer(readFileSync(canonicalPath), {
    sourceFilename: '2024-jslk-english-source.docx',
  })

  const sc = canonical.sevenChoicesGroup
  assert('canonical 2024 JSLK parses seven choices group', Boolean(sc))
  if (sc) {
    assert('canonical seven choices has 5 questions', sc.questions.length === 5)
    assert('canonical seven choices has A-G option bank', sc.optionBank.length === 7)
    assert('canonical seven choices has paragraphs', sc.paragraphs.length > 0)
    assert('canonical seven choices questions are 36-40', sc.questions.every((q) => ['36', '37', '38', '39', '40'].includes(q.stem)))
  }
}

// ---- Main ----

async function main() {
  assertSplitterTextFixture()
  assertSplitterMissingOptionBank()
  assertSplitterIncompleteOptionBank()
  assertSplitterMissingAnswers()
  assertPromptBuilding()
  await assertAnalysisValidation()
  assertPackageBuilder()
  await assertRealDocx()

  console.log(`\nI2 seven-choices AI import verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
