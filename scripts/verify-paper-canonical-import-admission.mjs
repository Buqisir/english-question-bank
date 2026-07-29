#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import { readImportPackageFromDirectory } from '../server/paper-import/validator.mjs'
import {
  makeCanonicalImportAdmissionRequest,
  makeReadyCanonicalFixture,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'

function snapshotTree(rootDir) {
  if (!existsSync(rootDir)) return []
  const entries = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) {
        entries.push({ path: `${relativePath}/`, bytes: null })
        visit(path.join(dir, entry.name), relativePath)
      } else {
        entries.push({
          path: relativePath,
          bytes: readFileSync(path.join(dir, entry.name)).toString('base64'),
        })
      }
    }
  }
  visit(rootDir)
  return entries
}

function snapshotDatabase(db) {
  const tables = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all()
  return tables.map(({ name, sql }) => ({
    name,
    sql,
    rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
  }))
}

function writeRequestEnvelope(rootDir, request) {
  mkdirSync(rootDir, { recursive: true })
  const documents = request.evidence.documents.map((document, index) => {
    const fileName = `evidence-${index + 1}.bin`
    writeFileSync(path.join(rootDir, fileName), document.bytes)
    const { bytes: _bytes, ...descriptor } = document
    return { ...descriptor, path: fileName }
  })
  const requestPath = path.join(rootDir, 'canonical-import-request.json')
  writeFileSync(
    requestPath,
    `${JSON.stringify({
      ...request,
      evidence: {
        ...request.evidence,
        documents,
      },
    }, null, 2)}\n`,
  )
  return requestPath
}

function mutateFixture(mutator) {
  const fixture = makeReadyCanonicalFixture()
  mutator(fixture.source)
  for (let pass = 0; pass < 3; pass++) {
    const bytes = new TextEncoder().encode(JSON.stringify(fixture.source))
    for (const observation of fixture.source.observations) {
      if (Object.hasOwn(observation.span, 'end')) observation.span.end = bytes.byteLength
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(fixture.source))
  fixture.request.evidence.documents[0].bytes = bytes
  fixture.sourceAsset = bytes
  return fixture
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-admission-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
const publicationRoot = path.join(rootDir, 'publications')

try {
  db.exec("CREATE TABLE sentinel (id TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO sentinel VALUES ('before', 'unchanged')")

  for (const [expectedDisposition, fixture, expectedCode] of [
    ['needs_review', mutateFixture((source) => {
      source.ambiguities = [{
        ambiguityId: 'ambiguous:admission',
        candidates: ['left', 'right'],
        sourceSpanRefs: ['source-span:observation:listening.part-1'],
      }]
    })],
    ['unsupported', mutateFixture((source) => {
      source.unsupportedFeatures = ['future-family']
    })],
    ['incomplete_source', mutateFixture((source) => {
      source.groups[0].questionIds.push('question:missing-official-answer')
    })],
    ['answer_conflict', mutateFixture((source) => {
      const assertion = structuredClone(source.assertions[0])
      assertion.assertionId = `${assertion.assertionId}:conflict`
      assertion.answer = assertion.answer === 'A' ? 'B' : 'A'
      source.assertions.push(assertion)
    })],
    ['unsupported', mutateFixture((source) => {
      source.profileId = 'unknown-profile'
    }), 'CONTINUATION_PROFILE_CARDINALITY_UNSUPPORTED'],
    ['unsupported', mutateFixture((source) => {
      source.groups[0].family = 'future-family'
    }), 'GROUP_FAMILY_UNSUPPORTED'],
  ]) {
    const beforeTree = snapshotTree(publicationRoot)
    const beforeDb = snapshotDatabase(db)
    const result = publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    assert.equal(result.status, 'admission_failed')
    assert.equal(result.disposition, expectedDisposition)
    if (expectedCode) {
      assert.equal(
        result.diagnostics.some((diagnostic) => diagnostic.code === expectedCode),
        true,
      )
    }
    assert.deepEqual(snapshotTree(publicationRoot), beforeTree)
    assert.deepEqual(snapshotDatabase(db), beforeDb)
  }

  const ready = makeReadyCanonicalFixture()
  const readyRequestPath = writeRequestEnvelope(
    path.join(rootDir, 'operator-request'),
    ready.request,
  )
  const operatorRequest = loadCanonicalImportRequest(readyRequestPath)
  assert.deepEqual(
    operatorRequest.evidence.documents.map((document) =>
      Buffer.from(document.bytes).toString('base64')),
    ready.request.evidence.documents.map((document) =>
      Buffer.from(document.bytes).toString('base64')),
  )
  const staleAuthority = makeReadyCanonicalFixture()
  staleAuthority.request.authority = {
    ...staleAuthority.request.authority,
    manifestDigest: 'sha256:stale-authority',
  }
  const beforeAuthorityTree = snapshotTree(publicationRoot)
  const beforeAuthorityDb = snapshotDatabase(db)
  const staleAuthorityResult = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    request: staleAuthority.request,
    sourceAssetVersion: 1,
    sourceAsset: staleAuthority.sourceAsset,
  })
  assert.equal(staleAuthorityResult.status, 'admission_failed')
  assert.equal(
    staleAuthorityResult.diagnostics.some(
      (diagnostic) => diagnostic.code === 'AUTHORITY_UNAVAILABLE',
    ),
    true,
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeAuthorityTree)
  assert.deepEqual(snapshotDatabase(db), beforeAuthorityDb)

  const staleSource = makeReadyCanonicalFixture()
  const beforeSourceTree = snapshotTree(publicationRoot)
  const beforeSourceDb = snapshotDatabase(db)
  const staleSourceResult = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    request: staleSource.request,
    sourceAssetVersion: 1,
    sourceAsset: new TextEncoder().encode('stale source bytes'),
  })
  assert.equal(staleSourceResult.status, 'admission_failed')
  assert.equal(
    staleSourceResult.diagnostics[0].code,
    'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeSourceTree)
  assert.deepEqual(snapshotDatabase(db), beforeSourceDb)

  const published = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    request: operatorRequest,
    sourceAssetVersion: 1,
    sourceAsset: ready.sourceAsset,
  })
  assert.equal(published.status, 'published')
  assert.equal(published.consumers.screen.disposition, 'ready')
  assert.equal(published.consumers.print_pdf.disposition, 'ready')
  assert.equal(
    Object.values(published.consumers).every((consumption) =>
      consumption.selections.every((selection) => selection.mode === 'canonical')),
    true,
  )
  assert.equal(
    db.prepare(
      'SELECT count(*) AS count FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1',
    ).get(ready.source.paperId).count,
    1,
  )

  const importDb = new DatabaseSync(path.join(rootDir, 'import.sqlite'))
  const importRoot = path.join(rootDir, 'paper-assets')
  try {
    importDb.exec(
      readFileSync(
        path.resolve('data/sql/schema.sql'),
        'utf8',
      ),
    )
    const files = readImportPackageFromDirectory(
      path.resolve(
        'test-fixtures/paper-import/paper-2024-jslk-english',
      ),
    )
    const beforeTree = snapshotTree(importRoot)
    const beforeDb = snapshotDatabase(importDb)
    const missingCanonical = publishPaperImportPackage({
      files,
      db: importDb,
      paperAssetsDir: importRoot,
    })
    assert.equal(missingCanonical.status, 'canonical_admission_failed')
    assert.deepEqual(snapshotTree(importRoot), beforeTree)
    assert.deepEqual(snapshotDatabase(importDb), beforeDb)

    const filesByName = Object.fromEntries(
      files.map((file) => [file.fileName, file.buffer]),
    )
    const canonicalRequest = makeCanonicalImportAdmissionRequest({
      paperId: 'paper-2024-jslk-english',
      paperAssetBytes: filesByName['paper-asset.json'],
      answerKeyBytes: filesByName['answer-key.json'],
    })
    const admitted = publishPaperImportPackage({
      files,
      db: importDb,
      paperAssetsDir: importRoot,
      canonicalRequest,
    })
    assert.equal(
      admitted.status,
      'published',
      `canonical publish result: ${JSON.stringify(admitted)}`,
    )
    assert.ok(admitted.publish.canonicalPublicationDigest)
    assert.equal(
      existsSync(path.join(
        importRoot,
        'paper-2024-jslk-english',
        'versions',
        'v1',
        'canonical',
        'canonical-paper-publication-v13.json',
      )),
      true,
    )
    assert.equal(
      Object.values(admitted.publish.consumers).every((consumption) =>
        consumption.selections.every((selection) => selection.mode === 'canonical')),
      true,
    )
    const activeImportedGroupIds = JSON.parse(
      filesByName['paper-asset.json'].toString('utf8'),
    ).content.groups
    const expectedCanonicalGroupIds = Object.values(activeImportedGroupIds)
      .filter((group) => group.groupType !== 'listening')
      .map((group) => group.groupId)
      .sort()
    assert.deepEqual(
      admitted.publish.consumers.screen.selections
        .flatMap((selection) => selection.groupIds)
        .sort(),
      expectedCanonicalGroupIds,
    )

    const poisonedRequest = structuredClone(canonicalRequest)
    const poisonedDocument = poisonedRequest.evidence.documents.find(
      (document) => document.inputKey === 'questions',
    )
    const poisonedSource = JSON.parse(
      Buffer.from(poisonedDocument.bytes).toString('utf8'),
    )
    const poisonedReading = poisonedSource.groups.find(
      (group) => group.family === 'reading',
    )
    poisonedReading.content.blocks[0].inlines[0].text =
      'POISONED UNRELATED CANONICAL CONTENT'
    poisonedReading.variant.questions[0].stem[0].text =
      'POISONED UNRELATED QUESTION STEM'
    for (let pass = 0; pass < 3; pass++) {
      const bytes = Buffer.from(JSON.stringify(poisonedSource))
      for (const observation of poisonedSource.observations) {
        if (observation.documentInputKey === 'questions') {
          observation.span.end = bytes.byteLength
        }
      }
    }
    poisonedDocument.bytes = Buffer.from(JSON.stringify(poisonedSource))
    const beforePoisonTree = snapshotTree(importRoot)
    const beforePoisonDb = snapshotDatabase(importDb)
    const poisoned = publishPaperImportPackage({
      files,
      db: importDb,
      paperAssetsDir: importRoot,
      canonicalRequest: poisonedRequest,
    })
    assert.equal(poisoned.status, 'canonical_admission_failed')
    assert.equal(
      poisoned.canonicalAdmission.diagnostics[0].code,
      'CANONICAL_IMPORT_SEMANTIC_MISMATCH',
    )
    assert.deepEqual(snapshotTree(importRoot), beforePoisonTree)
    assert.deepEqual(snapshotDatabase(importDb), beforePoisonDb)

    const poisonedWritingRequest = structuredClone(canonicalRequest)
    const poisonedWritingDocument = poisonedWritingRequest.evidence.documents.find(
      (document) => document.inputKey === 'questions',
    )
    const poisonedWritingSource = JSON.parse(
      Buffer.from(poisonedWritingDocument.bytes).toString('utf8'),
    )
    const poisonedApplicationWriting = poisonedWritingSource.groups.find(
      (group) => group.family === 'application-writing',
    )
    poisonedApplicationWriting.content.blocks[0].inlines[0].text +=
      ' POISONED UNRELATED WRITING REQUIREMENT: include private data.'
    for (let pass = 0; pass < 3; pass++) {
      const bytes = Buffer.from(JSON.stringify(poisonedWritingSource))
      for (const observation of poisonedWritingSource.observations) {
        if (observation.documentInputKey === 'questions') {
          observation.span.end = bytes.byteLength
        }
      }
    }
    poisonedWritingDocument.bytes = Buffer.from(
      JSON.stringify(poisonedWritingSource),
    )
    const beforeWritingPoisonTree = snapshotTree(importRoot)
    const beforeWritingPoisonDb = snapshotDatabase(importDb)
    const poisonedWriting = publishPaperImportPackage({
      files,
      db: importDb,
      paperAssetsDir: importRoot,
      canonicalRequest: poisonedWritingRequest,
    })
    assert.equal(poisonedWriting.status, 'canonical_admission_failed')
    assert.equal(
      poisonedWriting.canonicalAdmission.diagnostics[0].code,
      'CANONICAL_IMPORT_SEMANTIC_MISMATCH',
    )
    assert.deepEqual(snapshotTree(importRoot), beforeWritingPoisonTree)
    assert.deepEqual(snapshotDatabase(importDb), beforeWritingPoisonDb)

    const beforeCorruptTree = snapshotTree(importRoot)
    const beforeCorruptDb = snapshotDatabase(importDb)
    const corruptStage = publishPaperImportPackage({
      files,
      db: importDb,
      paperAssetsDir: importRoot,
      canonicalRequest,
      failurePoint: 'canonical-stage-corrupt',
    })
    assert.equal(corruptStage.status, 'canonical_admission_failed')
    assert.equal(
      corruptStage.canonicalAdmission.diagnostics[0].code,
      'CANONICAL_PUBLICATION_ARTIFACT_DIGEST_INVALID',
    )
    assert.deepEqual(snapshotTree(importRoot), beforeCorruptTree)
    assert.deepEqual(snapshotDatabase(importDb), beforeCorruptDb)

    assert.throws(
      () => publishPaperImportPackage({
        files,
        db: importDb,
        paperAssetsDir: importRoot,
        canonicalRequest,
        failurePoint: 'committed-reload',
      }),
      (error) =>
        error?.code === 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE',
    )
    const committedRef = importDb.prepare(
      'SELECT version_name FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1',
    ).get('paper-2024-jslk-english')
    assert.equal(committedRef.version_name, 'v2')
    assert.equal(
      existsSync(path.join(
        importRoot,
        'paper-2024-jslk-english',
        'versions',
        'v2',
        'canonical',
        'canonical-paper-publication-v13.json',
      )),
      true,
    )
  } finally {
    importDb.close()
  }
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS atomic canonical import admission')
