// Source-derived partition only. A capture record never grants exclusion rights.
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { isWritingTranscriptTitle, isCompleteWritingTranscriptHeading } from './sourceReferenceWritingRules.mjs'
import { usesAlternateAnswerScope } from './sourceReferenceSemantics.mjs'

export const ALTERNATE_ANSWER_SCOPE_KIND = 'alternate_answers_before_listening'
const reject = message => {
  throw Object.assign(new Error(`Alternate answer scope: ${message}`),
    { code: 'SOURCE_REFERENCES_ALTERNATE_SCOPE_INVALID' })
}
const overlaps = (a, b) => a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6
  && a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6

// Use the unfiltered orderedItems, before furniture, tables or image consumption.
// Main-task completeness is checked by the writing lifecycle at this boundary.
export function resolveAlternateAnswerScope(materialization, confirmation, { producerVersion, evidence } = {}) {
  if (!usesAlternateAnswerScope(producerVersion)) return null
  const answers = (materialization.documents ?? []).filter(document =>
    ['official_answers', 'question_and_answers'].includes(document.role))
  const starts = confirmation.documents.flatMap(document => document.pages.flatMap(page =>
    page.orderedItems.filter(item => /^备选试题参考答案[:：]?$/u.test(item.text.normalize('NFKC').trim()))
      .map(item => ({ document, item }))))
  if (!starts.length) return null
  if (starts.length !== 1 || answers.length !== 1 || answers[0].role !== 'official_answers'
    || answers[0].mediaType !== 'application/pdf' || starts[0].document.documentId !== answers[0].documentId) {
    reject('requires one alternate title in one separate official answers PDF')
  }
  const document = answers[0], confirmed = starts[0].document
  const items = confirmed.pages.flatMap(page => page.orderedItems)
  if (new Set(items.map(item => item.itemId)).size !== items.length) reject('duplicate source item identity')
  const start = items.indexOf(starts[0].item)
  const ends = items.map((item, index) => isWritingTranscriptTitle(item.text, producerVersion) ? index : -1)
    .filter(index => index >= 0)
  if (ends.length !== 1 || ends[0] <= start + 1
    || !isCompleteWritingTranscriptHeading(items[ends[0]].text, items[ends[0] + 1]?.text, producerVersion)) {
    reject('requires one complete transcript title immediately followed by original Text 1')
  }
  const end = ends[0]
  const orderedItemIds = items.slice(start, end).map(item => item.itemId)
  const positions = new Map(items.map((item, index) => [item.itemId, index]))
  for (const page of confirmed.pages) {
    const proof = evidence?.documents.find(doc => doc.documentId === document.documentId)?.pages
      .find(p => p.page === page.page)
    const observations = new Map((proof?.observations ?? []).map(obs => [obs.observationId, obs]))
    const excluded = page.orderedItems.filter(item => positions.get(item.itemId) >= start && positions.get(item.itemId) < end)
    for (const visual of page.visualClassifications ?? []) {
      if (!['semantic_table', 'content_media'].includes(visual.classification)) continue
      const ids = visual.classification === 'semantic_table' ? visual.rows.flatMap(row => row.cells.flat())
        : [...visual.itemIds, visual.afterItemId]
      if (ids.some(id => positions.get(id) >= start && positions.get(id) < end)) {
        reject('visual occupies or crosses the alternate interval')
      }
      const box = proof?.regions.find(region => region.regionId === visual.regionId)?.region
      if (box && excluded.some(item => item.observationIds.some(id =>
        observations.get(id) && overlaps(box, observations.get(id).region)))) {
        reject('visual crop intersects the alternate interval')
      }
      // Empty images still occupy the source gap after their exact anchor.
      if (visual.classification === 'content_media' && positions.get(visual.afterItemId) === start - 1) {
        reject('visual gap crosses the alternate boundary')
      }
    }
  }
  return { kind: ALTERNATE_ANSWER_SCOPE_KIND, documentId: document.documentId, documentSha256: document.sha256,
    startInclusiveItemId: items[start].itemId, endExclusiveItemId: items[end].itemId,
    followingText1ItemId: items[end + 1].itemId, orderedItemIds }
}

export function bindAlternateAnswerScope(scope, evidence, confirmation, ocr) {
  if (!scope) return null
  if (!ocr?.evidenceBytes || !ocr?.confirmationBytes
    || digestJson(JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))) !== digestJson(evidence)
    || digestJson(JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))) !== digestJson(confirmation)) {
    reject('exact matching OCR evidence and confirmation bytes required')
  }
  return { ...scope, evidenceSha256: sha256(ocr.evidenceBytes), confirmationSha256: sha256(ocr.confirmationBytes) }
}
