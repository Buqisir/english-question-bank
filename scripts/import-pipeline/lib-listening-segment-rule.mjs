// Pure, platform-independent navigation rule. ASR is evidence, never a source-text editor.
export const LISTENING_SEGMENT_RULE = Object.freeze({
  version: 'listening-segment-rule-v4',
  normalizationVersion: 'listening-equivalences-v4',
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
  isolatedEdgeMaximumWords: 3,
  isolatedEdgeMaximumSeconds: 1.5,
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
  ...Object.fromEntries(['do', 'does', 'did', 'is', 'are', 'was', 'were', 'has', 'have', 'had',
    'could', 'would', 'should', 'must', 'might', 'need', 'ought', 'dare']
    .map(auxiliary => [`${auxiliary}n't`, `${auxiliary} not`])),
  "can't": 'can not', cannot: 'can not', "won't": 'will not', "shan't": 'shall not',
  "i'm": 'i am',
  ...Object.fromEntries(['you', 'we', 'they'].map(subject => [`${subject}'re`, `${subject} are`])),
  ...Object.fromEntries(['i', 'you', 'we', 'they', 'could', 'would', 'should', 'might', 'must']
    .map(subject => [`${subject}'ve`, `${subject} have`])),
  ...Object.fromEntries(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'there', 'that', 'who', 'what']
    .map(subject => [`${subject}'ll`, `${subject} will`])),
})
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const criticalWords = new Set(['not', 'no', 'never', 'none', 'neither', 'nothing', 'nobody', 'nowhere', 'nor', 'without', 'cannot',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
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
const listeningClockLexemes = [
  `\\b\\d{1,2}\\s*:\\s*\\d{2}(?:\\s*${meridiemPattern}(?![a-z]))?`,
  `\\b\\d{1,2}\\s*\\.\\s*\\d{2}\\s*${meridiemPattern}(?![a-z])`,
  `\\b\\d{1,4}\\s*${meridiemPattern}(?![a-z])`,
]
const listeningLexemes = new RegExp([
  '[$£]\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
  ...listeningClockLexemes,
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
function normalizeListeningUnits(value, aliases = []) {
  const text = String(value ?? '')
  // Only exact, valid colon clocks in the source license these ambiguous ASR
  // spellings. Match whole numeric expressions; never a price or digit suffix.
  const lexemes = aliases.length ? new RegExp([
    // Consume the full explicit clock before an alias can take its numeric prefix.
    ...listeningClockLexemes,
    ...aliases.map(({ pattern }) => `(?<![\\w$£.,:])(?:${pattern})(?!\\w|\\s*[.:]\\s*\\d)`),
    listeningLexemes.source,
  ].join('|'), 'giu') : listeningLexemes
  const yearContext = new Set(['in', 'since', 'during', 'until', 'by', 'before', 'after', 'from', 'year'])
  const quantityUnits = new Set(['dollar', 'dollars', 'pound', 'pounds', 'cent', 'cents', 'euro', 'euros',
    'yuan', 'yen', 'hundred', 'thousand', 'million', 'hours', 'minutes', 'seconds'])
  const yearPosition = (start, end) => {
    const prefix = text.slice(0, start).trim()
    const context = prefix.match(/([a-z]+)\s*$/iu)?.[1]?.toLowerCase()
    return ((!prefix && /^[\s.!?。！？]*$/u.test(text.slice(end))) || yearContext.has(context))
      && !quantityUnits.has(text.slice(end).match(/^\s*([a-z]+)/iu)?.[1]?.toLowerCase())
  }
  let units = [...text.matchAll(lexemes)].flatMap(match => {
    const raw = match[0], start = match.index, end = start + raw.length
    const alias = aliases.find(({ matches }) => matches.test(raw))
    const words = lexemeWords(alias ? `${alias.hour}:${String(alias.minute).padStart(2, '0')}` : raw)
    const expressionForm = /\d/u.test(raw) ? 'literal' : 'words'
    let expressionType = /\d/u.test(raw) ? 'cardinal'
      : words.some(w => ordinalSmall.includes(w) || ['twentieth', 'thirtieth'].includes(w)) ? 'ordinal'
        : words.some(w => smallNumbers.includes(w) || tens.includes(w) || ['hundred', 'thousand'].includes(w)) ? 'cardinal' : 'text'
    if (/^\d+(?:st|nd|rd|th)$/iu.test(raw)) expressionType = 'ordinal'
    else if (raw.includes(':') || /\d[\s\S]*[ap]\s*\.?\s*m\.?$/iu.test(raw)
      || words.some(w => ["o'clock", 'am', 'pm'].includes(w))) expressionType = 'time'
    else if (/^\d{4}$/u.test(raw) && yearPosition(start, end)) expressionType = 'year'
    const clock = raw.match(/^(\d{1,2})\s*:\s*(\d{2})$/u)
    const clockValue = clock && Number(clock[1]) <= 23 && Number(clock[2]) <= 59
      ? Number(clock[1]) * 60 + Number(clock[2]) : undefined
    if (alias) expressionType = 'source_clock_alias'
    return words.map(token => ({ token, start, end, expressionType, expressionForm, expressionText: raw,
      ...(alias ? { expressionValue: alias.hour * 60 + alias.minute }
        : clockValue !== undefined ? { expressionValue: clockValue }
          : expressionType === 'year' ? { expressionValue: Number(raw) } : {}) }))
  })
  const adjacent = (a, b) => a.end >= b.start || /^[\s-]*$/u.test(text.slice(a.end, b.start))
  const span = (tokens, first, last, expressionType, expressionValue) => tokens.map(token =>
    ({ token, start: first.start, end: last.end, expressionType, expressionValue,
      expressionForm: 'words', expressionText: text.slice(first.start, last.end) }))
  const result = []
  for (let i = 0; i < units.length; i++) {
    const a = units[i], b = units[i + 1], c = units[i + 2]
    // Do not guess is/has/possessive or had/would from a suffix alone.
    // These finite contexts license the expansion on either input side.
    // Keep the full context's raw span, so timed ASR cannot license it across
    // an invalid run, segment boundary or preparation pause.
    const contracted = a.token.match(/^([a-z]+)'([sd])$/u)
    const subject = contracted?.[1], suffix = contracted?.[2]
    const pronoun = ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'there', 'that', 'who', 'what'].includes(subject)
    let auxiliary
    if (b && adjacent(a, b)) {
      if (suffix === 's' && b.token === 'been') auxiliary = 'has'
      if (suffix === 's' && pronoun && b.token === 'being') auxiliary = 'is'
      // Pronoun subjects cannot be possessors here. Only these published
      // predicative complements license is; gone/finished/not stay ambiguous.
      if (suffix === 's' && ['he', 'she', 'it', 'there', 'that', 'who', 'what'].includes(subject)
        && ['wrong', 'ready', 'afraid', 'happy', 'sorry', 'here', 'there',
          'my', 'your', 'his', 'her', 'its', 'our', 'their'].includes(b?.token)
        && adjacent(a, b)) auxiliary = 'is'
      if (suffix === 'd' && pronoun) {
        if (['been', 'better'].includes(b.token)) auxiliary = 'had'
        else if (['be', 'have', 'like', 'love', 'prefer', 'rather', 'go', 'work', 'join',
          'say', 'take', 'give', 'need', 'want'].includes(b.token)) auxiliary = 'would'
      }
    }
    if (auxiliary) {
      result.push(...span([subject, auxiliary, b.token], a, b, 'text')); i++; continue
    }
    if (a.token === 'half' && b?.token === 'past' && c
      && smallNumbers.indexOf(c.token) >= 1 && smallNumbers.indexOf(c.token) <= 12
      && adjacent(a, b) && adjacent(b, c)) {
      result.push(...span([c.token, 'thirty'], a, c, 'time')); i += 2; continue
    }
    if ((a.token === 'twenty' || (a.token === 'two' && b?.token === 'thousand')) && b && adjacent(a, b)) {
      let numberIndex = i + 1
      if (a.token === 'two') numberIndex += units[numberIndex + 1]?.token === 'and' ? 2 : 1
      const number = units[numberIndex], next = units[numberIndex + 1]
      let remainder = smallNumbers.indexOf(number?.token), last = numberIndex
      if (tens.includes(number?.token)) {
        remainder = tens.indexOf(number.token) * 10
        if (next && smallNumbers.indexOf(next.token) >= 1 && smallNumbers.indexOf(next.token) <= 9 && adjacent(number, next)) {
          remainder += smallNumbers.indexOf(next.token); last++
        }
      } else if (a.token === 'twenty' && ['oh', 'o', 'zero'].includes(number?.token) && next && adjacent(number, next)
        && smallNumbers.indexOf(next.token) >= 1 && smallNumbers.indexOf(next.token) <= 9) {
        remainder = smallNumbers.indexOf(next.token); last++
      }
      // Expanded time/cardinal tokens are never evidence of a word-form year.
      const originalWords = units.slice(i, last + 1).every((unit, j, list) =>
        unit.expressionForm === 'words' && ['text', 'cardinal'].includes(unit.expressionType)
        && (!j || adjacent(list[j - 1], unit)))
      if (remainder >= 1 && remainder <= 99 && (a.token === 'two' || remainder >= 10 || last > i + 1)
        && originalWords && yearPosition(a.start, units[last].end)
        && !ordinalSmall.includes(units[last + 1]?.token)) {
        result.push(...span(numberWords(2000 + remainder).split(' '), a, units[last], 'year', 2000 + remainder))
        i = last; continue
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

function sourceClockAliases(corpus) {
  const turns = corpus.flatMap(group => listeningSourceTurnText(group, corpus))
    .map(text => normalizeListeningUnits(text))
  const clocks = new Set(turns.flat().filter(unit => unit.expressionType === 'time'
    && unit.expressionValue !== undefined).map(unit => unit.expressionValue))
  return [...clocks].flatMap(value => {
    const hour = Math.floor(value / 60), minute = value % 60
    const mm = String(minute).padStart(2, '0')
    return [...new Set([String(hour), String(hour).padStart(2, '0')])].flatMap(h =>
      [[`${h}${mm}`, `${h}${mm}`], [`${h}.${mm}`, `${h}\\s*\\.\\s*${mm}`], [`${h} ${mm}`, `${h}\\s+${mm}`]]
        // If the source also contains this quantity/year reading, the ASR
        // spelling is ambiguous. Keep its ordinary numeric meaning rather than
        // breaking valid quantities or assigning them to the clock.
        .filter(([raw]) => {
          const tokens = normalizeListeningText(raw)
          return !turns.some(units => positions(units, tokens)
            .some(index => units.slice(index, index + tokens.length).every(unit => unit.expressionType !== 'time')))
        })
        .map(([, pattern]) => ({ hour, minute, pattern, matches: new RegExp(`^(?:${pattern})$`, 'u') })))
  })
}

// Square brackets are ambiguous in isolation. Confirm the document's annotation
// convention from question-bound, sentence/turn-leading marks across groups AND
// a repeated question mark with numbered evidence points (e.g. [7]① / [7]②).
// An unknown source layout keeps its brackets and fails closed.
function questionMarks(group) {
  return [...String(group.text ?? '').matchAll(/\[(\d{1,2})\]([①-⑳]?)/gu)]
    .filter(m => group.questionNumbers?.includes(Number(m[1]))
      && /(?:^|[.!?。！？]\s*|(?:^|\n)\s*(?:M|W|Speaker \d+):\s*)$/u.test(group.text.slice(0, m.index))
      && /^[\s]*[A-Z]/u.test(group.text.slice(m.index + m[0].length)))
}
function annotationLayout(group, corpus) {
  const documentId = group.source?.kind === 'page_region' && group.source.documentId
  if (!documentId) return null
  const peers = corpus.filter(g => g.source?.kind === 'page_region' && g.source.documentId === documentId)
    .map(g => ({ group: g, marks: questionMarks(g) })).filter(g => g.marks.length)
  const pointSeries = peers.some(({ marks }) => marks.some(a => a[2]
    && marks.some(b => a[1] === b[1] && b[2] && a[2] !== b[2])))
  if (peers.length < 2 || new Set(peers.flatMap(p => p.marks.map(m => m[1]))).size < 3 || !pointSeries) return null
  return peers.map(p => ({ segmentId: p.group.segmentId, source: p.group.source,
    spans: p.marks.map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0] })) }))
}

export function projectListeningSpokenText(group, corpus = [group]) {
  if (typeof group === 'string') group = { text: group }
  const sourceText = String(group.text ?? '')
  const exclusions = []
  const exclude = (start, end, reason, evidence = null) => {
    if (start >= end || exclusions.some(s => start < s.end && end > s.start)) return
    exclusions.push({ start, end, text: sourceText.slice(start, end), reason,
      source: group.source ?? null, segmentId: group.segmentId ?? null, evidence })
  }
  const groupNumber = Number(group.segmentId?.match(/(\d+)$/u)?.[1])
  // Recognize complete furniture lines, never arbitrary text before a speaker.
  let prefix = true
  for (const line of sourceText.matchAll(/[^\n]+/gu)) {
    const text = line[0].trim()
    if (prefix && /^(?:Text\s+\d+|\(Text\s+\d+\)|第[一二]节)$/iu.test(text)) {
      const number = text.match(/\d+/u)?.[0]
      if (!number || Number(number) === groupNumber) {
        exclude(line.index, line.index + line[0].length, 'group_heading')
        continue
      }
    }
    // Finite Chinese exam-instruction grammar. The entire line must consist
    // of recognized instruction sentences; a mixed line retains spoken text.
    const sentences = text.match(/[^。]+。?/gu) || []
    const instruction = sentence => /^(?:听下面\d+段录音|每段录音后有(?:一个|几个)小题，从题中所给的A、B、C三个选项中选出最佳选项|听完每段录音后，你都有\d+秒钟的时间来回答有关小题和阅读下一小题|每段录音(?:播放|读)[一两二12]遍|现在，你有\d+秒钟的时间阅读第\d+小题的有关内容|听下面的录音，回答第\d+(?:和第\d+)?小题|听每段录音前，你将有时间阅读各个小题，每小题\d+秒钟；听完后，每小题都有\d+秒钟的作答时间|现在，你有\d+秒钟的时间阅读这两个小题)。?$/u.test(sentence.trim())
    if (prefix && sentences.length && sentences.every(instruction)) {
      exclude(line.index, line.index + line[0].length, 'playback_instruction')
      continue
    }
    prefix = false
  }
  const layout = annotationLayout(group, corpus)
  if (layout) for (const mark of questionMarks(group)) {
    exclude(mark.index, mark.index + mark[0].length, 'question_evidence_annotation', layout)
  }
  // Retain the historical parenthesized question/circled-point convention,
  // now bound to this group's questions and recorded with source coordinates.
  for (const mark of sourceText.matchAll(/\((\d+)\)([①-⑳]?)|[①-⑳]/gu)) {
    if (!mark[1] || group.questionNumbers?.includes(Number(mark[1]))) {
      exclude(mark.index, mark.index + mark[0].length, 'source_annotation')
    }
  }
  for (const match of sourceText.matchAll(/(?:^|\n)\s*(?:\d+\.\s*)?(?:M|W|Speaker \d+):\s*/gu)) {
    exclude(match.index, match.index + match[0].length, 'speaker_label')
  }
  exclusions.sort((a, b) => a.start - b.start)
  // Mask rather than concatenate: coordinates still address the exact source,
  // and removing an annotation cannot accidentally join two lexical words.
  let cursor = 0, text = ''
  for (const span of exclusions) {
    text += sourceText.slice(cursor, span.start) + span.text.replace(/[^\n]/gu, ' ')
    cursor = span.end
  }
  text += sourceText.slice(cursor)
  return { version: 'listening-spoken-projection-v1', sourceText, text, exclusions }
}
function listeningSourceTurnText(group, corpus) {
  const projection = group.sourceProjection ?? projectListeningSpokenText(group, corpus)
  const turns = []
  let start = 0
  for (const span of projection.exclusions.filter(s => s.reason === 'speaker_label')) {
    turns.push(projection.text.slice(start, span.start).trim())
    start = span.end
  }
  turns.push(projection.text.slice(start).trim())
  return turns.filter(Boolean)
}
export function listeningSourceTurns(group, corpus) {
  if (typeof group === 'string') group = { text: group }
  return listeningSourceTurnText(group, corpus).map(normalizeListeningText).filter(turn => turn.length)
}
function listeningSourceRawWords(group, corpus) {
  return listeningSourceTurnText(group, corpus).flatMap(turn =>
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
function timedListeningUnits(runs, offset, windowEnd, idPrefix, evidencePaths, clockAliases) {
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
  for (const unit of normalizeListeningUnits(joined, clockAliases)) {
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
      expressionType: unit.expressionType, expressionForm: unit.expressionForm,
      expressionText: unit.expressionText, expressionValue: unit.expressionValue,
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
export function listeningAsrTokens(windows, clockAliases = []) {
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
        `${windowIndex}:${segmentIndex}`, window.evidencePaths || [], clockAliases))
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
  // Window selection above chooses a clock for anchors/counts. Losing windows
  // and text without anchors still carry counterevidence, including crop edges.
  const observedWindows = windowsWithWords.map(({window, words}) => ({
    startSeconds: window.startSeconds, endSeconds: window.endSeconds,
    evidencePaths: window.evidencePaths || [],
    words: words.map(({token, startSeconds, endSeconds, runStartSeconds, runEndSeconds, rawRunText,
      expressionType, expressionForm, expressionText, expressionValue}) => ({
      token, startSeconds, endSeconds, runStartSeconds, runEndSeconds, rawRunText,
      expressionType, expressionForm, expressionText, expressionValue})),
  }))
  return { words, markers, observedWindows }
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
function compatibleYearExpressions(source, target) {
  if (!source || (source.expressionType !== 'year' && target.expressionType !== 'year')) return true
  if (source.expressionType !== 'year' || target.expressionType !== 'year'
    || source.expressionValue !== target.expressionValue) return false
  if (source.expressionForm !== target.expressionForm || source.expressionForm === 'literal') return true
  // Identical spoken words need no equivalence. Rewriting between different
  // word readings is only licensed by a four-digit literal on the other side.
  const words = text => text.toLowerCase().replace(/[-\s]+/gu, ' ')
  return words(source.expressionText) === words(target.expressionText)
}
export function alignListeningOccurrence(source, target, sourceUnits = []) {
  const equal = (i, j) => source[i] === target[j].token && compatibleYearExpressions(sourceUnits[i], target[j])
    // A clock elsewhere in the corpus cannot license a quantity in this
    // occurrence, even if its expanded words happen to be identical.
    && (target[j].expressionType !== 'source_clock_alias'
      || (sourceUnits[i]?.expressionType === 'time'
        && sourceUnits[i].expressionValue === target[j].expressionValue))
  const trace = [new Uint8Array(target.length + 1).fill(2)]
  let previous = Array.from({ length: target.length + 1 }, (_, i) => i)
  for (let i = 1; i <= source.length; i++) {
    const row = [i]
    const moves = new Uint8Array(target.length + 1)
    moves[0] = 1
    for (let j = 1; j <= target.length; j++) {
      const costs = [previous[j - 1] + Number(!equal(i - 1, j - 1)),
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
      if (equal(i - 1, j - 1)) matched.push(i - 1)
      else {
        missing.push(i - 1)
        differences.push({ kind: 'substitution', sourceIndex: i - 1, targetIndex: j - 1,
          sourceWord: source[i - 1], targetWord: target[j - 1].token,
          ...(sourceUnits[i - 1] ? { sourceExpressionType: sourceUnits[i - 1].expressionType,
            targetExpressionType: target[j - 1].expressionType } : {}) })
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
  const source = listeningSourceTurns(group, corpus).flat()
  let exact
  for (const length of [LISTENING_SEGMENT_RULE.anchorWords, LISTENING_SEGMENT_RULE.expandedAnchorWords]) {
    const width = Math.min(length, source.length)
    const head = source.slice(0, width), tail = source.slice(-width)
    const uniqueSource = [head, tail].every(anchor =>
      positions(source, anchor).length === 1
      && corpus.filter(other => other.segmentId !== group.segmentId)
        .every(other => positions(listeningSourceTurns(other, corpus).flat(), anchor).length === 0))
    const heads = positions(words, head), tails = positions(words, tail)
    // Exact repetitions are counted from audio, not capped by print.
    exact = { width, head, tail, heads, tails, identityAmbiguous: !uniqueSource,
      countExceeded: false, ambiguous: !uniqueSource }
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
        .every(other => !substitutionMatches(listeningSourceTurns(other, corpus).flat(), a).length)
  })
  const globalHeads = substitutionMatches(fuzzy.globalWords, head)
  const globalTails = substitutionMatches(fuzzy.globalWords, tail)
  const ambiguous = !sourceUnique || (expected !== 'unknown'
    && [heads, tails, globalHeads, globalTails].some(m => m.length > expected))
  const sameTimes = (local, global) => local.every(candidate => global.some(other =>
    Math.abs(words[candidate.index].startSeconds - fuzzy.globalWords[other.index].startSeconds)
      <= LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds))
  return { width, head, tail, heads: heads.map(m => m.index), tails: tails.map(m => m.index),
    ambiguous, identityAmbiguous: !sourceUnique,
    countExceeded: expected !== 'unknown' && [heads, tails, globalHeads, globalTails].some(m => m.length > expected),
    fuzzy: { heads, tails, globalHeadPositions: globalHeads.map(m => m.index),
      globalTailPositions: globalTails.map(m => m.index), globalCoverage: fuzzy.globalCoverage,
      globalProven: fuzzy.globalCoverage && expected !== 'unknown'
        && globalHeads.length === expected && globalTails.length === expected
        && sameTimes(heads, globalHeads) && sameTimes(tails, globalTails) } }
}

// Boundary safety consumes every raw timed run, including Chinese prompts and
// windows discarded by lexical overlap selection. Keep run identity until the
// cross-engine check; an interval union alone cannot distinguish a second
// timestamp for the terminal word from a new prompt.
function mergeSpeechIntervals(intervals) {
  const merged = []
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (merged.length && start <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(end, merged.at(-1)[1])
    else merged.push([start, end])
  }
  return merged
}
function boundarySpeechRuns(windows, pauses, engine) {
  return windows.flatMap((w, windowIndex) => w.error ? [] :
    (w.result?.segments || w.segments || []).flatMap((segment, segmentIndex) => {
      const runs = segment.runs || segment.words || []
      const tokens = timedListeningUnits(runs, w.startSeconds ?? 0, w.endSeconds,
        `${windowIndex}:${segmentIndex}`, w.evidencePaths || [])
      const terminalIndices = new Map(tokens.flatMap((t, i) => t.endBoundary ? [[t.runId, i]] : []))
      return (runs.length ? runs : [segment]).flatMap((run, runIndex) => {
        const start = (w.startSeconds ?? 0) + Number(run.start ?? run.startSeconds)
        const end = (w.startSeconds ?? 0) + Number(run.end ?? run.endSeconds)
        const text = String(run.word ?? run.text ?? '').trim()
        if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end < start
          || start < (w.startSeconds ?? 0) || end > w.endSeconds + 0.5) return []
        const runId = `${windowIndex}:${segmentIndex}:${runIndex}`
        const last = terminalIndices.get(runId)
        const afterPause = pauses.find(p => p.endSeconds > end && p.startSeconds >= start
          && p.startSeconds - end <= LISTENING_SEGMENT_RULE.boundarySearchSeconds
          && p.endSeconds >= end + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
        return [{engine: w.engine?.name || engine, runId, evidencePaths: w.evidencePaths || [],
          startSeconds: start, endSeconds: end, text,
          tail: last === undefined ? [] : tokens.slice(Math.max(0, last + 1 - LISTENING_SEGMENT_RULE.anchorWords), last + 1)
            .map(t => t.token), afterPause: afterPause ?? null}]
      })
    }))
}
function sameTerminalPronunciation(run, occurrence) {
  const edge = occurrence.terminalRun, pause = occurrence.boundaryEvidence?.afterPause
  if (!edge || !pause || !run.afterPause
    || run.startSeconds >= edge.endSeconds || run.endSeconds <= edge.startSeconds) return false
  const tokens = normalizeListeningText(run.text)
  return Boolean(
    // Lexical normalization must not hide a Chinese/other-language prompt
    // appended to an otherwise matching English terminal run.
    !/[\p{L}\p{N}]/u.test(run.text.replace(/[a-z0-9]/giu, ''))
    && run.startSeconds >= occurrence.startSeconds
    && run.endSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds <= pause.startSeconds
    && occurrence.endSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds <= pause.startSeconds
    && run.afterPause.startSeconds === pause.startSeconds && run.afterPause.endSeconds === pause.endSeconds
    && tokens.length && tokens.length <= edge.tail.length
    && tokens.every((t, i) => t === edge.tail[edge.tail.length - tokens.length + i])
    && run.tail.length === edge.tail.length && run.tail.every((t, i) => t === edge.tail[i]))
}
function boundaryObstructions(first, last, evidence, speech) {
  const gaps = [[evidence.beforePause?.endSeconds, first, evidence.skippedBefore?.length],
    [last, evidence.afterPause?.startSeconds, evidence.skippedAfter?.length]]
  return gaps.flatMap(([start, end, skipped], side) => skipped && end > start
    ? speech.filter(([a, b]) => a < end && b > start).map(interval => ({side: side ? 'end' : 'start', interval})) : [])
}
function boundsFor(first, last, pauses, duration, speechRuns, terminalRun, endLimitSeconds = Infinity) {
  const beforeCandidates = pauses.filter(p => p.startSeconds < first.runStartSeconds
    && p.endSeconds <= first.runEndSeconds
    && first.runStartSeconds - p.endSeconds <= LISTENING_SEGMENT_RULE.boundarySearchSeconds)
  const before = beforeCandidates.filter(p =>
    p.startSeconds <= Math.max(0, first.runStartSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)).at(-1)
  const afterCandidates = pauses.filter(p => p.endSeconds > last.runEndSeconds
    && p.startSeconds >= last.runStartSeconds
    && p.startSeconds - last.runEndSeconds <= LISTENING_SEGMENT_RULE.boundarySearchSeconds)
  const after = afterCandidates.find(p =>
    p.endSeconds >= Math.min(duration, last.runEndSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds))
  const evidence = {beforePause: before ?? null, afterPause: after ?? null,
    skippedBefore: before ? beforeCandidates.slice(beforeCandidates.indexOf(before) + 1) : [],
    skippedAfter: after ? afterCandidates.slice(0, afterCandidates.indexOf(after)) : [],
    endLimitSeconds: Number.isFinite(endLimitSeconds) ? endLimitSeconds : null}
  if (!before || !after || !first.startBoundary || !last.endBoundary) return {playback: null, evidence}
  // ASR word intervals often include silence. Keep the entire acoustic run and
  // choose a point inside the adjacent pause, including when they overlap.
  const startSeconds = Math.max(0, Math.min(first.runStartSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds,
    (before.startSeconds + before.endSeconds) / 2))
  const endSeconds = Math.min(duration, endLimitSeconds, Math.max(last.runEndSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds,
    (after.startSeconds + after.endSeconds) / 2))
  const occurrence = {startSeconds: first.runStartSeconds, endSeconds: last.runEndSeconds,
    terminalRun, boundaryEvidence: evidence}
  const speech = mergeSpeechIntervals(speechRuns.filter(run => !sameTerminalPronunciation(run, occurrence))
    .map(run => [run.startSeconds, run.endSeconds]))
  evidence.obstructions = boundaryObstructions(first.runStartSeconds, last.runEndSeconds, evidence, speech)
  const valid = startSeconds >= before.startSeconds && startSeconds <= before.endSeconds
    && endSeconds >= after.startSeconds && endSeconds <= after.endSeconds
    && startSeconds < first.runStartSeconds && endSeconds > last.runEndSeconds
    && endSeconds >= Math.min(duration, last.runEndSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
    && endSeconds <= endLimitSeconds && !evidence.obstructions.length
  return {playback: valid ? {startSeconds, endSeconds} : null, evidence}
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
  const clockAliases = sourceClockAliases(corpus)
  const { words, markers, observedWindows } = listeningAsrTokens(windows, clockAliases)
  const speechRuns = boundarySpeechRuns([...new Set([...windows, ...globalAnchorWindows])], pauses, engine)
  const boundarySpeech = mergeSpeechIntervals(speechRuns.map(r => [r.startSeconds, r.endSeconds]))
  const fuzzy = fuzzyAnchors ? {
    globalWords: globalAnchorWindows === windows ? words : listeningAsrTokens(globalAnchorWindows, clockAliases).words,
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
      ...expected, notes: [], decision: 'usable', issues: [], occurrences: [], playback: null,
      sourceText: group.text, sourceProjection: projectListeningSpokenText(group, corpus),
      boundarySpeech, boundarySpeechRuns: speechRuns, partialOccurrences: [],
      observedWindows }
    if (expected.issue) problem(result, expected.issue)
    if (!words.length) problem(result, 'ASR_NO_TIMED_WORDS')
    const turns = listeningSourceTurns(result)
    const source = turns.flat()
    const sourceUnits = listeningSourceTurnText(result).flatMap(text => normalizeListeningUnits(text))
    const sourceRawWords = listeningSourceRawWords(result)
    if (!source.length) return problem(result, 'SOURCE_EMPTY')
    const anchor = anchorsFor(group, corpus, words, expected.expectedReadings, fuzzy)
    const protectedQuestion = questionWords(group, questions)
    result.anchors = { width: anchor.width, headPositions: anchor.heads, tailPositions: anchor.tails,
      mode: anchor.fuzzy ? 'one_substitution_12' : 'exact', fuzzy: anchor.fuzzy ?? null }
    result.anchorEvidence = {
      heads: anchor.heads.map(i => ({startSeconds: words[i].runStartSeconds,
        endSeconds: words[i + anchor.width - 1].runEndSeconds,
        wordStartSeconds: words[i].startSeconds, wordEndSeconds: words[i + anchor.width - 1].endSeconds})),
      tails: anchor.tails.map(i => ({startSeconds: words[i].runStartSeconds,
        endSeconds: words[i + anchor.width - 1].runEndSeconds,
        wordStartSeconds: words[i].startSeconds, wordEndSeconds: words[i + anchor.width - 1].endSeconds})),
    }
    if (anchor.identityAmbiguous) problem(result, 'ANCHOR_IDENTITY_AMBIGUOUS')
    if (anchor.countExceeded) problem(result, 'OBSERVED_READING_COUNT_EXCEEDED')
    const groupNumber = Number(group.segmentId.match(/(\d+)$/u)?.[1])
    for (const [headNumber, startIndex] of anchor.heads.entries()) {
      const nextHead = anchor.heads[headNumber + 1] ?? words.length
      const foreignHead = allHeads.filter(h => h.segmentId !== group.segmentId && h.index > startIndex)
        .reduce((end, h) => Math.min(end, h.index), nextHead)
      const tails = anchor.tails.filter(index => index + anchor.width > startIndex
        && index + anchor.width <= foreignHead)
      if (tails.length !== 1) {
        problem(result, 'OCCURRENCE_TAIL_MISSING_OR_AMBIGUOUS')
        if (tails.length > 1) problem(result, 'ANCHOR_IDENTITY_AMBIGUOUS')
        // Preserve the observed partial reading, including critical words.
        // It is counterevidence only, never an approved occurrence.
        result.partialOccurrences.push({startSeconds: words[startIndex].runStartSeconds,
          anchorEndSeconds: words[startIndex + anchor.width - 1].runEndSeconds,
          words: words.slice(startIndex, foreignHead).map(({token, startSeconds, endSeconds,
            expressionType, expressionForm, expressionText, expressionValue}) => ({
            token, startSeconds, endSeconds, expressionType, expressionForm, expressionText, expressionValue}))})
        continue
      }
      const endIndex = tails[0] + anchor.width
      const actual = words.slice(startIndex, endIndex)
      const first = actual[0], last = actual.at(-1)
      const alignment = alignListeningOccurrence(source, actual, sourceUnits)
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
      const endLimitSeconds = Math.min(words[nextHead]
        ? words[nextHead].runStartSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds : Infinity,
        ...skeleton.filter(g => g.segmentId !== group.segmentId && g.playback?.startSeconds > last.runEndSeconds)
          .map(g => g.playback.startSeconds))
      const terminalRun = {runId: last.runId, startSeconds: last.runStartSeconds, endSeconds: last.runEndSeconds,
        tail: actual.slice(-LISTENING_SEGMENT_RULE.anchorWords).map(w => w.token)}
      const bounds = boundsFor(first, last, pauses, durationSeconds, speechRuns, terminalRun, endLimitSeconds)
      let boundary = bounds.playback
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
        boundaryEvidence: bounds.evidence,
        terminalRun,
        requiresExactCorroboration: anchorSubstitutions.length > 0 && source.length < 24,
        issues: [...new Set(issues)], announcements: relevant,
        evidencePaths: [...new Set(actual.flatMap(w => w.evidencePaths))] }
      result.occurrences.push(occurrence)
      for (const code of issues) problem(result, code)
    }
    // A missing head leaves a tail candidate too. Preserve its observed words
    // so a critical contradiction cannot disappear merely by losing the head.
    for (const [i, tailIndex] of anchor.tails.entries()) {
      const endIndex = tailIndex + anchor.width
      if (result.occurrences.some(o => o.endWordIndex === endIndex)) continue
      const startIndex = i ? anchor.tails[i - 1] + anchor.width : 0
      result.partialOccurrences.push({startSeconds: words[tailIndex].runStartSeconds,
        anchorEndSeconds: words[endIndex - 1].runEndSeconds,
        words: words.slice(startIndex, endIndex).map(({token, startSeconds, endSeconds,
          expressionType, expressionForm, expressionText, expressionValue}) => ({
          token, startSeconds, endSeconds, expressionType, expressionForm, expressionText, expressionValue}))})
    }
    if (expected.expectedReadings !== 'unknown'
      && result.occurrences.length !== expected.expectedReadings) problem(result, 'READING_COUNT_MISMATCH')
    // The downstream instruction-correction contract only supports once/twice.
    if (result.occurrences.length > 2) problem(result, 'OBSERVED_READING_COUNT_EXCEEDED')
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
    if (result.occurrences.length >= 2) {
      const durations = result.occurrences.map(o => o.endSeconds - o.startSeconds)
      result.durationRatios = durations.flatMap((a, i) => durations.slice(i + 1).map(b => a / b))
      result.durationRatio = result.durationRatios[0]
      if (result.durationRatios.some(ratio => ratio < LISTENING_SEGMENT_RULE.durationRatioMinimum
        || ratio > LISTENING_SEGMENT_RULE.durationRatioMaximum)) problem(result, 'READING_DURATION_CONFLICT')
    }
    if (result.occurrences.some(o => o.requiresExactCorroboration)) {
      problem(result, 'FUZZY_ANCHOR_OVERLAP_NEEDS_EXACT_ENGINE')
    }
    // Owner 2026-10-23: source words are authoritative, but only after every
    // observed reading has reliable outer boundaries and passes the body gates.
    const lexical = new Set(['CRITICAL_WORD_MISSING', 'CRITICAL_WORD_DIFFERENCE'])
    const count = new Set(['READING_COUNT_MISMATCH', 'OBSERVED_READING_COUNT_EXCEEDED'])
    const completeBoundaries = result.occurrences.length > 0 && !result.partialOccurrences.length
      && anchor.heads.length === result.occurrences.length && anchor.tails.length === result.occurrences.length
      && result.occurrences.every(o => o.playback && o.issues.every(code => lexical.has(code)))
      && result.issues.every(code => lexical.has(code) || count.has(code))
    if (completeBoundaries) {
      const globalWords = globalAnchorWindows === windows ? words : listeningAsrTokens(globalAnchorWindows).words
      const globalAnchor = anchorsFor(group, corpus, globalWords, 'unknown')
      // A crop alone cannot prove that a printed second reading is absent.
      // Missing both anchors can hide a whole reading even in a full recording.
      // Never infer fewer readings than print, or approve unsupported counts.
      const completeCount = [1, 2].includes(result.occurrences.length)
        && (expected.expectedReadings === 'unknown'
          || result.occurrences.length >= expected.expectedReadings)
        && coversRecording(globalAnchorWindows, durationSeconds)
        && !anchor.fuzzy && !globalAnchor.identityAmbiguous
        && globalAnchor.heads.length === result.occurrences.length
        && globalAnchor.tails.length === result.occurrences.length
        && [globalAnchor.heads, globalAnchor.tails].every((indices, side) => indices.every((index, i) =>
          Math.abs((side ? globalWords[index + globalAnchor.width - 1].runEndSeconds
            : globalWords[index].runStartSeconds)
            - (side ? result.occurrences[i].endSeconds : result.occurrences[i].startSeconds))
              <= LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds))
      const recorded = result.issues.filter(code => lexical.has(code) || (completeCount && count.has(code)))
      result.notes.push(...recorded)
      result.issues = result.issues.filter(code => !recorded.includes(code))
      for (const occurrence of result.occurrences) {
        occurrence.notes = occurrence.issues.filter(code => lexical.has(code))
        occurrence.issues = occurrence.issues.filter(code => !lexical.has(code))
      }
      if (completeCount && result.occurrences.length !== expected.expectedReadings) {
        result.readingCountEvidence = { printedReadings: expected.expectedReadings,
          observedReadings: result.occurrences.length, complete: true,
          instructionCorrectionRequired: true }
      }
      result.decision = result.issues.length ? 'review_required' : 'usable'
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

// Match physical readings, never array indices: a lone complete occurrence may
// be the second reading. Every observed head/tail must be an ordered subset.
function compareObservedReadings(observed, reference, referenceIsSecondary = true) {
  const conflicts = []
  const overlaps = (a, b) => a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds
  const match = span => reference.occurrences.flatMap((o, i) => overlaps(span, o) ? [i] : [])
  const orderedMatches = spans => {
    let previous = -1
    return spans.map(span => {
      const candidates = match(span)
      const index = candidates.length === 1 ? candidates[0] : -1
      if (index <= previous) conflicts.push({kind: 'occurrence_identity_or_order', engine: observed.engine, span})
      previous = index
      return index
    })
  }
  if (observed.sourceText !== reference.sourceText
    || observed.questionNumbers.join(',') !== reference.questionNumbers.join(',')) {
    conflicts.push({kind: 'group_identity', engine: observed.engine})
  }
  for (const side of ['heads', 'tails']) orderedMatches(observed.anchorEvidence?.[side] || [])
  const matches = orderedMatches(observed.occurrences)
  for (const [i, occurrence] of observed.occurrences.entries()) {
    const other = reference.occurrences[matches[i]]
    if (!other || !occurrence.playback || !other.playback) continue
    // Keep the published diagnostic sign: secondary minus primary, whichever
    // engine supplied the complete reference readings.
    const direction = referenceIsSecondary ? 1 : -1
    const startDeltaSeconds = direction * (other.playback.startSeconds - occurrence.playback.startSeconds)
    const endDeltaSeconds = direction * (other.playback.endSeconds - occurrence.playback.endSeconds)
    if (Math.abs(startDeltaSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds
      || Math.abs(endDeltaSeconds) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds) {
      conflicts.push({kind: 'playback_boundary', engine: observed.engine,
        occurrence: referenceIsSecondary ? i + 1 : matches[i] + 1,
        observedOccurrence: i + 1, referenceOccurrence: matches[i] + 1, startDeltaSeconds, endDeltaSeconds})
    }
  }
  for (const partial of observed.partialOccurrences || []) {
    const candidates = match({startSeconds: partial.startSeconds,
      endSeconds: partial.anchorEndSeconds})
    if (candidates.length !== 1) {
      conflicts.push({kind: 'partial_occurrence_identity', engine: observed.engine, startSeconds: partial.startSeconds})
      continue
    }
  }
  return [...conflicts, ...compareObservedWords(observed, reference), ...compareObservedWords(reference, reference)]
}

function compareObservedWords(observed, reference) {
  const conflicts = []
  const overlaps = (a, b) => a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds
  const match = span => reference.occurrences.flatMap((o, i) => overlaps(span, o) ? [i] : [])
  const sourceUnits = listeningSourceTurnText({ ...reference, text: reference.sourceText }).flatMap(text => normalizeListeningUnits(text))
  const source = sourceUnits.map(u => u.token)
  // Anchors are unnecessary for counterevidence. Inspect every original window,
  // rather than cropping an anchored candidate to the other ASR's body ±0.5s.
  // Only measured outer pauses establish physical limits; keep speech in those
  // pauses too, since a disputed edge cannot license fallback. A uniquely
  // matched adjacent head/tail can establish ownership of a neighboring reading.
  const windows = observed.observedWindows
    ?? (observed.partialOccurrences || []).map(p => ({words: p.words}))
  for (const [index, other] of reference.occurrences.entries()) {
    let low = other.boundaryEvidence?.beforePause?.startSeconds
    let high = other.boundaryEvidence?.afterPause?.endSeconds
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      if (windows.some(w => w.words.some(word => overlaps(word, other)))) {
        conflicts.push({kind: 'observed_speech_identity', engine: observed.engine, referenceOccurrence: index + 1})
      }
      continue
    }
    for (const tail of observed.anchorEvidence?.tails || []) {
      const owners = match(tail)
      if (owners.length === 1 && owners[0] < index) low = Math.max(low, tail.endSeconds)
    }
    for (const head of observed.anchorEvidence?.heads || []) {
      const owners = match(head)
      if (owners.length === 1 && owners[0] > index) high = Math.min(high, head.startSeconds)
    }
    const ownAnchors = [...(observed.anchorEvidence?.heads || []), ...(observed.anchorEvidence?.tails || [])]
      .filter(anchor => {
        const owners = match(anchor)
        return owners.length === 1 && owners[0] === index
      })
    for (const window of windows) {
      // Retain entire acoustic runs: normalization may split a number or a
      // contraction across several units whose interpolated times cross a cut.
      const span = word => ({startSeconds: word.runStartSeconds ?? word.startSeconds,
        endSeconds: word.runEndSeconds ?? word.endSeconds})
      const words = window.words.filter(word => overlaps(span(word), {startSeconds: low, endSeconds: high}))
      if (!words.length) continue
      const alignment = alignListeningOccurrence(source, words, sourceUnits)
      const first = alignment.matchedSourceIndices[0], last = alignment.matchedSourceIndices.at(-1)
      if (first === undefined || words.some(word => match(span(word)).length > 1)) {
        conflicts.push({kind: 'observed_speech_identity', engine: observed.engine,
          referenceOccurrence: index + 1, evidencePaths: window.evidencePaths || []})
      }
      // Use the existing tolerance to reject unexplained edge speech, never to
      // discard it. A matched anchor proves ownership despite timestamp drift;
      // an independent late "there" or prompt has no such proof.
      const tolerance = LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds
      const edgeWords = words.filter(word =>
        (word.endSeconds < other.startSeconds - tolerance || word.startSeconds > other.endSeconds + tolerance)
        && !ownAnchors.some(anchor => overlaps(word,
          {startSeconds: anchor.wordStartSeconds, endSeconds: anchor.wordEndSeconds})))
      if (edgeWords.length) conflicts.push({kind: 'unassigned_edge_speech', engine: observed.engine,
        referenceOccurrence: index + 1, evidencePaths: window.evidencePaths || [], words: edgeWords})
      // Truly unobserved prefixes/suffixes assert no deletion. Every observed
      // critical insertion/substitution and internal deletion remains blocking.
      const differences = alignment.differences.filter(d =>
        (d.kind !== 'deletion' || (d.sourceIndex > first && d.sourceIndex < last))
        && (isCritical(d.sourceWord) || isCritical(d.targetWord)))
      if (differences.length) conflicts.push({kind: 'observed_critical_word_difference', engine: observed.engine,
        referenceOccurrence: index + 1, evidencePaths: window.evidencePaths || [], differences})
    }
  }
  return conflicts
}

const spansOverlap = (a, b) => a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds
const acousticSpan = word => ({startSeconds: word.runStartSeconds ?? word.startSeconds,
  endSeconds: word.runEndSeconds ?? word.endSeconds})
const observedWords = attempt => (attempt.observedWindows || []).flatMap(w => w.words)
function windowsCover(attempt, span) {
  let covered = span.startSeconds
  for (const window of [...(attempt.observedWindows || [])].sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (window.startSeconds > covered) break
    covered = Math.max(covered, window.endSeconds)
    if (covered >= span.endSeconds) return true
  }
  return false
}
const sameSpeechEngine = (run, attempt) => run.engine === attempt.engine || run.engine?.startsWith(`${attempt.engine}/`)
const ignoredEdgeWord = (word, attempt, notes) => notes.some(note => sameSpeechEngine(attempt, note)
  && acousticSpan(word).startSeconds >= note.startSeconds
  && acousticSpan(word).endSeconds <= note.endSeconds)

function isolatedEdgeNotes(attempts, reference, corpus) {
  const notes = []
  const occurrences = reference.occurrences
  const otherBodies = corpus.filter(g => g.segmentId !== reference.segmentId)
    .flatMap(g => g.occurrences.filter(o => o.playback))
  const zones = occurrences.flatMap((o, i) => [
    {startSeconds: o.boundaryEvidence?.beforePause?.startSeconds, endSeconds: o.startSeconds},
    {startSeconds: o.endSeconds, endSeconds: o.boundaryEvidence?.afterPause?.endSeconds},
    ...(i ? [{startSeconds: occurrences[i - 1].endSeconds, endSeconds: o.startSeconds}] : []),
  ]).filter(z => Number.isFinite(z.startSeconds) && Number.isFinite(z.endSeconds))
  const ordered = [...new Map(corpus.map(g => [g.segmentId, g])).values()]
    .sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  const index = ordered.findIndex(g => g.segmentId === reference.segmentId)
  const adjacentHeads = [ordered[index - 1], ordered[index + 1]].filter(Boolean)
    .map(g => listeningSourceTurns({...g, text: g.sourceText}, ordered).flat()[0]).filter(Boolean)
  const instructions = attempts.flatMap(a => a.sources || []).map(s => normalizeListeningText(s.text))
  for (const attempt of attempts) {
    const other = attempts.find(a => a !== attempt)
    if (!other?.observedWindows?.length || !attempt.boundarySpeechRuns || !other.boundarySpeechRuns) continue
    // Deduplicate overlapping raw windows without counting the same acoustic
    // word twice. A long phrase is never split merely to fit the A threshold.
    const unique = new Map(observedWords(attempt).map(word => [
      `${word.token}:${word.startSeconds}:${word.endSeconds}`, word]))
    const edges = [...unique.values()].filter(word => {
      const span = acousticSpan(word)
      return ![...occurrences, ...otherBodies].some(o => spansOverlap(span, o))
        && zones.some(z => spansOverlap(span, z))
    }).sort((a, b) => a.startSeconds - b.startSeconds)
    const phrases = new Map()
    for (const word of edges) {
      const region = occurrences.filter(o => o.endSeconds <= acousticSpan(word).startSeconds).length
      if (!phrases.has(region)) phrases.set(region, [])
      phrases.get(region).push(word)
    }
    for (const words of phrases.values()) {
      const startSeconds = Math.min(...words.map(w => acousticSpan(w).startSeconds))
      const endSeconds = Math.max(...words.map(w => acousticSpan(w).endSeconds))
      const span = {startSeconds, endSeconds}
      const tokens = words.map(w => w.token)
      const raw = [...new Set(words.map(w => w.rawRunText || w.token))].join(' ')
      if (tokens.length > LISTENING_SEGMENT_RULE.isolatedEdgeMaximumWords
        || endSeconds - startSeconds > LISTENING_SEGMENT_RULE.isolatedEdgeMaximumSeconds
        || !windowsCover(other, span)
        || observedWords(other).some(w => spansOverlap(acousticSpan(w), span))
        || observedWords(other).some(w => tokens.includes(w.token)
          && zones.some(z => spansOverlap(span, z) && spansOverlap(acousticSpan(w), z))
          && Math.max(startSeconds, acousticSpan(w).startSeconds)
            - Math.min(endSeconds, acousticSpan(w).endSeconds) <= LISTENING_SEGMENT_RULE.openingGapMaxSeconds)
        || (other.boundarySpeechRuns || []).some(r => sameSpeechEngine(r, other)
          && spansOverlap(r, span) && /[\p{L}\p{N}]/u.test(r.text))
        || /[\p{Script=Han}]/u.test(raw) || parseListeningAnnouncements(raw).length
        || adjacentHeads.some(head => tokens.includes(head))
        || instructions.some(text => tokens.some(token => text.includes(token)))
        || (attempt.boundarySpeechRuns || []).some(r => sameSpeechEngine(r, attempt) && spansOverlap(r, span)
          && (/[\p{Script=Han}]/u.test(r.text) || parseListeningAnnouncements(r.text).length))) continue
      notes.push({kind: 'isolated_edge_asr', engine: attempt.engine, ...span, words,
        evidencePaths: [...new Set(attempt.observedWindows.filter(w => spansOverlap(w, span))
          .flatMap(w => w.evidencePaths || []))]})
    }
  }
  return notes
}

function withoutIsolatedEdges(attempt, notes) {
  return {...attempt, observedWindows: attempt.observedWindows?.map(window => ({...window,
    words: window.words.filter(w => !ignoredEdgeWord(w, attempt, notes))}))}
}

function silentBoundaryUnions(conflicts, observed, reference, attempts, corpus, notes) {
  const candidates = []
  for (const conflict of conflicts.filter(c => c.kind === 'playback_boundary')) {
    const a = observed.occurrences[conflict.observedOccurrence - 1]
    const b = reference.occurrences[conflict.referenceOccurrence - 1]
    const disputed = ['startSeconds', 'endSeconds'].filter(side =>
      Math.abs(a.playback[side] - b.playback[side]) > LISTENING_SEGMENT_RULE.engineBoundaryToleranceSeconds)
      .map(side => ({startSeconds: Math.min(a.playback[side], b.playback[side]),
        endSeconds: Math.max(a.playback[side], b.playback[side])}))
    if (disputed.some(span => attempts.some(attempt => !attempt.boundarySpeechRuns || !windowsCover(attempt, span)
      || observedWords(attempt).some(word => spansOverlap(acousticSpan(word), span)
        && !ignoredEdgeWord(word, attempt, notes))
      || (attempt.boundarySpeechRuns || []).some(run => spansOverlap(run, span)
        && /[\p{L}\p{N}]/u.test(run.text) && !ignoredEdgeWord(run, run, notes))))) continue
    candidates.push({conflict, occurrence: conflict.referenceOccurrence - 1, disputed,
      playback: {startSeconds: Math.min(a.playback.startSeconds, b.playback.startSeconds),
        endSeconds: Math.max(a.playback.endSeconds, b.playback.endSeconds)},
      before: a.playback.startSeconds < b.playback.startSeconds ? a : b,
      after: a.playback.endSeconds > b.playback.endSeconds ? a : b})
  }
  const proposed = reference.occurrences.map((o, i) => candidates.find(c => c.occurrence === i)?.playback || o.playback)
  // Evaluate all unions together, including reliable occurrences in a neighbor
  // whose overall count failed. Never trim a union to avoid an overlap.
  return candidates.filter(c => !proposed.some((playback, i) => i !== c.occurrence && spansOverlap(c.playback, playback))
    && !corpus.some(group => group.segmentId !== reference.segmentId
      && ((group.independentlyAnchored && group.playback && spansOverlap(c.playback, group.playback))
        || group.occurrences.some(o => o.playback && !o.issues.length && spansOverlap(c.playback, o.playback)))))
}

export function reconcileListeningEngines(apple, whisper) {
  const allAttempts = [...apple.groups, ...(whisper?.groups || [])]
  const allObservedRuns = [...new Set(allAttempts.flatMap(group => group.boundarySpeechRuns || []))]
  // Legacy/incomplete evidence with no run identity remains an obstruction.
  const unknownSpeech = allAttempts.filter(g => !g.boundarySpeechRuns).flatMap(g => g.boundarySpeech || [])
  const hardConflict = new Set(['ANNOUNCEMENT_CONFLICT', 'READINGS_OVERLAP', 'READING_DURATION_CONFLICT',
    'ANCHOR_AMBIGUOUS'])
  const blockingEvidence = new Set(['OBSERVED_READING_COUNT_EXCEEDED', 'ANCHOR_IDENTITY_AMBIGUOUS'])
  const results = apple.groups.map(primary => {
    const secondary = whisper?.groups.find(g => g.segmentId === primary.segmentId)
    const attempts = [primary, ...(secondary ? [secondary] : [])]
    let chosen = primary, conflict = false
    const engineConflicts = [], engineNotes = []
    let unions = []
    const evidenceIssues = attempts.flatMap(a => a.issues.filter(code => blockingEvidence.has(code)))
    if (secondary) {
      conflict = attempts.some(a => a.issues.some(code => hardConflict.has(code)))
      for (const attempt of attempts) for (const code of attempt.issues.filter(code => hardConflict.has(code))) {
        engineConflicts.push({ kind: 'attempt_hard_conflict', engine: attempt.engine, code })
      }
      const complete = a => a.decision === 'usable' && a.independentlyAnchored
        && a.expectedReadings !== 'unknown' && (a.occurrences.length === a.expectedReadings
          || a.readingCountEvidence?.complete === true)
        && a.occurrences.every(o => o.playback && !o.issues.length)
      const reference = attempts.filter(complete)
        .sort((a, b) => b.occurrences.length - a.occurrences.length)[0] ?? null
      if (reference) {
        const observed = reference === primary ? secondary : primary
        const isolated = isolatedEdgeNotes(attempts, reference, allAttempts)
        engineNotes.push(...isolated)
        engineConflicts.push(...compareObservedReadings(withoutIsolatedEdges(observed, isolated),
          withoutIsolatedEdges(reference, isolated), reference === secondary))
        unions = silentBoundaryUnions(engineConflicts, observed, reference, attempts, allAttempts, isolated)
        for (const union of unions) {
          engineConflicts.splice(engineConflicts.indexOf(union.conflict), 1)
          engineNotes.push({...union.conflict, kind: 'silent_playback_boundary_union',
            disputed: union.disputed, playback: union.playback})
        }
      } else if (primary.occurrences.length && secondary.occurrences.length) {
        // No independently complete engine exists to establish a safe subset.
        engineConflicts.push(...compareObservedReadings(primary, secondary))
        if (primary.occurrences.length !== secondary.occurrences.length) {
          engineConflicts.push({kind: 'complete_occurrence_count',
            primary: primary.occurrences.length, secondary: secondary.occurrences.length})
        }
      }
      // Word contradictions are retained as notes only when an independently
      // complete engine establishes all physical readings. Only the explicit
      // isolated-edge and silent-union exceptions above relax edge/timing gates.
      if (reference) {
        for (let i = engineConflicts.length - 1; i >= 0; i--) {
          if (engineConflicts[i].kind === 'observed_critical_word_difference') {
            engineNotes.unshift(...engineConflicts.splice(i, 1))
          }
        }
      }
      conflict ||= engineConflicts.length > 0
      if (!conflict && !evidenceIssues.length && reference) chosen = reference
    }
    const blocked = conflict || evidenceIssues.length > 0
    if (blocked) unions = []
    const occurrences = chosen.occurrences.map((o, i) => {
      const union = unions.find(u => u.occurrence === i)
      return {...o, playback: union ? {...union.playback} : o.playback ? {...o.playback} : null,
        issues: [...o.issues], boundaryEvidence: o.boundaryEvidence ? {...o.boundaryEvidence,
          ...(union ? {beforePause: union.before.boundaryEvidence.beforePause,
            afterPause: union.after.boundaryEvidence.afterPause} : {})} : undefined}
    })
    return { ...chosen, decision: blocked ? 'review_required' : chosen.decision,
      playback: blocked ? null : chosen.playback && {startSeconds: occurrences[0].playback.startSeconds,
        endSeconds: occurrences.at(-1).playback.endSeconds},
      occurrences,
      issues: [...new Set([...chosen.issues, ...evidenceIssues, ...(conflict ? ['ENGINE_CONFLICT'] : [])])],
      selectedEngine: chosen.engine, engineAttempts: attempts, engineConflicts, engineNotes }
  })
  // A successful primary may have been evaluated before another group's
  // fallback observed speech near its edge. Recheck the union before approval.
  const skeleton = results.filter(g => g.decision === 'usable' && g.independentlyAnchored)
    .map(g => ({segmentId: g.segmentId, startSeconds: g.playback.startSeconds}))
  const isolated = results.flatMap(g => g.engineNotes.filter(n => n.kind === 'isolated_edge_asr'))
  for (const result of results) for (const [index, occurrence] of result.occurrences.entries()) {
    if (!occurrence.playback) continue
    const includedPrompt = allObservedRuns.find(run => spansOverlap(run, occurrence.playback)
      && !spansOverlap(run, occurrence)
      && (/[\p{Script=Han}]/u.test(run.text) || parseListeningAnnouncements(run.text).length))
    const speech = mergeSpeechIntervals([...unknownSpeech, ...allObservedRuns
      .filter(run => !ignoredEdgeWord(run, run, isolated))
      .filter(run => !sameTerminalPronunciation(run, occurrence))
      .map(run => [run.startSeconds, run.endSeconds])])
    const obstructions = occurrence.boundaryEvidence
      ? boundaryObstructions(occurrence.startSeconds, occurrence.endSeconds,
        occurrence.boundaryEvidence, speech) : []
    const endLimit = Math.min(result.occurrences[index + 1]?.startSeconds ?? Infinity,
      ...skeleton.filter(g => g.segmentId !== result.segmentId && g.startSeconds > occurrence.endSeconds)
        .map(g => g.startSeconds))
    if (obstructions.length || includedPrompt || occurrence.playback.endSeconds > endLimit) {
      occurrence.boundaryEvidence ??= {}
      occurrence.boundaryEvidence.reconciledObstructions = obstructions
      if (includedPrompt) occurrence.boundaryEvidence.includedPrompt = includedPrompt
      occurrence.playback = null
      if (!occurrence.issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT')) occurrence.issues.push('BOUNDARY_EVIDENCE_INSUFFICIENT')
      problem(result, 'BOUNDARY_EVIDENCE_INSUFFICIENT')
      result.independentlyAnchored = false
    }
  }
  return validateListeningOrder(results)
}
