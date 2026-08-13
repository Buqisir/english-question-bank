#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { crc32 } from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import {
  admitCanonicalPaperImport,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  TRUSTED_DOCX_REQUEST_FILE_NAME,
  isTrustedDocxCanonicalImportRequest,
} from '../server/paper-canonical/trustedDocxCanonicalRequest.mjs'
import {
  deriveNck1Identity,
  extractDocxDocumentText,
} from '../server/paper-canonical/docxSourceAdapter.mjs'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import { readImportPackageFromDirectory } from '../server/paper-import/validator.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDocxRel =
  'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const fixtureDocxPath = path.join(rootDir, fixtureDocxRel)
const producerScript = path.join(
  rootDir,
  'scripts/import-pipeline/build-trusted-docx-canonical-request.mjs',
)
const schemaSql = readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-trusted-docx-request-'))

function zipStore(files) {
  const chunks = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.bytes)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks, centralBuf, eocd]))
}

function docxWithParagraph(text) {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return zipStore([{
    name: 'word/document.xml',
    bytes: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
      + `<w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`,
  }])
}

function runProducer(args) {
  const result = spawnSync(process.execPath, [producerScript, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const error = new Error(
      result.stderr || result.stdout || `producer exited ${result.status}`,
    )
    error.status = result.status
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
  return result
}

try {
  const nationalDocx = docxWithParagraph('2025年全国高考一卷英语真题')
  assert.deepEqual(
    deriveNck1Identity(extractDocxDocumentText(nationalDocx)),
    { paperId: 'paper-2025-i', profileId: 'nck1' },
  )
  const zhejiangOfficial = docxWithParagraph(
    '浙江省2025年1月普通高等学校招生全国统一考试英语试卷',
  )
  assert.deepEqual(
    deriveNck1Identity(extractDocxDocumentText(zhejiangOfficial)),
    { paperId: 'paper-zj-2025-jan', profileId: 'nck1' },
  )
  const zhejiangAnswer = docxWithParagraph(
    '2025年浙江卷高考真题英语试卷（1月）',
  )
  assert.deepEqual(
    deriveNck1Identity(extractDocxDocumentText(zhejiangAnswer)),
    { paperId: 'paper-zj-2025-jan', profileId: 'nck1' },
  )
  assert.throws(
    () => deriveNck1Identity(extractDocxDocumentText(
      docxWithParagraph('2025年某市模拟卷英语试卷'),
    )),
    /DOCX source lacks a supported NCK1 paper identity/,
  )

  const outputDir = path.join(tempRoot, 'canonical-evidence')
  runProducer([
    fixtureDocxPath,
    '--output-dir',
    outputDir,
    '--expected-paper-id',
    'paper-2025-i',
    '--write',
  ])
  const requestPath = path.join(outputDir, TRUSTED_DOCX_REQUEST_FILE_NAME)
  const loaded = loadCanonicalImportRequest(requestPath)
  assert.equal(isTrustedDocxCanonicalImportRequest(loaded), true)
  assert.equal(
    loaded.evidence.documents.some((document) => document.inputKey === 'source_docx'),
    true,
  )
  runProducer([
    fixtureDocxPath,
    '--output-dir',
    outputDir,
    '--expected-paper-id',
    'paper-2025-i',
  ])

  let mismatch
  try {
    runProducer([
      fixtureDocxPath,
      '--output-dir',
      path.join(tempRoot, 'mismatch'),
      '--expected-paper-id',
      'paper-pilot-2025-zj-jan',
      '--write',
    ])
  } catch (error) {
    mismatch = error
  }
  assert.match(
    String(mismatch?.stderr || mismatch?.message || ''),
    /TRUSTED_DOCX_PAPER_ID_MISMATCH|differs from expected/,
  )

  const generic = compileCanonicalPaper(loaded)
  assert.equal(
    'canonicalPaper' in generic.artifacts,
    false,
    'generic compiler must not bypass Teacher Confirmation',
  )

  const publicationDb = new DatabaseSync(path.join(tempRoot, 'publication.sqlite'))
  const publicationRoot = path.join(tempRoot, 'publications')
  const admitted = admitCanonicalPaperImport({
    request: loaded,
    sourceAssetVersion: 1,
  })
  assert.equal(
    admitted.ok,
    true,
    `trusted DOCX admission failed: ${JSON.stringify(admitted.diagnostics)}`,
  )
  assert.equal(admitted.sealed.manifest.paperId, 'paper-2025-i')
  const published = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db: publicationDb,
    request: loaded,
    sourceAssetVersion: 1,
  })
  assert.equal(published.status, 'published')
  assert.equal(
    existsSync(path.join(publicationRoot, 'paper-2025-i', 'latest')),
    true,
    'trusted DOCX publication must write latest/ under the isolated root',
  )

  const importDb = new DatabaseSync(path.join(tempRoot, 'import.sqlite'))
  importDb.exec(schemaSql)
  const importRoot = path.join(tempRoot, 'paper-assets')
  const jslkFiles = readImportPackageFromDirectory(
    path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english'),
  )
  const beforeMissing = existsSync(path.join(importRoot, 'paper-2024-jslk-english', 'latest'))
  const missingRequest = publishPaperImportPackage({
    files: jslkFiles,
    db: importDb,
    paperAssetsDir: importRoot,
  })
  assert.equal(missingRequest.status, 'canonical_admission_failed')
  assert.equal(
    existsSync(path.join(importRoot, 'paper-2024-jslk-english', 'latest')),
    beforeMissing,
    'format ① without a loadable trusted-DOCX request must not be treated as published',
  )
  assert.equal(
    existsSync(path.join(importRoot, 'paper-2025-i', 'latest')),
    false,
  )

  const wrongSource = admitCanonicalPaperImport({
    request: loaded,
    sourceAssetVersion: 1,
    sourceAsset: jslkFiles.find((file) => file.fileName === 'paper-asset.json').buffer,
  })
  assert.equal(wrongSource.ok, false)
  assert.equal(
    wrongSource.diagnostics.some(
      (diagnostic) => diagnostic.code === 'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
    ),
    true,
    'trusted DOCX admission must reject a paper-asset source override',
  )

  const crossPackage = publishPaperImportPackage({
    files: jslkFiles,
    db: importDb,
    paperAssetsDir: importRoot,
    canonicalRequest: loaded,
  })
  assert.equal(crossPackage.status, 'canonical_admission_failed')
  assert.equal(
    crossPackage.canonicalAdmission?.diagnostics?.some(
      (diagnostic) => diagnostic.code === 'CANONICAL_IMPORT_PAPER_ID_MISMATCH',
    ),
    true,
    'publisher must admit the loaded trusted-DOCX request (DOCX source asset) before package identity binding',
  )
  assert.equal(
    existsSync(path.join(importRoot, 'paper-2025-i', 'latest')),
    false,
  )
  assert.equal(
    existsSync(path.join(importRoot, 'paper-2024-jslk-english', 'latest')),
    false,
  )

  publicationDb.close()
  importDb.close()
  console.log(JSON.stringify({
    status: 'PASS',
    paperId: 'paper-2025-i',
    producer: 'scripts/import-pipeline/build-trusted-docx-canonical-request.mjs',
    loadedRequest: true,
    isolatedLatest: true,
    unpublishedWithoutRequest: true,
    publisherAdmitsLoadedRequest: true,
  }))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
