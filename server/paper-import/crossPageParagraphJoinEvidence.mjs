import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveCrossPageParagraphJoins, paragraphFragmentText, paragraphJoinSourceLocator,
  CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'
import { validateNck1ProducerGroups } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, resolveCanonicalAuthority } from '../../shared/paper-canonical/authority.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
  ? block.columns.flatMap(column => flatten(column.blocks)) : [block])

function scopedProducerIssue(issue, materialization, relation, evidence, confirmation, resolved) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)
    || Object.keys(issue).sort().join(',') !== 'code,message,path,source'
    || typeof issue.message !== 'string') return false
  const answer = materialization.documents.filter(document => !document.renditionOf && document.role === 'official_answers')
  const questions = materialization.documents.filter(document => !document.renditionOf && document.role === 'question_source')
  if (answer.length !== 1 || questions.length !== 1 || answer[0].documentId === questions[0].documentId
    || !['reading', 'cloze', 'grammar-fill'].includes(relation.group.family)
    || relation.join.fragments.some(fragment => fragment.source.documentId !== questions[0].documentId)) return false
  const src = issue.source
  if (!src || typeof src !== 'object' || Array.isArray(src) || src.documentId !== answer[0].documentId) return false
  const keys = Object.keys(src).sort().join(',')
  if (keys !== 'documentId' && keys !== 'documentId,page,region') return false
  if (keys !== 'documentId') {
    const region = src.region
    if (!Number.isInteger(src.page) || src.page < 1 || src.page > answer[0].pageCount
      || !region || Object.keys(region).sort().join(',') !== 'height,width,x,y'
      || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(region[key]))
      || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
      || region.x + region.width > 1 || region.y + region.height > 1
      || evidence.documents.filter(d => d.documentId === src.documentId).flatMap(d => d.pages.filter(p => p.page === src.page)).length !== 1
      || confirmation.documents.filter(d => d.documentId === src.documentId).flatMap(d => d.pages.filter(p => p.page === src.page)).length !== 1
      || !(resolved.structures.get(src.documentId)?.body || []).some(item => item.sourceIndex?.page === src.page && same(item.sourceIndex.region, region))) return false
  }
  if (issue.code === 'NCK1_OCR_LISTENING_TRANSCRIPT_AMBIGUOUS') return issue.path === 'listening.transcript'
  if (issue.code === 'NCK1_OCR_ANSWER_MISSING') {
    const match = /^answers\.([1-9]\d*)$/u.exec(issue.path)
    return !!match && Number(match[1]) >= 21 && Number(match[1]) <= 65
  }
  if (issue.code === 'NCK1_OCR_ANSWER_RANGE_AMBIGUOUS') {
    const match = /^answers\.([1-9]\d*)-([1-9]\d*)$/u.exec(issue.path)
    return !!match && Number(match[1]) <= Number(match[2]) && Number(match[2]) <= 65
  }
  return false
}

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
export function verifyCrossPageParagraphJoinEvidence(materialization, { evidence, confirmation, confirmationBytes, resolved, expected, authorityRef }) {
  const relations = resolveCrossPageParagraphJoins(materialization)
  const reject = message => { throw new Error(`Cross-page paragraph join evidence: ${message}`) }
  if (!relations.length) return relations
  const policy = authorityRef && [nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef].some(ref => same(authorityRef, ref)) ? 'scoped'
    : authorityRef && (same(authorityRef, nck1CrossPageJoinV2AuthorityRef)
      || (relations.every(relation => relation.join.schemaVersion !== CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2)
        && resolveCanonicalAuthority(authorityRef).ok)) ? 'legacy' : null
  if (!policy) reject('unknown or missing authority policy')
  if (confirmation?.confirmed !== true
    || evidence?.paperId !== materialization.paperId || confirmation.paperId !== materialization.paperId
    || resolved?.issues?.length || !expected?.groups) reject('requires the complete verified OCR stream for its confirmation version')
  for (const relation of relations) {
    const { join, group, blocks } = relation
    const mixed = join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2
    if (!(mixed ? ['nck1-ocr-source-confirmation-v2', 'nck1-ocr-source-confirmation-v3']
      : ['nck1-ocr-source-confirmation-v3']).includes(confirmation.schemaVersion)
      ) reject('requires the complete verified OCR stream for its relation and confirmation version')
    if (mixed && (!Array.isArray(expected.issues) || expected.issues.length)) {
      if (policy === 'legacy') reject('requires the complete verified OCR stream for its relation and confirmation version')
      const blockedIndex = Array.isArray(expected.issues)
        ? expected.issues.findIndex(issue => !scopedProducerIssue(issue, materialization, relation, evidence, confirmation, resolved))
        : 0
      if (blockedIndex !== -1) {
        const blocked = Array.isArray(expected.issues) ? expected.issues[blockedIndex] : null
        const error = new Error(`Cross-page producer issue blocks join ${join.joinId} group ${group.groupId}: ${JSON.stringify(blocked)}`)
        error.code = 'MATERIALIZATION_PARAGRAPH_JOIN_PRODUCER_ISSUE'
        throw error
      }
      if (policy === 'scoped') {
        const groupIssues = validateNck1ProducerGroups(expected)
        if (groupIssues.length) {
          const error = new Error(`Cross-page producer issue blocks join ${join.joinId} group ${group.groupId}: ${JSON.stringify(groupIssues[0])}`)
          error.code = 'MATERIALIZATION_PARAGRAPH_JOIN_PRODUCER_ISSUE'
          throw error
        }
      }
    }
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
