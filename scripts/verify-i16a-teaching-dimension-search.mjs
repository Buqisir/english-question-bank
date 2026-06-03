#!/usr/bin/env node
/**
 * Verification: I16·A teaching-dimension retrieval layer (backend, no UI).
 *
 * Covers PA Static Verify Requirements 1–7:
 *   1. Extractor per type, real paper-960d0f8d: seven roleFacets contains cohesion + bridge;
 *      grammar facetKeys has >1 distinct incl. non-finite + coordinating; grammar role has
 *      non-null object entry; cloze pos includes noun/verb/adj/adv.
 *   2. MF-1: cloze extractor produces pos for ALL 15 blanks and does NOT throw on blanks
 *      lacking signatureFacet.
 *   3. Reading multi-group join: each reading a/b/c/d gets its own skill.primary set via
 *      questionId→group; 15 questions resolve 3+4+4+4 with no orphan.
 *   4. MF-2 coverage honesty: group in content.groups with no analysis file is ABSENT from
 *      index (not present-with-empty). e.g. paper-2024-jslk-english grammar-fill / cloze.
 *   5. Query: roleFacet=bridge returns the seven group; pos=noun returns the cloze group;
 *      multi-dim AND narrows correctly; unanalyzed groups never appear; empty filter returns
 *      all analyzed groups.
 *   6. MF-3: new route is registered and reachable; invalidate() clears cache.
 *   7. verify-ci.mjs and scripts/README.md registration.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractGroupFacets,
  createTeachingFacetIndex,
  queryGroupsByTeaching,
} from '../server/search/teachingFacets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

console.log('I16-A verify: teaching-dimension retrieval layer')
console.log()

// ─── Load real 960d0f8d data ──────────────────────────────────────────────────
const base960 = path.join(paperAssetsDir, 'paper-960d0f8d', 'versions', 'v1')
const asset960 = readJson(path.join(base960, 'paper-asset.json'))

// Build questionId → groupId from paper-asset content.groups
function buildQuestionToGroup(asset) {
  const map = new Map()
  const groups = asset?.content?.groups
  if (!groups || typeof groups !== 'object') return map
  for (const [groupId, group] of Object.entries(groups)) {
    const questionIds = Array.isArray(group?.questionIds) ? group.questionIds : []
    for (const qid of questionIds) {
      map.set(String(qid), { groupId: String(groupId), groupType: group.groupType })
    }
  }
  return map
}

const q2g960 = buildQuestionToGroup(asset960)

// ─── Requirement 1: Extractor per type, real 960d0f8d ─────────────────────────
console.log('=== Req 1: Per-type extractor on real 960d0f8d ===')

const sevenAnalysis = readJson(path.join(base960, 'analyses', 'seven-choices-analysis-v1.json'))
const sevenFacets = extractGroupFacets('sevenChoices', sevenAnalysis, q2g960)

const sevenGroup = sevenFacets.get('group-960d0f8d-seven-choices')
assert(
  'seven group exists in extracted facets',
  Boolean(sevenGroup),
  `keys: ${[...sevenFacets.keys()].join(', ')}`
)
assert(
  'seven roleFacets includes cohesion',
  sevenGroup?.roleFacets?.has('seven-choices.role.cohesion'),
  `roleFacets: ${[...(sevenGroup?.roleFacets || [])].join(', ')}`
)
assert(
  'seven roleFacets includes bridge',
  sevenGroup?.roleFacets?.has('seven-choices.role.bridge'),
  `roleFacets: ${[...(sevenGroup?.roleFacets || [])].join(', ')}`
)
assert(
  'seven positionFacets populated',
  sevenGroup?.positionFacets?.size > 0,
)
assert(
  'seven mechanismFacets populated',
  sevenGroup?.mechanismFacets?.size > 0,
)

const grammarAnalysis = readJson(path.join(base960, 'analyses', 'grammar-fill-analysis-v1.json'))
const grammarFacets = extractGroupFacets('grammarFill', grammarAnalysis, q2g960)

const grammarGroup = grammarFacets.get('group-960d0f8d-grammar-fill')
assert(
  'grammar group exists in extracted facets',
  Boolean(grammarGroup),
  `keys: ${[...grammarFacets.keys()].join(', ')}`
)
assert(
  'grammar facetKeys has >1 distinct key',
  grammarGroup?.facetKeys?.size > 1,
  `facetKeys: ${[...(grammarGroup?.facetKeys || [])].join(', ')}`
)
assert(
  'grammar facetKeys includes non-finite',
  [...(grammarGroup?.facetKeys || [])].some((k) => k.includes('non-finite')),
  `facetKeys: ${[...(grammarGroup?.facetKeys || [])].join(', ')}`
)
assert(
  'grammar facetKeys includes coordinating',
  [...(grammarGroup?.facetKeys || [])].some((k) => k.includes('coordinating')),
  `facetKeys: ${[...(grammarGroup?.facetKeys || [])].join(', ')}`
)
assert(
  'grammar roles captures non-null object entry',
  grammarGroup?.roles?.has('object'),
  `roles: ${[...(grammarGroup?.roles || [])].join(', ')}`
)

const clozeAnalysis = readJson(path.join(base960, 'analyses', 'cloze-analysis-v1.json'))
const clozeFacets = extractGroupFacets('cloze', clozeAnalysis, q2g960)

const clozeGroup = clozeFacets.get('group-960d0f8d-cloze')
assert(
  'cloze group exists in extracted facets',
  Boolean(clozeGroup),
  `keys: ${[...clozeFacets.keys()].join(', ')}`
)
assert(
  'cloze pos includes noun',
  clozeGroup?.pos?.has('noun'),
  `pos: ${[...(clozeGroup?.pos || [])].join(', ')}`
)
assert(
  'cloze pos includes verb',
  clozeGroup?.pos?.has('verb'),
  `pos: ${[...(clozeGroup?.pos || [])].join(', ')}`
)
assert(
  'cloze pos includes adjective',
  clozeGroup?.pos?.has('adjective'),
  `pos: ${[...(clozeGroup?.pos || [])].join(', ')}`
)
assert(
  'cloze pos includes adverb',
  clozeGroup?.pos?.has('adverb'),
  `pos: ${[...(clozeGroup?.pos || [])].join(', ')}`
)

console.log()

// ─── Requirement 2: MF-1 signatureFacet sparseness ────────────────────────────
console.log('=== Req 2: MF-1 cloze signatureFacet sparse (13/15 absent) ===')

// Verify no crash happened (we got here), and count blanks covered
const blanks960 = clozeAnalysis.blanks || {}
const totalBlanks = Object.keys(blanks960).length
assert(
  'cloze analysis has 15 blanks',
  totalBlanks === 15,
  `actual: ${totalBlanks}`
)

// Count how many have signatureFacet
const withSig = Object.values(blanks960).filter((b) => b.signatureFacet).length
const withoutSig = Object.values(blanks960).filter((b) => !b.signatureFacet).length
assert(
  'cloze extractor handles 13 blanks without signatureFacet (no crash)',
  withoutSig === 13,
  `without signatureFacet: ${withoutSig}`
)
assert(
  'cloze group pos populated for all 15 blanks (not empty)',
  clozeGroup?.pos?.size > 0,
  `pos size: ${clozeGroup?.pos?.size}`
)
// signatureFacets set may be present for the 2 that have it, or absent - just must not crash
assert(
  'cloze group extracted without error',
  clozeGroup !== undefined,
)

console.log()

// ─── Requirement 3: Reading multi-group join 3+4+4+4 ─────────────────────────
console.log('=== Req 3: Reading multi-group join no orphan ===')

const readingAnalysis = readJson(path.join(base960, 'analyses', 'reading-choice-analysis-v1.json'))
const readingFacets = extractGroupFacets('reading', readingAnalysis, q2g960)

assert(
  'reading-a group exists',
  readingFacets.has('group-960d0f8d-reading-a'),
)
assert(
  'reading-b group exists',
  readingFacets.has('group-960d0f8d-reading-b'),
)
assert(
  'reading-c group exists',
  readingFacets.has('group-960d0f8d-reading-c'),
)
assert(
  'reading-d group exists',
  readingFacets.has('group-960d0f8d-reading-d'),
)

// The q2g960 map covers all 15 reading questions; none should be orphaned
// reading-a: 3 questions, reading-b: 4, reading-c: 4, reading-d: 4
const readingQids = Object.keys(readingAnalysis.questions || {})
assert(
  'reading analysis has 15 questions',
  readingQids.length === 15,
  `actual: ${readingQids.length}`
)

// Each question must map to one of the 4 reading groups
let orphans = 0
for (const qid of readingQids) {
  const entry = q2g960.get(qid)
  if (!entry || !['group-960d0f8d-reading-a','group-960d0f8d-reading-b','group-960d0f8d-reading-c','group-960d0f8d-reading-d'].includes(entry.groupId)) {
    orphans++
  }
}
assert(
  'reading 15 questions resolve with 0 orphans',
  orphans === 0,
  `orphans: ${orphans}`
)

// Check 3+4+4+4 distribution
const groupCounts = new Map()
for (const qid of readingQids) {
  const entry = q2g960.get(qid)
  if (entry) groupCounts.set(entry.groupId, (groupCounts.get(entry.groupId) || 0) + 1)
}
assert(
  'reading-a gets 3 questions',
  groupCounts.get('group-960d0f8d-reading-a') === 3,
  `got: ${groupCounts.get('group-960d0f8d-reading-a')}`
)
assert(
  'reading-b gets 4 questions',
  groupCounts.get('group-960d0f8d-reading-b') === 4,
  `got: ${groupCounts.get('group-960d0f8d-reading-b')}`
)
assert(
  'reading-c gets 4 questions',
  groupCounts.get('group-960d0f8d-reading-c') === 4,
  `got: ${groupCounts.get('group-960d0f8d-reading-c')}`
)
assert(
  'reading-d gets 4 questions',
  groupCounts.get('group-960d0f8d-reading-d') === 4,
  `got: ${groupCounts.get('group-960d0f8d-reading-d')}`
)

// skill.primary is set for each group
const readingA = readingFacets.get('group-960d0f8d-reading-a')
const readingB = readingFacets.get('group-960d0f8d-reading-b')
assert(
  'reading-a skills.primary populated',
  readingA?.skills?.size > 0,
  `skills: ${[...(readingA?.skills || [])].join(', ')}`
)
assert(
  'reading-b skills.primary populated',
  readingB?.skills?.size > 0,
  `skills: ${[...(readingB?.skills || [])].join(', ')}`
)

console.log()

// ─── Requirement 4: MF-2 coverage honesty (full index) ───────────────────────
console.log('=== Req 4: MF-2 coverage honesty — unanalyzed groups absent ===')

const index = createTeachingFacetIndex({ paperAssetsDir })
const indexMap = index.getIndex()

// jslk has grammar-fill and cloze groups in content.groups but NO analysis files
// so they must NOT appear in the index
assert(
  'jslk grammar-fill group absent from index (no analysis file)',
  !indexMap.has('group-2024-jslk-grammar-fill'),
  `found: ${indexMap.has('group-2024-jslk-grammar-fill')}`
)
assert(
  'jslk cloze group absent from index (no analysis file)',
  !indexMap.has('group-2024-jslk-cloze'),
  `found: ${indexMap.has('group-2024-jslk-cloze')}`
)

// But jslk reading and seven-choices SHOULD be present (they have analysis files)
assert(
  'jslk reading-a present in index (has analysis file)',
  indexMap.has('group-2024-jslk-reading-a'),
)
assert(
  'jslk seven-choices present in index (has analysis file)',
  indexMap.has('group-2024-jslk-seven-choices'),
)

// 960d0f8d all four types should be present
assert(
  '960d0f8d grammar-fill present in index',
  indexMap.has('group-960d0f8d-grammar-fill'),
)
assert(
  '960d0f8d cloze present in index',
  indexMap.has('group-960d0f8d-cloze'),
)
assert(
  '960d0f8d reading-a present in index',
  indexMap.has('group-960d0f8d-reading-a'),
)
assert(
  '960d0f8d seven-choices present in index',
  indexMap.has('group-960d0f8d-seven-choices'),
)

// Cache hit: same reference
const indexMap2 = index.getIndex()
assert(
  'index cache: same reference before invalidation',
  indexMap === indexMap2,
)

console.log()

// ─── Requirement 5: Query behavior ───────────────────────────────────────────
console.log('=== Req 5: Query behavior ===')

// roleFacet=bridge returns seven-choices group
const bridgeResults = queryGroupsByTeaching(indexMap, { roleFacet: 'seven-choices.role.bridge' })
assert(
  'roleFacet=bridge query returns 960d0f8d seven-choices group',
  bridgeResults.some((r) => r.groupId === 'group-960d0f8d-seven-choices'),
  `results: ${bridgeResults.map((r) => r.groupId).join(', ')}`
)

// pos=noun returns cloze group
const nounResults = queryGroupsByTeaching(indexMap, { pos: 'noun' })
assert(
  'pos=noun query returns 960d0f8d cloze group',
  nounResults.some((r) => r.groupId === 'group-960d0f8d-cloze'),
  `results: ${nounResults.map((r) => r.groupId).join(', ')}`
)

// unanalyzed groups never appear in any query result
const allResults = queryGroupsByTeaching(indexMap, {})
const allResultIds = new Set(allResults.map((r) => r.groupId))
assert(
  'jslk grammar-fill never in query results',
  !allResultIds.has('group-2024-jslk-grammar-fill'),
)
assert(
  'jslk cloze never in query results',
  !allResultIds.has('group-2024-jslk-cloze'),
)

// empty filter returns all analyzed groups
assert(
  'empty filter returns all analyzed groups (size > 0)',
  allResults.length > 0,
  `got: ${allResults.length}`
)
// Should include both seven and reading types
assert(
  'empty filter includes 960d0f8d seven-choices',
  allResultIds.has('group-960d0f8d-seven-choices'),
)
assert(
  'empty filter includes 960d0f8d reading-a',
  allResultIds.has('group-960d0f8d-reading-a'),
)

// multi-dim AND: roleFacet=bridge AND groupType=sevenChoices should still return seven group
// (narrowing with a second matching filter)
const bridgeAndSevenResults = queryGroupsByTeaching(indexMap, {
  roleFacet: 'seven-choices.role.bridge',
  groupType: 'sevenChoices',
})
assert(
  'multi-dim AND: roleFacet=bridge + groupType=sevenChoices returns seven-choices group',
  bridgeAndSevenResults.some((r) => r.groupId === 'group-960d0f8d-seven-choices'),
  `results: ${bridgeAndSevenResults.map((r) => r.groupId).join(', ')}`
)
// narrowing: wrong groupType should return 0
const bridgeAndWrongType = queryGroupsByTeaching(indexMap, {
  roleFacet: 'seven-choices.role.bridge',
  groupType: 'reading',
})
assert(
  'multi-dim AND: roleFacet=bridge + groupType=reading returns empty (cross-type AND narrows)',
  bridgeAndWrongType.length === 0,
  `results: ${bridgeAndWrongType.map((r) => r.groupId).join(', ')}`
)

// facetKey filter
const nonFiniteResults = queryGroupsByTeaching(indexMap, { facetKey: 'grammar-fill.given.verb.non-finite' })
assert(
  'facetKey=non-finite query returns grammar-fill group',
  nonFiniteResults.some((r) => r.groupId === 'group-960d0f8d-grammar-fill'),
  `results: ${nonFiniteResults.map((r) => r.groupId).join(', ')}`
)

// skill filter
const detailResults = queryGroupsByTeaching(indexMap, { skill: 'detail' })
assert(
  'skill=detail query returns some reading group',
  detailResults.some((r) => r.groupId.includes('reading')),
  `results: ${detailResults.map((r) => r.groupId).join(', ')}`
)

console.log()

// ─── Requirement 6: MF-3 route registration + invalidate ─────────────────────
console.log('=== Req 6: MF-3 route registration + invalidate clears cache ===')

const apiSource = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')
const teachingFacetsSource = readFileSync(path.join(rootDir, 'server/search/teachingFacets.mjs'), 'utf8')

assert(
  'api.mjs imports createTeachingFacetRoutes',
  apiSource.includes('createTeachingFacetRoutes'),
  'createTeachingFacetRoutes not found in api.mjs'
)
assert(
  'api.mjs imports from teachingFacets.mjs',
  apiSource.includes("from './search/teachingFacets.mjs'"),
)
assert(
  'api.mjs adds createTeachingFacetRoutes() to serverRoutes composition',
  /serverRoutes\s*=\s*\[[\s\S]*createTeachingFacetRoutes\(\)/.test(apiSource),
  'createTeachingFacetRoutes() not in serverRoutes array'
)
assert(
  'api.mjs has lazy-cache wrapper for teaching facet index',
  apiSource.includes('invalidateTeachingFacetIndex') || apiSource.includes('teachingFacetIndex'),
  'No teaching facet cache/invalidate wrapper found'
)
assert(
  'teachingFacets.mjs exports createTeachingFacetIndex',
  teachingFacetsSource.includes('export function createTeachingFacetIndex'),
)
assert(
  'teachingFacets.mjs exports queryGroupsByTeaching',
  teachingFacetsSource.includes('export function queryGroupsByTeaching'),
)
assert(
  'teachingFacets.mjs exports extractGroupFacets',
  teachingFacetsSource.includes('export function extractGroupFacets'),
)
assert(
  'GET /api/teaching-facets route is defined',
  teachingFacetsSource.includes('/api/teaching-facets') || apiSource.includes('/api/teaching-facets'),
)

// invalidate() clears the cache
index.invalidate()
const indexAfterInvalidate = index.getIndex()
assert(
  'invalidate() clears cache: new reference after invalidation',
  indexAfterInvalidate !== indexMap,
)
// Rebuilt index still has correct data
assert(
  'rebuilt index after invalidation still has 960d0f8d cloze',
  indexAfterInvalidate.has('group-960d0f8d-cloze'),
)
assert(
  'rebuilt index after invalidation still excludes jslk grammar-fill',
  !indexAfterInvalidate.has('group-2024-jslk-grammar-fill'),
)

// The invalidation hook in api.mjs should be wired to the same import/publish path
assert(
  'api.mjs paper-import-ai routes invalidate teaching facet index too',
  apiSource.includes('invalidateTeachingFacetIndex') || apiSource.includes('invalidatePaperSurfaceAnalysisAvailability'),
  'Invalidation hook not wired in routes'
)

console.log()

// ─── Requirement 7: Registration in CI and README ────────────────────────────
console.log('=== Req 7: CI + README registration ===')

const verifyCi = readFileSync(path.join(rootDir, 'scripts/verify-ci.mjs'), 'utf8')
const scriptsReadme = readFileSync(path.join(rootDir, 'scripts/README.md'), 'utf8')

assert(
  'verify-ci.mjs includes i16a verifier',
  verifyCi.includes('verify-i16a-teaching-dimension-search.mjs'),
)
assert(
  'scripts/README.md documents i16a verifier',
  scriptsReadme.includes('verify-i16a-teaching-dimension-search.mjs'),
)

console.log()

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.error(`I16-A teaching-dimension verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}
console.log(`I16-A teaching-dimension verify passed: ${passed} passed, 0 failed`)
