import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256, stableUtf8Bytes } from '../../shared/paper-canonical/stable.mjs'
import { consumerContractRefsForAuthority } from '../../shared/paper-canonical/consumers.mjs'
import { configuredPaperHeader } from '../../shared/paper-canonical/headerTitle.mjs'
import { PUBLISHED_LISTENING_PLAYBACK_UI_FILE } from '../../shared/paper-canonical/listeningPlayback.mjs'
import { snapshotCanonicalReviewCompilation } from '../paper-canonical/publication.mjs'
import { buildPaperNormalizedGroupsSidecar } from '../paper-import/normalization.mjs'
import { LISTENING_AUDIO_PATHS } from '../paper-import/listeningAudioEvidence.mjs'
import { reviewedPlaybackSegments } from '../paper-import/listeningReview.mjs'
import { buildNck1CompatibilityPackage } from './revisionProjection.mjs'
import { buildProductPreviewPayload, validReviewRelativePath } from './reviewSubject.mjs'
import { withSealedReviewSnapshot } from './sealedReviewFiles.mjs'

const directoryName = 'sealed-publication'
const analyses = {
  readingAnalysis: 'reading-choice-analysis-v1.json', scAnalysis: 'seven-choices-analysis-v1.json',
  clozeAnalysis: 'cloze-analysis-v1.json', grammarFillAnalysis: 'grammar-fill-analysis-v1.json',
  writingAnalysis: 'writing-analysis-v1.json', listeningAnalysis: 'listening-analysis-v1.json',
}
const byteFiles = {
  paragraphSummariesBytes: 'paragraph-summaries-v1.json',
  publicSearchMetadataBytes: 'public-search-metadata-v1.json', sourceReferencesBytes: 'source-references-v1.json',
}
function reject(message) {
  throw Object.assign(new Error(`Sealed publication rejected: ${message}`), {
    code: 'IMPORT_REVIEW_SEALED_PUBLICATION_INVALID', reasonCode: 'SEALED_PUBLICATION_INVALID',
    status: 409, publicationNotWritten: true,
  })
}
const descriptor = (file, bytes, origin) => ({
  path: file, byteLength: bytes.byteLength, sha256: sha256(bytes), origin,
  role: 'sealed_publication', mediaType: file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
})

// Called with the SAME strict projection that produced the finalized preview.
// Files install before the DB commitment; a failed transaction leaves no
// publishable promise. A finalize retry replaces only an uncommitted snapshot.
export function sealReviewPublication(directory, revision, projection) {
  const sourceCapture = projection.compilation.artifacts.sourceCapture
  const sourceDocument = projection.analyzedPackage
    ? sourceCapture.documents.find(document => document.inputKey
      === `source_document_${projection.manifest.members.find(member => member.role === 'content').memberId.replace(/[^a-z0-9]+/gi, '_')}`)
    : sourceCapture.documents.find(document => document.inputKey === 'nck1_source_materialization')
  if (!sourceDocument) reject('source asset document is missing')
  const sourceAsset = new Uint8Array(Buffer.from(sourceDocument.encodedBytes, 'base64'))
  const listeningAudioBytes = projection.materialization.listening.state === 'captured'
    ? projection.listeningAudioBytes || readFileSync(path.join(directory, LISTENING_AUDIO_PATHS.playback)) : null
  const sealed = snapshotCanonicalReviewCompilation({
    compilation: projection.compilation,
    sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion, sourceAsset, listeningAudioBytes,
    paperHeader: configuredPaperHeader(projection.config),
  })
  const packageData = buildNck1CompatibilityPackage({
    ...projection, sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion,
    analysisSidecars: projection.analysisSidecars, paginationBindingIdentity: projection,
  })
  // The publisher's immutable source is the loader's exact source file.
  packageData.sourceAssetDigest = sha256(sourceAsset).replace(/^sha256:/, '')
  const normalization = buildPaperNormalizedGroupsSidecar(packageData.paperAsset)
  if (normalization.status !== 'ready') reject(`normalization: ${JSON.stringify(normalization.issues)}`)
  packageData.normalizedGroupsSidecar = normalization.sidecar
  const target = path.join(directory, directoryName)
  const temporary = mkdtempSync(path.join(directory, '.sealed-publication-'))
  const files = []
  const packageFiles = {}
  const add = (file, bytes) => {
    if (!validReviewRelativePath(file)) reject(`unsafe file ${file}`)
    const destination = path.join(temporary, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, bytes)
    files.push(descriptor(file, bytes, 'sealed'))
  }
  const addJson = (file, value) => add(file, stableUtf8Bytes(value))
  try {
    add('canonical/source-asset.bin', sourceAsset)
    for (const [file, bytes] of Object.entries(sealed.artifacts)) add(file, bytes)
    for (const [file, bytes] of Object.entries(sealed.sourceEvidence)) add(file, bytes)
    const playback = projection.sourceInput.listeningAudio || projection.analyzedPackage?.listeningAudio
    const playbackDerivatives = []
    if (playback) {
      const value = { playbackAudioSha256: playback.sha256, durationSeconds: playback.durationSeconds,
        segments: reviewedPlaybackSegments(projection.reviewedListening) }
      addJson(PUBLISHED_LISTENING_PLAYBACK_UI_FILE, { ...value, digest: digestJson(value) })
      playbackDerivatives.push(PUBLISHED_LISTENING_PLAYBACK_UI_FILE)
    }
    for (const [key, file] of Object.entries({
      paperAsset: 'paper-asset.json', answerKey: 'answer-key.json', importMeta: 'import-meta.json',
      normalizedGroupsSidecar: 'paper-normalized-groups-v1.json',
      ...Object.fromEntries(Object.entries(analyses).map(([key, file]) => [key, `analyses/${file}`])),
    })) {
      if (packageData[key] != null) {
        packageFiles[key] = `compatibility/${file}`
        addJson(packageFiles[key], packageData[key])
      }
      delete packageData[key]
    }
    for (const key of Object.keys(byteFiles)) delete packageData[key]
    delete packageData.frozenProducts
    const manifest = {
      revisionId: revision.id, bundleDigest: revision.bundleDigest,
      payloadDigest: digestJson(buildProductPreviewPayload(revision, projection)),
      paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
      consumerRefs: consumerContractRefsForAuthority(sealed.manifest.authority),
      publication: sealed.manifest, playbackDerivatives, packageFiles, packageEnvelope: packageData,
      materializationDigest: digestJson(projection.materialization),
      importProfile: projection.importProfile, files: [
        ...files,
        ...revision.manifest.files.map(file => ({ ...file, origin: 'revision' })),
      ],
    }
    const manifestBytes = stableUtf8Bytes(manifest)
    writeFileSync(path.join(temporary, 'manifest.json'), manifestBytes)
    if (existsSync(target)) rmSync(target, { recursive: true })
    renameSync(temporary, target)
    return sha256(manifestBytes)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

// Never treats missing/corrupt bytes as a historical revision. All reads use
// the existing no-symlink snapshot boundary and the committed manifest digest.
export function restoreSealedReviewPublication({ directory, revision, commitment, previewDigest }) {
  const root = path.join(directory, directoryName)
  const manifestFile = { path: 'manifest.json', sha256: commitment, byteLength: 0,
    role: 'sealed_publication', mediaType: 'application/json' }
  try {
    return withSealedReviewSnapshot(root, [manifestFile], snapshot => {
      if (snapshot.fileEvidence[0].sha256 !== commitment) reject('manifest digest differs')
      const manifest = JSON.parse(readFileSync(path.join(snapshot.directory, 'manifest.json')))
      if (manifest.revisionId !== revision.id || manifest.bundleDigest !== revision.bundleDigest
        || manifest.payloadDigest !== previewDigest
        || ['paperId', 'sourceDigest', 'candidateDigest'].some(key => manifest[key] !== revision[key])
        || !Array.isArray(manifest.files)) reject('manifest identity differs')
      const own = manifest.files.filter(file => file.origin === 'sealed')
      const original = manifest.files.filter(file => file.origin === 'revision')
      if (own.length + original.length !== manifest.files.length
        || digestJson(original.map(({ origin: _origin, ...file }) => file)) !== digestJson(revision.manifest.files)) {
        reject('revision inventory differs')
      }
      return withSealedReviewSnapshot(root, own, sealedSnapshot =>
        withSealedReviewSnapshot(directory, original, revisionSnapshot => {
          for (const [snapshot, expected] of [[sealedSnapshot, own], [revisionSnapshot, original]]) {
            if (snapshot.fileEvidence.some((file, i) => file.sha256 !== expected[i].sha256
              || file.byteLength !== expected[i].byteLength)) reject('file bytes differ')
          }
          const bytes = (file, origin = 'sealed') => {
            const inventory = origin === 'sealed' ? own : original
            if (!inventory.some(item => item.path === file)) reject(`undeclared file ${file}`)
            return readFileSync(path.join(origin === 'sealed' ? sealedSnapshot.directory : revisionSnapshot.directory, file))
          }
          const json = (file, origin) => JSON.parse(bytes(file, origin))
          const publication = manifest.publication
          const sealed = { manifest: publication, sourceAsset: bytes('canonical/source-asset.bin'),
            artifacts: Object.fromEntries(publication.artifacts.map(file => [file.relativePath, bytes(file.relativePath)])),
            sourceEvidence: Object.fromEntries([...publication.sourceEvidence,
              ...(publication.listeningAudio ? [publication.listeningAudio] : [])].map(file => [file.relativePath, bytes(file.relativePath)])),
            playbackDerivatives: Object.fromEntries(manifest.playbackDerivatives.map(file => [file, bytes(file)])) }
          const packageData = { ...manifest.packageEnvelope,
            ...Object.fromEntries(Object.entries(manifest.packageFiles).map(([key, file]) => [key, json(file)])) }
          for (const key of Object.keys(analyses)) packageData[key] ??= null
          for (const [key, file] of Object.entries(byteFiles)) {
            packageData[key] = original.some(item => item.path === file) ? bytes(file, 'revision') : null
          }
          const products = original.find(file => file.path === 'products/manifest-v1.json')
          packageData.frozenProducts = products ? { manifest: json(products.path, 'revision'), digest: products.sha256,
            bytes: Object.fromEntries(original.filter(file => file.path.startsWith('products/'))
              .map(file => [file.path, bytes(file.path, 'revision')])) } : null
          if (packageData.sourceAssetDigest !== sha256(sealed.sourceAsset).replace(/^sha256:/, '')) reject('source digest differs')
          return { sealed, manifest, packageData, preparedFacts: {
            sealedCompatibility: { importMeta: structuredClone(packageData.importMeta),
              normalizedGroupsSidecar: structuredClone(packageData.normalizedGroupsSidecar) },
            materializationDigest: manifest.materializationDigest,
            manifest: json('universal-source-manifest.json', 'revision'), config: json('config.json', 'revision'),
            paginationPlan: packageData.paginationPlan,
          } }
        }))
    })
  } catch (error) {
    if (error.code === 'IMPORT_REVIEW_SEALED_PUBLICATION_INVALID') throw error
    reject(`${error.code || error.reasonCode || 'READ_FAILED'}: ${error.message}`)
  }
}
