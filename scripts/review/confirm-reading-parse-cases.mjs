#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { VALID_SURFACE_TYPES } from './reading-parse-review-queue.mjs'

const DEFAULT_OUTPUT = 'knowledge/reading-parse/golden-reading-parse-cases.jsonl'
const VALID_ACTIONS = new Set(['accept', 'correct_card', 'correct_surface'])
const CARD_RE = /^T(?:10|[1-9])$/
const NON_GAOKAO_SOURCE_RE = /(?:高三|一模|二模|三模|模拟|联考|质检|调研|诊断|适应性|月考|期中|期末|押题|预测|名校|联测|统考)/
const GAOKAO_SOURCE_RE = /(?:高考|新课标|全国|北京|天津|上海|浙江|江苏|山东|广东|福建|湖北|湖南|河北|辽宁|重庆|海南)/
const CARD_META = {
  T1: { scoreFloor: 1, soloLevel: '单点类' },
  T2: { scoreFloor: 2, soloLevel: '单点类' },
  T3: { scoreFloor: 3, soloLevel: '单点类' },
  T4: { scoreFloor: 3, soloLevel: '多点类' },
  T5: { scoreFloor: 4, soloLevel: '关联类' },
  T6: { scoreFloor: 4, soloLevel: '关联类' },
  T7: { scoreFloor: 4, soloLevel: '关联类' },
  T8: { scoreFloor: 4, soloLevel: '关联类' },
  T9: { scoreFloor: 4, soloLevel: '关联类' },
  T10: { scoreFloor: 7, soloLevel: '抽象拓展类' },
}

function parseArgs(argv) {
  const args = {
    input: '',
    output: DEFAULT_OUTPUT,
    dryRun: false,
    allowDuplicates: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--input') {
      args.input = next || ''
      index += 1
    } else if (arg === '--output') {
      args.output = next || DEFAULT_OUTPUT
      index += 1
    } else if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '--allow-duplicates') {
      args.allowDuplicates = true
    }
  }

  if (!args.input) throw new Error('Usage: node scripts/review/confirm-reading-parse-cases.mjs --input <review-candidates.json> [--output <jsonl>] [--dry-run] [--allow-duplicates]')
  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readExistingIds(filePath) {
  if (!existsSync(filePath)) return new Set()
  return new Set(
    readFileSync(filePath, 'utf8')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line).candidateId
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )
}

function teacherAction(candidate) {
  return String(candidate.teacherDecision?.action || candidate.action || '').trim()
}

function isOfficialGaokaoSource(candidate) {
  const source = candidate.source || {}
  const text = [
    source.sourceFile,
    source.paper,
    source.groupTitle,
  ].filter(Boolean).join(' ')
  return GAOKAO_SOURCE_RE.test(text) && !NON_GAOKAO_SOURCE_RE.test(text)
}

function validateCandidate(candidate, action) {
  if (!VALID_ACTIONS.has(action)) return `invalid action: ${action || '(blank)'}`
  if (!candidate.allowedActions?.includes?.(action)) return `action not allowed for candidate: ${action}`
  if (!isOfficialGaokaoSource(candidate)) return 'golden cases only allow official Gaokao sources'
  if (action === 'correct_card' && !CARD_RE.test(String(candidate.teacherDecision?.correctedCardId || ''))) {
    return 'correct_card requires teacherDecision.correctedCardId T1-T10'
  }
  if (candidate.teacherDecision?.correctedCardId && !CARD_RE.test(String(candidate.teacherDecision.correctedCardId))) {
    return 'teacherDecision.correctedCardId must be T1-T10 when provided'
  }
  if (action === 'correct_surface' && !String(candidate.teacherDecision?.correctedSurfaceType || '').trim()) {
    return 'correct_surface requires teacherDecision.correctedSurfaceType'
  }
  if (candidate.teacherDecision?.correctedSurfaceType && !VALID_SURFACE_TYPES.has(String(candidate.teacherDecision.correctedSurfaceType).trim())) {
    return 'teacherDecision.correctedSurfaceType must be a valid surfaceQuestion.type enum when provided'
  }
  return ''
}

function finalLabelFromScore(score) {
  if (!score) return ''
  return score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high'
}

function acceptedLabels(candidate, action) {
  const decision = candidate.teacherDecision || {}
  const ai = candidate.aiJudgment || {}
  const tCardId = decision.correctedCardId
    ? String(decision.correctedCardId || '').trim()
    : ai.tCardId || ''
  const surfaceType = decision.correctedSurfaceType
    ? String(decision.correctedSurfaceType || '').trim()
    : ai.surfaceType || ''
  const meta = CARD_META[tCardId] || {}
  const boundaryFlags = Array.isArray(ai.boundaryFlags) ? ai.boundaryFlags : []
  const rawScore = Number(ai.finalScore ?? '')
  const scoreFloor = boundaryFlags.length > 0 && meta.scoreFloor
    ? Math.min(10, meta.scoreFloor + 1)
    : meta.scoreFloor || 0
  const finalScore = Number.isFinite(rawScore)
    ? Math.max(rawScore, scoreFloor)
    : scoreFloor || ''
  const finalLabel = finalLabelFromScore(finalScore) || ai.finalLabel || ''
  const soloLevel = meta.soloLevel || ai.soloLevel || ''

  return {
    surfaceType,
    tCardId,
    boundaryFlags,
    finalScore,
    finalLabel,
    answeringMove: surfaceType === 'example_function' ? 'function_to_argument' : ai.answeringMove || '',
    surfaceScope: surfaceType === 'example_function' ? 'example' : ai.surfaceScope || '',
    soloLevel,
  }
}

function goldenRecord(payload, candidate, action) {
  const decision = candidate.teacherDecision || {}
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    candidateId: candidate.candidateId,
    sourceRunId: payload.runId || '',
    action,
    source: candidate.source || {},
    acceptedLabels: acceptedLabels(candidate, action),
    aiJudgment: candidate.aiJudgment || {},
    evidence: candidate.evidence || {},
    teacherNote: decision.note || '',
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = path.resolve(args.input)
  const outputPath = path.resolve(args.output)
  const payload = readJson(inputPath)
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const existingIds = args.allowDuplicates ? new Set() : readExistingIds(outputPath)
  const records = []
  const errors = []
  let skippedBlank = 0
  let skippedDuplicate = 0

  for (const candidate of candidates) {
    const action = teacherAction(candidate)
    if (!action) {
      skippedBlank += 1
      continue
    }

    const error = validateCandidate(candidate, action)
    if (error) {
      errors.push(`${candidate.candidateId || '(missing candidateId)'}: ${error}`)
      continue
    }

    if (existingIds.has(candidate.candidateId)) {
      skippedDuplicate += 1
      continue
    }

    records.push(goldenRecord(payload, candidate, action))
  }

  if (errors.length > 0) {
    throw new Error(`Invalid teacher decisions:\n${errors.join('\n')}`)
  }

  console.log(`[input] ${inputPath}`)
  console.log(`[output] ${outputPath}`)
  console.log(`[summary] ${JSON.stringify({ ready: records.length, skippedBlank, skippedDuplicate, dryRun: args.dryRun })}`)

  if (records.length > 0) {
    console.log(`[preview]\n${records.slice(0, 3).map((record) => JSON.stringify(record)).join('\n')}`)
  }

  if (args.dryRun || records.length === 0) return
  mkdirSync(path.dirname(outputPath), { recursive: true })
  const existingText = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').replace(/\s*$/, '\n') : ''
  const appendText = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
  writeFileSync(outputPath, `${existingText}${appendText}`)
  console.log(`[written] ${records.length}`)
}

main()
