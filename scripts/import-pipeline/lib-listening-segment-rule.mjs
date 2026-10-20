// Pure, platform-independent navigation rule. ASR is evidence, never a source-text editor.
export const LISTENING_SEGMENT_RULE = Object.freeze({
  version: 'listening-segment-rule-v2',
  normalizationVersion: 'listening-equivalences-v2',
  anchorWords: 6,
  expandedAnchorWords: 12,
  fuzzyAnchorsEnabled: false,
  fuzzyMinimumWords: 20,
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

const ordinalSmall = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth']
const ordinalEntries = Array.from({ length: 31 }, (_, i) => {
  const n = i + 1
  const suffix = n >= 11 && n <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')
  const word = n < 20 ? ordinalSmall[n - 1] : n === 20 ? 'twentieth' : n === 30 ? 'thirtieth'
    : `${n < 30 ? 'twenty' : 'thirty'} ${ordinalSmall[n % 10 - 1]}`
  return [`${n}${suffix}`, word]
})
// Finite, published equivalences only. Personal names are intentionally absent.
export const LISTENING_EQUIVALENCES = Object.freeze({
  ok: 'okay', hey: 'hi', hm: 'hmm', hmmm: 'hmm',
  theatre: 'theater', theatres: 'theaters', travelled: 'traveled',
  travelling: 'traveling', colour: 'color', colours: 'colors',
  centre: 'center', centres: 'centers', favourite: 'favorite',
  organise: 'organize', organised: 'organized', realise: 'realize',
  ...Object.fromEntries(ordinalEntries),
  'a.m.': 'am', 'a.m': 'am', 'p.m.': 'pm', 'p.m': 'pm',
})
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const criticalWords = new Set(['not', 'no', 'never', 'none', 'neither', 'nothing', 'nobody', 'nowhere', 'nor', 'without', 'cannot',
  ...smallNumbers, ...tens.filter(Boolean), 'hundred', 'thousand', 'million', 'billion',
  ...ordinalEntries.flatMap(([, value]) => value.split(' ')), 'half',
  'dollar', 'dollars', 'pound', 'pounds', 'cent', 'cents', 'euro', 'euros', 'yuan', 'yen',
  "o'clock", 'am', 'pm', 'a.m', 'p.m', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds',
  'noon', 'midnight', 'morning', 'afternoon', 'evening', 'tonight', 'today', 'tomorrow', 'yesterday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december'])
const isCritical = word => criticalWords.has(word) || /n't$|\d/u.test(word || '')
// Conservatively protect every non-function word in the group's questions/options.
const functionWords = new Set(('a an the i you he she it we they me him her us them my your his its our their '
  + 'this that these those what which who whom whose when where why how is are was were be been being '
  + 'do does did have has had will would shall should can could may might must to of in on at by for from '
  + 'with about as and or but if than then so there here some any all each every').split(' '))
function questionWords(group, questions) {
  const selected = group.questions || questions?.filter(q => group.questionNumbers.includes(q.canonicalNumber ?? q.sourceNumber))
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ')
    : node && typeof node === 'object' ? text(node.text ?? node.content ?? node.runs ?? '') : ''
  return { available: group.questionNumbers.every(number => selected?.some(q =>
    (q.canonicalNumber ?? q.sourceNumber) === number && text(q.stem) && text(q.options))),
    words: new Set((selected || []).flatMap(q => normalizeListeningText(
      `${text(q.stem)} ${text(q.options)}`)).filter(w => !functionWords.has(w))) }
}
function numberWords(value) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1_000_000) return value
  if (n < 20) return smallNumbers[n]
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${smallNumbers[n % 10]}` : ''}`
  if (n < 1000) return `${smallNumbers[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`
}

const meridiemPattern = '[ap]\\s*\\.?\\s*m\\.?'
const listeningLexemes = new RegExp([
  '[$£]\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
  `\\b\\d{1,2}\\s*:\\s*\\d{2}(?:\\s*${meridiemPattern}(?![a-z]))?`,
  `\\b\\d{1,2}\\s*\\.\\s*\\d{2}\\s*${meridiemPattern}(?![a-z])`,
  `\\b\\d{1,4}\\s*${meridiemPattern}(?![a-z])`,
  '\\b[ap]\\s*\\.\\s*m\\.?(?![a-z])',
  "\\bo\\s*['’]\\s*clock\\b",
  '\\b\\d+(?:st|nd|rd|th)\\b',
  '\\d+(?:,\\d{3})+(?:\\s*\\.\\s*\\d+)?', '\\d+\\s*\\.\\s*\\d+',
  '\\d+', "[a-z]+(?:['’][a-z]+)?",
].join('|'), 'giu')
function lexemeWords(raw) {
  const text = raw.toLowerCase().replaceAll('’', "'").replace(/(?<=\d),(?=\d{3}\b)/gu, '')
  if (LISTENING_EQUIVALENCES[text]) return LISTENING_EQUIVALENCES[text].split(' ')
  if (/^o\s*'\s*clock$/u.test(text)) return ["o'clock"]
  if (/^[ap]\s*\.\s*m\.?$/u.test(text)) return [text[0] + 'm']
  const money = text.match(/^([$£])(\d+)(?:\.(\d{2}))?$/u)
  if (money) return `${numberWords(money[2])} ${money[1] === '$' ? 'dollars' : 'pounds'}${money[3] ? ` ${numberWords(money[3])} cents` : ''}`.split(' ')
  const clock = text.match(/^(\d{1,2})\s*([:.])\s*(\d{2})(?:\s*([ap])\s*\.?\s*m\.?)?$/u)
  const compact = text.match(/^(\d{1,4})\s*([ap])\s*\.?\s*m\.?$/u)
  let hour, minute, meridiem
  if (clock && (clock[2] === ':' || clock[4])) {
    hour = Number(clock[1]); minute = Number(clock[3]); meridiem = clock[4]
  }
  else if (compact) {
    const digits = compact[1]
    hour = Number(digits.length > 2 ? digits.slice(0, -2) : digits)
    minute = digits.length > 2 ? Number(digits.slice(-2)) : 0
    meridiem = compact[2]
  }
  if (hour !== undefined && hour >= (meridiem ? 1 : 0) && hour <= (meridiem ? 12 : 23)
    && minute >= 0 && minute <= 59) {
    return `${numberWords(hour)}${minute ? ` ${minute < 10 ? 'oh ' : ''}${numberWords(minute)}` : meridiem ? '' : " o'clock"}${meridiem ? ` ${meridiem}m` : ''}`.split(' ')
  }
  // Without an explicit meridiem a decimal may be a quantity; preserve its
  // numeric literal for the critical gate instead of silently reading a clock.
  if (/^\d+\s*\.\s*\d+$/u.test(text)) return [text.replace(/\s+/gu, '')]
  return (text.match(/[a-z]+(?:'[a-z]+)?|\d+/gu) || [])
    .flatMap(word => /^\d+$/u.test(word) ? numberWords(word).split(' ') : [LISTENING_EQUIVALENCES[word] || word])
}
// One normalization path for source text and timed ASR, retaining raw character
// ranges. A run boundary cannot split "1" + ".15pm" or "o" + "'clock".
function normalizeListeningUnits(value) {
  const text = String(value ?? '')
  let units = [...text.matchAll(listeningLexemes)].flatMap(match =>
    lexemeWords(match[0]).map(token => ({ token, start: match.index, end: match.index + match[0].length })))
  const adjacent = (a, b) => a.end >= b.start || /^[\s-]*$/u.test(text.slice(a.end, b.start))
  const span = (tokens, first, last) => tokens.map(token => ({ token, start: first.start, end: last.end }))
  const result = []
  const yearContext = new Set(['in', 'since', 'during', 'until', 'by', 'before', 'after', 'from', 'year'])
  const quantityUnits = new Set(['dollar', 'dollars', 'pound', 'pounds', 'cent', 'cents', 'euro', 'euros',
    'yuan', 'yen', 'hundred', 'thousand', 'million', 'hours', 'minutes', 'seconds'])
  for (let i = 0; i < units.length; i++) {
    const a = units[i], b = units[i + 1], c = units[i + 2]
    if (a.token === 'half' && b?.token === 'past' && c
      && smallNumbers.indexOf(c.token) >= 1 && smallNumbers.indexOf(c.token) <= 12
      && adjacent(a, b) && adjacent(b, c)) {
      result.push(...span([c.token, 'thirty'], a, c)); i += 2; continue
    }
    if (a.token === 'twenty' && b && adjacent(a, b)) {
      let remainder = smallNumbers.indexOf(b.token), last = i + 1
      if (tens.includes(b.token)) {
        remainder = tens.indexOf(b.token) * 10
        if (c && smallNumbers.indexOf(c.token) >= 1 && smallNumbers.indexOf(c.token) <= 9 && adjacent(b, c)) {
          remainder += smallNumbers.indexOf(c.token); last++
        }
      } else if (['oh', 'o', 'zero'].includes(b.token) && c && adjacent(b, c)
        && smallNumbers.indexOf(c.token) >= 1 && smallNumbers.indexOf(c.token) <= 9) {
        remainder = smallNumbers.indexOf(c.token); last++
      }
      const standalone = i === 0 && last === units.length - 1
      const context = i > 0 && yearContext.has(units[i - 1].token) && adjacent(units[i - 1], a)
      if (remainder >= 1 && remainder <= 99 && (remainder >= 10 || last > i + 1)
        && (standalone || context) && !quantityUnits.has(units[last + 1]?.token)
        && !ordinalSmall.includes(units[last + 1]?.token)) {
        result.push(...span(numberWords(2000 + remainder).split(' '), a, units[last])); i = last; continue
      }
    }
    result.push(a)
  }
  units = result
  const withoutOptionalClock = []
  for (let i = 0; i < units.length; i++) {
    const a = units[i], b = units[i + 1], c = units[i + 2]
    if (smallNumbers.indexOf(a.token) >= 1 && smallNumbers.indexOf(a.token) <= 12
      && b?.token === "o'clock" && ['am', 'pm'].includes(c?.token) && adjacent(a, b) && adjacent(b, c)) {
      withoutOptionalClock.push({ ...a, end: b.end }); i++; continue
    }
    withoutOptionalClock.push(a)
  }
  return withoutOptionalClock
}
export function normalizeListeningText(value) {
  return normalizeListeningUnits(value).map(unit => unit.token)
}

function listeningSourceTurnText(text) {
  return String(text ?? '').split('参考答案')[0]
    .replace(/^\s*text\s+\d+[^\n]*(?:\n|$)/gimu, '')
    .replace(/^\s*\d+\.\s*/u, '')
    .split(/(?:^|\n)\s*(?:\d+\.\s*)?(?:M|W|Speaker \d+):\s*/u)
    .map(turn => turn.replace(/\(\d+\)|[①-⑳]/gu, '').trim())
    .filter(Boolean)
}
export function listeningSourceTurns(text) {
  return listeningSourceTurnText(text).map(normalizeListeningText).filter(turn => turn.length)
}
function listeningSourceRawWords(text) {
  return listeningSourceTurnText(text).flatMap(turn =>
    normalizeListeningUnits(turn).map(unit => turn.slice(unit.start, unit.end)))
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
function timedListeningUnits(runs, offset, windowEnd, idPrefix, evidencePaths) {
  let cursor = 0
  const spans = runs.map((run, index) => {
    const text = String(run.word ?? run.text)
    const start = offset + Number(run.start ?? run.startSeconds)
    const end = offset + Number(run.end ?? run.endSeconds)
    const span = { text, index, low: cursor, high: cursor + text.length, start, end,
      valid: Number.isFinite(start) && Number.isFinite(end) && start >= offset && end > start && end <= windowEnd + 0.5 }
    cursor = span.high + 1
    return span
  })
  const joined = spans.map(s => s.text).join(' ')
  const units = []
  let first = 0
  for (const unit of normalizeListeningUnits(joined)) {
    while (first < spans.length && spans[first].high <= unit.start) first++
    const touched = []
    for (let i = first; i < spans.length && spans[i].low < unit.end; i++) touched.push(spans[i])
    // Never normalize across a failed timestamp or a preparation/reading pause.
    if (!touched.length || touched.at(-1).end <= touched[0].start
      || touched.some((s, i) => !s.valid || (i && (s.start < touched[i - 1].start
        || s.start - touched[i - 1].end > LISTENING_SEGMENT_RULE.openingGapMaxSeconds)))) continue
    units.push({ ...unit, touched })
  }
  const runUnits = spans.map(() => [])
  units.forEach((unit, i) => unit.touched.forEach(s => runUnits[s.index].push(i)))
  return units.map((unit, i) => {
    const a = unit.touched[0], b = unit.touched.at(-1)
    const left = runUnits[a.index], right = runUnits[b.index]
    return { token: unit.token,
      startSeconds: a.start + (a.end - a.start) * left.indexOf(i) / left.length,
      endSeconds: b.start + (b.end - b.start) * (right.indexOf(i) + 1) / right.length,
      runStartSeconds: a.start, runEndSeconds: b.end,
      startBoundary: left[0] === i, endBoundary: right.at(-1) === i,
      timing: unit.touched.length > 1 ? 'interpolated_within_normalized_span'
        : left.length === 1 ? 'run' : 'interpolated_within_run',
      rawRunText: unit.touched.map(s => s.text).join(' '),
      runId: `${idPrefix}:${a.index}${a === b ? '' : `-${b.index}`}`,
      evidencePaths }
  })
}
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
      inWindow.push(...timedListeningUnits(runs, offset, window.endSeconds,
        `${windowIndex}:${segmentIndex}`, window.evidencePaths || []))
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
  const differences = []
  while (i || j) {
    const move = !i ? 2 : !j ? 1 : trace[i][j]
    if (move === 0) {
      if (source[i - 1] === target[j - 1].token) matched.push(i - 1)
      else {
        missing.push(i - 1)
        differences.push({ kind: 'substitution', sourceIndex: i - 1, targetIndex: j - 1,
          sourceWord: source[i - 1], targetWord: target[j - 1].token })
      }
      i--; j--
    } else if (move === 1) {
      missing.push(--i)
      differences.push({ kind: 'deletion', sourceIndex: i, targetIndex: null, sourceWord: source[i], targetWord: null })
    } else {
      j--
      differences.push({ kind: 'insertion', sourceIndex: null, targetIndex: j, sourceWord: null, targetWord: target[j].token })
    }
  }
  return { sourceMatchRate: matched.length / Math.max(1, source.length),
    editSimilarity: 1 - previous[target.length] / Math.max(1, source.length, target.length),
    matchedSourceIndices: matched.reverse(), missingSourceIndices: missing.reverse(),
    differences: differences.reverse(),
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
function substitutionMatches(haystack, needle) {
  const matches = []
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    const differences = []
    for (let j = 0; j < needle.length && differences.length <= 1; j++) {
      const actual = haystack[i + j].token ?? haystack[i + j]
      if (needle[j] !== actual) differences.push({ offset: j, sourceWord: needle[j], targetWord: actual })
    }
    if (differences.length <= 1) matches.push({ index: i, differences })
  }
  return matches
}
function coversRecording(windows, durationSeconds) {
  let end = 0
  for (const w of [...windows].filter(w => !w.error && (w.result?.segments || w.segments)?.length)
    .sort((a, b) => (a.startSeconds ?? 0) - (b.startSeconds ?? 0))) {
    if ((w.startSeconds ?? 0) > end) return false
    end = Math.max(end, w.endSeconds)
  }
  // MP3 format duration can be a fraction of a millisecond below PCM duration.
  return end >= durationSeconds - 0.001
}
function anchorsFor(group, corpus, words, expected, fuzzy = null) {
  const source = listeningSourceTurns(group.text).flat()
  let exact
  for (const length of [LISTENING_SEGMENT_RULE.anchorWords, LISTENING_SEGMENT_RULE.expandedAnchorWords]) {
    const width = Math.min(length, source.length)
    const head = source.slice(0, width), tail = source.slice(-width)
    const uniqueSource = [head, tail].every(anchor =>
      positions(source, anchor).length === 1
      && corpus.filter(other => other.segmentId !== group.segmentId)
        .every(other => positions(listeningSourceTurns(other.text).flat(), anchor).length === 0))
    const heads = positions(words, head), tails = positions(words, tail)
    const uniqueAudio = expected === 'unknown' || (heads.length <= expected && tails.length <= expected)
    exact = { width, head, tail, heads, tails, ambiguous: !uniqueSource || !uniqueAudio }
    if (!exact.ambiguous) break
  }
  const incomplete = expected === 'unknown' ? !exact.heads.length || !exact.tails.length
    : exact.heads.length < expected || exact.tails.length < expected
  if (!fuzzy || !incomplete || exact.ambiguous || source.length < LISTENING_SEGMENT_RULE.fuzzyMinimumWords) return exact
  const width = LISTENING_SEGMENT_RULE.expandedAnchorWords
  const head = source.slice(0, width), tail = source.slice(-width)
  const heads = substitutionMatches(words, head), tails = substitutionMatches(words, tail)
  if (![...heads, ...tails].some(m => m.differences.length)) return exact
  const sourceUnique = [head, tail].every((a, i) => {
    const self = substitutionMatches(source, a)
    return self.length === 1 && self[0].index === (i ? source.length - width : 0)
      && corpus.filter(other => other.segmentId !== group.segmentId)
        .every(other => !substitutionMatches(listeningSourceTurns(other.text).flat(), a).length)
  })
  const globalHeads = substitutionMatches(fuzzy.globalWords, head)
  const globalTails = substitutionMatches(fuzzy.globalWords, tail)
  const ambiguous = !sourceUnique || (expected !== 'unknown'
    && [heads, tails, globalHeads, globalTails].some(m => m.length > expected))
  const sameTimes = (local, global) => local.every(candidate => global.some(other =>
    Math.abs(words[candidate.index].startSeconds - fuzzy.globalWords[other.index].startSeconds)
      <= LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds))
  return { width, head, tail, heads: heads.map(m => m.index), tails: tails.map(m => m.index),
    ambiguous, fuzzy: { heads, tails, globalHeadPositions: globalHeads.map(m => m.index),
      globalTailPositions: globalTails.map(m => m.index), globalCoverage: fuzzy.globalCoverage,
      globalProven: fuzzy.globalCoverage && expected !== 'unknown'
        && globalHeads.length === expected && globalTails.length === expected
        && sameTimes(heads, globalHeads) && sameTimes(tails, globalTails) } }
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

// Freeze the independently successful anchors before adding order issues.
// Failed/missing groups never become constraints merely because they have a
// partial occurrence. Removing one only widens the neighboring interval.
export function validateListeningOrder(results) {
  const ordered = [...results].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  const orderCodes = new Set(['WHOLE_PAPER_ORDER_CONFLICT', 'NEIGHBOR_BOUNDARY_CROSSED'])
  const skeleton = ordered.filter(g => g.independentlyAnchored && g.occurrences.length
    && g.issues.every(code => orderCodes.has(code)))
  const first = g => Math.min(...g.occurrences.map(o => o.startSeconds))
  const last = g => Math.max(...g.occurrences.map(o => o.endSeconds))
  // Compare every pair against the frozen skeleton. A conflict marks both
  // participants, even when the first mark changes a participant's decision.
  for (let i = 0; i < skeleton.length; i++) {
    for (const next of skeleton.slice(i + 1)) {
      const previous = skeleton[i]
      if (last(previous) >= first(next)) {
        problem(previous, 'WHOLE_PAPER_ORDER_CONFLICT')
        problem(next, 'WHOLE_PAPER_ORDER_CONFLICT')
      }
      if ((previous.playback && previous.playback.endSeconds >= first(next))
        || (next.playback && next.playback.startSeconds <= last(previous))
        || (previous.playback && next.playback
          && previous.playback.endSeconds > next.playback.startSeconds)) {
        problem(previous, 'NEIGHBOR_BOUNDARY_CROSSED')
        problem(next, 'NEIGHBOR_BOUNDARY_CROSSED')
      }
    }
  }
  for (const [i, result] of ordered.entries()) {
    const previous = ordered.slice(0, i).filter(g => skeleton.includes(g)).at(-1)
    const next = ordered.slice(i + 1).find(g => skeleton.includes(g))
    result.orderEvidence = { previousSegmentId: previous?.segmentId ?? null,
      nextSegmentId: next?.segmentId ?? null, afterSeconds: previous ? last(previous) : null,
      beforeSeconds: next ? first(next) : null, independentlyAnchored: result.independentlyAnchored }
    if (!result.occurrences.some(o => o.announcements.length)
      && result.occurrences.some(o => (previous && o.startSeconds <= last(previous))
        || (next && o.endSeconds >= first(next)))) problem(result, 'WHOLE_PAPER_ORDER_CONFLICT')
    if (result.playback && ((previous && result.playback.startSeconds <= last(previous))
      || (next && result.playback.endSeconds >= first(next)))) problem(result, 'NEIGHBOR_BOUNDARY_CROSSED')
  }
  for (const result of results) if (result.decision !== 'usable') result.playback = null
  return results
}

export function evaluateListeningEngine({ groups, instructions = [], windows = [], pauses = [], durationSeconds,
  engine = 'Apple SpeechAnalyzer', corpus = groups, requireWholePaper = true, questions,
  fuzzyAnchors = LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled, globalAnchorWindows = windows }) {
  const { words, markers } = listeningAsrTokens(windows)
  const fuzzy = fuzzyAnchors ? {
    globalWords: globalAnchorWindows === windows ? words : listeningAsrTokens(globalAnchorWindows).words,
    globalCoverage: coversRecording(globalAnchorWindows, durationSeconds),
  } : null
  const orderedGroups = [...groups].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  // Preserve cue scoping to an observed exact lexical tail. This is only an
  // announcement delimiter, never a candidate-pairing/crop/playback constraint.
  const announcementTails = corpus.flatMap(group => {
    const a = anchorsFor(group, corpus, words, expectedListeningReadings(group, instructions).expectedReadings)
    return a.tails.map(index => index + a.width - 1)
  })
  const run = (skeleton = []) => orderedGroups.map(group => {
    const allHeads = skeleton.flatMap(g => g.occurrences.map(o => ({ segmentId: g.segmentId, index: o.startWordIndex })))
    const expected = expectedListeningReadings(group, instructions)
    const result = { segmentId: group.segmentId, questionNumbers: group.questionNumbers, engine,
      ...expected, decision: 'usable', issues: [], occurrences: [], playback: null,
      sourceText: group.text }
    if (expected.issue) problem(result, expected.issue)
    if (!words.length) problem(result, 'ASR_NO_TIMED_WORDS')
    const turns = listeningSourceTurns(group.text)
    const source = turns.flat()
    const sourceRawWords = listeningSourceRawWords(group.text)
    if (!source.length) return problem(result, 'SOURCE_EMPTY')
    const anchor = anchorsFor(group, corpus, words, expected.expectedReadings, fuzzy)
    const protectedQuestion = questionWords(group, questions)
    result.anchors = { width: anchor.width, headPositions: anchor.heads, tailPositions: anchor.tails,
      mode: anchor.fuzzy ? 'one_substitution_12' : 'exact', fuzzy: anchor.fuzzy ?? null }
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
      const anchorSubstitutions = []
      if (anchor.fuzzy) {
        for (const [side, index, sourceOffset] of [['head', startIndex, 0], ['tail', tails[0], source.length - anchor.width]]) {
          const match = anchor.fuzzy[side === 'head' ? 'heads' : 'tails'].find(m => m.index === index)
          for (const difference of match.differences) anchorSubstitutions.push({ ...difference, side,
            sourceWordIndex: sourceOffset + difference.offset, asrWordIndex: index + difference.offset,
            rawSourceWord: sourceRawWords[sourceOffset + difference.offset],
            rawAsrRun: words[index + difference.offset].rawRunText })
        }
        if (anchorSubstitutions.length > 1) issues.push('FUZZY_ANCHOR_BOTH_ENDS_CHANGED')
        if (anchorSubstitutions.some(d => isCritical(d.sourceWord) || isCritical(d.targetWord)
          || protectedQuestion.words.has(d.sourceWord) || protectedQuestion.words.has(d.targetWord))) {
          issues.push('FUZZY_ANCHOR_PROTECTED_WORD')
        }
        if (anchorSubstitutions.length && !protectedQuestion.available) issues.push('FUZZY_ANCHOR_QUESTION_CONTEXT_MISSING')
        if (anchorSubstitutions.length && !anchor.fuzzy.globalProven) issues.push('FUZZY_ANCHOR_GLOBAL_UNPROVEN')
      }
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
      if (alignment.missingSourceIndices.some(index => isCritical(source[index]))) {
        issues.push('CRITICAL_WORD_MISSING')
      }
      if (alignment.differences.some(d => isCritical(d.sourceWord) || isCritical(d.targetWord))) {
        issues.push('CRITICAL_WORD_DIFFERENCE')
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
      const previousBodyEnd = words[announcementTails.filter(index => index < startIndex)
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
      const occurrence = { startWordIndex: startIndex, endWordIndex: endIndex,
        startSeconds: first.runStartSeconds, endSeconds: last.runEndSeconds,
        playback: boundary, alignment, anchorSubstitutions,
        requiresExactCorroboration: anchorSubstitutions.length > 0 && source.length < 24,
        issues: [...new Set(issues)], announcements: relevant,
        evidencePaths: [...new Set(actual.flatMap(w => w.evidencePaths))] }
      result.occurrences.push(occurrence)
      for (const code of issues) problem(result, code)
    }
    if (expected.expectedReadings !== 'unknown'
      && result.occurrences.length !== expected.expectedReadings) problem(result, 'READING_COUNT_MISMATCH')
    for (const [i, current] of result.occurrences.entries()) {
      const previous = result.occurrences[i - 1]
      if (!previous?.playback || !current.playback
        || previous.playback.endSeconds <= current.playback.startSeconds) continue
      const pause = pauses.find(p => p.startSeconds <= current.playback.startSeconds
        && p.endSeconds >= previous.playback.endSeconds)
      const low = Math.max(pause?.startSeconds ?? Infinity,
        previous.endSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
      const high = Math.min(pause?.endSeconds ?? -Infinity,
        current.startSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
      if (low > high) { problem(result, 'READINGS_OVERLAP'); continue }
      const seam = Math.max(low, Math.min(high, (pause.startSeconds + pause.endSeconds) / 2))
      result.boundaryAdjustments ??= []
      result.boundaryAdjustments.push({ betweenReadings: [i, i + 1], pause,
        previousEndSeconds: previous.playback.endSeconds, nextStartSeconds: current.playback.startSeconds,
        sharedBoundarySeconds: seam })
      previous.playback.endSeconds = seam
      current.playback.startSeconds = seam
    }
    if (result.occurrences.some((o, i, list) => i && o.startSeconds < list[i - 1].endSeconds)) problem(result, 'READINGS_OVERLAP')
    if (result.occurrences.length === 2) {
      const [a, b] = result.occurrences.map(o => o.endSeconds - o.startSeconds)
      result.durationRatio = a / b
      if (result.durationRatio < LISTENING_SEGMENT_RULE.durationRatioMinimum
        || result.durationRatio > LISTENING_SEGMENT_RULE.durationRatioMaximum) problem(result, 'READING_DURATION_CONFLICT')
    }
    if (result.occurrences.some(o => o.requiresExactCorroboration)) {
      problem(result, 'FUZZY_ANCHOR_OVERLAP_NEEDS_EXACT_ENGINE')
    }
    if (result.decision === 'usable' && result.occurrences.length) result.playback = {
      startSeconds: result.occurrences[0].playback.startSeconds,
      endSeconds: result.occurrences.at(-1).playback.endSeconds,
    }
    result.independentlyAnchored = result.decision === 'usable'
    return result
  })
  // Candidate pairing cannot depend on a partial/ambiguous foreign head.
  // Freeze independently successful groups before applying any neighbor limits.
  const independent = run()
  const results = run(independent.filter(g => g.independentlyAnchored))
  if (requireWholePaper) validateListeningOrder(results)
  return { ruleVersion: LISTENING_SEGMENT_RULE.version, fuzzyAnchors, engine, groups: results }
}

export function reconcileListeningEngines(apple, whisper) {
  const hardConflict = new Set(['ANNOUNCEMENT_CONFLICT', 'READINGS_OVERLAP', 'READING_DURATION_CONFLICT',
    'ANCHOR_AMBIGUOUS'])
  const results = apple.groups.map(primary => {
    const secondary = whisper?.groups.find(g => g.segmentId === primary.segmentId)
    const attempts = [primary, ...(secondary ? [secondary] : [])]
    let chosen = primary, conflict = false
    const engineConflicts = []
    if (secondary) {
      conflict = attempts.some(a => a.issues.some(code => hardConflict.has(code)))
      for (const attempt of attempts) for (const code of attempt.issues.filter(code => hardConflict.has(code))) {
        engineConflicts.push({ kind: 'attempt_hard_conflict', engine: attempt.engine, code })
      }
      const complete = a => a.occurrences.filter(o => o.alignment.sourceMatchRate >=
        (o.alignment.sourceWordCount < LISTENING_SEGMENT_RULE.shortMaterialWords
          ? LISTENING_SEGMENT_RULE.shortMatchMinimum : LISTENING_SEGMENT_RULE.matchMinimum)
        && o.alignment.editSimilarity >= (o.alignment.sourceWordCount < LISTENING_SEGMENT_RULE.shortMaterialWords
          ? LISTENING_SEGMENT_RULE.shortMatchMinimum : LISTENING_SEGMENT_RULE.matchMinimum))
      const a = complete(primary), b = complete(secondary)
      if (a.length && b.length) {
        if (a.length !== b.length) {
          conflict = true
          engineConflicts.push({ kind: 'complete_occurrence_count', primary: a.length, secondary: b.length })
        } else for (const [i, occurrence] of a.entries()) {
          if (!occurrence.playback || !b[i].playback) continue
          const startDeltaSeconds = b[i].playback.startSeconds - occurrence.playback.startSeconds
          const endDeltaSeconds = b[i].playback.endSeconds - occurrence.playback.endSeconds
          if (Math.abs(startDeltaSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds
            || Math.abs(endDeltaSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds) {
            conflict = true
            engineConflicts.push({ kind: 'playback_boundary', occurrence: i + 1, startDeltaSeconds, endDeltaSeconds })
          }
        }
      }
      if (!conflict && primary.decision !== 'usable' && secondary.decision === 'usable') chosen = secondary
    }
    return { ...chosen, decision: conflict ? 'review_required' : chosen.decision,
      playback: conflict ? null : chosen.playback,
      issues: conflict ? [...new Set([...chosen.issues, 'ENGINE_CONFLICT'])] : [...chosen.issues],
      selectedEngine: chosen.engine, engineAttempts: attempts, engineConflicts }
  })
  return validateListeningOrder(results)
}
