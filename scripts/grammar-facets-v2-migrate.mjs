#!/usr/bin/env node
/**
 * grammar-facets-v2 — D1 step 1/3: dry-run preview + step-3 write-back.
 *
 * Reads the 33 latest `grammar-fill-analysis-v1` files, re-derives each
 * blank's v2 facetKey + new fields per docs/cuts/grammar-facets-v2/plan.md
 * (owner-locked semantics in docs/cuts/similar-questions/program.md
 * §语法填空考点粒度终稿), and writes a preview + suspects list + owner
 * sampling material.
 *
 * Default mode is DRY-RUN ONLY:
 *   - does NOT write back into any analysis file
 *   - is fully deterministic (no AI calls) — anything the rules cannot
 *     decide goes to suspects.md for owner judgement, never guessed.
 *
 * `--write` mode (step 3, post owner sign-off 2026-07-15 — the 8 suspects'
 * owner-decided disposition is IDENTICAL to this script's own proposed
 * facetKey/role for every one of them, verified by hand against
 * docs/cuts/grammar-facets-v2/suspects.md, so no extra override table is
 * needed): rewrites each of the 33 on-disk files in place —
 *   - `schemaVersion` bumped to `grammar-fill-analysis-v2`
 *   - each blank's `facetKey` (+ `role` for non-finite) updated to its v2
 *     value, `tense`/`voice`/`agreementSensitive` added for finite verbs,
 *     `form` added for non-finite verbs
 *   - a `.bak` copy of the pre-migration file is written alongside (never
 *     overwritten by a later `--write` run if one already exists, so the
 *     backup always holds the true v1 original)
 * Still does NOT touch analysisConfigs / similar engine / teachingFacets /
 * any consumer code — that is a separate, same-commit edit (plan step 3).
 *
 * Run: node scripts/grammar-facets-v2-migrate.mjs [--write]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

const WRITE = process.argv.includes('--write')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'docs/cuts/grammar-facets-v2')
const PREVIEW_PATH = path.join(OUT_DIR, 'step1-preview.json')
const SUSPECTS_PATH = path.join(OUT_DIR, 'suspects.md')
const SAMPLES_PATH = path.join(OUT_DIR, 'step1-samples.md')

// ── file discovery ───────────────────────────────────────────────────────
function findAnalysisFiles() {
  const pattern = path.join(REPO_ROOT, 'app/public/paper-assets/*/latest/analyses/grammar-fill-analysis-v1.json')
  const files = globSync(pattern).sort()
  return files
}

// ── shared tokenizer (same normalization as the retired analyzeGrammarFillVerbProfile.mjs) ──
function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

// ══════════════════════════════════════════════════════════════════════
// 1) Finite verb: tense / voice / agreementSensitive (answer-only, no AI)
// ══════════════════════════════════════════════════════════════════════

const BE_ANY = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'])
const BE_PRESENT = new Set(['am', 'is', 'are'])
const BE_PAST = new Set(['was', 'were'])
const HAVE_PRESENT = new Set(['have', 'has'])
const MODAL = new Set(['will', 'shall', 'can', 'could', 'may', 'might', 'must', 'should', 'would'])
// owner 2026-07-15 definition: agreementSensitive is a pure answer-surface bool,
// decoupled from the old subject-context `agreement` axis. Note 'had' is
// deliberately excluded (invariant across number, same as old LEAD_NA).
const AGREEMENT_SENSITIVE_TOKENS = new Set(['is', 'am', 'are', 'was', 'were', 'has', 'have', 'does'])

const VALID_TENSE = new Set(['present', 'past', 'present-perfect', 'past-perfect', 'progressive', 'other'])
const VALID_VOICE = new Set(['active', 'passive'])

/**
 * Derive {tense, voice, agreementSensitive} purely from the answer string
 * (+ hint lemma for the `be`-as-main-verb case). Reuses the same token-set
 * approach as the retired analyzeGrammarFillVerbProfile.mjs's
 * classifyFiniteVerbFormDeterministic (PA C-1 "复用不重造"), but is NOT a
 * copy-paste of that function: it is decoupled from the old subject-context
 * `agreement` axis (which required AI fallback for `have`-led forms) since
 * the new agreementSensitive definition never needs subject context.
 *
 * Returns null when no rule applies (should not happen for the current 52
 * finite blanks — verified by hand-checking every row — but any real miss
 * must fall through to the suspects list, never be guessed).
 */
function deriveVerbAxes({ hint, answer }) {
  const t = tokenize(answer)
  if (t.length === 0) return null
  const lead = t[0]
  const hintLemma = String(hint || '').toLowerCase().trim()
  const isBeHint = hintLemma === 'be'

  const hasIng = t.some((x) => x.endsWith('ing'))
  const hasBe = t.some((x) => BE_ANY.has(x))
  const hasHavePresent = t.some((x) => HAVE_PRESENT.has(x))
  const hasHad = t.includes('had')
  const hasModal = t.some((x) => MODAL.has(x))
  const last = t[t.length - 1]

  let tense = null
  if (hasModal) tense = 'other' // 情态动词结构 → other（registry note）
  else if (hasBe && hasIng) tense = 'progressive'
  else if (hasHavePresent) tense = 'present-perfect'
  else if (hasHad) tense = 'past-perfect'
  else if (t.some((x) => BE_PRESENT.has(x))) tense = 'present'
  else if (t.some((x) => BE_PAST.has(x))) tense = 'past'
  else if (lead === 'be') tense = 'other' // bare "be+pp": modal/infinitive governs it outside the blank
  else if (t.length === 1 && lead === hintLemma) tense = 'other' // bare form == hint lemma: imperative/subjunctive
  else if (/s$/.test(lead)) tense = 'present' // 3rd-person singular -s
  else if (/ed$/.test(lead) || lead !== hintLemma) tense = 'past' // regular -ed or irregular past
  else tense = null

  if (!VALID_TENSE.has(tense)) return null

  let voice
  if (isBeHint) voice = 'active'
  else if (hasBe && !last.endsWith('ing')) voice = 'passive'
  else voice = 'active'
  if (!VALID_VOICE.has(voice)) return null

  const agreementSensitive =
    t.some((x) => AGREEMENT_SENSITIVE_TOKENS.has(x)) || (/^[a-z]+s$/.test(last) && !AGREEMENT_SENSITIVE_TOKENS.has(last))

  return { tense, voice, agreementSensitive, method: 'deterministic-answer-surface' }
}

// ══════════════════════════════════════════════════════════════════════
// 2) Non-finite verb: role 7-way normalization + form
// ══════════════════════════════════════════════════════════════════════

const VALID_ROLE = new Set([
  'adverbial',
  'attributive',
  'subject',
  'object',
  'predicative',
  'object-complement',
  'subject-complement',
])

/**
 * Old role vocab had no `predicative` value at all — `subject-complement`
 * was overloaded for both real 主语补足语 (passive-of-object-complement,
 * e.g. "be expected to do") and 系动词 + 表语 cases (real predicative).
 * Likewise `object` was overloaded for real 宾语 and 宾语补足语.
 *
 * program.md 机审实锤 named 3 known instances; this rule is written
 * generically (keyword match against `reason`) so it also catches any
 * other instance of the same pattern rather than hardcoding the 3 qids.
 */
function remapNonFiniteRole({ role, reason }) {
  const r = String(reason || '')
  if (role === 'object' && /宾语补足语|宾补/.test(r)) {
    return { role: 'object-complement', suspect: true, note: 'reason 自述"宾补/宾语补足语"，旧标签为 object，改判 object-complement' }
  }
  if (role === 'subject-complement' && /系动词/.test(r)) {
    return {
      role: 'predicative',
      suspect: true,
      note: 'reason 显示"系动词"后接表语场景，旧标签 subject-complement 应为 predicative（表语），非主语补足语',
    }
  }
  return { role, suspect: false, note: null }
}

function deriveNonFiniteForm(answer) {
  const a = String(answer || '').trim()
  if (/^to\b/i.test(a)) return 'to-do'
  if (/^being\b/i.test(a) || /ing$/i.test(a)) return 'doing'
  return 'done'
}

// ══════════════════════════════════════════════════════════════════════
// 3) 词形转换八向 + 三新类剥离 (given.derivation.* / given.noun / given.adjective)
// ══════════════════════════════════════════════════════════════════════

// NOTE: 'y' (bare adjective, e.g. wealthy/daily) overlaps textually with the
// noun suffixes '-ity'/'-ty'/'-acy' (e.g. visibility/activity/accuracy all
// also end in "y"). NOUN_SUFFIXES must be checked BEFORE the bare 'y'
// adjective fallback, never the other way — see endsWithAny(word, 'adj').
const ADJ_SUFFIXES_SPECIFIC = ['ous', 'ic', 'al', 'ible', 'able', 'ful', 'less', 'ive', 'ent', 'ant', 'ary', 'ory', 'ish', 'ed']
const NOUN_SUFFIXES = ['ity', 'ty', 'ness', 'ence', 'ance', 'tion', 'sion', 'ment', 'acy', 'ism', 'age', 'ery', 'ship', 'dom', 'hood']

function endsWithAny(word, suffixes) {
  const w = word.toLowerCase()
  return suffixes.some((s) => w.endsWith(s))
}

/** Adjective check that never lets a noun-suffix word (visibility, accuracy) slip
 * through the generic bare-"y" adjective fallback (wealthy, daily). */
function looksLikeAdjectiveSuffix(word) {
  if (endsWithAny(word, NOUN_SUFFIXES)) return false
  if (endsWithAny(word, ADJ_SUFFIXES_SPECIFIC)) return true
  return /y$/i.test(String(word || '').trim())
}

function isGenitive(answer) {
  return /['’]s$/.test(String(answer || '').trim())
}

function normalizeBritishSpelling(word) {
  return String(word || '').toLowerCase().replace(/our/g, 'or')
}

function isRegularPluralOf(hint, answer) {
  const h = normalizeBritishSpelling(hint).trim()
  const a = normalizeBritishSpelling(answer).trim().toLowerCase()
  if (!h || !a) return false
  const candidates = new Set([h + 's', h + 'es'])
  if (/[^aeiou]y$/.test(h)) candidates.add(h.slice(0, -1) + 'ies')
  if (/[^f]fe$/.test(h)) candidates.add(h.slice(0, -2) + 'ves')
  if (/[^e]f$/.test(h)) candidates.add(h.slice(0, -1) + 'ves')
  return candidates.has(a)
}

const IRREGULAR_COMPARATIVES = new Set(['better', 'best', 'worse', 'worst', 'further', 'farther', 'furthest', 'farthest', 'less', 'least', 'more', 'most'])

function isComparativeOrSuperlative(hint, answer) {
  const a = String(answer || '').trim().toLowerCase()
  if (IRREGULAR_COMPARATIVES.has(a)) return true
  return /er$/.test(a) || /est$/.test(a)
}

function isAdverbFromAdjective(answer) {
  return /ly$/i.test(String(answer || '').trim())
}

/** given.adjective (28 blanks): split into adjective-to-adverb / comparison / adjective-to-noun. */
function classifyGivenAdjective({ hint, answer }) {
  if (isAdverbFromAdjective(answer)) {
    return { facetKey: 'grammar-fill.given.conversion.adjective-to-adverb', suspect: false, note: null }
  }
  if (isComparativeOrSuperlative(hint, answer)) {
    return { facetKey: 'grammar-fill.given.adjective.comparison', suspect: false, note: null }
  }
  if (endsWithAny(answer, NOUN_SUFFIXES)) {
    return { facetKey: 'grammar-fill.given.conversion.adjective-to-noun', suspect: false, note: null }
  }
  return {
    facetKey: 'grammar-fill.given.conversion.adjective-to-noun',
    suspect: true,
    note: `given.adjective 空规则无法判定（非 -ly / 非比较级 / 答案无常见名词后缀），试标 adjective-to-noun 待核`,
  }
}

/** given.noun (22 blanks): split into genitive / number, else flag (noun-to-noun / adjective-to-noun mis-file). */
function classifyGivenNoun({ hint, answer }) {
  if (isGenitive(answer)) {
    return { facetKey: 'grammar-fill.given.noun.genitive', suspect: false, note: null }
  }
  if (isRegularPluralOf(hint, answer)) {
    return { facetKey: 'grammar-fill.given.noun.number', suspect: false, note: null }
  }
  if (/ness$/i.test(answer)) {
    return {
      facetKey: 'grammar-fill.given.conversion.adjective-to-noun',
      suspect: true,
      note: `旧标签 given.noun 但 answer 以 -ness 结尾（经典形→名后缀），hint "${hint}" 疑为形容词，非名词单复数/所有格；程序性证据见 program.md "rich→richness 挂名词桶"`,
    }
  }
  return {
    facetKey: 'grammar-fill.given.conversion.noun-to-noun',
    suspect: true,
    note: `旧标签 given.noun，answer 非 hint 的规则复数/所有格形（疑为派生，如职业后缀 -er/-or），试标 noun-to-noun 待核`,
  }
}

const DERIVATION_RENAME = {
  'grammar-fill.given.derivation.noun-to-adj': 'grammar-fill.given.conversion.noun-to-adjective',
  'grammar-fill.given.derivation.verb-to-noun': 'grammar-fill.given.conversion.verb-to-noun',
  'grammar-fill.given.derivation.verb-to-adj': 'grammar-fill.given.conversion.verb-to-adjective',
  'grammar-fill.given.derivation.adjective-to-noun': 'grammar-fill.given.conversion.adjective-to-noun',
}

/** Old 4-way given.derivation.* buckets: rename + sanity-check the answer's own suffix against the bucket's implied target POS. */
function classifyDerivation({ oldFacetKey, hint, answer }) {
  const renamed = DERIVATION_RENAME[oldFacetKey]
  if (oldFacetKey === 'grammar-fill.given.derivation.noun-to-adj') {
    // target POS should be adjective; if answer looks like a noun instead
    // (and not also adjective-shaped), the direction is really reversed.
    const looksAdj = looksLikeAdjectiveSuffix(answer)
    const looksNoun = endsWithAny(answer, NOUN_SUFFIXES)
    if (!looksAdj && looksNoun) {
      return {
        facetKey: 'grammar-fill.given.conversion.adjective-to-noun',
        suspect: true,
        note: `旧标签 noun-to-adj，但 answer "${answer}" 以名词后缀结尾、非形容词后缀；hint "${hint}" 疑为形容词，方向应为 adjective-to-noun`,
      }
    }
    return { facetKey: renamed, suspect: false, note: null }
  }
  if (oldFacetKey === 'grammar-fill.given.derivation.verb-to-noun') {
    // "-acy" is a distinctly deadjectival noun suffix (accurate→accuracy,
    // private→privacy) as opposed to the deverbal "-ation" family
    // (educate→education). Flag this narrow, generalizable pattern.
    if (/acy$/i.test(answer)) {
      return {
        facetKey: 'grammar-fill.given.conversion.adjective-to-noun',
        suspect: true,
        note: `旧标签 verb-to-noun，但 answer "${answer}" 以 -acy 结尾（经典形→名后缀，如 accurate→accuracy），hint "${hint}" 疑为形容词非动词，方向应为 adjective-to-noun`,
      }
    }
    return { facetKey: renamed, suspect: false, note: null }
  }
  return { facetKey: renamed, suspect: false, note: null }
}

// ══════════════════════════════════════════════════════════════════════
// main
// ══════════════════════════════════════════════════════════════════════

function paperIdFromPath(filePath) {
  const m = filePath.match(/paper-assets\/([^/]+)\/latest\/analyses/)
  return m ? m[1] : null
}

/** Build the v2 on-disk blank object from the original v1 blank + this
 * script's own computed classification (processBlank's `entry`). Preserves
 * every other original field (blankId/blankNo/blankType/hint/answer/path/
 * reason/evidence/teachingNote/...) via spread — only facetKey/role are
 * overwritten and tense/voice/agreementSensitive/form are added. */
function buildV2Blank(oldBlank, entry) {
  const v2 = { ...oldBlank, facetKey: entry.newFacetKey }
  if (entry.newFacetKey === 'grammar-fill.given.verb.finite') {
    v2.tense = entry.tense
    v2.voice = entry.voice
    v2.agreementSensitive = entry.agreementSensitive
  }
  if (entry.newFacetKey === 'grammar-fill.given.verb.non-finite') {
    v2.role = entry.role
    v2.form = entry.form
  }
  return v2
}

function processBlank({ paperId, questionId, blank }) {
  const oldFacetKey = blank.facetKey
  const hint = blank.hint
  const answer = blank.answer
  const role = blank.role
  const reason = blank.reason

  const base = {
    paperId,
    questionId,
    oldFacetKey,
    hint,
    answer,
    oldRole: role,
  }

  if (oldFacetKey === 'grammar-fill.given.verb.finite') {
    const axes = deriveVerbAxes({ hint, answer })
    if (!axes) {
      return {
        entry: { ...base, newFacetKey: oldFacetKey, tense: null, voice: null, agreementSensitive: null },
        suspect: { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: 'tense/voice 规则无法判定（answer 形态未覆盖），需 owner 判例' },
      }
    }
    return {
      entry: { ...base, newFacetKey: oldFacetKey, tense: axes.tense, voice: axes.voice, agreementSensitive: axes.agreementSensitive },
      suspect: null,
    }
  }

  if (oldFacetKey === 'grammar-fill.given.verb.non-finite') {
    const remap = remapNonFiniteRole({ role, reason })
    const form = deriveNonFiniteForm(answer)
    if (!VALID_ROLE.has(remap.role)) {
      return {
        entry: { ...base, newFacetKey: oldFacetKey, role: role, form },
        suspect: { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: `role 值 "${remap.role}" 不在七格白名单，需 owner 判例` },
      }
    }
    const entry = { ...base, newFacetKey: oldFacetKey, role: remap.role, form }
    return {
      entry,
      suspect: remap.suspect
        ? { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: remap.note, proposedRole: remap.role }
        : null,
    }
  }

  if (oldFacetKey === 'grammar-fill.given.adjective') {
    const c = classifyGivenAdjective({ hint, answer })
    return {
      entry: { ...base, newFacetKey: c.facetKey },
      suspect: c.suspect ? { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: c.note, proposedFacetKey: c.facetKey } : null,
    }
  }

  if (oldFacetKey === 'grammar-fill.given.noun') {
    const c = classifyGivenNoun({ hint, answer })
    return {
      entry: { ...base, newFacetKey: c.facetKey },
      suspect: c.suspect ? { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: c.note, proposedFacetKey: c.facetKey } : null,
    }
  }

  if (oldFacetKey in DERIVATION_RENAME) {
    const c = classifyDerivation({ oldFacetKey, hint, answer })
    return {
      entry: { ...base, newFacetKey: c.facetKey },
      suspect: c.suspect ? { ...base, reasonSnippet: (reason || '').slice(0, 100), issue: c.note, proposedFacetKey: c.facetKey } : null,
    }
  }

  // no-hint.* / given.pronoun / given.numeral: unchanged pass-through
  return { entry: { ...base, newFacetKey: oldFacetKey }, suspect: null }
}

function run() {
  const files = findAnalysisFiles()
  if (files.length !== 33) {
    console.warn(`WARNING: expected 33 analysis files, found ${files.length}`)
  }

  const previewByQuestionId = {}
  const suspects = []
  let totalBlanks = 0
  let filesWritten = 0

  for (const file of files) {
    const paperId = paperIdFromPath(file)
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const blanks = data.blanks || {}
    const newBlanks = WRITE ? {} : null
    for (const [questionId, blank] of Object.entries(blanks)) {
      totalBlanks += 1
      const { entry, suspect } = processBlank({ paperId, questionId, blank })
      previewByQuestionId[questionId] = entry
      if (suspect) suspects.push(suspect)
      if (WRITE) newBlanks[questionId] = buildV2Blank(blank, entry)
    }

    if (WRITE) {
      const backupPath = `${file}.bak`
      // Never clobber an existing backup on a re-run — it must always hold
      // the true pre-migration v1 original.
      if (!existsSync(backupPath)) {
        writeFileSync(backupPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
      }
      const newData = { ...data, schemaVersion: 'grammar-fill-analysis-v2', blanks: newBlanks }
      writeFileSync(file, JSON.stringify(newData, null, 2) + '\n', 'utf8')
      filesWritten += 1
    }
  }

  // ── distribution stats ──
  const newFacetCounts = {}
  const tenseCounts = {}
  const roleCounts = {}
  for (const entry of Object.values(previewByQuestionId)) {
    newFacetCounts[entry.newFacetKey] = (newFacetCounts[entry.newFacetKey] || 0) + 1
    if (entry.newFacetKey === 'grammar-fill.given.verb.finite') {
      tenseCounts[entry.tense] = (tenseCounts[entry.tense] || 0) + 1
    }
    if (entry.newFacetKey === 'grammar-fill.given.verb.non-finite') {
      roleCounts[entry.role] = (roleCounts[entry.role] || 0) + 1
    }
  }

  const sortedFacetCounts = Object.entries(newFacetCounts).sort((a, b) => b[1] - a[1])

  console.log(`== grammar-facets-v2 migrate: dry-run preview ==`)
  console.log(`files: ${files.length}, blanks: ${totalBlanks}`)
  console.log(`\nv2 facetKey distribution:`)
  for (const [k, v] of sortedFacetCounts) console.log(`  ${k}: ${v}`)
  console.log(`\nfinite-verb tense distribution:`)
  for (const [k, v] of Object.entries(tenseCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
  console.log(`\nnon-finite role distribution:`)
  for (const [k, v] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
  console.log(`\nsuspects: ${suspects.length}`)

  // ── write preview JSON ──
  const preview = {
    schemaVersion: 'grammar-facets-v2-migrate-preview-v1',
    generatedAt: '2026-07-15', // fixed logical date for idempotent diffs; NOT wall-clock
    fileCount: files.length,
    blankCount: totalBlanks,
    facetDistribution: Object.fromEntries(sortedFacetCounts),
    tenseDistribution: tenseCounts,
    roleDistribution: roleCounts,
    suspectCount: suspects.length,
    blanks: previewByQuestionId,
  }
  writeFileSync(PREVIEW_PATH, JSON.stringify(preview, null, 2) + '\n', 'utf8')

  // ── write suspects.md ──
  const suspectLines = []
  suspectLines.push('# grammar-facets-v2 D1 step1 — 嫌疑名单')
  suspectLines.push('')
  suspectLines.push(`共 ${suspects.length} 条（上限 20）。每条为脚本判定不确定/规则与旧标签冲突的空，需 owner 抽验判例。`)
  suspectLines.push('')
  for (const s of suspects) {
    suspectLines.push(`## ${s.paperId} / ${s.questionId}`)
    suspectLines.push(`- answer: \`${s.answer}\`　hint: \`${s.hint}\`　旧 facetKey: \`${s.oldFacetKey}\`${s.oldRole ? `　旧 role: \`${s.oldRole}\`` : ''}`)
    if (s.proposedFacetKey) suspectLines.push(`- 试标 facetKey: \`${s.proposedFacetKey}\``)
    if (s.proposedRole) suspectLines.push(`- 试标 role: \`${s.proposedRole}\``)
    suspectLines.push(`- reason 摘要: ${s.reasonSnippet}`)
    suspectLines.push(`- 疑点: ${s.issue}`)
    suspectLines.push('')
  }
  writeFileSync(SUSPECTS_PATH, suspectLines.join('\n'), 'utf8')

  // ── write step1-samples.md (owner sampling material) ──
  const byFacet = {}
  for (const entry of Object.values(previewByQuestionId)) {
    if (!byFacet[entry.newFacetKey]) byFacet[entry.newFacetKey] = []
    byFacet[entry.newFacetKey].push(entry)
  }
  // deterministic "random" sample: stride-pick to stay idempotent across runs
  function pickThree(list) {
    if (list.length <= 3) return list
    const stride = Math.floor(list.length / 3)
    return [list[0], list[stride] || list[1], list[stride * 2] || list[2]]
  }

  const sampleLines = []
  sampleLines.push('# grammar-facets-v2 D1 step1 — 裁点抽样材料')
  sampleLines.push('')
  sampleLines.push('## 分布统计')
  sampleLines.push('')
  sampleLines.push('| v2 facetKey | 计数 |')
  sampleLines.push('|---|---|')
  for (const [k, v] of sortedFacetCounts) sampleLines.push(`| ${k} | ${v} |`)
  sampleLines.push('')
  sampleLines.push('### 谓语 tense 分布')
  sampleLines.push('')
  sampleLines.push('| tense | 计数 |')
  sampleLines.push('|---|---|')
  for (const [k, v] of Object.entries(tenseCounts).sort((a, b) => b[1] - a[1])) sampleLines.push(`| ${k} | ${v} |`)
  sampleLines.push('')
  sampleLines.push('### 非谓语 role 分布')
  sampleLines.push('')
  sampleLines.push('| role | 计数 |')
  sampleLines.push('|---|---|')
  for (const [k, v] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) sampleLines.push(`| ${k} | ${v} |`)
  sampleLines.push('')
  sampleLines.push('## 每个 v2 新类抽样 3 例')
  sampleLines.push('')
  for (const [facetKey, list] of Object.entries(byFacet).sort()) {
    sampleLines.push(`### ${facetKey} (共 ${list.length})`)
    sampleLines.push('')
    for (const s of pickThree(list)) {
      const extra = []
      if (s.tense) extra.push(`tense=${s.tense}`)
      if (s.voice) extra.push(`voice=${s.voice}`)
      if (typeof s.agreementSensitive === 'boolean') extra.push(`agreementSensitive=${s.agreementSensitive}`)
      if (s.role) extra.push(`role=${s.role}`)
      if (s.form) extra.push(`form=${s.form}`)
      sampleLines.push(`- ${s.paperId} / ${s.questionId} — hint=\`${s.hint}\` answer=\`${s.answer}\`${extra.length ? ' — ' + extra.join(', ') : ''}`)
    }
    sampleLines.push('')
  }
  writeFileSync(SAMPLES_PATH, sampleLines.join('\n'), 'utf8')

  console.log(`\nwrote ${PREVIEW_PATH}`)
  console.log(`wrote ${SUSPECTS_PATH}`)
  console.log(`wrote ${SAMPLES_PATH}`)
  if (WRITE) console.log(`\n--write: rewrote ${filesWritten} analysis files to grammar-fill-analysis-v2 (each backed up to .bak)`)

  return { totalBlanks, suspectCount: suspects.length, filesWritten }
}

run()
