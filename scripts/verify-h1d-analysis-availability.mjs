#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPaperSurfaceAnalysisAvailability } from '../server/search/paperSurfaceAvailability.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('H1-D verify: PaperSurface analysis availability owner')

const api = read('server/api.mjs')
const availabilitySource = read('server/search/paperSurfaceAvailability.mjs')
const paperImportRoutes = read('server/paper-import/paperImportRoutes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

assert('availability module exists and exports factory', /export function createPaperSurfaceAnalysisAvailability\(\{ paperAssetsDir/.test(availabilitySource))
assert('availability module owns cache variable', /let availabilityByGroupIdCache = null/.test(availabilitySource))
assert('availability module owns getByGroupId method', /function getByGroupId\(\)/.test(availabilitySource))
assert('availability module owns invalidate method', /function invalidate\(\)[\s\S]{0,80}availabilityByGroupIdCache = null/.test(availabilitySource))
assert('availability module builds paper-asset PaperSurface href', availabilitySource.includes("source: 'paper-asset'") && availabilitySource.includes("params.set('view', 'paper-intelligence')"))
assert('availability module checks reviewed analysis completeness', availabilitySource.includes('hasReviewedAnalysisForEveryQuestion') && (availabilitySource.includes('analysis?.questions?.[questionId]') || availabilitySource.includes('analysis?.[entryMapKey]?.[questionId]')))
assert('availability module keeps targetGroups guard', availabilitySource.includes('analysis.targetGroups.includes(groupId)'))
assert('availability module imports paper import read-path resolver', availabilitySource.includes("from '../paper-import/storage.mjs'"))

assert('api imports availability owner module', api.includes("from './search/paperSurfaceAvailability.mjs'"))
assert('api instantiates one availability owner', api.includes('const paperSurfaceAnalysisAvailability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir })'))
assert('api no longer owns availability cache variable', !api.includes('let paperSurfaceAnalysisAvailabilityByGroupIdCache = null'))
assert('api no longer owns PaperSurface href builder', !api.includes('function buildPaperSurfaceHref'))
assert('api getter delegates to availability owner', /function getPaperSurfaceAnalysisAvailabilityByGroupId\(\)[\s\S]{0,80}paperSurfaceAnalysisAvailability\.getByGroupId\(\)/.test(api))
assert('api invalidator delegates to availability owner', /function invalidatePaperSurfaceAnalysisAvailability\(\)[\s\S]{0,80}paperSurfaceAnalysisAvailability\.invalidate\(\)/.test(api))
assert('Paper Import routes still invalidate through context', paperImportRoutes.includes('context.invalidatePaperSurfaceAnalysisAvailability()'))
assert('Paper Import revalidate still reads through context', paperImportRoutes.includes('context.getPaperSurfaceAnalysisAvailabilityByGroupId().size'))

const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')
const availability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir, warn: () => {} })
const firstMap = availability.getByGroupId()
assert('fixture exposes Reading A analysis href', firstMap.get('group-2024-jslk-reading-a')?.href?.includes('group-2024-jslk-reading-a'))
assert('fixture exposes Reading B analysis href', firstMap.get('group-2024-jslk-reading-b')?.href?.includes('group-2024-jslk-reading-b'))
assert('fixture exposes Reading C analysis href', firstMap.get('group-2024-jslk-reading-c')?.href?.includes('group-2024-jslk-reading-c'))
assert('fixture exposes Reading D analysis href', firstMap.get('group-2024-jslk-reading-d')?.href?.includes('group-2024-jslk-reading-d'))
assert('fixture href points at paper-asset source', firstMap.get('group-2024-jslk-reading-a')?.href?.includes('source=paper-asset'))
assert('fixture href selects first group question', firstMap.get('group-2024-jslk-reading-a')?.href?.includes('questionId=q-2024-jslk-021'))
const cachedMap = availability.getByGroupId()
assert('availability getter returns cached map before invalidation', cachedMap === firstMap)
availability.invalidate()
const invalidatedMap = availability.getByGroupId()
assert('availability invalidation rebuilds cache map', invalidatedMap !== firstMap)
assert('availability rebuild preserves Reading A href', invalidatedMap.get('group-2024-jslk-reading-a')?.href === firstMap.get('group-2024-jslk-reading-a')?.href)

assert('verify-ci includes H1-D availability verify', verifyCi.includes('verify-h1d-analysis-availability.mjs'))
assert('scripts README documents H1-D availability verify', scriptsReadme.includes('verify-h1d-analysis-availability.mjs'))

if (failed > 0) {
  console.error(`\nH1-D analysis availability verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1-D analysis availability verify passed: ${passed} passed, 0 failed`)
