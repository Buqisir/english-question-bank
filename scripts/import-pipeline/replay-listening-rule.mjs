#!/usr/bin/env node
// Offline replay: existing raw transcripts only; ffmpeg measures pauses but no ASR is run.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LISTENING_SEGMENT_RULE, evaluateListeningEngine, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'
import { assertListeningDiskSpace, parseListeningPauses } from './listening-segment.mjs'

const read = file => JSON.parse(readFileSync(file, 'utf8'))
const evaluation = path.resolve(process.argv[2] || '.scratch/asr-eval-20261020')
const output = path.resolve(process.argv[3] || '.scratch/listening-rule-v2-replay')
mkdirSync(output, { recursive: true })
assertListeningDiskSpace(output)
const rows = read(path.join(evaluation, 'manifest.json'))
const papers = new Map()
const details = []
function raw(file) {
  const data = read(file)
  return { ...data, evidencePaths: [file] }
}
for (const row of rows) {
  if (papers.has(row.paperId)) continue
  const materialization = read(row.sourceFile)
  const paperRows = rows.filter(r => r.paperId === row.paperId)
  const appleWhole = readdirSync(path.join(evaluation, 'apple')).filter(f => /^whole-.*\.json$/u.test(f))
    .map(f => raw(path.join(evaluation, 'apple', f))).filter(r => r.paperId === row.paperId)
  const appleWindows = appleWhole.length ? appleWhole : paperRows.map(r => path.join(evaluation, 'apple', `group-${String(r.index).padStart(2, '0')}.json`))
    .filter(existsSync).map(raw)
  const whisperWhole = readdirSync(evaluation).filter(f => /^whole-\d+\.json$/u.test(f))
    .map(f => raw(path.join(evaluation, f))).filter(r => r.paperId === row.paperId)
  const whisperWindows = whisperWhole.length ? whisperWhole : paperRows.map(r => path.join(evaluation, `group-${String(r.index).padStart(2, '0')}.json`))
    .filter(existsSync).map(raw)
  const silence = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', row.audio,
    '-af', `silencedetect=noise=${LISTENING_SEGMENT_RULE.silenceThresholdDb}dB:d=${LISTENING_SEGMENT_RULE.minimumSilenceSeconds}`,
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const pauses = silence.status === 0 ? parseListeningPauses(silence.stderr, row.durationSeconds) : []
  const input = { groups: materialization.listening.transcript,
    instructions: materialization.sourcePresentation?.instructions || [],
    durationSeconds: row.durationSeconds, pauses }
  const apple = evaluateListeningEngine({ ...input, windows: appleWindows })
  const whisper = evaluateListeningEngine({ ...input, windows: whisperWindows, engine: 'faster-whisper' })
  const failedIds = new Set(apple.groups.filter(g => g.decision !== 'usable').map(g => g.segmentId))
  const resolved = reconcileListeningEngines(apple, { groups: whisper.groups.filter(g => failedIds.has(g.segmentId)) })
  papers.set(row.paperId, { resolved, apple, whisper, coverage: appleWhole.length ? 'whole_recording' : 'selected_crops' })
}
for (const row of rows) {
  const paper = papers.get(row.paperId)
  const group = paper.resolved.find(g => g.segmentId === row.group.segmentId)
  details.push({ index: row.index, paperId: row.paperId, segmentId: row.group.segmentId,
    coverage: paper.coverage, decision: group?.decision || 'review_required',
    expectedReadings: group?.expectedReadings, issues: group?.issues || ['SOURCE_GROUP_MISSING'],
    selectedEngine: group?.selectedEngine,
    apple: paper.apple.groups.find(g => g.segmentId === row.group.segmentId),
    whisper: paper.whisper.groups.find(g => g.segmentId === row.group.segmentId) })
}
const distribution = values => Object.fromEntries(['usable', 'review_required'].map(decision => [decision,
  values.filter(g => g.decision === decision).length]))
const reasonCounts = {}
for (const group of details) for (const issue of group.issues) reasonCounts[issue] = (reasonCounts[issue] || 0) + 1
const report = { rule: LISTENING_SEGMENT_RULE, groups: details.length, papers: papers.size,
  scope: 'offline cached ASR replay, original instructions and full source corpus; selected crops cannot prove missing whole-paper groups',
  previousAppleEvaluation: { usable: 44, partial: 1, unusable: 0 },
  distribution: distribution(details),
  apple: distribution(details.map(g => g.apple)), whisper: distribution(details.map(g => g.whisper)),
  reasonCounts, details }
const target = path.join(output, `replay-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`)
writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify({ report: target, groups: report.groups, papers: report.papers,
  distribution: report.distribution, apple: report.apple, whisper: report.whisper, reasonCounts }, null, 2))
