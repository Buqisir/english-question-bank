/**
 * verify-source-doc-types.mjs
 *
 * Behavior assertion for C9 (docs/cuts/nck1-import-runbook/plan.md, 2026-07-08
 * revision): validatePaperImportPackage() must accept exactly 1 source
 * document of type .docx (PK magic) OR .pdf (%PDF magic), and must reject a
 * .pdf whose magic bytes are forged/corrupted. Imports the real validator
 * module (no mocking) — this is a unit-level check, independent of any
 * paperId's groups.json, so it does not require a staged paper.
 *
 * Usage: node scripts/import-pipeline/verify-source-doc-types.mjs
 * Exit: 0 all green, 1 any FAIL.
 */

import { validatePaperImportPackage } from '../../server/paper-import/validator.mjs'

const results = []
function check(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
}
function fail(msg) {
  throw new Error(msg)
}

function hasCode(blockingIssues, code) {
  return blockingIssues.some((issue) => issue.code === code)
}

// A minimal valid-magic DOCX buffer (real docx is a PK/ZIP container; only the
// magic bytes matter to classifyFile's magic check, not full zip validity).
const fakeDocxBuffer = Buffer.concat([Buffer.from('PK'), Buffer.from([0x03, 0x04]), Buffer.from('not a real zip but has PK magic')])
// A minimal valid-magic PDF buffer.
const fakePdfBuffer = Buffer.from('%PDF-1.4\n%fake pdf body for magic-byte check only\n')
// A .pdf-named file whose magic bytes are corrupted (forged).
const forgedPdfBuffer = Buffer.from('this is not a pdf at all, no magic header')

check('H1 docx source (.docx, PK magic): accepted as source doc (no rejectedFileType/docxCount/invalidMagic for it)', () => {
  const report = validatePaperImportPackage([{ fileName: 'source.docx', buffer: fakeDocxBuffer }])
  if (hasCode(report.blockingIssues, 'package.rejectedFileType')) fail('source.docx was rejected by file-type classification')
  if (hasCode(report.blockingIssues, 'package.docxCount')) fail('source.docx was not recognized as the 1 required source doc')
  if (hasCode(report.blockingIssues, 'docx.invalidMagic')) fail('source.docx with valid PK magic was flagged invalidMagic')
})

check('H2 pdf source (.pdf, %PDF magic): accepted as source doc (no rejectedFileType/docxCount/invalidMagic for it)', () => {
  const report = validatePaperImportPackage([{ fileName: 'source.pdf', buffer: fakePdfBuffer }])
  if (hasCode(report.blockingIssues, 'package.rejectedFileType')) fail('source.pdf was rejected by file-type classification')
  if (hasCode(report.blockingIssues, 'package.docxCount')) fail('source.pdf was not recognized as the 1 required source doc')
  if (hasCode(report.blockingIssues, 'docx.invalidMagic')) fail('source.pdf with valid %PDF magic was flagged invalidMagic')
})

check('H3 forged pdf source (.pdf, corrupted magic): rejected with docx.invalidMagic', () => {
  const report = validatePaperImportPackage([{ fileName: 'source.pdf', buffer: forgedPdfBuffer }])
  if (!hasCode(report.blockingIssues, 'docx.invalidMagic')) fail('forged .pdf (bad %PDF magic) was NOT rejected — expected docx.invalidMagic blocking issue')
  if (report.ok) fail('forged .pdf source should not validate ok')
})

// ---- Report ----
console.log(`\n======= verify-source-doc-types =======`)
let failCount = 0
for (const r of results) {
  console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) failCount += 1
}
console.log(`\n${results.length - failCount}/${results.length} checks passed.`)
if (failCount > 0) {
  console.error(`\nFAIL: ${failCount} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll green.')
