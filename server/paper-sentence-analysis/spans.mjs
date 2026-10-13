import { LIMITS, lineWidth } from '../../shared/sentence-analysis/constants.mjs'
import { CONNECTORS, LAYER_FORMS, MARKS, NONFINITE_FORMS, OBSTACLES, isLexicalObstacle, RESTORE_KINDS, ROLES, SENSES, VOICES } from '../../shared/sentence-analysis/enums.mjs'
import { aliasOf, alignRestore, foldWord as fold } from '../../shared/sentence-analysis/restore.mjs'
import { tokenizeSentence } from '../../shared/sentence-analysis/tokenize.mjs'

export const SPAN_ROLES = [...ROLES.filter((role) => role !== 'head'), 'connector', 'main']
export const SPAN_FORMS = ['clause', ...NONFINITE_FORMS, 'prepositional', 'adjective-phrase', 'absolute', 'with-complex']

const RELATIVE_PRONOUNS = new Set(['which', 'who', 'whom', 'whose', 'that'])
const RELATIVE_ADVERBS = new Set(['where', 'when', 'why'])
const CONJUNCTIVE_PRONOUNS = new Set(['what', 'whatever', 'who', 'whoever', 'whom', 'whose', 'which', 'whichever'])
const CONJUNCTIVE_ADVERBS = new Set(['how', 'however', 'why', 'when', 'whenever', 'where', 'wherever'])
const NOUN_CLAUSE_ROLES = new Set(['subject', 'object', 'predicative', 'appositive', 'subject-complement'])
const COORDINATORS = new Set(['and', 'but', 'or', 'so', 'yet', 'nor', 'for'])
const PAIRED_COORDINATORS = new Set(['not', 'either', 'neither', 'both'])
const QUANTIFIERS = new Set(['all', 'both', 'each', 'either', 'neither', 'none', 'some', 'many', 'most', 'much', 'few', 'several', 'any', 'one', 'two', 'three', 'half'])
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their'])
const ANTECEDENT_STOPS = new Set(['of', 'in', 'at', 'to', 'for', 'with', 'from', 'on', 'by', 'and', 'or', 'but'])
const CLAUSE_CORE_ROLES = ['predicate', 'object', 'indirect-object', 'predicative', 'object-complement', 'subject-complement']
const CONNECTOR_SERVES = new Set(['subject', 'object', 'adverbial', 'predicative', 'attributive'])
const CLEFT_BE = new Set(['is', 'was', "'s"])
const CLEFT_LINKS = new Set(['that', 'who', 'whom', 'which'])
const CLEFT_FOCUS = new Set(['only', 'just', 'even'])
const ADVERBIAL_SUBORDINATORS = {
  before: 'time', after: 'time', until: 'time', till: 'time', once: 'time',
  because: 'cause', although: 'concession', though: 'concession', unless: 'condition', if: 'condition',
}
// Words that may open an imperative before its verb: Please don’t touch, Do remember, Never give up.
const IMPERATIVE_LEAD = /^(please|kindly|just|do|n['’]t|not|never|always)$/i

function spanError(message) {
  const error = new Error(message)
  error.code = 'FIXTURE_COMPILE'
  return error
}

function words(text) {
  return tokenizeSentence(String(text).trim()).map((token) => fold(token.text))
}

const GLOSS_OPEN = new Set(['(', '（'])
const GLOSS_CLOSE = new Set([')', '）'])
const GLOSS_LIMIT = 12

function sameWord(sentenceWord, word, alias) {
  return sentenceWord === word || (alias && aliasOf(sentenceWord, word))
}

function glossEnd(lower, index) {
  if (!GLOSS_OPEN.has(lower[index])) return -1
  for (let end = index + 1; end < Math.min(lower.length, index + GLOSS_LIMIT); end += 1) {
    if (GLOSS_CLOSE.has(lower[end])) return end > index + 1 ? end + 1 : -1
    if (/[a-z]/.test(lower[end])) return -1
  }
  return -1
}

// Spelled-out contractions ("is" for ’s) are tried only when the words never
// occur as written, so a possessive ’s is not taken for "is".
function findRanges(tokens, text) {
  const exact = matchRanges(tokens, text, false)
  return exact.length > 0 ? exact : matchRanges(tokens, text, true)
}

function matchRanges(tokens, text, alias) {
  const pattern = words(text)
  if (pattern.length === 0) return []
  const lower = tokens.map((token) => fold(token.text))
  const found = []
  for (let start = 0; start < lower.length; start += 1) {
    if (!sameWord(lower[start], pattern[0], alias)) continue
    let at = start + 1
    let matched = 1
    while (matched < pattern.length && at < lower.length) {
      if (sameWord(lower[at], pattern[matched], alias)) {
        at += 1
        matched += 1
        continue
      }
      const skip = glossEnd(lower, at)
      if (skip < 0) break
      at = skip
    }
    if (matched === pattern.length) found.push({ start, end: at })
  }
  return found
}

function isWordToken(token) {
  return token.kind !== 'punct'
}

const PAIRS = { ')': '(', ']': '[', '”': '“', '’': '‘', '"': '"', "'": "'" }

function keepsPair(tokens, start, end, edge) {
  const text = tokens[edge].text
  if (edge === end - 1 && PAIRS[text]) return tokens.slice(start, end - 1).some((token) => token.text === PAIRS[text])
  if (edge === start) {
    const closer = Object.keys(PAIRS).find((key) => PAIRS[key] === text)
    if (closer) return tokens.slice(start + 1, end).some((token) => token.text === closer)
  }
  return false
}

function trimPunctuation(tokens, range) {
  let { start, end } = range
  while (end > start + 1 && !isWordToken(tokens[end - 1]) && !keepsPair(tokens, start, end, end - 1)) end -= 1
  while (start < end - 1 && !isWordToken(tokens[start]) && !keepsPair(tokens, start, end, start)) start += 1
  return { start, end }
}

function listOf(value) {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value]).filter((item) => typeof item === 'string' && item)
}

function contains(outer, inner) {
  return outer.start <= inner.start && inner.end <= outer.end
}

function crosses(a, b) {
  return a.start < b.end && b.start < a.end && !contains(a, b) && !contains(b, a)
}

// A two-part span ("not only … but also", "It was … that") covers only its
// pieces: what sits between them is not inside it.
function piecesOf(item) {
  return item.pieces || [{ start: item.start, end: item.end }]
}

function holds(outer, inner) {
  const room = piecesOf(outer)
  return piecesOf(inner).every((piece) => room.some((part) => contains(part, piece)))
}

function crossesSpan(a, b) {
  return piecesOf(a).some((piece) => piecesOf(b).some((other) => crosses(piece, other)))
}

// A teaching expression may cross grammatical units. Bind its own exact words
// without expanding a predicate or turning an object into part of the verb.
function collocationRanges(value, anchor, tokens) {
  const parts = listOf(value).map(part => part.trim()).filter(Boolean)
  if (!parts.length) return null
  const matches = parts.map(part => matchRanges(tokens, part, false))
  const candidates = []
  for (const first of matches[0]) {
    const ranges = [first]
    for (const following of matches.slice(1)) {
      const next = following.find(range => range.start >= ranges.at(-1).end)
      if (!next) break
      ranges.push(next)
    }
    if (ranges.length === parts.length && ranges.some(range => anchor.some(piece =>
      piece.start < range.end && range.start < piece.end))) candidates.push(ranges)
  }
  return candidates.length === 1 ? candidates[0].map(range => trimPunctuation(tokens, range)) : null
}

function readSpan(raw, index, tokens, problems, after) {
  const label = `spans[${index}]`
  if (!raw || typeof raw !== 'object') {
    problems.push(`${label}: not an object`)
    return null
  }
  const parts = listOf(raw.text).map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) {
    problems.push(`${label}: text is missing`)
    return null
  }
  const text = parts.join(' … ')
  if (!SPAN_ROLES.includes(raw.role)) {
    problems.push(`${label} "${text}": role must be one of ${SPAN_ROLES.join(', ')}`)
    return null
  }
  const pieces = []
  for (const [position, part] of parts.entries()) {
    const ranges = findRanges(tokens, part)
    if (ranges.length === 0) {
      problems.push(`${label}: "${part}" is not copied exactly from the sentence`)
      return null
    }
    if (position > 0) {
      const next = ranges.find((range) => range.start >= pieces.at(-1).end)
      if (!next) {
        problems.push(`${label}: "${part}" must come after "${parts[position - 1]}"`)
        return null
      }
      pieces.push(trimPunctuation(tokens, next))
      continue
    }
    const occurrence = Number.isInteger(raw.occurrence) ? raw.occurrence : null
    const following = ranges.filter((range) => range.start >= after)
    if (ranges.length > 1 && !occurrence && following.length === 0) {
      problems.push(`${label}: "${part}" appears ${ranges.length} times; add occurrence`)
      return null
    }
    // Spans come in reading order; models miscount occurrence more often than they break that order.
    pieces.push(trimPunctuation(tokens, following[0] || (occurrence && ranges[occurrence - 1]) || ranges.at(-1)))
  }
  // An unknown form, or a form on a predicate (stuck inside … as a past participle), is dropped: the role still stands.
  const form = SPAN_FORMS.includes(raw.form) && raw.role !== 'predicate' ? raw.form : null
  const obstacles = listOf(raw.obstacle ?? raw.obstacles).filter((item) => OBSTACLES.includes(item))
  const lexical = obstacles.find(isLexicalObstacle)
  const collocationSpans = lexical ? collocationRanges(raw.collocationText, pieces, tokens) : null
  // Optional teaching hints must not make an otherwise valid analysis fail.
  if (raw.collocationText !== undefined && !collocationSpans && lexical) {
    obstacles.splice(obstacles.indexOf(lexical), 1)
  }
  const marks = listOf(raw.mark ?? raw.marks).filter((item) => MARKS.includes(item))
  let note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null
  // A word-level note opens with the English it explains, which the highlight
  // already shows; drop that echo before giving up on an over-long gloss.
  if (note && lexical && lineWidth(note) > LIMITS.noteLine) {
    const gloss = note.replace(/^[A-Za-z][^：:\p{Script=Han}]*[：:]\s*/u, '')
    if (gloss && gloss !== note) note = gloss
  }
  if (note && lineWidth(note) > LIMITS.noteLine) {
    problems.push(`${label} "${text}": note "${note}" is longer than one line; keep it within ${LIMITS.noteLine} Chinese characters (letters count as half)`)
    note = null
  }
  // A teaching hint: a bad value is dropped rather than failing the analysis.
  const voice = VOICES.includes(raw.voice) && NONFINITE_FORMS.includes(form) ? raw.voice : null
  const action = voice && typeof raw.action === 'string' && raw.action.trim() && raw.action.trim().length <= LIMITS.actionZh ? raw.action.trim() : null
  return {
    index,
    start: pieces[0].start,
    end: pieces.at(-1).end,
    ...(pieces.length > 1 ? { pieces } : {}),
    text,
    role: raw.role,
    form,
    marks: [...new Set(marks)],
    restoreKind: RESTORE_KINDS.includes(raw.restoreKind) ? raw.restoreKind : null,
    sense: SENSES.includes(raw.sense) ? raw.sense : null,
    head: typeof raw.head === 'string' && raw.head.trim() ? raw.head.trim() : null,
    logicalSubject: typeof raw.logicalSubject === 'string' && raw.logicalSubject.trim() ? raw.logicalSubject.trim() : null,
    connector: CONNECTORS.includes(raw.connector) ? raw.connector : null,
    serves: CONNECTOR_SERVES.has(raw.serves) ? raw.serves : null,
    obstacles: [...new Set(obstacles)],
    ...(Array.isArray(raw.focusObstacles) ? { focusObstacles: [...new Set(raw.focusObstacles.filter(item => obstacles.includes(item)))] } : {}),
    ...(collocationSpans ? { collocationSpans } : {}),
    restore: typeof raw.restore === 'string' && raw.restore.trim() ? raw.restore.trim() : null,
    note,
    ...(voice ? { voice } : {}),
    ...(action ? { action } : {}),
    zh: listOf(raw.zh),
  }
}

const BE_FORMS = new Set(['be', 'being', 'been'])

// being happy / to be in trouble: a linking be has no doer or receiver, so a
// voice the model gave it would only produce a false 主动/被动 line.
function linkingNonfinite(node, nodes, tokens) {
  const verb = nodes.find(other => other.parentKey === node.id && other.role === 'nonfinite-verb')
  const words = (item) => piecesOf(item).flatMap(piece => tokens.slice(piece.start, piece.end)).filter(isWordToken).map(token => fold(token.text))
  if (verb) {
    const own = words(verb).filter(word => word !== 'to' && word !== 'having')
    return own.length === 1 && BE_FORMS.has(own[0])
  }
  const own = words(node).filter(word => word !== 'to' && word !== 'not')
  return BE_FORMS.has(own[0])
}

function connectorWords(span, tokens) {
  return piecesOf(span).flatMap((piece) => tokens.slice(piece.start, piece.end)).filter(isWordToken).map((token) => fold(token.text))
}

// Relative words lead attributive clauses; the same words leading a noun clause are conjunctive.
function connectorKind(span, tokens, clause) {
  const noun = clause && NOUN_CLAUSE_ROLES.has(clause.role)
  if (span.connector === 'relative-pronoun' && noun) return 'conjunctive-pronoun'
  if (span.connector === 'relative-adverb' && noun) return 'conjunctive-adverb'
  if (span.connector) return span.connector
  const list = connectorWords(span, tokens)
  const [first] = list
  const last = list.at(-1)
  if (span.pieces && (first === 'so' || first === 'such')) return 'subordinator'
  if (span.pieces && PAIRED_COORDINATORS.has(first)) return 'coordinator'
  if (list.join(' ') === 'let alone') return 'coordinator'
  if (clause?.role === 'attributive') {
    if (RELATIVE_PRONOUNS.has(first) || RELATIVE_PRONOUNS.has(last)) return 'relative-pronoun'
    if (RELATIVE_ADVERBS.has(first)) return 'relative-adverb'
  }
  if (noun && CONJUNCTIVE_PRONOUNS.has(first)) return 'conjunctive-pronoun'
  if (noun && CONJUNCTIVE_ADVERBS.has(first)) return 'conjunctive-adverb'
  if (!clause && COORDINATORS.has(first)) return 'coordinator'
  return 'subordinator'
}

// for which, both of which, many of whom
function prepositionRelative(span, tokens, kind) {
  const list = connectorWords(span, tokens)
  return kind === 'relative-pronoun' && list.length > 1 && !RELATIVE_PRONOUNS.has(list[0]) && RELATIVE_PRONOUNS.has(list.at(-1))
}

function baseForm(span) {
  if (span.role === 'predicate') {
    return NONFINITE_FORMS.includes(span.form) && span.obstacles.includes('ellipsis') ? span.form : 'verb-group'
  }
  if (span.form) return span.form
  return span.end - span.start === 1 ? 'word' : 'phrase'
}

const AUXILIARIES = new Set(['do', 'does', 'did', 'have', 'has', 'had', 'is', 'am', 'are', 'was', 'were', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must'])

function invertedAuxiliary(previous, span, spans, tokens) {
  if (previous.pieces.length !== 1) return false
  const [piece] = previous.pieces
  if (!tokens.slice(piece.start, piece.end).every((token) => AUXILIARIES.has(fold(token.text)))) return false
  return spans.some((other) => other.role === 'subject' && other.parentKey === span.parentKey && other.start >= piece.end && other.end <= span.start)
}

function mergeSplitPredicates(spans, tokens) {
  const merged = []
  for (const span of spans) {
    const previous = span.role === 'predicate'
      ? merged.findLast((item) => item.role === 'predicate' && item.parentKey === span.parentKey)
      : null
    const split = previous && previous.obstacles.includes('split') && span.obstacles.includes('split')
    const crossesClauseBoundary = previous && tokens.slice(previous.pieces.at(-1).end, span.start).some(token => /^[;:。！？!?]$/.test(token.text))
    // "Don’t" + "put" side by side is one verb group, not a split predicate.
    const touching = previous && !tokens.slice(previous.pieces.at(-1).end, span.start).some(isWordToken)
    // "it is, says Abby": a comma between them means two predicates, not one verb group.
    const adjacent = previous && previous.pieces.at(-1).end === span.start
    const auxiliaryLead = adjacent && tokens.slice(previous.pieces.at(-1).start, previous.pieces.at(-1).end).every((token) => AUXILIARIES.has(fold(token.text)) || /^(n['’]t|not)$/i.test(token.text))
    if (previous && !crossesClauseBoundary && (split || auxiliaryLead || invertedAuxiliary(previous, span, spans, tokens))) {
      if (touching) {
        previous.pieces.at(-1).end = span.end
        if (previous.pieces.length === 1) previous.end = span.end
      } else previous.pieces.push({ start: span.start, end: span.end })
      previous.obstacles = [...new Set([...previous.obstacles, ...span.obstacles, 'split'])]
      if (previous.pieces.length === 1) previous.obstacles = previous.obstacles.filter((obstacle) => obstacle !== 'split')
      if (span.focusObstacles) previous.focusObstacles = [...new Set([...(previous.focusObstacles || []), ...span.focusObstacles])]
      previous.note ||= span.note
      if (!previous.collocationSpans && span.collocationSpans) {
        previous.collocationSpans = span.collocationSpans
        previous.note ||= span.note
      }
      if (!previous.zh.length) previous.zh = span.zh
      continue
    }
    merged.push({ ...span, pieces: piecesOf(span) })
  }
  return merged
}

// A relative pronoun often comes back twice: once with its role, once as the connector.
function mergeConnectorTwins(spans) {
  const twins = new Set()
  for (const connector of spans) {
    if (connector.role !== 'connector') continue
    const twin = spans.find((other) => (
      other !== connector
      && !twins.has(other)
      && !['connector', 'main'].includes(other.role)
      && other.form !== 'clause'
      && other.start === connector.start
      && other.end === connector.end
    ))
    if (!twin) continue
    twins.add(twin)
    if (!connector.serves && CONNECTOR_SERVES.has(twin.role)) connector.serves = twin.role
    if (connector.zh.length === 0) connector.zh = twin.zh
  }
  return spans.filter((span) => !twins.has(span))
}

const layered = (span) => LAYER_FORMS.includes(span.form)

const bySpanOrder = (a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.index - b.index
const BE = new Set(['be', 'been', 'being', 'is', 'am', 'are', 'was', 'were', "'s", "'m", "'re"])
const VERB_LEAD = new Set([...AUXILIARIES, ...BE, 'not', "n't", "'d", "'ll", "'ve"])

// "can be pricey" comes back as one predicative in a clause without a
// predicate; its leading verb group is the predicate.
function splitLinkingPredicatives(spans, tokens, sentenceText) {
  const hosts = spans.filter((span) => span.role === 'main' || layered(span))
  const hostOf = (span) => smallestContainer(span, hosts)
  const added = []
  for (const span of spans) {
    if (span.role !== 'predicative' || layered(span)) continue
    const host = hostOf(span)
    if (spans.some((other) => other.role === 'predicate' && hostOf(other) === host)) continue
    let end = span.start
    while (end < span.end && VERB_LEAD.has(fold(tokens[end].text))) end += 1
    if (end === span.end || !tokens.slice(span.start, end).some((token) => BE.has(fold(token.text)))) continue
    const text = quoteOf(sentenceText, tokens, { start: span.start, end })
    added.push({ ...span, end, text, role: 'predicate', form: null, sense: null, head: null, obstacles: [], restore: null, note: null, zh: [] })
    span.start = end
    span.text = quoteOf(sentenceText, tokens, span)
  }
  return [...spans, ...added].sort(bySpanOrder)
}

function smallestContainer(span, pool) {
  return pool
    .filter((other) => other !== span && holds(other, span) && !(other.start === span.start && other.end === span.end))
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] || null
}

// "a fact that ensures …" comes back as a clause although its only predicate
// belongs to the relative clause inside it; it is a noun phrase. "that it was
// X that …" comes back as a clause around the same clause without its
// connector; the two are one clause.
// A span without a form that holds its own predicate (a quoted sentence the
// model forgot to call a clause) is a clause.
function promoteVerbSpans(spans) {
  for (const span of spans) {
    if (span.form || span.pieces || ['predicate', 'connector', 'main', 'nonfinite-verb'].includes(span.role)) continue
    const own = spans.some((other) => other.role === 'predicate' && other !== span && holds(span, other)
      && !spans.some((layer) => layer !== span && layered(layer) && holds(span, layer) && holds(layer, other)))
    if (own) span.form = 'clause'
  }
  return spans
}

function settleVerblessClauses(spans, tokens) {
  const clauses = spans.filter((span) => span.form === 'clause')
  const nearestClause = (span) => smallestContainer(span, clauses)
  const merged = new Set()
  for (const clause of clauses) {
    if (clause.obstacles.includes('ellipsis')) continue
    const own = (span) => holds(clause, span) && nearestClause(span) === clause
    if (spans.some((span) => span.role === 'predicate' && own(span))) continue
    const inner = clauses.filter((other) => other !== clause && own(other))
    if (inner.length === 0) continue
    const connectors = spans.filter(span => span.role === 'connector' && own(span))
    const candidate = inner.length === 1 ? inner[0] : null
    // “that + quoted content” has one predicate layer, not an object clause
    // containing a second subject/object clause. Only punctuation/connectors
    // may remain outside the body; a real nested clause keeps its own layer.
    const sameBody = candidate && connectors.length > 0 && tokens.every((token, index) =>
      index < clause.start || index >= clause.end || !isWordToken(token)
      || (index >= candidate.start && index < candidate.end)
      || connectors.some(connector => piecesOf(connector).some(piece => index >= piece.start && index < piece.end)))
    if (sameBody && candidate.role !== clause.role) {
      throw spanError(`clause "${clause.text}" and its quoted/connector-free body "${candidate.text}" repeat the same clause with conflicting roles (${clause.role}/${candidate.role}); output one clause with its role in the enclosing sentence, and put direct-speech on that clause when applicable`)
    }
    const body = sameBody && candidate.role === clause.role ? candidate : null
    if (!body) {
      clause.form = null
      continue
    }
    clause.obstacles = [...new Set([...clause.obstacles, ...body.obstacles])]
    if (body.focusObstacles) clause.focusObstacles = [...new Set([...(clause.focusObstacles || []), ...body.focusObstacles])]
    clause.note ||= body.note
    clause.marks = [...new Set([...clause.marks, ...body.marks])]
    clause.restore ||= body.restore
    if (clause.zh.length === 0) clause.zh = body.zh
    merged.add(body)
  }
  return spans.filter((span) => !merged.has(span))
}

// A reported that-clause after “reminding/telling sb …” is content of the
// reporting verb. Reject this concrete contradiction even in lenient mode;
// leniency must not turn a known wrong subject clause into a usable result.
function checkReportedContent(spans, tokens) {
  const reporting = /^(?:remind(?:s|ed|ing)?|tell(?:s|ing)?|told|inform(?:s|ed|ing)?|assur(?:e|es|ed|ing)|warn(?:s|ed|ing)?)$/i
  const layers = spans.filter(layered)
  for (const span of spans) {
    if (span.form !== 'clause' || span.role !== 'subject' || fold(tokens[span.start].text) !== 'that') continue
    const host = smallestContainer(span, layers)
    if (!host || !NONFINITE_FORMS.includes(host.form)) continue
    const own = other => smallestContainer(other, layers) === host
    const verb = spans.find(other => other.role === 'nonfinite-verb' && own(other)
      && other.end <= span.start && reporting.test(tokens[other.start].text))
    const recipient = verb && spans.some(other => ['object', 'indirect-object'].includes(other.role)
      && !layered(other) && own(other) && other.start >= verb.end && other.end <= span.start)
    if (recipient) throw spanError(`"${span.text}" gives the content of "${verb.text}" after its recipient; label the that-clause object, not subject. Quotation marks do not change this role.`)
  }
}

// One object inside an object of the same layer (a road trip inside a road
// trip from …) repeats the outer one; two or more (apples and pears) are the
// members of a coordination.
function settleSameRoleNesting(spans, tokens) {
  const members = new Map()
  for (const span of spans) {
    if (span.role === 'connector' || span.pieces) continue
    const container = smallestContainer(span, spans)
    if (!container || container.role !== span.role || layered(container)) continue
    members.set(container, [...(members.get(container) || []), span])
  }
  const cores = new Set()
  // Members are coordinated only when a coordinator or a comma joins them; "less than two weeks"
  // + "before the Olympiad begins" are a measure and the clause it measures, not a pair.
  const joined = (list) => {
    const sorted = [...list].sort((a, b) => a.start - b.start)
    return sorted.slice(1).every((member, index) => {
      const from = sorted[index].end
      return tokens.slice(from, member.start).some((token) => /^[,;，；]$/.test(token.text) || COORDINATORS.has(fold(token.text)))
    })
  }
  for (const [container, list] of members) {
    if (list.length > 1 && joined(list)) container.form = 'coordination'
    else if (list.length > 1) cores.add(container)
    else if (!layered(list[0])) {
      const core = list[0]
      // Removing a redundant grammatical core must not erase its teaching hint.
      const lexical = core.obstacles.find(isLexicalObstacle)
      if (lexical && core.note && !container.note) {
        container.obstacles = [...new Set([...container.obstacles, lexical])]
        container.collocationSpans = core.collocationSpans || piecesOf(core)
        container.note = core.note
      }
      cores.add(core)
    }
  }
  return spans.filter((span) => !cores.has(span))
}

// "It was X that …": X keeps its role and is marked as emphasized; the frame
// "It was … that" becomes one two-part unit that the card can fade.
function addCleftFrames(spans, tokens) {
  const word = (index) => (index >= 0 && index < tokens.length ? fold(tokens[index].text) : '')
  // "our creative spirit, our sense of freshness, that …": the link may follow a comma.
  const linkAfter = (end) => {
    let index = end
    while (index < tokens.length && !isWordToken(tokens[index])) index += 1
    return index
  }
  const framed = (start, end) => word(start - 2) === 'it' && CLEFT_BE.has(word(start - 1)) && CLEFT_LINKS.has(word(linkAfter(end)))
  const emphasized = new Set()
  for (const span of spans) {
    if (!span.obstacles.includes('cleft') || span.pieces) continue
    // "It was only when …": the focusing word belongs to what is emphasized.
    if (!framed(span.start, span.end) && CLEFT_FOCUS.has(word(span.start - 1)) && framed(span.start - 1, span.end)
      && !spans.some((other) => other !== span && other.start === span.start - 1 && other.end === span.start)) {
      span.start -= 1
    }
    if (framed(span.start, span.end)) {
      emphasized.add(span)
    } else if (span.form === 'clause') {
      const inner = spans.find((other) => other.start === span.start + 2 && holds(span, other) && framed(other.start, other.end))
      if (inner) emphasized.add(inner)
    }
  }
  const frames = []
  for (const span of emphasized) {
    if (spans.some((other) => other.role === 'cleft-frame' && other.start === span.start - 2)) continue
    if (!span.marks.includes('emphasized')) span.marks.push('emphasized')
    const link = linkAfter(span.end)
    frames.push({
      index: span.index,
      start: span.start - 2,
      end: link + 1,
      pieces: [{ start: span.start - 2, end: span.start }, { start: link, end: link + 1 }],
      text: 'It … that',
      role: 'cleft-frame',
      form: null,
      marks: [],
      restoreKind: null,
      sense: null,
      head: null,
      connector: null,
      serves: null,
      obstacles: [],
      restore: null,
      note: null,
      zh: [],
    })
  }
  if (frames.length === 0) return spans
  const insideFrame = (span) => frames.some((frame) => frame.pieces.some((piece) => contains(piece, span)))
  return [...spans.filter((span) => span.pieces || !insideFrame(span)), ...frames].sort(bySpanOrder)
}

const CLAUSE_BREAKS = new Set([';', ':', ',', '–', '—', '-'])
const REPORTING_VERBS = new Set(['say', 'says', 'said', 'tell', 'tells', 'told', 'ask', 'asks', 'asked', 'add', 'adds', 'added',
  'explain', 'explains', 'explained', 'write', 'writes', 'wrote', 'note', 'notes', 'noted', 'claim', 'claims', 'claimed', 'reply', 'replies', 'replied'])

// Models often mark only one of two main clauses (…; gone are the days …), almost
// always leaving out the first. When every stray main-level predicate lies on one
// side of the marked clause, past a coordinator or clause punctuation, the missing
// clause is exactly the rest of that side. Anything less clear-cut still goes back
// to the model.
function completeMainClauses(spans, tokens, sentenceText, subordinate) {
  const mains = spans.filter((span) => span.role === 'main')
  if (mains.length !== 1 || mains[0].pieces) return spans
  // Quoted speech and a trailing “, said X” make the reporting clause the real main clause.
  if (spans.some((span) => span.marks.includes('direct-speech'))) return spans
  const [main] = mains
  const stray = spans.filter((span) => span.role === 'predicate' && !holds(main, span) && !subordinate(span))
  if (stray.length === 0) return spans
  const before = stray.every((span) => span.end <= main.start)
  if (!before && !stray.every((span) => span.start >= main.end)) return spans
  if (!before && stray.some((span) => REPORTING_VERBS.has(fold(tokens[span.start].text)))) return spans
  const coordinators = spans.filter((span) => span.role === 'connector' && span.connector === 'coordinator' && !span.pieces)
  let edge = before ? main.start : main.end
  let broken = false
  const step = before ? -1 : 1
  const at = () => tokens[before ? edge - 1 : edge]
  const skipBreaks = () => {
    while (at() && !isWordToken(at())) {
      if (CLAUSE_BREAKS.has(at().text)) broken = true
      edge += step
    }
  }
  skipBreaks()
  const link = coordinators.find((span) => (before ? span.end === edge : span.start === edge))
  if (link) {
    broken = true
    edge = before ? link.start : link.end
    skipBreaks()
  }
  if (!broken) return spans
  const range = trimPunctuation(tokens, before ? { start: 0, end: edge } : { start: edge, end: tokens.length })
  if (range.end <= range.start || !stray.every((span) => contains(range, span))) return spans
  if (spans.some((span) => crossesSpan(span, range) || (span !== main && holds(span, range)))) return spans
  // A coordinator loose in the gap (“A,” and neither will B, said C) joins more than one clause there.
  const looseLink = coordinators.some((span) => contains(range, span)
    && !spans.some((other) => other !== span && other.role !== 'connector' && holds(other, span) && contains(range, other)))
  if (looseLink) return spans
  const added = {
    index: main.index,
    start: range.start,
    end: range.end,
    text: quoteOf(sentenceText, tokens, range),
    role: 'main',
    form: 'clause',
    marks: [],
    restoreKind: null,
    sense: null,
    head: null,
    logicalSubject: null,
    connector: null,
    serves: null,
    obstacles: [],
    restore: null,
    note: null,
    zh: [],
  }
  return [...spans, added].sort(bySpanOrder)
}

function quoteOf(sentenceText, tokens, piece) {
  return sentenceText.slice(tokens[piece.start].start, tokens[piece.end - 1].end)
}

function occurrenceOf(tokens, piece) {
  const pattern = tokens.slice(piece.start, piece.end).map((token) => token.text)
  const starts = []
  for (let start = 0; start + pattern.length <= tokens.length; start += 1) {
    if (pattern.every((text, offset) => tokens[start + offset].text === text)) starts.push(start)
  }
  return starts.length > 1 ? starts.indexOf(piece.start) + 1 : null
}

export function spansToAuthoring(reply, sentenceText, { lenient = false } = {}) {
  if (!reply || typeof reply !== 'object' || !Array.isArray(reply.spans)) throw spanError('reply needs a spans array')
  const tokens = tokenizeSentence(sentenceText)
  const problems = []
  let after = 0
  let spans = reply.spans.map((raw, index) => {
    const span = readSpan(raw, index, tokens, problems, after)
    if (span) after = span.start
    return span
  }).filter(Boolean)
  // A bare negator is not a conjunction. Paired connectors retain their full pieces.
  spans = spans.filter(span => !(span.role === 'connector' && connectorWords(span, tokens).join(' ') === 'not'))
  for (const span of spans) {
    const text = connectorWords(span, tokens).join(' ')
    if (span.obstacles.includes('partial-negation') && /\bnot\b.*\bbut\b/.test(text)
      && !/\bnot (all|every|always|both|entirely|completely|necessarily)\b/.test(text)) {
      span.obstacles = span.obstacles.filter(flag => flag !== 'partial-negation')
      // The contrasting members themselves carry the meaning; discard the stale explanation.
      span.note = null
    }
  }
  spans.sort(bySpanOrder)

  const kept = []
  for (const span of spans) {
    const clash = kept.find((other) => crossesSpan(other, span))
    if (clash) {
      problems.push(`"${span.text}" partly overlaps "${clash.text}"; spans may nest but must not partly overlap`)
      continue
    }
    const twin = kept.find((other) => other.start === span.start && other.end === span.end && other.role === span.role)
    if (twin) {
      if (!twin.form) twin.form = span.form
      continue
    }
    kept.push(span)
  }
  spans = splitLinkingPredicatives(mergeConnectorTwins(kept), tokens, sentenceText)
  if (!lenient && problems.length > 0) throw spanError(problems.join('\n'))

  // A relative clause opens with a relative word; one opened by before / because / although
  // (two weeks before the Olympiad begins) is an adverbial clause, whatever noun sits in front.
  for (const span of spans) {
    if (span.role !== 'attributive' || span.form !== 'clause') continue
    const lead = spans.find((other) => other.role === 'connector' && other.connector === 'subordinator' && other.start === span.start)
    const sense = lead && ADVERBIAL_SUBORDINATORS[fold(tokens[lead.start].text)]
    if (!sense) continue
    span.role = 'adverbial'
    span.sense = sense
    span.head = null
  }

  // Coordinate clauses inside a clause (that A, B and C) are members of that clause's role, not main clauses.
  const hosts = spans.filter((span) => span.role !== 'main' && span.role !== 'connector')
  for (const span of spans) {
    if (span.role !== 'main') continue
    const host = smallestContainer(span, hosts)
    if (!host) continue
    span.role = host.role
    span.form = 'clause'
  }

  // A predicate inside a subordinate clause outside the main span (… when you plan your future) is not another main clause.
  const subordinate = (span) => spans.some((other) => other.form === 'clause' && other.role !== 'main' && holds(other, span))
  spans = completeMainClauses(spans, tokens, sentenceText, subordinate)
  const coordinate = spans.filter((span) => span.role === 'main')
  if (coordinate.length === 1 && spans.some(span => span.role === 'predicate' && !holds(coordinate[0], span) && !subordinate(span))) {
    throw spanError('A role=main span covers only one of multiple main clauses. Include a role=main span for EACH complete main clause, including the clause before the colon; keep their subjects and predicates separate.')
  }
  const mains = coordinate.length > 1 ? coordinate : []
  const rootSpans = mains.length > 0 ? mains : coordinate
  let rest = spans.filter((span) => span.role !== 'main')
  // The ’s of "Let’s" is "us", the object of let, not a verb.
  for (const span of rest) {
    if (span.role === 'predicate' && span.end - span.start === 1 && /^['’]s$/.test(tokens[span.start].text) && /^let$/i.test(tokens[span.start - 1]?.text || '')) span.role = 'object'
  }
  rest = promoteVerbSpans(rest)
  checkReportedContent(rest, tokens)
  rest = settleSameRoleNesting(addCleftFrames(settleVerblessClauses(rest, tokens), tokens), tokens)
  const whole = { start: 0, end: tokens.length }
  const roots = mains.length > 0
    ? mains.map((span, index) => ({ id: `c${index}`, range: { start: span.start, end: span.end } }))
    : [{ id: 'c0', range: whole }]
  const rootOf = (range) => roots.find((root) => holds(root.range, range)) || null
  // A span outside every main clause (who … after "says Abby Jaramillo") belongs to the clause before it;
  // a coordinator between two main clauses stays outside both.
  for (const span of rest) {
    if (span.role === 'connector' || rootOf(span)) continue
    const host = roots.findLast((root) => root.range.start <= span.start) || roots[0]
    host.range = { start: Math.min(host.range.start, span.start), end: Math.max(host.range.end, span.end) }
  }

  const nodes = rest.map((span, index) => ({ ...span, id: `u${index + 1}` }))
  const containerOf = (node) => {
    let best = null
    for (const other of nodes) {
      if (other === node || !holds(other, node)) continue
      if (other.start === node.start && other.end === node.end && nodes.indexOf(other) > nodes.indexOf(node)) continue
      if (!best || (other.end - other.start) <= (best.end - best.start)) best = other
    }
    return best
  }
  const isLayer = layered

  for (const node of nodes) {
    const container = containerOf(node)
    node.parentNode = container
    node.parentKey = container?.id || rootOf(node)?.id || null
  }
  const layerOf = (node) => {
    let current = node.parentNode
    while (current) {
      if (isLayer(current)) return current.id
      current = current.parentNode
    }
    return rootOf(node)?.id || null
  }
  const clauseOf = (node) => {
    let current = node.parentNode
    while (current) {
      if (current.form === 'clause') return current
      current = current.parentNode
    }
    return null
  }

  const merged = mergeSplitPredicates(nodes, tokens)
  const units = roots.map((root, index) => ({
    id: root.id,
    quote: quoteOf(sentenceText, tokens, root.range),
    occurrence: occurrenceOf(tokens, root.range),
    form: 'clause',
    role: null,
    layer: null,
    parent: null,
    ...(rootSpans[index]?.marks.length ? { marks: rootSpans[index].marks } : {}),
    ...(rootSpans[index]?.obstacles.length ? { obstacles: rootSpans[index].obstacles } : {}),
    ...(rootSpans[index]?.focusObstacles ? { focusObstacles: rootSpans[index].focusObstacles.filter(item => rootSpans[index].obstacles.includes(item)) } : {}),
    ...(rootSpans[index]?.note ? { note: rootSpans[index].note } : {}),
  }))
  const byId = new Map()
  for (const node of merged) {
    const connector = node.role === 'connector'
    const unit = {
      id: node.id,
      quote: node.pieces.length > 1 ? node.pieces.map((piece) => quoteOf(sentenceText, tokens, piece)) : quoteOf(sentenceText, tokens, node.pieces[0]),
      occurrence: node.pieces.length > 1 ? node.pieces.map((piece) => occurrenceOf(tokens, piece)) : occurrenceOf(tokens, node.pieces[0]),
      form: connector ? 'word' : baseForm(node),
      role: connector ? node.serves : node.role,
      layer: layerOf(node),
      parent: node.parentKey,
    }
    if (connector) {
      unit.connector = connectorKind(node, tokens, clauseOf(node))
      if (prepositionRelative(node, tokens, unit.connector) && !node.obstacles.includes('preposition-relative')) node.obstacles.push('preposition-relative')
    }
    if (node.sense && unit.role === 'adverbial') unit.sense = node.sense
    if (node.obstacles.length > 0) unit.obstacles = node.obstacles
    if (node.focusObstacles) unit.focusObstacles = node.focusObstacles.filter(item => node.obstacles.includes(item))
    if (node.collocationSpans && node.obstacles.some(isLexicalObstacle)) unit.collocationSpans = node.collocationSpans
    if (node.marks.length > 0) unit.marks = node.marks
    if (node.note) unit.note = node.note
    if (node.voice && NONFINITE_FORMS.includes(unit.form) && !linkingNonfinite(node, merged, tokens)) unit.voice = node.voice
    if (node.action && unit.voice) unit.action = node.action
    if (node.zh.length > 0) unit.zh = node.zh
    units.push(unit)
    byId.set(unit.id, { unit, node })
  }

  const coverageOf = (unit) => byId.get(unit.id)?.node.pieces || [roots.find((root) => root.id === unit.id).range]
  const exactUnit = (start, end) => units.find((unit) => {
    if (!byId.has(unit.id)) return false
    const pieces = coverageOf(unit)
    return pieces.length === 1 && pieces[0].start === start && pieces[0].end === end
  })

  let headCount = 0
  const headUnit = (node, text = node.head) => {
    let matches = findRanges(tokens, text)
    if (matches.length === 0 && /^us$/i.test(text || '')) {
      matches = tokens
        .filter((token) => /^['’]s$/.test(token.text) && /^let$/i.test(tokens[token.index - 1]?.text || ''))
        .map((token) => ({ start: token.index, end: token.index + 1 }))
    }
    if (matches.length === 0) return null
    const before = matches.filter((range) => range.end <= node.start)
    const pick = before.length > 0 ? before[before.length - 1] : matches.find((range) => range.start >= node.end) || matches[0]
    if (contains(node, pick)) return null
    const existing = exactUnit(pick.start, pick.end)
    if (existing) return existing.id
    // A head that spells out a whole clause (…, which is why …) points at that clause.
    if (merged.some((other) => other.role === 'predicate' && holds(pick, other))) {
      const host = merged
        .filter((other) => other.form === 'clause' && holds(other, pick))
        .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
      return host?.id || rootOf(pick)?.id || null
    }
    const holder = merged
      .filter((other) => holds(other, pick))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] || null
    headCount += 1
    const id = `h${headCount}`
    const unit = {
      id,
      quote: quoteOf(sentenceText, tokens, pick),
      occurrence: occurrenceOf(tokens, pick),
      form: pick.end - pick.start === 1 ? 'word' : 'phrase',
      role: 'head',
      layer: holder ? (isLayer(holder) ? holder.id : layerOf(holder)) : rootOf(pick)?.id || null,
      parent: holder?.id || rootOf(pick)?.id || null,
    }
    units.push(unit)
    byId.set(id, { unit, node: { pieces: [pick] } })
    return id
  }

  const relations = []
  const pairs = new Set()
  const relate = (kind, from, to, implied = false) => {
    const key = `${kind}:${from}>${to}`
    if (!to || from === to || pairs.has(key)) return
    pairs.add(key)
    relations.push({ id: `r${relations.length + 1}`, kind, from, to: [to], ...(implied ? { implied: true } : {}) })
  }
  const members = (layerId, role) => units.filter((unit) => byId.has(unit.id) && unit.layer === layerId && unit.role === role && unit.form !== 'coordination')
  const firstStart = (unit) => Math.min(...coverageOf(unit).map((piece) => piece.start))
  // A layer may hold two clauses the model flattened ("A joined me, and we
  // decided B"): a coordinator followed by its own subject and predicate opens
  // a new clause, and subject, predicate and adverbial links stay inside one.
  const clauseBreaks = (layerId) => {
    const coordinators = units.filter((unit) => byId.has(unit.id) && unit.layer === layerId && unit.connector === 'coordinator')
      .map(firstStart).sort((a, b) => a - b)
    const subjects = members(layerId, 'subject').map(firstStart)
    const predicates = members(layerId, 'predicate').map(firstStart)
    return coordinators.filter((at, index) => {
      const inside = (start) => start > at && start < (coordinators[index + 1] ?? Infinity)
      return subjects.some((start) => start < at) && subjects.some(inside) && predicates.some(inside)
    })
  }
  const sameClause = (layerId, list, unit) => {
    const breaks = clauseBreaks(layerId)
    const clauseOf = (item) => breaks.filter((at) => at < firstStart(item)).length
    const own = list.filter((item) => clauseOf(item) === clauseOf(unit))
    return own.length > 0 ? own : list
  }

  // The whole predicate before the subject is full inversion; only part of it is partial inversion.
  for (const { unit } of byId.values()) {
    if (!unit.obstacles?.includes('inversion')) continue
    const layer = unit.form === 'clause' ? unit.id : unit.layer
    // An inverted predicate pairs with the subject right after it: in
    // "neither will the department stop …, said Auyeung" said goes with Auyeung.
    const own = unit.role === 'predicate' ? coverageOf(unit) : null
    const subject = own
      ? members(layer, 'subject').find((item) => firstStart(item) >= own[0].end)
      : members(layer, 'subject')[0]
    const pieces = own || members(layer, 'predicate').flatMap(coverageOf)
    if (!subject || pieces.length === 0) continue
    const ahead = pieces.filter((piece) => piece.end <= firstStart(subject)).length
    if (ahead === 0) continue
    const inversion = ahead === pieces.length ? 'full-inversion' : 'partial-inversion'
    unit.obstacles.splice(unit.obstacles.indexOf('inversion'), 1, inversion)
    if (unit.focusObstacles) unit.focusObstacles = [...new Set(unit.focusObstacles.map(item => item === 'inversion' ? inversion : item))]
  }

  const gapped = (list) => Boolean(list?.includes('gapping'))
  const layerGapped = (layerId) => {
    const rootIndex = roots.findIndex((root) => root.id === layerId)
    return rootIndex >= 0 ? gapped(rootSpans[rootIndex]?.obstacles) : gapped(units.find((unit) => unit.id === layerId)?.obstacles)
  }
  // 承前省略: "the Greeks [brought] …" borrows the predicate of the main clause before it.
  const borrowedPredicates = (layerId) => {
    const rootIndex = roots.findIndex((root) => root.id === layerId)
    if (rootIndex >= 0) return rootIndex > 0 ? members(roots[rootIndex - 1].id, 'predicate') : []
    const layer = units.find((unit) => unit.id === layerId)
    const earlier = units
      .filter((unit) => byId.has(unit.id) && unit.id !== layerId && unit.form === 'clause' && unit.parent === layer?.parent && unit.role === layer?.role && firstStart(unit) < firstStart(layer))
      .sort((a, b) => firstStart(b) - firstStart(a))
    for (const clause of earlier) {
      const found = members(clause.id, 'predicate')
      if (found.length > 0) return found
    }
    return []
  }
  const layerIds = new Set(units.map((unit) => unit.layer).filter(Boolean))
  // A later coordinate clause with ellipsis and no verb of its own shares the verb before it: that is gapping.
  for (const unit of units) {
    const list = unit.obstacles
    if (unit.form !== 'clause' || !list?.includes('ellipsis') || members(unit.id, 'predicate').length > 0 || borrowedPredicates(unit.id).length === 0) continue
    list.splice(list.indexOf('ellipsis'), 1, 'gapping')
  }
  for (const layerId of layerIds) {
    for (const subject of members(layerId, 'subject')) {
      const own = sameClause(layerId, members(layerId, 'predicate'), subject)
      const borrow = own.length === 0 && (gapped(subject.obstacles) || layerGapped(layerId))
      for (const predicate of borrow ? borrowedPredicates(layerId) : own) {
        relate('subject-predicate', subject.id, predicate.id, borrow || gapped(subject.obstacles))
      }
    }
  }
  roots.forEach((root, index) => {
    const span = rootSpans[index]
    if (!span?.head || !span.marks.includes('explanatory')) return
    const target = headUnit(span)
    if (target) relate('explains', root.id, target)
  })
  for (const { unit, node } of byId.values()) {
    if (!node.role) continue
    const clause = node.form === 'clause'
    if (node.logicalSubject && NONFINITE_FORMS.includes(node.form)) {
      // A model-specified controller is evidence, never a guessed nearest subject.
      const target = headUnit(node, node.logicalSubject)
      if (target) relate('logical-subject', unit.id, target)
      else problems.push(`logicalSubject "${node.logicalSubject}" must identify words outside "${node.text}" in the sentence`)
    }
    if (node.head && node.marks.includes('explanatory')) {
      const target = headUnit(node)
      if (target) relate('explains', unit.id, target)
    } else if (node.head && ['attributive', 'appositive', 'object-complement', 'subject-complement'].includes(unit.role)) {
      const target = headUnit(node)
      if (target) relate(['object-complement', 'subject-complement'].includes(unit.role) ? 'complements' : 'modifies', unit.id, target)
      if (target && clause) {
        const guide = units.find((item) => item.parent === unit.id && item.connector && ['relative-pronoun', 'relative-adverb'].includes(item.connector))
        if (guide) relate('refers-to', guide.id, target)
      }
    } else if (['object-complement', 'subject-complement'].includes(unit.role)) {
      const target = sameClause(unit.layer, members(unit.layer, unit.role === 'object-complement' ? 'object' : 'subject'), unit)[0]
      if (target) relate('complements', unit.id, target.id)
    } else if (node.head && unit.role === 'adverbial') {
      // so difficult that …: the result clause points at the word so/such modifies.
      const target = headUnit(node)
      if (target) relate('modifies', unit.id, target)
    } else if (unit.role === 'adverbial' && !unit.connector) {
      const predicate = sameClause(unit.layer, members(unit.layer, 'predicate'), unit)[0] || members(unit.layer, 'nonfinite-verb')[0]
      if (predicate) relate('modifies', unit.id, predicate.id)
      if (!node.logicalSubject && ['present-participle', 'perfect-participle', 'past-participle', 'adjective-phrase'].includes(node.form)) {
        const subject = sameClause(unit.layer, members(unit.layer, 'subject'), unit)[0]
        if (subject) relate('logical-subject', unit.id, subject.id)
      }
    }
  }
  for (const [dummy, postponed] of [['dummy-it', 'postponed-subject'], ['dummy-object', 'postponed-object']]) {
    for (const unit of units) {
      if (!unit.obstacles?.includes(dummy)) continue
      const real = units.find((other) => other.layer === unit.layer && other.obstacles?.includes(postponed))
      if (real) relate('refers-to', unit.id, real.id)
    }
  }
  // 独立主格、for sb to do: the verb (or the first word after the logical subject) points at it.
  for (const layerId of layerIds) {
    const [subject] = members(layerId, 'logical-subject')
    if (!subject) continue
    const verb = members(layerId, 'nonfinite-verb')[0] || units
      .filter((unit) => byId.has(unit.id) && unit.layer === layerId && unit.id !== subject.id && !unit.connector && firstStart(unit) > firstStart(subject))
      .sort((a, b) => firstStart(a) - firstStart(b))[0]
    if (verb) relate('logical-subject', verb.id, subject.id)
  }

  const covers = (unit, index) => coverageOf(unit).some((piece) => piece.start <= index && index < piece.end)
  const imperative = (layerId, range, predicates) => {
    const first = Math.min(...predicates.flatMap((unit) => coverageOf(unit).map((piece) => piece.start)))
    const lead = units.filter((unit) => byId.has(unit.id) && unit.layer === layerId && (unit.connector || ['adverbial', 'parenthetical'].includes(unit.role)))
    for (let index = range.start; index < first; index += 1) {
      if (isWordToken(tokens[index]) && !IMPERATIVE_LEAD.test(tokens[index].text) && !lead.some((unit) => covers(unit, index))) return false
    }
    return true
  }
  const trunkProblems = []
  const layerSpans = [
    ...roots.map((root, index) => ({ id: root.id, root, span: rootSpans[index] || null, range: root.range })),
    ...merged.filter((node) => node.form === 'clause').map((node) => ({ id: node.id, root: null, span: node, range: node.pieces[0] })),
  ]
  for (const { id, root, span, range } of layerSpans) {
    const inLayer = units.filter((unit) => byId.has(unit.id) && unit.layer === id)
    const omits = (list) => Boolean(list?.includes('ellipsis') || list?.includes('gapping'))
    if (omits(span?.obstacles) || inLayer.some((unit) => omits(unit.obstacles))) continue
    const label = quoteOf(sentenceText, tokens, range)
    const predicates = members(id, 'predicate')
    if (predicates.length === 0) trunkProblems.push(`clause "${label}" has no predicate`)
    else if (members(id, 'subject').length === 0 && !((root || span?.marks.includes('direct-speech')) && imperative(id, range, predicates))) trunkProblems.push(`clause "${label}" has no subject`)
  }
  if (trunkProblems.length > 0) {
    problems.push(...trunkProblems, 'Every clause needs a subject span and a predicate span. If one is really omitted, give that clause obstacle "ellipsis" and a restore with the omitted words in [ ]; for the main clause, add a "main" span for it.')
  }

  const unitOf = (id) => units.find((unit) => unit.id === id)
  const extentOf = (unit) => {
    const pieces = coverageOf(unit)
    return { id: unit.id, start: Math.min(...pieces.map((piece) => piece.start)), end: Math.max(...pieces.map((piece) => piece.end)) }
  }
  // A restore rewrites the unit's own layer, or the layers around it.
  const scopesFor = (unitId) => {
    let current = unitOf(unitId)
    if (current && !LAYER_FORMS.includes(current.form)) current = unitOf(current.layer)
    const chain = []
    while (current) {
      chain.push(extentOf(current))
      current = current.layer ? unitOf(current.layer) : null
    }
    return chain
  }
  const restoreKindOf = (span) => {
    if (span.restoreKind) return span.restoreKind
    if (span.obstacles.includes('ellipsis') || span.obstacles.includes('gapping')) return 'ellipsis'
    if (['absolute', 'with-complex'].includes(span.form) || span.obstacles.includes('double-comparative')) return 'rewrite'
    return 'normal-order'
  }
  const restores = []
  const pushRestore = (unitId, scope, kind, segments) => {
    const key = `${scope}:${JSON.stringify(segments)}`
    if (restores.length >= LIMITS.restores || restores.some((item) => item.key === key)) return
    restores.push({ key, id: `s${restores.length + 1}`, unit: unitId, scope, kind, segments })
  }
  const addRestore = (unitId, span) => {
    if (!span?.restore) return
    const kind = restoreKindOf(span)
    const ellipsis = kind === 'ellipsis'
    const unit = unitOf(unitId)
    // Recipient-directed passives cannot acquire an unsupported dummy "it".
    // Keep the analysis but omit this optional restore when its subject is a guess.
    const guessedRecipient = ellipsis && /\b(instructed|told|asked|reminded|warned|invited)\b/i.test(span.text)
      && /\bit\s+(?:is|was|were|be)\b/i.test(span.restore.replace(/[\[\]]/g, ''))
    if (guessedRecipient) {
      const subjects = units.filter(item => item.layer === unit?.layer && item.role === 'subject')
      if (!subjects.some(item => typeof item.quote === 'string' && /^it$/i.test(item.quote.trim()))) return
    }
    const scopes = scopesFor(unitId)
    if (ellipsis && unit && !LAYER_FORMS.includes(unit.form)) scopes.unshift(extentOf(unit))
    // Reordering may reuse original words, never invent or borrow a new clause.
    // Remove misleading insertion brackets before alignment; unknown words fail.
    const restoreText = kind === 'normal-order' ? span.restore.replace(/\[([^\]]*)\]/g, '$1') : span.restore
    const aligned = alignRestore(tokens, scopes, restoreText, { borrowFirst: ellipsis, allowBorrow: kind !== 'normal-order' })
    if (aligned.problems.length > 0) {
      problems.push(...aligned.problems)
      return
    }
    if (kind === 'normal-order' && !span.obstacles.includes('cleft')) {
      const scope = scopes.find(item => item.id === aligned.scopeId)
      const reused = new Set(aligned.segments.flatMap(segment => 'start' in segment
        ? Array.from({ length: segment.end - segment.start }, (_, index) => segment.start + index) : []))
      const missing = scope && tokens.slice(scope.start, scope.end).filter((token, index) => isWordToken(token) && !reused.has(scope.start + index))
      if (missing?.length) {
        problems.push(`restore "${span.restore}": normal-order must retain every word in its scope, including ${missing.map(token => token.text).join(', ')}; only reorder, do not delete words`)
        return
      }
    }
    if (aligned.scopeId === unitId && scopes.length > 1 && !LAYER_FORMS.includes(unit.form)) {
      const [own, layer] = scopes
      aligned.scopeId = layer.id
      aligned.segments = [
        ...(own.start > layer.start ? [{ start: layer.start, end: own.start }] : []),
        ...aligned.segments,
        ...(layer.end > own.end ? [{ start: own.end, end: layer.end }] : []),
      ]
    }
    const kept = aligned.segments.find((segment, index) => 'start' in segment && 'text' in (aligned.segments[index + 1] || {}) && /^(do|does|did)$/i.test(tokens[segment.end - 1].text))
    if (ellipsis && kept) {
      problems.push(`restore "${span.restore}": "${tokens[kept.end - 1].text}" stands for the words you added; drop it instead of keeping it before them`)
      return
    }
    if (aligned.segments.some((segment) => 'text' in segment && segment.text.length > LIMITS.restoreInsert)) {
      problems.push(`restore "${span.restore}": keep each added part under ${LIMITS.restoreInsert} characters`)
      return
    }
    pushRestore(unitId, aligned.scopeId, restoreKindOf(span), aligned.segments)
  }
  roots.forEach((root, index) => addRestore(root.id, rootSpans[index]))
  for (const { unit, node } of byId.values()) addRestore(unit.id, node)

  // 代入先行词: put the antecedent back where the relative pronoun stands.
  for (const relation of relations) {
    if (relation.kind !== 'refers-to') continue
    const guide = unitOf(relation.from)
    const target = unitOf(relation.to[0])
    const clause = guide && unitOf(guide.parent)
    if (guide?.connector !== 'relative-pronoun' || !target || LAYER_FORMS.includes(target.form) || clause?.form !== 'clause') continue
    const guidePieces = coverageOf(guide)
    const targetPieces = coverageOf(target)
    if (guidePieces.length !== 1 || targetPieces.length !== 1) continue
    const [piece] = guidePieces
    const scope = extentOf(clause)
    let start = targetPieces[0].start
    // Reach back past adjectives to the determiner ("the larger context"), but
    // only when one is found; otherwise a verb could be swept in ("visited areas").
    for (let at = start - 1, words = 0; at >= 0 && words < 3 && (at < scope.start || at >= scope.end); at -= 1) {
      const word = fold(tokens[at].text)
      if (!isWordToken(tokens[at]) || ANTECEDENT_STOPS.has(word)) break
      if (DETERMINERS.has(word)) { start = at; break }
      words += 1
    }
    let antecedent = quoteOf(sentenceText, tokens, { start, end: targetPieces[0].end })
    if (antecedent.length + 2 > LIMITS.restoreInsert) continue
    if (start === 0 && DETERMINERS.has(fold(tokens[0].text))) antecedent = antecedent[0].toLowerCase() + antecedent.slice(1)
    const list = tokens.slice(piece.start, piece.end).filter(isWordToken).map((token) => fold(token.text))
    const source = (from, to) => (to > from ? [{ start: from, end: to }] : [])
    const before = source(scope.start, piece.start)
    const after = source(piece.end, scope.end)
    let segments
    if (list.length === 1 && list[0] === 'whose') {
      segments = [...before, { text: `${antecedent}’s` }, ...after]
    } else if (list.length === 1) {
      const predicate = guide.role === 'object' ? members(clause.id, 'predicate')[0] : null
      const cut = predicate ? coverageOf(predicate)[0].end : null
      segments = cut && cut > piece.end && cut <= scope.end
        ? [...before, ...source(piece.end, cut), { text: antecedent }, ...source(cut, scope.end)]
        : [...before, { text: antecedent }, ...after]
    } else if (QUANTIFIERS.has(list[0])) {
      segments = [...before, ...source(piece.start, piece.end - 1), { text: antecedent }, ...after]
    } else {
      // The phrase goes back right after the verb and its objects or
      // complements, ahead of any trailing participle or adverbial: at the very
      // end of the clause it could attach to that participle instead.
      const core = CLAUSE_CORE_ROLES.flatMap((role) => members(clause.id, role))
        .filter((unit) => coverageOf(unit).every((item) => item.start >= piece.end && item.end <= scope.end))
      let cut = core.length > 0 ? Math.max(...core.flatMap((unit) => coverageOf(unit).map((item) => item.end))) : null
      // Words that finish the core stay with it: a modifier right after its
      // noun ("columns separated by gaps") and the infinitive of a be +
      // adjective predicate ("was sure to fail"). A comma ends the core.
      const layerUnits = units.filter((unit) => byId.has(unit.id) && unit.layer === clause.id && coverageOf(unit).length === 1)
      const adjectivePredicate = (unit) => unit?.role === 'predicate' && layerUnits.some((item) => item.role === 'head' && item.parent === unit.id)
      while (cut) {
        const last = core.find((unit) => coverageOf(unit).at(-1).end === cut)
        const finishes = (unit) => ['attributive', 'appositive'].includes(unit.role)
          || (unit.role === 'adverbial' && unit.form === 'infinitive' && adjectivePredicate(last))
        const next = layerUnits.filter((unit) => coverageOf(unit)[0].start === cut && coverageOf(unit)[0].end <= scope.end && finishes(unit))
          .sort((a, b) => coverageOf(b)[0].end - coverageOf(a)[0].end)[0]
        if (!next) break
        cut = coverageOf(next)[0].end
        core.push(next)
      }
      const phrase = [...source(piece.start, piece.end - 1), { text: antecedent }]
      segments = cut
        ? [...before, ...source(piece.end, cut), ...phrase, ...source(cut, scope.end)]
        : [...before, ...source(piece.start, piece.end - 1), { text: `${antecedent},` }, ...after]
    }
    const joined = segments.reduce((list, segment) => {
      const last = list.at(-1)
      if (last && 'start' in last && 'start' in segment && last.end === segment.start) list[list.length - 1] = { ...last, end: segment.end }
      else list.push(segment)
      return list
    }, [])
    if (joined.some((segment) => 'start' in segment)) pushRestore(guide.id, clause.id, 'antecedent', joined)
  }

  for (const unit of units) {
    if (!unit.marks?.includes('emphasized')) continue
    const scopes = scopesFor(unit.id).map((scope) => scope.id)
    if (!restores.some((restore) => scopes.includes(restore.scope))) {
      problems.push(`cleft "${unit.quote}": add a restore that says the sentence without "It is/was … that"`)
    }
  }
  if (!lenient && problems.length > 0) throw spanError(problems.join('\n'))

  for (const unit of units) {
    if (unit.occurrence == null || (Array.isArray(unit.occurrence) && unit.occurrence.every((item) => item == null))) delete unit.occurrence
  }

  return {
    translationZh: typeof reply.translationZh === 'string' ? reply.translationZh : undefined,
    roots: roots.map((root) => root.id),
    units,
    relations,
    restores: restores.map(({ key, ...restore }) => restore),
    dropped: problems,
  }
}
