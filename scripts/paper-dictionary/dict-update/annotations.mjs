import assert from 'node:assert/strict'
import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'
import { normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'

export const UNMARKED = 'UNMARKED'
export const unresolved = pick => ['NONE', 'UNSURE', UNMARKED].includes(pick)
const parts = row => row.parts?.length === 1 && row.parts[0][0] === row.start && row.parts[0][1] === row.end
  ? undefined : row.parts
export const position = row => JSON.stringify([row.entryId, row.sentence, row.start, row.end, parts(row)])
const sentenceKey = row => JSON.stringify([row.sentenceText, row.entryId, row.start, row.end, parts(row)])
export function normalizedSentenceKey(row) {
  const quote = normalizePhraseText(row.sentenceText)
  const span = ([a, b]) => [quote.starts.indexOf(a), quote.ends.indexOf(b)]
  const [start, end] = span([row.start, row.end])
  const ranges = parts(row)?.map(span)
  if (start < 0 || end <= start || ranges?.some(([a, b]) => a < 0 || b <= a)) return null
  return sentenceKey({ ...row, sentenceText: quote.text, start, end, parts: ranges })
}

export const sentencesOf = raw => splitSentences(raw).map(({ text }) => text.trim())
export const recordRows = record => record.rows.map(row =>
  ({ ...row, sentenceText: row.sentenceText ?? record.sentences[row.sentence - 1] }))
export const makeRecord = (sentences, rows) => ({
  sentences,
  rows: rows.map(({ sentenceText, ...row }) =>
    sentenceText === undefined || sentenceText === sentences[row.sentence - 1] ? row : { ...row, sentenceText }),
})

export function reusePicks(previous, sentences, rows, reanchor = false) {
  if (!previous) return new Map()
  const text = value => reanchor ? normalizePhraseText(value).text : value
  const key = reanchor ? normalizedSentenceKey : sentenceKey
  const oldCount = Map.groupBy(previous.sentences, text)
  const newCount = Map.groupBy(sentences, text)
  const old = Map.groupBy(recordRows(previous).filter(row => row.sentenceText &&
    oldCount.get(text(row.sentenceText))?.length === 1), key)
  const current = Map.groupBy(rows.filter(row => newCount.get(text(row.sentenceText))?.length === 1), key)
  return new Map([...current].flatMap(([k, matches]) => {
    const saved = old.get(k)
    return k && matches.length === 1 && saved?.length === 1 ? [[position(matches[0]), saved[0].pick]] : []
  }))
}

export function verifiedLegacyHit(old, row) {
  return position(old) === position(row) && old.surface === row.surface &&
    (old.sentenceText == null || old.sentenceText === row.sentenceText) &&
    (!old.blockHash || old.blockHash === row.blockHash) &&
    [...row.sentenceText].slice(old.start, old.end).join('') === old.surface
}

export function legacyRecord(block, hits, confirmed, matches) {
  const wordPositions = new Set((hits?.words ?? []).flatMap(([loc, entryId, spans]) =>
    spans.map(([start, end]) => position({ entryId, sentence: loc.sentence, start, end }))))
  const labels = Map.groupBy(confirmed, position)
  const rows = matches.flatMap(row => {
    const key = position(row)
    const candidates = (labels.get(key) ?? []).filter(old => verifiedLegacyHit(old, row))
    const senses = new Set(candidates.map(old => old.senseId))
    if (senses.size === 1) return [{ ...row, pick: senses.values().next().value }]
    if (!labels.has(key) && wordPositions.has(key)) return [{ ...row, pick: UNMARKED }]
    return []
  })
  return makeRecord(sentencesOf(block.raw), rows)
}

export function budget(rows, tier, entries) {
  const pending = rows.filter(row => row.pick === undefined)
  if (tier !== 'mock') return pending
  const phrases = pending.filter(row => entries.get(row.entryId).kind === 'phrase')
  const words = Map.groupBy(pending.filter(row => entries.get(row.entryId).kind !== 'phrase'), row => row.entryId)
  return [...phrases, ...[...words.values()].flatMap(group => {
    const [first, second] = group
    const distinct = group.find(row => row.sentenceText !== first.sentenceText)
    return [first, distinct ?? second].filter(Boolean)
  })]
}

export function editorialSense(draft, entry, editorial, makeId) {
  const { pos, glossZh, note, pronunciationId } = draft
  assert(typeof pos === 'string' && pos.trim() && typeof glossZh === 'string' && glossZh.trim(),
    `新义需要词性与释义 ${entry.entryId}`)
  assert(note === undefined || typeof note === 'string', '新义 note 必须为文字')
  assert(pronunciationId === undefined || entry.pronunciations?.some(p => p.pronunciationId === pronunciationId),
    `新义读音不存在 ${entry.entryId}`)
  const spec = { pos: pos.trim(), glossZh: glossZh.trim(), ...(note ? { note } : {}),
    ...(pronunciationId ? { pronunciationId } : {}) }
  const existing = [...entry.senses, ...Object.values(editorial).filter(item => item.entryId === entry.entryId)]
    .find(s => s.pos === spec.pos && s.glossZh === spec.glossZh && s.pronunciationId === pronunciationId)
  if (existing) return existing.senseId
  const senseId = makeId(spec)
  assert(!editorial[senseId], `新义 ID 冲突 ${senseId}`)
  editorial[senseId] = { entryId: entry.entryId, senseId, ...spec }
  return senseId
}
