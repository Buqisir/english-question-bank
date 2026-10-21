import assert from 'node:assert/strict'
import {
  consumerContractRefs, proveReviewConsumerComparison, reviewConsumerPairs,
  reviewConsumerSuccessions, validateReviewConsumerRelations,
} from '../shared/paper-canonical/consumers.mjs'
import { nck1MaterializationHistoricalAuthorityRef66, nck1DrawingAreaAuthorityRef } from '../shared/paper-canonical/authority.mjs'

const old = reviewConsumerPairs[0]
const current = consumerContractRefs
const prove = (baselineRef, actualRef, paperAuthorityRef = nck1MaterializationHistoricalAuthorityRef66) =>
  proveReviewConsumerComparison({ baselineRef, actualRef, paperAuthorityRef })
for (const id of ['screen', 'print_pdf']) {
  assert.equal(prove(old[id], current[id]).ok, true)
  assert.equal(prove(current[id], old[id]).ok, false, 'no reverse succession')
  assert.equal(prove(current[id], current[id], {}).ok, true, 'identity needs no edge capability proof')
  assert.equal(prove(old[id], current[id], {}).ok, false, 'unknown authority')
  assert.equal(prove(old[id], current[id], nck1DrawingAreaAuthorityRef).ok, false, 'new closure even when unused')
}
assert.equal(prove(old.screen, current.print_pdf).ok, true, 'pair first, then print successor')
assert.equal(prove(current.screen, current.print_pdf, nck1DrawingAreaAuthorityRef).ok, true, 'same-generation drawing pair')
assert.equal(prove(current.print_pdf, current.screen, nck1DrawingAreaAuthorityRef).ok, true)
assert.equal(prove(current.screen, current.print_pdf, {}).ok, false, 'unknown authority cannot justify pairing')
assert.equal(prove(current.print_pdf, old.screen).ok, false)
for (const ref of [
  { ...old.screen, id: 'unknown' }, { ...old.screen, version: '49' },
  { ...old.screen, digest: current.screen.digest }, { ...old.screen, extra: true },
]) {
  assert.equal(prove(ref, current.screen).ok, false)
  assert.equal(prove(old.screen, ref).ok, false)
}
const { default: screen46 } = await import('../standards/paper-canonical/consumers/screen-v46.json', { with: { type: 'json' } })
assert.equal(prove({ id: 'screen', version: screen46.version, digest: screen46.contractDigest }, current.screen).ok, false, 'missing edge')
assert.throws(() => validateReviewConsumerRelations([
  ...reviewConsumerSuccessions,
  { ...reviewConsumerSuccessions[0], from: current.screen, to: old.screen },
], reviewConsumerPairs), /Cyclic/)
assert.throws(() => validateReviewConsumerRelations(reviewConsumerSuccessions, [
  { screen: old.screen, print_pdf: current.print_pdf },
]), /Invalid Review consumer pair/)
console.log('PASS exact consumer succession, identity, pair, unknown, missing, reverse, cycle and capability cases')
