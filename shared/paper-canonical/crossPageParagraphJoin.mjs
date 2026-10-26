import { digestJson, exactKeys } from './stable.mjs'

export const CROSS_PAGE_PARAGRAPH_JOIN_VERSION = 'cross-page-paragraph-join-v1'
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/u.test(value || '')
const same = (a, b) => digestJson(a) === digestJson(b)
export const paragraphFragmentText = block => block?.content?.map(part => part.text).join('')

// Structural half of the proof. The OCR reader separately replays the immutable
// stream, item identities, source observations and source-derived group ownership.
// Original blocks and their report pointers never move or change.
export function resolveCrossPageParagraphJoins(materialization) {
  if (!Object.hasOwn(materialization, 'paragraphJoins')) return []
  const joins = materialization.paragraphJoins
  const reject = message => { throw new Error(`Cross-page paragraph join: ${message}`) }
  if (!['nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10'].includes(materialization.schemaVersion)
    || !Array.isArray(joins) || !joins.length) reject('requires the opt-in v8 envelope and nonempty relations')
  const consumed = new Set()
  const ids = new Set()
  return joins.map(join => {
    if (!exactKeys(join, ['schemaVersion', 'joinId', 'groupId', 'sourceSetDigest',
      'evidenceDigest', 'confirmationSha256', 'separator', 'sourceReview', 'fragments'])
      || join.schemaVersion !== CROSS_PAGE_PARAGRAPH_JOIN_VERSION
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
    if (groups.length !== 1 || groups[0].family !== 'reading') reject('requires exactly one Reading group')
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
        || !block.content?.length || block.content.some(part => part.kind !== 'text' || !nonempty(part.text))
        || block.source?.kind !== 'page_region' || !same(block.source, fragment.source)) reject('fragment must preserve one source-backed body paragraph')
      const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
        ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
      if (materialization.groups.flatMap(group => flatten(group.blocks))
        .filter(candidate => same(candidate.source, block.source)).length !== 1) reject('source fragment is consumed by more than one block')
      const text = paragraphFragmentText(block)
      if (/^\s|\s$/u.test(text)) reject('fragment boundaries must not require trimming or extra whitespace')
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
