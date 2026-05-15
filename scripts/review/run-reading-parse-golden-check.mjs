#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_GOLDEN = 'knowledge/reading-parse/golden-reading-parse-cases.jsonl'
const DEFAULT_DB = 'data/question-bank.sqlite'
const DEFAULT_API_BASE = 'http://127.0.0.1:8787'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function parseArgs(argv) {
  const args = {
    golden: DEFAULT_GOLDEN,
    db: DEFAULT_DB,
    apiBase: process.env.EVAL_API_BASE || DEFAULT_API_BASE,
    model: process.env.EVAL_MODEL || DEFAULT_MODEL,
    thinkingMode: process.env.EVAL_THINKING === 'false' ? false : true,
    output: '',
    rerun: false,
    verbose: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--golden') {
      args.golden = next || DEFAULT_GOLDEN
      index += 1
    } else if (arg === '--db') {
      args.db = next || DEFAULT_DB
      index += 1
    } else if (arg === '--api-base') {
      args.apiBase = next || DEFAULT_API_BASE
      index += 1
    } else if (arg === '--model') {
      args.model = next || DEFAULT_MODEL
      index += 1
    } else if (arg === '--thinking') {
      args.thinkingMode = next !== 'false'
      index += 1
    } else if (arg === '--output') {
      args.output = next || ''
      index += 1
    } else if (arg === '--rerun') {
      args.rerun = true
    } else if (arg === '--verbose') {
      args.verbose = true
    }
  }

  return args
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) throw new Error(`Golden file not found: ${filePath}`)
  return readFileSync(filePath, 'utf8')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function sqliteString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function sqliteValue(dbPath, sql) {
  const args = [dbPath, '-json', sql]
  const raw = execFileSync('sqlite3', args, { encoding: 'utf8' }).trim()
  return raw ? JSON.parse(raw) : []
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
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${raw.slice(0, 800)}`)
  return raw ? JSON.parse(raw) : null
}

async function rerunGroup(groupId, args, apiKey) {
  const parseResult = await requestJson(`${args.apiBase}/api/question-groups/${encodeURIComponent(groupId)}/reading-parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: args.model,
      thinkingMode: args.thinkingMode,
      requestId: `golden-check-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  })

  await requestJson(`${args.apiBase}/api/question-groups/${encodeURIComponent(groupId)}/reading-parse`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ readingParseResult: parseResult, verifyResult: null }),
  })
  return parseResult
}

function savedParsePayload(dbPath, groupId) {
  const rows = sqliteValue(dbPath, `select payload_json from reading_parse_results where question_group_id = ${sqliteString(groupId)};`)
  if (!rows[0]?.payload_json) return null
  const payload = JSON.parse(rows[0].payload_json)
  return payload && Array.isArray(payload.questions) ? payload : null
}

function actualLabels(question) {
  const surface = question?.surfaceQuestion || {}
  const synonym = question?.synonymDifficulty || {}
  const profile = question?.difficultyProfile || {}
  return {
    surfaceType: surface.type || '',
    tCardId: synonym.cardId || '',
    boundaryFlags: Array.isArray(synonym.boundaryFlags) ? synonym.boundaryFlags : [],
    finalScore: profile.finalScore ?? '',
    finalLabel: profile.finalLabel || '',
    answeringMove: surface.answeringMove || question?.answeringMove || '',
    surfaceScope: surface.scope || '',
    soloLevel: synonym.soloLevel || '',
    reviewNeeded: synonym.reviewNeeded === true,
  }
}

function sortedArray(value) {
  return Array.isArray(value) ? [...value].sort() : []
}

function sameValue(expected, actual) {
  if (Array.isArray(expected)) {
    return JSON.stringify(sortedArray(expected)) === JSON.stringify(sortedArray(actual))
  }
  return String(expected ?? '') === String(actual ?? '')
}

function compareRecord(record, parsePayload) {
  const questionNo = String(record.source?.questionNo || '')
  const actualQuestion = (parsePayload?.questions || []).find((question) => String(question.questionNo) === questionNo)
  if (!actualQuestion) {
    return [{
      field: 'question',
      expected: questionNo,
      actual: '(missing)',
    }]
  }

  const actual = actualLabels(actualQuestion)
  const expected = record.acceptedLabels || {}
  const fields = [
    'surfaceType',
    'tCardId',
    'boundaryFlags',
    'finalScore',
    'finalLabel',
    'answeringMove',
    'surfaceScope',
    'soloLevel',
    'reviewNeeded',
  ]

  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(expected, field))
    .filter((field) => !sameValue(expected[field], actual[field]))
    .map((field) => ({
      field,
      expected: expected[field],
      actual: actual[field],
    }))
}

function actualQuestionFor(record, parsePayload) {
  const questionNo = String(record.source?.questionNo || '')
  return (parsePayload?.questions || []).find((question) => String(question.questionNo) === questionNo) || null
}

function summarize(results) {
  const failed = results.filter((result) => result.status === 'FAIL')
  const byField = {}
  for (const result of failed) {
    for (const mismatch of result.mismatches) {
      byField[mismatch.field] = (byField[mismatch.field] || 0) + 1
    }
  }
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    byField,
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  }
}

function defaultOutputPath() {
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  return path.join(process.cwd(), 'reports', `reading-parse-golden-check-${runId}.json`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const goldenPath = path.resolve(args.golden)
  const dbPath = path.resolve(args.db)
  const records = readJsonl(goldenPath)
  const groupIds = [...new Set(records.map((record) => record.source?.evalGroupId).filter(Boolean))]

  if (args.rerun) {
    const apiKey = keyFromKeychain()
    if (!apiKey) throw new Error('DeepSeek API key not found in DEEPSEEK_API_KEY or macOS Keychain')
    for (const groupId of groupIds) {
      const started = Date.now()
      const result = await rerunGroup(groupId, args, apiKey)
      console.log(`[rerun] ${groupId} ${result.parsedCount}/${result.questionCount} ${Date.now() - started}ms`)
    }
  }

  const payloadByGroup = new Map(groupIds.map((groupId) => [groupId, savedParsePayload(dbPath, groupId)]))
  const results = records.map((record) => {
    const groupId = record.source?.evalGroupId || ''
    const parsePayload = payloadByGroup.get(groupId)
    const actualQuestion = actualQuestionFor(record, parsePayload)
    const mismatches = parsePayload
      ? compareRecord(record, parsePayload)
      : [{ field: 'group', expected: groupId, actual: '(missing saved parse)' }]
    return {
      candidateId: record.candidateId,
      source: record.source,
      status: mismatches.length === 0 ? 'PASS' : 'FAIL',
      actual: actualQuestion ? actualLabels(actualQuestion) : null,
      mismatches,
    }
  })

  const report = {
    createdAt: new Date().toISOString(),
    golden: goldenPath,
    db: dbPath,
    rerun: args.rerun,
    summary: summarize(results),
    results,
  }
  const outputPath = path.resolve(args.output || defaultOutputPath())
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`[golden-check] ${outputPath}`)
  console.log(`[summary] ${JSON.stringify(report.summary)}`)
  if (args.verbose) {
    for (const result of results) {
      const actual = result.actual || {}
      console.log(
        `[${result.status}] ${result.candidateId} surface=${actual.surfaceType || ''} move=${actual.answeringMove || ''} card=${actual.tCardId || ''} flags=${(actual.boundaryFlags || []).join('|')} review=${actual.reviewNeeded === true} score=${actual.finalScore ?? ''} label=${actual.finalLabel || ''}`,
      )
    }
  }
  for (const result of results.filter((item) => item.status === 'FAIL').slice(0, 10)) {
    console.log(`[FAIL] ${result.candidateId} ${result.mismatches.map((mismatch) => `${mismatch.field}: expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(mismatch.actual)}`).join('; ')}`)
  }
  if (report.summary.verdict === 'FAIL') process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
