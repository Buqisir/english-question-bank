#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'
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

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function gitStatusLines() {
  try {
    return execFileSync('git', ['status', '--short', '--untracked-files=all', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function changedFiles() {
  const statusFiles = gitStatusLines().map((line) => {
    const file = line.slice(3)
    return file.includes(' -> ') ? file.split(' -> ').at(-1) : file
  })
  return [...new Set([...gitLines(['diff', '--name-only', 'github/main...HEAD']), ...gitLines(['diff', '--name-only']), ...statusFiles])]
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
  return {
    sourceBuffer,
    parseResult: {
      paper,
      readingGroups,
      skipped: [],
    },
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
    'docs/cuts/I2-seven-choices-ai-import/',
  ]
  const allowedFiles = new Set([
    'app/src/services/paperImportAi.ts',
    'scripts/README.md',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-ci.mjs',
    'scripts/verify-i1-paper-import-analysis.mjs',
    'scripts/verify-i1-paper-import-route.mjs',
    'scripts/verify-i1-paper-import-splitter.mjs',
    'scripts/verify-i2-seven-choices-ai-import.mjs',
    'server/paper-import/publisher.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import/validator.mjs',
  ])
  const files = changedFiles()
  const unexpected = files.filter((file) => !allowedFiles.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)))
  assert('I1 Step 3 changed files stay in the analysis whitelist', unexpected.length === 0, unexpected.join('\n'))

  const forbidden = files.filter(
    (file) =>
      file.startsWith('prompts/') ||
      file.startsWith('shared/papersurface/') ||
      file.startsWith('app/src/domain/') ||
      file.startsWith('schemas/') ||
      file.startsWith('app/public/paper-assets/') ||
      file.endsWith('Adapter.ts') ||
      file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'
  )
  assert('I1 Step 3 forbidden scopes are untouched', forbidden.length === 0, forbidden.join('\n'))
}

function assertStaticContracts() {
  const routes = createPaperImportAiRoutes()
  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  const analyzeSource = readRepoFile('server/paper-import-ai/analyzeReading.mjs')
  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  const gptSource = readRepoFile('server/ai-providers/gptRelay.mjs')
  const chatSource = readRepoFile('server/ai-providers/chatCompletions.mjs')

  assert('POST /api/paper-import-ai/analyze is registered', routes.some((route) => route.method === 'POST' && route.pattern.test('/api/paper-import-ai/analyze')))
  assert('POST /api/paper-import-ai/publish is registered', routes.some((route) => route.method === 'POST' && route.pattern.test('/api/paper-import-ai/publish')))
  assert('route supports injected analyze service for tests', routeSource.includes('services.analyzeReading'))
  assert('parse route accepts optional answer analysis DOCX', routeSource.includes('maxFiles: 2') && routeSource.includes('answerKeyBuffer'))
  assert('publish route reuses C7 publisher', routeSource.includes('publishPaperImportPackage') && routeSource.includes('buildPaperImportAiPackageFiles'))
  assert('analyze builder reads reviewed reading prompt', analyzeSource.includes('prompts/reading-choice-analysis-v1.md'))
  assert('analyze builder validates reading-choice-analysis-v1', analyzeSource.includes("reading-choice-analysis-v1"))
  assert('analyze input keeps provider answer judgment independent', analyzeSource.includes("question.id, ''"))
  assert('client service calls analyze endpoint', serviceSource.includes('/api/paper-import-ai/analyze'))
  assert('client service calls publish endpoint', serviceSource.includes('/api/paper-import-ai/publish'))
  assert('client service does not call legacy save endpoint', !serviceSource.includes('/api/paper-import-ai/save'))
  assert('page exposes provider picker', pageSource.includes('providerOptions') && pageSource.includes('GPT 5.5 中转'))
  assert('page exposes analysis action button', pageSource.includes('生成解析'))
  assert('page renders teacher-readable preview', pageSource.includes('AnalysisReadablePreview') && pageSource.includes('定位关系 / 同义替换'))
  assert('page renders JSON preview', pageSource.includes('pi-ai-json-preview'))
  assert('page keeps raw JSON folded', pageSource.includes('查看原始 JSON') && pageSource.includes('<details'))
  assert('page exposes publish action and QA links', pageSource.includes('handlePublish') && pageSource.includes('保存为正式试卷') && pageSource.includes('qaLinks'))
  assert('GPT relay uses chat-completions compatible URL', chatSource.includes('/chat/completions') && gptSource.includes('OPENAI_BASE_URL'))
  assert('GPT relay does not use official Responses API', !/\/responses|Responses API|responses\.create/i.test(`${gptSource}\n${chatSource}\n${analyzeSource}`))
  assert('implementation does not import OpenAI SDK', !/from ['"]openai['"]|new OpenAI/.test(`${gptSource}\n${chatSource}\n${analyzeSource}`))
}

async function assertPublishPackageBuilder() {
  const { parseResult, sourceBuffer } = fixtureFourGroupParseResult()
  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: validFourGroupAnalyses(parseResult),
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
  assertAllowedScope()
  assertStaticContracts()
  await assertPublishPackageBuilder()
  await assertAnalyzeValidation()
  console.log(`I1 paper-import-ai analysis verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
