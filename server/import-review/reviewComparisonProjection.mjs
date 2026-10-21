import { proveReviewConsumerComparison } from '../../shared/paper-canonical/consumers.mjs'
import { validateReviewSubject } from './reviewSubject.mjs'

function reject() {
  throw Object.assign(new Error('Unproven Review consumer comparison mapping'), {
    code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED',
    reasonCode: 'UNSUPPORTED_CONSUMER_SUCCESSION', publicationNotWritten: true, status: 409,
  })
}

// Server-internal seam. Callers supply the subject from sealed evidence or the
// durable promotion guard, never a request-selected consumer binding. Only the
// temporary comparison copy changes; actual projection/publication stays current.
export function reviewConsumptionForTrustedBaseline(subject, consumption) {
  if (!validateReviewSubject(subject).ok) reject()
  const baselineRef = subject.components.consumer.consumption.consumerContractRef
  const proof = proveReviewConsumerComparison({
    baselineRef, actualRef: consumption.consumerContractRef,
    paperAuthorityRef: consumption.authorityRef,
  })
  if (!proof.ok) reject()
  return { ...structuredClone(consumption), consumerContractRef: structuredClone(baselineRef) }
}

export function reviewProjectionForTrustedBaseline(subject, projection) {
  return { ...projection, consumption: reviewConsumptionForTrustedBaseline(subject, projection.consumption) }
}
