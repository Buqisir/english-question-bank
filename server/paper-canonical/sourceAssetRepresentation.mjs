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
