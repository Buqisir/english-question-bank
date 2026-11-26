import { normalizeListeningUnits } from './lib-listening-segment-rule.mjs'

const variants = { woollen: 'woolen', dr: 'doctor', mr: 'mister', mrs: 'missus', yeah: 'yes' }
const nameSounds = word => word.replace(/'s$/u, '').replace(/[sz]/gu, 's')
  .replace(/([a-z])\1+/gu, '$1').replace(/[aeiouy]/gu, '')

export function nearProperName(source, heard) {
  const spelling = word => word.token.replace(/'s$/u, '')
  const sound = word => nameSounds(word.replace(/^(?:q|ch)/u, 'ch'))
  return source.some(word => word.name && spelling(word).length >= 4 && heard.some(other => {
    if (!other.name) return false
    const a = spelling(word), b = spelling(other)
    return a !== b && b.length >= 4 && (sound(a) === sound(b)
      || (a.length === b.length && [...a].filter((letter, i) => letter !== b[i]).length === 1))
  }))
}

export function units(text) {
  return normalizeListeningUnits(text).map((unit, index, list) => ({
    ...unit, token: variants[unit.token] ?? unit.token,
    name: /^[A-Z][a-z]{2,}/u.test(unit.expressionText)
      || /^(?:doctor|dr|mr|mrs|miss)$/u.test(list[index - 1]?.token),
  }))
}

export function sameProperNameSound(a, b) {
  return a.name && b.name && a.token.length > 3 && b.token.length > 3 && nameSounds(a.token) === nameSounds(b.token)
}

function equivalent(a, b) {
  return a.token === b.token || sameProperNameSound(a, b)
}

// The match wins ties so a shared word remains an anchor between changes.
export function align(source, heard, matchesWord = equivalent) {
  const trace = [new Uint8Array(heard.length + 1).fill(3)]
  let previous = Array.from({ length: heard.length + 1 }, (_, i) => i)
  for (let i = 1; i <= source.length; i++) {
    const row = [i], moves = new Uint8Array(heard.length + 1)
    moves[0] = 2
    for (let j = 1; j <= heard.length; j++) {
      const match = matchesWord(source[i - 1], heard[j - 1])
      const costs = [match ? previous[j - 1] : Infinity, previous[j - 1] + 1, previous[j] + 1, row[j - 1] + 1]
      moves[j] = costs.indexOf(Math.min(...costs))
      row[j] = costs[moves[j]]
    }
    trace.push(moves)
    previous = row
  }
  let i = source.length, j = heard.length
  const steps = []
  while (i || j) {
    const move = trace[i][j]
    const end = i, heardEnd = j
    if (move !== 3) i--
    if (move !== 2) j--
    steps.push({ start: i, end, heardStart: j, heardEnd, match: move === 0 })
  }
  const changes = [], matches = []
  const sharedSpan = (words, index) => words[index - 1]?.end > words[index]?.start
  let block = null
  for (const step of steps.reverse()) {
    if (!block) block = { ...step }
    else Object.assign(block, { end: step.end, heardEnd: step.heardEnd, match: block.match && step.match })
    // Expanded tokens must travel with every token occupying the same raw span.
    if (sharedSpan(source, step.end) || sharedSpan(heard, step.heardEnd)) continue
    if (block.match) matches.push(block)
    const last = changes.at(-1)
    if (!block.match && last?.end === block.start && last.heardEnd === block.heardStart) {
      Object.assign(last, { end: block.end, heardEnd: block.heardEnd })
    } else if (!block.match) changes.push(block)
    block = null
  }
  return { changes, matches, similarity: 1 - previous[heard.length] / Math.max(source.length, heard.length, 1) }
}

export function preserveSourceForms(before, after, speakerLabels) {
  const source = units(before.replace(speakerLabels, label => ' '.repeat(label.length)))
  const heard = units(after)
  const { matches } = align(source, heard, (a, b) => equivalent(a, b) || nearProperName([a], [b]))
  const rawEnd = (text, word) => word.end + Number(/^(?:dr|mr|mrs)$/iu.test(word.expressionText) && text[word.end] === '.')
  // Use aligned raw spans so equivalent expressions can cover different numbers of written words.
  for (const { start, end, heardStart, heardEnd } of matches.reverse()) {
    const original = before.slice(source[start].start, rawEnd(before, source[end - 1]))
    const first = heard[heardStart].start, last = rawEnd(after, heard[heardEnd - 1])
    if (original.toLowerCase() !== after.slice(first, last).toLowerCase()) {
      after = after.slice(0, first) + original + after.slice(last)
    }
  }
  return after
}

export function timedReading(runs, source, tokenize = units) {
  let text = ''
  const spans = runs.map(run => {
    const start = text.length
    text += `${run.text.trim()} `
    return { ...run, first: start, last: text.length - 1 }
  })
  const words = tokenize(text).map(word => ({
    ...word,
    startSeconds: spans.find(run => run.last > word.start)?.start,
    endSeconds: spans.findLast(run => run.first < word.end)?.end,
  }))
  const anchor = source.slice(0, 8)
  const repeat = words.findIndex((_, index) => index >= source.length * 0.65 && anchor.length >= 5
    && words.length - index >= source.length * 0.65
    && anchor.filter((word, i) => words[index + i] && equivalent(word, words[index + i])).length >= anchor.length - 1)
  return { text, words: repeat < 0 ? words : words.slice(0, repeat) }
}

export function sites(readings, canJoin) {
  const combined = readings.flatMap(reading => reading.changes).map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged = []
  for (const site of combined) {
    const last = merged.at(-1)
    // With one shared word between two changes, they touch each other's two-word anchors.
    if (last && (site.start <= last.end || site.start === last.end + 1 && canJoin(last, site))) {
      last.end = Math.max(last.end, site.end)
    }
    else merged.push(site)
  }
  return merged
}

export function observation(reading, site) {
  const earlier = reading.changes.filter(c => c.end <= site.start && c.start < site.start)
  const delta = earlier.reduce((sum, c) => sum + c.heardEnd - c.heardStart - (c.end - c.start), 0)
  const nextDelta = reading.changes.filter(c => c.start >= site.start && c.end <= site.end)
    .reduce((sum, c) => sum + c.heardEnd - c.heardStart - (c.end - c.start), 0)
  const start = site.start + delta, end = site.end + delta + nextDelta
  const { words, text } = reading
  const candidate = words.slice(start, end)
  const edge = candidate.at(-1)?.end
  const punctuation = edge === undefined ? '' : text.slice(edge).match(/^[,.?!][”"’']?/u)?.[0] ?? ''
  const value = candidate.length ? text.slice(candidate[0].start, edge) : ''
  const window = (left, right) => {
    const context = words.slice(Math.max(0, start - left), end + right)
    const evidence = context.length ? text.slice(context[0].start, context.at(-1).end) : ''
    return { context, evidence }
  }
  return { value, punctuation, words: candidate, window,
    availableLeft: start, availableRight: words.length - end, ...window(3, 3) }
}
