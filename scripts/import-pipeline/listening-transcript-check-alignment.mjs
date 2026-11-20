import { normalizeListeningUnits } from './lib-listening-segment-rule.mjs'

const variants = { woollen: 'woolen', dr: 'doctor', mr: 'mister', mrs: 'missus', yeah: 'yes' }
export const speakerLabels = /^[ \t]*(?:[MW](?:\/[MW])?|Speaker \d+)[ \t]*[:：][ \t]*/gimu
const nameSounds = word => word.replace(/'s$/u, '').replace(/[sz]/gu, 's')
  .replace(/([a-z])\1+/gu, '$1').replace(/[aeiouy]/gu, '')

export function units(text) {
  return normalizeListeningUnits(text).map((unit, index, list) => ({
    ...unit, token: variants[unit.token] ?? unit.token,
    name: /^[A-Z][a-z]{2,}/u.test(unit.expressionText)
      || /^(?:doctor|dr|mr|mrs|miss)$/u.test(list[index - 1]?.token),
  }))
}

function equivalent(a, b) {
  return a.token === b.token || (a.name && b.name && a.token.length > 3 && b.token.length > 3
    && nameSounds(a.token) === nameSounds(b.token))
}

// The match wins ties so a shared word remains an anchor between changes.
export function align(source, heard) {
  const trace = [new Uint8Array(heard.length + 1).fill(3)]
  let previous = Array.from({ length: heard.length + 1 }, (_, i) => i)
  for (let i = 1; i <= source.length; i++) {
    const row = [i], moves = new Uint8Array(heard.length + 1)
    moves[0] = 2
    for (let j = 1; j <= heard.length; j++) {
      const match = equivalent(source[i - 1], heard[j - 1])
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
  const changes = []
  const sharedSpan = (words, index) => words[index - 1]?.end > words[index]?.start
  let block = null
  for (const step of steps.reverse()) {
    if (!block) block = { ...step }
    else Object.assign(block, { end: step.end, heardEnd: step.heardEnd, match: block.match && step.match })
    // Expanded tokens must travel with every token occupying the same raw span.
    if (sharedSpan(source, step.end) || sharedSpan(heard, step.heardEnd)) continue
    const last = changes.at(-1)
    if (!block.match && last?.end === block.start && last.heardEnd === block.heardStart) {
      Object.assign(last, { end: block.end, heardEnd: block.heardEnd })
    } else if (!block.match) changes.push(block)
    block = null
  }
  return { changes, similarity: 1 - previous[heard.length] / Math.max(source.length, heard.length, 1) }
}

export function timedReading(runs, source) {
  let text = ''
  const spans = runs.map(run => {
    const start = text.length
    text += `${run.text.trim()} `
    return { ...run, first: start, last: text.length - 1 }
  })
  const words = units(text).map(word => ({
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
  const context = words.slice(Math.max(0, start - 3), end + 3)
  const nextSentencePrefix = punctuation === ',' && !/[.!?]/u.test(value)
    && words[start - 1] && words[end]
    && /[.!?]/u.test(text.slice(words[start - 1].end, candidate[0].start))
  return { value, punctuation, nextSentencePrefix, words: candidate, context,
    evidence: context.length ? text.slice(context[0].start, context.at(-1).end) : '' }
}
