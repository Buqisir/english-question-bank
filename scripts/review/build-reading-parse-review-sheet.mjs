#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--input') {
      args.input = next || ''
      index += 1
    } else if (arg === '--output') {
      args.output = next || ''
      index += 1
    }
  }

  if (!args.input) throw new Error('Usage: node scripts/review/build-reading-parse-review-sheet.mjs --input <review-candidates.json> [--output <review-sheet.md>]')
  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function defaultOutputPath(payload, inputPath) {
  const runId = payload.runId || path.basename(inputPath).replace(/^reading-parse-review-candidates-/, '').replace(/\.json$/i, '')
  return path.join(process.cwd(), 'reports', `reading-parse-review-sheet-${runId}.md`)
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function truncate(value, max = 520) {
  const text = oneLine(value)
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function tableCell(value) {
  return oneLine(value).replace(/\|/g, '\\|')
}

function suggestedDecision(candidate) {
  if (candidate.suggestedAction === 'correct_surface') {
    return `correct_surface → ${candidate.suggestedCorrection?.surfaceType || '(fill surfaceType)'}`
  }
  if (candidate.suggestedAction === 'correct_card') {
    return `correct_card → ${candidate.suggestedCorrection?.tCardId || '(fill tCardId)'}`
  }
  return 'accept'
}

function labelSummary(candidate) {
  const ai = candidate.aiJudgment || {}
  const flags = Array.isArray(ai.boundaryFlags) && ai.boundaryFlags.length > 0 ? ` flags=${ai.boundaryFlags.join('|')}` : ''
  return `${ai.surfaceType || '-'} / ${ai.answeringMove || '-'} / ${ai.tCardId || '-'} / score=${ai.finalScore ?? '-'}${flags}`
}

function detailBlock(candidate, index) {
  const source = candidate.source || {}
  const ai = candidate.aiJudgment || {}
  const evidence = candidate.evidence || {}
  const decision = suggestedDecision(candidate)
  const status = ai.reviewNeeded ? 'reviewNeeded=true' : 'reviewNeeded=false'

  return [
    `### ${index}. ${source.paper || ''} ${source.passage || ''} Q${source.questionNo || ''}`,
    '',
    `- 建议确认：\`${decision}\``,
    `- 候选ID：\`${candidate.candidateId}\``,
    `- 题干：${source.stem || ''}`,
    `- 答案：${source.answer || ''}`,
    `- AI 标签：${labelSummary(candidate)}；confidence=${ai.confidence ?? '-'}；${status}`,
    `- 题型说明：${ai.questionType || ''}`,
    `- suspicious：${evidence.suspiciousReason || 'none'}`,
    `- sourceExpression：${truncate(evidence.sourceExpression, 900) || 'none'}`,
    `- optionExpression：${truncate(evidence.optionExpression, 500) || 'none'}`,
    `- reason：${truncate(evidence.reason, 700) || 'none'}`,
    `- boundaryCheck：${truncate(evidence.boundaryCheck, 700) || 'none'}`,
    '',
    '确认填写：',
    '',
    '```json',
    JSON.stringify({
      action: candidate.suggestedAction,
      correctedCardId: candidate.suggestedAction === 'correct_card' ? candidate.suggestedCorrection?.tCardId || '' : '',
      correctedSurfaceType: candidate.suggestedAction === 'correct_surface' ? candidate.suggestedCorrection?.surfaceType || '' : '',
      note: '',
    }, null, 2),
    '```',
    '',
  ].join('\n')
}

function buildMarkdown(payload) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const lines = [
    '# Reading Parse Review Sheet',
    '',
    `- runId: \`${payload.runId || ''}\``,
    `- sourceReport: \`${payload.sourceReport || ''}\``,
    `- candidates: ${candidates.length}`,
    '- golden policy: only official Gaokao true-paper questions may be confirmed into golden JSONL.',
    '',
    '## Summary',
    '',
    '| # | 建议 | 来源 | Q | 题干 | AI标签 | 风险 |',
    '|---:|---|---|---:|---|---|---|',
  ]

  candidates.forEach((candidate, index) => {
    const source = candidate.source || {}
    const evidence = candidate.evidence || {}
    lines.push(`|${[
      index + 1,
      tableCell(suggestedDecision(candidate)),
      tableCell(`${source.paper || ''} ${source.passage || ''}`),
      tableCell(source.questionNo || ''),
      tableCell(truncate(source.stem, 120)),
      tableCell(labelSummary(candidate)),
      tableCell(truncate(evidence.suspiciousReason || evidence.driftCategory || 'manual review', 120)),
    ].join('|')}|`)
  })

  lines.push('', '## Details', '')
  candidates.forEach((candidate, index) => {
    lines.push(detailBlock(candidate, index + 1))
  })

  return `${lines.join('\n')}\n`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = path.resolve(args.input)
  const payload = readJson(inputPath)
  const outputPath = path.resolve(args.output || defaultOutputPath(payload, inputPath))
  const markdown = buildMarkdown(payload)

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, markdown)
  console.log(`[review-sheet] ${outputPath}`)
}

main()
