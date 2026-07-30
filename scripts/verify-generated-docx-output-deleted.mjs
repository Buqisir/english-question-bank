#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import {
  consumerContractRefs,
  resolveConsumerContract,
} from '../shared/paper-canonical/consumers.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { validatePaperImportPackage } from '../server/paper-import/validator.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

assert.equal(
  existsSync(path.join(rootDir, 'server/exports/docxRenderer.mjs')),
  false,
  'generated-DOCX renderer implementation must be deleted',
)

const docxContracts = readdirSync(path.join(rootDir, 'standards/paper-canonical/consumers'))
  .filter((name) => /^docx-v\d+\.json$/.test(name))
assert.deepEqual(docxContracts, [], 'generated-DOCX Consumer Contracts must be deleted')

assert.deepEqual(
  Object.keys(consumerContractRefs).sort(),
  ['print_pdf', 'screen'],
  'supported canonical consumers must be exactly Screen and Print/PDF',
)

assert.equal(canonicalAuthorityRef.manifestVersion, '28')
const currentAuthority = resolveCanonicalAuthority(canonicalAuthorityRef)
assert.equal(currentAuthority.ok, true)

const humanAuthority = read('docs/product/exam-paper-format-standards.md')
const currentHumanAuthority = humanAuthority.split('## v2 历史排版证据')[0]
assert.match(
  currentHumanAuthority,
  /standards\/paper-canonical\/manifest-v28\.json/,
  'the unique human-readable authority index must bind current manifest v28',
)
assert.match(
  currentHumanAuthority,
  /Screen v28、Print\/PDF v29/,
  'the human-readable current output matrix must name only Screen v28 and Print/PDF v29',
)
assert.doesNotMatch(
  currentHumanAuthority,
  /DOCX consumer|DOCX 导出|Screen \/ Print-PDF \/ DOCX/,
  'the human-readable current authority must not retain current generated-DOCX prose',
)
const manifestV12Migration = read('standards/paper-canonical/manifest-v12-migration.md')
assert.match(
  manifestV12Migration,
  /manifest v12[\s\S]*Screen v12[\s\S]*Print\/PDF v13/i,
  'manifest v12 must have an explicit migration record for the two supported consumers',
)
assert.match(
  manifestV12Migration,
  /manifest v1-v11[\s\S]*immutable/i,
  'manifest v12 migration must preserve earlier immutable authority closures',
)
const manifestV13Migration = read('standards/paper-canonical/manifest-v13-migration.md')
assert.match(
  manifestV13Migration,
  /Manifest v13[\s\S]*Screen v13[\s\S]*Print\/PDF v14/i,
  'manifest v13 must record the current renderer/output authority closure',
)
assert.match(
  manifestV13Migration,
  /Manifest v1-v12[\s\S]*immutable/i,
  'manifest v13 migration must preserve earlier immutable authority closures',
)
const manifestV14Migration = read('standards/paper-canonical/manifest-v14-migration.md')
assert.match(
  manifestV14Migration,
  /Manifest v14[\s\S]*Screen v14[\s\S]*Print\/PDF v15/i,
  'manifest v14 must record the current renderer/output authority closure',
)
assert.match(
  manifestV14Migration,
  /Manifest v1-v13[\s\S]*immutable/i,
  'manifest v14 migration must preserve earlier immutable authority closures',
)
const manifestV15Migration = read('standards/paper-canonical/manifest-v15-migration.md')
assert.match(
  manifestV15Migration,
  /Manifest v15[\s\S]*Screen v15[\s\S]*Print\/PDF v16/i,
  'manifest v15 must record the current renderer/output authority closure',
)
assert.match(
  manifestV15Migration,
  /Manifest v1-v14[\s\S]*immutable/i,
  'manifest v15 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV15Migration,
  /Golden Geometry[\s\S]*vertical[\s\S]*horizontal/i,
  'manifest v15 must record the two-dimensional Seven Choices geometry migration',
)
const manifestV16Migration = read('standards/paper-canonical/manifest-v16-migration.md')
assert.match(
  manifestV16Migration,
  /Manifest v16[\s\S]*Screen v16[\s\S]*Print\/PDF v17/i,
  'manifest v16 must record the corrected renderer/output authority closure',
)
assert.match(
  manifestV16Migration,
  /Manifest v1-v15[\s\S]*immutable/i,
  'manifest v16 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV16Migration,
  /has no[\s\S]*standalone Seven Choices passage title[\s\S]*passage_title_to_body/i,
  'manifest v16 must record the source-bound passage-title correction',
)
const manifestV17Migration = read('standards/paper-canonical/manifest-v17-migration.md')
assert.match(
  manifestV17Migration,
  /Manifest v17[\s\S]*Screen v17[\s\S]*Print\/PDF v18/i,
  'manifest v17 must record the successor renderer/output authority closure',
)
assert.match(
  manifestV17Migration,
  /Manifest v1-v16[\s\S]*immutable/i,
  'manifest v17 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV17Migration,
  /schema[\s\S]*semantic conformance fixture[\s\S]*geometry/i,
  'manifest v17 must record schema and semantic conformance for visible geometry',
)
const manifestV18Migration = read('standards/paper-canonical/manifest-v18-migration.md')
assert.match(
  manifestV18Migration,
  /Manifest v18[\s\S]*Screen v18[\s\S]*Print\/PDF v19/i,
  'manifest v18 must record the Cloze renderer/output authority closure',
)
assert.match(
  manifestV18Migration,
  /Manifest v1-v17[\s\S]*immutable/i,
  'manifest v18 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV18Migration,
  /Cloze[\s\S]*Golden Geometry[\s\S]*3\.3em[\s\S]*four-column/i,
  'manifest v18 must record the Cloze Golden Geometry semantic closure',
)
const manifestV19Migration = read('standards/paper-canonical/manifest-v19-migration.md')
assert.match(
  manifestV19Migration,
  /Manifest v19[\s\S]*Screen v19[\s\S]*Print\/PDF v20/i,
  'manifest v19 must record the semantically closed Cloze renderer/output authority',
)
assert.match(
  manifestV19Migration,
  /Manifest v1-v18[\s\S]*immutable/i,
  'manifest v19 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV19Migration,
  /26 edge[\s\S]*targets and tolerances[\s\S]*four-track/i,
  'manifest v19 must record the complete Cloze payload closure',
)
const manifestV20Migration = read('standards/paper-canonical/manifest-v20-migration.md')
assert.match(
  manifestV20Migration,
  /Manifest v20[\s\S]*Screen v20[\s\S]*Print\/PDF v21/i,
  'manifest v20 must record the Grammar Fill renderer/output authority closure',
)
assert.match(
  manifestV20Migration,
  /Manifest v1-v19[\s\S]*immutable/i,
  'manifest v20 migration must preserve earlier immutable authority closures',
)
assert.match(
  manifestV20Migration,
  /Grammar Fill[\s\S]*Golden Geometry[\s\S]*3\.3em/i,
  'manifest v20 must record the Grammar Fill Golden Geometry semantic closure',
)
const manifestV21Migration = read('standards/paper-canonical/manifest-v21-migration.md')
assert.match(
  manifestV21Migration,
  /Manifest v21[\s\S]*Screen v21[\s\S]*Print\/PDF v22/i,
  'manifest v21 must record the Grammar Fill successor output closure',
)
assert.match(
  manifestV21Migration,
  /v20[\s\S]*byte-for-byte resolvable/i,
  'manifest v21 migration must preserve the immutable v20 closure',
)
assert.match(
  manifestV21Migration,
  /Question 63[\s\S]*unprompted[\s\S]*q56[\s\S]*q58/i,
  'manifest v21 must record the corrected Grammar Fill proof identities',
)
const manifestV22Migration = read('standards/paper-canonical/manifest-v22-migration.md')
assert.match(
  manifestV22Migration,
  /Manifest v22[\s\S]*Screen v22[\s\S]*Print\/PDF v23/i,
  'manifest v22 must record the pre-producer Grammar Fill fixture closure',
)
assert.match(
  manifestV22Migration,
  /v21[\s\S]*byte-for-byte resolvable/i,
  'manifest v22 migration must preserve the immutable v21 closure',
)
const manifestV23Migration = read('standards/paper-canonical/manifest-v23-migration.md')
assert.match(
  manifestV23Migration,
  /Manifest v23[\s\S]*Screen v23[\s\S]*Print\/PDF v24/i,
  'manifest v23 must record the Grammar Fill prompt and Plan-bound fixture closure',
)
assert.match(
  manifestV23Migration,
  /v22[\s\S]*byte-for-byte resolvable/i,
  'manifest v23 migration must preserve the immutable v22 closure',
)
const manifestV24Migration = read('standards/paper-canonical/manifest-v24-migration.md')
assert.match(
  manifestV24Migration,
  /Manifest v24[\s\S]*Screen v24[\s\S]*Print\/PDF v25/i,
  'manifest v24 must record the Grammar Fill family-owned prompt authority closure',
)
assert.match(
  manifestV24Migration,
  /v23[\s\S]*byte-for-byte resolvable/i,
  'manifest v24 migration must preserve the immutable v23 closure',
)
assert.match(
  manifestV24Migration,
  /family v2[\s\S]*Source Adapter v6[\s\S]*Question Group v2[\s\S]*Consumption Plan/i,
  'manifest v24 must record the prompt and Plan occurrence-integrity boundary',
)
const manifestV25Migration = read('standards/paper-canonical/manifest-v25-migration.md')
assert.match(
  manifestV25Migration,
  /Manifest v25[\s\S]*Screen v25[\s\S]*Print\/PDF v26/i,
  'manifest v25 must record the closed Grammar Fill prompt-provision successor',
)
assert.match(
  manifestV25Migration,
  /Manifest v24[\s\S]*remain unchanged and resolvable/i,
  'manifest v25 migration must preserve the immutable v24 closure',
)
assert.match(
  manifestV25Migration,
  /source_prompt[\s\S]*requires[\s\S]*source_proven_none[\s\S]*forbids/i,
  'manifest v25 must record both exact prompt-provision shapes',
)
const manifestV26Migration = read('standards/paper-canonical/manifest-v26-migration.md')
assert.match(
  manifestV26Migration,
  /Manifest v26[\s\S]*Screen v26[\s\S]*Print\/PDF v27/i,
  'manifest v26 must record the Application Writing Golden Geometry closure',
)
assert.match(
  manifestV26Migration,
  /Manifest v25[\s\S]*remain unchanged and resolvable/i,
  'manifest v26 migration must preserve the immutable v25 closure',
)
assert.match(
  manifestV26Migration,
  /no Application Writing reference answer[\s\S]*collapse/i,
  'manifest v26 must record the source-proven absent Teacher tail',
)
const manifestV27Migration = read('standards/paper-canonical/manifest-v27-migration.md')
assert.match(
  manifestV27Migration,
  /Manifest v27[\s\S]*Screen v27[\s\S]*Print\/PDF v28/i,
  'manifest v27 must record the corrected Application Writing successor',
)
assert.match(
  manifestV27Migration,
  /Manifest v26[\s\S]*remain unchanged and resolvable/i,
  'manifest v27 migration must preserve the immutable v26 closure',
)
assert.match(
  manifestV27Migration,
  /Manifest v27 contract[\s\S]*request-file-name[\s\S]*default runbook command/i,
  'manifest v27 must record authority-owned default producer selection',
)
const manifestV28Migration = read('standards/paper-canonical/manifest-v28-migration.md')
assert.match(
  manifestV28Migration,
  /Manifest v28[\s\S]*Screen v28[\s\S]*Print\/PDF v29/i,
  'manifest v28 must record the Continuation Writing Golden Geometry closure',
)
assert.match(
  manifestV28Migration,
  /Manifest v27[\s\S]*remain unchanged and resolvable/i,
  'manifest v28 migration must preserve the immutable v27 closure',
)
assert.match(
  manifestV28Migration,
  /4em[\s\S]*JPEG pixel ratios/i,
  'manifest v28 must record the dimensionless starter-indent authority',
)
assert.equal(
  Object.hasOwn(currentAuthority.closure.schemas, 'consumer-contract-v1'),
  false,
  'live authority must not retain the historical DOCX-capable Consumer Contract schema',
)
assert.equal(
  Object.hasOwn(currentAuthority.closure.schemas, 'consumer-contract-v2'),
  true,
  'live authority must bind the Screen/Print-only Consumer Contract schema',
)
assert.deepEqual(
  resolveConsumerContract({
    id: 'docx',
    version: '11',
    digest: 'sha256:retired-docx-contract',
  }),
  {
    ok: false,
    issues: [{
      code: 'CONSUMER_CONTRACT_UNAVAILABLE',
      message: 'Consumer Contract id, version, or digest is unknown',
    }],
  },
  'historical DOCX identities may remain parse-only in old authority but cannot resolve as live output authority',
)

const implementation = createExportImplementation({
  rootDir,
  exportDir: path.join(rootDir, '.scratch', 'ticket-17-unused'),
  getQuestionGroupDetail: () => null,
  buildPrintHtml: () => '',
})
assert.deepEqual(
  Object.keys(implementation).sort(),
  ['exportPrintHtml', 'exportPrintPdf', 'sendBinary', 'sendPdf'],
  'the export implementation must expose no generated-DOCX or converted-PDF compatibility entry point',
)

const consumerSchema = JSON.parse(read('schemas/paper-canonical/consumer-contract-v2.schema.json'))
assert.deepEqual(
  consumerSchema.properties.consumerId.enum,
  ['screen', 'print_pdf'],
  'Consumer Contract schema must express only supported output identities',
)

const apiSource = read('server/api.mjs')
const exportSource = read('server/exports/exportImplementation.mjs')
const verifyRegistry = read('scripts/verify-ci.mjs')
for (const [label, source] of [
  ['server API', apiSource],
  ['export implementation', exportSource],
]) {
  assert.doesNotMatch(
    source,
    /createDocxRenderer|buildDocumentXml|writeDocxPackage|convertDocxToPdf|exportDocx|sendDocx/,
    `${label} must not retain generated-DOCX implementation or adapters`,
  )
}
assert.doesNotMatch(
  verifyRegistry,
  /verify-h5g-docx-renderer|verify-paper-normalization-docx|verify-exam-export/,
  'CI must not retain generated-DOCX or OOXML gates',
)

const docxSource = {
  fileName: 'source.docx',
  buffer: Buffer.concat([
    Buffer.from('PK'),
    Buffer.from([0x03, 0x04]),
    Buffer.from('ticket-17-source-input'),
  ]),
}
const inputReport = validatePaperImportPackage([docxSource])
assert.deepEqual(
  inputReport.acceptedFiles,
  [{ fileName: 'source.docx', size: docxSource.buffer.length, kind: 'docx' }],
  'public import validator must continue to admit DOCX source files',
)
assert.equal(
  inputReport.blockingIssues.some((issue) => (
    issue.code === 'package.rejectedFileType'
    || issue.code === 'package.docxCount'
    || issue.code === 'docx.invalidMagic'
  )),
  false,
  'public import validator must continue to accept DOCX magic bytes',
)

for (const inputRegression of [
  'scripts/import-pipeline/verify-source-doc-types.mjs',
  'scripts/verify-docx-source-media-input.mjs',
  'scripts/verify-c7-paper-import-contracts.mjs',
  'scripts/verify-i2-seven-choices-ai-import.mjs',
  'scripts/verify-i3-cloze-ai-import.mjs',
  'scripts/verify-i4-grammar-fill-ai-import.mjs',
  'scripts/verify-i5-writing-ai-import.mjs',
]) {
  assert.match(
    verifyRegistry,
    new RegExp(inputRegression.replaceAll('.', '\\.')),
    `CI must retain the DOCX input regression ${inputRegression}`,
  )
}

for (const inputModule of [
  'server/paper-import/validator.mjs',
  'server/paper-import/docxSourceMedia.mjs',
  'server/paper-import-ai/docxSplitter.mjs',
  'server/paper-import/storage.mjs',
]) {
  assert.doesNotMatch(
    read(inputModule),
    /exports\/docxRenderer|exportImplementation/,
    `${inputModule} must not depend on deleted output implementation`,
  )
}

console.log('PASS: generated-DOCX output implementation and authority are deleted')
