#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSupportedMarkerSequence } from './paper-normalization-test-helpers.mjs'
import { analyzeReadingImportCandidate } from '../server/paper-import-ai/analyzeReading.mjs'
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

async function assertRejects(name, fn, pattern) {
  try {
    await fn()
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : error instanceof Error ? error.message : String(error)
    assert(name, pattern.test(message), message)
    return
  }
  throw new Error(`${name}\nexpected rejection`)
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function fixtureInput() {
  return {
    paper: {
      paperId: 'paper-i1-step3',
      sourceFilename: 'i1-step3.docx',
      sourceHash: 'abc123',
    },
    group: {
      groupId: 'group-i1-step3-reading-a',
      title: 'Reading A',
      order: 0,
      paragraphs: [
        { id: 'para-i1-step3-reading-a-p1', text: 'A small museum uses sunlight to protect old paper records.' },
      ],
      questions: [
        {
          id: 'q-i1-step3-001',
          stem: 'What does the museum use?',
          options: { A: 'Sunlight', B: 'Rainwater', C: 'Music', D: 'Plastic bags' },
          answerKey: 'A',
        },
        {
          id: 'q-i1-step3-002',
          stem: 'What is protected?',
          options: { A: 'Bikes', B: 'Old paper records', C: 'Phones', D: 'Birds' },
          answerKey: 'B',
        },
      ],
    },
    providerId: 'deepseek-v4-pro',
  }
}

function fixtureFourGroupParseResult() {
  const sourceBuffer = Buffer.from('PK i1 step4 source docx placeholder')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  const paper = {
    paperId: 'paper-i1-step4',
    sourceFilename: '2026-i1-step4.docx',
    sourceHash,
    answerSourceFilename: '2026-i1-step4-answer.docx',
  }
  const readingGroups = ['A', 'B', 'C', 'D'].map((label, groupIndex) => {
    const lower = label.toLowerCase()
    const baseNo = 21 + groupIndex * 2
    const groupId = `group-i1-step4-reading-${lower}`
    return {
      groupId,
      title: `Reading ${label}`,
      order: groupIndex,
      paragraphs: [
        {
          id: `para-i1-step4-reading-${lower}-p1`,
          text: `Reading ${label} explains how a local school protects useful records.`,
        },
      ],
      questions: [0, 1].map((offset) => {
        const questionNo = baseNo + offset
        const answerKey = offset === 0 ? 'A' : 'B'
        return {
          id: `q-i1-step4-${String(questionNo).padStart(3, '0')}`,
          stem: `What does Reading ${label} question ${questionNo} ask?`,
          options: {
            A: 'A useful school action',
            B: 'A record protection plan',
            C: 'A music festival',
            D: 'A weather report',
          },
          answerKey,
        }
      }),
    }
  })
  const sevenChoicesGroup = {
    groupId: 'group-i1-step4-seven-choices',
    groupType: 'sevenChoices',
    title: '七选五',
    order: 4,
    paragraphs: [{ id: 'para-i1-step4-sc-p1', text: 'Seven choices passage about community volunteering.' }],
    optionBank: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => ({ label: l, text: `Option ${l} text.` })),
    questions: [36, 37, 38, 39, 40].map((n) => ({
      id: `q-i1-step4-${String(n).padStart(3, '0')}`,
      stem: String(n),
      answerKey: 'A',
      blankId: `blank-i1-step4-${String(n).padStart(3, '0')}`,
    })),
    blankIds: [36, 37, 38, 39, 40].map((n) => `blank-i1-step4-${String(n).padStart(3, '0')}`),
  }
  const sevenChoicesAnalysis = {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [sevenChoicesGroup.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'seven-choices-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [sevenChoicesGroup.groupId]: { overview: '七选五概览。' } },
    questions: Object.fromEntries(
      [36, 37, 38, 39, 40].map((n) => [`q-i1-step4-${String(n).padStart(3, '0')}`, { optionFit: { correctOptionLabel: 'A' } }]),
    ),
  }
  const clozeGroup = {
    groupId: 'group-i1-step4-cloze',
    groupType: 'cloze',
    title: '完形填空',
    order: 5,
    paragraphs: [{
      id: 'para-i1-step4-cloze-p1',
      text: `Cloze passage about learning from mistakes with ${buildSupportedMarkerSequence(41, 15)}.`,
    }],
    questions: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map((n) => ({
      id: `q-i1-step4-${String(n).padStart(3, '0')}`,
      stem: String(n),
      answerKey: 'B',
      blankId: `blank-i1-step4-${String(n).padStart(3, '0')}`,
      options: { A: 'rise', B: 'fall', C: 'turn', D: 'move' },
    })),
    blankIds: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map((n) => `blank-i1-step4-${String(n).padStart(3, '0')}`),
  }
  const grammarFillGroup = {
    groupId: 'group-i1-step4-grammar-fill',
    groupType: 'grammarFill',
    title: '语法填空',
    order: 6,
    paragraphs: [{
      id: 'para-i1-step4-gf-p1',
      text: `Grammar fill passage about ${buildSupportedMarkerSequence(56, 10)} over time.`,
    }],
    questions: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((n) => ({
      id: `q-i1-step4-${String(n).padStart(3, '0')}`,
      stem: String(n),
      answerKey: 'word',
      blankId: `blank-i1-step4-${String(n).padStart(3, '0')}`,
      prompt: n === 56 ? 'evolve' : null,
    })),
    blankIds: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((n) => `blank-i1-step4-${String(n).padStart(3, '0')}`),
  }
  const applicationGroup = {
    groupId: 'group-i1-step4-writing-application',
    groupType: 'writing',
    title: '应用文写作',
    order: 7,
    paragraphs: [{ id: 'para-i1-step4-app-p1', text: '应用文写作场景.' }],
    questions: [],
  }
  const continuationGroup = {
    groupId: 'group-i1-step4-writing-continuation',
    groupType: 'writing',
    title: '读后续写',
    order: 8,
    paragraphs: [{ id: 'para-i1-step4-cont-p1', text: 'Continuation material text.' }],
    continuationStarters: ['Paragraph 1 starter.', 'Paragraph 2 starter.'],
    questions: [],
  }
  const clozeAnalysis = {
    schemaVersion: 'cloze-analysis-v1',
    paperId: paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [clozeGroup.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [clozeGroup.groupId]: { overview: '完形填空概览。', affectiveArc: '情感平稳。' } },
    blanks: Object.fromEntries(
      clozeGroup.questions.map((q) => [
        q.id,
        {
          blankId: q.blankId,
          blankNo: Number(q.stem),
          pos: 'verb',
          correctFit: { optionLabel: q.answerKey, reason: '搭配合理。' },
          distractorGlosses: ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey).map((l) => ({
            optionLabel: l, optionText: q.options[l], meaning: `表示"${q.options[l]}"。`,
          })),
          evidence: [{ type: 'collocation-partner', signalText: 'learning', signalSide: 'context-after', relation: '话题词呼应。' }],
          teachingNote: '通过施受关系判断。',
        },
      ]),
    ),
  }
  return {
    sourceBuffer,
    parseResult: {
      paper,
      readingGroups,
      skipped: [],
      sevenChoicesGroup,
      clozeGroup,
      grammarFillGroup,
      applicationGroup,
      continuationGroup,
    },
    sevenChoicesGroup,
    sevenChoicesAnalysis,
    clozeGroup,
    clozeAnalysis,
    grammarFillGroup,
    applicationGroup,
    continuationGroup,
  }
}

function validAnalysis(input = fixtureInput()) {
  return {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: input.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [input.group.groupId],
    meta: {
      generatedBy: 'external-ai',
      model: 'stub',
      promptVersion: 'reading-choice-analysis-v1',
      reviewStatus: 'reviewed',
    },
    groups: {
      [input.group.groupId]: {
        overview: '博物馆保护纸质记录。',
        discourseStructure: { summary: '介绍保护方式。', paragraphs: [] },
      },
    },
    questions: Object.fromEntries(
      input.group.questions.map((question) => [
        question.id,
        {
          skill: { primary: 'detail' },
          questionFocus: question.stem,
          stemTranslationZh: '题干翻译',
          optionAnalysis: ['A', 'B', 'C', 'D'].map((label) => ({
            label,
            optionTranslationZh: `${label} 选项`,
            status: label === question.answerKey ? 'correct' : 'wrong',
            ...(label === question.answerKey ? {} : {
              trap: { primaryType: 'unsupportedClaim', explanation: `${label} 项放回原文不能成立。` },
            }),
          })),
          locationParaphrases: [],
        },
      ]),
    ),
  }
}

function validFourGroupAnalyses(parseResult) {
  return Object.fromEntries(
    parseResult.readingGroups.map((group) => [
      group.groupId,
      {
        schemaVersion: 'reading-choice-analysis-v1',
        paperId: parseResult.paper.paperId,
        sourceAssetVersion: 1,
        targetGroups: [group.groupId],
        meta: {
          generatedBy: 'external-ai',
          model: 'stub',
          promptVersion: 'reading-choice-analysis-v1',
          reviewStatus: 'reviewed',
        },
        groups: {
          [group.groupId]: {
            overview: `${group.title} 概览。`,
            discourseStructure: {
              summary: `${group.title} 结构摘要。`,
              paragraphs: group.paragraphs.map((paragraph) => ({
                paragraphId: paragraph.id,
                summary: '段落摘要',
                function: 'support',
              })),
            },
          },
        },
        questions: Object.fromEntries(
          group.questions.map((question) => [
            question.id,
            {
              skill: { primary: 'detail' },
              questionFocus: question.stem,
              stemTranslationZh: '题干翻译',
              optionAnalysis: ['A', 'B', 'C', 'D'].map((label) => ({
                label,
                optionTranslationZh: `${label} 选项`,
                status: label === question.answerKey ? 'correct' : 'wrong',
                ...(label === question.answerKey ? {} : {
                  trap: { primaryType: 'unsupportedClaim', explanation: `${label} 项放回原文不能成立。` },
                }),
              })),
              locationParaphrases: [],
            },
          ]),
        ),
      },
    ]),
  )
}

function stubProviderReturning(payload, provider = 'stub-provider') {
  return async ({ model }) => ({
    rawText: typeof payload === 'string' ? payload : JSON.stringify(payload),
    provider,
    model,
    latencyMs: 7,
  })
}

function stubProviderFailsOnceThen(payload, provider = 'stub-provider') {
  let calls = 0
  return async ({ model }) => {
    calls += 1
    if (calls === 1) throw new Error('transient relay failure')
    return {
      rawText: typeof payload === 'string' ? payload : JSON.stringify(payload),
      provider,
      model,
      latencyMs: 7,
    }
  }
}

function stubProviderBadJsonOnceThen(payload, provider = 'stub-provider') {
  let calls = 0
  return async ({ model }) => {
    calls += 1
    return {
      rawText: calls === 1 ? 'not json' : typeof payload === 'string' ? payload : JSON.stringify(payload),
      provider,
      model,
      latencyMs: 7,
    }
  }
}

function assertAllowedScope() {
  const allowedPrefixes = [
    'server/paper-import-ai/',
    'server/ai-providers/',
    'app/src/features/paper-import-ai/',
    'app/src/features/paper-intelligence/',
    'docs/cuts/I2-seven-choices-ai-import/',
  ]
  const allowedFiles = new Set([
    '.gitignore',
    'app/src/services/paperImportAi.ts',
    'scripts/README.md',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-ci.mjs',
    'scripts/verify-i1-paper-import-analysis.mjs',
    'scripts/verify-i1-paper-import-route.mjs',
    'scripts/verify-i1-paper-import-splitter.mjs',
    'scripts/verify-i2-seven-choices-ai-import.mjs',
    'scripts/verify-i3-cloze-ai-import.mjs',
    'scripts/verify-i4-grammar-fill-ai-import.mjs',
    'scripts/verify-relay-json-format.mjs',
    'server/paper-import/publisher.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import/validator.mjs',
  ])
  const files = changedFiles()
  const scopeRelevantPrefixes = [
    'server/paper-import-ai/',
    'server/ai-providers/',
    'app/src/features/paper-import-ai/',
  ]
  const scopeRelevantFiles = new Set([
    'app/src/services/paperImportAi.ts',
    'server/paper-import/publisher.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import/validator.mjs',
  ])
  const shouldCheckScope = files.some(
    (file) => scopeRelevantFiles.has(file) || scopeRelevantPrefixes.some((prefix) => file.startsWith(prefix)),
  )
  if (!shouldCheckScope) {
    assert('I1 Step 3 scope skipped for non-I1 diff', true)
    assert('I1 Step 3 forbidden scope skipped for non-I1 diff', true)
    return
  }
  const unexpected = files.filter((file) => !allowedFiles.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)))
  assert('I1 Step 3 changed files stay in the analysis whitelist', unexpected.length === 0, unexpected.join('\n'))

  const crossCutAllowed = new Set([
    'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  ])
  const forbidden = files.filter(
    (file) =>
      !crossCutAllowed.has(file) && (
        file.startsWith('prompts/') ||
        file.startsWith('shared/papersurface/') ||
        file.startsWith('app/src/domain/') ||
        file.startsWith('schemas/') ||
        file.startsWith('app/public/paper-assets/') ||
        file.endsWith('Adapter.ts') ||
        file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'
      )
  )
  assert('I1 Step 3 forbidden scopes are untouched', forbidden.length === 0, forbidden.join('\n'))
}

function assertStaticContracts() {
  const analyzeSource = readRepoFile('server/paper-import-ai/analyzeReading.mjs')
  const gptSource = readRepoFile('server/ai-providers/gptRelay.mjs')
  const chatSource = readRepoFile('server/ai-providers/chatCompletions.mjs')

  assert('analyze builder reads reviewed reading prompt', analyzeSource.includes('prompts/reading-choice-analysis-v1.md'))
  assert('analyze builder validates reading-choice-analysis-v1', analyzeSource.includes("reading-choice-analysis-v1"))
  assert('analyze input keeps provider answer judgment independent', analyzeSource.includes("question.id, ''"))
  assert('GPT relay uses chat-completions compatible URL', chatSource.includes('/chat/completions') && gptSource.includes('OPENAI_BASE_URL'))
  assert('GPT relay does not use official Responses API', !/\/responses|Responses API|responses\.create/i.test(`${gptSource}\n${chatSource}\n${analyzeSource}`))
  assert('implementation does not import OpenAI SDK', !/from ['"]openai['"]|new OpenAI/.test(`${gptSource}\n${chatSource}\n${analyzeSource}`))
}

function minimalGrammarFillAnalysis(paperId, grammarFillGroup) {
  return {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId,
    sourceAssetVersion: 1,
    targetGroups: [grammarFillGroup.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'grammar-fill-analysis-v2', reviewStatus: 'reviewed' },
    groups: { [grammarFillGroup.groupId]: { overview: '语法填空概览。' } },
    blanks: Object.fromEntries(grammarFillGroup.questions.map((q) => [
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

async function assertPublishPackageBuilder() {
  const { parseResult, sourceBuffer, sevenChoicesGroup, sevenChoicesAnalysis, clozeGroup, clozeAnalysis, grammarFillGroup, applicationGroup, continuationGroup } = fixtureFourGroupParseResult()
  const grammarFillAnalysis = minimalGrammarFillAnalysis(parseResult.paper.paperId, grammarFillGroup)
  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: validFourGroupAnalyses(parseResult),
    sevenChoicesGroup,
    sevenChoicesAnalysis,
    clozeGroup,
    clozeAnalysis,
    grammarFillGroup,
    grammarFillAnalysis,
    applicationGroup,
    continuationGroup,
    sourceDocx: {
      fileName: parseResult.paper.sourceFilename,
      buffer: sourceBuffer,
    },
  })
  const validation = validatePaperImportPackage(files)
  assert('I1 Step 4 generated package validates through C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))
  assert('I1 Step 4 generated package exposes four Reading QA groups', validation.readingGroups.length === 4)

  const conflictAnalyses = validFourGroupAnalyses(parseResult)
  const firstGroup = parseResult.readingGroups[0]
  const firstQuestion = firstGroup.questions[0]
  conflictAnalyses[firstGroup.groupId].questions[firstQuestion.id].optionAnalysis =
    conflictAnalyses[firstGroup.groupId].questions[firstQuestion.id].optionAnalysis.map((option) => ({
      ...option,
      status: option.label === 'C' ? 'correct' : 'wrong',
    }))
  assertRejects('I1 Step 4 answer conflict blocks package build', async () => buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: conflictAnalyses,
    sevenChoicesGroup,
    sevenChoicesAnalysis,
    clozeGroup,
    clozeAnalysis,
    grammarFillGroup,
    grammarFillAnalysis,
    applicationGroup,
    continuationGroup,
    sourceDocx: {
      fileName: parseResult.paper.sourceFilename,
      buffer: sourceBuffer,
    },
  }), /答案冲突/)
}

async function assertAnalyzeValidation() {
  const input = fixtureInput()
  const ok = await analyzeReadingImportCandidate(input, {
    providerCallers: { deepseek: stubProviderReturning(validAnalysis(input)) },
    requestId: 'verify-step3',
  })
  assert('valid DeepSeek stub analysis passes', ok.analysis.schemaVersion === 'reading-choice-analysis-v1' && ok.requestId === 'verify-step3')

  const gpt = await analyzeReadingImportCandidate({ ...input, providerId: 'gpt-5.5' }, {
    providerCallers: { gptRelay: stubProviderReturning(validAnalysis(input), 'openai-compatible') },
  })
  assert('valid GPT relay stub analysis passes', gpt.provider === 'openai-compatible')

  {
    const profiled = validAnalysis(input)
    for (const item of Object.values(profiled.questions)) {
      item.similarityProfile = {
        family: 'detail',
        subtype: 'general-detail',
        detailScope: 'single',
        technique: null,
      }
    }
    const result = await analyzeReadingImportCandidate(input, {
      providerCallers: { deepseek: stubProviderReturning(profiled) },
    })
    assert('controlled reading similarityProfile passes', Object.values(result.analysis.questions).every((item) => item.similarityProfile.family === 'detail'))
  }
  await assertRejects('reading similarityProfile must agree with legacy skill', () => {
    const payload = validAnalysis(input)
    payload.questions[input.group.questions[0].id].similarityProfile = {
      family: 'writing-method',
      subtype: 'writing-method',
      detailScope: null,
      technique: 'example',
    }
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /similarityProfile 与 skill\.primary 不一致/)

  const retry = await analyzeReadingImportCandidate(input, {
    providerCallers: { deepseek: stubProviderFailsOnceThen(validAnalysis(input)) },
  })
  assert('transient provider failure retries once', retry.analysis.schemaVersion === 'reading-choice-analysis-v1')

  const nonJsonRetry = await analyzeReadingImportCandidate(input, {
    providerCallers: { deepseek: stubProviderBadJsonOnceThen(validAnalysis(input)) },
  })
  assert('retry also recovers after first bad provider attempt', nonJsonRetry.analysis.schemaVersion === 'reading-choice-analysis-v1')

  await assertRejects('non-JSON provider output fails', () =>
    analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning('not json') } }), /JSON|schemaVersion|对象/
  )
  await assertRejects('wrong schema fails', () => {
    const payload = { ...validAnalysis(input), schemaVersion: 'wrong' }
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /schemaVersion/)
  await assertRejects('wrong group fails', () => {
    const payload = { ...validAnalysis(input), targetGroups: ['group-other'] }
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /targetGroups/)
  await assertRejects('missing question fails', () => {
    const payload = validAnalysis(input)
    delete payload.questions[input.group.questions[0].id]
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /questionIds/)
  await assertRejects('extra question fails', () => {
    const payload = validAnalysis(input)
    payload.questions['q-extra'] = payload.questions[input.group.questions[0].id]
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /questionIds/)
  await assertRejects('every wrong reading option needs student-visible analysis', () => {
    const payload = validAnalysis(input)
    const firstQuestion = input.group.questions[0]
    const wrongOption = payload.questions[firstQuestion.id].optionAnalysis.find((option) => option.status === 'wrong')
    delete wrongOption.trap
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /每个阅读错项都必须提供可展示的干扰项辨析/)
  await assertRejects('answer mismatch fails before publish', () => {
    const payload = validAnalysis(input)
    const firstQuestion = input.group.questions[0]
    payload.questions[firstQuestion.id].optionAnalysis = payload.questions[firstQuestion.id].optionAnalysis.map((option) => ({
      ...option,
      status: option.label === 'C' ? 'correct' : 'wrong',
    }))
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /答案解析版不一致/)
  await assertRejects('answer mismatch does not retry into a clean answer', () => {
    const mismatchPayload = validAnalysis(input)
    const firstQuestion = input.group.questions[0]
    mismatchPayload.questions[firstQuestion.id].optionAnalysis = mismatchPayload.questions[firstQuestion.id].optionAnalysis.map((option) => ({
      ...option,
      status: option.label === 'C' ? 'correct' : 'wrong',
    }))
    let calls = 0
    const provider = async ({ model }) => {
      calls += 1
      const payload = calls === 1 ? mismatchPayload : validAnalysis(input)
      return { rawText: JSON.stringify(payload), provider: 'stub-provider', model, latencyMs: 7 }
    }
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: provider } })
  }, /答案解析版不一致/)
  await assertRejects('non-exact evidence quote fails before publish', () => {
    const payload = validAnalysis(input)
    const firstQuestion = input.group.questions[0]
    payload.questions[firstQuestion.id].optionAnalysis[0].evidence = [{
      role: 'primary',
      paragraphId: input.group.paragraphs[0].id,
      quote: 'not an exact passage quote',
      anchor: 'bad quote',
    }]
    return analyzeReadingImportCandidate(input, { providerCallers: { deepseek: stubProviderReturning(payload) } })
  }, /精确匹配原文/)
}

async function main() {
  assertStaticContracts()
  await assertPublishPackageBuilder()
  await assertAnalyzeValidation()
  console.log(`I1 paper-import-ai analysis verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
