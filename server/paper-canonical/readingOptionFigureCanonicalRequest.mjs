import { compileConfirmedReadingOptionFigurePaper } from '../../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { confirmVisualImportCandidate } from './visualCandidate.mjs'

const liveAdmissions = new WeakMap()

function confirmationIdentity(confirmedSelection, compilation) {
  const canonicalPaper = compilation?.artifacts?.canonicalPaper
  const authority = canonicalPaper?.paperPlan?.authorityRef
  return Object.freeze({
    paperId: canonicalPaper?.paperPlan?.paperId,
    authorityDigest: authority ? digestJson(authority) : null,
    schemaVersion: confirmedSelection.schemaVersion,
    candidatePackageDigest: confirmedSelection.candidatePackageDigest,
    confirmationDigest: confirmedSelection.confirmationDigest,
    sourceCaptureRefDigest: digestJson(confirmedSelection.sourceCaptureRef),
    confirmedSelectionsDigest: digestJson(confirmedSelection.confirmedSelections),
  })
}

function proofSnapshotDigest({ compilation, sourceAsset, identity }) {
  const canonicalPaper = compilation?.artifacts?.canonicalPaper
  return digestJson({
    compilation,
    sourceAsset: {
      sha256: sha256(sourceAsset),
      byteLength: sourceAsset.byteLength,
    },
    identity,
    canonicalIdentity: {
      paperId: canonicalPaper?.paperPlan?.paperId,
      authority: canonicalPaper?.paperPlan?.authorityRef,
      digest: canonicalPaper ? digestJson(canonicalPaper) : null,
    },
  })
}

export function admitLiveConfirmedReadingOptionFigureImport({
  request,
  candidatePackage,
  teacherConfirmation,
  sourceAsset,
}) {
  if (!(sourceAsset instanceof Uint8Array)) {
    throw new TypeError('Reading Figure Option admission requires exact source asset bytes')
  }
  const confirmedSelection = confirmVisualImportCandidate(
    candidatePackage,
    teacherConfirmation,
  )
  if (
    confirmedSelection.status !== 'confirmed'
    || confirmedSelection.unresolvedIssues.length !== 0
  ) {
    throw new TypeError('Reading Figure Option admission requires every visual selection to be confirmed')
  }
  const compilation = compileConfirmedReadingOptionFigurePaper(
    request,
    confirmedSelection,
  )
  const identity = confirmationIdentity(confirmedSelection, compilation)
  const proof = Object.freeze({})
  liveAdmissions.set(proof, Object.freeze({
    sourceAssetDigest: sha256(sourceAsset),
    sourceAssetByteLength: sourceAsset.byteLength,
    identity,
    snapshotDigest: proofSnapshotDigest({
      compilation,
      sourceAsset,
      identity,
    }),
  }))
  return {
    compilation,
    sourceAsset: new Uint8Array(sourceAsset),
    confirmedSelection,
    proof,
  }
}

export function isLiveConfirmedReadingOptionFigureAdmission({
  proof,
  compilation,
  sourceAsset,
}) {
  const admission = liveAdmissions.get(proof)
  if (
    !admission
    || !(sourceAsset instanceof Uint8Array)
    || admission.sourceAssetByteLength !== sourceAsset.byteLength
    || admission.sourceAssetDigest !== sha256(sourceAsset)
  ) return false
  try {
    return admission.snapshotDigest === proofSnapshotDigest({
      compilation,
      sourceAsset,
      identity: admission.identity,
    })
  } catch {
    return false
  }
}
