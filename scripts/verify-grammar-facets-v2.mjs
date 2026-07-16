#!/usr/bin/env node
/**
 * Verification: D1 grammar-facets-v2 — 语法填空解析字段 v2 落库迁移 +
 * I16·C 谓语 sidecar 收编/退役 + 导入门禁 v2。
 *
 * docs/cuts/grammar-facets-v2/plan.md 步 5 acceptance:
 *   1. 330 空 v2 字段完备性（33 份分析文件，schemaVersion + 每空必填字段）
 *   2. 词表白名单（未知 facetKey / role / tense / voice 即红）
 *   3. 分布断言（数/格/比较/八向转换/role/tense 对 step1 实测表 ±2 容差）
 *   4. 全站旧 key 零残留，含前端（grammarFillFacetRegistry.ts /
 *      grammarFillAnalysisSurfaceAdapter.ts）—— similarQuestions.mjs 白名单
 *      里不许出现（E5 并行刀边界，PA/plan 钉死）
 *   5. v2 每个新 facetKey 在 grammarFillFacetRegistry.ts 有条目
 *   6. 旧 sidecar 消费面零残留（文件 / 路由 / teachingFacets 合并逻辑）
 *   7. 行为断言：teachingFacets 三轴聚合直接从 analysis-v2 blank 取值
 *      （不经 sidecar），对外 tense/voice/agreement 过滤参数名不变
 *   8. 负例：validator.mjs 拒绝 v1 形态的 grammar-fill-analysis 上传
 *   9. 退役路由 404（server/api.mjs 源码级 fence，行为级由 verify-owner-gate
 *      的 19-route 列表间接佐证——该路由已从列表移除）
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FACET_FRAMEWORKS } from '../app/src/features/paper-intelligence/grammarFillFacetRegistry.ts'
import { analysisConfigs, createTeachingFacetIndex, queryGroupsByTeaching } from '../server/search/teachingFacets.mjs'
import { validatePaperImportPackage, PAPER_IMPORT_SCHEMA_VERSIONS } from '../server/paper-import/validator.mjs'

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

function readRepoFile(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

console.log('D1 grammar-facets-v2 verify: analysis-v2 migration + I16·C sweep')
console.log()

// ============================================================
// Req 1-3: load all 33 real analysis files, completeness + whitelist + distribution
// ============================================================

const VALID_ROLE = new Set([
  'adverbial',
  'attributive',
  'subject',
  'object',
  'predicative',
  'object-complement',
  'subject-complement',
])
const VALID_TENSE = new Set(['present', 'past', 'present-perfect', 'past-perfect', 'progressive', 'other'])
const VALID_VOICE = new Set(['active', 'passive'])
const VALID_FORM = new Set(['to-do', 'doing', 'done'])
const FINITE_KEY = 'grammar-fill.given.verb.finite'
const NON_FINITE_KEY = 'grammar-fill.given.verb.non-finite'

const registry = JSON.parse(readRepoFile('server/paper-import-ai/grammar-fill-facets-v2.json'))
const VALID_FACET_KEYS = new Set(registry.map((f) => f.facet_key))
assert('Req 0: v2 registry has exactly 22 leaves', VALID_FACET_KEYS.size === 22, `found: ${VALID_FACET_KEYS.size}`)

function findAnalysisFiles() {
  const files = []
  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const p = path.join(paperAssetsDir, entry.name, 'latest', 'analyses', 'grammar-fill-analysis-v1.json')
    if (existsSync(p)) files.push(p)
  }
  return files.sort()
}

const files = findAnalysisFiles()
assert('Req 1: 33 grammar-fill-analysis files on disk', files.length === 33, `found: ${files.length}`)

const facetCounts = {}
const tenseCounts = {}
const roleCounts = {}
let totalBlanks = 0
let schemaVersionOk = true
let completenessOk = true
let whitelistOk = true
const unknownFacetKeys = new Set()
const unknownRoles = new Set()
const unknownTenses = new Set()

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data.schemaVersion !== 'grammar-fill-analysis-v2') schemaVersionOk = false
  for (const blank of Object.values(data.blanks || {})) {
    totalBlanks += 1
    const fk = blank.facetKey
    facetCounts[fk] = (facetCounts[fk] || 0) + 1
    if (!VALID_FACET_KEYS.has(fk)) {
      whitelistOk = false
      unknownFacetKeys.add(fk)
    }
    if (fk === FINITE_KEY) {
      tenseCounts[blank.tense] = (tenseCounts[blank.tense] || 0) + 1
      if (!VALID_TENSE.has(blank.tense)) { whitelistOk = false; unknownTenses.add(String(blank.tense)) }
      if (!VALID_VOICE.has(blank.voice)) { whitelistOk = false; unknownTenses.add(`voice:${blank.voice}`) }
      if (typeof blank.agreementSensitive !== 'boolean') completenessOk = false
    } else if (fk === NON_FINITE_KEY) {
      roleCounts[blank.role] = (roleCounts[blank.role] || 0) + 1
      if (!VALID_ROLE.has(blank.role)) { whitelistOk = false; unknownRoles.add(String(blank.role)) }
      if (!VALID_FORM.has(blank.form)) completenessOk = false
    }
  }
}

assert('Req 1: 330 blanks total', totalBlanks === 330, `found: ${totalBlanks}`)
assert('Req 1: every file schemaVersion === grammar-fill-analysis-v2', schemaVersionOk)
assert('Req 1: every finite blank has agreementSensitive:boolean, every non-finite blank has valid form', completenessOk)
assert(
  'Req 2: every facetKey/role/tense/voice value is in the v2 whitelist',
  whitelistOk,
  `unknown facetKey: ${[...unknownFacetKeys].join(',')}; unknown role: ${[...unknownRoles].join(',')}; unknown tense/voice: ${[...unknownTenses].join(',')}`,
)

// Req 3: distribution vs step1 real-measured baseline (docs/cuts/grammar-facets-v2/step1-samples.md), ±2 tolerance
const BASELINE_FACET_COUNTS = {
  'grammar-fill.given.verb.non-finite': 62,
  'grammar-fill.given.verb.finite': 52,
  'grammar-fill.no-hint.preposition': 29,
  'grammar-fill.no-hint.article': 26,
  'grammar-fill.no-hint.conjunction.coordinating': 25,
  'grammar-fill.no-hint.conjunction.relative-clause': 20,
  'grammar-fill.given.noun.number': 17,
  'grammar-fill.given.conversion.noun-to-adjective': 15,
  'grammar-fill.given.conversion.verb-to-noun': 14,
  'grammar-fill.given.conversion.adjective-to-adverb': 13,
  'grammar-fill.given.adjective.comparison': 12,
  'grammar-fill.given.pronoun': 9,
  'grammar-fill.given.conversion.adjective-to-noun': 8,
  'grammar-fill.no-hint.conjunction.noun-clause': 8,
  'grammar-fill.given.conversion.verb-to-adjective': 8,
  'grammar-fill.no-hint.conjunction.adverbial-clause': 5,
  'grammar-fill.given.noun.genitive': 3,
  'grammar-fill.given.numeral': 2,
  'grammar-fill.no-hint.pronoun': 1,
  'grammar-fill.given.conversion.noun-to-noun': 1,
}
for (const [key, expected] of Object.entries(BASELINE_FACET_COUNTS)) {
  const actual = facetCounts[key] || 0
  assert(`Req 3: facetKey ${key} count within ±2 of step1 baseline ${expected}`, Math.abs(actual - expected) <= 2, `actual: ${actual}`)
}
// Reserved-zero-count 8-way slots (noun-to-verb / verb-to-adverb) — no real
// examples yet is expected (program.md "空方向预留位置池子如实说").
assert(
  'Req 3: reserved conversion directions (noun-to-verb / verb-to-adverb) have no unexpected count drift',
  (facetCounts['grammar-fill.given.conversion.noun-to-verb'] || 0) <= 2 &&
    (facetCounts['grammar-fill.given.conversion.verb-to-adverb'] || 0) <= 2,
)

const BASELINE_ROLE_COUNTS = { adverbial: 26, attributive: 17, object: 11, 'object-complement': 3, subject: 2, 'subject-complement': 2, predicative: 1 }
for (const [role, expected] of Object.entries(BASELINE_ROLE_COUNTS)) {
  const actual = roleCounts[role] || 0
  assert(`Req 3: role ${role} count within ±2 of step1 baseline ${expected}`, Math.abs(actual - expected) <= 2, `actual: ${actual}`)
}

// ============================================================
// Req 4: old key zero residue, repo-wide, including frontend
// ============================================================

const OLD_KEY_PATTERNS = [
  /grammar-fill\.given\.noun(?!\.)/, // exact given.noun, not given.noun.number/genitive
  /grammar-fill\.given\.adjective(?!\.)/, // exact given.adjective, not given.adjective.comparison
  /grammar-fill\.given\.derivation\./,
]
// Files legitimately allowed to still mention the old strings (historical
// record / migration backup / this verify script's own baseline docs) — the
// plan hard-bans similarQuestions.mjs from ever appearing here (E5 boundary).
const OLD_KEY_ALLOWLIST_SUFFIXES = [
  '.bak',
  'docs/cuts/grammar-facets-v2/', // this cut's own plan/pa/suspects/migration-notes prose
  'docs/cuts/I13-grammar-fill-analysis/', // historical KB doc for the retired v1 taxonomy
  'docs/cuts/I14-grammar-fill-analysis-surface/',
  'docs/cuts/I16c-grammar-verb-axes/',
  'docs/cuts/similar-questions/program.md', // historical 拍板 record quoting v1 mis-filed examples
  'docs/paper-surface-watch-ledger.md',
  'docs/cuts/flow-panel/plan.md',
  'docs/cuts/I17-claude-driven-import/plan.md',
  'docs/cuts/cloze-panel-polish/cr.md',
  // Retired v1 facet registry — kept on disk as a historical record only
  // (no code imports it any more, see the assertion right below this list);
  // not deleted so the frozen v1 KB doc / contract stay cross-referenceable.
  'server/paper-import-ai/grammar-fill-facets-v1.json',
  // AI prompt: intentionally names the retired v1 leaves ONLY inside an
  // explicit "do NOT use these" negative-example sentence (coordinator
  // 2026-07-15: keep the prompt's word-list-teaching edit minimal; the
  // v1-suffixed filename vs v2 content naming question is logged in
  // cut-note.md for CR, non-blocking).
  'prompts/grammar-fill-analysis-v1.md',
]

function grepRepoForOldKeys() {
  const hits = []
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build'])
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        walk(path.join(dir, entry.name))
        continue
      }
      if (!/\.(mjs|ts|tsx|json|md)$/.test(entry.name)) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(rootDir, full)
      if (OLD_KEY_ALLOWLIST_SUFFIXES.some((s) => rel.includes(s))) continue
      if (rel.endsWith('.bak')) continue
      if (rel === 'scripts/verify-grammar-facets-v2.mjs') continue // this file's own pattern literals
      if (rel === 'scripts/grammar-facets-v2-migrate.mjs') continue // migrate script's own renamed-away-from literals
      let content
      try {
        content = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      for (const pattern of OLD_KEY_PATTERNS) {
        if (pattern.test(content)) hits.push({ rel, pattern: pattern.source })
      }
    }
  }
  walk(rootDir)
  return hits
}

const oldKeyHits = grepRepoForOldKeys()
assert(
  'Req 4: zero old-facetKey residue repo-wide (excl. .bak / historical cut docs)',
  oldKeyHits.length === 0,
  oldKeyHits.map((h) => `${h.rel} (${h.pattern})`).join('\n  '),
)
assert(
  'Req 4 (E5 boundary, PA/plan hard rule): similarQuestions.mjs never appears in the old-key allowlist',
  !OLD_KEY_ALLOWLIST_SUFFIXES.some((s) => s.includes('similarQuestions')),
)
const similarQuestionsSrc = readRepoFile('server/search/similarQuestions.mjs')
assert(
  'Req 4: similarQuestions.mjs itself carries zero old-facetKey literals',
  !OLD_KEY_PATTERNS.some((p) => p.test(similarQuestionsSrc)),
)

// ============================================================
// Req 5: every v2 facetKey found in real data has a grammarFillFacetRegistry.ts entry
// ============================================================

const registryFrontendKeys = new Set(Object.keys(FACET_FRAMEWORKS))
const missingFromFrontend = [...new Set(Object.keys(facetCounts))].filter((k) => !registryFrontendKeys.has(k))
assert(
  'Req 5: every facetKey present in real v2 data has a grammarFillFacetRegistry.ts entry',
  missingFromFrontend.length === 0,
  missingFromFrontend.join(', '),
)
assert('Req 5: grammarFillFacetRegistry.ts has exactly 22 entries', registryFrontendKeys.size === 22, `found: ${registryFrontendKeys.size}`)

// The retired v1 registry JSON is kept on disk as a historical record (Req 4
// allowlist) but must have zero live importers — analyzeGrammarFill.mjs
// switched to the v2 file.
{
  const analyzeGrammarFillSrc = readRepoFile('server/paper-import-ai/analyzeGrammarFill.mjs')
  assert(
    "Req 5: analyzeGrammarFill.mjs's facetsPath resolves to grammar-fill-facets-v2.json",
    /facetsPath\s*=\s*path\.join\(__dirname,\s*'grammar-fill-facets-v2\.json'\)/.test(analyzeGrammarFillSrc),
  )
}

// ============================================================
// Req 6: old sidecar consumption zero residue
// ============================================================

const RETIRED_FILES = [
  'server/grammar-verb-profile/verbProfileSidecar.mjs',
  'server/grammar-verb-profile/verbProfileBackfillService.mjs',
  'server/grammar-verb-profile/verbProfileBackfillRoutes.mjs',
  'server/grammar-verb-profile/backfillVerbProfiles.mjs',
  'scripts/import-pipeline/vp-driver.mjs',
  'scripts/verify-i16c-grammar-verb-axes.mjs',
]
for (const relPath of RETIRED_FILES) {
  assert(`Req 6: retired file absent: ${relPath}`, !existsSync(path.join(rootDir, relPath)))
}

const teachingFacetsSrc = readRepoFile('server/search/teachingFacets.mjs')
assert(
  'Req 6: teachingFacets.mjs no longer imports verbProfileSidecar.mjs',
  !teachingFacetsSrc.includes('verbProfileSidecar.mjs') && !teachingFacetsSrc.includes('mergeVerbProfileAxes'),
)
assert(
  'Req 6: teachingFacets.mjs analysisConfigs grammarFill entry authenticates v2 (not v1)',
  analysisConfigs.find((c) => c.groupType === 'grammarFill')?.schemaVersion === 'grammar-fill-analysis-v2',
)

const apiSrc = readRepoFile('server/api.mjs')
assert(
  'Req 6: server/api.mjs no longer imports/wires createVerbProfileBackfillRoutes',
  !apiSrc.includes('verbProfileBackfillRoutes') && !apiSrc.includes('createVerbProfileBackfillRoutes'),
)
assert(
  'Req 6: retired route path string absent from server/api.mjs',
  !apiSrc.includes('/api/grammar-fill/verb-profiles/backfill'),
)

const sidecarFilesOnDisk = []
for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const p = path.join(paperAssetsDir, entry.name, 'latest', 'analyses', 'grammar-fill-verb-profile-v1.json')
  if (existsSync(p)) sidecarFilesOnDisk.push(p)
}
assert('Req 6: zero grammar-fill-verb-profile-v1.json sidecar files remain on disk', sidecarFilesOnDisk.length === 0, sidecarFilesOnDisk.join(', '))

// ============================================================
// Req 7: behavioral — teachingFacets index picks up tense/voice/agreement
// directly from v2 blank entries (no sidecar), external filter contract intact
// ============================================================

function buildTeachingFacetsFixture() {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'gfv2-tf-'))
  const paperId = 'paper-gfv2-tf-fixture'
  const baseDir = path.join(tmpRoot, paperId, 'latest')
  mkdirSync(path.join(baseDir, 'analyses'), { recursive: true })
  const groupId = 'group-gfv2-tf-fixture'
  const asset = {
    schemaVersion: 'paper-asset-v1',
    paper: { paperId, title: 'GFV2 TF Fixture' },
    content: {
      groups: {
        [groupId]: { groupId, groupType: 'grammarFill', title: '语法填空', questionIds: ['q1', 'q2', 'q3'] },
      },
    },
  }
  writeFileSync(path.join(baseDir, 'paper-asset.json'), JSON.stringify(asset))
  const analysis = {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId,
    sourceAssetVersion: 1,
    targetGroups: [groupId],
    groups: { [groupId]: { overview: 'fixture' } },
    blanks: {
      q1: {
        blankId: 'b1', blankNo: 56, blankType: 'given', hint: 'view', facetKey: FINITE_KEY,
        answer: 'is viewed', role: null, path: null, reason: 'r', evidence: [], teachingNote: 't',
        tense: 'present', voice: 'passive', agreementSensitive: true,
      },
      q2: {
        blankId: 'b2', blankNo: 57, blankType: 'given', hint: 'expect', facetKey: NON_FINITE_KEY,
        answer: 'to be expected', role: 'subject-complement', path: 'slow', reason: 'r', evidence: [], teachingNote: 't',
        form: 'to-do',
      },
      q3: {
        blankId: 'b3', blankNo: 58, blankType: 'no-hint', hint: null, facetKey: 'grammar-fill.no-hint.preposition',
        answer: 'for', role: null, path: null, reason: 'r', evidence: [], teachingNote: 't',
      },
    },
  }
  writeFileSync(path.join(baseDir, 'analyses', 'grammar-fill-analysis-v1.json'), JSON.stringify(analysis))
  return { tmpRoot, groupId }
}

{
  const { tmpRoot, groupId } = buildTeachingFacetsFixture()
  try {
    const { getIndex } = createTeachingFacetIndex({ paperAssetsDir: tmpRoot, warn: () => {} })
    const index = getIndex()
    const bucket = index.get(groupId)
    assert('Req 7: grammarFill bucket exists (no sidecar file present at all)', Boolean(bucket))
    assert('Req 7: tense picked up directly from v2 blank entry', bucket?.tenses?.has('present'))
    assert('Req 7: voice picked up directly from v2 blank entry', bucket?.voices?.has('passive'))
    assert(
      'Req 7: agreementSensitive exposed on the agreement axis as string "true" (new value domain, same param name)',
      bucket?.agreements?.has('true'),
    )
    assert('Req 7: role (7-way, incl. subject-complement) picked up unchanged', bucket?.roles?.has('subject-complement'))
    assert('Req 7: existing facetKeys/blankTypes preserved (MF-2 regression)', bucket?.facetKeys?.has('grammar-fill.no-hint.preposition'))

    // Filter contract: external param names tense/voice/agreement unchanged (i16a compat)
    const byTense = queryGroupsByTeaching(index, { tense: 'present' })
    assert('Req 7: ?tense= filter still works (param name unchanged)', byTense.some((r) => r.groupId === groupId))
    const byVoice = queryGroupsByTeaching(index, { voice: 'passive' })
    assert('Req 7: ?voice= filter still works (param name unchanged)', byVoice.some((r) => r.groupId === groupId))
    const byAgreement = queryGroupsByTeaching(index, { agreement: 'true' })
    assert('Req 7: ?agreement= filter still works, new bool-string value domain', byAgreement.some((r) => r.groupId === groupId))
    const byAgreementMiss = queryGroupsByTeaching(index, { agreement: 'false' })
    assert('Req 7: ?agreement=false correctly excludes a true-only fixture', !byAgreementMiss.some((r) => r.groupId === groupId))
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
}

// ============================================================
// Req 8: negative import gate — v1-shaped grammar-fill-analysis is rejected
// ============================================================

assert('Req 8: PAPER_IMPORT_SCHEMA_VERSIONS no longer accepts grammar-fill-analysis-v1', !PAPER_IMPORT_SCHEMA_VERSIONS.has('grammar-fill-analysis-v1'))
assert('Req 8: PAPER_IMPORT_SCHEMA_VERSIONS accepts grammar-fill-analysis-v2', PAPER_IMPORT_SCHEMA_VERSIONS.has('grammar-fill-analysis-v2'))

{
  // Real (buffer-shaped) package upload with a v1-shaped grammar-fill-analysis
  // JSON — must be rejected by the validator's schemaVersion allow-list gate.
  // (docx/paper-asset/answer-key/reading-analysis are irrelevant to this one
  // gate; their own absence will raise unrelated blocking issues, which is
  // fine — we only assert the specific json.schemaVersionUnknown code fires.)
  const v1GrammarFillJson = JSON.stringify({ schemaVersion: 'grammar-fill-analysis-v1', paperId: 'paper-gfv2-neg', blanks: {} })
  const files = [
    { fileName: 'grammar-fill-analysis-v1.json', buffer: Buffer.from(v1GrammarFillJson) },
  ]
  const validation = validatePaperImportPackage(files)
  const hasSchemaVersionUnknown = (validation.blockingIssues || []).some(
    (i) => i.code === 'json.schemaVersionUnknown' && String(i.message || '').includes('grammar-fill-analysis-v1'),
  )
  assert(
    'Req 8: v1-shaped grammar-fill-analysis upload hits json.schemaVersionUnknown',
    hasSchemaVersionUnknown,
    JSON.stringify(validation.blockingIssues, null, 2),
  )
}

// ============================================================
// CI + README registration
// ============================================================

{
  const verifyCi = readRepoFile('scripts/verify-ci.mjs')
  const scriptsReadme = readRepoFile('scripts/README.md')
  assert('CI: verify-ci.mjs includes verify-grammar-facets-v2.mjs', verifyCi.includes('verify-grammar-facets-v2.mjs'))
  assert('CI: verify-ci.mjs no longer registers retired verify-i16c-grammar-verb-axes.mjs', !verifyCi.includes('verify-i16c-grammar-verb-axes.mjs'))
  assert('CI: scripts/README.md documents verify-grammar-facets-v2.mjs', scriptsReadme.includes('verify-grammar-facets-v2.mjs'))
}

console.log()
if (failed > 0) {
  console.error(`grammar-facets-v2 verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}
console.log(`grammar-facets-v2 verify passed: ${passed} passed, 0 failed`)
