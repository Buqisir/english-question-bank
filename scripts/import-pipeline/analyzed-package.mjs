#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { prepareNck1AnalyzedPackageReview } from '../../server/paper-import/analyzedPackage.mjs'
import { exportAnalyzedPackageRevision } from '../../server/paper-import/analyzedPackageExport.mjs'
import { writeAnalyzedPackageProducerKit } from '../../server/paper-import/analyzedPackageProducerKit.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] || null
}

async function main() {
  const command = process.argv[2]
  if (command === 'kit' && process.argv[3]) {
    const result = writeAnalyzedPackageProducerKit(path.resolve(process.argv[3]))
    console.log(JSON.stringify({ ok: true, stage: 'producer-kit', destination: path.resolve(process.argv[3]), ...result }, null, 2))
    return
  }
  if (command === 'export' && option('--revision-id') && option('--paper-id')
    && option('--review-db') && option('--files-root') && option('--output')) {
    const result = await exportAnalyzedPackageRevision({
      dbPath: path.resolve(option('--review-db')),
      filesRoot: path.resolve(option('--files-root')),
      revisionId: option('--revision-id'),
      expectedPaperId: option('--paper-id'),
      destination: path.resolve(option('--output')),
      includeOriginalAttachments: process.argv.includes('--include-original-attachments'),
    })
    console.log(JSON.stringify({ ok: true, stage: 'export', destination: path.resolve(option('--output')), ...result }, null, 2))
    return
  }
  if (command !== 'validate' || !process.argv[3] || !option('--paper-id')) {
    throw new Error([
      'Usage:',
      '  analyzed-package.mjs validate <package-directory-or-zip> --paper-id paper-…',
      '  analyzed-package.mjs export --review-db <db> --files-root <dir> --revision-id rev-… --paper-id paper-… --output <dir-or.zip> [--include-original-attachments]',
      '  analyzed-package.mjs kit <empty-destination-directory>',
    ].join('\n'))
  }
  const temporary = mkdtempSync(path.join(tmpdir(), 'eqb-analyzed-package-validation-'))
  try {
    const result = await prepareNck1AnalyzedPackageReview({
      sourcePath: path.resolve(process.argv[3]),
      destinationDir: path.join(temporary, 'review'),
      expectedPaperId: option('--paper-id'),
    })
    console.log(JSON.stringify({ ok: true, stage: 'content', ...result }, null, 2))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    stage: 'content',
    code: error.code || 'ANALYZED_PACKAGE_INVALID',
    path: error.path || '$',
    message: error.message,
  }, null, 2))
  process.exitCode = 1
})
