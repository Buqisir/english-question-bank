#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const fixture = makeReadyCanonicalFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-publication-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
try {
  const first = publishCanonicalPaperPublication({
    rootDir,
    db,
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(first.status, 'published')
  const repeated = publishCanonicalPaperPublication({
    rootDir,
    db,
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(repeated.status, 'idempotent')
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const ready = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(ready.disposition, 'ready')
  assert.equal(ready.selections.every((selection) => selection.mode === 'canonical'), true)
  assert.equal(ready.selections.length, 6)
  const legacyStore = {
    ...store,
    projectLegacyFamily: async ({ familyContractId }) => [{ kind: 'legacy_family', familyContractId }],
  }
  const familyFallback = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.print_pdf }, legacyStore)
  assert.equal(familyFallback.disposition, 'ready')
  assert.equal(familyFallback.selections.filter((selection) => selection.mode === 'legacy').length, 1)
  assert.equal(familyFallback.selections.find((selection) => selection.mode === 'legacy').familyContractId, 'seven-choices')

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation,
      sourceAssetVersion: 2,
      sourceAsset: fixture.sourceAsset,
      failurePoint: 'after-latest-before-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  const afterPreCommitFailure = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(afterPreCommitFailure.disposition, 'ready')
  assert.equal(afterPreCommitFailure.sourceAssetVersion, 1)
  assert.equal(existsSync(path.join(rootDir, fixture.source.paperId, 'versions', 'v2')), false)

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation,
      sourceAssetVersion: 2,
      sourceAsset: fixture.sourceAsset,
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  assert.equal(recoverCanonicalPaperPublication({ rootDir, db, paperId: fixture.source.paperId }).status, 'post_commit_recovered')
  const afterRecovery = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract: consumerContractRefs.screen }, store)
  assert.equal(afterRecovery.disposition, 'ready')
  assert.equal(afterRecovery.sourceAssetVersion, 2)

  const occupiedVersion = path.join(rootDir, fixture.source.paperId, 'versions', 'v3')
  mkdirSync(occupiedVersion)
  assert.throws(
    () => publishCanonicalPaperPublication({ rootDir, db, compilation, sourceAssetVersion: 3, sourceAsset: fixture.sourceAsset }),
    { code: 'CANONICAL_PUBLICATION_VERSION_CONFLICT' },
  )
  rmSync(occupiedVersion, { recursive: true, force: true })

  const corruptPath = path.join(rootDir, fixture.source.paperId, 'versions', 'v2', 'canonical', 'normalization-report-v1.json')
  writeFileSync(corruptPath, '{"corrupt":true}\n')
  const corrupt = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, store)
  assert.equal(corrupt.disposition, 'incompatible')
  const corruptFallback = await loadPaperForConsumption({ paperId: fixture.source.paperId, version: 'v2', consumerContract: consumerContractRefs.screen }, legacyStore)
  assert.equal(corruptFallback.disposition, 'ready')
  assert.equal(corruptFallback.selections.every((selection) => selection.mode === 'legacy'), true)
  assert.equal(corruptFallback.selections.length, 6)
  assert.equal(readFileSync(corruptPath, 'utf8').includes('corrupt'), true)
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS canonical publication seam')
