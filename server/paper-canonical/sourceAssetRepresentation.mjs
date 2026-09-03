import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function parseJson(bytes, reject, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    reject(`${label} is invalid`)
  }
}

const docxMediaType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function safeEvidencePath(relativePath, reject, label) {
  if (
    typeof relativePath !== 'string'
    || !relativePath.startsWith('source-evidence/')
    || relativePath.includes('..')
    || path.isAbsolute(relativePath)
  ) reject(`${label} path is invalid`)
}

// A Ticket 26 source-capture wrapper is itself the sealed Publication source;
// its asset-projection evidence is the one complete Paper Asset representation
// that Screen and Print consumers may derive. No caller-owned asset mirror is
// accepted here.
export function loadCanonicalSourceAssetRepresentation({
  sourceAsset,
  versionDir,
  reject,
  label,
}) {
  if (Array.isArray(sourceAsset?.content?.blocks)) {
    return { asset: sourceAsset, digest: null, kind: 'source_asset' }
  }
  if (sourceAsset?.schemaVersion !== 'source-capture-v1') {
    reject(`${label} blocks are invalid`)
  }
  const documents = sourceAsset.documents?.filter(
    (document) => document.roles?.includes('asset-projection'),
  )
  if (documents?.length !== 1) reject(`${label} identity is ambiguous`)
  const document = documents[0]
  const ref = document.immutableArtifactRef
  safeEvidencePath(ref?.relativePath, reject, label)
  const sourcePath = path.join(versionDir, ref.relativePath)
  if (!existsSync(sourcePath)) reject(`${label} is unavailable`)
  const sourceBytes = readFileSync(sourcePath)
  const sourceDigest = digestBytes(sourceBytes)
  if (
    sourceDigest !== document.sha256
    || sourceDigest !== ref.sha256
    || sourceBytes.byteLength !== ref.byteLength
  ) reject(`${label} digest disagrees`)
  const asset = parseJson(sourceBytes, reject, label)
  if (!Array.isArray(asset?.content?.blocks)) reject(`${label} blocks are invalid`)
  return { asset, digest: sourceDigest, kind: 'legacy_source_capture' }
}

// Publication binds canonical/source-asset.bin for DOCX and paper-asset.json for
// JSON. The derived paper-asset.json for DOCX is not sealed by sourceAssetDigest.
export function loadPublicationBoundSourceAssetRepresentation({
  versionDir,
  publicationSource,
  reject,
  label,
}) {
  const isDocx = publicationSource?.mediaType === docxMediaType
  const sealedRelativePath = isDocx
    ? 'canonical/source-asset.bin'
    : 'paper-asset.json'
  const sealedPath = path.join(versionDir, sealedRelativePath)
  if (!existsSync(sealedPath)) reject(`${label} asset is unavailable`)
  const sealedBytes = readFileSync(sealedPath)
  if (
    sealedBytes.byteLength !== publicationSource.byteLength
    || digestBytes(sealedBytes) !== publicationSource.sha256
  ) {
    reject(`${label} digest disagrees`)
  }
  let sourceAsset
  if (isDocx) {
    const assetPath = path.join(versionDir, 'paper-asset.json')
    if (!existsSync(assetPath)) reject(`${label} asset is unavailable`)
    sourceAsset = parseJson(readFileSync(assetPath), reject, label)
  } else {
    sourceAsset = parseJson(sealedBytes, reject, label)
  }
  return loadCanonicalSourceAssetRepresentation({
    sourceAsset,
    versionDir,
    reject,
    label,
  })
}
