import { digestJson, exactKeys } from './stable.mjs'

export const CROSS_PAGE_PARAGRAPH_JOIN_VERSION = 'cross-page-paragraph-join-v1'
export const CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 = 'cross-page-paragraph-join-v2'
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/u.test(value || '')
const same = (a, b) => digestJson(a) === digestJson(b)
export const paragraphFragmentText = block => block?.content?.map(part => part.text).join('')

// No blank sentinel/number reconstruction: source replay owns blank identity.
export const paragraphJoinBoundaryNeedsTrim = inlines => {
  const first = inlines?.[0], last = inlines?.at(-1)
  return (first?.kind === 'text' && /^\s/u.test(first.text))
    || (last?.kind === 'text' && /\s$/u.test(last.text))
}

export function paragraphJoinSourceLocator(documentId, page, item, observations) {
  const regions = item.observationIds.map(id => observations.find(value => value.observationId === id)?.region)
  if (!regions.length || regions.some(region => !region)) throw new Error('Paragraph join source observations are missing')
  const x = Math.min(...regions.map(region => region.x))
  const y = Math.min(...regions.map(region => region.y))
  return { kind: 'page_region', documentId, page, region: { x, y,
    width: Math.max(...regions.map(region => region.x + region.width)) - x,
    height: Math.max(...regions.map(region => region.y + region.height)) - y } }
}

// Structural half of the proof. The OCR reader separately replays the immutable
// stream, item identities, source observations and source-derived group ownership.
// Original blocks and their report pointers never move or change.
export function resolveCrossPageParagraphJoins(materialization) {
  if (!Object.hasOwn(materialization, 'paragraphJoins')) return []
  const joins = materialization.paragraphJoins
  const reject = message => { throw new Error(`Cross-page paragraph join: ${message}`) }
  if (!['nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12'].includes(materialization.schemaVersion)
    || !Array.isArray(joins) || !joins.length) reject('requires the opt-in v8 envelope and nonempty relations')
  const consumed = new Set()
  const ids = new Set()
  return joins.map(join => {
    const mixed = join?.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2
    if (!exactKeys(join, ['schemaVersion', 'joinId', 'groupId', 'sourceSetDigest',
      'evidenceDigest', 'confirmationSha256', 'separator', 'sourceReview', 'fragments'])
      || !(join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION
        || (mixed && materialization.schemaVersion === 'nck1-source-materialization-v12'))
      || !nonempty(join.joinId) || ids.has(join.joinId) || !nonempty(join.groupId)
      || ![join.sourceSetDigest, join.evidenceDigest, join.confirmationSha256].every(digest)
      || join.separator !== ' '
      || !exactKeys(join.sourceReview, ['reviewedBy', 'sameNaturalParagraph', 'continuationLineUnindented', 'reason'])
      || join.sourceReview.reviewedBy !== 'import_agent'
      || join.sourceReview.sameNaturalParagraph !== true
      || join.sourceReview.continuationLineUnindented !== true
      || !nonempty(join.sourceReview.reason)
      || !Array.isArray(join.fragments) || join.fragments.length !== 2) reject('closed relation or explicit source review is invalid')
    ids.add(join.joinId)
    const groups = materialization.groups?.filter(group => group.groupId === join.groupId) || []
    if (groups.length !== 1 || !(mixed ? ['reading', 'cloze', 'grammar-fill'] : ['reading']).includes(groups[0].family)) reject('requires exactly one supported source group')
    const group = groups[0]
    const blocks = join.fragments.map(fragment => {
      if (!exactKeys(fragment, ['blockId', 'itemId', 'observationIds', 'source'])
        || !nonempty(fragment.blockId) || !nonempty(fragment.itemId)
        || !Array.isArray(fragment.observationIds) || !fragment.observationIds.length
        || fragment.observationIds.some(id => !nonempty(id))
        || new Set(fragment.observationIds).size !== fragment.observationIds.length
        || consumed.has(fragment.itemId) || consumed.has(fragment.blockId)) reject('fragment identity is missing or consumed more than once')
      const matches = group.blocks.filter(block => block.blockId === fragment.blockId)
      const block = matches[0]
      if (matches.length !== 1 || block.kind !== 'paragraph' || block.role !== 'body'
        || !block.content?.length || block.content.some(part => part.kind === 'text'
          ? !(mixed ? typeof part.text === 'string' && part.text.length > 0 : nonempty(part.text))
          : !(mixed && group.family !== 'reading' && part.kind === 'blank_ref' && nonempty(part.blankId)))
        || block.source?.kind !== 'page_region' || !same(block.source, fragment.source)) reject('fragment must preserve one source-backed body paragraph')
      const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
        ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
      if (materialization.groups.flatMap(group => flatten(group.blocks))
        .filter(candidate => same(candidate.source, block.source)).length !== 1) reject('source fragment is consumed by more than one block')
      if (mixed ? paragraphJoinBoundaryNeedsTrim(block.content) : /^\s|\s$/u.test(paragraphFragmentText(block))) reject('fragment boundaries must not require trimming or extra whitespace')
      const document = materialization.documents?.find(document => document.documentId === block.source.documentId)
      if (document?.role !== 'question_source' || document.mediaType !== 'application/pdf') reject('requires a separate question-source PDF')
      consumed.add(fragment.itemId)
      consumed.add(fragment.blockId)
      return block
    })
    if (group.blocks.indexOf(blocks[1]) !== group.blocks.indexOf(blocks[0]) + 1
      || blocks[0].source.documentId !== blocks[1].source.documentId
      || blocks[1].source.page !== blocks[0].source.page + 1) reject('fragments must be adjacent blocks on adjacent pages of the same document')
    return { join, group, blocks }
  })
}
