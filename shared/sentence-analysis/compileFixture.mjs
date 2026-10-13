import { SCHEMA_VERSION, TOKENIZER_VERSION } from './constants.mjs'
import { LAYER_FORMS } from './enums.mjs'
import { alignRestore } from './restore.mjs'
import { tokenizeSentence } from './tokenize.mjs'
import { validateSentenceAnalysis } from './validate.mjs'

function fail(message) {
  const error = new Error(message)
  error.code = 'FIXTURE_COMPILE'
  throw error
}

function tokensMatch(tokens, start, pattern) {
  if (start + pattern.length > tokens.length) return false
  return pattern.every((token, offset) => tokens[start + offset].text === token.text)
}

function occurrencesOf(tokens, quote) {
  const parts = String(quote).split('…').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) fail(`empty quote: ${quote}`)
  const patterns = parts.map((part) => tokenizeSentence(part))
  const matches = []
  if (patterns.length === 1) {
    const pattern = patterns[0]
    for (let index = 0; index + pattern.length <= tokens.length; index += 1) {
      if (tokensMatch(tokens, index, pattern)) matches.push({ start: index, end: index + pattern.length })
    }
    return matches
  }
  const startPattern = patterns[0]
  const endPattern = patterns[patterns.length - 1]
  for (let index = 0; index + startPattern.length <= tokens.length; index += 1) {
    if (!tokensMatch(tokens, index, startPattern)) continue
    for (let end = index + startPattern.length; end + endPattern.length <= tokens.length; end += 1) {
      if (tokensMatch(tokens, end, endPattern)) {
        matches.push({ start: index, end: end + endPattern.length })
        break
      }
    }
  }
  return matches
}

function pickOccurrence(matches, occurrence, label) {
  if (matches.length === 0) fail(`quote not found: ${label}`)
  if (matches.length > 1 && !occurrence) fail(`quote occurs ${matches.length} times; occurrence is required: ${label}`)
  const chosen = matches[(occurrence || 1) - 1]
  if (!chosen) fail(`occurrence ${occurrence} is out of range: ${label}`)
  return chosen
}

function spansForQuote(tokens, quote, occurrence) {
  if (Array.isArray(quote)) {
    const occurrences = Array.isArray(occurrence) ? occurrence : quote.map(() => occurrence || null)
    return quote.map((part, index) => pickOccurrence(occurrencesOf(tokens, part), occurrences[index] || null, part))
  }
  return [pickOccurrence(occurrencesOf(tokens, quote), occurrence || null, quote)]
}

function translationRanges(text, pieces, occurrence) {
  if (!pieces || pieces.length === 0) return []
  if (typeof text !== 'string') fail('zh requires translationZh')
  const occurrences = Array.isArray(occurrence) ? occurrence : pieces.map(() => occurrence || null)
  return pieces.map((piece, index) => {
    const found = []
    let from = 0
    while (from <= text.length) {
      const at = text.indexOf(piece, from)
      if (at < 0) break
      found.push(at)
      from = at + Math.max(piece.length, 1)
    }
    if (found.length === 0) fail(`translation piece not found: ${piece}`)
    const chosen = occurrences[index]
    if (found.length > 1 && !chosen) fail(`translation piece occurs ${found.length} times; zhOccurrence is required: ${piece}`)
    const start = found[(chosen || 1) - 1]
    if (!Number.isInteger(start)) fail(`zhOccurrence is out of range: ${piece}`)
    return { start, end: start + piece.length, quote: piece }
  })
}

// A restore rewrites the smallest layer around its unit; when the rewrite
// reuses words from further out, the next layer up is tried.
function scopeChain(units, roots, unitId) {
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  const extent = (unit) => ({
    id: unit.id,
    start: Math.min(...unit.spans.map((span) => span.start)),
    end: Math.max(...unit.spans.map((span) => span.end)),
  })
  let current = byId.get(unitId)
  if (current && !roots.includes(current.id) && !LAYER_FORMS.includes(current.form)) current = byId.get(current.layerId)
  const chain = []
  const seen = new Set()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(extent(current))
    current = current.layerId ? byId.get(current.layerId) : null
  }
  return chain
}

function compileRestore(restore, tokens, units, roots) {
  const chain = scopeChain(units, roots, restore.scope || restore.unit)
  if (chain.length === 0) fail(`restore ${restore.id} has no scope`)
  if (restore.segments) {
    return { id: restore.id, unitId: restore.unit, scopeId: restore.scope || chain[0].id, kind: restore.kind, segments: restore.segments }
  }
  const aligned = alignRestore(tokens, chain, restore.text)
  if (aligned.problems.length > 0) fail(aligned.problems.join('\n'))
  return { id: restore.id, unitId: restore.unit, scopeId: aligned.scopeId, kind: restore.kind, segments: aligned.segments }
}

export function compileFixture(input, { id = 'fixture' } = {}) {
  if (!input || typeof input.sentenceText !== 'string') fail('fixture needs sentenceText')
  const tokens = tokenizeSentence(input.sentenceText)
  const bind = input.bind || null
  const units = (input.units || []).map((unit) => {
    const compiled = {
      id: unit.id,
      spans: spansForQuote(tokens, unit.quote, unit.occurrence),
      form: unit.form,
      role: unit.role ?? null,
      layerId: unit.layer ?? null,
      parentId: unit.parent ?? null,
      obstacles: unit.obstacles || [],
      translationRanges: translationRanges(input.translationZh, unit.zh, unit.zhOccurrence),
    }
    if (unit.sense) compiled.sense = unit.sense
    if (unit.connector) compiled.connector = unit.connector
    if (unit.marks?.length) compiled.marks = unit.marks
    if (unit.note) compiled.noteZh = unit.note
    if (unit.voice) compiled.voice = unit.voice
    if (unit.voice && unit.action) compiled.actionZh = unit.action
    if (unit.focusObstacles) compiled.focusObstacles = [...unit.focusObstacles]
    if (unit.collocationSpans) compiled.collocationSpans = unit.collocationSpans.map(span => ({ ...span }))
    return compiled
  })
  const roots = input.roots || []
  const analysis = {
    schemaVersion: SCHEMA_VERSION,
    tokenizerVersion: TOKENIZER_VERSION,
    source: {
      paperId: bind?.paperId || 'fixture',
      sourceRevision: bind?.sourceRevision || 'fixture',
      streamId: bind?.streamId || 'fixture',
      start: bind?.start ?? 0,
      end: bind?.end ?? input.sentenceText.length,
      sentenceText: input.sentenceText,
    },
    producer: { kind: 'fixture', id },
    status: input.status || 'ok',
    tokens,
    rootClauseIds: roots,
    units,
    relations: (input.relations || []).map((relation) => {
      const compiled = {
        id: relation.id,
        kind: relation.kind,
        from: relation.from,
        to: relation.to || [],
        certainty: relation.certainty || 'certain',
      }
      if (relation.implied) compiled.implied = true
      if (relation.note) compiled.noteZh = relation.note
      return compiled
    }),
    restores: (input.restores || []).map((restore) => compileRestore(restore, tokens, units, roots)),
    translation: typeof input.translationZh === 'string' ? { textZh: input.translationZh } : null,
  }
  if (input.unavailableReason) analysis.unavailableReason = input.unavailableReason
  if (input.gaps) analysis.gaps = input.gaps
  const validated = validateSentenceAnalysis(analysis)
  if (!validated.ok) {
    fail(validated.errors.map((error) => `${error.code} ${error.path}: ${error.message}`).join('\n'))
  }
  return validated.value
}
