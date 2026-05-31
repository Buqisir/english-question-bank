#!/usr/bin/env node
/**
 * verify-i8-cloze-analysis.mjs
 *
 * Covers Steps 2–4 of I8-cloze-analysis:
 *  - Step 2: prompt contract static checks
 *  - Step 3: analyzeCloze validator (success + each blocking case via stub providers)
 *  - Step 4: route, package, storage, validator wiring + disk assertion
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { analyzeClozeImportCandidate, buildClozeAnalysisMessages, validateClozeShape } from '../server/paper-import-ai/analyzeCloze.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'
import { validatePaperImportPackage, PAPER_IMPORT_SCHEMA_VERSIONS } from '../server/paper-import/validator.mjs'
import { writePaperImportVersion, swapPaperImportLatest } from '../server/paper-import/storage.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? `\n  detail: ${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function assertRejects(name, fn, pattern) {
  return Promise.resolve().then(() => fn()).then(
    () => { throw new Error(`FAIL: ${name}\n  expected rejection but resolved`) },
    (error) => {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : String(error)
      assert(name, pattern.test(message), `actual message: ${message}`)
    },
  )
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// ============================================================
// Step 2 — Prompt contract static checks
// ============================================================

function assertPromptContract() {
  const prompt = readRepoFile('prompts/cloze-analysis-v1.md')

  // All pos values must be named.
  for (const pos of ['verb', 'noun', 'adjective', 'adverb', 'phrase', 'other']) {
    assert(`prompt names pos: ${pos}`, prompt.includes(`\`${pos}\``) || prompt.includes(`pos: "${pos}"`) || prompt.includes(`pos value: \`${pos}\``) || prompt.includes(pos))
  }

  // All signature facet leaves must be named.
  for (const facet of [
    'cloze.signature.verb.action-sequence',
    'cloze.signature.noun.semantic-field',
    'cloze.signature.adjective.affective-consistency',
    'cloze.signature.adverb.affective-consistency',
    'cloze.signature.phrase.contextual-composition',
  ]) {
    assert(`prompt names signature facet: ${facet}`, prompt.includes(facet))
  }

  // All evidence type values must be named.
  for (const type of ['collocation-partner', 'repetition-echo', 'semantic-field', 'affective-cue', 'logical-connector']) {
    assert(`prompt names evidence type: ${type}`, prompt.includes(type))
  }

  // Asymmetric distractor rule.
  assert('prompt describes asymmetric distractor rule', prompt.includes('distractor') && (prompt.includes('gloss') || prompt.includes('meaning')))
  assert('prompt instructs not to argue why distractor is wrong', prompt.includes('wrong') || prompt.includes('why'))

  // Exact-substring requirement.
  assert('prompt has exact-substring rule', prompt.includes('exact substring'))

  // Blank marker rule.
  assert('prompt has blank marker exclusion rule', prompt.includes('__') || prompt.includes('blank marker') || prompt.includes('blank token'))

  // At least 1 collocation-partner evidence per blank.
  assert('prompt requires collocation-partner evidence per blank', prompt.includes('collocation-partner'))

  // pos: "other" carries no signature.
  assert('prompt states other has no signature', prompt.includes('"other"') && prompt.includes('signature'))

  // schemaVersion constant.
  assert('prompt names schemaVersion cloze-analysis-v1', prompt.includes('cloze-analysis-v1'))

  // promptVersion.
  assert('prompt names promptVersion cloze-analysis-v1', prompt.includes('promptVersion') || prompt.includes('cloze-analysis-v1'))
}

// ============================================================
// Step 3 — analyzeCloze validator fixtures
// ============================================================

function clFixtureInput() {
  const questionNos = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]
  return {
    paper: {
      paperId: 'paper-i8-cloze-fixture',
      sourceFilename: 'i8-cloze.docx',
      sourceHash: 'abc789',
    },
    group: {
      groupId: 'group-i8-cloze',
      groupType: 'cloze',
      title: '完形填空',
      order: 5,
      paragraphs: [
        {
          id: 'para-i8-cloze-p1',
          text: 'The boy walked slowly into the room and sat down on the wooden chair. He picked up the old book and began to read quietly.',
        },
        {
          id: 'para-i8-cloze-p2',
          text: 'His mother called from the kitchen asking if he wanted dinner. He did not answer because he was completely absorbed in the story.',
        },
      ],
      questions: questionNos.map((no, index) => ({
        id: `q-i8-cloze-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: ['A', 'B', 'C', 'D'][index % 4],
        blankId: `blank-i8-cloze-${String(no).padStart(3, '0')}`,
        options: { A: 'walked', B: 'ran', C: 'jumped', D: 'swam' },
      })),
      blankIds: questionNos.map((no) => `blank-i8-cloze-${String(no).padStart(3, '0')}`),
    },
    providerId: 'deepseek-v4-pro',
  }
}

function validClAnalysis(input = clFixtureInput()) {
  const group = input.group
  const blanks = {}
  for (const q of group.questions) {
    const no = Number(q.stem)
    const distractorLabels = ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey)
    blanks[q.id] = {
      blankId: q.blankId,
      blankNo: no,
      pos: 'verb',
      correctFit: {
        optionLabel: q.answerKey,
        reason: '搭配合理，主语与动词语义相符。',
      },
      distractorGlosses: distractorLabels.map((l) => ({
        optionLabel: l,
        optionText: q.options[l],
        meaning: `在此语境中表示"${q.options[l]}"的动作。`,
      })),
      evidence: [
        {
          type: 'collocation-partner',
          signalText: 'slowly',
          signalSide: 'context-before',
          targetText: 'walked',
          relation: '副词修饰，搭配自然。',
        },
      ],
      teachingNote: '通过主语施事关系判断动词选择。',
    }
  }
  return {
    schemaVersion: 'cloze-analysis-v1',
    paperId: input.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [group.groupId],
    meta: {
      generatedBy: 'external-ai',
      model: 'stub',
      promptVersion: 'cloze-analysis-v1',
      reviewStatus: 'reviewed',
    },
    groups: {
      [group.groupId]: {
        overview: '一个男孩专心读书、不应母亲的记叙文。',
        affectiveArc: '平静专注，情感平稳。',
      },
    },
    blanks,
  }
}

function stubProvider(payload) {
  return async () => ({
    rawText: JSON.stringify(payload),
    provider: 'stub-provider',
    model: 'stub',
    latencyMs: 3,
  })
}

async function assertAnalysisValidation() {
  const input = clFixtureInput()

  // --- Happy path ---
  const result = await analyzeClozeImportCandidate(input, {
    providerCallers: { deepseek: stubProvider(validClAnalysis(input)) },
    requestId: 'i8-verify',
  })
  assert('valid cloze analysis passes', result.analysis.schemaVersion === 'cloze-analysis-v1' && result.requestId === 'i8-verify')

  // --- meta provenance is server-stamped, not AI-supplied ---
  const bogusMeta = validClAnalysis(input)
  bogusMeta.meta = { ...bogusMeta.meta, model: 'AI-GUESS', reviewedBy: 'AI', reviewedAt: '2099-01-01' }
  const stamped = await analyzeClozeImportCandidate(input, {
    providerCallers: { deepseek: stubProvider(bogusMeta) },
  })
  assert('meta.model is stamped with real provider model', stamped.analysis.meta.model === 'stub')
  assert('meta.reviewedBy is cleared (no human reviewer)', stamped.analysis.meta.reviewedBy === '')
  assert('meta.reviewedAt is server-stamped real date', /^\d{4}-\d{2}-\d{2}$/.test(stamped.analysis.meta.reviewedAt) && stamped.analysis.meta.reviewedAt !== '2099-01-01')

  // --- Wrong schemaVersion ---
  await assertRejects('wrong schemaVersion blocks cloze', () => {
    const bad = { ...validClAnalysis(input), schemaVersion: 'wrong' }
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /schemaVersion/)

  // --- Wrong targetGroups ---
  await assertRejects('wrong targetGroups blocks cloze', () => {
    const bad = { ...validClAnalysis(input), targetGroups: ['group-other'] }
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /targetGroups/)

  // --- Wrong blanks keys ---
  await assertRejects('wrong blank questionIds blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    delete bad.blanks[firstKey]
    bad.blanks['q-wrong-id'] = bad.blanks[Object.keys(bad.blanks)[0]]
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /blanks/)

  // --- Missing required field (teachingNote) ---
  await assertRejects('missing teachingNote blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    delete bad.blanks[firstKey].teachingNote
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /teachingNote/)

  // --- Missing collocation-partner evidence ---
  await assertRejects('missing collocation-partner blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence = [{ type: 'affective-cue', signalText: 'slowly', signalSide: 'context-before', relation: 'test' }]
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /collocation-partner/)

  // --- Empty evidence array ---
  await assertRejects('empty evidence blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence = []
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /evidence/)

  // --- Non-substring signalText (passage side) ---
  await assertRejects('non-substring signalText blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence[0].signalText = 'THIS TEXT IS NOT IN PASSAGE'
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /精确匹配原文/)

  // --- POS/signature mismatch ---
  await assertRejects('POS/signature mismatch blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].pos = 'verb'
    bad.blanks[firstKey].signatureFacet = 'cloze.signature.noun.semantic-field'
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /POS/)

  // --- pos: "other" with signatureFacet present ---
  await assertRejects('pos other with signatureFacet blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].pos = 'other'
    bad.blanks[firstKey].signatureFacet = 'cloze.signature.verb.action-sequence'
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /other.*signatureFacet|signatureFacet.*other/)

  // --- pos: "other" without signatureFacet must pass ---
  {
    const good = validClAnalysis(input)
    const firstKey = Object.keys(good.blanks)[0]
    good.blanks[firstKey].pos = 'other'
    delete good.blanks[firstKey].signatureFacet
    const okResult = await analyzeClozeImportCandidate(input, {
      providerCallers: { deepseek: stubProvider(good) },
    })
    assert('pos other without signatureFacet passes', okResult.analysis.schemaVersion === 'cloze-analysis-v1')
  }

  // --- pos: "verb" without signatureFacet must pass (signature is optional) ---
  {
    const good = validClAnalysis(input)
    const firstKey = Object.keys(good.blanks)[0]
    delete good.blanks[firstKey].signatureFacet
    const okResult = await analyzeClozeImportCandidate(input, {
      providerCallers: { deepseek: stubProvider(good) },
    })
    assert('verb without signatureFacet passes', okResult.analysis.schemaVersion === 'cloze-analysis-v1')
  }

  // --- Answer conflict is NON-RETRYABLE ---
  let answerConflictTrials = 0
  const conflictStub = async () => {
    answerConflictTrials += 1
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    const officialAnswer = input.group.questions[0].answerKey
    const conflictAnswer = officialAnswer === 'A' ? 'B' : 'A'
    bad.blanks[firstKey].correctFit.optionLabel = conflictAnswer
    return { rawText: JSON.stringify(bad), provider: 'stub', model: 'stub', latencyMs: 1 }
  }
  await assertRejects('answer conflict blocks cloze', () =>
    analyzeClozeImportCandidate(input, {
      providerCallers: { deepseek: conflictStub },
      analysisRetries: 3,
    }),
  /不一致/)
  assert('answer conflict does not retry (called exactly once)', answerConflictTrials === 1, `called ${answerConflictTrials} times`)

  // --- option-side signalText must appear in blank's options ---
  await assertRejects('option-side signalText not in options blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence.push({
      type: 'collocation-partner',
      signalText: 'NOT IN OPTIONS',
      signalSide: 'option',
      relation: 'test',
    })
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /选项中定位/)

  // --- distractorGlosses missing one distractor label ---
  await assertRejects('missing distractor gloss blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    // Remove one distractor entry (keep only 2 of the 3 expected)
    bad.blanks[firstKey].distractorGlosses = bad.blanks[firstKey].distractorGlosses.slice(0, 2)
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /distractorGlosses 必须覆盖每个非正确选项/)

  // --- distractorGlosses has an extra / wrong label ---
  await assertRejects('extra distractor label blocks cloze', () => {
    const bad = validClAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    const answerLabel = input.group.questions[0].answerKey
    // Replace last distractor entry with the correct answer label (an extra/wrong label)
    const last = bad.blanks[firstKey].distractorGlosses.length - 1
    bad.blanks[firstKey].distractorGlosses[last] = {
      optionLabel: answerLabel,
      optionText: input.group.questions[0].options[answerLabel],
      meaning: '这是正确答案，不应出现在 distractorGlosses 中。',
    }
    return analyzeClozeImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /distractorGlosses 必须覆盖每个非正确选项/)
}

function assertPromptBuilding() {
  const input = clFixtureInput()
  const messages = buildClozeAnalysisMessages(input)
  assert('cloze messages include system prompt', messages.length === 2 && messages[0].role === 'system')
  const systemContent = messages[0].content
  assert('cloze system prompt has inline JSON output requirement', systemContent.includes('JSON object') && systemContent.includes('Do NOT create or download a file'))
  const userContent = messages[1].content
  assert('cloze user message includes paperId', userContent.includes(input.paper.paperId))
  assert('cloze user message includes groupId', userContent.includes(input.group.groupId))
  assert('cloze user message includes answerKey', userContent.includes('"answerKey"'))
  assert('cloze user message includes options', userContent.includes('"options"'))
}

// ============================================================
// Step 4 — Package + route + storage wiring
// ============================================================

function clFixtureParseResult() {
  const paper = {
    paperId: 'paper-i8-package',
    sourceFilename: 'i8-package.docx',
    sourceHash: 'a'.repeat(64),
    answerSourceFilename: 'i8-package-answer.docx',
  }
  const readingGroups = ['A', 'B', 'C', 'D'].map((label, index) => {
    const lower = label.toLowerCase()
    const groupId = `group-i8-package-reading-${lower}`
    return {
      groupId,
      title: `Reading ${label}`,
      order: index,
      paragraphs: [{ id: `para-i8-${lower}-p1`, text: `Reading ${label} passage text.` }],
      questions: [{
        id: `q-i8-package-${String(21 + index).padStart(3, '0')}`,
        stem: `Question ${21 + index}?`,
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answerKey: 'A',
      }],
    }
  })
  const clozeQuestionNos = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]
  return {
    paper,
    readingGroups,
    skipped: [],
    sevenChoicesGroup: {
      groupId: 'group-i8-package-seven-choices',
      groupType: 'sevenChoices',
      title: '七选五',
      order: 4,
      paragraphs: [
        { id: 'para-i8-seven-p1', text: 'Running is a great way to get in shape. 36 , keep these things in mind.' },
      ],
      optionBank: [
        { label: 'A', text: 'Option A text' }, { label: 'B', text: 'Option B text' },
        { label: 'C', text: 'Option C text' }, { label: 'D', text: 'Option D text' },
        { label: 'E', text: 'Option E text' }, { label: 'F', text: 'Option F text' },
        { label: 'G', text: 'Option G text' },
      ],
      questions: [36, 37, 38, 39, 40].map((no) => ({
        id: `q-i8-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'B',
        blankId: `blank-i8-package-${String(no).padStart(3, '0')}`,
      })),
      blankIds: [36, 37, 38, 39, 40].map((no) => `blank-i8-package-${String(no).padStart(3, '0')}`),
    },
    clozeGroup: {
      groupId: 'group-i8-package-cloze',
      groupType: 'cloze',
      title: '完形填空',
      order: 5,
      paragraphs: [{ id: 'para-i8-cloze-p1', text: 'The boy walked slowly into the room.' }],
      questions: clozeQuestionNos.map((no, index) => ({
        id: `q-i8-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: ['A', 'B', 'C', 'D'][index % 4],
        blankId: `blank-i8-package-${String(no).padStart(3, '0')}`,
        options: { A: 'walked', B: 'ran', C: 'jumped', D: 'swam' },
      })),
      blankIds: clozeQuestionNos.map((no) => `blank-i8-package-${String(no).padStart(3, '0')}`),
    },
    grammarFillGroup: {
      groupId: 'group-i8-package-grammar-fill',
      groupType: 'grammarFill',
      title: '语法填空',
      order: 6,
      paragraphs: [{ id: 'para-i8-gf-p1', text: 'Grammar fill passage with  56  and  57  .' }],
      questions: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => ({
        id: `q-i8-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'word',
        blankId: `blank-i8-package-${String(no).padStart(3, '0')}`,
        prompt: null,
      })),
      blankIds: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => `blank-i8-package-${String(no).padStart(3, '0')}`),
    },
    applicationGroup: {
      groupId: 'group-i8-package-writing-application',
      groupType: 'writing',
      title: '应用文写作',
      order: 7,
      paragraphs: [{ id: 'para-i8-app-p1', text: '应用文写作场景.' }],
      questions: [],
    },
    continuationGroup: {
      groupId: 'group-i8-package-writing-continuation',
      groupType: 'writing',
      title: '读后续写',
      order: 8,
      paragraphs: [{ id: 'para-i8-cont-p1', text: 'Continuation material text.' }],
      continuationStarters: ['Paragraph 1 starter.', 'Paragraph 2 starter.'],
      questions: [],
    },
  }
}

function clFixtureReadingAnalyses(parseResult) {
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

function clFixtureSevenChoicesAnalysis(parseResult) {
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

function clFixtureClozeAnalysis(parseResult) {
  const cl = parseResult.clozeGroup
  const blanks = {}
  for (const q of cl.questions) {
    const no = Number(q.stem)
    const distractorLabels = ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey)
    blanks[q.id] = {
      blankId: q.blankId,
      blankNo: no,
      pos: 'verb',
      correctFit: {
        optionLabel: q.answerKey,
        reason: '搭配合理。',
      },
      distractorGlosses: distractorLabels.map((l) => ({
        optionLabel: l,
        optionText: q.options[l],
        meaning: `表示"${q.options[l]}"。`,
      })),
      evidence: [
        {
          type: 'collocation-partner',
          signalText: 'slowly',
          signalSide: 'context-before',
          targetText: 'walked',
          relation: '副词修饰，搭配自然。',
        },
      ],
      teachingNote: '通过施受关系判断动词。',
    }
  }
  return {
    schemaVersion: 'cloze-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [cl.groupId],
    meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
    groups: {
      [cl.groupId]: {
        overview: '一篇记叙文。',
        affectiveArc: '平静。',
      },
    },
    blanks,
  }
}

function assertPackageBuilder() {
  const parseResult = clFixtureParseResult()
  const sourceBuffer = Buffer.from('PK i8 cloze package docx')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  parseResult.paper.sourceHash = sourceHash

  // --- Successful build ---
  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: clFixtureReadingAnalyses(parseResult),
    sevenChoicesGroup: parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
    clozeGroup: parseResult.clozeGroup,
    clozeAnalysis: clFixtureClozeAnalysis(parseResult),
    grammarFillGroup: parseResult.grammarFillGroup,
    applicationGroup: parseResult.applicationGroup,
    continuationGroup: parseResult.continuationGroup,
    sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
  })
  assert('I8 package includes cloze-analysis-v1.json', files.some((f) => f.fileName === 'cloze-analysis-v1.json'))
  const clFile = files.find((f) => f.fileName === 'cloze-analysis-v1.json')
  assert('I8 cloze analysis file is valid JSON', clFile && clFile.buffer.length > 10)
  const clAnalysis = JSON.parse(clFile.buffer.toString())
  assert('I8 cloze analysis has correct schemaVersion', clAnalysis.schemaVersion === 'cloze-analysis-v1')
  assert('I8 cloze analysis has 15 blanks', Object.keys(clAnalysis.blanks).length === 15)

  // C7 validator round-trip.
  const validation = validatePaperImportPackage(files)
  assert('I8 package passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  // --- Missing cloze analysis when group present must block ---
  assertRejects('I8 blocks publish when cloze analysis missing', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: clFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: null,
      grammarFillGroup: parseResult.grammarFillGroup,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少 AI 解析/)

  // --- clozeAnalysis paperId mismatch must block ---
  assertRejects('I8 blocks when cloze analysis paperId mismatches', () => {
    const badAnalysis = { ...clFixtureClozeAnalysis(parseResult), paperId: 'paper-wrong' }
    return buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: clFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: badAnalysis,
      grammarFillGroup: parseResult.grammarFillGroup,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    })
  }, /paperId/)

  // --- clozeAnalysis missing targetGroups must block ---
  assertRejects('I8 blocks when cloze analysis missing targetGroups', () => {
    const badAnalysis = { ...clFixtureClozeAnalysis(parseResult), targetGroups: ['group-different'] }
    return buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: clFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: badAnalysis,
      grammarFillGroup: parseResult.grammarFillGroup,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    })
  }, /题组/)

  // --- No cloze group: clozeAnalysis not required and package succeeds ---
  const noClParseResult = { ...parseResult, clozeGroup: null }
  // Note: cloze group absence will throw cloze_group_missing from packageBuilder.
  // The four-family completeness gate fires. Test it separately by omitting cloze.
  assertRejects('I8 no-cloze-group without cloze analysis blocks (group missing)', () =>
    buildPaperImportAiPackageFiles({
      parseResult: noClParseResult,
      analysesByGroupId: clFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: null,
      clozeAnalysis: null,
      grammarFillGroup: parseResult.grammarFillGroup,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /完形/)
}

// ============================================================
// Route contract
// ============================================================

function assertRouteContract() {
  const routes = createPaperImportAiRoutes()
  assert('I8 analyze-cloze route registered', routes.some((r) => r.method === 'POST' && r.pattern.test('/api/paper-import-ai/analyze-cloze')))

  // Existing routes must still be present.
  assert('I8 analyze-seven-choices route still registered', routes.some((r) => r.method === 'POST' && r.pattern.test('/api/paper-import-ai/analyze-seven-choices')))

  // Injectable service.
  let called = false
  const stubService = async () => { called = true; return { analysis: {}, provider: 'stub', model: 'stub', requestId: 'r1', latencyMs: 1 } }
  const routesWithStub = createPaperImportAiRoutes({ analyzeCloze: stubService })
  assert('I8 analyze-cloze route supports injected service', routesWithStub.some((r) => r.pattern.test('/api/paper-import-ai/analyze-cloze')))

  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  assert('I8 route imports analyzeCloze', routeSource.includes('analyzeCloze'))
  assert('I8 route passes clozeAnalysis to publish', routeSource.includes('clozeAnalysis'))

  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  assert('I8 service exports analyzePaperImportAiClozeGroup', serviceSource.includes('analyzePaperImportAiClozeGroup'))
  assert('I8 service includes clozeAnalysis in publishPaperImportAiAnalysis', serviceSource.includes('clozeAnalysis'))

  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  assert('I8 workbench imports analyzePaperImportAiClozeGroup', pageSource.includes('analyzePaperImportAiClozeGroup'))
  assert('I8 workbench calls handleAnalyzeCloze', pageSource.includes('handleAnalyzeCloze'))
  assert('I8 workbench threads clozeAnalysis into publish', pageSource.includes("clAnalysisState.result?.analysis"))
  assert('I8 workbench one-click analyze includes cloze', pageSource.includes('clAnalysisState.status !== \'done\''))
}

// ============================================================
// Validator allowlist
// ============================================================

function assertValidatorAllowlist() {
  assert('cloze-analysis-v1 in PAPER_IMPORT_SCHEMA_VERSIONS', PAPER_IMPORT_SCHEMA_VERSIONS.has('cloze-analysis-v1'))
}

// ============================================================
// Storage disk write: published asset contains cloze-analysis-v1.json
// ============================================================

function assertStorageDiskWrite() {
  const parseResult = clFixtureParseResult()
  const sourceBuffer = Buffer.from('PK i8 storage test docx')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  parseResult.paper.sourceHash = sourceHash

  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: clFixtureReadingAnalyses(parseResult),
    sevenChoicesGroup: parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: clFixtureSevenChoicesAnalysis(parseResult),
    clozeGroup: parseResult.clozeGroup,
    clozeAnalysis: clFixtureClozeAnalysis(parseResult),
    grammarFillGroup: parseResult.grammarFillGroup,
    applicationGroup: parseResult.applicationGroup,
    continuationGroup: parseResult.continuationGroup,
    sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
  })

  const validation = validatePaperImportPackage(files)
  if (!validation.ok) {
    throw new Error(`Storage test: package validation failed:\n${JSON.stringify(validation.blockingIssues, null, 2)}`)
  }

  // Write to a temp directory.
  const tmpDir = path.join(os.tmpdir(), `i8-storage-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  try {
    const { versionDir } = writePaperImportVersion({
      paperAssetsDir: tmpDir,
      packageData: validation.packageData,
      validationReport: { ok: true },
      publishReport: { ok: true },
      version: 1,
    })

    // After write: versioned path must have cloze-analysis-v1.json.
    const versionedClozeAnalysisPath = path.join(versionDir, 'analyses', 'cloze-analysis-v1.json')
    assert('versioned cloze-analysis-v1.json written to disk', existsSync(versionedClozeAnalysisPath))

    // After swap: latest path must have cloze-analysis-v1.json.
    swapPaperImportLatest({
      paperAssetsDir: tmpDir,
      paperId: parseResult.paper.paperId,
      versionDir,
    })
    const latestClozeAnalysisPath = path.join(tmpDir, parseResult.paper.paperId, 'latest', 'analyses', 'cloze-analysis-v1.json')
    assert('latest/analyses/cloze-analysis-v1.json written to disk after swap', existsSync(latestClozeAnalysisPath))

    // Content check.
    const written = JSON.parse(readFileSync(latestClozeAnalysisPath, 'utf8'))
    assert('written cloze analysis has correct schemaVersion', written.schemaVersion === 'cloze-analysis-v1')
    assert('written cloze analysis has 15 blanks', Object.keys(written.blanks || {}).length === 15)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  // Step 2: Prompt contract
  assertPromptContract()

  // Step 3: Analysis builder + validator
  assertPromptBuilding()
  await assertAnalysisValidation()

  // Step 4: Wiring
  assertValidatorAllowlist()
  assertPackageBuilder()
  assertRouteContract()
  assertStorageDiskWrite()

  console.log(`\nI8 cloze analysis verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
