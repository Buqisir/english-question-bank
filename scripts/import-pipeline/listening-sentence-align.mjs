#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  expectedListeningReadings, listeningAsrTokens, normalizeListeningText, projectListeningSpokenText,
} from './lib-listening-segment-rule.mjs'

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const midpoint = word => (word.startSeconds + word.endSeconds) / 2
const byTime = (a, b) => midpoint(a) - midpoint(b)
const epsilon = 1e-6
const compactInitials = text => text.replace(/\b(?:[A-Z]\.){2,}(?=\b|[^A-Za-z]|$)/gu, initials => initials.replaceAll('.', ''))

function splitSentences(material, corpus, lineTurns) {
  const { sourceText, exclusions } = projectListeningSpokenText(material, corpus)
  // Preserve JavaScript string indices even when a masked span contains a surrogate pair.
  const chars = sourceText.split('')
  for (const { start, end } of exclusions) {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' '
  }
  const text = chars.join('').replace(/^[ \t]*【[^】\n]+】[ \t]*$/gmu, note => ' '.repeat(note.length))
  const speakers = [...sourceText.matchAll(/(?:^|[\s])((?:[A-Z]\d?|Speaker \d+|Man|Woman)):\s*/gu)]
    .map(match => ({ speaker: match[1], start: match.index + match[0].indexOf(match[1]), end: match.index + match[0].length }))
  const sentences = []
  let start = 0
  let speaker = null
  for (const label of [...speakers, { start: text.length }]) {
    const turn = text.slice(start, label.start)
    const protectedPeriods = new Set()
    for (const abbreviation of turn.matchAll(/\b(?:(Mr|Mrs|Ms|Dr|Prof|St|Mt|Gov)\.|(?:[A-Za-z]\.){2,})/gu)) {
      const following = turn.slice(abbreviation.index + abbreviation[0].length)
      const continues = /^(?:[’'][a-z]|[ \t]*[,:;]|[ \t]+[a-z])/u
        .test(following)
      const title = Boolean(abbreviation[1])
      const acronymBeforeName = /^(?:[A-Z]\.){2,}$/u.test(abbreviation[0]) && /^[ \t]+[A-Z]/u.test(following)
      for (const period of abbreviation[0].matchAll(/\./gu)) {
        if (period.index < abbreviation[0].length - 1 || continues || title || acronymBeforeName) {
          protectedPeriods.add(abbreviation.index + period.index)
        }
      }
    }
    let from = 0
    const append = end => {
      const spoken = turn.slice(from, end)
      const begin = from + spoken.length - spoken.trimStart().length
      const finish = from + spoken.trimEnd().length
      const tokens = normalizeListeningText(compactInitials(turn.slice(begin, finish)))
      if (tokens.length) sentences.push({ speaker, en: sourceText.slice(start + begin, start + finish),
        utf16Start: start + begin, utf16End: start + finish, tokens,
        wordCount: (turn.slice(begin, finish).match(/(?:[a-z]\.){2,}|\d+(?:[.,:]\d+)*[a-z]*|[a-z]+(?:['’][a-z]+)*/giu) ?? []).length })
      from = end
    }
    const boundaries = lineTurns ? /[.!?]+["'’”)\]]*|\n/gu : /[.!?]+["'’”)\]]*/gu
    for (const mark of turn.matchAll(boundaries)) {
      if (mark[0] === '\n') {
        append(mark.index + 1)
        continue
      }
      if (mark[0][0] === '.' && (protectedPeriods.has(mark.index)
        || (/\d/u.test(turn[mark.index - 1] ?? '') && /\d/u.test(turn[mark.index + 1] ?? '')))) continue
      const end = mark.index + mark[0].length
      if (/["'’”]$/u.test(mark[0]) && /^[ \t]+[a-z]/u.test(turn.slice(end))) continue
      if (end === turn.length || /\s/u.test(turn[end])) append(end)
    }
    append(turn.length)
    start = label.end
    speaker = label.speaker
  }
  return sentences
}

function appleRuns(run) {
  const words = [...run.text.matchAll(/\S+/gu)]
  if (words.length <= 1) return [run]
  const span = run.end - run.start
  return words.map(word => ({
    text: word[0],
    start: run.start + span * word.index / run.text.length,
    end: run.start + span * (word.index + word[0].length) / run.text.length,
  }))
}

function mergeDottedInitials(words) {
  const merged = []
  for (const word of words) {
    const raw = word.rawRunText.trim()
    if (!/^(?:[A-Z]\.){2,}(?:['’]s)?[!?,;:]?$/u.test(raw)) {
      merged.push(word)
      continue
    }
    if (merged.at(-1)?.runId === word.runId) merged.at(-1).endSeconds = word.endSeconds
    else merged.push({ ...word, token: normalizeListeningText(compactInitials(raw))[0] })
  }
  return merged
}

function readAsr(appleWindow, whisperWindows) {
  const segments = (appleWindow?.result?.segments ?? appleWindow?.segments ?? []).map(segment => ({
    ...segment,
    runs: (segment.runs?.length ? segment.runs : [segment]).flatMap(appleRuns),
  }))
  const apple = mergeDottedInitials(listeningAsrTokens(segments.length ? [{ ...appleWindow,
    endSeconds: appleWindow.endSeconds ?? segments.at(-1)?.end, result: { segments } }] : []).words)
    .map(word => ({ ...word, approx: true }))
  const whisperInput = whisperWindows.map(window => ({
    ...window,
    result: { segments: (window.result?.segments ?? window.segments ?? [])
      .map(segment => ({ ...segment, runs: segment.words ?? [] })) },
  }))
  const { words, observedWindows } = listeningAsrTokens(whisperInput)
  const whisper = mergeDottedInitials(words)
  const coverage = observedWindows.filter(window => window.words.length)
  const hybrid = [...whisper, ...apple.filter(word => !coverage.some(window =>
    midpoint(word) >= window.startSeconds && midpoint(word) < window.endSeconds))].sort(byTime)
  return { apple, whisper, hybrid, coverage }
}

// Semi-global variant of the segment rule's edit DP. Unmatched ASR at the
// outer edges is free. Equal-cost paths prefer more exact timed anchors.
function align(source, words, sentenceStarts, seamRow = null) {
  const scale = source.length + 1
  const joined = (a, b) => (a + b).replaceAll('-', '')
  const sourceTokens = source.map(token => joined(token, ''))
  const asrTokens = words.map(word => joined(word.token, ''))
  const sourcePairs = source.map((token, i) => i && !sentenceStarts.has(i) ? joined(source[i - 1], token) : null)
  const asrPairs = words.map((word, i) => i ? joined(words[i - 1].token, word.token) : null)
  const trace = [new Uint8Array(words.length + 1)]
  const ties = seamRow === null ? null : [new Uint8Array(words.length + 1)]
  let previous = new Int32Array(words.length + 1)
  let twoRowsBack
  for (let i = 1; i <= source.length; i++) {
    const row = new Int32Array(words.length + 1)
    const moves = new Uint8Array(words.length + 1)
    const tiedMoves = ties && new Uint8Array(words.length + 1)
    row[0] = i * scale
    moves[0] = 1
    if (tiedMoves) tiedMoves[0] = 1 << 1
    for (let j = 1; j <= words.length; j++) {
      const costs = [previous[j - 1] + (source[i - 1] === words[j - 1].token ? -1 : scale),
        previous[j] + scale, row[j - 1] + scale]
      costs.push(sourcePairs[i - 1] === asrTokens[j - 1] ? twoRowsBack[j - 1] - 2 : Infinity,
        sourceTokens[i - 1] === asrPairs[j - 1] ? previous[j - 2] - 1 : Infinity)
      row[j] = Math.min(...costs)
      moves[j] = costs.indexOf(row[j])
      if (tiedMoves) tiedMoves[j] = costs.reduce((mask, cost, move) =>
        cost === row[j] ? mask | (1 << move) : mask, 0)
    }
    trace.push(moves)
    ties?.push(tiedMoves)
    twoRowsBack = previous
    previous = row
  }
  const matched = Array(source.length).fill(null)
  const insertions = new Map()
  let j = previous.reduce((best, cost, index) => cost < previous[best] ? index : best, 0)
  const seamIndex = ties && uniqueSeamIndex(ties, previous, previous[j], seamRow)
  let i = source.length
  while (i > 0) {
    switch (trace[i][j]) {
      case 0:
        if (source[i - 1] === words[j - 1].token) matched[i - 1] = words[j - 1]
        i--
        j--
        break
      case 1:
        i--
        break
      case 2:
        if (!insertions.has(i)) insertions.set(i, [])
        insertions.get(i).push(words[--j])
        break
      case 3: {
        // Both source words share the observed ASR span.
        const word = words[--j]
        matched[--i] = word
        matched[--i] = word
        break
      }
      case 4: {
        const first = words[j - 2], last = words[j - 1]
        matched[--i] = { startSeconds: first.startSeconds, endSeconds: last.endSeconds,
          approx: first.approx || last.approx }
        j -= 2
        break
      }
    }
  }
  for (const inserted of insertions.values()) inserted.reverse()
  return { matched, insertions, seamIndex }
}

function uniqueSeamIndex(ties, finalCosts, bestCost, seamRow) {
  // Walk every optimal path back to the transition that enters the seam row.
  // A tie wholly within either reading need not change the split.
  const columns = finalCosts.length
  const offsets = [columns + 1, columns, 1, 2 * columns + 1, columns + 2]
  const pending = []
  finalCosts.forEach((cost, j) => { if (cost === bestCost) pending.push((ties.length - 1) * columns + j) })
  const visited = new Set()
  let seam
  while (pending.length) {
    const cell = pending.pop()
    if (visited.has(cell)) continue
    visited.add(cell)
    const i = Math.floor(cell / columns), j = cell % columns
    const mask = ties[i][j]
    if (i === seamRow && (mask & ~(1 << 2))) {
      if (seam !== undefined && seam !== j) return null
      seam = j
    }
    for (const [move, offset] of offsets.entries()) {
      if ((mask & (1 << move)) && (i > seamRow || move === 2)) pending.push(cell - offset)
    }
  }
  return seam ?? null
}

function wordsIn(words, { startSeconds, endSeconds }) {
  return words.filter(word => midpoint(word) >= startSeconds && midpoint(word) < endSeconds)
}

function passBounds(group, count, source, sentenceStarts, words) {
  const playback = group?.playback
  if (!playback || !Number.isFinite(playback.startSeconds) || !Number.isFinite(playback.endSeconds)
    || playback.startSeconds >= playback.endSeconds || !Number.isInteger(count) || count < 1) return []
  if (group.occurrences?.length === count) {
    return group.occurrences.every(({ startSeconds, endSeconds }, i, all) =>
      startSeconds >= (all[i - 1]?.endSeconds ?? playback.startSeconds)
      && startSeconds < endSeconds && endSeconds <= playback.endSeconds) ? group.occurrences : []
  }
  if (count === 1) return [playback]
  if (count !== 2 || !source.length) return []
  const repeatedStarts = new Set([...sentenceStarts, ...[...sentenceStarts].map(start => start + source.length)])
  const observed = wordsIn(words, playback)
  const { seamIndex } = align([...source, ...source], observed, repeatedStarts, source.length)
  if (seamIndex === null) return []
  const tail = observed[seamIndex - 1], head = observed[seamIndex]
  if (!tail || !head || tail.endSeconds > head.startSeconds) return []
  const seam = (tail.endSeconds + head.startSeconds) / 2
  return [{ ...playback, endSeconds: seam }, { ...playback, startSeconds: seam }]
}

function interpolate(words) {
  // Interpolate only internal holes. A sentence-edge hole must not claim the
  // silence between two sentences, even if the next sentence has an anchor.
  const timed = [...words]
  let left = -1
  for (let right = 0; right < timed.length; right++) {
    if (!timed[right]) continue
    const missing = right - left - 1
    if (left >= 0 && missing >= 1 && missing <= 2) {
      const start = timed[left].endSeconds
      const gap = timed[right].startSeconds - start
      if (gap > 0 && gap <= 1) {
        for (let i = 1; i <= missing; i++) timed[left + i] = {
          startSeconds: start + gap * (i - 1) / missing, endSeconds: start + gap * i / missing, approx: true,
        }
      }
    }
    left = right
  }
  return timed.filter(Boolean)
}

function interpolateSentenceTimes(timings, bounds, reasons, pass) {
  for (let first = 0; first < timings.length;) {
    if (timings[first].start !== null) {
      first++
      continue
    }
    let next = first + 1
    while (next < timings.length && timings[next].start === null) next++
    const count = next - first
    const start = timings[first - 1]?.end ?? bounds.startSeconds
    const end = timings[next]?.start ?? bounds.endSeconds
    // Adjacent missing sentences share one gap without overlapping each other.
    const duration = (end - start) / count
    const label = `pass ${pass}, sentences ${first + 1}–${next}`
    if (count > 2) reasons.add(`${label}: more than two consecutive interpolations`)
    else if (duration < 0.3 - epsilon || duration > 8 + epsilon) {
      reasons.add(`${label}: interpolated duration outside 0.3–8 seconds`)
    } else {
      for (let i = first; i < next; i++) {
        Object.assign(timings[i], { start: start + (i - first) * duration,
          end: i === next - 1 ? end : start + (i + 1 - first) * duration, approx: true, interpolated: true })
      }
    }
    first = next
  }
}

function alignPass(source, sentences, sentenceStarts, bounds, words, reasons, pass) {
  const { matched } = align(source, wordsIn(words, bounds), sentenceStarts)
  const matchRate = matched.filter(Boolean).length / Math.max(1, source.length)
  if (matchRate < 0.8) reasons.add(`pass ${pass}: match below 80%`)
  let offset = 0
  let lastEnd = bounds.startSeconds
  const timings = sentences.map(({ tokens, wordCount }, index) => {
    const anchors = matched.slice(offset, offset + tokens.length)
    offset += tokens.length
    const sentenceRate = anchors.filter(Boolean).length / tokens.length
    if (sentenceRate < (wordCount <= 3 ? 1 : 0.7)) {
      return { start: null, end: null, matchRate: sentenceRate, approx: false }
    }
    const label = `pass ${pass}, sentence ${index + 1}`
    const timed = interpolate(anchors)
    const start = timed[0]?.startSeconds ?? null
    const end = timed.at(-1)?.endSeconds ?? null
    if (start !== null) {
      if (timed.some(word => word.startSeconds < bounds.startSeconds - epsilon
        || word.endSeconds > bounds.endSeconds + epsilon)) reasons.add(`${label}: outside pass`)
      if (start < lastEnd - epsilon || start >= end || timed.some((word, i) => i > 0
        && (word.startSeconds < timed[i - 1].startSeconds - epsilon
          || word.endSeconds < timed[i - 1].endSeconds - epsilon))) reasons.add(`${label}: nonmonotonic time`)
      lastEnd = end
    }
    return { start, end, matchRate: sentenceRate, approx: timed.some(word => word.approx === true) }
  })
  interpolateSentenceTimes(timings, bounds, reasons, pass)
  for (const [i, timing] of timings.entries()) {
    if (timing.start === null || timing.end - timing.start >= 0.35) continue
    const end = Math.min(timing.start + 0.35, timings[i + 1]?.start ?? bounds.endSeconds)
    if (end - timing.start >= 0.35 - epsilon) timing.end = end
  }
  return { matchRate, timings }
}

function gapCandidates(source, sentenceStarts, bounds, { apple, whisper }) {
  const left = align(source, wordsIn(whisper, bounds), sentenceStarts).insertions
  const right = align(source, wordsIn(apple, bounds), sentenceStarts).insertions
  const raw = words => [...new Map(words.map(word => [word.runId, word.rawRunText.trim()])).values()].join(' ')
  return [...left].flatMap(([sourceIndex, words]) => {
    const other = right.get(sourceIndex)
    if (sourceIndex === source.length || !other || words.length !== other.length
      || words.some((word, i) => word.token !== other[i].token
        || Math.abs(midpoint(word) - midpoint(other[i])) > 0.5)) return []
    return [{ sourceIndex, before: source.slice(Math.max(0, sourceIndex - 5), sourceIndex),
      after: source.slice(sourceIndex, sourceIndex + 5), start: words[0].startSeconds, end: words.at(-1).endSeconds,
      whisper: raw(words), apple: raw(other) }]
  })
}

export function listeningSentenceTargets(document) {
  const materials = document.materials?.map(material => ({ ...material, text: material.transcript,
    segmentId: material.segmentId ?? material.materialId ?? material.id })) ?? document.listening.transcript
  return materials.map(material => ({
    material,
    // The materialization export stores each transcript utterance on its own line.
    sentences: splitSentences(material, materials, !document.materials).map((sentence, index) =>
      ({ id: `${material.segmentId}:${index + 1}`, ...sentence })),
  }))
}

function alignMaterial({ material, sentences }, review, instructions, asr, gaps, words = asr.hybrid) {
  const { segmentId, materialId = material.id ?? segmentId } = material
  const source = []
  const sentenceStarts = new Set()
  for (const { tokens } of sentences) {
    sentenceStarts.add(source.length)
    source.push(...tokens)
  }
  const group = review.groups.find(item => item.segmentId === segmentId)
  const questionNumbers = material.questionNumbers ?? group?.questionNumbers ?? []
  const { expectedReadings } = expectedListeningReadings({ ...material, questionNumbers }, instructions)
  let passCount = expectedReadings
  if (passCount === 'unknown' && group?.occurrences?.length > 1) {
    passCount = group.occurrences.length
  } else if (passCount === 'unknown' && group?.occurrences?.length === 1) {
    // One sealed playback interval can contain both readings.
    const observed = group.reason?.match(/^listening-segment-rule-v8：原文为准，观察遍数 ([12])，/u)?.[1]
    if (observed) passCount = Number(observed)
  }
  const bounds = passBounds(group, passCount, source, sentenceStarts, words)
  const reasons = new Set()
  if (!words.length || (group?.playback && !wordsIn(words, group.playback).length)) {
    reasons.add('word-level ASR unavailable')
  }
  else if (!bounds.length) reasons.add('pass boundaries unavailable')
  const passes = bounds.map((bound, i) => {
    const pass = i + 1
    if (!asr.apple.length) {
      let coveredThrough = bound.startSeconds
      for (const window of asr.coverage) {
        if (window.startSeconds <= coveredThrough + epsilon) coveredThrough = Math.max(coveredThrough, window.endSeconds)
      }
      if (coveredThrough < bound.endSeconds - epsilon) reasons.add('word-level ASR unavailable')
    }
    gaps?.push(...gapCandidates(source, sentenceStarts, bound, asr)
      .map(candidate => ({ materialId, segment: segmentId, pass, ...candidate })))
    return alignPass(source, sentences, sentenceStarts, bound, words, reasons, pass)
  })
  if (passes.length === 2 && passes[1].timings[0]?.start < passes[0].timings.at(-1)?.end) {
    reasons.add('pass 2 starts before pass 1 ends')
  }
  for (const { timings } of passes) for (const [index, timing] of timings.entries()) {
    if (timing.start === null) continue
    timing.start = Number(timing.start.toFixed(2))
    timing.end = Number(timing.end.toFixed(2))
    if (timing.start >= timing.end || timing.start < timings[index - 1]?.end) {
      reasons.add('invalid sentence range at centisecond precision')
    }
  }
  return { materialId, segment: segmentId, passCount, degraded: reasons.size > 0, reasons: [...reasons],
    passes: passes.map(({ matchRate }, i) => ({ ...bounds[i], matchRate })),
    sentences: sentences.map(({ tokens, wordCount, ...sentence }, i) => ({ ...sentence,
      passes: passes.map(({ timings }) => {
        const { interpolated, ...timing } = timings[i]
        if (reasons.size) return { ...timing, start: null, end: null }
        return timings[i]
      }) })) }
}

export function alignListeningSentences({ document, review, apple, whisper = [], collectGaps = false }) {
  const asr = readAsr(apple, whisper)
  const instructions = document.sourcePresentation?.instructions ?? document.sourceInstructions
  const candidates = collectGaps ? [] : null
  const segments = listeningSentenceTargets(document).map(target => {
    const mixed = alignMaterial(target, review, instructions, asr, candidates)
    if (!mixed.degraded || !asr.apple.length || !asr.whisper.length) return mixed
    const fallback = alignMaterial(target, review, instructions, asr, null, asr.apple)
    return fallback.degraded ? mixed : fallback
  })
  return { segments, candidates: candidates ?? [] }
}

export function alignReviewedListeningSentences(document, review, readWindow) {
  const windows = review?.evidence?.filter(({ kind }) => kind === 'asr_window') ?? []
  const apple = windows.find(({ settings }) => /apple/iu.test(settings?.engine))
  const whisper = windows.filter(({ settings }) => /whisper/iu.test(settings?.engine))
  return alignListeningSentences({ document, review, apple: apple ? readWindow(apple.path) : null,
    whisper: whisper.map(({ path }) => readWindow(path)) }).segments
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sourcePath, reviewPath, applePath, output, ...windowPaths] = process.argv.slice(2)
  if (!output) throw new Error('Usage: listening-sentence-align.mjs SOURCE REVIEW APPLE OUTPUT [WHISPER_WINDOW ...]')
  const { segments, candidates } = alignListeningSentences({ document: readJson(sourcePath), review: readJson(reviewPath),
    apple: readJson(applePath), whisper: windowPaths.map(readJson), collectGaps: true })
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'sentences.json'), `${JSON.stringify(segments, null, 2)}\n`)
  writeFileSync(join(output, 'gap-candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`)
}
