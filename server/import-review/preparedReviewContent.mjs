import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { consumerContractRefs } from '../../shared/paper-canonical/consumers.mjs'
import { validatedPaperHeaderTitle } from '../../shared/paper-canonical/headerTitle.mjs'
import { PUBLISHED_LISTENING_PLAYBACK_UI_FILE } from '../../shared/paper-canonical/listeningPlayback.mjs'
import { loadCanonicalOnlyConsumers } from '../paper-canonical/publication.mjs'
import { buildNck1ReviewConsumption } from './revisionProjection.mjs'
import { compareReviewPublicationContent } from './reviewPublicationContent.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
function reject(reasonCode, differences = []) {
  throw Object.assign(new Error(`Publication content rejected: ${reasonCode}`), {
    code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode, differences, status: 409,
    publicationNotWritten: true,
  })
}

// Internal, synchronous seam. The caller passes the actual writer objects and
// invokes this AFTER onPrepared, inside the durable Review guard transaction.
export function assertPreparedReviewContent(snapshot) {
  try { return assertPreparedReviewContentInternal(snapshot) }
  catch (error) {
    if (error.reasonCode) throw error
    reject('UNSUPPORTED_PUBLICATION_MAPPING', ['/prepared'])
  }
}

function assertPreparedReviewContentInternal({
  subject, packageData, admission, projection, version, approvedIdentity, approvedManifest, publishReport,
}) {
  if (!subject) reject('MISSING_BASELINE')
  const { sealed } = admission
  const manifest = sealed.manifest
  const report = {
    ok: true, paperId: manifest.paperId, assetVersion: version, versionName: `v${version}`,
    canonicalPublicationDigest: manifest.publicationDigest,
    ...(packageData.sourceReferenceApproval ? { sourceReferencePublication: packageData.sourceReferenceApproval } : {}),
    ...(packageData.pdfProductApproval ? { pdfProducts: packageData.pdfProductApproval } : {}),
    ...(packageData.fileStorage ? { fileStorage: packageData.fileStorage } : {}),
    searchHref: publishReport?.searchHref, generatedAt: publishReport?.generatedAt,
  }
  if (!publishReport || !same(report, publishReport)
    || typeof report.searchHref !== 'string' || typeof report.generatedAt !== 'string') {
    reject('UNSUPPORTED_PUBLICATION_MAPPING', ['/publishReport'])
  }
  const baseline = subject.components.consumer.consumption
  let playback = null
  const derivativeFiles = Object.keys(sealed.playbackDerivatives || {})
  if (derivativeFiles.length) {
    if (!same(derivativeFiles, [PUBLISHED_LISTENING_PLAYBACK_UI_FILE])) reject('UNSUPPORTED_PUBLICATION_MAPPING')
    try {
      const { digest, ...value } = JSON.parse(Buffer.from(sealed.playbackDerivatives[derivativeFiles[0]]))
      if (digest !== digestJson(value) || !same(value, {
        playbackAudioSha256: baseline.listeningAudio?.sha256,
        durationSeconds: baseline.listeningAudio?.durationSeconds,
        segments: baseline.listeningAudio?.segments,
      })) reject('SUBJECT_CHANGED', ['/listeningPlayback'])
      playback = value
    } catch (error) {
      if (error.reasonCode) throw error
      reject('UNSUPPORTED_PUBLICATION_MAPPING', ['/listeningPlayback'])
    }
  }
  if (baseline.listeningAudio && !playback) reject('UNSUPPORTED_PUBLICATION_MAPPING', ['/listeningPlayback'])
  function decorate(consumption, consumerId) {
    const value = structuredClone(consumption)
    if (consumerId !== 'compilation') {
      if (!same(value.consumerContractRef, consumerContractRefs[consumerId])) reject('UNSUPPORTED_PUBLICATION_MAPPING')
      // Print and Screen contracts are execution metadata, not paper content.
      value.consumerContractRef = baseline.consumerContractRef
    } else {
      value.sourceAssetVersion = version
      value.publicationDigest = manifest.publicationDigest
      value.sourceAssetDigest = manifest.sourceAssetDigest
    }
    // candidateStore has no compatibility paper-asset; the writer supplies it.
    // Existing fields are retained and compared, never overwritten on conflict.
    value.paperSourceType ??= packageData.paperAsset.sources.sourceType
    const title = validatedPaperHeaderTitle(manifest.paperHeader)
    if (title !== undefined) value.paperHeaderTitle ??= title
    if (manifest.listeningAudio && !value.listeningAudio) {
      value.listeningAudio = {
        ...manifest.listeningAudio,
        url: `/paper-assets/${encodeURIComponent(manifest.paperId)}/versions/v${version}/${manifest.listeningAudio.relativePath}`,
      }
    }
    if (value.listeningAudio && playback) {
      value.listeningAudio.segments ??= playback.segments
      if (Object.hasOwn(value.listeningAudio, 'playbackAudioSha256')) {
        if (value.listeningAudio.playbackAudioSha256 !== value.listeningAudio.sha256) reject('SUBJECT_CHANGED')
        delete value.listeningAudio.playbackAudioSha256
      }
    }
    return value
  }
  const ref = { paperId: manifest.paperId, sourceAssetVersion: version,
    versionName: `v${version}`, publicationDigest: manifest.publicationDigest }
  // Re-read consumers from precisely the in-memory artifacts handed to the
  // writer, so stale admission.consumers cannot conceal changed sealed bytes.
  const writtenConsumers = loadCanonicalOnlyConsumers({ ref, store: {
    readPublishedRefs: () => ({ current: ref, latest: ref }),
    readSourceAsset: () => sealed.sourceAsset,
    readVersionArtifact(_ref, file) {
      if (file === 'paper-asset.json') return Buffer.from(JSON.stringify(packageData.paperAsset))
      if (file === `canonical/canonical-paper-publication-v${manifest.authority.manifestVersion}.json`) return Buffer.from(JSON.stringify(manifest))
      return sealed.artifacts[file] || sealed.sourceEvidence[file] || sealed.playbackDerivatives?.[file] || null
    },
  } })
  const expectedConsumers = Object.keys(consumerContractRefs).sort()
  if (!same(Object.keys(admission.consumers).sort(), expectedConsumers)) reject('UNSUPPORTED_PUBLICATION_MAPPING')
  const compiled = buildNck1ReviewConsumption(projection.candidate, admission.compilation)
  for (const [label, consumers] of [['admission', admission.consumers], ['writer', writtenConsumers],
    ['compilation', { compilation: compiled }]]) {
    for (const [consumerId, consumption] of Object.entries(consumers)) {
      const comparison = compareReviewPublicationContent({
        subject, packageData, consumption: decorate(consumption, consumerId),
        sealedManifest: manifest, sourceAsset: sealed.sourceAsset, version, approvedIdentity, approvedManifest,
        materializationDigest: digestJson(projection.materialization),
      })
      if (comparison.result !== 'equal') reject(comparison.reasonCode,
        comparison.differences.map(pointer => `/${label}/${consumerId}${pointer}`))
    }
  }
}
