#!/usr/bin/env node
/**
 * Verification: I16·C grammar-fill verb teaching axes (时态 / 语态 / 主谓一致).
 *
 * PA Must Fix coverage:
 *   MF-1 sidecar lands in the baseDir resolvePaperAssetReadPaths returns (versions/v1
 *        when there is no latest/), never a hardcoded latest/.
 *   MF-2 teaching-facets merge keeps existing grammarFill facetKeys/blankTypes/roles
 *        + groupType + cross-type (reading) facets, AND adds tenses/voices/agreements.
 *   MF-4 agreement derives from subject context: a have-led blank is undecidable by
 *        form (→ AI), and the AI prompt carries subjectSignals.
 *   plus: deterministic classifier per form, backfill orchestration (idempotent /
 *        fault-isolated / honest summary), endpoint filters, frozen-contract fence.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  analyzeGrammarFillVerbProfile,
  buildVerbProfileMessages,
  classifyFiniteVerbFormDeterministic,
  extractFiniteVerbBlanks,
} from '../server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs'
import {
  readVerbProfileSidecar,
  writeVerbProfileSidecar,
  VERB_PROFILE_SIDECAR_FILENAME,
} from '../server/grammar-verb-profile/verbProfileSidecar.mjs'
import { backfillVerbProfiles } from '../server/grammar-verb-profile/backfillVerbProfiles.mjs'
import {
  classifyVerbProfileGroup,
  listGrammarFillVerbWork,
  persistVerbProfileGroup,
} from '../server/grammar-verb-profile/verbProfileBackfillService.mjs'
import { createTeachingFacetIndex, queryGroupsByTeaching } from '../server/search/teachingFacets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

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

console.log('I16-C verify: grammar-fill verb teaching axes\n')

// ─── Req 1: deterministic classifier per answer form ──────────────────────────
console.log('=== Req 1: deterministic classifier (标全形态 A) ===')
{
  const cases = [
    // [answer, hint, expected | null]
    ['are', 'be', { tense: 'present', voice: 'active', agreement: 'plural' }], // live q-061
    ['is', 'be', { tense: 'present', voice: 'active', agreement: 'singular' }],
    ['was built', 'build', { tense: 'past', voice: 'passive', agreement: 'singular' }],
    ['are encouraged', 'encourage', { tense: 'present', voice: 'passive', agreement: 'plural' }],
    ['has been made', 'make', { tense: 'present-perfect', voice: 'passive', agreement: 'singular' }],
    ['is running', 'run', { tense: 'progressive', voice: 'active', agreement: 'singular' }],
    ['was being built', 'build', { tense: 'progressive', voice: 'passive', agreement: 'singular' }],
    ['had arrived', 'arrive', { tense: 'past-perfect', voice: 'active', agreement: 'na' }],
    ['will go', 'go', { tense: 'other', voice: 'active', agreement: 'na' }],
    ['means', 'mean', null], // bare content verb → AI
    ['broke', 'break', null], // bare irregular past → AI
    ['have made', 'make', null], // have-led: agreement needs subject → AI (MF-4)
  ]
  for (const [answer, hint, expected] of cases) {
    const got = classifyFiniteVerbFormDeterministic({ answer, hint })
    if (expected === null) {
      assert(`Req1: "${answer}" → null (needs AI)`, got === null, `got: ${JSON.stringify(got)}`)
    } else {
      const ok =
        got &&
        got.tense === expected.tense &&
        got.voice === expected.voice &&
        got.agreement === expected.agreement &&
        got.method === 'deterministic'
      assert(`Req1: "${answer}" → ${expected.tense}/${expected.voice}/${expected.agreement}`, ok, `got: ${JSON.stringify(got)}`)
    }
  }
}

console.log()

// ─── Req 2: extractFiniteVerbBlanks only pulls finite-verb blanks ─────────────
console.log('=== Req 2: extractFiniteVerbBlanks ===')
{
  const analysis = {
    blanks: {
      q1: { facetKey: 'grammar-fill.given.verb.finite', answer: 'are', hint: 'be', reason: 'r', evidence: [] },
      q2: { facetKey: 'grammar-fill.no-hint.preposition', answer: 'by' },
      q3: { facetKey: 'grammar-fill.given.verb.non-finite', answer: 'being absorbed', role: 'object' },
    },
  }
  const finite = extractFiniteVerbBlanks(analysis)
  assert('Req2: exactly 1 finite blank extracted', finite.length === 1, `got ${finite.length}`)
  assert('Req2: it is q1', finite[0]?.questionId === 'q1', JSON.stringify(finite[0]))
}

console.log()

// ─── Req 3: analyzer — deterministic-only group makes NO provider call ────────
console.log('=== Req 3: deterministic-only group needs no AI ===')
{
  let providerCalls = 0
  const providerCaller = () => {
    providerCalls++
    return { rawText: '{}' }
  }
  const blanks = [{ questionId: 'q1', answer: 'are', hint: 'be', reason: '', evidence: [] }]
  const result = await analyzeGrammarFillVerbProfile(blanks, { providerCaller })
  assert('Req3: no provider call for an all-deterministic group', providerCalls === 0, `calls: ${providerCalls}`)
  assert(
    'Req3: q1 = present/active/plural via deterministic',
    result.q1?.tense === 'present' && result.q1?.voice === 'active' && result.q1?.agreement === 'plural' && result.q1?.method === 'deterministic',
    JSON.stringify(result.q1),
  )
}

console.log()

// ─── Req 4 (MF-4): AI fallback carries subject context, agreement from subject ─
console.log('=== Req 4 (MF-4): AI fallback uses subject context ===')
{
  let capturedMessages = null
  const providerCaller = ({ messages }) => {
    capturedMessages = messages
    return { rawText: JSON.stringify({ blanks: { q9: { tense: 'present-perfect', voice: 'active', agreement: 'plural' } } }) }
  }
  // "have made" is undecidable by form; subject "the researchers" makes it plural.
  const blanks = [
    {
      questionId: 'q9',
      answer: 'have made',
      hint: 'make',
      reason: 'the researchers have made progress',
      evidence: [{ type: 'subject', signalText: 'the researchers', relation: 'plural subject' }],
    },
  ]
  const result = await analyzeGrammarFillVerbProfile(blanks, { providerCaller })
  assert('Req4: AI value used + method ai', result.q9?.agreement === 'plural' && result.q9?.method === 'ai', JSON.stringify(result.q9))
  const msgText = JSON.stringify(capturedMessages || [])
  assert('Req4: prompt carries the subject signal (the researchers)', msgText.includes('the researchers'), 'subject signal not in prompt')

  // Independent check that the message builder forwards subjectSignals
  const msgs = buildVerbProfileMessages(blanks)
  assert('Req4: buildVerbProfileMessages includes subjectSignals', JSON.stringify(msgs).includes('subjectSignals'), 'subjectSignals key missing')
}

console.log()

// ─── Req 5: AI returns invalid axis value → rejected ──────────────────────────
console.log('=== Req 5: registry validation rejects out-of-axis values ===')
{
  const bad = ({ }) => ({ rawText: JSON.stringify({ blanks: { q9: { tense: 'future', voice: 'active', agreement: 'na' } } }) })
  let threw = false
  try {
    await analyzeGrammarFillVerbProfile([{ questionId: 'q9', answer: 'have made', hint: 'make', reason: '', evidence: [] }], { providerCaller: bad })
  } catch {
    threw = true
  }
  assert('Req5: invalid tense "future" rejected', threw)

  const missing = ({ }) => ({ rawText: JSON.stringify({ blanks: { q9: { tense: 'present-perfect', voice: 'active' } } }) })
  let threw2 = false
  try {
    await analyzeGrammarFillVerbProfile([{ questionId: 'q9', answer: 'have made', hint: 'make', reason: '', evidence: [] }], { providerCaller: missing })
  } catch {
    threw2 = true
  }
  assert('Req5: missing agreement rejected', threw2)
}

console.log()

// ─── Req 6: backfill orchestration (idempotent / fault-isolated / summary) ────
console.log('=== Req 6: backfill orchestration ===')
{
  // all profiled
  let summary = await backfillVerbProfiles({
    listGroups: () => ({ groups: [{ groupId: 'g1', paperId: 'p1', blanks: [{ questionId: 'q1' }] }, { groupId: 'g2', paperId: 'p1', blanks: [{ questionId: 'q2' }] }], skipped: 3 }),
    classify: async (g) => ({ [g.blanks[0].questionId]: { tense: 'present', voice: 'active', agreement: 'singular', method: 'deterministic' } }),
    persist: async () => {},
  })
  assert('Req6: processed=2', summary.processed === 2, JSON.stringify(summary))
  assert('Req6: profiledGroups=2', summary.profiledGroups === 2)
  assert('Req6: profiledBlanks=2', summary.profiledBlanks === 2)
  assert('Req6: skipped passthrough=3', summary.skipped === 3)
  assert('Req6: failed empty', summary.failed.length === 0)

  // one classify failure isolated
  summary = await backfillVerbProfiles({
    listGroups: () => ({ groups: [{ groupId: 'g1', paperId: 'p1', blanks: [{ questionId: 'q1' }] }, { groupId: 'g2', paperId: 'p1', blanks: [{ questionId: 'q2' }] }], skipped: 0 }),
    classify: async (g) => {
      if (g.groupId === 'g2') throw new Error('boom')
      return { q1: { tense: 'present', voice: 'active', agreement: 'singular' } }
    },
    persist: async () => {},
  })
  assert('Req6: g2 failure isolated, g1 profiled', summary.profiledGroups === 1 && summary.failed.length === 1, JSON.stringify(summary))
  assert('Req6: failed entry names g2', summary.failed[0]?.groupId === 'g2', JSON.stringify(summary.failed))

  // empty list
  summary = await backfillVerbProfiles({ listGroups: () => ({ groups: [], skipped: 1 }), classify: async () => ({}), persist: async () => {} })
  assert('Req6: empty list → processed 0, skipped 1', summary.processed === 0 && summary.skipped === 1)
}

console.log()

// ─── Req 7 (MF-1): sidecar lands in resolved baseDir (versions/v1, no latest/) ─
console.log('=== Req 7 (MF-1): sidecar write target = resolved baseDir ===')
let tmpRoot = null
try {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'i16c-'))
  const paperId = 'paper-X'
  const v1Analyses = path.join(tmpRoot, paperId, 'versions', 'v1', 'analyses')
  mkdirSync(v1Analyses, { recursive: true })
  // a paper with versions/v1 and NO latest/ — exactly the live shape
  writeFileSync(
    path.join(tmpRoot, paperId, 'versions', 'v1', 'paper-asset.json'),
    JSON.stringify({ paper: { paperId, assetVersion: 1 }, content: { groups: {
      'g-gf': { groupType: 'grammarFill', questionIds: ['q1', 'q2', 'q3'] },
      'g-rd': { groupType: 'reading', questionIds: ['r1'] },
    } } }),
  )
  writeFileSync(
    path.join(v1Analyses, 'grammar-fill-analysis-v1.json'),
    JSON.stringify({
      schemaVersion: 'grammar-fill-analysis-v1',
      paperId,
      targetGroups: ['g-gf'],
      blanks: {
        q1: { facetKey: 'grammar-fill.given.verb.finite', blankType: 'given', answer: 'are', hint: 'be', role: null, reason: 'that refers to vitamins and minerals', evidence: [{ type: 'subject', signalText: 'vitamins and minerals', relation: 'plural antecedent' }] },
        q2: { facetKey: 'grammar-fill.no-hint.preposition', blankType: 'no-hint', answer: 'by', role: null },
        q3: { facetKey: 'grammar-fill.given.verb.non-finite', blankType: 'given', answer: 'being absorbed', role: 'object' },
      },
    }),
  )
  writeFileSync(
    path.join(v1Analyses, 'reading-choice-analysis-v1.json'),
    JSON.stringify({ schemaVersion: 'reading-choice-analysis-v1', paperId, questions: { r1: { skill: { primary: 'detail', secondary: '' } } } }),
  )

  const { blankCount } = writeVerbProfileSidecar({
    paperAssetsDir: tmpRoot,
    paperId,
    blanks: { q1: { tense: 'present', voice: 'active', agreement: 'plural', method: 'deterministic' } },
  })
  const sidecarInV1 = path.join(v1Analyses, VERB_PROFILE_SIDECAR_FILENAME)
  assert('Req7: sidecar written into versions/v1/analyses (resolved baseDir)', existsSync(sidecarInV1), sidecarInV1)
  assert('Req7: NO phantom latest/ dir created', !existsSync(path.join(tmpRoot, paperId, 'latest')), 'latest/ was created')
  assert('Req7: blankCount=1', blankCount === 1)
  // roundtrip
  const back = readVerbProfileSidecar(tmpRoot, paperId)
  assert('Req7: roundtrip tense/voice/agreement', back?.blanks?.q1?.tense === 'present' && back?.blanks?.q1?.voice === 'active' && back?.blanks?.q1?.agreement === 'plural')
  assert('Req7: no leftover temp file', !existsSync(path.join(v1Analyses, `.${VERB_PROFILE_SIDECAR_FILENAME}.tmp`)))

  // idempotent merge: writing q-other keeps q1
  writeVerbProfileSidecar({ paperAssetsDir: tmpRoot, paperId, blanks: { qOther: { tense: 'past', voice: 'passive', agreement: 'singular' } } })
  const merged = readVerbProfileSidecar(tmpRoot, paperId)
  assert('Req7: merge keeps prior q1 + adds qOther', merged?.blanks?.q1 && merged?.blanks?.qOther, JSON.stringify(merged?.blanks))

  console.log()

  // ─── Req 8: end-to-end backfill via production service (zero AI) ─────────────
  console.log('=== Req 8: service backfill end-to-end (deterministic, no key) ===')
  // fresh sidecar-free state: remove the sidecar we wrote above
  rmSync(sidecarInV1, { force: true })

  const work = listGrammarFillVerbWork({ paperAssetsDir: tmpRoot, warn: () => {} })
  assert('Req8: lists 1 grammar-fill group with 1 unprofiled finite blank', work.groups.length === 1 && work.groups[0].blanks.length === 1, JSON.stringify(work.groups.map((g) => ({ g: g.groupId, n: g.blanks.length }))))

  const e2eSummary = await backfillVerbProfiles({
    listGroups: () => listGrammarFillVerbWork({ paperAssetsDir: tmpRoot, warn: () => {} }),
    classify: (g) => classifyVerbProfileGroup(g, {}), // no providerCaller → all-deterministic
    persist: (g, profiles) => persistVerbProfileGroup({ paperAssetsDir: tmpRoot }, g, profiles),
  })
  assert('Req8: profiledGroups=1, profiledBlanks=1', e2eSummary.profiledGroups === 1 && e2eSummary.profiledBlanks === 1, JSON.stringify(e2eSummary))

  // idempotent rerun → skipped
  const rerun = await backfillVerbProfiles({
    listGroups: () => listGrammarFillVerbWork({ paperAssetsDir: tmpRoot, warn: () => {} }),
    classify: (g) => classifyVerbProfileGroup(g, {}),
    persist: (g, profiles) => persistVerbProfileGroup({ paperAssetsDir: tmpRoot }, g, profiles),
  })
  assert('Req8: rerun is idempotent (processed 0, skipped 1)', rerun.processed === 0 && rerun.skipped === 1, JSON.stringify(rerun))

  console.log()

  // ─── Req 9 (MF-2): teaching-facets merge preserves + adds ────────────────────
  console.log('=== Req 9 (MF-2): index merge regression ===')
  const index = createTeachingFacetIndex({ paperAssetsDir: tmpRoot, warn: () => {} }).getIndex()
  const gf = index.get('g-gf')
  assert('Req9: grammarFill bucket exists', !!gf)
  assert('Req9: groupType preserved = grammarFill', gf?.groupType === 'grammarFill', gf?.groupType)
  assert('Req9: existing facetKeys preserved (finite + preposition + non-finite)', gf?.facetKeys?.has('grammar-fill.given.verb.finite') && gf?.facetKeys?.has('grammar-fill.no-hint.preposition') && gf?.facetKeys?.has('grammar-fill.given.verb.non-finite'), JSON.stringify([...(gf?.facetKeys || [])]))
  assert('Req9: existing blankTypes preserved', gf?.blankTypes?.has('given') && gf?.blankTypes?.has('no-hint'))
  assert('Req9: existing roles preserved (object from non-finite)', gf?.roles?.has('object'))
  assert('Req9: NEW tenses axis added (present)', gf?.tenses?.has('present'))
  assert('Req9: NEW voices axis added (active)', gf?.voices?.has('active'))
  assert('Req9: NEW agreements axis added (plural)', gf?.agreements?.has('plural'))
  // cross-type untouched
  const rd = index.get('g-rd')
  assert('Req9: reading bucket untouched (skill detail)', rd?.skills?.has('detail') && rd?.groupType === 'reading')

  console.log()

  // ─── Req 10: query filters AND together; no-filter = all (backward compat) ───
  console.log('=== Req 10: query filters ===')
  const all = queryGroupsByTeaching(index, {})
  assert('Req10: no-filter returns all analyzed groups (#180 compat)', all.length === 2, `len ${all.length}`)
  const activeHits = queryGroupsByTeaching(index, { voice: 'active' })
  assert('Req10: ?voice=active hits g-gf', activeHits.length === 1 && activeHits[0].groupId === 'g-gf')
  const passiveHits = queryGroupsByTeaching(index, { voice: 'passive' })
  assert('Req10: ?voice=passive empty on this corpus (coverage-honest)', passiveHits.length === 0)
  const cross = queryGroupsByTeaching(index, { tense: 'present', voice: 'active', agreement: 'plural' })
  assert('Req10: cross tense+voice+agreement AND hits g-gf', cross.length === 1 && cross[0].groupId === 'g-gf')
  const crossMiss = queryGroupsByTeaching(index, { tense: 'past', voice: 'active' })
  assert('Req10: mismatched tense → empty', crossMiss.length === 0)
} finally {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
}

console.log()

// ─── Req 11: passive proven via fixture (MF-5 coverage-honesty) ───────────────
console.log('=== Req 11 (MF-5): passive proven by fixture ===')
{
  // The live corpus has 0 passive; passive correctness is proven here, not on live data.
  const det = classifyFiniteVerbFormDeterministic({ answer: 'was designed', hint: 'design' })
  assert('Req11: "was designed" → past/passive/singular (fixture)', det?.tense === 'past' && det?.voice === 'passive' && det?.agreement === 'singular', JSON.stringify(det))
}

console.log()

// ─── Req 12: route via factory spread; cache invalidated ──────────────────────
console.log('=== Req 12: route registered via factory spread ===')
{
  const apiSource = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')
  assert('Req12: api.mjs imports createVerbProfileBackfillRoutes', apiSource.includes('createVerbProfileBackfillRoutes'))
  assert('Req12: spread into serverRoutes (not literal push)', /serverRoutes\s*=\s*\[[\s\S]*createVerbProfileBackfillRoutes\(\)/.test(apiSource))
  const routeSrc = readFileSync(path.join(rootDir, 'server/grammar-verb-profile/verbProfileBackfillRoutes.mjs'), 'utf8')
  assert('Req12: route path /api/grammar-fill/verb-profiles/backfill', routeSrc.includes('/api/grammar-fill/verb-profiles/backfill'))
  assert('Req12: route invalidates teaching-facet cache', routeSrc.includes('invalidateTeachingFacetIndex'))
}

console.log()

// ─── Req 13 (MF-3 / Forbidden): frozen contract fence ─────────────────────────
console.log('=== Req 13: frozen-contract diff fence ===')
{
  // frozen analysis prompt + validator + facet registry must be untouched by this cut.
  const facetsRegistry = readFileSync(path.join(rootDir, 'server/paper-import-ai/grammar-fill-facets-v1.json'), 'utf8')
  assert('Req13: 16-leaf facet registry intact (no verb axes leaked in)', !facetsRegistry.includes('tense') && !facetsRegistry.includes('voice') && !facetsRegistry.includes('agreement'))

  const analyzeSrc = readFileSync(path.join(rootDir, 'server/paper-import-ai/analyzeGrammarFill.mjs'), 'utf8')
  assert('Req13: analyzeGrammarFill validator not extended with verb axes', !analyzeSrc.includes('grammar-fill-verb-profile') && !/\btense\b/.test(analyzeSrc) && !/\bvoice\b/.test(analyzeSrc))

  // verb profile must be a sidecar, not a DB table / schema change
  const schemaSql = path.join(rootDir, 'data/sql/schema.sql')
  if (existsSync(schemaSql)) {
    const schema = readFileSync(schemaSql, 'utf8')
    assert('Req13: no verb_profile DB table (sidecar, not schema)', !/verb[_-]?profile/i.test(schema))
  } else {
    assert('Req13: schema.sql present', false, 'schema.sql not found')
  }

  // shared DeepSeek provider not modified (out of allowed scope)
  const deepseekSrc = readFileSync(path.join(rootDir, 'server/ai-providers/deepseek.mjs'), 'utf8')
  assert('Req13: deepseek.mjs callDeepSeekJson unchanged (no apiKey param added)', /export function callDeepSeekJson\(\{ messages, model = 'deepseek-v4-pro', fetchImpl \}\)/.test(deepseekSrc), 'deepseek.mjs signature changed')
}

console.log()

// ─── Req 14: CI + README registration ─────────────────────────────────────────
console.log('=== Req 14: CI + README registration ===')
{
  const verifyCi = readFileSync(path.join(rootDir, 'scripts/verify-ci.mjs'), 'utf8')
  const readme = readFileSync(path.join(rootDir, 'scripts/README.md'), 'utf8')
  assert('Req14: verify-ci.mjs includes i16c verifier', verifyCi.includes('verify-i16c-grammar-verb-axes.mjs'))
  assert('Req14: README documents i16c verifier', readme.includes('verify-i16c-grammar-verb-axes.mjs'))
}

console.log()
if (failed > 0) {
  console.error(`I16-C grammar-verb-axes verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}
console.log(`I16-C grammar-verb-axes verify passed: ${passed} passed, 0 failed`)
