#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  assertAnalyzedPackageIntroductionCompatibility,
  loadAnalyzedPackageFiles,
} from '../server/paper-import/analyzedPackage.mjs'
import { compareAnalyzedPackageSemantics } from '../server/paper-import/analyzedPackageExport.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-analyzed-package-errors-'))
try {
  writeFileSync(path.join(root, 'package.json'), '{}')
  assert.throws(() => loadAnalyzedPackageFiles(root), (error) =>
    error.code === 'ANALYZED_PACKAGE_EXPECTED_PAPER_REQUIRED')

  writeFileSync(path.join(root, 'package.json'), '{"schemaVersion":"eqb-analyzed-package-v1","schemaVersion":"eqb-analyzed-package-v1"}')
  assert.throws(() => loadAnalyzedPackageFiles(root, {
    expectedPaperId: 'paper-analyzed-package-errors',
  }), (error) => error.code === 'ANALYZED_PACKAGE_JSON_INVALID')

  writeFileSync(path.join(root, 'package.json'), '{}')
  mkdirSync(path.join(root, 'members'))
  symlinkSync(path.join(root, 'package.json'), path.join(root, 'members/content.json'))
  assert.throws(() => loadAnalyzedPackageFiles(root, {
    expectedPaperId: 'paper-analyzed-package-errors',
  }), /Symbolic links are not allowed/)

  assert.doesNotThrow(() => assertAnalyzedPackageIntroductionCompatibility('cloze', {
    groups: { 'group-cloze': { overview: '同一篇章简介', similaritySummary: '同一篇章简介' } },
  }))
  assert.throws(() => assertAnalyzedPackageIntroductionCompatibility('cloze', {
    groups: { 'group-cloze': { overview: '当前篇章简介', similaritySummary: '冲突的旧检索简介' } },
  }), (error) => error.code === 'ANALYZED_PACKAGE_INTRODUCTION_CONFLICT'
    && error.path === 'analysis.cloze.groups.group-cloze.similaritySummary')

  const semanticFixture = (sourceAssetVersion, overview = 'retained') => ({
    manifest: { paperId: 'paper-semantic', profileId: 'nck1', files: [{
      memberId: 'analysis-reading-a', role: 'analysis', analysisKey: 'reading-a',
    }] },
    members: [{
      memberId: 'analysis-reading-a', role: 'analysis', analysisKey: 'reading-a',
      mediaType: 'application/json',
      bytes: new TextEncoder().encode(JSON.stringify({ sourceAssetVersion, groups: { g: { overview } } })),
    }],
  })
  const versionOnly = compareAnalyzedPackageSemantics(semanticFixture(1), semanticFixture(9))
  assert.equal(versionOnly.equal, true)
  assert.notDeepEqual(versionOnly.sourceAssetVersionDifferences, [])
  assert.equal(compareAnalyzedPackageSemantics(
    semanticFixture(1), semanticFixture(1, 'changed retained field'),
  ).equal, false)

  console.log('verify-analyzed-package: PASS (strict JSON, explicit target, unsafe filesystem, introduction conflict, and semantic/version difference classification)')
  console.log('NOTE complete content/analysis/Review acceptance is exercised by verify-universal-nck1-publish')
} finally {
  rmSync(root, { recursive: true, force: true })
}
