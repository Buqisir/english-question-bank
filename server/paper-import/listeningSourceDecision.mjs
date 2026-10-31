import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateListeningSourceDecision, listeningDecisionFailure as fail } from '../../shared/paper-canonical/listeningSourceDecision.mjs'
import { listeningTextMarkerNumber as markerNumber, listeningCue } from './nck1DocxMaterializationProducer.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
const normalized = text => text.normalize('NFKC').replace(/\s+/gu, ' ').trim()
function permitsExclusionLetters(text, start, original) {
  const value = text.normalize('NFKC')
  if (!/\p{Script=Han}/u.test(value)) return false
  const before = original.slice(0, start).normalize('NFKC')
  const after = original.slice(start + text.length).normalize('NFKC')
  // A slice cannot manufacture a label by separating a combining sequence.
  if (before + value + after !== original.normalize('NFKC')) return false
  // Compatibility characters must not acquire the ASCII label exception.
  for (const point of text) {
    if (!/^[A-G]$/u.test(point) && /[A-G]/u.test(point.normalize('NFKC'))) return false
  }
  const points = [...value]
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (!/\p{L}/u.test(point) || /\p{Script=Han}/u.test(point)) continue
    const left = points[index - 1] ?? [...before].at(-1) ?? ''
    const right = points[index + 1] ?? [...after][0] ?? ''
    const blockedNeighbor = [left, right].some(neighbor =>
      /\p{N}/u.test(neighbor) || /\p{L}/u.test(neighbor) && !/\p{Script=Han}/u.test(neighbor))
    if (!/^[A-G]$/u.test(point) || blockedNeighbor) return false
  }
  return true
}
const splitsSurrogate = (text, offset) => offset > 0 && offset < text.length
  && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset])

// Resolve IDs through the verified immutable stream, never a full-text search.
// Tables and image-consumed text cannot masquerade as ordinary source items.
export function listeningSourceItems({ decision, documents, evidence, confirmation, confirmationBytes, resolved }) {
  validateListeningSourceDecision(decision)
  if (resolved.issues.length || !['nck1-ocr-source-confirmation-v2', 'nck1-ocr-source-confirmation-v3'].includes(confirmation.schemaVersion)
    || confirmation.confirmed !== true || evidence.paperId !== confirmation.paperId
    || !same(decision.sourceSetDigest, evidence.sourceSetDigest)
    || !same(decision.evidenceDigest, evidence.evidenceDigest)
    || confirmation.evidenceDigest !== evidence.evidenceDigest || confirmation.sourceSetDigest !== evidence.sourceSetDigest
    || decision.confirmationSha256 !== sha256(confirmationBytes)) fail('stale source/evidence/confirmation binding')
  const document = documents.find(document => document.documentId === decision.documentId)
  if (document?.role !== 'official_answers' || document.mediaType !== 'application/pdf'
    || sha256(document.bytes) !== document.sha256 || document.byteLength !== document.bytes.length) fail('requires the bound official-answer PDF')
  const body = resolved.structures.get(document.documentId)?.body
  const confirmed = confirmation.documents.filter(value => value.documentId === document.documentId)
  if (!body || confirmed.length !== 1) fail('missing or ambiguous answer stream')
  const items = new Map()
  for (const page of confirmed[0].pages) {
    const observations = new Map(evidence.documents.find(d => d.documentId === document.documentId)
      ?.pages.find(p => p.page === page.page)?.observations.map(o => [o.observationId, o]) || [])
    for (const item of page.orderedItems) {
      const regions = item.observationIds.map(id => observations.get(id)?.region)
      if (!regions.length || regions.some(region => !region)) fail('missing source observation')
      const left = Math.min(...regions.map(r => r.x)), top = Math.min(...regions.map(r => r.y))
      const right = Math.max(...regions.map(r => r.x + r.width)), bottom = Math.max(...regions.map(r => r.y + r.height))
      const source = { kind: 'page_region', documentId: document.documentId, page: page.page,
        region: { x: left, y: top, width: right - left, height: bottom - top } }
      const matches = body.flatMap((part, index) => part.kind === 'paragraph' && same(part.sourceIndex, source)
        && part.text === item.text && !part.materializedMedia ? [index] : [])
      if (matches.length !== 1) continue
      if (items.has(item.itemId)) fail('duplicate item identity')
      items.set(item.itemId, { item, index: matches[0], source })
    }
  }
  return { body, items }
}

export function resolveListeningSourceDecision(context) {
  const { decision } = context
  const { body, items } = listeningSourceItems(context)
  const address = (value, fallback) => {
    if (value === null) return fallback
    const found = items.get(value.itemId)
    if (!found || found.item.text !== value.text) fail('address does not resolve to one exact complete item')
    return found.index
  }
  const heading = address(decision.heading, -1), start = address(decision.start), end = address(decision.end, body.length)
  const markers = body.flatMap((item, index) => item.kind === 'paragraph' && markerNumber(item.text) !== null
    ? [{ index, number: markerNumber(item.text) }] : [])
  if (markers.length !== 10 || markers.some((marker, index) => marker.number !== index + 1)) fail('requires one unique ordered Text 1–10 run')
  const first = markers[0].index, last = markers[9].index
  if (!(start <= first && start >= 0 && end > last && end <= body.length)
    || heading >= 0 && (heading + 1 !== start || heading >= first)) fail('heading/start/end cross the ordered Text run')
  if (end < body.length && /^(?:M|W|Man|Woman|Boy|Girl)\s*[:：]/u.test(body[end].text || '')) fail('end boundary would discard a speech turn')
  const coverage = new Map(), assignments = new Map()
  let previous = [-1, -1]
  for (const role of decision.roles) {
    let previousFragment = null
    const located = role.fragments.map(fragment => {
      const found = items.get(fragment.itemId)
      if (!found || found.index < start || found.index >= end || found.index === heading
        || markers.some(marker => marker.index === found.index)
        || fragment.end > found.item.text.length || found.item.text.slice(fragment.start, fragment.end) !== fragment.text
        || splitsSurrogate(found.item.text, fragment.start) || splitsSurrogate(found.item.text, fragment.end)) fail('fragment crosses a source boundary, marker, surrogate or exact text')
      if (found.index < previous[0] || found.index === previous[0] && fragment.start < previous[1]) {
        fail(`overlapping or unordered roles: fragment ${fragment.itemId}[${fragment.start}:${fragment.end}] resolves to body index ${found.index} after prior fragment at body index ${previous[0]} ending at ${previous[1]}`)
      }
      if (previousFragment && !(found.index === previousFragment.index && fragment.start === previousFragment.end
        || found.index === previousFragment.index + 1 && previousFragment.end === body[previousFragment.index].text.length && fragment.start === 0)) fail('role skips an intervening source item')
      previous = [found.index, fragment.end]
      previousFragment = { index: found.index, end: fragment.end }
      const spans = coverage.get(found.index) || []
      spans.push(fragment); coverage.set(found.index, spans)
      const parts = assignments.get(found.index) || []
      parts.push({ fragment, role }); assignments.set(found.index, parts)
      return { ...found, fragment }
    })
    const from = located[0].index, to = located.at(-1).index
    const next = markers.find(marker => marker.index > to)?.number ?? null
    const text = located.map(value => value.fragment.text).join('')
    if (role.role === 'example' && to >= first) fail('example must close before Text 1')
    if (role.role === 'speech' && from <= first) fail('speech must belong to a Text segment')
    if (role.role === 'cue') {
      if (role.nextTextNumber !== next) fail('cue does not match the next Text boundary')
      if (located.some(({ fragment, index }) => !permitsExclusionLetters(fragment.text, fragment.start, body[index].text))) {
        fail('cue letters require Han or isolated original ASCII A–G labels after NFKC; fragment must contain Chinese')
      }
      // Cross-item announcements still have to agree with the source question
      // range. The producer checks this declared range against the question PDF.
      const match = /(?:回答|阅读)第\s*(\d+)(?:\s*(?:至|到|和|、|[-–—])\s*第?\s*(\d+))?/u.exec(normalized(text))
      if (match) {
        const firstNumber = Number(match[1]), lastNumber = Number(match[2] || match[1])
        const numbers = Array.from({ length: Math.max(0, lastNumber - firstNumber + 1) }, (_, i) => firstNumber + i)
        if (!numbers.length || !same(role.questionNumbers, numbers)) fail('cue source question numbers differ')
      }
      if (/第一节到此结束|第二节[:：]?听下面/u.test(normalized(text)) && next !== 6
        || /请看听力部分第一节|听力考试正式开始/u.test(text) && next !== 1
        || /第二节到此结束|听力部分到此结束/u.test(text) && next !== null) fail('cue section order differs')
    }
  }
  for (const [index, fragments] of coverage) {
    let offset = 0
    for (const fragment of fragments) {
      if (fragment.start !== offset) fail('affected item has a gap or overlap')
      offset = fragment.end
    }
    if (offset !== body[index].text.length) fail('affected item is not fully covered')
    const parts = assignments.get(index)
    if (!parts.some(part => part.role.role === 'speech')) continue
    // Inspect the original item, coalescing adjacent exclusions even when an
    // author splits them across several roles. Coverage alone cannot prove that
    // speech was retained.
    const excluded = []
    for (const { fragment, role } of parts) {
      if (role.role === 'speech') continue
      if (!permitsExclusionLetters(fragment.text, fragment.start, body[index].text)) {
        fail('mixed-item exclusion letters require Han or isolated original ASCII A–G labels after NFKC')
      }
      const previous = excluded.at(-1)
      if (previous?.end === fragment.start) previous.end = fragment.end
      else excluded.push({ start: fragment.start, end: fragment.end })
    }
    for (const { start, end } of excluded) {
      const original = body[index].text, text = original.slice(start, end)
      // A speech turn can end on English punctuation before an inline cue:
      // "M: I see. Let me give you a hand. （停顿5秒）". Trailing quotes or
      // closing brackets after the sentence mark still count as ended.
      const sentenceEnd = /[.!?。！？][”’"'）)\]】}」』》〉]*$/u
      if (!permitsExclusionLetters(text, start, original)
        || start !== 0 && end !== original.length
        || start !== 0 && !sentenceEnd.test(original.slice(0, start).trimEnd())
        || end !== original.length && !sentenceEnd.test(text.trimEnd())
        || !listeningCue(text)) {
        fail('mixed-item exclusions require a complete Chinese broadcast sentence at an item edge')
      }
    }
  }
  const projected = [], positions = new Map()
  body.forEach((item, index) => {
    positions.set(index, projected.length)
    const parts = assignments.get(index)
    if (!parts) { projected.push(item); return }
    for (const { fragment, role } of parts) projected.push({ ...item, text: fragment.text,
      listeningSourceRole: { role: role.role, nextTextNumber: role.nextTextNumber, questionNumbers: role.questionNumbers },
      listeningSourceFragment: { itemId: fragment.itemId, start: fragment.start, end: fragment.end } })
  })
  positions.set(body.length, projected.length)
  return { body: projected, heading: heading < 0 ? -1 : positions.get(heading),
    start: positions.get(start), end: positions.get(end) }
}
