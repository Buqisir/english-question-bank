import { listeningSentenceTargets } from './listening-sentence-align.mjs'
import { touchesListeningSpeakerBoundary } from '../../server/paper-import/spellingReview.mjs'

const sentences = text => listeningSentenceTargets({ listening: { transcript: [{ segmentId: 'check', text }] } })[0].sentences
const markerPattern = /[（(][ \t]*(?:Q(?:uestions?)?[. \t]*)?\d{1,2}(?:[ \t]*[-–—~～至/][ \t]*(?:Q[. \t]*)?\d{1,2})*[ \t]*[）)]/giu

export function sentenceSites(text, source, changes, parakeet) {
  const original = sentences(text).flatMap(({ utf16Start, utf16End }) => {
    const start = source.findIndex(word => word.start >= utf16Start)
    const next = source.findIndex(word => word.start >= utf16End)
    const end = next < 0 ? source.length : next
    if (start < 0 || end <= start) return []
    const altered = parakeet.changes.filter(change => change.start >= start && change.start < end && change.end <= end
      && !questionMarkerSpan(text, {
        start: source[change.start].start,
        before: text.slice(source[change.start].start, source[change.end - 1]?.end),
        after: '',
      })?.before.match(markerPattern))
    const burden = altered.reduce((sum, change) => sum + Math.max(change.end - change.start, change.heardEnd - change.heardStart), 0)
    const sites = changes.filter(change => change.start >= start && change.start < end && change.end <= end)
    return [{ start, end, sentenceStart: utf16Start, sentenceEnd: utf16End,
      affected: altered.length > 0, fragmented: altered.length > 3,
      highBurden: burden >= 3 && burden / (end - start) > 0.3, multipleSites: sites.length > 1,
      phraseRewrite: altered.length > 1
        || altered.some(change => change.end - change.start >= 2 && change.heardEnd - change.heardStart >= 4) }]
  })
  const substantial = original.filter(site => site.end - site.start >= 6)
  const rewritten = (original.length >= 3 && original.filter(site => site.fragmented
    || (site.highBurden && site.multipleSites)).length > original.length / 2)
    || (parakeet.similarity <= 0.75 && substantial.length >= 3
      && substantial.filter(site => site.affected).length > substantial.length / 2)
  const dense = []
  let previous
  for (const site of original) {
    const isDense = site.fragmented || (site.highBurden && (site.multipleSites || (rewritten && site.phraseRewrite)))
    if (isDense) {
      const last = dense.at(-1)
      if (previous && last.end === site.start && !/[\r\n]/u.test(text.slice(last.sentenceEnd, site.sentenceStart))) {
        last.end = site.end
        last.sentenceEnd = site.sentenceEnd
      } else dense.push({ ...site })
    }
    previous = isDense
  }
  let recorded
  return {
    sites: [...changes.filter(site => !dense.some(d => site.start < d.end && site.end >= d.start
      && (site.end > d.start || site.start === site.end))), ...dense].sort((left, right) => left.start - right.start),
    rewritten,
    sentenceSpan(site, vote) {
      const { sentenceStart: start, sentenceEnd: end } = site
      const first = vote.words[0]?.start
      const last = vote.words.at(-1)?.end
      if (first === undefined || last === undefined) return null
      recorded ??= sentences(parakeet.text)
      const beginning = recorded.find(sentence => sentence.utf16Start <= first && first - sentence.utf16Start <= 1)
      const ending = recorded.find(sentence => sentence.utf16End >= last
        && /^[.!?]+["'’”)\]]*$/u.test(parakeet.text.slice(last, sentence.utf16End)))
      if (!beginning || !ending || ending.utf16End < beginning.utf16End) return null
      const after = parakeet.text.slice(beginning.utf16Start, ending.utf16End)
      const before = text.slice(start, end)
      if (!touchesListeningSpeakerBoundary(text, { start, before })) return { start, before, after }
      // Keep an unchanged turn-ending mark outside the edit to preserve the speaker boundary.
      const mark = text.slice(source[site.end - 1].end, end)
      if (mark && after.endsWith(mark)) {
        const span = { start, before: before.slice(0, -mark.length), after: after.slice(0, -mark.length) }
        if (!touchesListeningSpeakerBoundary(text, span)) return span
      }
      return null
    },
  }
}

export function questionMarkerSpan(text, span) {
  let { start, before, after } = span
  let end = start + before.length
  for (const marker of text.matchAll(markerPattern)) {
    const markEnd = marker.index + marker[0].length
    if (start >= markEnd || end <= marker.index || !before) continue
    const body = marker[0].slice(1, -1)
    const bodyStart = marker.index + 1 + body.length - body.trimStart().length
    const bodyEnd = marker.index + 1 + body.trimEnd().length
    if (start > bodyStart || end < bodyEnd || /[（(][ \t]*(?:Q[. \t]*)?\d/iu.test(after)) return null
    start = Math.min(start, marker.index)
    end = Math.max(end, markEnd)
    if (!after) {
      const leading = text.slice(0, start).match(/[ \t]+$/u)?.[0].length ?? 0
      const trailing = text.slice(end).match(/^[ \t]+/u)?.[0].length ?? 0
      const keepSpace = trailing && !leading && /\S/u.test(text[end + trailing] ?? '')
      end += trailing - Number(keepSpace)
      if (!trailing && !/[ \t]/u.test(text[end] ?? '')) start -= leading
    }
  }
  return { start, before: text.slice(start, end), after }
}
