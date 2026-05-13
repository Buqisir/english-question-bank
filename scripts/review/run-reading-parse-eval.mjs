#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildReviewCandidatePayload, expectedReviewCard } from './reading-parse-review-queue.mjs'

const DEFAULT_SOURCE_DIR = '/Users/huangxuewei/Desktop/10_日常工作/真题答案版'
const DEFAULT_API_BASE = 'http://127.0.0.1:8787'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const HIGH_ORDER_SURFACES = new Set([
  'example_function',
  'writing_technique',
  'paragraph_function',
  'inference_general',
  'passage_main_idea',
  'paragraph_main_idea',
  'attitude_tone',
  'abstract_phrase_summary',
  'adjective_summary',
  'word_meaning',
])

function parseArgs(argv) {
  const args = {
    apiBase: process.env.EVAL_API_BASE || DEFAULT_API_BASE,
    dir: process.env.EVAL_SOURCE_DIR || DEFAULT_SOURCE_DIR,
    limit: Number(process.env.EVAL_LIMIT || 6),
    model: process.env.EVAL_MODEL || DEFAULT_MODEL,
    thinkingMode: process.env.EVAL_THINKING === 'false' ? false : true,
    passages: new Set(String(process.env.EVAL_PASSAGES || 'C,D').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)),
    files: [],
    skipParse: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--api-base') {
      args.apiBase = next
      index += 1
    } else if (arg === '--dir') {
      args.dir = next
      index += 1
    } else if (arg === '--limit') {
      args.limit = Number(next)
      index += 1
    } else if (arg === '--model') {
      args.model = next
      index += 1
    } else if (arg === '--thinking') {
      args.thinkingMode = next !== 'false'
      index += 1
    } else if (arg === '--passages') {
      args.passages = new Set(String(next || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))
      index += 1
    } else if (arg === '--file') {
      args.files.push(next)
      index += 1
    } else if (arg === '--skip-parse') {
      args.skipParse = true
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 6
  return args
}

function inferYear(title) {
  return Number(String(title || '').match(/(20\d{2})/)?.[1]) || new Date().getFullYear()
}

function inferRegion(title) {
  return (
    String(title || '').match(/年(.+?)(?:卷|[-—]|$)/)?.[1]?.replace(/答案版|高考|真题/g, '').trim() ||
    '未知地区'
  )
}

function titleWithoutExt(filePath) {
  return path.basename(filePath).replace(/\.(docx|doc)$/i, '')
}

function isAnswerVersionDocx(filePath) {
  const name = path.basename(filePath)
  return /\.docx$/i.test(name) && name.includes('答案版') && !name.startsWith('~$') && !name.startsWith('.~')
}

function chooseFiles(args) {
  if (args.files.length > 0) return args.files.map((file) => path.resolve(file))
  const preferred = [
    '2025年新课标I卷-答案版.docx',
    '2025年新课标Ⅱ卷-答案版.docx',
    '2024年新课标Ⅰ卷-答案版.docx',
    '2024年新课标Ⅱ卷-答案版.docx',
    '2024年全国甲卷-答案版.docx',
    '2023年新课标Ⅰ卷-答案版.docx',
    '2023年新课标Ⅱ卷-答案版.docx',
    '2022年新课标I-答案版.docx',
  ]
  const existing = new Map(
    readdirSync(args.dir)
      .filter((name) => isAnswerVersionDocx(name))
      .map((name) => [name, path.join(args.dir, name)]),
  )
  const selected = preferred.map((name) => existing.get(name)).filter(Boolean)
  if (selected.length >= args.limit) return selected.slice(0, args.limit)

  const fallback = [...existing.values()]
    .filter((file) => !selected.includes(file))
    .sort()
  return [...selected, ...fallback].slice(0, args.limit)
}

function keyFromKeychain() {
  const envKey = String(process.env.DEEPSEEK_API_KEY || '').trim()
  if (envKey) return envKey
  try {
    return execFileSync('security', [
      'find-generic-password',
      '-s',
      'english-question-bank-deepseek',
      '-a',
      'english-question-bank',
      '-w',
    ], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const raw = await response.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    // Keep raw text for diagnostics below.
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${raw.slice(0, 800)}`)
  }
  return data
}

async function findOrUploadBundle(filePath, args, existingBundles) {
  const fileName = path.basename(filePath)
  const bundleTitle = titleWithoutExt(filePath)
  const existing = existingBundles.find((bundle) => bundle.title === bundleTitle)
  if (existing?.files?.some((file) => file.originalName === fileName && file.status === 'parsed')) {
    return { bundleId: existing.id, reused: true }
  }

  const body = readFileSync(filePath).toString('base64')
  const upload = await requestJson(`${args.apiBase}/api/import-files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName,
      dataBase64: body,
      contentRole: 'question_with_analysis',
      bundleTitle,
    }),
  })
  await requestJson(`${args.apiBase}/api/import-files/${encodeURIComponent(upload.importFile.id)}/parse`, {
    method: 'POST',
  })
  return { bundleId: upload.importFile.bundleId, reused: false }
}

function passageLetterFromTitle(title) {
  return String(title || '').match(/阅读理解\s*([A-D])(?:\s|$)/)?.[1] || ''
}

function normalizeQuestionForCreate(question) {
  return {
    questionNo: String(question.questionNo || ''),
    questionType: question.questionType || '阅读选择',
    stem: question.stem || '',
    answer: question.answer || '',
    explanation: question.explanation || '',
    difficulty: question.difficulty || 'medium',
    score: Number(question.score || 0) || 2,
    note: question.rawText ? `eval raw: ${String(question.rawText).slice(0, 300)}` : '',
    options: Array.isArray(question.options) ? question.options : [],
  }
}

async function createEvalQuestionGroup({ filePath, draftGroup, args, runId }) {
  const paperTitle = titleWithoutExt(filePath)
  const payload = {
    sourceType: 'real_exam',
    groupType: 'reading',
    difficulty: draftGroup.difficulty || 'medium',
    year: inferYear(paperTitle),
    region: inferRegion(paperTitle),
    paperName: paperTitle,
    section: draftGroup.title,
    passageTitle: `${draftGroup.title} [EVAL ${runId}]`,
    materialText: draftGroup.materialText || '',
    summary: `${paperTitle} ${passageLetterFromTitle(draftGroup.title) || ''} 篇评测导入`,
    theme: '',
    discourseType: '',
    groupTitle: `EVAL ${runId} ${draftGroup.title}`,
    instruction: draftGroup.instruction || '阅读理解',
    defaultScore: Number(draftGroup.questions?.[0]?.score || 0) || 2,
    questionCount: draftGroup.questions?.length || 0,
    questions: (draftGroup.questions || []).map(normalizeQuestionForCreate),
    tags: ['reading-parse-eval', `eval-${runId}`],
  }

  const created = await requestJson(`${args.apiBase}/api/question-groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return created.questionGroup
}

function hasEntityPurposeMentionSignal(text) {
  return /\bpurpose\s+of\s+(?:the\s+)?(?:laws?|rules?|polic(?:y|ies)|measures?|programs?|projects?|strateg(?:y|ies))\s+(?:mentioned|listed|discussed)\b/i.test(text)
}

function hasExampleFunctionSignal(text) {
  if (hasEntityPurposeMentionSignal(text)) return false
  return /\b(?:mention(?:s|ed|ing)?|discuss(?:es|ed|ing)?|illustrate|show|demonstrate|prove|cite|cited|refer(?:red)? to|list(?:s|ed|ing)?|example)\b/i.test(text) ||
    /提及|提到|引用|举例|例子|为了说明|用来说明/.test(text)
}

function hasPersonPurposeSignal(text) {
  return /\b(?:trying to do|try to do|tried to do|intend(?:ed)? to|aim(?:ed)? to|goal|purpose|want(?:ed)? to|seek(?:ing)? to|call(?:ed)? on)\b/i.test(text) ||
    /为什么|为何|目的|试图|想要|旨在/.test(text)
}

function classifyRow(row) {
  const reasons = []
  const categories = new Set()
  const expected = expectedReviewCard(row)
  const stem = row.questionStem || ''

  if (row.surfaceType === 'example_function' && hasPersonPurposeSignal(stem) && !hasExampleFunctionSignal(stem)) {
    reasons.push('example_function appears on a person/group purpose stem')
    categories.add('prompt')
  }
  if (expected && row.tCardId && expected !== row.tCardId) {
    reasons.push(`expected ${expected} from surface=${row.surfaceType}, got ${row.tCardId}`)
    categories.add(['word_meaning', 'writing_technique', 'paragraph_function', 'abstract_phrase_summary'].includes(row.surfaceType) ? 'backend' : 'prompt')
  }
  if (['single_detail_normal', 'why_did'].includes(row.surfaceType) && ['T5', 'T7', 'T8', 'T9', 'T10'].includes(row.tCardId)) {
    reasons.push(`low-level surface=${row.surfaceType} paired with advanced card ${row.tCardId}`)
    categories.add('prompt')
  }
  if (row.surfaceType === 'multi_detail_learn_from' && row.tCardId && !['T4', 'T6'].includes(row.tCardId)) {
    reasons.push(`multi-detail surface paired with unexpected card ${row.tCardId}`)
    categories.add('prompt')
  }
  if (row.tCardId === 'T10' && Number(row.finalScore || 0) < 7) {
    reasons.push('T10 finalScore below hard floor 7')
    categories.add('backend')
  }
  if (row.reviewNeeded === true) {
    reasons.push('model/backend marked reviewNeeded')
    categories.add('manual')
  }
  if (row.boundaryFlags.length > 0 && ['T5_T10', 'T6_T10', 'T7_T8', 'T6_T9', 'T2_T6'].some((flag) => row.boundaryFlags.includes(flag))) {
    reasons.push(`high-risk boundary: ${row.boundaryFlags.join('|')}`)
    categories.add('manual')
  }
  if (Number(row.confidence || 1) < 0.78 && ['T6', 'T8', 'T9', 'T10'].includes(row.tCardId)) {
    reasons.push('advanced card with low confidence')
    categories.add('manual')
  }

  return {
    suspiciousReason: reasons.join('; '),
    driftCategory: categories.size > 0 ? [...categories].join('+') : '',
  }
}

function flattenQuestions({ filePath, draftGroup, createdGroup, parseResult, parseError }) {
  const parsedByNo = new Map((parseResult?.questions || []).map((question) => [String(question.questionNo), question]))
  return (draftGroup.questions || []).map((draftQuestion) => {
    const parsed = parsedByNo.get(String(draftQuestion.questionNo)) || {}
    const surface = parsed.surfaceQuestion || {}
    const synonym = parsed.synonymDifficulty || {}
    const profile = parsed.difficultyProfile || {}
    const row = {
      sourceFile: path.basename(filePath),
      paper: titleWithoutExt(filePath),
      passage: passageLetterFromTitle(draftGroup.title),
      groupTitle: draftGroup.title,
      evalGroupId: createdGroup?.id || '',
      questionNo: draftQuestion.questionNo,
      questionStem: draftQuestion.stem || '',
      answer: draftQuestion.answer || '',
      parseOk: !parseError && Boolean(parsed.questionNo),
      parseError: parseError || '',
      questionType: parsed.questionType || '',
      surfaceType: surface.type || '',
      surfaceScope: surface.scope || '',
      answeringMove: surface.answeringMove || parsed.answeringMove || '',
      tCardId: synonym.cardId || '',
      tName: synonym.name || '',
      soloLevel: synonym.soloLevel || '',
      confidence: synonym.confidence ?? '',
      boundaryFlags: Array.isArray(synonym.boundaryFlags) ? synonym.boundaryFlags : [],
      reviewNeeded: synonym.reviewNeeded === true,
      finalScore: profile.finalScore ?? '',
      finalLabel: profile.finalLabel || '',
      vocabLevel: profile.vocabLoad?.level || '',
      syntaxLevel: profile.syntaxLoad?.level || '',
      infoSpan: profile.infoSpan?.level || '',
      reasoningAbstraction: profile.reasoningAbstraction || '',
      distractorStrength: profile.distractorStrength || '',
      topicAbstractness: profile.topicAbstractness || '',
      sourceExpression: synonym.sourceExpression || '',
      optionExpression: synonym.optionExpression || '',
      reason: synonym.reason || '',
      boundaryCheck: synonym.boundaryCheck || '',
      isHighOrderFocus: HIGH_ORDER_SURFACES.has(surface.type || '') || ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].includes(synonym.cardId || ''),
    }
    return { ...row, ...classifyRow(row) }
  })
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows) {
  const headers = [
    'sourceFile',
    'passage',
    'questionNo',
    'questionStem',
    'answer',
    'parseOk',
    'surfaceType',
    'answeringMove',
    'tCardId',
    'boundaryFlags',
    'reviewNeeded',
    'confidence',
    'finalScore',
    'finalLabel',
    'isHighOrderFocus',
    'driftCategory',
    'suspiciousReason',
  ]
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')
}

async function parseAndSaveGroup(groupId, args, apiKey) {
  const parseResult = await requestJson(`${args.apiBase}/api/question-groups/${encodeURIComponent(groupId)}/reading-parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: args.model,
      thinkingMode: args.thinkingMode,
      requestId: `eval-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  })

  await requestJson(`${args.apiBase}/api/question-groups/${encodeURIComponent(groupId)}/reading-parse`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ readingParseResult: parseResult, verifyResult: null }),
  })
  return parseResult
}

function summarize(rows, files) {
  const suspicious = rows.filter((row) => row.suspiciousReason)
  const categories = {}
  for (const row of suspicious) {
    const key = row.driftCategory || 'unknown'
    categories[key] = (categories[key] || 0) + 1
  }
  return {
    files: files.length,
    questionRows: rows.length,
    highOrderRows: rows.filter((row) => row.isHighOrderFocus).length,
    parseFailures: rows.filter((row) => !row.parseOk).length,
    suspiciousRows: suspicious.length,
    categories,
    shouldSplitFlashRequests:
      suspicious.filter((row) => ['prompt', 'backend'].includes(row.driftCategory)).length >= Math.max(3, Math.ceil(rows.length * 0.12))
        ? 'consider'
        : 'not_yet',
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = chooseFiles(args).filter((file) => existsSync(file))
  if (files.length === 0) throw new Error(`No answer-version docx files found in ${args.dir}`)

  const apiKey = args.skipParse ? '' : keyFromKeychain()
  if (!args.skipParse && !apiKey) throw new Error('DeepSeek API key not found in DEEPSEEK_API_KEY or macOS Keychain')

  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const existingBundles = (await requestJson(`${args.apiBase}/api/import-bundles`)).importBundles || []
  const rows = []
  const groupResults = []

  console.log(`reading-parse eval run=${runId} files=${files.length} passages=${[...args.passages].join(',')} model=${args.model} thinking=${args.thinkingMode}`)

  for (const filePath of files) {
    const fileName = path.basename(filePath)
    console.log(`\n[import] ${fileName}`)
    const { bundleId, reused } = await findOrUploadBundle(filePath, args, existingBundles)
    console.log(`[draft] bundle=${bundleId} reused=${reused}`)
    const draftPayload = await requestJson(`${args.apiBase}/api/import-bundles/${encodeURIComponent(bundleId)}/draft`, {
      method: 'POST',
    })
    const draftGroups = (draftPayload.draft?.groups || [])
      .filter((group) => group.groupType === 'reading')
      .filter((group) => args.passages.has(passageLetterFromTitle(group.title)))

    if (draftGroups.length === 0) {
      console.log(`[warn] no selected reading groups found in ${fileName}`)
      continue
    }

    for (const draftGroup of draftGroups) {
      console.log(`[group] ${draftGroup.title} q=${draftGroup.questions?.length || 0}`)
      const createdGroup = await createEvalQuestionGroup({ filePath, draftGroup, args, runId })
      let parseResult = null
      let parseError = ''
      if (!args.skipParse) {
        try {
          const started = Date.now()
          parseResult = await parseAndSaveGroup(createdGroup.id, args, apiKey)
          console.log(`[parse] ${draftGroup.title} ${parseResult.parsedCount}/${parseResult.questionCount} ${Date.now() - started}ms`)
        } catch (error) {
          parseError = error instanceof Error ? error.message : String(error)
          console.log(`[parse:error] ${draftGroup.title} ${parseError.slice(0, 300)}`)
        }
      }
      const groupRows = flattenQuestions({ filePath, draftGroup, createdGroup, parseResult, parseError })
      rows.push(...groupRows)
      groupResults.push({
        file: fileName,
        draftTitle: draftGroup.title,
        evalGroupId: createdGroup.id,
        parseOk: !parseError,
        parseError,
      })
    }
  }

  const reportsDir = path.join(process.cwd(), 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const report = {
    runId,
    createdAt: new Date().toISOString(),
    args: {
      apiBase: args.apiBase,
      dir: args.dir,
      limit: args.limit,
      model: args.model,
      thinkingMode: args.thinkingMode,
      passages: [...args.passages],
      skipParse: args.skipParse,
    },
    summary: summarize(rows, files),
    groups: groupResults,
    rows,
  }
  const jsonPath = path.join(reportsDir, `reading-parse-eval-${runId}.json`)
  const csvPath = path.join(reportsDir, `reading-parse-eval-${runId}.csv`)
  const candidatesPath = path.join(reportsDir, `reading-parse-review-candidates-${runId}.json`)
  const reviewCandidates = buildReviewCandidatePayload({ ...report, sourceReport: jsonPath })
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(csvPath, `${toCsv(rows)}\n`)
  writeFileSync(candidatesPath, `${JSON.stringify(reviewCandidates, null, 2)}\n`)

  console.log(`\n[summary] ${JSON.stringify(report.summary)}`)
  console.log(`[review-candidates] ${JSON.stringify(reviewCandidates.summary)}`)
  console.log(`[report] ${jsonPath}`)
  console.log(`[report] ${csvPath}`)
  console.log(`[report] ${candidatesPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
