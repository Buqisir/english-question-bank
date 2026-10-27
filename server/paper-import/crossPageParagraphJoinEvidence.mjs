import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveCrossPageParagraphJoins, paragraphFragmentText, paragraphJoinSourceLocator,
  CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
  ? block.columns.flatMap(column => flatten(column.blocks)) : [block])

function verifyBlankIdentity(group, expected, blocks, reject) {
  const mapping = owner => owner.questions.map(({ questionId, sourceNumber, canonicalNumber, blankId }) =>
    ({ questionId, sourceNumber, canonicalNumber, blankId }))
  if (!same(mapping(group), mapping(expected))) reject('question/source-number/blank identity differs from the source-derived group')
  const occurrences = owner => flatten(owner.blocks).filter(block => block.kind === 'paragraph' && block.role === 'body')
    .flatMap(block => block.content.filter(part => part.kind === 'blank_ref').map(part => part.blankId))
  const rawBlanks = occurrences(group), sourceBlanks = occurrences(expected)
  const owned = new Set(expected.questions.map(question => question.blankId))
  for (const blank of blocks.flatMap(block => block.content.filter(part => part.kind === 'blank_ref'))) {
    if (!owned.has(blank.blankId) || rawBlanks.filter(id => id === blank.blankId).length !== 1
      || sourceBlanks.filter(id => id === blank.blankId).length !== 1) reject('each joined blank must occur once in its source-derived group')
  }
}

// Call only after resolveConfirmedNck1OcrEvidence accepted the complete source
// bytes. The producer's unmodified groups are the ownership authority here.
export function verifyCrossPageParagraphJoinEvidence(materialization, { evidence, confirmation, confirmationBytes, resolved, expected }) {
  const relations = resolveCrossPageParagraphJoins(materialization)
  const reject = message => { throw new Error(`Cross-page paragraph join evidence: ${message}`) }
  if (!relations.length) return relations
  if (confirmation?.confirmed !== true
    || evidence?.paperId !== materialization.paperId || confirmation.paperId !== materialization.paperId
    || resolved?.issues?.length || !expected?.groups) reject('requires the complete verified OCR stream for its confirmation version')
  for (const relation of relations) {
    const { join, group, blocks } = relation
    const mixed = join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2
    if (!(mixed ? ['nck1-ocr-source-confirmation-v2', 'nck1-ocr-source-confirmation-v3']
      : ['nck1-ocr-source-confirmation-v3']).includes(confirmation.schemaVersion)
      || (mixed && expected.issues?.length)) reject('requires the complete verified OCR stream for its relation and confirmation version')
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
        || (!mixed && items[0].text !== paragraphFragmentText(blocks[index]))) reject('must retain the complete historical item text and observations')
      if (!same(paragraphJoinSourceLocator(locator.documentId, locator.page, items[0], sourcePage.observations), locator)) reject('must retain the exact source region')
      // A visual/table consuming this item cannot simultaneously be body text.
      if (page.visualClassifications.some(visual => visual.classification !== 'furniture'
        && visual.itemIds?.includes(fragment.itemId))) reject('item is owned by a visual or table')
      const owners = expected.groups.flatMap(owner => flatten(owner.blocks).flatMap((block, position) =>
        same(block.source, locator) ? [{ owner, block, position }] : []))
      if (owners.length !== 1 || owners[0].owner.family !== group.family
        || owners[0].owner.groupId !== group.groupId || owners[0].owner.slotId !== group.slotId
        || owners[0].block.kind !== 'paragraph' || owners[0].block.role !== 'body'
        || (mixed ? !same(owners[0].block.content, blocks[index].content)
          : paragraphFragmentText(owners[0].block) !== items[0].text)) reject('must retain exact content in the same source-derived group')
      return { page, item: items[0], owner: owners[0] }
    })
    if (mixed && group.family !== 'reading') verifyBlankIdentity(group, verified[0].owner.owner, blocks, reject)
    if (verified[0].page.orderedItems.at(-1) !== verified[0].item
      || verified[1].page.orderedItems[0] !== verified[1].item
      || verified[1].owner.position !== verified[0].owner.position + 1) reject('intervening content is not confirmed furniture')
    // Use the resolved source stream as well as item adjacency: imageOnly,
    // semantic tables and other content objects may occupy a page boundary.
    const body = resolved.structures.get(blocks[0].source.documentId)?.body || []
    const positions = blocks.map((block, fragmentIndex) => body.flatMap((item, index) =>
      item.kind === 'paragraph' && !item.materializedMedia
        && same(item.sourceIndex, block.source) && item.text === verified[fragmentIndex].item.text ? [index] : []))
    if (positions.some(matches => matches.length !== 1) || positions[1][0] !== positions[0][0] + 1) reject('source stream contains intervening content or an ambiguous fragment')
    // Adapter observation payloads carry the complete confirmed item, including
    // printed blank tokens; never reconstruct it from editable inline content.
    relation.confirmedItems = verified.map(value => value.item)
  }
  return relations
}
