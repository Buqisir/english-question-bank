import { compileConfirmedReadingOptionFigurePaper } from '../../shared/paper-canonical/compiler.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { confirmVisualImportCandidate } from './visualCandidate.mjs'

const liveAdmissions = new WeakMap()

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
  const proof = Object.freeze({})
  liveAdmissions.set(proof, Object.freeze({
    compilation,
    sourceAssetDigest: sha256(sourceAsset),
    confirmationDigest: confirmedSelection.confirmationDigest,
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
  return Boolean(
    admission
    && admission.compilation === compilation
    && sourceAsset instanceof Uint8Array
    && admission.sourceAssetDigest === sha256(sourceAsset)
  )
}
