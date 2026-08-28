#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import {
  buildNck1ReviewProjection,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../server/import-review/revisionProjection.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { publishUniversalNck1Import } from '../server/paper-import/publisher.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperId = 'paper-mock-contract-2026-m1'

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function makeReviewRoot(
  parentDir,
  fixturePaperId = paperId,
  questionSourceLabel = 'deterministic NCK1 question source',
) {
  const reviewRoot = path.join(parentDir, 'review')
  const questionBytes = Buffer.from(
    `%PDF-1.7 ${questionSourceLabel}`.padEnd(100, 'q'),
  )
  const answerBytes = Buffer.from(
    '%PDF-1.7 deterministic official answer source'.padEnd(100, 'a'),
  )
  const materialization = makeFixture()
  materialization.paperId = fixturePaperId
  for (const [documentId, bytes] of [
    ['paper', questionBytes],
    ['answers', answerBytes],
  ]) {
    const document = materialization.documents.find((item) =>
      item.documentId === documentId)
    document.sha256 = sha256(bytes)
    document.byteLength = bytes.byteLength
  }
  const manifest = {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId: fixturePaperId,
    profileId: 'nck1',
    provenance: {
      paperName: '2026 Contract Mock',
      source: 'Deterministic verifier source',
    },
    documents: [
      {
        ...materialization.documents[0],
        path: 'source/questions.pdf',
      },
      {
        ...materialization.documents[1],
        path: 'source/answers.pdf',
      },
    ],
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media',
    canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
  }
  writeJson(path.join(reviewRoot, 'config.json'), {
    paperId: fixturePaperId,
    format: 'universal-nck1',
    provenance: manifest.provenance,
    universalSourceManifestPath: 'universal-source-manifest.json',
    canonicalRequestPath: manifest.canonicalRequestPath,
  })
  writeJson(path.join(reviewRoot, 'universal-source-manifest.json'), manifest)
  writeJson(
    path.join(reviewRoot, manifest.materializationPath),
    materialization,
  )
  mkdirSync(path.join(reviewRoot, 'source'), { recursive: true })
  writeFileSync(path.join(reviewRoot, 'source/questions.pdf'), questionBytes)
  writeFileSync(path.join(reviewRoot, 'source/answers.pdf'), answerBytes)

  const projection = buildNck1ReviewProjection(reviewRoot)
  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  const materialized = materializeNck1CanonicalRequest(
    projection.sourceInput,
    confirmation,
  )
  const evidenceDir = path.join(reviewRoot, 'canonical-evidence')
  mkdirSync(evidenceDir, { recursive: true })
  for (const [fileName, bytes] of materialized.outputs) {
    writeFileSync(path.join(evidenceDir, fileName), bytes)
  }
  return {
    reviewRoot,
    projection,
    requestPath: path.join(evidenceDir, 'canonical-import-request.json'),
  }
}

function makeContext(label) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), `eqb-universal-publish-${label}-`))
  const fixture = makeReviewRoot(tempRoot)
  const db = new DatabaseSync(path.join(tempRoot, 'question-bank.sqlite'))
  db.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  return {
    ...fixture,
    tempRoot,
    db,
    paperAssetsDir: path.join(tempRoot, 'paper-assets'),
  }
}

function approvedIdentity(projection) {
  return {
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
  }
}

function publish(context, options = {}) {
  return publishUniversalNck1Import({
    reviewRootDir: context.reviewRoot,
    approvedIdentity: approvedIdentity(context.projection),
    canonicalRequest: loadCanonicalImportRequest(context.requestPath),
    db: context.db,
    paperAssetsDir: context.paperAssetsDir,
    ...options,
  })
}

function publishedVersionCount(context) {
  return context.db.prepare(
    'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
  ).get(paperId).count
}

function close(context) {
  context.db.close()
  rmSync(context.tempRoot, { recursive: true, force: true })
}

function runReviewCommand(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/import-pipeline/review.mjs', ...args],
      {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(
        `review.mjs ${args.join(' ')} exited ${code}: ${stderr || stdout}`,
      ))
    })
  })
}

const happy = makeContext('happy')
try {
  const result = publish(happy)
  assert.equal(result.status, 'published', JSON.stringify(result, null, 2))
  assert.equal(result.publish.assetVersion, 1)
  assert.equal(result.publish.consumers.screen.disposition, 'ready')
  assert.equal(result.publish.consumers.print_pdf.disposition, 'ready')
  assert.equal(
    result.publish.consumers.screen.visibleStructureDigest,
    happy.projection.visibleStructureDigest,
  )
  assert.equal(Object.keys(happy.projection.paperAsset.content.groups).length, 9)
  assert.equal(Object.keys(happy.projection.paperAsset.answerKey.answers).length, 45)
  assert.equal(publishedVersionCount(happy), 1)
  const publishedGroupIds = Object.keys(
    happy.projection.paperAsset.content.groups,
  )
  const groupPlaceholders = publishedGroupIds.map(() => '?').join(', ')
  assert.equal(
    happy.db.prepare(
      `SELECT COUNT(*) AS count FROM question_groups WHERE id IN (${groupPlaceholders})`,
    ).get(...publishedGroupIds).count,
    9,
  )
  const publishedQuestions = happy.db.prepare(
    `
    SELECT answer
    FROM questions
    WHERE group_id IN (${groupPlaceholders})
    `,
  ).all(...publishedGroupIds)
  assert.equal(publishedQuestions.length, 45)
  assert(publishedQuestions.every(({ answer }) => String(answer).length > 0))
  const current = happy.db.prepare(
    `
    SELECT source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)
  assert.equal(current.source_asset_version, 1)
  assert.equal(current.publication_digest, result.publish.canonicalPublicationDigest)
  for (const base of [
    path.join(happy.paperAssetsDir, paperId, 'versions/v1'),
    path.join(happy.paperAssetsDir, paperId, 'latest'),
  ]) {
    assert(existsSync(path.join(base, 'paper-asset.json')))
    assert(existsSync(path.join(base, 'answer-key.json')))
    assert(!existsSync(path.join(base, 'analyses')))
  }
} finally {
  close(happy)
}

for (const [label, mutate] of [
  ['stale-approval', ({ identity }) => {
    identity.candidateDigest = `sha256:${'0'.repeat(64)}`
  }],
  ['stale-confirmation', ({ request }) => {
    request.nck1MaterializationConfirmation.candidateDigest = `sha256:${'0'.repeat(64)}`
  }],
]) {
  const context = makeContext(label)
  try {
    const identity = approvedIdentity(context.projection)
    const request = loadCanonicalImportRequest(context.requestPath)
    mutate({ identity, request })
    const result = publishUniversalNck1Import({
      reviewRootDir: context.reviewRoot,
      approvedIdentity: identity,
      canonicalRequest: request,
      db: context.db,
      paperAssetsDir: context.paperAssetsDir,
    })
    assert.equal(result.ok, false)
    assert(!existsSync(context.paperAssetsDir))
    assert.equal(publishedVersionCount(context), 0)
  } finally {
    close(context)
  }
}

const tamperedSource = makeContext('tampered-source')
try {
  writeFileSync(
    path.join(tamperedSource.reviewRoot, 'source/questions.pdf'),
    Buffer.from('tampered source'),
  )
  assert.throws(() => publish(tamperedSource))
  assert(!existsSync(tamperedSource.paperAssetsDir))
} finally {
  close(tamperedSource)
}

const staleRequest = makeContext('stale-request')
try {
  const staleFixture = makeReviewRoot(
    path.join(staleRequest.tempRoot, 'stale'),
    paperId,
    'older but internally valid NCK1 question source',
  )
  const result = publishUniversalNck1Import({
    reviewRootDir: staleRequest.reviewRoot,
    approvedIdentity: approvedIdentity(staleRequest.projection),
    canonicalRequest: loadCanonicalImportRequest(staleFixture.requestPath),
    db: staleRequest.db,
    paperAssetsDir: staleRequest.paperAssetsDir,
  })
  assert.equal(result.ok, false)
  assert.equal(
    result.canonicalAdmission.diagnostics[0].code,
    'NCK1_MATERIALIZATION_REQUEST_IDENTITY_MISMATCH',
  )
  assert(!existsSync(staleRequest.paperAssetsDir))
  assert.equal(publishedVersionCount(staleRequest), 0)
} finally {
  close(staleRequest)
}

const preCommit = makeContext('pre-commit')
try {
  assert.throws(() => publish(preCommit, { failurePoint: 'db-write' }))
  assert.equal(publishedVersionCount(preCommit), 0)
  assert.equal(
    preCommit.db.prepare(
      'SELECT COUNT(*) AS count FROM question_groups WHERE id LIKE ?',
    ).get('group-%').count,
    0,
  )
  assert(!existsSync(path.join(preCommit.paperAssetsDir, paperId, 'latest')))
  const versionsDir = path.join(preCommit.paperAssetsDir, paperId, 'versions')
  assert(
    !existsSync(versionsDir)
      || readdirSync(versionsDir).filter((name) => /^v\d+$/.test(name)).length === 0,
  )
} finally {
  close(preCommit)
}

const postCommit = makeContext('post-commit')
try {
  assert.throws(() => publish(postCommit, { failurePoint: 'committed-reload' }))
  const journalPath = path.join(
    postCommit.paperAssetsDir,
    paperId,
    '.latest-swap.json',
  )
  assert(existsSync(journalPath))
  const invalidRequest = loadCanonicalImportRequest(postCommit.requestPath)
  invalidRequest.nck1MaterializationConfirmation.candidateDigest =
    `sha256:${'0'.repeat(64)}`
  const rejected = publishUniversalNck1Import({
    reviewRootDir: postCommit.reviewRoot,
    approvedIdentity: approvedIdentity(postCommit.projection),
    canonicalRequest: invalidRequest,
    db: postCommit.db,
    paperAssetsDir: postCommit.paperAssetsDir,
  })
  assert.equal(rejected.ok, false)
  assert(
    existsSync(journalPath),
    'invalid retry must not recover or clean committed-reload state before admission',
  )
  assert.equal(publishedVersionCount(postCommit), 1)
  const retry = publish(postCommit)
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.publish.assetVersion, 1)
  assert.equal(publishedVersionCount(postCommit), 1)
  assert.deepEqual(
    readdirSync(path.join(postCommit.paperAssetsDir, paperId, 'versions'))
      .filter((name) => /^v\d+$/.test(name)),
    ['v1'],
  )
} finally {
  close(postCommit)
}

const cliTempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-universal-publish-cli-'))
const cliPaperId = `paper-mock-contract-2026-cli-${process.pid}`
const cliPaperDir = path.join(
  root,
  'scripts/import-pipeline/papers',
  cliPaperId,
)
let reviewServer = null
try {
  const fixture = makeReviewRoot(cliTempRoot, cliPaperId)
  mkdirSync(path.dirname(cliPaperDir), { recursive: true })
  assert(!existsSync(cliPaperDir), 'CLI fixture paper directory must be unique')
  renameSync(fixture.reviewRoot, cliPaperDir)
  const projection = buildNck1ReviewProjection(cliPaperDir)
  const producerBuildId = 'universal-publish-verifier'
  const files = reviewBundleFilePaths(cliPaperDir).map((file) => {
    const bytes = readFileSync(resolveReviewFile(cliPaperDir, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
  const manifestBase = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId: cliPaperId,
    paperName: projection.paperName,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    producerBuildId,
    files,
    resolvesIssueIds: [],
  }
  const bundleDigest = reviewBundleDigest(manifestBase)
  const approval = {
    schemaVersion: 'web-import-review-approval-v1',
    approvalId: 'approval-universal-publish-verifier',
    paperId: cliPaperId,
    revisionId: 'rev-universal-publish-verifier',
    revisionNumber: 1,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    bundleDigest,
    producerBuildId,
    rendererBuildId: 'renderer-universal-publish-verifier',
    approvedAt: '2026-08-28T00:00:00.000Z',
    approvedBy: 'owner',
  }
  const status = {
    paperId: cliPaperId,
    latestRevisionId: approval.revisionId,
    latest: {
      id: approval.revisionId,
      state: 'approved',
      manifest: { ...manifestBase, bundleDigest },
    },
    approval,
  }
  reviewServer = createServer((request, response) => {
    if (
      request.method !== 'GET'
      || request.url
        !== `/api/import-agent-reviews/papers/${encodeURIComponent(cliPaperId)}`
      || request.headers.authorization !== 'Bearer verifier-token'
    ) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(status))
  })
  await new Promise((resolve, reject) => {
    reviewServer.once('error', reject)
    reviewServer.listen(0, '127.0.0.1', resolve)
  })
  const address = reviewServer.address()
  assert(address && typeof address === 'object')
  const dbPath = path.join(cliTempRoot, 'question-bank.sqlite')
  const assetsDir = path.join(cliTempRoot, 'paper-assets')
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  db.close()
  const commandEnv = {
    QUESTION_BANK_IMPORT_OPS_ORIGIN: `http://127.0.0.1:${address.port}`,
    QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'verifier-token',
    QUESTION_BANK_BUILD_ID: producerBuildId,
    QUESTION_BANK_DB: dbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: assetsDir,
  }
  const accepted = await runReviewCommand(['accept', cliPaperId], commandEnv)
  assert.match(accepted.stdout, /^ACCEPTED /)
  writeJson(path.join(cliPaperDir, 'signals/ai-answer-check.json'), {
    ok: true,
    checkedAt: '2026-08-28T00:00:00.000Z',
    method: 'source-markings-vs-answerKey',
  })
  const published = await runReviewCommand(['publish', cliPaperId], commandEnv)
  assert.match(published.stdout, /^PUBLISHED .* v1: ready_to_ship;/)
  const receipt = JSON.parse(readFileSync(
    path.join(cliPaperDir, 'signals/locally-published.json'),
    'utf8',
  ))
  assert.equal(receipt.approvalId, approval.approvalId)
  assert.equal(receipt.assetVersion, 1)
  const repeated = await runReviewCommand(['publish', cliPaperId], commandEnv)
  assert.match(repeated.stdout, /^ALREADY PUBLISHED .* v1: ready_to_ship;/)
  const publishedDb = new DatabaseSync(dbPath, { readOnly: true })
  assert.equal(
    publishedDb.prepare(
      'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
    ).get(cliPaperId).count,
    1,
  )
  publishedDb.close()
} finally {
  if (reviewServer) {
    await new Promise((resolve) => reviewServer.close(resolve))
  }
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(cliTempRoot, { recursive: true, force: true })
}

console.log('verify-universal-nck1-publish: PASS')
