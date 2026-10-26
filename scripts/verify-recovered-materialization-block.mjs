#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { preflightPaper } from '../import-ops/lib/probe.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { prepareSpellingReview, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import {
  NCK1_MATERIALIZATION_BINDING_MISMATCH,
  NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE,
} from './import-pipeline/nck1-docx-materialize.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperDir = mkdtempSync(path.join(tmpdir(), 'eqb-recovered-materialization-'))
const paperId = `paper-recovered-materialization-${process.pid}`
const cliPaperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
const fixture = makeSyntheticNck1DocxFixture()
const manifest = { ...fixture.manifest, paperId }
const save = (file, value) => writeFileSync(file, JSON.stringify(value))
const cli = (command) => execFileSync(process.execPath, [
  path.join(root, 'scripts/import-pipeline/universal-nck1.mjs'), command, paperId,
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let linked = false
try {
  for (const document of fixture.sourceDocuments) {
    const record = manifest.documents.find(item => item.documentId === document.documentId)
    const file = path.join(paperDir, record.path)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, document.bytes)
  }
  save(path.join(paperDir, 'universal-source-manifest.json'), manifest)
  save(path.join(paperDir, 'config.json'), { paperId, format: 'universal-nck1' })
  symlinkSync(paperDir, cliPaperDir)
  linked = true
  assert.match(cli('materialize'), /ready_for_verification/u)
  const spellingReview = prepareSpellingReview(
    readFileSync(path.join(paperDir, manifest.materializationPath)), TEXT_REVIEW_POLICY,
  )
  spellingReview.reviewedBy = 'import_agent'
  spellingReview.reviewedAt = '2026-10-26T00:00:00Z'
  spellingReview.targets.forEach(target => { target.decision = 'unchanged' })
  save(path.join(paperDir, SPELLING_REVIEW_FILE), spellingReview)
  assert.match(cli('verify'), /"groups": 9/u)
  const blockedPath = path.join(paperDir, 'signals/blocked.json')
  const receiptPath = path.join(paperDir, 'materialization/nck1-docx-materialization-producer-receipt-v1.json')
  const receiptBytes = readFileSync(receiptPath)
  const receipt = JSON.parse(receiptBytes)
  // Verify success alone must not erase a receipt binding failure.
  for (const patch of [{ sourceDigest: 'sha256:stale' }, { producerVersion: 'unknown' }]) {
    save(receiptPath, { ...receipt, ...patch })
    assert.throws(() => cli('materialize'), /NCK1_MATERIALIZATION_BINDING_MISMATCH/u)
    const bytes = readFileSync(blockedPath)
    assert.equal(JSON.parse(bytes).errorCode, NCK1_MATERIALIZATION_BINDING_MISMATCH)
    assert.match(cli('verify'), /"groups": 9/u)
    assert.deepEqual(readFileSync(blockedPath), bytes)
    assert.equal(preflightPaper({ repoRoot: root, paperId }).state, 'failed')
  }
  // Restore the actual current receipt, as after a completed formal rebuild.
  writeFileSync(receiptPath, receiptBytes)
  for (const coded of [true, false]) {
    const bytes = Buffer.from(JSON.stringify({
      code: 'source_incomplete',
      note: coded ? 'Retained binding failure identified by stable code' : NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE,
      ...(coded ? { errorCode: NCK1_MATERIALIZATION_BINDING_MISMATCH } : {}),
    }))
    writeFileSync(blockedPath, bytes)
    assert.equal(preflightPaper({ repoRoot: root, paperId }).state, 'failed')
    assert.match(cli('verify'), /"groups": 9/u)
    assert.equal(existsSync(blockedPath), false)
    assert.deepEqual(readFileSync(path.join(paperDir, 'signals/history', `blocked-${sha256(bytes)}.json`)), bytes)
    const preflight = preflightPaper({ repoRoot: root, paperId })
    assert.equal(preflight.local.blocked, false)
    assert.notEqual(preflight.state, 'failed')
  }
  for (const block of [
    { code: 'source_incomplete', note: 'Waiting for source correction' },
    { code: 'other_failure', note: NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE },
    { code: 'source_incomplete', errorCode: 'OTHER_FAILURE', note: NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE },
    { code: 'source_incomplete', note: `${NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE} additional failure` },
  ]) {
    save(blockedPath, block)
    const bytes = readFileSync(blockedPath)
    cli('verify')
    assert.deepEqual(readFileSync(blockedPath), bytes)
    assert.equal(preflightPaper({ repoRoot: root, paperId }).state, 'failed')
  }
  console.log('verify-recovered-materialization-block: PASS (CLI error code, current receipt, exact legacy message, stale digest/version, unrelated blockers, byte-identical archive and real preflight)')
} finally {
  if (linked) rmSync(cliPaperDir)
  rmSync(paperDir, { recursive: true, force: true })
}
