#!/usr/bin/env node
// Offline replay: existing raw transcripts only; ffmpeg measures pauses but no ASR is run.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LISTENING_SEGMENT_RULE, evaluateListeningEngine, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'
import { assertListeningDiskSpace, parseListeningPauses } from './listening-segment.mjs'
import { listeningReplayDistributions, replayOrderProjection } from './lib-listening-replay.mjs'

const read = file => JSON.parse(readFileSync(file, 'utf8'))
const evaluation = path.resolve(process.argv[2] || '.scratch/asr-eval-20261020')
const output = path.resolve(process.argv[3] || '.scratch/listening-rule-v2-replay')
const fuzzyAnchors = process.argv.includes('--no-fuzzy-anchors') ? false
  : process.argv.includes('--fuzzy-anchors') ? true : LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled
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
  // The benchmark is 45 selected group crops. Supplemental whole recordings
  // belong to E2E, and must not silently change these samples' evidence scope.
  const appleWindows = paperRows.map(r => path.join(evaluation, 'apple', `group-${String(r.index).padStart(2, '0')}.json`))
    .filter(existsSync).map(raw)
  const whisperWindows = paperRows.map(r => path.join(evaluation, `group-${String(r.index).padStart(2, '0')}.json`))
    .filter(existsSync).map(raw)
  const silence = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', row.audio,
    '-af', `silencedetect=noise=${LISTENING_SEGMENT_RULE.silenceThresholdDb}dB:d=${LISTENING_SEGMENT_RULE.minimumSilenceSeconds}`,
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const pauses = silence.status === 0 ? parseListeningPauses(silence.stderr, row.durationSeconds) : []
  const input = { groups: materialization.listening.transcript,
    questions: materialization.listening.questions, fuzzyAnchors,
    instructions: materialization.sourcePresentation?.instructions || [],
    durationSeconds: row.durationSeconds, pauses }
  const apple = evaluateListeningEngine({ ...input, windows: appleWindows })
  const whisper = evaluateListeningEngine({ ...input, windows: whisperWindows, engine: 'faster-whisper' })
  const failedIds = new Set(apple.groups.filter(g => replayOrderProjection(g).decision !== 'usable').map(g => g.segmentId))
  const resolved = reconcileListeningEngines(apple, { groups: whisper.groups.filter(g => failedIds.has(g.segmentId)) })
  papers.set(row.paperId, { resolved, apple, whisper, coverage: 'selected_crops' })
}
for (const row of rows) {
  const paper = papers.get(row.paperId)
  const group = paper.resolved.find(g => g.segmentId === row.group.segmentId)
  details.push({ index: row.index, paperId: row.paperId, segmentId: row.group.segmentId,
    coverage: paper.coverage, decision: group?.decision || 'review_required',
    replayProjection: group ? replayOrderProjection(group) : null,
    expectedReadings: group?.expectedReadings, issues: group?.issues || ['SOURCE_GROUP_MISSING'],
    selectedEngine: group?.selectedEngine, engineConflicts: group?.engineConflicts,
    apple: paper.apple.groups.find(g => g.segmentId === row.group.segmentId),
    whisper: paper.whisper.groups.find(g => g.segmentId === row.group.segmentId) })
}
const distribution = values => Object.fromEntries(['usable', 'review_required'].map(decision => [decision,
  values.filter(g => g.decision === decision).length]))
const reasonCounts = {}
for (const group of details) for (const issue of group.issues) reasonCounts[issue] = (reasonCounts[issue] || 0) + 1
const report = { rule: { ...LISTENING_SEGMENT_RULE, fuzzyAnchorsEnabled: fuzzyAnchors }, groups: details.length, papers: papers.size,
  scope: '45 cached group crops only; order unavailable is a non-failure statistical status; no import sidecar or playback approval is emitted',
  previousAppleEvaluation: { usable: 44, partial: 1, unusable: 0 },
  distributions: listeningReplayDistributions(details),
  distribution: distribution(details.map(g => g.replayProjection)),
  apple: distribution(details.map(g => g.apple)), whisper: distribution(details.map(g => g.whisper)),
  reasonCounts, details }
const target = path.join(output, `replay-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`)
writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify({ report: target, groups: report.groups, papers: report.papers,
  distributions: report.distributions, apple: report.apple, whisper: report.whisper, reasonCounts }, null, 2))
