import { digestJson, exactKeys, sha256 } from './stable.mjs'

export const LISTENING_RULE_EVIDENCE_VERSION = 'listening-rule-evidence-v2'
export const LISTENING_REVIEW_VERSION = 'listening-review-v2'
export const LISTENING_FILE_BUDGET = 64 * 1024 ** 2
export const LISTENING_BUNDLE_BUDGET = 256 * 1024 ** 2

const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key))
  .map(key => [key, value[key]]))
// Deliberately enumerate retained fields. Full observations live only in the
// lossless local diagnostic; a new algorithm field requires an explicit choice.
const groupKeys = ['segmentId', 'questionNumbers', 'engine', 'expectedReadings', 'sources',
  'sourceText', 'sourceProjection', 'decision', 'issue', 'issues', 'notes', 'playback',
  'occurrences', 'anchors', 'anchorEvidence', 'orderEvidence', 'independentlyAnchored',
  'durationRatio', 'durationRatios', 'selectedEngine', 'engineConflicts', 'engineNotes',
  'readingCountEvidence', 'boundaryAdjustments']
const engineKeys = groupKeys.filter(key => !['sourceText', 'sourceProjection', 'sources'].includes(key))
export function summarizeListeningGroup(group) {
  const partial = value => (value.partialOccurrences || []).map(({ words = [], ...range }) => ({
    ...pick(range, ['startSeconds', 'anchorEndSeconds']), wordCount: words.length, wordsSha256: digestJson(words),
  }))
  const windows = value => (value.observedWindows || []).map(window => pick(window,
    ['startSeconds', 'endSeconds', 'evidencePaths']))
  return { ...pick(group, groupKeys), partialOccurrences: partial(group),
    observedWindowBindings: windows(group),
    engineAttempts: (group.engineAttempts || []).map(attempt => ({ ...pick(attempt, engineKeys),
      partialOccurrences: partial(attempt), observedWindowBindings: windows(attempt) })) }
}

export function listeningNavigationGroup(group) {
  return { segmentId: group.segmentId, questionNumbers: group.questionNumbers, decision: group.decision,
    playback: group.playback, occurrences: group.decision === 'usable'
      ? group.occurrences.map(occurrence => ({ ...occurrence.playback, evidencePaths: occurrence.evidencePaths })) : [] }
}

export function listeningAsrWindowsCover(windows, { startSeconds, endSeconds }) {
  let coveredEnd = startSeconds
  for (const window of [...windows].sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (window.startSeconds > coveredEnd) break
    coveredEnd = Math.max(coveredEnd, window.endSeconds)
    if (coveredEnd >= endSeconds) return true
  }
  return false
}

const edgeWordText = text => text.toLowerCase().replace(/\p{P}/gu, '').trim()

const spokenWords = group => (group?.sourceProjection?.text ?? group?.sourceText ?? '')
  .match(/[A-Za-z]+(?:['’][A-Za-z]+)*/gu)?.map(edgeWordText) ?? []

function assertUsableAdjustment(machine, adjusted, asrByPath, windows, neighbors, observedEdges, fail) {
  if (!Array.isArray(adjusted.occurrences) || machine.occurrences.length !== adjusted.occurrences.length) {
    fail(`${machine.segmentId}: usable adjustment must preserve occurrence count`)
  }
  for (const [i, occurrence] of machine.occurrences.entries()) {
    const next = adjusted.occurrences[i]
    const original = occurrence.playback
    const label = `${machine.segmentId} occurrence ${i + 1}`
    if (!(next?.startSeconds <= original.startSeconds && next?.endSeconds >= original.endSeconds)) {
      fail(`${label}: usable adjustment must only widen`)
    }
    // The teacher player uses group playback, which can extend past the occurrences.
    const start = i === 0 ? Math.min(next.startSeconds, adjusted.playback?.startSeconds) : next.startSeconds
    const end = i === machine.occurrences.length - 1
      ? Math.max(next.endSeconds, adjusted.playback?.endSeconds) : next.endSeconds
    if (original.startSeconds - start > 1 + 1e-9 || end - original.endSeconds > 1 + 1e-9) {
      fail(`${label}: usable adjustment cannot widen more than 1 second per edge`)
    }
    const machineWords = occurrence.evidencePaths.flatMap(path => asrByPath.get(path)?.words || [])
    const edges = [
      ['start', { startSeconds: start, endSeconds: original.startSeconds },
        word => word.startBoundary && Math.abs(word.runStartSeconds - occurrence.startSeconds) <= 1e-9],
      ['end', { startSeconds: original.endSeconds, endSeconds: end },
        word => word.endBoundary && Math.abs(word.runEndSeconds - occurrence.endSeconds) <= 1e-9],
    ]
    for (const [side, extension, atMachineEdge] of edges) {
      if (!(extension.startSeconds < extension.endSeconds)) continue
      if (!listeningAsrWindowsCover(windows, extension)) {
        fail(`${label} ${side}: ASR evidence does not cover the widened range`)
      }
      const boundaryWords = new Set(machineWords.filter(atMachineEdge).map(word => edgeWordText(word.expressionText)))
      const [boundaryWord] = boundaryWords
      const echo = boundaryWords.size === 1 && boundaryWord && !/\s/u.test(boundaryWord) ? boundaryWord : null
      const overlaps = span => span.endSeconds > span.startSeconds
        ? Math.max(span.startSeconds, extension.startSeconds) < Math.min(span.endSeconds, extension.endSeconds)
        : side === 'end'
          ? span.startSeconds > extension.startSeconds && span.startSeconds <= extension.endSeconds
          : span.startSeconds >= extension.startSeconds && span.startSeconds < extension.endSeconds
      const source = spokenWords(machine)
      const ownWords = side === 'end' ? source.slice(-2) : source.slice(0, 2)
      const neighbor = side === 'end' ? spokenWords(neighbors.next)[0] : spokenWords(neighbors.previous).at(-1)
      const judged = observedEdges[side].filter(word => ownWords.includes(edgeWordText(word.text)))
      for (const [path, { words, speech }] of asrByPath) {
        const conflicts = (span, text) => {
          const token = edgeWordText(text)
          if (!overlaps(span)) return false
          if (token === 'text') return true
          if (token === echo && token !== neighbor) return false
          if (judged.some(word => word.path === path && edgeWordText(word.text) === token
            && word.startSeconds <= span.startSeconds && word.endSeconds >= span.endSeconds)) return false
          // A cropped window can report a different word within the same spoken syllables.
          // Only independent, timed source words can account for that part of the extension.
          if (token === neighbor || !/^[a-z]+$/u.test(token)) return true
          const corroborating = judged.filter(word => word.path !== path)
          if (span.startSeconds === span.endSeconds) return !corroborating.some(word =>
            word.startSeconds <= span.startSeconds && span.endSeconds <= word.endSeconds)
          return !listeningAsrWindowsCover(corroborating, {
            startSeconds: Math.max(span.startSeconds, extension.startSeconds),
            endSeconds: Math.min(span.endSeconds, extension.endSeconds),
          })
        }
        if (words.some(word => conflicts(word, word.expressionText))
          || speech.some(span => conflicts(span, span.text))) {
          fail(`${label} ${side}: widened range contains other speech`)
        }
      }
    }
  }
}

export function assertListeningRuleEvidence(value, review, transcript, asrByPath = new Map()) {
  const fail = detail => { throw new Error(`Listening rule evidence: ${detail}`) }
  const allWindows = review.evidence.filter(file => file.kind === 'asr_window')
  // A supplemental window cited by the agent provides word times without rerunning the machine decision.
  const machinePaths = new Set(value?.rawEvidence?.map?.(file => file.path))
  const cited = new Set(review.method === 'agent_asr_comparison' ? review.groups.flatMap(group =>
    Object.values(group.boundaryJudgment ?? {}).flatMap(edge => edge?.words?.map?.(word => word.evidencePath) ?? [])) : [])
  if (!exactKeys(value, ['schemaVersion', 'rule', 'normalization', 'input', 'rawEvidence', 'groups', 'diagnostic'])
    || value.schemaVersion !== LISTENING_RULE_EVIDENCE_VERSION
    || !value.rule?.version || !value.rule?.normalizationVersion || !value.normalization
    || digestJson(value.input?.subject) !== digestJson(review.subject)
    || !Array.isArray(value.groups) || value.groups.length !== review.groups.length
    || !Array.isArray(value.rawEvidence)
    || digestJson(value.rawEvidence) !== digestJson(allWindows.filter(file => machinePaths.has(file.path) || !cited.has(file.path)))) {
    fail('invalid version, input or raw evidence binding')
  }
  for (const key of ['sourceTextSha256', 'materializationSha256', 'audioSha256',
    'silenceSha256', 'ruleCodeSha256', 'adapterSha256', 'instructionsSha256', 'questionsSha256']) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value.input[key] || '')) fail(`missing ${key}`)
  }
  if (value.input.audioSha256 !== review.subject.playbackAudioSha256
    || value.input.sourceTextSha256 !== sha256(JSON.stringify(transcript))
    || digestJson(value.rule) !== digestJson(value.input.rule)
    || digestJson(value.normalization) !== digestJson(value.input.normalization)) fail('inconsistent rule/input binding')
  const windows = value.rawEvidence.map(file => file.window)
  for (const [i, group] of value.groups.entries()) {
    if (group.segmentId !== review.groups[i].segmentId
      || group.sourceText !== transcript.find(source => source.segmentId === group.segmentId)?.text
      || digestJson(group.questionNumbers) !== digestJson(review.groups[i].questionNumbers)
      || !['usable', 'blocked', 'review_required'].includes(group.decision)
      || !Array.isArray(group.issues) || !Array.isArray(group.engineAttempts)
      || Object.keys(group).some(key => ![...groupKeys, 'partialOccurrences', 'observedWindowBindings', 'engineAttempts'].includes(key))
      || group.engineAttempts.some(attempt => Object.keys(attempt).some(key =>
        ![...engineKeys, 'partialOccurrences', 'observedWindowBindings'].includes(key)))) fail('invalid group summary')
    const differs = review.method !== 'audio_source_comparison'
      && digestJson(listeningNavigationGroup(group)) !== digestJson(pick(review.groups[i],
      ['segmentId', 'questionNumbers', 'decision', 'playback', 'occurrences']))
    if (differs && (review.method === 'asr_source_comparison'
      || (review.method === 'agent_asr_comparison' && group.decision === 'blocked'))) fail('navigation differs from rule')
    if (review.method === 'agent_asr_comparison'
      && (differs || Object.hasOwn(review.groups[i], 'boundaryJudgment'))) {
      const observedEdges = { start: [], end: [] }
      const basis = review.groups[i].boundaryJudgment
      const nonempty = text => typeof text === 'string' && text.trim().length > 0
      if (!exactKeys(basis, ['start', 'end'])) fail('missing agent ASR boundary basis')
      for (const [side, edge] of Object.entries(basis)) {
        if (!exactKeys(edge, ['sourceText', 'words']) || !nonempty(edge.sourceText)
          || !Array.isArray(edge.words) || !edge.words.length) fail('missing agent ASR boundary basis')
        for (const word of edge.words) {
          if (!exactKeys(word, ['text', 'startSeconds', 'endSeconds', 'evidencePath'])
            || !nonempty(word.text) || !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds)
            || word.startSeconds < 0 || word.endSeconds <= word.startSeconds
            || word.endSeconds > review.subject.durationSeconds
            || !review.evidence.some(file => file.kind === 'asr_window' && file.path === word.evidencePath)) {
            fail('invalid agent ASR boundary basis')
          }
          const nearby = side === 'start' ? word.startSeconds - review.groups[i].playback?.startSeconds
            : review.groups[i].playback?.endSeconds - word.endSeconds
          const observed = asrByPath.get(word.evidencePath)?.words.find(observed => observed.rawRunText === word.text
            && Math.abs(observed.runStartSeconds - word.startSeconds) <= 0.05 + 1e-9
            && Math.abs(observed.runEndSeconds - word.endSeconds) <= 0.05 + 1e-9)
          if (!(nearby >= 0 && nearby <= 1.5) || !observed) fail('agent ASR boundary word missing or far from playback')
          observedEdges[side].push({ text: word.text, path: word.evidencePath,
            startSeconds: observed.runStartSeconds, endSeconds: observed.runEndSeconds })
        }
      }
      if (differs && group.decision === 'usable') assertUsableAdjustment(group, review.groups[i], asrByPath, windows,
        { previous: value.groups[i - 1], next: value.groups[i + 1] }, observedEdges, fail)
    }
  }
  const d = value.diagnostic
  if (!exactKeys(d, ['schemaVersion', 'path', 'encoding', 'sha256', 'byteLength', 'decodedSha256', 'decodedByteLength'])
    || d.schemaVersion !== 'listening-diagnostics-v1' || d.path !== 'diagnostics.json.gz' || d.encoding !== 'gzip'
    || ![d.sha256, d.decodedSha256].every(hash => /^sha256:[a-f0-9]{64}$/.test(hash || ''))
    || ![d.byteLength, d.decodedByteLength].every(n => Number.isSafeInteger(n) && n > 0)) fail('invalid local diagnostic descriptor')
  return value
}

export function assertListeningUploadBudget(files) {
  let total = 0
  for (const file of files) {
    if (!Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || file.byteLength > LISTENING_FILE_BUDGET) {
      throw new Error(`IMPORT_REVIEW_SIZE_INVALID: ${file.path} (${file.byteLength} bytes; max ${LISTENING_FILE_BUDGET})`)
    }
    total += file.byteLength
  }
  if (total > LISTENING_BUNDLE_BUDGET) throw new Error(`IMPORT_REVIEW_SIZE_INVALID: bundle ${total} bytes; max ${LISTENING_BUNDLE_BUDGET}`)
}
