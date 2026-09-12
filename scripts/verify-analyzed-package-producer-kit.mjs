#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeAnalyzedPackageProducerKit } from '../server/paper-import/analyzedPackageProducerKit.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'eqb-producer-kit-'))
const paperId = 'paper-mock-contract-2026-m1'

function runValidator(kit, packagePath, pathEnvironment = process.env.PATH) {
  return spawnSync(process.execPath, [
    'validate.mjs', packagePath, '--paper-id', paperId,
  ], {
    cwd: kit,
    env: {
      HOME: temporary,
      NODE_PATH: '',
      PATH: pathEnvironment,
    },
    encoding: 'utf8',
  })
}

try {
  const kit = path.join(temporary, 'kit')
  const fixtureRoot = path.join(temporary, 'fixture-root')
  const packageRoot = path.join(temporary, 'complete-package')
  writeAnalyzedPackageProducerKit(kit)
  mkdirSync(fixtureRoot)

  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  const {
    makeExternalAnalyzedPackage,
    makeReviewRoot,
  } = await import('./verify-universal-nck1-publish.mjs')
  const fixture = makeReviewRoot(fixtureRoot, paperId, undefined, { listening: true })
  makeExternalAnalyzedPackage(fixture.reviewRoot, packageRoot)

  const manifest = JSON.parse(readFileSync(path.join(kit, 'KIT.json'), 'utf8'))
  const closure = JSON.parse(readFileSync(path.join(kit, 'BUNDLE-CLOSURE.json'), 'utf8'))
  assert.equal(manifest.validationCommand,
    'node validate.mjs <package-directory-or.zip> --paper-id paper-…')
  assert(closure.inputs.length > 0)
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(kit, file.path))
    assert.equal(bytes.byteLength, file.byteLength, `${file.path} byte length`)
    assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      file.sha256, `${file.path} digest`)
  }
  assert.equal(
    manifest.closureSha256,
    manifest.files.find(({ path: filePath }) => filePath === 'BUNDLE-CLOSURE.json').sha256,
  )
  assert(closure.externalImports.every((specifier) => specifier.startsWith('node:')),
    'the installed runtime must have no external npm or repository imports')
  assert.doesNotMatch(
    readFileSync(path.join(kit, 'runtime/server/paper-import/analyzedPackage.mjs'), 'utf8'),
    new RegExp(repositoryRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the installed runtime must not retain an absolute checkout path',
  )

  const missingPrerequisite = runValidator(kit, packageRoot, '/nonexistent')
  assert.notEqual(missingPrerequisite.status, 0)
  assert.deepEqual(
    (({ stage, code }) => ({ stage, code }))(JSON.parse(missingPrerequisite.stderr)),
    { stage: 'prerequisite', code: 'KIT_PREREQUISITE_MISSING' },
  )

  const validDirectory = runValidator(kit, packageRoot)
  assert.equal(validDirectory.status, 0, validDirectory.stderr)
  assert.equal(JSON.parse(validDirectory.stdout).stage, 'complete-admission')

  const archivePath = path.join(temporary, 'complete-package.zip')
  execFileSync('python3', [
    '-B',
    path.join(kit, 'runtime/scripts/import-pipeline/analyzed-package-archive.py'),
    '--create-from', packageRoot, archivePath,
  ])
  const validArchive = runValidator(kit, archivePath)
  assert.equal(validArchive.status, 0, validArchive.stderr)
  assert.equal(JSON.parse(validArchive.stdout).stage, 'complete-admission')

  const brokenAnswer = path.join(temporary, 'broken-answer')
  cpSync(packageRoot, brokenAnswer, { recursive: true })
  const officialPath = path.join(brokenAnswer, 'official-answers.json')
  const official = JSON.parse(readFileSync(officialPath, 'utf8'))
  official.answers[0].value = official.answers[0].value === 'A' ? 'B' : 'A'
  writeFileSync(officialPath, JSON.stringify(official))
  const rejectedAnswer = runValidator(kit, brokenAnswer)
  assert.notEqual(rejectedAnswer.status, 0)
  assert.equal(JSON.parse(rejectedAnswer.stderr).code, 'ANALYZED_PACKAGE_POINTER_UNRELATED')

  const missingAnnex = path.join(temporary, 'missing-annex')
  cpSync(packageRoot, missingAnnex, { recursive: true })
  rmSync(path.join(missingAnnex, 'analysis-reading-a.json'))
  const rejectedAnnex = runValidator(kit, missingAnnex)
  assert.notEqual(rejectedAnnex.status, 0)
  assert.match(JSON.parse(rejectedAnnex.stderr).message, /File not found: analysis-reading-a\.json/)

  console.log('verify-analyzed-package-producer-kit: PASS (isolated offline bundle, directory/ZIP complete admission, official-answer and missing-annex rejection)')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
