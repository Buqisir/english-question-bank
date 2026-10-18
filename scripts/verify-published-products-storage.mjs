import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { archiveReviewFiles, createBlobStore } from '../server/paper-import/blobStore.mjs'
import { loadStoredProducts, productInputDigest, readFrozenProducts, PRODUCT_FILES, PRODUCT_MANIFEST } from '../server/paper-import/frozenProducts.mjs'
import { readExamDate } from '../shared/examDate.mjs'
import { PAPER_PDF_PRODUCTS } from '../shared/paperPdfProducts.mjs'
import { sendListeningAudioFile } from '../server/paper-import/paperAssetStatic.mjs'
import { createExportRoutes } from '../server/exports/exportRoutes.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { runRoutes } from '../server/router/index.mjs'
import { productPdfBytes as pdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { publishUniversalNck1Import } from '../server/paper-import/publisher.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'

// Keep Review reuse/crash/concurrency coverage in the existing storage CI seam.
await import('./verify-import-review-upload-reuse.mjs')
await import('./verify-import-review-finalize-worker.mjs')

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

  const missingDiskRoot = path.join(directory, 'must-not-fall-back')
  for (const storageEnv of [
    { QUESTION_BANK_PAPER_STORAGE_MOUNT: directory },
    { QUESTION_BANK_PAPER_STORAGE_MOUNT: directory,
      QUESTION_BANK_PAPER_STORAGE_UUID: '00000000-0000-0000-0000-000000000000' },
  ]) {
    const guarded = createBlobStore({ rootDir: missingDiskRoot, storageEnv })
    await assert.rejects(guarded.put(source), { code: 'PAPER_STORAGE_MOUNT_UNAVAILABLE' })
    await assert.rejects(stat(missingDiskRoot), { code: 'ENOENT' },
      'a missing or incomplete disk binding cannot create a fallback object directory')
  }

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

  // Real upload route/store: two private revisions share physical bytes, not
  // just a matching digest in JSON. No finalization or publication is implied.
  const custodyRoot = path.join(directory, 'custody')
  const custody = createBlobStore({ rootDir: custodyRoot })
  const reviewStore = createImportReviewStore({ dbPath: path.join(custodyRoot, 'review.sqlite'),
    filesRoot: path.join(custodyRoot, 'revisions'), rendererBuildId: 'storage-fixture' })
  const uploadRoutes = createImportReviewRoutes({ getStore: () => reviewStore,
    getBlobStore: () => custody, agentToken: 'storage-upload-fixture' })
  const audioSource = Buffer.from('original-audio-17: distinct from normalized playback')
  const createUpload = (label, content = audioSource) => {
    const file = { path: 'source/audio.mp3', sha256: digest(content), byteLength: content.length,
      mediaType: 'audio/mpeg', role: 'source' }
    const manifest = { schemaVersion: 'web-import-review-bundle-v1', paperId: 'paper-storage-upload',
      paperName: 'Storage fixture', sourceDigest: file.sha256, candidateDigest: digest(Buffer.from(label)),
      visibleStructureDigest: file.sha256, analysisDigest: file.sha256, producerBuildId: 'storage-fixture',
      files: [file], resolvesIssueIds: [] }
    manifest.bundleDigest = reviewBundleDigest(manifest)
    const { revision } = reviewStore.createRevision(manifest)
    return { revision, file, destination: path.join(reviewStore.revisionDirectory(revision.id), file.path) }
  }
  const uploadFile = async (upload, content = audioSource, authorized = true) => {
    const request = Readable.from([content.subarray(0, 7), content.subarray(7)])
    Object.assign(request, { method: 'PUT', headers: { 'content-length': String(content.length),
      ...(authorized ? { authorization: 'Bearer storage-upload-fixture' } : {}) } })
    const output = {}
    const url = new URL(`http://localhost/api/import-agent-reviews/revisions/${upload.revision.id}/files`)
    url.searchParams.set('path', upload.file.path)
    assert.equal(await runRoutes(uploadRoutes, { request, response: {}, url,
      context: { sendJson(_response, status, body) { Object.assign(output, { status, body }) } } }), true)
    return output
  }
  const first = createUpload('first')
  assert.equal((await uploadFile(first, audioSource, false)).status, 401)
  assert.deepEqual(await readdir(reviewStore.revisionDirectory(first.revision.id)), [])
  assert.equal((await uploadFile(first, Buffer.alloc(audioSource.length))).status, 400)
  assert.equal(reviewStore.uploadStatus(first.revision.id).missingFiles.length, 1)
  assert.equal((await uploadFile(first)).status, 200)
  const second = createUpload('second')
  assert.equal((await uploadFile(second)).status, 200)
  const objectPath = path.join(custodyRoot, 'eqb-blobs/v1/sha256', first.file.sha256.slice(7))
  const physical = await Promise.all([first.destination, second.destination, objectPath].map(file => stat(file)))
  assert.equal(new Set(physical.map(file => `${file.dev}:${file.ino}`)).size, 1,
    'identical private uploads must occupy one physical file')
  for (const upload of [first, second]) assert.deepEqual(await readFile(upload.destination), audioSource)
  assert.equal((await uploadFile(first)).status, 200, 'exact upload retries stay idempotent')
  assert.deepEqual(await custody.put(audioSource, 'audio/mpeg'), {
    sha256: first.file.sha256, byteLength: first.file.byteLength, mediaType: 'audio/mpeg',
  })
  assert.equal((await stat(objectPath)).ino, physical[0].ino, 'publication reuse must preserve the stored object')
  const playback = Buffer.from('normalized-playback-31: different bytes must remain separate')
  const third = createUpload('third', playback)
  assert.equal((await uploadFile(third, playback)).status, 200)
  assert.notEqual((await stat(third.destination)).ino, physical[0].ino)
  await rm(first.destination)
  assert.deepEqual(await readFile(second.destination), audioSource, 'removing one reference must not remove another')
  await chmod(objectPath, 0o600)
  const corrupt = Buffer.alloc(audioSource.length, 0x62)
  await writeFile(objectPath, corrupt)
  const fourth = createUpload('fourth')
  assert.equal((await uploadFile(fourth)).status, 500)
  assert.equal(reviewStore.uploadStatus(fourth.revision.id).missingFiles.length, 1)
  assert.deepEqual(await readFile(objectPath), corrupt, 'corrupt addresses cannot be silently repaired by another upload')
  await assert.rejects(stat(fourth.destination), { code: 'ENOENT' })
  await assert.rejects(custody.get(first.file), /integrity/)

  // Boundary counts, different edition bytes, and a naturally five-page answer.
  const pageCounts = [12, 10, 8, 5]
  const bytes = Object.fromEntries(PRODUCT_FILES.map((file, i) => [file.path, pdfBytes(pageCounts[i], `edition ${i}`)]))
  const manifest = { schemaVersion: 'paper-pdf-products-v1', paperId: 'paper-storage-test', paperName: '源卷名',
    inputDigest: digest(Buffer.from('inputs')), files: PRODUCT_FILES.map((file, i) => ({ ...file,
      byteLength: bytes[file.path].length, sha256: digest(bytes[file.path]), pageCount: pageCounts[i] })) }
  bytes[PRODUCT_MANIFEST] = Buffer.from(JSON.stringify(manifest))
  for (const [index, pages, claimed, expected] of [
    [0, 13, 13, /产品规格/], [1, 11, 11, /产品规格/],
    [2, 7, 7, /产品规格/], [2, 9, 9, /产品规格/],
    [0, 13, 12, /实际页数/], [3, 6, 5, /实际页数/],
    [3, null, 5, /无法解析/],
  ]) {
    const changed = structuredClone(manifest)
    const name = changed.files[index].path
    const pdf = pages === null ? Buffer.from('%PDF-1.7\nnot a real document\n%%EOF') : pdfBytes(pages, 'changed')
    Object.assign(changed.files[index], { pageCount: claimed, byteLength: pdf.length, sha256: digest(pdf) })
    const snapshot = { ...bytes, [name]: pdf, [PRODUCT_MANIFEST]: Buffer.from(JSON.stringify(changed)) }
    assert.throws(() => readFrozenProducts(directory, { readArtifact: file => snapshot[file] }), expected)
  }
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

  // Reuse the source fixture without executing its full verifier. Exercise the
  // real projection/publication gates, not only a synthetic published report.
  const previousFixtureOnly = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  let makeReviewRoot
  try {
    process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
    ;({ makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs'))
  } finally {
    if (previousFixtureOnly === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
    else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previousFixtureOnly
  }
  const fixture = makeReviewRoot(path.join(directory, 'review-fixture'), 'paper-product-contract', undefined, { listening: true })
  const configPath = path.join(fixture.reviewRoot, 'config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  config.pdfProductsRequired = true
  config.provenance = { ...config.provenance, year: 2026, month: 4 }
  await writeFile(configPath, JSON.stringify(config))
  const references = prepareSourceReferences(fixture.projection)
  const evidence = fixture.projection.materialization.documents.filter(file => file.role === 'official_answers').map(file => ({
    documentSha256: file.sha256, locator: { kind: 'page_region', documentId: file.documentId,
      page: 1, region: { x: 0, y: 0, width: 1, height: 1 } },
  }))
  for (const group of references.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', evidence, entries: [] }
  }
  const referencesPath = path.join(fixture.reviewRoot, SOURCE_REFERENCES_FILE)
  await writeFile(referencesPath, JSON.stringify(references))
  const inputIdentity = buildNck1ReviewProjection(fixture.reviewRoot, { requireAnalyses: true })
  const fixturePageCounts = [12, 10, 9, 5]
  const fixtureBytes = { ...bytes, 'products/economy8.pdf': pdfBytes(9, 'explicit nine-page product') }
  await mkdir(path.join(fixture.reviewRoot, 'products'))
  const productManifest = { ...manifest, schemaVersion: 'paper-pdf-products-v2', economyPageLimit: 9,
    paperId: fixture.projection.paperId,
    paperName: fixture.projection.paperName, examDate: { year: 2026, month: 4 },
    files: PRODUCT_FILES.map((file, index) => ({ ...file, pageCount: fixturePageCounts[index],
      byteLength: fixtureBytes[file.path].length, sha256: digest(fixtureBytes[file.path]) })),
    inputDigest: productInputDigest(fixture.reviewRoot, reviewBundleFilePaths(fixture.reviewRoot)) }
  for (const file of PRODUCT_FILES) await writeFile(path.join(fixture.reviewRoot, file.path), fixtureBytes[file.path])
  await writeFile(path.join(fixture.reviewRoot, PRODUCT_MANIFEST), JSON.stringify(productManifest))
  assert.throws(() => buildNck1ReviewProjection(fixture.reviewRoot), /输入或四款文件清单/,
    'a nine-page manifest cannot opt in an otherwise eight-page paper')
  const paginationPlan = { schemaVersion: 'paper-pagination-plan-v5', paperId: inputIdentity.paperId,
    sourceDigest: inputIdentity.sourceDigest, candidateDigest: inputIdentity.candidateDigest,
    editions: { economy8: { targetPages: 9, includeListening: false, omitCover: false, coverGapsPt: null,
      allowSplitOptionBank: false, breakSlotIds: ['writing.continuation'], layout: {
        profile: 'student-friendly-economy-v2', fontSizePt: 10.5, figureLayout: 'float80',
        answerBoxHeightsMm: { application: 65, continuation: 57 },
      } } } }
  await writeFile(path.join(fixture.reviewRoot, 'pagination-plan.json'), JSON.stringify(paginationPlan))
  assert.throws(() => buildNck1ReviewProjection(fixture.reviewRoot), /输入或四款文件清单/,
    'adding the plan invalidates the previous product input digest')
  productManifest.inputDigest = productInputDigest(fixture.reviewRoot, reviewBundleFilePaths(fixture.reviewRoot))
  await writeFile(path.join(fixture.reviewRoot, PRODUCT_MANIFEST), JSON.stringify(productManifest))
  const projection = buildNck1ReviewProjection(fixture.reviewRoot, { requireAnalyses: true })
  assert.equal(projection.sourceDigest, inputIdentity.sourceDigest)
  assert.equal(projection.candidateDigest, inputIdentity.candidateDigest)
  await rm(referencesPath)
  const withoutReferences = { ...productManifest,
    inputDigest: productInputDigest(fixture.reviewRoot, reviewBundleFilePaths(fixture.reviewRoot)) }
  await writeFile(path.join(fixture.reviewRoot, PRODUCT_MANIFEST), JSON.stringify(withoutReferences))
  assert.throws(() => buildNck1ReviewProjection(fixture.reviewRoot), /源参考答案捕获/)
  await writeFile(referencesPath, JSON.stringify(references))
  await writeFile(path.join(fixture.reviewRoot, PRODUCT_MANIFEST), JSON.stringify(productManifest))
  const reviewFiles = reviewBundleFilePaths(fixture.reviewRoot).map(file => {
    const data = projection.frozenProducts.bytes[file.path]
    return { ...file, ...(data ? { sha256: digest(data), byteLength: data.length } : {}) }
  })
  for (const file of reviewFiles) if (!file.sha256) {
    const data = await readFile(path.join(fixture.reviewRoot, file.path))
    Object.assign(file, { sha256: digest(data), byteLength: data.length })
  }
  const reviewManifest = { schemaVersion: 'web-import-review-bundle-v1', paperId: projection.paperId,
    paperName: projection.paperName, sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest, analysisDigest: projection.analysisDigest,
    producerBuildId: 'product-storage-verifier', files: reviewFiles, resolvesIssueIds: [] }
  reviewManifest.bundleDigest = reviewBundleDigest(reviewManifest)
  const previewDb = path.join(directory, 'product-preview.sqlite')
  const previewFiles = path.join(directory, 'product-preview-files')
  const previewStore = createImportReviewStore({ dbPath: previewDb, filesRoot: previewFiles,
    rendererBuildId: 'product-preview-fixture' })
  const previewRevision = previewStore.createRevision(reviewManifest).revision
  for (const file of reviewManifest.files) {
    const upload = previewStore.fileForUpload(previewRevision.id, file.path)
    await mkdir(path.dirname(upload.destination), { recursive: true })
    await writeFile(upload.destination, await readFile(path.join(fixture.reviewRoot, file.path)))
    previewStore.completeFileUpload(previewRevision.id, file.path, file)
  }
  previewStore.finalizeRevision(previewRevision.id)
  const previewReader = createImportReviewStore({ dbPath: previewDb, filesRoot: previewFiles,
    rendererBuildId: 'product-preview-fixture',
    projectRevision() { throw new Error('Product reads cannot reprocess source') } })
  const previewRoutes = createImportReviewRoutes({ getStore: () => previewReader,
    buildPrintHtml() { throw new Error('Frozen products cannot render on GET') } })
  const readPreview = async (suffix, role = 'owner') => {
    const output = { headers: {} }
    const response = { writeHead(status, headers) { Object.assign(output, { status, headers }) },
      end(body) { output.body = body } }
    const url = new URL(`http://fixture/api/import-review-preview/revisions/${previewRevision.id}/${suffix}`)
    await runRoutes(previewRoutes, { request: { method: 'GET' }, response, url,
      context: { session: { role }, sendJson(_response, status, body) { Object.assign(output, { status, body }) } } })
    return output
  }
  for (const [index, edition] of Object.keys(PAPER_PDF_PRODUCTS).entries()) {
    assert.equal((await readPreview(`pdf?edition=${edition}`, 'member')).status, 403)
    const pdf = await readPreview(`pdf?edition=${edition}`)
    assert.equal(pdf.status, 200)
    assert.deepEqual(pdf.body, fixtureBytes[`products/${edition}.pdf`])
    assert.equal(pdf.headers['x-eqb-pagination-pages'], String(fixturePageCounts[index]))
    assert.equal(pdf.headers['x-eqb-pagination-mode'], 'frozen')
    const print = await readPreview(`print?edition=${edition}`)
    assert.equal(print.status, 200)
    assert.match(print.body, /data:application\/pdf;base64,/)
  }
  assert.deepEqual((await readPreview('asset/paper-asset.json')).body,
    JSON.parse(JSON.stringify(projection.paperAsset)))
  const previewConsumption = (await readPreview('consumption')).body
  assert.match(previewConsumption.listeningAudio.url, new RegExp(previewRevision.id))
  assert.equal(previewConsumption.listeningAudio.sha256, projection.listeningReview.audio.playbackAudioSha256)
  const changedPdf = path.join(previewFiles, previewRevision.id, 'products/economy8.pdf')
  await writeFile(changedPdf, bytes['products/largeNoListening.pdf'])
  assert.equal((await readPreview('pdf?edition=economy8')).status, 409,
    'changed frozen bytes must fail instead of rendering a replacement')
  const publicationDb = new DatabaseSync(':memory:')
  try {
    publicationDb.exec(await readFile(new URL('../data/sql/schema.sql', import.meta.url), 'utf8'))
    const input = { reviewRootDir: fixture.reviewRoot, approvedManifest: reviewManifest,
      approvedIdentity: { ...reviewManifest, approvalId: 'product-approval', revisionId: 'product-revision' },
      canonicalRequest: loadCanonicalImportRequest(fixture.requestPath), db: publicationDb,
      paperAssetsDir: path.join(directory, 'published-fixture') }
    assert.throws(() => publishUniversalNck1Import(input), /formal storage/)
    const storage = await archiveReviewFiles({ rootDir: fixture.reviewRoot, manifest: reviewManifest,
      blobStore: createBlobStore({ rootDir: path.join(directory, 'publication-blobs') }) })
    const result = publishUniversalNck1Import({ ...input, fileStorage: storage })
    assert.equal(result.ok, true)
    const official = await loadStoredProducts({ db: publicationDb, paperAssetsDir: input.paperAssetsDir,
      consumption: Object.values(result.publish.consumers)[0],
      blobStore: createBlobStore({ rootDir: path.join(directory, 'publication-blobs') }) })
    for (const file of PRODUCT_FILES) assert.deepEqual(official.bytes[file.path], fixtureBytes[file.path])
  } finally { publicationDb.close() }

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
