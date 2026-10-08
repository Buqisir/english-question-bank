import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

// Private, content-addressed storage. No bucket administration, deletion,
// public URL, or fallback from a configured remote store to local files.
const MAX_BYTES = 512 * 1024 * 1024
function checkDescriptor(file) {
  if (!/^sha256:[a-f0-9]{64}$/.test(file?.sha256 || '')
    || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0 || file.byteLength > MAX_BYTES) {
    throw new Error('Invalid immutable blob descriptor')
  }
}
function checked(bytes, file) {
  checkDescriptor(file)
  if (bytes.length !== file.byteLength || sha256(bytes) !== file.sha256) throw new Error('Immutable blob byte integrity failure')
  return bytes
}

export function createBlobStore({ backend = 'local', rootDir, bucket, endpoint, credentials, client } = {}) {
  if (!['local', 'r2'].includes(backend)) throw new Error('Unknown file-storage backend')
  if (backend === 'local' && !rootDir) throw new Error('Private blob directory is required')
  if (backend === 'r2' && (!bucket || !endpoint || (!client && (!credentials?.accessKeyId || !credentials?.secretAccessKey)))) {
    throw new Error('R2 file storage is selected but not fully configured')
  }
  const s3 = backend === 'r2' ? client || new S3Client({ region: 'auto', endpoint, credentials,
    maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }) : null
  const key = file => { checkDescriptor(file); return `eqb-blobs/v1/sha256/${file.sha256.slice(7)}` }
  const identity = backend === 'local' ? 'local' : `r2:${new URL(endpoint).host}/${bucket}`
  async function get(file) {
    const name = key(file)
    if (!s3) return checked(await readFile(path.join(rootDir, name)), file)
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: name }), { abortSignal: AbortSignal.timeout(120_000) })
    if (result.ContentLength !== file.byteLength) { result.Body?.destroy(); throw new Error('Remote blob length mismatch') }
    const chunks = []
    let size = 0
    for await (const chunk of result.Body) {
      size += chunk.length
      if (size > file.byteLength) { result.Body.destroy(); throw new Error('Remote blob exceeds its bound') }
      chunks.push(chunk)
    }
    return checked(Buffer.concat(chunks), file)
  }
  async function put(bytes, mediaType = 'application/octet-stream') {
    const file = { sha256: sha256(bytes), byteLength: bytes.length, mediaType }
    const name = key(file)
    if (s3) {
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: bytes,
          IfNoneMatch: '*', ContentLength: bytes.length, ContentType: mediaType,
          CacheControl: 'private, no-store', ChecksumSHA256: Buffer.from(file.sha256.slice(7), 'hex').toString('base64'),
        }), { abortSignal: AbortSignal.timeout(120_000) })
      } catch (error) {
        // A lost response is UNKNOWN, not proof of failure. Reconcile by reading
        // the same content address; never overwrite or repeat a blind PUT.
        try { await get(file); return file } catch { throw error }
      }
    } else {
      const target = path.join(rootDir, name)
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      const temporary = `${target}.${randomUUID()}.tmp`
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
      try {
        try { await link(temporary, target) } catch (error) { if (error.code !== 'EEXIST') throw error }
      } finally { await unlink(temporary) }
    }
    await get(file) // HEAD/ETag is not an actual-byte proof.
    return file
  }
  return { identity, get, put }
}

export function configuredBlobStore(env = process.env) {
  return createBlobStore({ backend: env.QUESTION_BANK_FILE_STORE || 'local',
    rootDir: env.QUESTION_BANK_BLOB_ROOT || path.resolve(import.meta.dirname, '../../data/published-blobs'),
    endpoint: env.QUESTION_BANK_R2_ENDPOINT, bucket: env.QUESTION_BANK_R2_BUCKET,
    credentials: { accessKeyId: env.QUESTION_BANK_R2_ACCESS_KEY_ID, secretAccessKey: env.QUESTION_BANK_R2_SECRET_ACCESS_KEY },
  })
}

export async function archiveReviewFiles({ rootDir, manifest, blobStore }) {
  const files = {}
  for (const descriptor of manifest.files) {
    if (typeof descriptor.path !== 'string' || descriptor.path.includes('..') || descriptor.path.includes('\\')
      || path.isAbsolute(descriptor.path)) throw new Error('Invalid Review file path')
    const bytes = checked(await readFile(path.join(rootDir, descriptor.path)), descriptor)
    files[descriptor.path] = await blobStore.put(bytes, descriptor.mediaType)
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`)
  const reviewManifest = await blobStore.put(manifestBytes, 'application/json')
  return { schemaVersion: 'review-file-storage-v1', store: blobStore.identity,
    bundleDigest: manifest.bundleDigest, reviewManifest, files }
}

export async function loadStoredPlayback({ db, consumption, blobStore = configuredBlobStore() }) {
  if (!consumption.listeningAudio) throw new Error('This publication has no listening audio')
  const runs = db.prepare(`SELECT publish_report_json FROM paper_import_runs
    WHERE paper_id = ? AND asset_version = ? AND status = 'published'`).all(consumption.paperId, consumption.sourceAssetVersion)
  if (runs.length > 1) throw new Error('Ambiguous audio publication')
  const report = runs.length ? JSON.parse(runs[0].publish_report_json) : null
  if (!report?.fileStorage) return null // immutable pre-storage publications
  const storage = report.fileStorage
  if (report.canonicalPublicationDigest !== consumption.publicationDigest
    || storage.schemaVersion !== 'review-file-storage-v1' || storage.store !== blobStore.identity
    || storage.bundleDigest !== report.pdfProducts?.bundleDigest) throw new Error('Audio storage binding differs from the publication')
  const file = Object.values(storage.files).find(file => file.sha256 === consumption.listeningAudio.sha256
    && file.byteLength === consumption.listeningAudio.byteLength && file.mediaType === 'audio/mpeg')
  if (!file) throw new Error('Published playback is absent from formal storage')
  return blobStore.get(file)
}
