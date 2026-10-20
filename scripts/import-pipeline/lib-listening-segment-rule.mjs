// Pure, platform-independent navigation rule. ASR is evidence, never a source-text editor.
export const LISTENING_SEGMENT_RULE = Object.freeze({
  version: 'listening-segment-rule-v2',
  normalizationVersion: 'listening-equivalences-v1',
  anchorWords: 6,
  expandedAnchorWords: 12,
  shortMaterialWords: 40,
  shortMatchMinimum: 0.95,
  matchMinimum: 0.90,
  edgeWordMaxSeconds: 2,
  openingGapMaxSeconds: 2,
  durationRatioMinimum: 0.85,
  durationRatioMaximum: 1.15,
  boundarySearchSeconds: 2,
  boundaryPaddingSeconds: 0.02,
  silenceThresholdDb: -35,
  minimumSilenceSeconds: 0.08,
  engineBoundaryToleranceSeconds: 0.5,
})

// Finite, published equivalences only. Personal names are intentionally absent.
export const LISTENING_EQUIVALENCES = Object.freeze({
  ok: 'okay', hey: 'hi', hm: 'hmm', hmmm: 'hmm',
  theatre: 'theater', theatres: 'theaters', travelled: 'traveled',
  travelling: 'traveling', colour: 'color', colours: 'colors',
  centre: 'center', centres: 'centers', favourite: 'favorite',
  organise: 'organize', organised: 'organized', realise: 'realize',
})
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function numberWords(value) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1_000_000) return value
  if (n < 20) return smallNumbers[n]
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${smallNumbers[n % 10]}` : ''}`
  if (n < 1000) return `${smallNumbers[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`
}

export function normalizeListeningText(value) {
  return String(value ?? '').toLowerCase().replaceAll('’', "'")
    .replace(/(?<=\d),(?=\d{3}\b)/gu, '')
    .replace(/([$£])(\d+)(?:\.(\d{2}))?/gu, (_, currency, amount, cents) =>
      `${numberWords(amount)} ${currency === '$' ? 'dollars' : 'pounds'}${cents ? ` ${numberWords(cents)} cents` : ''}`)
    .replace(/\b(\d+):00\b/gu, "$1 o'clock")
    .replace(/\b\d+\b/gu, numberWords)
    .match(/[a-z]+(?:'[a-z]+)?|\d+/gu)?.map(word => LISTENING_EQUIVALENCES[word] || word) || []
}

export function listeningSourceTurns(text) {
  return String(text ?? '').split('参考答案')[0]
    .replace(/^\s*text\s+\d+[^\n]*(?:\n|$)/gimu, '')
    .replace(/^\s*\d+\.\s*/u, '')
    .split(/(?:^|\n)\s*(?:\d+\.\s*)?(?:M|W|Speaker \d+):\s*/u)
    .map(turn => turn.replace(/\(\d+\)|[①-⑳]/gu, '').trim())
    .filter(Boolean).map(normalizeListeningText).filter(turn => turn.length)
}

function countReadings(text) {
  const found = []
  for (const match of String(text ?? '').matchAll(/(?:读|听|播放|播|朗读)\s*([一两二12])\s*(?:遍|次)|\b(?:read|played|hear(?:d)?)(?:\s+(?:each|the|every|short|long|conversation|dialogue|recording|passage|or|monologue)){0,8}\s+(once|twice|one time|two times)\b/giu)) {
    found.push(['一', '1', 'once', 'one time'].includes((match[1] || match[2]).toLowerCase()) ? 1 : 2)
  }
  return found
}

export function expectedListeningReadings(group, instructions = []) {
  const slotId = Math.max(...group.questionNumbers) <= 5 ? 'listening.short-dialogue' : 'listening.long-form'
  const groupInstructions = [
    ...(Array.isArray(group.instructions) ? group.instructions : group.instructions ? [group.instructions] : []),
    ...(group.instruction ? [group.instruction] : []),
    ...instructions.filter(item => item.segmentId === group.segmentId
      || item.groupId === group.segmentId
      || (Array.isArray(item.questionNumbers) && item.questionNumbers.length === group.questionNumbers.length
        && item.questionNumbers.every((n, i) => n === group.questionNumbers[i]))),
  ]
  const selected = groupInstructions.length ? groupInstructions
    : instructions.filter(item => item.slotId === slotId && !item.segmentId && !item.groupId && !item.questionNumbers)
  const sources = selected.map(item => ({
    level: groupInstructions.length ? 'group' : 'section',
    slotId, text: typeof item === 'string' ? item : item.text,
    source: typeof item === 'string' ? null : item.source ?? null,
  }))
  const counts = new Set(sources.flatMap(item => countReadings(item.text)))
  return {
    expectedReadings: counts.size === 1 ? [...counts][0] : 'unknown',
    issue: counts.size > 1 ? 'READING_INSTRUCTION_CONFLICT' : counts.size === 0 ? 'READING_COUNT_UNKNOWN' : null,
    sources,
  }
}

// Apple attributed runs may contain several lexical words. Interpolation is explicitly
// labelled; only the first/last token of a run may assert its acoustic outer boundary.
export function listeningAsrTokens(windows) {
  const words = []
  const markers = []
  const windowsWithWords = []
  for (const [windowIndex, window] of windows.entries()) {
    if (window.error) continue
    const offset = window.startSeconds ?? 0
    const segments = window.result?.segments || window.segments || []
    const inWindow = []
    for (const [segmentIndex, segment] of segments.entries()) {
      const runs = segment.runs || segment.words || []
      const cueText = segment.text || runs.map(w => w.word ?? w.text).join(' ')
      const cues = parseListeningAnnouncements(cueText)
      const segmentStart = offset + (segment.start ?? segment.startSeconds ?? 0)
      const segmentEnd = offset + (segment.end ?? segment.endSeconds ?? 0)
      for (const cue of cues) {
        // Cues such as "Text Six" commonly span two runs. Reconstruct their
        // character spans instead of assigning a whole segment's end time.
        let cursor = 0
        const spans = runs.map(run => {
          const text = String(run.word ?? run.text)
          const span = { run, start: cursor, end: cursor + text.length }
          cursor = span.end + 1
          return span
        })
        const joined = runs.map(run => run.word ?? run.text).join(' ')
        const match = parseListeningAnnouncements(joined).find(m => m.raw.replace(/\s+/gu, ' ')
          === cue.raw.replace(/\s+/gu, ' '))
        const timed = match ? spans.filter(span => span.end > match.index
          && span.start < match.index + match.raw.length) : []
        markers.push({ ...cue, startSeconds: timed.length ? offset + timed[0].run.start : segmentStart,
          endSeconds: timed.length ? offset + timed.at(-1).run.end : segmentEnd })
      }
      for (const [runIndex, run] of runs.entries()) {
        const tokens = normalizeListeningText(run.word ?? run.text)
        const start = offset + Number(run.start ?? run.startSeconds)
        const end = offset + Number(run.end ?? run.endSeconds)
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < offset || end <= start
          || end > window.endSeconds + 0.5) continue
        for (const [i, token] of tokens.entries()) {
          inWindow.push({ token, startSeconds: start + (end - start) * i / tokens.length,
            endSeconds: start + (end - start) * (i + 1) / tokens.length,
            runStartSeconds: start, runEndSeconds: end,
            startBoundary: i === 0, endBoundary: i === tokens.length - 1,
            timing: tokens.length === 1 ? 'run' : 'interpolated_within_run',
            runId: `${windowIndex}:${segmentIndex}:${runIndex}`,
            evidencePaths: window.evidencePaths || [],
          })
        }
      }
    }
    inWindow.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds)
    windowsWithWords.push({ window, words: inWindow })
  }
  // Choose one window for every overlap region before counting occurrences.
  // A differing tokenization is not a second voice or reading. Keep the losing
  // raw window on disk; the selected clock has a deterministic midpoint seam.
  const ordered = windowsWithWords.sort((a, b) => a.window.startSeconds - b.window.startSeconds
    || b.window.endSeconds - a.window.endSeconds).filter((item, i, list) => !list.slice(0, i)
    .some(previous => previous.window.startSeconds <= item.window.startSeconds
      && previous.window.endSeconds >= item.window.endSeconds))
  for (const [i, item] of ordered.entries()) {
    const previous = ordered[i - 1]?.window
    const next = ordered[i + 1]?.window
    const low = previous && previous.endSeconds > item.window.startSeconds
      ? (previous.endSeconds + item.window.startSeconds) / 2 : -Infinity
    const high = next && item.window.endSeconds > next.startSeconds
      ? (item.window.endSeconds + next.startSeconds) / 2 : Infinity
    words.push(...item.words.filter(word => (word.startSeconds + word.endSeconds) / 2 >= low
      && (word.startSeconds + word.endSeconds) / 2 < high))
  }
  words.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds)
  return { words, markers }
}

function chineseNumber(text) {
  if (/^\d+$/u.test(text)) return Number(text)
  const n = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (n[text]) return n[text]
  const [a, b] = text.split('十')
  return text.includes('十') ? (n[a] || 1) * 10 + (n[b] || 0) : NaN
}
export function parseListeningAnnouncements(text) {
  const markers = []
  for (const match of String(text).matchAll(/\btext\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|第\s*([一二两三四五六七八九十\d]+)\s*段|第?\s*([一二两三四五六七八九十\d]+)\s*(?:至|到|[-–])\s*([一二两三四五六七八九十\d]+)\s*题/giu)) {
    if (match[1] || match[2]) {
      const english = match[1]?.toLowerCase()
      const groupNumber = english ? (/^\d+$/u.test(english) ? Number(english) : smallNumbers.indexOf(english)) : chineseNumber(match[2])
      markers.push({ raw: match[0], index: match.index, kind: 'group', groupNumber })
    } else markers.push({ raw: match[0], index: match.index, kind: 'questions',
      firstQuestion: chineseNumber(match[3]), lastQuestion: chineseNumber(match[4]) })
  }
  return markers
}

function positions(haystack, needle) {
  const result = []
  if (!needle.length) return result
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((word, j) => word === (haystack[i + j].token ?? haystack[i + j]))) result.push(i)
  }
  return result
}

// Global edit distance for ONE bounded occurrence. Insertions count in the
// score; a free prefix/suffix or src*2 alignment would hide narration/splicing.
export function alignListeningOccurrence(source, target) {
  const trace = [new Uint8Array(target.length + 1).fill(2)]
  let previous = Array.from({ length: target.length + 1 }, (_, i) => i)
  for (let i = 1; i <= source.length; i++) {
    const row = [i]
    const moves = new Uint8Array(target.length + 1)
    moves[0] = 1
    for (let j = 1; j <= target.length; j++) {
      const costs = [previous[j - 1] + Number(source[i - 1] !== target[j - 1].token),
        previous[j] + 1, row[j - 1] + 1]
      const move = costs.indexOf(Math.min(...costs))
      row[j] = costs[move]
      moves[j] = move
    }
    trace.push(moves)
    previous = row
  }
  let i = source.length, j = target.length
  const matched = []
  const missing = []
  while (i || j) {
    const move = !i ? 2 : !j ? 1 : trace[i][j]
    if (move === 0) {
      if (source[i - 1] === target[j - 1].token) matched.push(i - 1)
      else missing.push(i - 1)
      i--; j--
    } else if (move === 1) { missing.push(--i) } else j--
  }
  return { sourceMatchRate: matched.length / Math.max(1, source.length),
    editSimilarity: 1 - previous[target.length] / Math.max(1, source.length, target.length),
    matchedSourceIndices: matched.reverse(), missingSourceIndices: missing.reverse(),
    editDistance: previous[target.length], sourceWordCount: source.length, asrWordCount: target.length }
}

function markerMatches(marker, group, groupNumber) {
  return marker.kind === 'group' ? marker.groupNumber === groupNumber
    : marker.firstQuestion === Math.min(...group.questionNumbers)
      && marker.lastQuestion === Math.max(...group.questionNumbers)
}
function problem(result, code) {
  if (!result.issues.includes(code)) result.issues.push(code)
  result.decision = 'review_required'
  return result
}
function anchorsFor(group, corpus, words, expected) {
  const source = listeningSourceTurns(group.text).flat()
  for (const length of [LISTENING_SEGMENT_RULE.anchorWords, LISTENING_SEGMENT_RULE.expandedAnchorWords]) {
    const width = Math.min(length, source.length)
    const head = source.slice(0, width), tail = source.slice(-width)
    const uniqueSource = [head, tail].every(anchor =>
      positions(source, anchor).length === 1
      && corpus.filter(other => other.segmentId !== group.segmentId)
        .every(other => positions(listeningSourceTurns(other.text).flat(), anchor).length === 0))
    const heads = positions(words, head), tails = positions(words, tail)
    const uniqueAudio = expected === 'unknown' || (heads.length <= expected && tails.length <= expected)
    if (uniqueSource && uniqueAudio) return { width, head, tail, heads, tails, ambiguous: false }
    if (length === LISTENING_SEGMENT_RULE.expandedAnchorWords) return { width, head, tail, heads, tails, ambiguous: true }
  }
}

function boundsFor(first, last, pauses, duration) {
  const before = pauses.filter(p => p.startSeconds < first.runStartSeconds
    && p.endSeconds <= first.runEndSeconds
    && first.runStartSeconds - p.endSeconds <= LISTENING_SEGMENT_RULE.boundarySearchSeconds).at(-1)
  const after = pauses.find(p => p.endSeconds > last.runEndSeconds
    && p.startSeconds >= last.runStartSeconds
    && p.startSeconds - last.runEndSeconds <= LISTENING_SEGMENT_RULE.boundarySearchSeconds)
  if (!before || !after || !first.startBoundary || !last.endBoundary) return null
  // ASR word intervals often include silence. Keep the entire acoustic run and
  // choose a point inside the adjacent pause, including when they overlap.
  const startSeconds = Math.max(0, Math.min(first.runStartSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds,
    (before.startSeconds + before.endSeconds) / 2))
  const endSeconds = Math.min(duration, Math.max(last.runEndSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds,
    (after.startSeconds + after.endSeconds) / 2))
  if (startSeconds < before.startSeconds || endSeconds > after.endSeconds) return null
  return startSeconds < first.runStartSeconds && endSeconds > last.runEndSeconds
    ? { startSeconds, endSeconds } : null
}

export function evaluateListeningEngine({ groups, instructions = [], windows = [], pauses = [], durationSeconds,
  engine = 'Apple SpeechAnalyzer', corpus = groups, requireWholePaper = true }) {
  const { words, markers } = listeningAsrTokens(windows)
  const orderedGroups = [...groups].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  const allTails = []
  const allHeads = corpus.flatMap(group => {
    const a = anchorsFor(group, corpus, words, expectedListeningReadings(group, instructions).expectedReadings)
    allTails.push(...a.tails.map(index => index + a.width - 1))
    return a.heads.map(index => ({ segmentId: group.segmentId, index }))
  })
  const results = orderedGroups.map(group => {
    const expected = expectedListeningReadings(group, instructions)
    const result = { segmentId: group.segmentId, questionNumbers: group.questionNumbers, engine,
      ...expected, decision: 'usable', issues: [], occurrences: [], playback: null,
      sourceText: group.text }
    if (expected.issue) problem(result, expected.issue)
    if (!words.length) problem(result, 'ASR_NO_TIMED_WORDS')
    const turns = listeningSourceTurns(group.text)
    const source = turns.flat()
    if (!source.length) return problem(result, 'SOURCE_EMPTY')
    const anchor = anchorsFor(group, corpus, words, expected.expectedReadings)
    result.anchors = { width: anchor.width, headPositions: anchor.heads, tailPositions: anchor.tails }
    if (anchor.ambiguous) problem(result, 'ANCHOR_AMBIGUOUS')
    const groupNumber = Number(group.segmentId.match(/(\d+)$/u)?.[1])
    for (const [headNumber, startIndex] of anchor.heads.entries()) {
      const nextHead = anchor.heads[headNumber + 1] ?? words.length
      const foreignHead = allHeads.filter(h => h.segmentId !== group.segmentId && h.index > startIndex)
        .reduce((end, h) => Math.min(end, h.index), nextHead)
      const tails = anchor.tails.filter(index => index + anchor.width > startIndex
        && index + anchor.width <= foreignHead)
      if (tails.length !== 1) { problem(result, 'OCCURRENCE_TAIL_MISSING_OR_AMBIGUOUS'); continue }
      const endIndex = tails[0] + anchor.width
      const actual = words.slice(startIndex, endIndex)
      const first = actual[0], last = actual.at(-1)
      const alignment = alignListeningOccurrence(source, actual)
      const issues = []
      const threshold = source.length < LISTENING_SEGMENT_RULE.shortMaterialWords
        ? LISTENING_SEGMENT_RULE.shortMatchMinimum : LISTENING_SEGMENT_RULE.matchMinimum
      if (alignment.sourceMatchRate < threshold || alignment.editSimilarity < threshold) issues.push('BODY_ALIGNMENT_LOW')
      let turnStart = 0
      for (const turn of turns) {
        if (!alignment.matchedSourceIndices.some(index => index >= turnStart && index < turnStart + turn.length)) {
          issues.push('WHOLE_TURN_MISSING')
        }
        turnStart += turn.length
      }
      const critical = new Set(['not', 'no', 'never', 'none', 'neither', 'nothing', 'without',
        ...smallNumbers, ...tens.filter(Boolean), 'hundred', 'thousand', 'dollars', 'pounds', 'cents'])
      if (alignment.missingSourceIndices.some(index => critical.has(source[index]) || /n't$/u.test(source[index]))) {
        issues.push('CRITICAL_WORD_MISSING')
      }
      const edges = [...actual.slice(0, anchor.width), ...actual.slice(-anchor.width)]
      if (edges.some(w => w.runEndSeconds - w.runStartSeconds > LISTENING_SEGMENT_RULE.edgeWordMaxSeconds)) {
        issues.push('EDGE_WORD_SPAN_LONG')
      }
      if (actual.slice(0, anchor.width).some((w, i, list) => i
        && w.startSeconds - list[i - 1].endSeconds > LISTENING_SEGMENT_RULE.openingGapMaxSeconds)) issues.push('OPENING_GAP_LONG')
      // Never bridge an observed reading/preparation pause inside one occurrence.
      // A long in-body pause is uncertainty, not permission to join two fragments.
      if (pauses.some(p => p.startSeconds > first.runEndSeconds && p.endSeconds < last.runStartSeconds
        && p.endSeconds - p.startSeconds > LISTENING_SEGMENT_RULE.openingGapMaxSeconds)) issues.push('OCCURRENCE_DISCONTINUOUS')
      const previousBodyEnd = words[allTails.filter(index => index < startIndex)
        .reduce((maximum, index) => Math.max(maximum, index), -1)]?.endSeconds ?? 0
      const preceding = markers.filter(m => m.startSeconds >= previousBodyEnd && m.endSeconds <= first.runStartSeconds)
      const relevant = [...preceding,
        ...markers.filter(m => m.startSeconds >= first.runStartSeconds && m.startSeconds <= last.runEndSeconds)]
      if (relevant.some(marker => !markerMatches(marker, group, groupNumber))) issues.push('ANNOUNCEMENT_CONFLICT')
      let boundary = boundsFor(first, last, pauses, durationSeconds)
      if (boundary) {
        const coverage = windows.filter(w => (w.startSeconds ?? 0) <= boundary.startSeconds
          && w.endSeconds >= boundary.endSeconds)
        // Contiguous windows may collectively cover a playback interval.
        let coveredEnd = boundary.startSeconds
        for (const window of [...windows].sort((a, b) => a.startSeconds - b.startSeconds)) {
          if ((window.startSeconds ?? 0) > coveredEnd) break
          coveredEnd = Math.max(coveredEnd, window.endSeconds)
        }
        if (!coverage.length && coveredEnd < boundary.endSeconds) boundary = null
      }
      if (!boundary) issues.push('BOUNDARY_EVIDENCE_INSUFFICIENT')
      const occurrence = { startSeconds: first.runStartSeconds, endSeconds: last.runEndSeconds,
        playback: boundary, alignment, issues: [...new Set(issues)], announcements: relevant,
        evidencePaths: [...new Set(actual.flatMap(w => w.evidencePaths))] }
      result.occurrences.push(occurrence)
      for (const code of issues) problem(result, code)
    }
    if (result.occurrences.length !== expected.expectedReadings) problem(result, 'READING_COUNT_MISMATCH')
    if (result.occurrences.some((o, i, list) => i && o.startSeconds < list[i - 1].endSeconds)) problem(result, 'READINGS_OVERLAP')
    if (result.occurrences.length === 2) {
      const [a, b] = result.occurrences.map(o => o.endSeconds - o.startSeconds)
      result.durationRatio = a / b
      if (result.durationRatio < LISTENING_SEGMENT_RULE.durationRatioMinimum
        || result.durationRatio > LISTENING_SEGMENT_RULE.durationRatioMaximum) problem(result, 'READING_DURATION_CONFLICT')
    }
    if (result.decision === 'usable' && result.occurrences.length) result.playback = {
      startSeconds: result.occurrences[0].playback.startSeconds,
      endSeconds: result.occurrences.at(-1).playback.endSeconds,
    }
    return result
  })
  // Even unresolved neighboring candidates constrain boundaries and order.
  for (const [i, result] of results.entries()) {
    const current = result.occurrences
    if (!current.length) continue
    const previous = results.slice(0, i).flatMap(g => g.occurrences)
    const next = results.slice(i + 1).flatMap(g => g.occurrences)
    if (previous.some(o => o.endSeconds > current[0].startSeconds)
      || next.some(o => o.startSeconds < current.at(-1).endSeconds)) problem(result, 'WHOLE_PAPER_ORDER_CONFLICT')
    if (result.playback && (previous.some(o => o.endSeconds > result.playback.startSeconds)
      || next.some(o => o.startSeconds < result.playback.endSeconds))) problem(result, 'NEIGHBOR_BOUNDARY_CROSSED')
    if (requireWholePaper && !current.some(o => o.announcements.length)
      && corpus.some(g => !results.find(r => r.segmentId === g.segmentId)?.occurrences.length)) {
      problem(result, 'WHOLE_PAPER_ORDER_UNPROVEN')
    }
  }
  if (requireWholePaper && corpus.some(g => !results.some(r => r.segmentId === g.segmentId))) {
    for (const result of results) problem(result, 'WHOLE_PAPER_ORDER_UNPROVEN')
  }
  for (const result of results) if (result.decision !== 'usable') result.playback = null
  return { ruleVersion: LISTENING_SEGMENT_RULE.version, engine, groups: results }
}

export function reconcileListeningEngines(apple, whisper) {
  const hardConflict = new Set(['ANNOUNCEMENT_CONFLICT', 'READINGS_OVERLAP', 'READING_DURATION_CONFLICT',
    'WHOLE_PAPER_ORDER_CONFLICT', 'NEIGHBOR_BOUNDARY_CROSSED', 'ANCHOR_AMBIGUOUS'])
  const results = apple.groups.map(primary => {
    const secondary = whisper?.groups.find(g => g.segmentId === primary.segmentId)
    const attempts = [primary, ...(secondary ? [secondary] : [])]
    let chosen = primary, conflict = false
    if (secondary) {
      conflict = attempts.some(a => a.issues.some(code => hardConflict.has(code)))
      const complete = a => a.occurrences.filter(o => o.alignment.sourceMatchRate >=
        (o.alignment.sourceWordCount < LISTENING_SEGMENT_RULE.shortMaterialWords
          ? LISTENING_SEGMENT_RULE.shortMatchMinimum : LISTENING_SEGMENT_RULE.matchMinimum)
        && o.alignment.editSimilarity >= (o.alignment.sourceWordCount < LISTENING_SEGMENT_RULE.shortMaterialWords
          ? LISTENING_SEGMENT_RULE.shortMatchMinimum : LISTENING_SEGMENT_RULE.matchMinimum))
      const a = complete(primary), b = complete(secondary)
      if (a.length && b.length) {
        if (a.length !== b.length) conflict = true
        else if (a.some((o, i) => o.playback && b[i].playback
          && (Math.abs(o.playback.startSeconds - b[i].playback.startSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds
          || Math.abs(o.playback.endSeconds - b[i].playback.endSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds))) conflict = true
      }
      if (!conflict && primary.decision !== 'usable' && secondary.decision === 'usable') chosen = secondary
    }
    return { ...chosen, decision: conflict ? 'review_required' : chosen.decision,
      playback: conflict ? null : chosen.playback,
      issues: conflict ? [...new Set([...chosen.issues, 'ENGINE_CONFLICT'])] : chosen.issues,
      selectedEngine: chosen.engine, engineAttempts: attempts }
  })
  for (const [i, result] of results.entries()) {
    if (!result.playback) continue
    const previous = results.slice(0, i).flatMap(group => group.occurrences)
    const next = results.slice(i + 1).flatMap(group => group.occurrences)
    if (previous.some(o => o.endSeconds > result.playback.startSeconds)
      || next.some(o => o.startSeconds < result.playback.endSeconds)) {
      problem(result, 'WHOLE_PAPER_ORDER_CONFLICT')
      result.playback = null
    }
    if (!result.occurrences.some(o => o.announcements.length)
      && results.some(g => !g.occurrences.length)) {
      problem(result, 'WHOLE_PAPER_ORDER_UNPROVEN')
      result.playback = null
    }
  }
  return results
}
