import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'

import { TOPIC_LABEL_TAXONOMY } from '../../shared/topics/topicTaxonomy.mjs'
import { stampGrammarFillDerivedFields } from './analyzeGrammarFill.mjs'
import { enumerateParagraphSummaryTargets } from './paragraphSummaries.mjs'

export const PUBLIC_SEARCH_METADATA_VERSION = 'public-search-metadata-v1'
export const PUBLIC_GENRES = Object.freeze(['记叙', '说明', '议论', '应用', '新闻'])
export const WORD_COUNT_ALGORITHM = 'latin-words-v1'

const here = path.dirname(fileURLToPath(import.meta.url))
const grammarFacets = JSON.parse(readFileSync(path.join(here, 'grammar-fill-facets-v2.json'), 'utf8'))
const grammarSimilarity = JSON.parse(readFileSync(path.join(here, 'grammar-fill-similarity-v1.json'), 'utf8'))
const grammarFacetByKey = new Map(grammarFacets.map((entry) => [entry.facet_key, entry]))
const grammarSimilarityByKey = new Map(grammarSimilarity.map((entry) => [entry.facet_key, entry]))
const topicLabels = new Set(TOPIC_LABEL_TAXONOMY.map((entry) => entry.label))

const readingSubtypes = new Map([
  ['detail', new Set(['general-detail', 'behavior-reason', 'calculation', 'comparison-integration', 'situation-match'])],
  ['main-idea', new Set(['paragraph-main-idea', 'passage-main-idea', 'best-title'])],
  ['inference', new Set(['detail-inference', 'attitude', 'writing-purpose', 'character-trait', 'source'])],
  ['word-meaning', new Set(['word', 'phrase', 'sentence'])],
  ['reference', new Set(['reference'])],
  ['writing-method', new Set(['writing-method'])],
])
const readingTechniques = new Set(['example', 'comparison', 'quotation', 'statistics', 'definition', 'topic-introduction', 'viewpoint-support'])
const positions = new Set(['seven-choices.position.paragraph-start', 'seven-choices.position.paragraph-middle', 'seven-choices.position.paragraph-end'])
const roles = new Set(['seven-choices.role.topic', 'seven-choices.role.summary', 'seven-choices.role.bridge', 'seven-choices.role.cohesion'])
const mechanisms = new Set(['seven-choices.cohesion.grammatical.referential-cohesion', 'seven-choices.cohesion.grammatical.logical-connector', 'seven-choices.cohesion.lexical.topic-field-alignment'])
const grammarRoles = new Set(['subject', 'predicative', 'object', 'attributive', 'adverbial', 'object-complement', 'subject-complement'])
const clozePos = new Set(['verb', 'noun', 'adjective', 'adverb', 'phrase', 'other'])
const clozeFacetByPos = new Map([
  ['verb', 'cloze.signature.verb.action-sequence'], ['noun', 'cloze.signature.noun.semantic-field'],
  ['adjective', 'cloze.signature.adjective.affective-consistency'], ['adverb', 'cloze.signature.adverb.affective-consistency'],
  ['phrase', 'cloze.signature.phrase.contextual-composition'],
])
const supportedFamilies = new Set(['reading', 'seven-choices', 'cloze', 'grammar-fill', 'application-writing', 'continuation-writing'])
const digestPattern = /^sha256:[a-f0-9]{64}$/

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function textOf(block) {
  if (block?.kind !== 'paragraph' || !Array.isArray(block.content)) return ''
  // Preserve source runs, but do not let omitted inline nodes merge adjacent words.
  return block.content.filter((item) => item?.kind === 'text').map((item) => item.text).join(' ')
}

function proseParagraphs(materialization, group) {
  const ids = new Set(enumerateParagraphSummaryTargets(materialization)
    .filter((target) => target.groupId === group.groupId).map((target) => target.paragraphId))
  const visit = (blocks) => (blocks || []).flatMap((block) => block.kind === 'framed_columns'
    ? block.columns.flatMap((column) => visit(column.blocks))
    : ids.has(block.blockId) ? [block] : [])
  return visit(group.blocks)
}

/** Counts only source prose text runs. Blank inline nodes, hints, options and chrome are not text runs in this scope. */
export function countPublicSourceWords(blocks) {
  return (blocks || []).reduce((count, block) => count + (textOf(block).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length, 0)
}

function topicLabelsValid(value) {
  return Array.isArray(value) && value.length > 0 && value.length === new Set(value).size
    && value.every((label) => typeof label === 'string' && topicLabels.has(label))
}

function questionOwner(materialization) {
  return new Map(materialization.groups.flatMap((group) => group.questions.map((question) => [question.questionId, { group, question }])))
}

function answerByQuestion(materialization) {
  return new Map(materialization.answers.map((answer) => [answer.questionId, answer.value]))
}

function deterministicGroup(materialization, group, answers) {
  const paragraphs = proseParagraphs(materialization, group)
  const questions = group.questions || []
  const base = {
    groupId: group.groupId,
    family: group.family,
    paragraphIds: paragraphs.map((block) => block.blockId),
    questionIds: questions.map((question) => question.questionId),
    counts: {
      paragraphCount: paragraphs.length,
      questionCount: questions.length,
      taskCount: group.writingTask ? 1 : 0,
      wordCount: countPublicSourceWords(paragraphs),
      wordCountAlgorithm: WORD_COUNT_ALGORITHM,
      wordCountParagraphIds: paragraphs.map((block) => block.blockId),
    },
  }
  if (group.family === 'reading') base.readingSlot = /^reading\.([a-d])$/.exec(group.slotId)?.[1]?.toUpperCase() || null
  if (group.family === 'grammar-fill') {
    base.grammarSourceFacts = Object.fromEntries(questions.map((question) => [question.questionId, {
      blankId: question.blankId,
      blankType: question.prompt ? 'given' : 'no-hint',
      hint: question.prompt,
      answer: answers.get(question.questionId),
      // Entire passage is the conservative default. An AI may narrow this only
      // by returning explicit ordered contextParagraphIds that still include the target.
      contextParagraphIds: paragraphs.map((block) => block.blockId),
    }]))
  }
  if (group.writingTask) {
    base.writingSource = {
      taskType: group.writingTask.taskType,
      prompt: group.writingTask.prompt,
      material: [...group.writingTask.material],
      starters: [...group.writingTask.starters],
      wordCountTarget: group.writingTask.wordCountTarget,
    }
  }
  return base
}

/** Produces model input plus deterministic counts, source facts and answer authority. */
export function preparePublicSearchMetadataRequest({ materialization, sourceDigest, candidateDigest }) {
  for (const [name, digest] of Object.entries({ sourceDigest, candidateDigest })) {
    if (!digestPattern.test(digest || '')) throw new Error(`PUBLIC_METADATA_${name.toUpperCase()}_INVALID`)
  }
  const answers = answerByQuestion(materialization)
  const groups = materialization.groups.filter((group) => supportedFamilies.has(group.family))
  return {
    schemaVersion: PUBLIC_SEARCH_METADATA_VERSION,
    binding: { paperId: materialization.paperId, sourceDigest, candidateDigest },
    deterministic: groups.map((group) => deterministicGroup(materialization, group, answers)),
    sourceGroups: groups.map((group) => ({
      groupId: group.groupId, family: group.family, slotId: group.slotId,
      blocks: structuredClone(group.blocks),
      optionBank: structuredClone(group.optionBank),
      questions: group.questions.map((question) => ({
        questionId: question.questionId, sourceNumber: question.sourceNumber, canonicalNumber: question.canonicalNumber,
        blankId: question.blankId, stem: question.stem,
        prompt: question.prompt, options: question.options,
        authoritativeAnswer: answers.get(question.questionId),
      })),
      writingTask: group.writingTask ? structuredClone(group.writingTask) : null,
    })),
    controlledValues: {
      genres: PUBLIC_GENRES, topics: TOPIC_LABEL_TAXONOMY,
      reading: Object.fromEntries([...readingSubtypes].map(([family, values]) => [family, [...values]])),
      readingTechniques: [...readingTechniques], positions: [...positions], roles: [...roles], mechanisms: [...mechanisms],
      clozePos: [...clozePos], clozeSignatureFacets: [...clozeFacetByPos.values()],
      grammarFacets, grammarSimilarity,
    },
    outputContract: authoredOutputContract(groups),
    instructions: [
      'Return only public-search-metadata-v1 JSON. Classifications are not teaching analysis.',
      'Return authored fields only. Copy group/question identities exactly; the program adds bindings, counts, source facts, blank identities and grammar derived fields.',
      'Official answers are read-only authority. Never create or normalize an answer; preserve alternatives such as which/that verbatim.',
      'Genre is one real five-class text genre and is independent from family/question type.',
      'Do not produce summaries, translations, evidence offsets, reasons, essays, difficulty, CEFR or embeddings.',
      'Grammar context defaults to the full passage. Narrow only when dependency is certainly local; IDs must be ordered, in-group, and include the target paragraph.',
      'Listening is absent unless separately captured and is never required by this contract.',
    ],
  }
}

function authoredOutputContract(groups) {
  const string = { type: 'string', minLength: 1 }
  const questions = (properties) => ({ type: 'array', items: {
    type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
  } })
  const family = (name, metadata) => ({ type: 'object', properties: {
    family: { const: name }, metadata,
  } })
  return {
    type: 'object', additionalProperties: false, required: ['groups'],
    properties: { groups: { type: 'array', minItems: groups.length, maxItems: groups.length, items: { allOf: [{
      type: 'object', additionalProperties: false, required: ['groupId', 'family', 'topicLabels', 'genre', 'metadata'],
      properties: { groupId: { enum: groups.map((group) => group.groupId) }, family: { enum: [...supportedFamilies] },
        topicLabels: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: [...topicLabels] } },
        genre: { enum: PUBLIC_GENRES }, metadata: { type: 'object' } },
    }, { oneOf: [
      family('reading', { type: 'object', additionalProperties: false, required: ['slot', 'questions'], properties: {
        slot: { enum: ['A', 'B', 'C', 'D'] }, questions: questions({ questionId: string, similarityProfile: { type: 'object', additionalProperties: false, required: ['family', 'subtype', 'detailScope', 'technique'], properties: { family: { enum: [...readingSubtypes.keys()] }, subtype: string, detailScope: { type: ['string', 'null'] }, technique: { type: ['string', 'null'] } } } }),
      } }),
      family('seven-choices', { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: questions({ questionId: string, positionFacet: { enum: [...positions] }, roleFacet: { enum: [...roles] }, primaryMechanismFacet: { enum: [...mechanisms] } }) } }),
      family('cloze', { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: questions({ questionId: string, pos: { enum: [...clozePos] }, signatureFacet: { type: ['string', 'null'] } }) } }),
      family('grammar-fill', { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: questions({ questionId: string, facetKey: { enum: [...grammarFacetByKey.keys()] }, role: { type: ['string', 'null'] }, similarityProfile: { type: 'object', additionalProperties: false, required: ['route', 'features'], properties: { route: string, features: { type: 'array', uniqueItems: true, items: string } } }, contextParagraphIds: { type: 'array', minItems: 1, items: string } }) } }),
      family('application-writing', { type: 'object', additionalProperties: false, required: ['writingTaskId', 'form', 'function'], properties: { writingTaskId: string, form: { ...string, maxLength: 80 }, function: { ...string, maxLength: 80 } } }),
      family('continuation-writing', { type: 'object', additionalProperties: false, required: ['writingTaskId', 'situation', 'conflict', 'relationships'], properties: { writingTaskId: string, situation: string, conflict: string, relationships: { type: 'array', items: string } } }),
    ] }] } } },
  }
}

/** Adds all authority-owned identities and deterministic values after model classification. */
export function finalizePublicSearchMetadata({ authored, materialization, sourceDigest, candidateDigest }) {
  const prepared = preparePublicSearchMetadataRequest({ materialization, sourceDigest, candidateDigest })
  const validateAuthored = new Ajv({ strict: true }).compile(prepared.outputContract)
  if (!validateAuthored(authored)) throw new Error(`PUBLIC_METADATA_AUTHORED_SHAPE_INVALID: ${validateAuthored.errors?.[0]?.instancePath || '$'}`)

  const sourceById = new Map(prepared.sourceGroups.map((group) => [group.groupId, group]))
  const seen = new Set()
  for (const group of authored.groups) {
    const source = sourceById.get(group.groupId)
    if (!source || seen.has(group.groupId)) throw new Error('PUBLIC_METADATA_AUTHORED_GROUP_COVERAGE_INVALID')
    seen.add(group.groupId)
    if (group.family !== source.family) throw new Error('PUBLIC_METADATA_AUTHORED_FAMILY_INVALID')
    if (Array.isArray(group.metadata.questions)) {
      const expected = source.questions.map(({ questionId }) => questionId).sort()
      const actual = group.metadata.questions.map(({ questionId }) => questionId).sort()
      if (actual.length !== new Set(actual).size || JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('PUBLIC_METADATA_AUTHORED_QUESTION_COVERAGE_INVALID')
      }
    }
  }
  if (seen.size !== sourceById.size) throw new Error('PUBLIC_METADATA_AUTHORED_GROUP_COVERAGE_INVALID')

  const authoredById = new Map(authored.groups.map((group) => [group.groupId, group]))
  const sidecar = {
    schemaVersion: PUBLIC_SEARCH_METADATA_VERSION,
    paperId: materialization.paperId,
    sourceDigest,
    candidateDigest,
    groups: prepared.deterministic.map((deterministic) => {
      const source = authoredById.get(deterministic.groupId) || {}
      const metadata = structuredClone(source.metadata)
      const sourceGroup = materialization.groups.find((group) => group.groupId === deterministic.groupId)
      if (Array.isArray(metadata?.questions)) metadata.questions = metadata.questions.map((item) => {
        const question = sourceGroup.questions.find((candidate) => candidate.questionId === item?.questionId)
        if (sourceGroup.family === 'seven-choices' || sourceGroup.family === 'cloze') return { ...item, blankId: question?.blankId }
        if (sourceGroup.family !== 'grammar-fill') return item
        const fact = deterministic.grammarSourceFacts[item.questionId]
        const holder = { blanks: { [item.questionId]: {
          facetKey: item.facetKey, hint: fact?.hint, answer: fact?.answer,
          role: item.role, similarityProfile: item.similarityProfile,
        } } }
        stampGrammarFillDerivedFields(holder)
        const stamped = holder.blanks[item.questionId]
        const derived = Object.fromEntries(['tense', 'voice', 'agreementSensitive', 'form', 'similarityForm']
          .filter((key) => Object.hasOwn(stamped, key)).map((key) => [key, stamped[key]]))
        return { questionId: item.questionId, blankId: fact?.blankId, blankType: fact?.blankType, hint: fact?.hint,
          facetKey: item.facetKey, role: item.role, similarityProfile: item.similarityProfile,
          contextParagraphIds: item.contextParagraphIds, derived }
      })
      return { groupId: deterministic.groupId, family: deterministic.family,
        paragraphIds: deterministic.paragraphIds, questionIds: deterministic.questionIds, counts: deterministic.counts,
        topicLabels: source.topicLabels, genre: source.genre, metadata }
    }),
  }
  const issues = validatePublicSearchMetadata({ sidecar, materialization, sourceDigest, candidateDigest })
  if (issues.length) throw new Error(`${issues[0].code}: ${issues[0].message}`)
  return sidecar
}

export function buildPublicSearchMetadataMessages(input) {
  const prepared = preparePublicSearchMetadataRequest(input)
  return [
    { role: 'system', content: readFileSync(path.resolve(here, '../../prompts/public-search-metadata-v1.md'), 'utf8') },
    { role: 'user', content: JSON.stringify(prepared, null, 2) },
  ]
}

function push(issues, code, path, message) { issues.push({ code, path, message }) }

function validateQuestionKeys(items, group, path, issues) {
  if (!Array.isArray(items)) return push(issues, 'PUBLIC_METADATA_QUESTIONS_INVALID', path, 'questions must be an array')
  const expected = group.questions.map((question) => question.questionId).sort()
  const actual = items.map((item) => item?.questionId).sort()
  if (actual.length !== new Set(actual).size || JSON.stringify(actual) !== JSON.stringify(expected)) {
    push(issues, 'PUBLIC_METADATA_QUESTION_COVERAGE_INVALID', path, 'question IDs must cover the owning group exactly once')
  }
}

function questionItems(metadata) {
  return Array.isArray(metadata?.questions) ? metadata.questions : []
}

function validateGrammar(item, sourceQuestion, paragraphIds, path, issues) {
  if (!exact(item, ['questionId', 'blankId', 'blankType', 'hint', 'facetKey', 'role', 'similarityProfile', 'contextParagraphIds', 'derived'])) {
    return push(issues, 'PUBLIC_METADATA_GRAMMAR_SHAPE_INVALID', path, 'grammar fields are closed')
  }
  if (item.blankId !== sourceQuestion.blankId || item.blankType !== (sourceQuestion.prompt ? 'given' : 'no-hint') || item.hint !== sourceQuestion.prompt) {
    push(issues, 'PUBLIC_METADATA_GRAMMAR_SOURCE_FACT_INVALID', path, 'blank source facts changed')
  }
  const facet = grammarFacetByKey.get(item.facetKey)
  if (!facet || facet.blank_type !== item.blankType) push(issues, 'PUBLIC_METADATA_GRAMMAR_FACET_INVALID', `${path}.facetKey`, 'facet does not match blank type')
  const spec = grammarSimilarityByKey.get(item.facetKey)
  const profile = item.similarityProfile
  if (!exact(profile, ['route', 'features']) || !spec?.routes.includes(profile.route)
    || !Array.isArray(profile.features) || profile.features.some((feature) => !spec.features.includes(feature))
    || new Set(profile.features).size !== profile.features.length) {
    push(issues, 'PUBLIC_METADATA_GRAMMAR_SIMILARITY_INVALID', `${path}.similarityProfile`, 'route/features do not match facet')
  }
  const nonFinite = item.facetKey === 'grammar-fill.given.verb.non-finite'
  if ((nonFinite && !grammarRoles.has(item.role)) || (!nonFinite && item.role !== null)) {
    push(issues, 'PUBLIC_METADATA_GRAMMAR_ROLE_INVALID', `${path}.role`, 'role is required only for non-finite facets and must use the grammar role vocabulary')
  } else if (nonFinite && typeof profile?.route === 'string' && !profile.route.startsWith(`${item.role}-`)) {
    push(issues, 'PUBLIC_METADATA_GRAMMAR_ROLE_INVALID', `${path}.role`, 'role and route conflict')
  }
  if (!Array.isArray(item.contextParagraphIds) || item.contextParagraphIds.length === 0
    || item.contextParagraphIds.some((id, index) => !paragraphIds.includes(id) || (index > 0 && paragraphIds.indexOf(id) <= paragraphIds.indexOf(item.contextParagraphIds[index - 1])))) {
    push(issues, 'PUBLIC_METADATA_GRAMMAR_CONTEXT_INVALID', `${path}.contextParagraphIds`, 'context must be ordered in-group paragraphs')
  }
  const targetParagraph = sourceQuestion.blankParagraphId
  if (targetParagraph && (!Array.isArray(item.contextParagraphIds) || !item.contextParagraphIds.includes(targetParagraph))) push(issues, 'PUBLIC_METADATA_GRAMMAR_TARGET_CONTEXT_MISSING', `${path}.contextParagraphIds`, 'target paragraph is required')
}

/** Runtime authority: closed shape, exact identity coverage and deterministic replay. */
export function validatePublicSearchMetadata({ sidecar, materialization, sourceDigest, candidateDigest }) {
  const issues = []
  if (!exact(sidecar, ['schemaVersion', 'paperId', 'sourceDigest', 'candidateDigest', 'groups'])) push(issues, 'PUBLIC_METADATA_SHAPE_INVALID', '$', 'sidecar fields are closed')
  if (sidecar?.schemaVersion !== PUBLIC_SEARCH_METADATA_VERSION) push(issues, 'PUBLIC_METADATA_VERSION_INVALID', '$.schemaVersion', 'wrong schema version')
  for (const [key, expected] of Object.entries({ paperId: materialization.paperId, sourceDigest, candidateDigest })) {
    if (sidecar?.[key] !== expected) push(issues, 'PUBLIC_METADATA_BINDING_STALE', `$.${key}`, `${key} is stale`)
  }
  const sourceGroups = materialization.groups.filter((group) => supportedFamilies.has(group.family))
  const byGroup = new Map(sourceGroups.map((group) => [group.groupId, group]))
  const owner = questionOwner(materialization)
  const answers = answerByQuestion(materialization)
  const seen = new Set()
  if (!Array.isArray(sidecar?.groups)) return [...issues, { code: 'PUBLIC_METADATA_GROUPS_INVALID', path: '$.groups', message: 'groups must be an array' }]
  for (const [index, item] of sidecar.groups.entries()) {
    const path = `$.groups[${index}]`
    const group = byGroup.get(item?.groupId)
    if (!group || seen.has(item?.groupId)) { push(issues, 'PUBLIC_METADATA_GROUP_COVERAGE_INVALID', `${path}.groupId`, 'foreign or duplicate group'); continue }
    seen.add(item.groupId)
    if (!exact(item, ['groupId', 'family', 'paragraphIds', 'questionIds', 'counts', 'topicLabels', 'genre', 'metadata'])) push(issues, 'PUBLIC_METADATA_GROUP_SHAPE_INVALID', path, 'group fields are closed')
    if (item.family !== group.family) push(issues, 'PUBLIC_METADATA_FAMILY_INVALID', `${path}.family`, 'family changed')
    const deterministic = deterministicGroup(materialization, group, answers)
    for (const key of ['paragraphIds', 'questionIds', 'counts']) if (JSON.stringify(item[key]) !== JSON.stringify(deterministic[key])) push(issues, 'PUBLIC_METADATA_DETERMINISTIC_MISMATCH', `${path}.${key}`, `${key} must be replayed deterministically`)
    if (!topicLabelsValid(item.topicLabels)) push(issues, 'PUBLIC_METADATA_TOPIC_INVALID', `${path}.topicLabels`, 'topicLabels must be unique canonical taxonomy labels')
    if (!PUBLIC_GENRES.includes(item.genre)) push(issues, 'PUBLIC_METADATA_GENRE_INVALID', `${path}.genre`, 'genre must use the five-class text vocabulary')
    const metadata = item.metadata
    if (group.family === 'reading') {
      if (!exact(metadata, ['slot', 'questions']) || metadata.slot !== deterministic.readingSlot) push(issues, 'PUBLIC_METADATA_READING_SHAPE_INVALID', `${path}.metadata`, 'reading slot/shape invalid')
      validateQuestionKeys(metadata?.questions, group, `${path}.metadata.questions`, issues)
      for (const [qIndex, q] of questionItems(metadata).entries()) {
        const p = q?.similarityProfile
        if (!exact(q, ['questionId', 'similarityProfile']) || !exact(p, ['family', 'subtype', 'detailScope', 'technique']) || !readingSubtypes.get(p?.family)?.has(p?.subtype)
          || (p.family === 'detail' ? !['single', 'multiple'].includes(p.detailScope) : p.detailScope !== null)
          || (p.family === 'writing-method' ? !readingTechniques.has(p.technique) : p.technique !== null)) push(issues, 'PUBLIC_METADATA_READING_PROFILE_INVALID', `${path}.metadata.questions[${qIndex}]`, 'invalid reading profile combination')
      }
    } else if (group.family === 'seven-choices') {
      if (!exact(metadata, ['questions'])) push(issues, 'PUBLIC_METADATA_SEVEN_SHAPE_INVALID', `${path}.metadata`, 'seven-choice fields are closed')
      validateQuestionKeys(metadata?.questions, group, `${path}.metadata.questions`, issues)
      for (const [qIndex, q] of questionItems(metadata).entries()) if (!exact(q, ['questionId', 'blankId', 'positionFacet', 'roleFacet', 'primaryMechanismFacet']) || q?.blankId !== owner.get(q?.questionId)?.question.blankId || !positions.has(q?.positionFacet) || !roles.has(q?.roleFacet) || !mechanisms.has(q?.primaryMechanismFacet)) push(issues, 'PUBLIC_METADATA_SEVEN_PROFILE_INVALID', `${path}.metadata.questions[${qIndex}]`, 'invalid seven-choice facets or ownership')
    } else if (group.family === 'cloze') {
      if (!exact(metadata, ['questions'])) push(issues, 'PUBLIC_METADATA_CLOZE_SHAPE_INVALID', `${path}.metadata`, 'cloze fields are closed')
      validateQuestionKeys(metadata?.questions, group, `${path}.metadata.questions`, issues)
      for (const [qIndex, q] of questionItems(metadata).entries()) if (!exact(q, ['questionId', 'blankId', 'pos', 'signatureFacet']) || q?.blankId !== owner.get(q?.questionId)?.question.blankId || !clozePos.has(q?.pos) || (q?.signatureFacet !== null && clozeFacetByPos.get(q?.pos) !== q?.signatureFacet)) push(issues, 'PUBLIC_METADATA_CLOZE_PROFILE_INVALID', `${path}.metadata.questions[${qIndex}]`, 'invalid cloze POS/facet or ownership')
    } else if (group.family === 'grammar-fill') {
      if (!exact(metadata, ['questions'])) push(issues, 'PUBLIC_METADATA_GRAMMAR_GROUP_SHAPE_INVALID', `${path}.metadata`, 'grammar fields are closed')
      validateQuestionKeys(metadata?.questions, group, `${path}.metadata.questions`, issues)
      for (const [qIndex, q] of questionItems(metadata).entries()) {
        const owned = owner.get(q?.questionId)
        if (!owned || owned.group !== group) continue
        const sourceQuestion = {
          ...owned.question,
          blankParagraphId: proseParagraphs(materialization, group).find((block) =>
            block.content?.some((part) => ['blank', 'blank_ref'].includes(part.kind) && part.blankId === owned.question.blankId))?.blockId,
        }
        validateGrammar(q, sourceQuestion, deterministic.paragraphIds, `${path}.metadata.questions[${qIndex}]`, issues)
        try {
          const derivedHolder = { blanks: { [q.questionId]: { facetKey: q.facetKey, hint: q.hint, answer: answers.get(q.questionId), role: q.role, similarityProfile: q.similarityProfile } } }
          stampGrammarFillDerivedFields(derivedHolder)
          const derived = derivedHolder.blanks[q.questionId]
          const expected = Object.fromEntries(['tense', 'voice', 'agreementSensitive', 'form', 'similarityForm'].filter((key) => Object.hasOwn(derived, key)).map((key) => [key, derived[key]]))
          if (JSON.stringify(q.derived) !== JSON.stringify(expected)) push(issues, 'PUBLIC_METADATA_GRAMMAR_DERIVED_INVALID', `${path}.metadata.questions[${qIndex}].derived`, 'derived answer form/axes must match authoritative answer')
        } catch {
          push(issues, 'PUBLIC_METADATA_GRAMMAR_DERIVED_INVALID', `${path}.metadata.questions[${qIndex}].derived`, 'derived values cannot be computed from malformed classification')
        }
      }
    } else if (group.family === 'application-writing') {
      if (!exact(metadata, ['writingTaskId', 'form', 'function']) || metadata.writingTaskId !== `writing-task:${group.groupId}` || ![metadata.form, metadata.function].every((value) => typeof value === 'string' && value.trim() && value.length <= 80)) push(issues, 'PUBLIC_METADATA_APPLICATION_INVALID', `${path}.metadata`, 'application form/function must be concise source-grounded strings')
    } else if (group.family === 'continuation-writing') {
      if (!exact(metadata, ['writingTaskId', 'situation', 'conflict', 'relationships']) || metadata.writingTaskId !== `writing-task:${group.groupId}` || ![metadata.situation, metadata.conflict].every((value) => typeof value === 'string' && value.trim()) || !Array.isArray(metadata.relationships) || metadata.relationships.some((value) => typeof value !== 'string' || !value.trim())) push(issues, 'PUBLIC_METADATA_CONTINUATION_INVALID', `${path}.metadata`, 'continuation metadata is minimal situation/conflict/optional relationships only')
    }
  }
  for (const group of sourceGroups) if (!seen.has(group.groupId)) push(issues, 'PUBLIC_METADATA_GROUP_MISSING', '$.groups', `missing ${group.groupId}`)
  return issues
}
