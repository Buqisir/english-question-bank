import { computeLineFacts } from './ocr-line-facts.mjs'
import { matchesLineRole, speakerLabel } from './ocr-line-roles.mjs'

/** @typedef {ReturnType<typeof computeLineFacts>} LineFacts */
/** @typedef {{first: object, last: object, firstFacts: LineFacts, lastFacts: LineFacts}} PhysicalEdges */
/**
 * @typedef {{unit: 'normalized', margin: {left: number, right: number},
 *   previousMargin?: {left: number, right: number}} |
 *   {unit: 'pixels', before: PhysicalEdges|null, after: PhysicalEdges|null, rights: Array<LineFacts['box']>} |
 *   {unit: 'text'}} JoinGeometry
 */
/**
 * @typedef {object} JoinInput
 * @property {'reference'|'transcript'|'annotation'|'inline-annotation'} content
 * @property {LineFacts|object|null} previous Shared facts (reference: previous paragraph role/right/page).
 * @property {LineFacts} current
 * @property {JoinGeometry} geometry Never converts between coordinate systems.
 * @property {{hasParagraph?: boolean, special?: string|null, afterClosing?: boolean, numbered?: boolean,
 *   turnContinuation?: boolean, noteContinuation?: boolean, noteStart?: boolean, multiline?: boolean}} roles
 * @property {{before: object|null, after: object}} location Source item/page or draft line/word references.
 * @property {{entryKind: string, before: object|null, after: object, furnitureOnly: boolean}} [referenceContext]
 *   Exact source identities and the unfiltered source-order gap, supplied by reference capture.
 */
/**
 * @typedef {object} JoinDecision
 * @property {'join'|'separate'|'review'} action
 * @property {'join'|'separate'} resolution Existing deterministic treatment, including when review is requested.
 * @property {string} reason Named reason for this boundary decision.
 * @property {JoinInput['location']} location
 * @property {Array<{itemId: string, issue: string}>} reviews Existing public review projection, in source order.
 * @property {object} [boundary] Reference geometry candidates, retained for diagnostics and the public helper.
 */

// Indentation belongs to the current page; the previous line's fullness belongs
// to its own page. Same-page/public helper callers can reuse a single margin.
export function referenceBoundaryFromFacts(previous, facts, margin, previousMargin = margin) {
  const context = { previous, margin }
  const indented = matchesLineRole('reference.indented', facts, context)
  const pageTurn = matchesLineRole('reference.page-turn', facts, context)
  const previousShort = matchesLineRole('reference.previous-short', facts, { previous, margin: previousMargin })
  const continues = matchesLineRole('reference.lowercase-continuation', facts, { ...context, pageTurn, indented, previousShort })
  return { indented, pageTurn, previousShort, continues }
}

// A separate cross-page rule: ordinary same-page wrapping never grants this
// authority. Missing facts are uncertainty, not evidence for a continuation.
function referenceCrossPageRule({ previous, current, geometry, roles, referenceContext }, boundary) {
  if (!referenceContext || referenceContext.entryKind !== 'essays' || !roles.hasParagraph
    || previous?.role !== 'body' || roles.special || roles.afterClosing || roles.numbered
    || !current.startsLower) return null
  const { before, after, furnitureOnly } = referenceContext
  const sameSource = before?.locator && after?.locator && before.documentSha256 === after.documentSha256
    && before.locator.documentId === after.locator.documentId
  if (!boundary.pageTurn && sameSource) return null
  const pageRegion = source => source?.locator?.kind === 'page_region'
    && /^sha256:[a-f0-9]{64}$/u.test(source.documentSha256)
    && Number.isInteger(source.locator.page) && source.locator.page > 0
  const previousMargin = geometry.previousMargin
  const fullLine = Number.isFinite(previous.right) && Number.isFinite(previousMargin?.right)
    && previous.right >= previousMargin.right - .06
  const currentMarginKnown = Number.isFinite(geometry.margin?.left) && Number.isFinite(current.left)
  // Inspect a copy: OCR may space out punctuation and nested closing marks.
  // Only a word ending proves an unfinished tail; sentence stops, deferred
  // punctuation (commas/hyphens etc.) and unknown suffixes all stay split.
  const previousTail = typeof previous.text === 'string'
    ? previous.text.replace(/[\s"'”’»)\]）】」』]+$/u, '') : ''
  const unfinished = /[\p{L}\p{N}]$/u.test(previousTail)
  const proven = sameSource && pageRegion(before) && pageRegion(after)
    && before.locator.page === previous.page && after.locator.page === current.page
    && after.locator.page === before.locator.page + 1
    && fullLine && currentMarginKnown && !boundary.indented && unfinished && furnitureOnly === true
  return { resolution: proven ? 'join' : 'separate',
    reason: proven ? 'reference.cross-page-continuation' : 'reference.cross-page-uncertain' }
}

function referencePolicy(input) {
  const { previous, current, geometry, roles, location } = input
  const boundary = referenceBoundaryFromFacts(previous, current, geometry.margin, geometry.previousMargin)
  const crossPage = referenceCrossPageRule(input, boundary)
  const { indented, previousShort, pageTurn, continues } = boundary
  // Veto geometric false starts only within an existing reference body.
  // Keep the stricter cross-page proof and semantic role boundaries intact.
  const previousTail = (previous?.text || '').replace(/[\s”’"'）)\]】」』]+$/u, '')
  const numberedOrLabel = /^(?:[一二三四五六七八九十]+、|\([一二三四五六七八九十\d]+\)|\d+[.、)]|[·●]|\p{Script=Han}{1,8}[:：])/u.test(current.nfkc.trim())
    || /^[①-⑳]/u.test(current.trimmed)
  const unfinished = !pageTurn && roles.hasParagraph && previous?.role === 'body'
    && !roles.special && !roles.afterClosing && !roles.numbered
    && ((current.startsLower && previousTail && !/[.!?:]$/u.test(previousTail))
      || (current.startsHan && /\p{Script=Han}/u.test(previousTail)
        && !/[。！？；：]$/u.test(previousTail) && !numberedOrLabel))
  const starts = !roles.hasParagraph || roles.special || roles.afterClosing || (!continues && !unfinished
    && (previous.role !== 'body' || indented || previousShort || pageTurn || roles.numbered))
  const reviews = []
  if (crossPage?.resolution === 'separate'
    || (!crossPage && pageTurn && !roles.special && !roles.afterClosing && !indented && !previousShort)) {
    reviews.push({ itemId: location.after.itemId,
      issue: 'paragraph continues across a page turn; split into two located paragraphs' })
  }
  if (current.endsHyphen) reviews.push({ itemId: location.after.itemId,
    issue: 'line ends with a hyphen; joined with a space' })
  const reason = !roles.hasParagraph ? 'reference.first-line' : roles.special ? `reference.${roles.special}`
    : roles.afterClosing ? 'reference.after-closing' : unfinished ? 'reference.unfinished-line'
      : continues ? 'reference.lowercase-continuation'
      : previous.role !== 'body' ? 'reference.role-boundary' : indented ? 'reference.indented'
        : previousShort ? 'reference.previous-short' : pageTurn ? 'reference.page-turn'
          : roles.numbered ? 'reference.numbered' : 'reference.body-wrap'
  return { resolution: crossPage?.resolution || (starts ? 'separate' : 'join'),
    reason: crossPage?.reason || reason, reviews, boundary }
}

// Speech and glosses share the pixel wrap proof, but their text glue and
// emphasis/source assembly remain separate strategies in ocr-proofread.
function transcriptPolicy({ previous, geometry, roles }) {
  if (!roles.turnContinuation) return { resolution: 'separate', reason: 'transcript.role-boundary' }
  const { before, after, rights } = geometry
  if (!before || !after) return { resolution: 'separate', reason: 'transcript.missing-geometry' }
  const last = before.lastFacts.box
  const firstFacts = after.firstFacts
  const column = rights.filter((box) => box.right > last.left && box.left < last.right
    && box.left >= last.left - last.height * 3).map((box) => box.right).sort((left, right) => left - right)
  const columnRight = column.length ? column[Math.floor((column.length - 1) * 0.9)] : last.right
  const noteBullet = matchesLineRole('transcript.note-bullet', previous, { noteContinuation: roles.noteContinuation })
  const hanging = matchesLineRole('transcript.hanging', previous,
    { noteBullet, singlePhysicalLine: before.first === before.last })
  const speechWords = before.firstFacts.sortedWords
  let labelWords = hanging ? noteBullet ? 1
    : speakerLabel(previous.text).replace(/[:：]$/u, '').trim().split(/\s+/u).length : 0
  if (matchesLineRole('transcript.split-colon', computeLineFacts({ text: speechWords[labelWords]?.text ?? '' }),
    { hanging })) labelWords += 1
  const speechLeft = hanging ? speechWords[labelWords]?.box.left ?? last.left : last.left
  const wrap = matchesLineRole('transcript.wrap', firstFacts, { speechLeft, last, columnRight })
  return { resolution: wrap ? 'join' : 'separate',
    reason: wrap ? roles.noteContinuation ? 'annotation.pixel-wrap' : 'transcript.pixel-wrap'
      : 'transcript.geometry-boundary' }
}

const policies = {
  reference: { unit: 'normalized', decide: referencePolicy },
  transcript: { unit: 'pixels', decide: transcriptPolicy },
  annotation: { unit: 'pixels', decide: transcriptPolicy },
  'inline-annotation': { unit: 'text', decide: ({ roles }) => ({
    resolution: roles.noteStart && roles.multiline ? 'join' : 'separate',
    reason: roles.noteStart && roles.multiline ? 'annotation.confirmed-inline-lines' : 'annotation.no-inline-wrap',
  }) },
}

/** Pure boundary interface. No text/source/emphasis mutation or new review authority.
 * @param {JoinInput} input
 * @returns {JoinDecision}
 */
export function decideLineJoin(input) {
  const policy = policies[input.content]
  if (!policy || input.geometry.unit !== policy.unit) {
    throw new Error(`Invalid join policy/coordinate unit: ${input.content}/${input.geometry.unit}`)
  }
  const { reviews = [], ...decision } = policy.decide(input)
  return { ...decision, action: reviews.length ? 'review' : decision.resolution, location: input.location, reviews }
}
