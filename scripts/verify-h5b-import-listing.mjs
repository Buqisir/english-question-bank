#!/usr/bin/env node
// H5-B — import file/bundle/batch LISTING + directory-scan implementation.
// Runtime proof that createImportListingImplementation constructs and runs with injected
// deps (catches factory wiring / injection / TDZ bugs that node --check + the app build miss),
// plus the extraction-seam assertions. Byte-identity of the moved bodies is proven separately
// by diff vs main; the function logic itself is unchanged, so a working smoke run == behavior preserved.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createImportListingImplementation } from '../server/imports/importListing.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-B import listing')

// --- temp DB seeded from the real schema ---
const tmp = mkdtempSync(path.join(tmpdir(), 'h5b-import-listing-'))
const dbPath = path.join(tmp, 'qb.sqlite')
try {
  const seed = new DatabaseSync(dbPath)
  seed.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  // two files in the same bundle (to exercise grouping) + one parse row
  seed.exec(`
    INSERT INTO import_files (id, original_name, stored_path, file_type, content_role, bundle_id, bundle_title, status)
    VALUES ('f1', '2024甲卷.docx', '/x/f1.docx', 'docx', 'question', 'b1', '2024甲卷', 'imported'),
           ('f2', '2024甲卷答案.docx', '/x/f2.docx', 'docx', 'answer_analysis', 'b1', '2024甲卷', 'imported');
    INSERT INTO import_file_texts (id, import_file_id, parser, extracted_text, line_count, char_count, status)
    VALUES ('t1', 'f1', 'mammoth', 'hello world', 3, 11, 'succeeded');
    INSERT INTO import_batches (id, title, directory_path, recursive, content_role, status, file_count, supported_count)
    VALUES ('batch1', '批量1', '/some/dir', 1, 'question_with_analysis', 'scanned', 2, 2);
    INSERT INTO import_batch_items (id, batch_id, file_name, file_path, file_type, status)
    VALUES ('bi1', 'batch1', 'a.docx', '/some/dir/a.docx', 'docx', 'queued'),
           ('bi2', 'batch1', 'b.pdf', '/some/dir/b.pdf', 'pdf', 'queued');
  `)
  seed.close()

  // --- inject deps (real behavior for those that matter; trivial doubles for the rest) ---
  const impl = createImportListingImplementation({
    openDatabase: () => new DatabaseSync(dbPath),
    requiredString: (v, l) => { if (typeof v !== 'string' || !v.trim()) throw new Error(`${l} required`); return v.trim() },
    optionalString: (v) => (typeof v === 'string' ? v.trim() : ''),
    requiredEnum: (v, allowed, l) => { if (!allowed.includes(v)) throw new Error(`${l} invalid`); return v },
    randomUUID,
    sanitizeFileName: (n) => String(n || ''),
    inferImportFileType: (n) => (String(n).endsWith('.docx') ? 'docx' : String(n).endsWith('.pdf') ? 'pdf' : 'other'),
    normalizeExamTitle: (s) => String(s || ''),
    extractDeclaredExamTitleFromText: () => '',
  })

  verifier.section('Runtime: listing functions construct + run with injected deps')
  const files = impl.listImportFiles()
  verifier.assert(files.length === 2, `listImportFiles returns 2 rows (got ${files.length})`)
  verifier.assert(files.some((f) => f.originalName === '2024甲卷.docx' && f.fileType === 'docx'), 'listImportFiles maps row -> card shape')
  verifier.assert(files.some((f) => f.parse && f.parse.lineCount === 3), 'listImportFiles joins parse row')

  const bundles = impl.listImportBundles()
  verifier.assert(bundles.length === 1, `listImportBundles groups 2 files into 1 bundle (got ${bundles.length})`)
  verifier.assert(bundles[0].fileCount === 2, 'bundle fileCount = 2')
  verifier.assert(bundles[0].readiness === 'paired_files_ready', `bundle readiness derived (got ${bundles[0].readiness})`)

  const batches = impl.listImportBatches()
  verifier.assert(batches.length === 1 && batches[0].items.length === 2, 'listImportBatches returns batch with 2 items')

  const handle = new DatabaseSync(dbPath)
  const batch = impl.getImportBatch(handle, 'batch1')
  verifier.assert(batch && batch.id === 'batch1' && batch.items.length === 2, 'getImportBatch returns batch + items')
  impl.updateImportBatchStats(handle, 'batch1')
  const after = impl.getImportBatch(handle, 'batch1')
  verifier.assert(after && typeof after.fileCount === 'number', 'updateImportBatchStats runs without error')
  handle.close()

  verifier.assert(typeof impl.rowToImportFileParse({ id: 'p', import_file_id: 'f1', status: 'succeeded' }).importFileId === 'string', 'rowToImportFileParse maps parse row')

  verifier.section('Runtime: scanImportDirectory walks a real directory')
  const scanDir = path.join(tmp, 'scan')
  mkdirSync(scanDir)
  writeFileSync(path.join(scanDir, 'paper.docx'), 'x')
  writeFileSync(path.join(scanDir, 'ignore.txt'), 'x')
  const scanned = impl.scanImportDirectory({ directoryPath: scanDir, recursive: false, contentRole: 'question_with_analysis' })
  verifier.assert(scanned && scanned.status === 'scanned', 'scanImportDirectory returns a scanned batch')
  verifier.assert(scanned.items.length === 1 && scanned.items[0].fileType === 'docx', 'scanImportDirectory picks the .docx, skips .txt')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/imports/importListing.mjs')

const moved = [
  'rowToImportFile', 'rowToImportFileParse', 'listImportFiles', 'deriveImportBundleReadiness',
  'buildImportBundleQualityWarnings', 'buildImportBundle', 'listImportBundles', 'rowToImportBatchItem',
  'rowToImportBatch', 'listImportBatches', 'expandLocalPath', 'inferBatchBundleTitle',
  'inferBatchContentRole', 'collectImportBatchFiles', 'updateImportBatchStats', 'getImportBatch', 'scanImportDirectory',
]
for (const name of moved) {
  verifier.assert(!new RegExp(`^function ${name}\\(`, 'm').test(apiSource), `api.mjs no longer defines ${name}`)
  verifier.assert(new RegExp(`^  function ${name}\\(`, 'm').test(moduleSource), `module owns ${name}`)
}
const stayBehind = ['normalizeTags', 'normalizeExamTitle', 'extractDeclaredExamTitleFromText', 'buildDraftSourceQualityWarnings']
for (const name of stayBehind) {
  verifier.assert(new RegExp(`^function ${name}\\(`, 'm').test(apiSource), `api.mjs keeps ${name} (not in scope / shared with import-draft)`)
}
verifier.assert(apiSource.includes("from './imports/importListing.mjs'"), 'api.mjs imports the listing module')
verifier.assert(apiSource.includes('createImportListingImplementation({'), 'api.mjs instantiates the factory')
verifier.assert(/const \{\n\s*listImportFiles,/.test(apiSource), 'api.mjs destructures the public listing functions')
verifier.assert(!/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs (no cycle)')

verifier.summary()
