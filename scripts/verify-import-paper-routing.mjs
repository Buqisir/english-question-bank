#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function plan(...files) {
  const result = spawnSync(process.execPath, [
    'scripts/verify-ci.mjs',
    '--plan-json',
    ...files.flatMap((file) => ['--changed-file', file]),
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

const materialization = plan(
  'scripts/import-pipeline/papers/paper-synthetic/materialization/nck1-source-materialization-v1.json',
)
assert.equal(materialization.risk, 'single-paper-import')
assert.equal(materialization.pack, 'import-paper')
assert(materialization.scripts.length >= 10, 'import pack keeps independent failure layers')
assert(materialization.scripts.length <= 23, 'import pack stays narrow as carrier verifiers are added')
for (const required of [
  'scripts/verify-nck1-docx-materialization-producer.mjs',
  'scripts/verify-nck1-pdf-materialization-producer.mjs',
  'scripts/verify-nck1-answer-source-shapes.mjs',
  'scripts/verify-nck1-ocr-source-evidence.mjs',
  'scripts/verify-universal-nck1-image-source-bundle.mjs',
  'scripts/verify-universal-nck1-source-only-intake.mjs',
  'scripts/verify-universal-nck1-source-only-boundaries.mjs',
  'scripts/verify-import-review-ocr-confirmation.mjs',
  'scripts/verify-import-review-media-derivation.mjs',
  'scripts/verify-nck1-source-materialization.mjs',
  'scripts/verify-paper-canonical-import-admission.mjs',
  'scripts/verify-paper-canonical-import-recovery.mjs',
  'scripts/verify-universal-nck1-publish.mjs',
  'scripts/verify-paper-canonical-detail-screen-consumption.mjs',
  'scripts/verify-print-renderer.mjs',
  'scripts/verify-figure-render.mjs',
]) {
  assert(materialization.scripts.includes(required), `${required} remains an independent import failure layer`)
}

for (const sharedFile of [
  'scripts/import-pipeline/universal-nck1.mjs',
  'scripts/import-pipeline/nck1-source-only.mjs',
  'server/paper-import/nck1DocxMaterializationProducer.mjs',
  'server/paper-import/nck1PdfMaterializationProducer.mjs',
  'server/paper-import/nck1PdfTextSourceAdapter.mjs',
  'server/paper-import/nck1OcrMaterializationProducer.mjs',
  'server/paper-import/nck1OcrSourceEvidence.mjs',
  'server/paper-import/nck1ImageSourceBundle.mjs',
  '.github/workflows/verify.yml',
]) {
  assert.equal(plan(sharedFile).pack, 'all', `${sharedFile} fails closed to all`)
}

assert.equal(plan(
  'scripts/import-pipeline/papers/paper-synthetic/materialization/nck1-source-materialization-v1.json',
  'server/print-renderer.mjs',
).pack, 'all', 'mixed single-paper and shared changes fail closed to all')

console.log('verify-import-paper-routing: PASS')
