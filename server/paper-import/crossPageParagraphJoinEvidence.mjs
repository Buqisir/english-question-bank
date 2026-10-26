import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveCrossPageParagraphJoins, paragraphFragmentText } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
const union = observations => {
  const x = Math.min(...observations.map(item => item.region.x))
  const y = Math.min(...observations.map(item => item.region.y))
  return { x, y,
    width: Math.max(...observations.map(item => item.region.x + item.region.width)) - x,
    height: Math.max(...observations.map(item => item.region.y + item.region.height)) - y }
}

// Call only after resolveConfirmedNck1OcrEvidence accepted the complete source
// bytes. The producer's unmodified groups are the ownership authority here.
export function verifyCrossPageParagraphJoinEvidence(materialization, { evidence, confirmation, confirmationBytes, resolved, expected }) {
  const relations = resolveCrossPageParagraphJoins(materialization)
  const reject = message => { throw new Error(`Cross-page paragraph join evidence: ${message}`) }
  if (!relations.length) return relations
  if (confirmation?.schemaVersion !== 'nck1-ocr-source-confirmation-v3' || !confirmation.confirmed
    || evidence?.paperId !== materialization.paperId || confirmation.paperId !== materialization.paperId
    || resolved?.issues?.length || !expected?.groups) reject('requires a complete verified v3 OCR stream')
  for (const relation of relations) {
    const { join, group, blocks } = relation
    if (join.sourceSetDigest !== evidence.sourceSetDigest
      || join.sourceSetDigest !== confirmation.sourceSetDigest
      || join.evidenceDigest !== evidence.evidenceDigest
      || join.evidenceDigest !== confirmation.evidenceDigest
      || join.confirmationSha256 !== sha256(confirmationBytes)) reject('source, evidence or confirmation digest changed')
    const verified = join.fragments.map((fragment, index) => {
      const locator = fragment.source
      const pages = confirmation.documents.filter(document => document.documentId === locator.documentId)
        .flatMap(document => document.pages.filter(page => page.page === locator.page))
      const sourcePages = evidence.documents.filter(document => document.documentId === locator.documentId)
        .flatMap(document => document.pages.filter(page => page.page === locator.page))
      if (pages.length !== 1 || sourcePages.length !== 1) reject('source page is ambiguous')
      const page = pages[0], sourcePage = sourcePages[0]
      const items = page.orderedItems.filter(item => item.itemId === fragment.itemId)
      if (items.length !== 1 || !same(items[0].observationIds, fragment.observationIds)
        || items[0].text !== paragraphFragmentText(blocks[index])) reject('must retain the complete historical item text and observations')
      const observations = fragment.observationIds.map(id => sourcePage.observations.find(item => item.observationId === id))
      if (observations.some(item => !item) || !same(union(observations), locator.region)) reject('must retain the exact source region')
      // A visual/table consuming this item cannot simultaneously be body text.
      if (page.visualClassifications.some(visual => visual.classification !== 'furniture'
        && visual.itemIds?.includes(fragment.itemId))) reject('item is owned by a visual or table')
      const owners = expected.groups.flatMap(owner => owner.blocks.flatMap((block, position) =>
        same(block.source, locator) ? [{ owner, block, position }] : []))
      if (owners.length !== 1 || owners[0].owner.family !== 'reading'
        || owners[0].owner.groupId !== group.groupId || owners[0].owner.slotId !== group.slotId
        || owners[0].block.kind !== 'paragraph' || owners[0].block.role !== 'body'
        || paragraphFragmentText(owners[0].block) !== items[0].text) reject('must belong to the same source-derived Reading group')
      return { page, item: items[0], owner: owners[0] }
    })
    if (verified[0].page.orderedItems.at(-1) !== verified[0].item
      || verified[1].page.orderedItems[0] !== verified[1].item
      || verified[1].owner.position !== verified[0].owner.position + 1) reject('intervening content is not confirmed furniture')
    // Use the resolved source stream as well as item adjacency: imageOnly,
    // semantic tables and other content objects may occupy a page boundary.
    const body = resolved.structures.get(blocks[0].source.documentId)?.body || []
    const positions = blocks.map(block => body.flatMap((item, index) =>
      item.kind === 'paragraph' && !item.materializedMedia
        && same(item.sourceIndex, block.source) && item.text === paragraphFragmentText(block) ? [index] : []))
    if (positions.some(matches => matches.length !== 1) || positions[1][0] !== positions[0][0] + 1) reject('source stream contains intervening content or an ambiguous fragment')
  }
  return relations
}
