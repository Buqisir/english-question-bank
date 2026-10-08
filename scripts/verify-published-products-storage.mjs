import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { createBlobStore } from '../server/paper-import/blobStore.mjs'
import { loadStoredProducts, PRODUCT_FILES, PRODUCT_MANIFEST } from '../server/paper-import/frozenProducts.mjs'
import { readExamDate } from '../shared/examDate.mjs'
import { sendListeningAudioFile } from '../server/paper-import/paperAssetStatic.mjs'
import { createExportRoutes } from '../server/exports/exportRoutes.mjs'
import { runRoutes } from '../server/router/index.mjs'

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const directory = await mkdtemp(path.join(os.tmpdir(), 'eqb-product-storage-'))
const db = new DatabaseSync(':memory:')
try {
  assert.equal(readExamDate({ year: 2026, paperName: '2025年12月试题' }), null)
  assert.deepEqual(readExamDate({ year: 2025, month: 12, paperName: '2026届' }), { year: 2025, month: 12 })
  for (const month of [0, 13, 1.5, '12']) assert.throws(() => readExamDate({ year: 2025, month }))
  assert.throws(() => readExamDate({ year: 2025 }, { required: true }))

  const local = createBlobStore({ rootDir: directory })
  const source = Buffer.from('independent source bytes: 17/31')
  const blob = await local.put(source, 'audio/mpeg')
  assert.equal(blob.sha256, digest(source))
  assert.deepEqual(await local.get(blob), source)
  await local.put(source, 'audio/mpeg')
  const blobPath = path.join(directory, 'eqb-blobs/v1/sha256', blob.sha256.slice(7))
  await writeFile(blobPath, Buffer.alloc(source.length, 0x61))
  await assert.rejects(local.get(blob), /integrity/)
  await assert.rejects(local.put(source), /integrity/)
  assert.deepEqual(await readFile(blobPath), Buffer.alloc(source.length, 0x61), 'must not overwrite existing corrupt content addresses')

  let puts = 0
  const remoteBytes = new Map()
  const remote = createBlobStore({ backend: 'r2', bucket: 'test', endpoint: 'https://example.invalid', client: {
    async send(command) {
      if (command.constructor.name === 'PutObjectCommand') {
        puts++
        assert.equal(command.input.IfNoneMatch, '*')
        remoteBytes.set(command.input.Key, Buffer.from(command.input.Body))
        throw new Error('response lost after upload')
      }
      const bytes = remoteBytes.get(command.input.Key)
      return { ContentLength: bytes.length, Body: Readable.from([bytes]) }
    },
  } })
  const uploaded = await remote.put(source)
  assert.equal(puts, 1, 'UNKNOWN upload must reconcile, not replay')
  assert.deepEqual(await remote.get(uploaded), source)
  remoteBytes.set(`eqb-blobs/v1/sha256/${uploaded.sha256.slice(7)}`, Buffer.alloc(source.length))
  await assert.rejects(remote.get(uploaded), /integrity/)

  // Different edition bytes catch accidental menu aliases / wrong file mapping.
  const bytes = Object.fromEntries(PRODUCT_FILES.map((file, i) => [file.path, Buffer.from(`%PDF-1.7\nunit fixture edition ${i}\n%%EOF`)]))
  const manifest = { schemaVersion: 'paper-pdf-products-v1', paperId: 'paper-storage-test', paperName: '源卷名',
    inputDigest: digest(Buffer.from('inputs')), files: PRODUCT_FILES.map((file, i) => ({ ...file,
      byteLength: bytes[file.path].length, sha256: digest(bytes[file.path]), pageCount: i + 1 })) }
  bytes[PRODUCT_MANIFEST] = Buffer.from(JSON.stringify(manifest))
  const files = {}
  for (const [name, data] of Object.entries(bytes)) files[name] = await local.put(data)
  const consumption = { paperId: manifest.paperId, sourceAssetVersion: 2, publicationDigest: digest(Buffer.from('publication-two')) }
  const report = { paperId: manifest.paperId, assetVersion: 2, versionName: 'v2', canonicalPublicationDigest: consumption.publicationDigest,
    pdfProducts: { approvalId: 'approval-two', revisionId: 'revision-two', bundleDigest: digest(Buffer.from('review-two')), manifestDigest: digest(bytes[PRODUCT_MANIFEST]) } }
  report.fileStorage = { schemaVersion: 'review-file-storage-v1', store: local.identity, bundleDigest: report.pdfProducts.bundleDigest, files }
  db.exec(`CREATE TABLE paper_import_runs(paper_id, asset_version, status, publish_report_json);
    CREATE TABLE canonical_paper_publications(paper_id, version_name, publication_digest);
    CREATE TABLE paper_asset_versions(paper_id, asset_version, status);`)
  db.prepare('INSERT INTO paper_import_runs VALUES (?,2,\'published\',?)').run(manifest.paperId, JSON.stringify(report))
  db.prepare('INSERT INTO canonical_paper_publications VALUES (?,\'v2\',?)').run(manifest.paperId, consumption.publicationDigest)
  db.prepare('INSERT INTO paper_asset_versions VALUES (?,2,\'published\')').run(manifest.paperId)
  const loaded = await loadStoredProducts({ db, paperAssetsDir: directory, consumption, blobStore: local })
  for (const file of PRODUCT_FILES) assert.deepEqual(loaded.bytes[file.path], bytes[file.path])
  await assert.rejects(loadStoredProducts({ db, paperAssetsDir: directory,
    consumption: { ...consumption, publicationDigest: digest(Buffer.from('another revision')) }, blobStore: local }), /版本不一致/)
  await writeFile(path.join(directory, 'eqb-blobs/v1/sha256', files['products/answerOnly.pdf'].sha256.slice(7)), bytes['products/economy8.pdf'])
  await assert.rejects(loadStoredProducts({ db, paperAssetsDir: directory, consumption, blobStore: local }), /integrity/)

  // GET success alone cannot catch a missing HEAD registration in this router.
  const routes = createExportRoutes({})
  const routeContext = { draftPaperStore: {
    async getPublishedPaperProduct(paperId, edition, publicationDigest) {
      assert.equal(paperId, manifest.paperId)
      assert.equal(publicationDigest, consumption.publicationDigest)
      return { draftPaper: { title: '源卷名' }, pdfBytes: bytes[`products/${edition}.pdf`],
        paginatedHtml: '<!doctype html><title>源卷名</title>' }
    },
  } }
  for (const edition of ['largeComplete', 'largeNoListening', 'economy8', 'answerOnly']) {
    for (const product of ['pdf', 'print']) {
      const url = new URL(`http://localhost/api/exports/papers/${manifest.paperId}/${product}`)
      url.searchParams.set('edition', edition)
      url.searchParams.set('publicationDigest', consumption.publicationDigest)
      const outputs = {}
      for (const method of ['GET', 'HEAD']) {
        const output = { headers: {} }
        const response = { setHeader(name, value) { output.headers[name] = value },
          writeHead(status, headers) { output.status = status; Object.assign(output.headers, headers) },
          end(body) { output.body = body } }
        assert.equal(await runRoutes(routes, { request: { method }, response, url, context: routeContext }), true)
        assert.equal(output.status, 200)
        assert.equal(output.headers['cache-control'], 'private, no-store')
        outputs[method] = output
      }
      assert.deepEqual(outputs.HEAD.headers, outputs.GET.headers)
      assert.equal(outputs.HEAD.body, undefined)
      assert.equal(outputs.GET.headers['content-length'], Buffer.byteLength(outputs.GET.body))
      if (product === 'pdf') {
        assert.equal(outputs.GET.headers['content-type'], 'application/pdf')
        assert.deepEqual(outputs.GET.body, bytes[`products/${edition}.pdf`])
      } else {
        assert.equal(outputs.GET.headers['content-type'], 'text/html; charset=utf-8')
        assert.equal(outputs.GET.body, '<!doctype html><title>源卷名</title>')
      }
    }
  }

  const audio = Buffer.from('0123456789abcdefghij')
  for (const [method, range, status, expected] of [
    ['GET', 'bytes=3-8', 206, '345678'], ['GET', 'bytes=-4', 206, 'ghij'],
    ['GET', 'bytes=20-', 416, undefined], ['HEAD', 'bytes=3-8', 206, undefined],
  ]) {
    let output
    const response = { writeHead(code, headers) { output = { code, headers } }, end(body) { output.body = body?.toString() } }
    sendListeningAudioFile({ method, headers: { range } }, response, null, { bytes: audio })
    assert.equal(output.code, status)
    assert.equal(output.body, expected)
    if (status === 206) assert.equal(output.headers['content-length'], range === 'bytes=-4' ? 4 : 6)
  }
  console.log('PASS immutable local/remote bytes, UNKNOWN reconciliation, exact publication products, GET/HEAD parity, dates, audio ranges')
} finally {
  db.close()
  await rm(directory, { recursive: true, force: true })
}
