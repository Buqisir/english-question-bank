#!/usr/bin/env node
/**
 * verify-i13-grammar-fill-analysis.mjs
 *
 * Covers Steps 1–10 of I13-grammar-fill-analysis:
 *  - Step 2: prompt + registry static checks
 *  - Step 3: analyzeGrammarFill validator (success + each blocking case)
 *  - Step 4: route, package, storage, validator wiring + on-disk assertion (MF-2)
 *
 * Critical cases:
 *  - C1: whether/if✓, Whether/whether✓, were worn✓, worn-for-wore✗, wrong-answer✗
 *  - C2: 17-leaf membership, parent-as-leaf✗, blank_type mismatch✗, role/path conditionality
 *  - C3: evidence exact-substring, no blank marker in signalText (SW-2)
 *  - MF-2: post-publish ON-DISK analyses/grammar-fill-analysis-v1.json present
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { analyzeGrammarFillImportCandidate, buildGrammarFillAnalysisMessages, validateGrammarFillShape } from '../server/paper-import-ai/analyzeGrammarFill.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { validatePaperImportPackage, PAPER_IMPORT_SCHEMA_VERSIONS } from '../server/paper-import/validator.mjs'
import { writePaperImportVersion, swapPaperImportLatest } from '../server/paper-import/storage.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? `\n  detail: ${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function assertRejects(name, fn, pattern) {
  return Promise.resolve().then(() => fn()).then(
    () => { throw new Error(`FAIL: ${name}\n  expected rejection but resolved`) },
    (error) => {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : String(error)
      assert(name, pattern.test(message), `actual message: ${message}`)
    },
  )
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// ============================================================
// Step 2 — Prompt contract static checks
// ============================================================

function assertPromptContract() {
  const prompt = readRepoFile('prompts/grammar-fill-analysis-v1.md')

  // schemaVersion constant (D1 grammar-facets-v2: bumped to v2)
  assert('prompt names schemaVersion grammar-fill-analysis-v2', prompt.includes('grammar-fill-analysis-v2'))
  // promptVersion
  assert('prompt names promptVersion grammar-fill-analysis-v2', prompt.includes('promptVersion') || prompt.includes('grammar-fill-analysis-v2'))
  // All 22 leaf facet keys must be named (D1: 17 v1 leaves -> 22 v2 leaves)
  for (const leaf of [
    'grammar-fill.given.verb.finite',
    'grammar-fill.given.verb.non-finite',
    'grammar-fill.given.conversion.noun-to-noun',
    'grammar-fill.given.conversion.noun-to-adjective',
    'grammar-fill.given.conversion.noun-to-verb',
    'grammar-fill.given.conversion.adjective-to-adverb',
    'grammar-fill.given.conversion.adjective-to-noun',
    'grammar-fill.given.conversion.verb-to-adjective',
    'grammar-fill.given.conversion.verb-to-noun',
    'grammar-fill.given.conversion.verb-to-adverb',
    'grammar-fill.given.noun.number',
    'grammar-fill.given.noun.genitive',
    'grammar-fill.given.adjective.comparison',
    'grammar-fill.given.pronoun',
    'grammar-fill.given.numeral',
    'grammar-fill.no-hint.preposition',
    'grammar-fill.no-hint.article',
    'grammar-fill.no-hint.pronoun',
    'grammar-fill.no-hint.conjunction.coordinating',
    'grammar-fill.no-hint.conjunction.relative-clause',
    'grammar-fill.no-hint.conjunction.noun-clause',
    'grammar-fill.no-hint.conjunction.adverbial-clause',
  ]) {
    assert(`prompt names leaf facet: ${leaf}`, prompt.includes(leaf))
  }
  // Evidence type vocabulary
  for (const type of ['subject', 'time-marker', 'antecedent', 'modified-word', 'governing-word', 'collocation', 'comparison', 'parallel', 'connector', 'clause-frame', 'of-phrase', 'determiner']) {
    assert(`prompt names evidence type: ${type}`, prompt.includes(type))
  }
  // exact-substring rule
  assert('prompt has exact-substring rule', prompt.includes('exact substring'))
  // blank marker exclusion rule
  assert('prompt has blank marker exclusion rule', prompt.includes('blank marker') || prompt.includes('  56  ') || prompt.includes('(wear)'))
  // role/path for non-finite
  assert('prompt mentions role and path for non-finite', prompt.includes('role') && prompt.includes('path') && prompt.includes('non-finite'))
  // C1 answer key rule
  assert('prompt describes answer authority', prompt.includes('answer') && prompt.includes('answer key'))
  // forbidden parent nodes
  assert('prompt forbids parent nodes as facetKey', prompt.includes('grammar-fill.given.verb') && prompt.includes('NOT valid') || prompt.includes('Do NOT use parent'))
  // blankType
  assert('prompt names blankType values given and no-hint', prompt.includes('given') && prompt.includes('no-hint'))
}

// ============================================================
// Registry checks (Step 2)
// ============================================================

function assertRegistryContract() {
  // D1 (grammar-facets-v2): registry file bumped v1 (17 leaves) -> v2 (22 leaves).
  const raw = readRepoFile('server/paper-import-ai/grammar-fill-facets-v2.json')
  const registry = JSON.parse(raw)
  assert('registry is an array', Array.isArray(registry))
  assert('registry has exactly 22 leaves', registry.length === 22)

  const EXPECTED_LEAVES = [
    'grammar-fill.given.verb.finite',
    'grammar-fill.given.verb.non-finite',
    'grammar-fill.given.conversion.noun-to-noun',
    'grammar-fill.given.conversion.noun-to-adjective',
    'grammar-fill.given.conversion.noun-to-verb',
    'grammar-fill.given.conversion.adjective-to-adverb',
    'grammar-fill.given.conversion.adjective-to-noun',
    'grammar-fill.given.conversion.verb-to-adjective',
    'grammar-fill.given.conversion.verb-to-noun',
    'grammar-fill.given.conversion.verb-to-adverb',
    'grammar-fill.given.noun.number',
    'grammar-fill.given.noun.genitive',
    'grammar-fill.given.adjective.comparison',
    'grammar-fill.given.pronoun',
    'grammar-fill.given.numeral',
    'grammar-fill.no-hint.preposition',
    'grammar-fill.no-hint.article',
    'grammar-fill.no-hint.pronoun',
    'grammar-fill.no-hint.conjunction.coordinating',
    'grammar-fill.no-hint.conjunction.relative-clause',
    'grammar-fill.no-hint.conjunction.noun-clause',
    'grammar-fill.no-hint.conjunction.adverbial-clause',
  ]

  for (const key of EXPECTED_LEAVES) {
    assert(`registry contains leaf: ${key}`, registry.some((f) => f.facet_key === key))
  }

  // All given.* leaves have blank_type = 'given'
  const givenLeaves = registry.filter((f) => f.facet_key.startsWith('grammar-fill.given.'))
  assert('all given.* leaves have blank_type given', givenLeaves.every((f) => f.blank_type === 'given'))

  // All no-hint.* leaves have blank_type = 'no-hint'
  const noHintLeaves = registry.filter((f) => f.facet_key.startsWith('grammar-fill.no-hint.'))
  assert('all no-hint.* leaves have blank_type no-hint', noHintLeaves.every((f) => f.blank_type === 'no-hint'))

  // No parent nodes in registry
  const PARENT_KEYS = ['grammar-fill', 'grammar-fill.given', 'grammar-fill.given.verb', 'grammar-fill.given.conversion', 'grammar-fill.no-hint', 'grammar-fill.no-hint.conjunction']
  for (const parent of PARENT_KEYS) {
    assert(`parent node "${parent}" NOT in registry`, !registry.some((f) => f.facet_key === parent))
  }
}

// ============================================================
// Step 3 — Input / fixture builders
// ============================================================

// SW-2: passage must contain both a '  56  ' blank marker AND a '(wear)' hint token.
const FIXTURE_PASSAGE_TEXT = 'Yesterday he  56  (wear) his old coat to the party. The weather was very cold  57  the event started. It was  58  (surprise) to see how many people came. The design of  59  coat was fashionable. One of the ways  60  dressing was quite unusual. We  61  (discuss) the topic earlier that day. There  62  (be) many interesting conversations. The host chose  63  best outfit. People  64  (enjoy) themselves at the party. It was  65  unforgettable experience.'

// Verify SW-2 fixture invariants
assert('fixture passage contains  56  blank marker', FIXTURE_PASSAGE_TEXT.includes('  56  '))
assert('fixture passage contains (wear) hint token', FIXTURE_PASSAGE_TEXT.includes('(wear)'))

function gfFixtureInput() {
  const questionData = [
    { no: 56, answerKey: 'wore',       prompt: 'wear'    },
    { no: 57, answerKey: 'when',       prompt: null      },
    { no: 58, answerKey: 'surprising', prompt: 'surprise'},
    { no: 59, answerKey: 'the',        prompt: null      },
    { no: 60, answerKey: 'of',         prompt: null      },
    { no: 61, answerKey: 'discussed',  prompt: 'discuss' },
    { no: 62, answerKey: 'were',       prompt: 'be'      },
    { no: 63, answerKey: 'the',        prompt: null      },
    { no: 64, answerKey: 'enjoyed',    prompt: 'enjoy'   },
    { no: 65, answerKey: 'an',         prompt: null      },
  ]
  return {
    paper: {
      paperId: 'paper-i13-gf-fixture',
      sourceFilename: 'i13-gf.docx',
      sourceHash: 'abc123',
    },
    group: {
      groupId: 'group-i13-grammar-fill',
      groupType: 'grammarFill',
      title: '语法填空',
      order: 6,
      paragraphs: [{ id: 'para-i13-gf-p1', text: FIXTURE_PASSAGE_TEXT }],
      questions: questionData.map((d) => ({
        id: `q-i13-gf-${String(d.no).padStart(3, '0')}`,
        stem: String(d.no),
        answerKey: d.answerKey,
        blankId: `blank-i13-gf-${String(d.no).padStart(3, '0')}`,
        prompt: d.prompt,
      })),
      blankIds: questionData.map((d) => `blank-i13-gf-${String(d.no).padStart(3, '0')}`),
    },
    providerId: 'deepseek-v4-pro',
  }
}

function validGfAnalysis(input) {
  input = input || gfFixtureInput()
  const group = input.group
  const blanks = {}
  for (const q of group.questions) {
    const no = Number(q.stem)
    const isGiven = Boolean(q.prompt)
    blanks[q.id] = {
      blankId: q.blankId,
      blankNo: no,
      blankType: isGiven ? 'given' : 'no-hint',
      hint: isGiven ? q.prompt : null,
      facetKey: isGiven ? 'grammar-fill.given.verb.finite' : 'grammar-fill.no-hint.preposition',
      answer: q.answerKey,
      role: null,
      path: null,
      reason: '示例理由：主语单数，过去时，主动语态。',
      evidence: [
        { type: 'time-marker', signalText: 'Yesterday', signalSide: 'passage', relation: '时间标志词定过去时。' },
      ],
      teachingNote: '通过时间标志词和主谓一致判断时态和语态。',
    }
  }
  return {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: input.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [group.groupId],
    meta: {
      generatedBy: 'external-ai',
      model: 'stub',
      promptVersion: 'grammar-fill-analysis-v2',
      reviewStatus: 'reviewed',
    },
    groups: {
      [group.groupId]: { overview: '一篇关于派对的记叙文。' },
    },
    blanks,
  }
}

function stubProvider(payload) {
  return async () => ({
    rawText: JSON.stringify(payload),
    provider: 'stub-provider',
    model: 'stub',
    latencyMs: 3,
  })
}

// ============================================================
// Step 3 — analyzeGrammarFill validator
// ============================================================

async function assertAnalysisValidation() {
  const input = gfFixtureInput()

  // --- Happy path ---
  const result = await analyzeGrammarFillImportCandidate(input, {
    providerCallers: { deepseek: stubProvider(validGfAnalysis(input)) },
    requestId: 'i13-verify',
  })
  assert('valid grammar-fill analysis passes', result.analysis.schemaVersion === 'grammar-fill-analysis-v2' && result.requestId === 'i13-verify')

  // --- meta is server-stamped ---
  const bogusMeta = validGfAnalysis(input)
  bogusMeta.meta = { ...bogusMeta.meta, model: 'AI-GUESS', reviewedBy: 'AI', reviewedAt: '2099-01-01' }
  const stamped = await analyzeGrammarFillImportCandidate(input, {
    providerCallers: { deepseek: stubProvider(bogusMeta) },
  })
  assert('meta.model is server-stamped', stamped.analysis.meta.model === 'stub')
  assert('meta.reviewedBy is cleared', stamped.analysis.meta.reviewedBy === '')
  assert('meta.reviewedAt is real date', /^\d{4}-\d{2}-\d{2}$/.test(stamped.analysis.meta.reviewedAt) && stamped.analysis.meta.reviewedAt !== '2099-01-01')

  // --- Wrong schemaVersion ---
  await assertRejects('wrong schemaVersion blocks', () => {
    const bad = { ...validGfAnalysis(input), schemaVersion: 'wrong' }
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /schemaVersion/)

  // --- Wrong targetGroups ---
  await assertRejects('wrong targetGroups blocks', () => {
    const bad = { ...validGfAnalysis(input), targetGroups: ['group-other'] }
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /targetGroups/)

  // --- Wrong blanks keys ---
  await assertRejects('wrong blank questionIds blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    delete bad.blanks[firstKey]
    bad.blanks['q-wrong-id'] = { blankId: 'b', blankNo: 56, blankType: 'given', hint: 'wear', facetKey: 'grammar-fill.given.verb.finite', answer: 'wore', role: null, path: null, reason: 'r', evidence: [{ type: 'subject', signalText: 'Yesterday', signalSide: 'passage', relation: 'r' }], teachingNote: 't' }
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /blanks/)

  // --- Missing teachingNote ---
  await assertRejects('missing teachingNote blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    delete bad.blanks[firstKey].teachingNote
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /teachingNote/)

  // --- Missing reason ---
  await assertRejects('missing reason blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].reason = ''
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /reason/)

  // --- Empty evidence ---
  await assertRejects('empty evidence blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence = []
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /evidence/)

  // --- Missing overview ---
  await assertRejects('missing overview blocks', () => {
    const bad = validGfAnalysis(input)
    bad.groups[input.group.groupId].overview = ''
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /overview/)

  // ============================================================
  // C1 — FROZEN 4-op answer normalization (MF-4)
  // ============================================================

  // C1: whether/if alternatives — 'whether' matches answerKey 'whether/if'
  {
    const wifInput = JSON.parse(JSON.stringify(input))
    wifInput.group.questions[1].answerKey = 'whether/if'
    const wifAnalysis = validGfAnalysis(wifInput)
    wifAnalysis.blanks[wifInput.group.questions[1].id].answer = 'whether'
    const ok = await analyzeGrammarFillImportCandidate(wifInput, {
      providerCallers: { deepseek: stubProvider(wifAnalysis) },
    })
    assert('C1: whether matches whether/if answerKey', ok.analysis !== null)
  }

  // C1: 'if' also matches 'whether/if'
  {
    const wifInput = JSON.parse(JSON.stringify(input))
    wifInput.group.questions[1].answerKey = 'whether/if'
    const wifAnalysis = validGfAnalysis(wifInput)
    wifAnalysis.blanks[wifInput.group.questions[1].id].answer = 'if'
    const ok = await analyzeGrammarFillImportCandidate(wifInput, {
      providerCallers: { deepseek: stubProvider(wifAnalysis) },
    })
    assert('C1: if matches whether/if answerKey', ok.analysis !== null)
  }

  // C1: sentence-initial capitalization — 'Whether' matches 'whether/if'
  {
    const wifInput = JSON.parse(JSON.stringify(input))
    wifInput.group.questions[1].answerKey = 'whether/if'
    const wifAnalysis = validGfAnalysis(wifInput)
    wifAnalysis.blanks[wifInput.group.questions[1].id].answer = 'Whether'
    const ok = await analyzeGrammarFillImportCandidate(wifInput, {
      providerCallers: { deepseek: stubProvider(wifAnalysis) },
    })
    assert('C1: Whether (capitalized) matches whether/if answerKey', ok.analysis !== null)
  }

  // C1: 'whether' (lowercase) matches 'whether/if'
  {
    const wifInput = JSON.parse(JSON.stringify(input))
    wifInput.group.questions[1].answerKey = 'whether/if'
    const wifAnalysis = validGfAnalysis(wifInput)
    wifAnalysis.blanks[wifInput.group.questions[1].id].answer = 'whether'
    const ok = await analyzeGrammarFillImportCandidate(wifInput, {
      providerCallers: { deepseek: stubProvider(wifAnalysis) },
    })
    assert('C1: whether (lowercase) matches whether/if answerKey', ok.analysis !== null)
  }

  // C1: multi-word 'were worn' matches answerKey 'were worn'
  {
    const wwInput = JSON.parse(JSON.stringify(input))
    wwInput.group.questions[0].answerKey = 'were worn'
    const wwAnalysis = validGfAnalysis(wwInput)
    wwAnalysis.blanks[wwInput.group.questions[0].id].answer = 'were worn'
    wwAnalysis.blanks[wwInput.group.questions[0].id].blankType = 'given'
    wwAnalysis.blanks[wwInput.group.questions[0].id].hint = 'wear'
    const ok = await analyzeGrammarFillImportCandidate(wwInput, {
      providerCallers: { deepseek: stubProvider(wwAnalysis) },
    })
    assert('C1: were worn multi-word matches answerKey', ok.analysis !== null)
  }

  // C1: 'worn' MUST NOT pass for 'wore' — no stemming/lemmatization FORBIDDEN
  await assertRejects('C1: worn-for-wore fails (no stemming)', () => {
    const bad = validGfAnalysis(input)
    // q56 answerKey = 'wore', AI says 'worn' — different form
    bad.blanks[input.group.questions[0].id].answer = 'worn'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /答案解析版不一致/)

  // C1: genuine wrong answer is non-retryable
  let answerConflictTrials = 0
  const conflictStub = async () => {
    answerConflictTrials += 1
    const bad = validGfAnalysis(input)
    bad.blanks[input.group.questions[0].id].answer = 'walked'
    return { rawText: JSON.stringify(bad), provider: 'stub', model: 'stub', latencyMs: 1 }
  }
  await assertRejects('C1: genuine wrong answer blocks grammar-fill', () =>
    analyzeGrammarFillImportCandidate(input, {
      providerCallers: { deepseek: conflictStub },
      analysisRetries: 3,
    }),
  /答案解析版不一致/)
  assert('C1: answer conflict does not retry (called exactly once)', answerConflictTrials === 1, `called ${answerConflictTrials} times`)

  // ============================================================
  // C2 — facetKey validation (17 leaves, parent rejection, blank_type match)
  // ============================================================

  // C2: bad facetKey (not in registry)
  await assertRejects('C2: bad facetKey blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].facetKey = 'grammar-fill.given.verb.imperative'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /17 个合法叶节点|facetKey/)

  // C2: parent node used as facetKey
  await assertRejects('C2: parent-as-leaf blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].facetKey = 'grammar-fill.given.verb'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /父节点|facetKey/)

  await assertRejects('C2: parent grammar-fill as leaf blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].facetKey = 'grammar-fill'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /父节点|facetKey/)

  // C2: blank_type mismatch (no-hint blank uses a given facet)
  await assertRejects('C2: blank_type mismatch blocks (no-hint blank with given facet)', () => {
    const bad = validGfAnalysis(input)
    // q57 is no-hint (no prompt), use a given facet key
    const noHintQ = input.group.questions.find((q) => !q.prompt)
    bad.blanks[noHintQ.id].facetKey = 'grammar-fill.given.verb.finite'
    // blankType is still no-hint, so blank_type mismatch
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /blank_type|blankType/)

  // C2: role/path on non-non-finite blocks
  await assertRejects('C2: role on non-non-finite blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    // first blank uses grammar-fill.given.verb.finite, set role
    bad.blanks[firstKey].facetKey = 'grammar-fill.given.verb.finite'
    bad.blanks[firstKey].role = 'subject'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /role|only.*non-finite|non-finite/)

  // C2: non-finite blank REQUIRES role and path
  await assertRejects('C2: non-finite without role blocks', () => {
    const bad = validGfAnalysis(input)
    const givenKey = input.group.questions.find((q) => q.prompt)
    bad.blanks[givenKey.id].facetKey = 'grammar-fill.given.verb.non-finite'
    bad.blanks[givenKey.id].role = null
    bad.blanks[givenKey.id].path = 'fast'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /role/)

  // C2: non-finite blank with valid role and path passes
  {
    const good = validGfAnalysis(input)
    const givenKey = input.group.questions.find((q) => q.prompt)
    good.blanks[givenKey.id].facetKey = 'grammar-fill.given.verb.non-finite'
    good.blanks[givenKey.id].role = 'adverbial'
    good.blanks[givenKey.id].path = 'slow'
    const ok = await analyzeGrammarFillImportCandidate(input, {
      providerCallers: { deepseek: stubProvider(good) },
    })
    assert('C2: non-finite with valid role+path passes', ok.analysis.schemaVersion === 'grammar-fill-analysis-v2')
  }

  // ============================================================
  // C3 — evidence: exact-substring + no blank marker
  // ============================================================

  // Evidence non-substring blocks
  await assertRejects('C3: evidence non-substring blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence[0].signalText = 'THIS TEXT IS NOT IN THE PASSAGE AT ALL'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /精确匹配原文/)

  // SW-2: signalText containing a blank marker ('  56  ') blocks
  await assertRejects('SW-2: signalText with blank marker  56  blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    // The passage contains '  56  ' — use it as signalText (this contains the marker)
    bad.blanks[firstKey].evidence[0].signalText = '  56  '
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /空格标记/)

  // SW-2: signalText containing hint '(wear)' token blocks
  await assertRejects('SW-2: signalText with (wear) hint token blocks', () => {
    const bad = validGfAnalysis(input)
    const firstKey = Object.keys(bad.blanks)[0]
    bad.blanks[firstKey].evidence[0].signalText = '(wear)'
    return analyzeGrammarFillImportCandidate(input, { providerCallers: { deepseek: stubProvider(bad) } })
  }, /空格标记/)
}

// ============================================================
// Prompt building
// ============================================================

function assertPromptBuilding() {
  const input = gfFixtureInput()
  const messages = buildGrammarFillAnalysisMessages(input)
  assert('grammar-fill messages include system prompt', messages.length === 2 && messages[0].role === 'system')
  const systemContent = messages[0].content
  assert('grammar-fill system prompt has inline JSON output requirement', systemContent.includes('JSON object') && systemContent.includes('Do NOT create or download a file'))
  const userContent = messages[1].content
  assert('grammar-fill user message includes paperId', userContent.includes(input.paper.paperId))
  assert('grammar-fill user message includes groupId', userContent.includes(input.group.groupId))
  assert('grammar-fill user message includes answerKey', userContent.includes('"answerKey"'))
  // SW-1: no options field
  assert('grammar-fill user message does NOT require options', !userContent.includes('"options":'))
}

// ============================================================
// Step 4 — Package + route + storage + validator wiring
// ============================================================

function gfPackageParseResult() {
  const paper = {
    paperId: 'paper-i13-package',
    sourceFilename: 'i13-package.docx',
    sourceHash: 'a'.repeat(64),
    answerSourceFilename: 'i13-package-answer.docx',
  }
  const readingGroups = ['A', 'B', 'C', 'D'].map((label, index) => {
    const lower = label.toLowerCase()
    const groupId = `group-i13-package-reading-${lower}`
    return {
      groupId,
      title: `Reading ${label}`,
      order: index,
      paragraphs: [{ id: `para-i13-${lower}-p1`, text: `Reading ${label} passage text.` }],
      questions: [{
        id: `q-i13-package-${String(21 + index).padStart(3, '0')}`,
        stem: `Question ${21 + index}?`,
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answerKey: 'A',
      }],
    }
  })
  const clozeQuestionNos = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]
  return {
    paper,
    readingGroups,
    skipped: [],
    sevenChoicesGroup: {
      groupId: 'group-i13-package-seven-choices',
      groupType: 'sevenChoices',
      title: '七选五',
      order: 4,
      paragraphs: [{ id: 'para-i13-seven-p1', text: 'Seven choices passage. 36 , keep these things in mind.' }],
      optionBank: 'ABCDEFG'.split('').map((l) => ({ label: l, text: `Option ${l} text` })),
      questions: [36, 37, 38, 39, 40].map((no) => ({
        id: `q-i13-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'B',
        blankId: `blank-i13-package-${String(no).padStart(3, '0')}`,
      })),
      blankIds: [36, 37, 38, 39, 40].map((no) => `blank-i13-package-${String(no).padStart(3, '0')}`),
    },
    clozeGroup: {
      groupId: 'group-i13-package-cloze',
      groupType: 'cloze',
      title: '完形填空',
      order: 5,
      paragraphs: [{ id: 'para-i13-cloze-p1', text: 'The boy walked slowly into the room.' }],
      questions: clozeQuestionNos.map((no, index) => ({
        id: `q-i13-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: ['A', 'B', 'C', 'D'][index % 4],
        blankId: `blank-i13-package-${String(no).padStart(3, '0')}`,
        options: { A: 'walked', B: 'ran', C: 'jumped', D: 'swam' },
      })),
      blankIds: clozeQuestionNos.map((no) => `blank-i13-package-${String(no).padStart(3, '0')}`),
    },
    grammarFillGroup: {
      groupId: 'group-i13-package-grammar-fill',
      groupType: 'grammarFill',
      title: '语法填空',
      order: 6,
      paragraphs: [{ id: 'para-i13-gf-p1', text: FIXTURE_PASSAGE_TEXT }],
      questions: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => ({
        id: `q-i13-package-${String(no).padStart(3, '0')}`,
        stem: String(no),
        answerKey: 'word',
        blankId: `blank-i13-package-${String(no).padStart(3, '0')}`,
        prompt: null,
      })),
      blankIds: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65].map((no) => `blank-i13-package-${String(no).padStart(3, '0')}`),
    },
    applicationGroup: {
      groupId: 'group-i13-package-writing-application',
      groupType: 'writing',
      title: '应用文写作',
      order: 7,
      paragraphs: [{ id: 'para-i13-app-p1', text: '应用文写作场景.' }],
      questions: [],
    },
    continuationGroup: {
      groupId: 'group-i13-package-writing-continuation',
      groupType: 'writing',
      title: '读后续写',
      order: 8,
      paragraphs: [{ id: 'para-i13-cont-p1', text: 'Continuation material text.' }],
      continuationStarters: ['Paragraph 1 starter.', 'Paragraph 2 starter.'],
      questions: [],
    },
  }
}

function gfFixtureReadingAnalyses(parseResult) {
  return Object.fromEntries(
    parseResult.readingGroups.map((group) => [
      group.groupId,
      {
        schemaVersion: 'reading-choice-analysis-v1',
        paperId: parseResult.paper.paperId,
        sourceAssetVersion: 1,
        targetGroups: [group.groupId],
        meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'reading-choice-analysis-v1', reviewStatus: 'reviewed' },
        groups: { [group.groupId]: { overview: `${group.title} 概览。` } },
        questions: Object.fromEntries(group.questions.map((q) => [
          q.id,
          {
            skill: { primary: 'detail' },
            questionFocus: q.stem,
            stemTranslationZh: '题干翻译',
            optionAnalysis: ['A', 'B', 'C', 'D'].map((label) => ({
              label, optionTranslationZh: `${label} 选项`, status: label === q.answerKey ? 'correct' : 'wrong',
            })),
            locationParaphrases: [],
          },
        ])),
      },
    ]),
  )
}

function gfFixtureSevenChoicesAnalysis(parseResult) {
  const sc = parseResult.sevenChoicesGroup
  return {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [sc.groupId],
    meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'seven-choices-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [sc.groupId]: { overview: '七选五概览。' } },
    questions: Object.fromEntries(sc.questions.map((q) => [
      q.id,
      {
        blankId: q.blankId,
        positionFacet: 'seven-choices.position.paragraph-middle',
        roleFacet: 'seven-choices.role.cohesion',
        primaryMechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment',
        topicClues: ['running', 'training'],
        contextEvidence: { paragraphId: sc.paragraphs[0].id, beforeQuote: 'Seven choices passage', afterQuote: 'keep these things' },
        mechanismSignals: [
          { mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment', signalText: 'keep these things', signalSide: 'context-after', targetText: 'training', relation: '话题场匹配。' },
          { mechanismFacet: 'seven-choices.cohesion.lexical.topic-field-alignment', signalText: 'Option B text', signalSide: 'option', targetText: 'training', relation: '选项匹配。' },
        ],
        optionFit: { correctOptionLabel: q.answerKey, fitSummary: '选项与上下文匹配。', matchedClues: [] },
        teachingNote: '话题场匹配解题。',
      },
    ])),
  }
}

function gfFixtureClozeAnalysis(parseResult) {
  const cl = parseResult.clozeGroup
  const blanks = {}
  for (const q of cl.questions) {
    const no = Number(q.stem)
    const distractorLabels = ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey)
    blanks[q.id] = {
      blankId: q.blankId,
      blankNo: no,
      pos: 'verb',
      correctFit: { optionLabel: q.answerKey, reason: '搭配合理。' },
      distractorGlosses: distractorLabels.map((l) => ({
        optionLabel: l,
        optionText: q.options[l],
        meaning: `表示"${q.options[l]}"。`,
      })),
      evidence: [{ type: 'collocation-partner', signalText: 'slowly', signalSide: 'context-before', targetText: 'walked', relation: '副词修饰。' }],
      teachingNote: '通过施受关系判断。',
    }
  }
  return {
    schemaVersion: 'cloze-analysis-v1',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [cl.groupId],
    meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [cl.groupId]: { overview: '一篇记叙文。', affectiveArc: '平静。' } },
    blanks,
  }
}

function gfFixtureGrammarFillAnalysis(parseResult) {
  const gf = parseResult.grammarFillGroup
  return {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [gf.groupId],
    meta: { generatedBy: 'external-ai', model: 'stub', promptVersion: 'grammar-fill-analysis-v2', reviewStatus: 'reviewed' },
    groups: { [gf.groupId]: { overview: '一篇关于派对的记叙文。' } },
    blanks: Object.fromEntries(gf.questions.map((q) => [
      q.id,
      {
        blankId: q.blankId, blankNo: Number(q.stem),
        blankType: 'no-hint', hint: null,
        facetKey: 'grammar-fill.no-hint.preposition',
        answer: q.answerKey,
        role: null, path: null,
        reason: '介词填空示例。',
        evidence: [{ type: 'governing-word', signalText: 'Yesterday', signalSide: 'passage', relation: '时间词示例。' }],
        teachingNote: '通过搭配判断介词。',
      },
    ])),
  }
}

async function assertPackageBuilder() {
  const parseResult = gfPackageParseResult()
  const sourceBuffer = Buffer.from('PK i13 grammar-fill package docx')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  parseResult.paper.sourceHash = sourceHash

  // Successful build
  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: gfFixtureReadingAnalyses(parseResult),
    sevenChoicesGroup: parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: gfFixtureSevenChoicesAnalysis(parseResult),
    clozeGroup: parseResult.clozeGroup,
    clozeAnalysis: gfFixtureClozeAnalysis(parseResult),
    grammarFillGroup: parseResult.grammarFillGroup,
    grammarFillAnalysis: gfFixtureGrammarFillAnalysis(parseResult),
    applicationGroup: parseResult.applicationGroup,
    continuationGroup: parseResult.continuationGroup,
    sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
  })
  assert('I13 package includes grammar-fill-analysis-v1.json', files.some((f) => f.fileName === 'grammar-fill-analysis-v1.json'))
  const gfFile = files.find((f) => f.fileName === 'grammar-fill-analysis-v1.json')
  assert('I13 grammar-fill analysis file is valid JSON', gfFile && gfFile.buffer.length > 10)
  const gfAnalysis = JSON.parse(gfFile.buffer.toString())
  assert('I13 grammar-fill analysis has correct schemaVersion', gfAnalysis.schemaVersion === 'grammar-fill-analysis-v2')
  assert('I13 grammar-fill analysis has 10 blanks', Object.keys(gfAnalysis.blanks).length === 10)

  // C7 validator round-trip
  const validation = validatePaperImportPackage(files)
  assert('I13 package passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  // MF-3: missing grammar-fill analysis blocks publish
  await assertRejects('I13 blocks publish when grammar-fill analysis missing (MF-3)', () =>
    buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: gfFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: gfFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: gfFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis: null,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    }),
  /缺少 AI 解析/)

  // paperId mismatch blocks
  await assertRejects('I13 blocks when grammar-fill analysis paperId mismatches', () => {
    const badAnalysis = { ...gfFixtureGrammarFillAnalysis(parseResult), paperId: 'paper-wrong' }
    return buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: gfFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: gfFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: gfFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis: badAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    })
  }, /paperId/)

  // targetGroups mismatch blocks
  await assertRejects('I13 blocks when grammar-fill analysis missing targetGroups', () => {
    const badAnalysis = { ...gfFixtureGrammarFillAnalysis(parseResult), targetGroups: ['group-different'] }
    return buildPaperImportAiPackageFiles({
      parseResult,
      analysesByGroupId: gfFixtureReadingAnalyses(parseResult),
      sevenChoicesGroup: parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: gfFixtureSevenChoicesAnalysis(parseResult),
      clozeGroup: parseResult.clozeGroup,
      clozeAnalysis: gfFixtureClozeAnalysis(parseResult),
      grammarFillGroup: parseResult.grammarFillGroup,
      grammarFillAnalysis: badAnalysis,
      applicationGroup: parseResult.applicationGroup,
      continuationGroup: parseResult.continuationGroup,
      sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
    })
  }, /题组/)
}

// ============================================================
// Validator allowlist
// ============================================================

function assertValidatorAllowlist() {
  assert('grammar-fill-analysis-v2 in PAPER_IMPORT_SCHEMA_VERSIONS', PAPER_IMPORT_SCHEMA_VERSIONS.has('grammar-fill-analysis-v2'))
}

// ============================================================
// MF-2: Storage disk write — ON-DISK analyses/grammar-fill-analysis-v1.json
// ============================================================

function assertStorageDiskWrite() {
  const parseResult = gfPackageParseResult()
  const sourceBuffer = Buffer.from('PK i13 storage test docx')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  parseResult.paper.sourceHash = sourceHash

  const files = buildPaperImportAiPackageFiles({
    parseResult,
    analysesByGroupId: gfFixtureReadingAnalyses(parseResult),
    sevenChoicesGroup: parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: gfFixtureSevenChoicesAnalysis(parseResult),
    clozeGroup: parseResult.clozeGroup,
    clozeAnalysis: gfFixtureClozeAnalysis(parseResult),
    grammarFillGroup: parseResult.grammarFillGroup,
    grammarFillAnalysis: gfFixtureGrammarFillAnalysis(parseResult),
    applicationGroup: parseResult.applicationGroup,
    continuationGroup: parseResult.continuationGroup,
    sourceDocx: { fileName: parseResult.paper.sourceFilename, buffer: sourceBuffer },
  })

  const validation = validatePaperImportPackage(files)
  if (!validation.ok) {
    throw new Error(`Storage test: package validation failed:\n${JSON.stringify(validation.blockingIssues, null, 2)}`)
  }

  // Write to a temp directory
  const tmpDir = path.join(os.tmpdir(), `i13-storage-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  try {
    const { versionDir } = writePaperImportVersion({
      paperAssetsDir: tmpDir,
      packageData: validation.packageData,
      validationReport: { ok: true },
      publishReport: { ok: true },
      version: 1,
    })

    // After write: versioned path must have grammar-fill-analysis-v1.json
    const versionedGfAnalysisPath = path.join(versionDir, 'analyses', 'grammar-fill-analysis-v1.json')
    assert('MF-2: versioned grammar-fill-analysis-v1.json written to disk', existsSync(versionedGfAnalysisPath))

    // After swap: latest path must have grammar-fill-analysis-v1.json
    swapPaperImportLatest({
      paperAssetsDir: tmpDir,
      paperId: parseResult.paper.paperId,
      versionDir,
    })
    const latestGfAnalysisPath = path.join(tmpDir, parseResult.paper.paperId, 'latest', 'analyses', 'grammar-fill-analysis-v1.json')
    assert('MF-2: latest/analyses/grammar-fill-analysis-v1.json written to disk after swap', existsSync(latestGfAnalysisPath))

    // Content check
    const written = JSON.parse(readFileSync(latestGfAnalysisPath, 'utf8'))
    assert('MF-2: written grammar-fill analysis has correct schemaVersion', written.schemaVersion === 'grammar-fill-analysis-v2')
    assert('MF-2: written grammar-fill analysis has 10 blanks', Object.keys(written.blanks || {}).length === 10)
    // sourceAssetVersion is re-stamped
    assert('MF-2: written grammar-fill analysis has sourceAssetVersion = 1', written.sourceAssetVersion === 1)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  // Step 2: Prompt + registry contract
  assertPromptContract()
  assertRegistryContract()

  // Step 3: Prompt building + analysis validation
  assertPromptBuilding()
  await assertAnalysisValidation()

  // Step 4: Wiring
  assertValidatorAllowlist()
  await assertPackageBuilder()
  assertStorageDiskWrite()

  console.log(`\nI13 grammar-fill analysis verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
