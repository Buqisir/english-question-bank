import { computeLineFacts } from './ocr-line-facts.mjs'
import { LINE_ROLE_RULES, firstLineRole, matchesLineRole } from './ocr-line-roles.mjs'

const DIRECTION_SLOTS = LINE_ROLE_RULES.filter(rule => rule.phase === 'direction').map(rule => rule.value)
const ORDER = ['listening.short-dialogue', 'listening.long-form', 'reading.a', 'seven-choices', 'cloze', 'grammar-fill']
const round = value => Number(value.toFixed(6))

function itemSource(documentId, page, item, observations) {
  const regions = (item.observationIds || []).map(id => observations.get(id)?.region)
  if (!regions.length || regions.some(region => !region
    || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(region[key]))
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 1.000001 || region.y + region.height > 1.000001)) {
    throw new Error(`Confirmed observation has no valid locator: ${documentId}:${page}:${item.itemId}`)
  }
  const left = Math.min(...regions.map(region => region.x))
  const top = Math.min(...regions.map(region => region.y))
  const right = Math.max(...regions.map(region => region.x + region.width))
  const bottom = Math.max(...regions.map(region => region.y + region.height))
  return { kind: 'page_region', documentId, page,
    region: { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) } }
}

// This is the source-presentation materialization pass, never a listening-rule OCR fallback.
// Keep existing Agent edits; only restore missing slots from confirmed question-bearing items.
export function restoreOcrSourcePresentation({ materialization, evidence, confirmation }) {
  if (!/^nck1-source-materialization-v(?:[1-9]|10)$/u.test(materialization.schemaVersion)) {
    throw new Error(`Unsupported materialization schema: ${materialization.schemaVersion}`)
  }
  const schemaVersion = /^nck1-source-materialization-v[1-3]$/u.test(materialization.schemaVersion)
    ? 'nck1-source-materialization-v4' : materialization.schemaVersion
  if (!confirmation?.confirmed || confirmation.paperId !== materialization.paperId
    || evidence?.paperId !== materialization.paperId
    || !evidence.sourceSetDigest || !evidence.evidenceDigest
    || confirmation.sourceSetDigest !== evidence.sourceSetDigest
    || confirmation.evidenceDigest !== evidence.evidenceDigest) {
    throw new Error('Source presentation requires confirmed OCR bound to the current paper and evidence')
  }
  const listening = materialization.listening?.state !== 'not_supplied'
  const required = DIRECTION_SLOTS.filter(slot => listening || !slot.startsWith('listening.'))
  const existing = materialization.sourcePresentation
  const instructions = [...(existing?.instructions || [])]
  const missing = required.filter(slot => !instructions.some(item => item.slotId === slot))
  const questionIds = new Set(materialization.documents.filter(document =>
    !document.renditionOf && ['question_source', 'question_and_answers'].includes(document.role))
    .map(document => document.documentId))
  const questions = confirmation.documents.filter(document => questionIds.has(document.documentId))
  if (!questions.length) throw new Error('No confirmed question-bearing source for presentation')
  const found = new Map()
  for (const question of questions) {
    const evidenceDocument = evidence.documents.find(document => document.documentId === question.documentId)
    for (const page of question.pages) {
      // Match page identity, not array position: retained OCR layouts use different orderings.
      const evidencePage = evidenceDocument?.pages.find(item => item.page === page.page)
      const observations = new Map((evidencePage?.observations || []).map(item => [item.observationId, item]))
      for (const item of page.orderedItems) {
        const facts = computeLineFacts(item)
        if (listening && !existing?.listeningExample && matchesLineRole('presentation.example', facts)) {
          throw new Error(`Listening example found on page ${page.page}; author sourcePresentation.listeningExample by hand`)
        }
        const slot = firstLineRole('direction', facts)?.value
        if (!missing.includes(slot)) continue
        const entry = { slotId: slot, text: item.text, source: itemSource(question.documentId, page.page, item, observations) }
        if (found.has(slot) && found.get(slot).text !== entry.text) {
          throw new Error(`Conflicting confirmed direction items: ${slot}`)
        }
        if (!found.has(slot)) found.set(slot, entry)
      }
    }
  }
  const unresolved = missing.filter(slot => !found.has(slot))
  if (unresolved.length) throw new Error(`No confirmed direction item matched: ${unresolved.join(', ')}`)
  instructions.push(...ORDER.filter(slot => found.has(slot)).map(slot => found.get(slot)))
  const firstQuestion = questions[0]
  const example = listening ? {
    state: 'not_supplied',
    source: { kind: 'page_region', documentId: firstQuestion.documentId,
      page: Math.min(...firstQuestion.pages.map(page => page.page)),
      region: { x: 0, y: 0, width: 1, height: 1 } },
  } : null
  return { ...materialization, schemaVersion,
    sourcePresentation: { ...existing, instructions,
      listeningExample: existing?.listeningExample ?? example } }
}
