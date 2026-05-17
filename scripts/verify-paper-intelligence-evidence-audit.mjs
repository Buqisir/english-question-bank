#!/usr/bin/env node
/**
 * verify-paper-intelligence-evidence-audit
 *
 * Two jobs:
 *
 *   1. Static architecture audit
 *      - The new evidence adapter must not import React / DOM / window /
 *        document / Playwright / fetch / any DB.
 *      - PaperIntelligencePreview.tsx must NOT have grown a hand-rolled
 *        evidence-matching engine in this cut.
 *      - Reading-analysis source files are not modified by this branch.
 *      - server / data / package.json / pnpm-lock.yaml are not modified.
 *
 *   2. Quote audit
 *      - Read app/public/reports/paper-intelligence/paper-2024-xkb1-reading
 *        /report.json (V0 report) and the parallel input.json (carries
 *        passageBody for verbatim audits).
 *      - Run the adapter and walk every (passage, question) pair.
 *      - For every claim that should hit passageBody — answerEvidence.quote,
 *        locatingSentence, answerSentence, every distractor.quote that is
 *        non-null — report whether it hits verbatim and if not WHY.
 *      - Distractors with no quote do not fail; they are tallied as
 *        text-only.
 *      - Print a structured summary; assert the counts.
 *
 * Hard rules:
 *   - The script never relaxes the verbatim rule.  If the sample report
 *     has a small historical quote slip, this script must fail loudly and
 *     point at the exact (questionNo, field, quote, reason) that needs
 *     fixing.
 *   - The only quote field allowed to be edited to fix audit failures is
 *     in the sample report itself (no schema / prompt / validator changes
 *     are permitted by this cut).
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import {
  toEvidenceModel,
  selectEvidence,
  buildSupportEvidenceId,
  buildTrapEvidenceId,
} from '../app/src/features/paper-intelligence/evidence/index.ts'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  \u2713 ${name}`) }
  else { failed++; console.error(`  \u2717 ${name}: ${detail || 'failed'}`) }
}

const REPORT_PATH = path.join(
  ROOT,
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json',
)
const INPUT_PATH = path.join(
  ROOT,
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json',
)

/* ─── 1. Static architecture audit ──────────────────────────────────── */

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

const adapterTs = readSrc('app/src/features/paper-intelligence/evidence/paperIntelligenceEvidence.ts')
const adapterTypesTs = readSrc('app/src/features/paper-intelligence/evidence/paperIntelligenceEvidenceTypes.ts')
const adapterIndexTs = readSrc('app/src/features/paper-intelligence/evidence/index.ts')
const adapterAll = adapterTs + '\n' + adapterTypesTs + '\n' + adapterIndexTs

assert(
  'evidence adapter: no React import',
  !/from ['"]react['"]|from ['"]react\//.test(adapterAll),
)
assert(
  'evidence adapter: no DOM / window / document references',
  !/\bwindow\.|\bdocument\.|HTMLElement|getBoundingClientRect/.test(adapterAll),
)
assert(
  'evidence adapter: no Playwright / browser harness import',
  !/from ['"]playwright|from ['"]puppeteer/.test(adapterAll),
)
assert(
  'evidence adapter: no fetch / XHR / network',
  !/\bfetch\(|XMLHttpRequest|axios|\bnode-fetch\b/.test(adapterAll),
)
assert(
  'evidence adapter: no SQLite / database',
  !/sqlite|better-sqlite|question-bank\.sqlite/i.test(adapterAll),
)
assert(
  'evidence adapter: index.ts re-exports adapter symbols',
  /toEvidenceModel/.test(adapterIndexTs) && /selectEvidence/.test(adapterIndexTs),
)

/* ─── 1a. Helper raw-quote intent (reviewer watch #1) ─────────────────
 *
 * The adapter must keep quote-like values byte-for-byte. To prevent a
 * future contributor silently turning the helper into a `.trim()`-and-
 * return helper, lock the contract in three ways:
 *   - the helper name itself encodes the intent (`nonEmptyRawStringOrNull`),
 *   - a comment explicitly says the returned value is NOT trimmed,
 *   - no other helper in the adapter is allowed to be named with
 *     `safeStringOrNull`, which was the prior, less explicit name.
 *
 * If you legitimately need a normalized variant in the future, add a
 * separate helper next to its call site — do NOT relax this one.
 */
assert(
  'adapter: helper renamed to nonEmptyRawStringOrNull (preserves raw quote)',
  /\bfunction nonEmptyRawStringOrNull\b/.test(adapterTs) &&
    !/\bfunction safeStringOrNull\b/.test(adapterTs),
)
assert(
  'adapter: helper comment documents do-not-trim intent',
  /does NOT trim the returned value|preserved byte-for-byte|byte-for-byte so the audit/.test(adapterTs),
)
assert(
  'adapter: no `.trim()` is applied to a value before returning from a helper',
  // matches `return value.trim()` or similar.  We allow `.trim()` only
  // when used as a length probe (e.g. `value.trim().length > 0`); the
  // assertion fires only if a helper returns the trimmed value.
  !/return\s+\w+\.trim\(\)\s*[);,]/.test(adapterTs),
)

/* ─── 1b. QuestionEvidenceView surface (reviewer watch #2) ───────────
 *
 * The right-side analysis panel will read locatingSentence / answerSentence
 * straight off QuestionEvidenceView.  Lock the type definition and the
 * adapter implementation independently so a future commit can't quietly
 * drop the fields and only the runtime would catch it.
 */
assert(
  'types: QuestionEvidenceView declares locatingSentence: string',
  /QuestionEvidenceView\s*=\s*\{[\s\S]*?\blocatingSentence:\s*string\b/.test(adapterTypesTs),
)
assert(
  'types: QuestionEvidenceView declares answerSentence: string',
  /QuestionEvidenceView\s*=\s*\{[\s\S]*?\banswerSentence:\s*string\b/.test(adapterTypesTs),
)
assert(
  'adapter: question view copies locatingSentence from QuestionAnalysis',
  /locatingSentence:\s*safeString\(question\.locatingSentence\)/.test(adapterTs),
)
assert(
  'adapter: question view copies answerSentence from QuestionAnalysis',
  /answerSentence:\s*safeString\(question\.answerSentence\)/.test(adapterTs),
)

/* ─── 1c. distractorCategory / distractorSubtype null semantics
 *        (reviewer watch #3) ──────────────────────────────────────────
 *
 * Both fields are now `string | null`.  Support rows are always null;
 * trap rows are null when the source report omitted the value, otherwise
 * the raw string.  Lock the adapter wiring so neither field accidentally
 * regresses to `safeString(...)` (which would return `''`).
 */
assert(
  'adapter: distractorCategory uses nonEmptyRawStringOrNull (not safeString)',
  /distractorCategory:\s*nonEmptyRawStringOrNull\(distractor\.category\)/.test(adapterTs) &&
    !/distractorCategory:\s*safeString\(/.test(adapterTs),
)
assert(
  'adapter: distractorSubtype uses nonEmptyRawStringOrNull (not safeString)',
  /distractorSubtype:\s*nonEmptyRawStringOrNull\(distractor\.subtype\)/.test(adapterTs) &&
    !/distractorSubtype:\s*safeString\(/.test(adapterTs),
)

const previewTsx = readSrc('app/src/features/paper-intelligence/PaperIntelligencePreview.tsx')
assert(
  'PaperIntelligencePreview.tsx: no hand-rolled evidence matcher (no `passageBody.includes` or quote-resolver)',
  !/passageBody\.includes\(|resolveEvidence|matchQuoteAgainst|\bnormalizeQuote\b/.test(previewTsx),
)

// readonly check: reading-analysis files were not touched by this branch.
// We can't run git here, but we can at least assert these files exist
// (i.e. we didn't delete them) and the paper-intelligence preview did not
// import from reading-analysis (no cross-pollination).
assert(
  'reading-analysis directory intact: ReadingAnalysisDemoRoute.tsx exists',
  existsSync(path.join(ROOT, 'app/src/features/reading-analysis/ReadingAnalysisDemoRoute.tsx')),
)
assert(
  'paper-intelligence preview does not import from reading-analysis',
  !/features\/reading-analysis/.test(previewTsx),
)

// no server / package.json / DB modifications — assert the marker files
// still look like main. We rely on git-clean check at commit time; here
// we just sanity-check that those paths still exist.
assert(
  'server/api.mjs still exists',
  existsSync(path.join(ROOT, 'server/api.mjs')),
)
assert(
  'app/package.json still exists',
  existsSync(path.join(ROOT, 'app/package.json')),
)

/* ─── 2. Load the report + input.json ───────────────────────────────── */

assert('report.json exists', existsSync(REPORT_PATH))
assert('input.json exists (carries passageBody for audit)', existsSync(INPUT_PATH))

let report
let input
try {
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'))
  assert('report.json parses', true)
} catch (e) {
  assert('report.json parses', false, e.message)
}
try {
  input = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'))
  assert('input.json parses', true)
} catch (e) {
  assert('input.json parses', false, e.message)
}

if (!report || !input) {
  console.log(`\n  ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

/* ─── 3. Build EvidenceModel + sanity counts ────────────────────────── */

// Pull passageBody out of input.json into a section→body map.
const bodies = {}
for (const p of input.passages || []) {
  if (p?.paperSection && typeof p.passageBody === 'string') {
    bodies[p.paperSection] = p.passageBody
  }
}

const model = toEvidenceModel(report, { bodies })

assert('EvidenceModel: 4 passages', model.passages.length === 4)
const sections = model.passages.map((p) => p.paperSection).sort().join(',')
assert('EvidenceModel: paperSections cover A/B/C/D', sections === 'A,B,C,D')

const totalQuestions = model.passages.reduce(
  (n, p) => n + p.questions.length,
  0,
)
// NOTE: `15` is the contract of the bundled `paper-2024-xkb1-reading`
// sample fixture (4 passages, fixed question counts per passage). It is
// NOT a generic rule for the future runner — other papers may legitimately
// have a different total. If/when this script is extended to audit a
// different paperId, this assertion should be replaced with a sum derived
// from the input.json.
assert(
  'EvidenceModel: 15 questions total (paper-2024-xkb1-reading fixture contract)',
  totalQuestions === 15,
  `got ${totalQuestions}`,
)

// Each passage should carry its passageBody (we provided bodies for all).
for (const p of model.passages) {
  assert(
    `passage ${p.paperSection}: passageBody resolved from input.json`,
    typeof p.passageBody === 'string' && p.passageBody.length > 0,
  )
}

/* ─── 3a. report/input alignment (reviewer watch #4) ─────────────────
 *
 * The adapter trusts that input.json describes the same paper as
 * report.json. If they drift apart (different paperId, missing passage,
 * stray section), the audit's "verbatim against passageBody" claims
 * become silently meaningless. Lock the alignment here.
 */
assert(
  'alignment: input.sourcePaper.paperId === report.sourcePaper.paperId',
  typeof input?.sourcePaper?.paperId === 'string' &&
    input.sourcePaper.paperId === report?.sourcePaper?.paperId,
  `input=${input?.sourcePaper?.paperId} vs report=${report?.sourcePaper?.paperId}`,
)
{
  const ipn = input?.sourcePaper?.paperName
  const rpn = report?.sourcePaper?.paperName
  // Only enforce equality when both sides have a non-empty value; a
  // missing paperName on one side is allowed (it's a soft cosmetic
  // field, unlike paperId).
  if (typeof ipn === 'string' && ipn.length > 0 && typeof rpn === 'string' && rpn.length > 0) {
    assert(
      'alignment: input.sourcePaper.paperName === report.sourcePaper.paperName (when both present)',
      ipn === rpn,
      `input="${ipn}" vs report="${rpn}"`,
    )
  } else {
    assert(
      'alignment: paperName equality skipped (one side missing — that is allowed)',
      true,
    )
  }
}

const inputSections = (input?.passages || [])
  .map((p) => p?.paperSection)
  .filter((s) => typeof s === 'string')
  .sort()
  .join(',')
const reportSections = (report?.passages || [])
  .map((p) => p?.paperSection)
  .filter((s) => typeof s === 'string')
  .sort()
  .join(',')
assert(
  'alignment: input passages and report passages cover the same paperSection set',
  inputSections === reportSections && inputSections.length > 0,
  `input=[${inputSections}] vs report=[${reportSections}]`,
)
for (const reportPassage of report?.passages || []) {
  const section = reportPassage?.paperSection
  if (!section) continue
  assert(
    `alignment: report passage ${section} has a matching passageBody in input.json`,
    typeof bodies[section] === 'string' && bodies[section].length > 0,
  )
}

/* ─── 3b. QuestionEvidenceView surface populated at runtime
 *        (reviewer watch #2 — runtime side) ───────────────────────────
 *
 * The static checks above lock the type and the assignment site; this
 * runtime check confirms that — for the bundled fixture — every question
 * view actually carries non-empty locatingSentence and answerSentence
 * strings, and that they match the report verbatim.
 */
{
  const reportByQ = new Map()
  for (const p of report.passages || []) {
    for (const q of p?.questions || []) {
      if (q?.questionNo) {
        reportByQ.set(`${p.paperSection}|${q.questionNo}`, q)
      }
    }
  }
  let locatingPopulated = 0
  let answerPopulated = 0
  let locatingMatchesReport = 0
  let answerMatchesReport = 0
  let totalViews = 0
  for (const p of model.passages) {
    for (const v of p.questions) {
      totalViews++
      const src = reportByQ.get(`${p.paperSection}|${v.questionNo}`)
      if (typeof v.locatingSentence === 'string' && v.locatingSentence.length > 0) {
        locatingPopulated++
        if (src && v.locatingSentence === src.locatingSentence) locatingMatchesReport++
      }
      if (typeof v.answerSentence === 'string' && v.answerSentence.length > 0) {
        answerPopulated++
        if (src && v.answerSentence === src.answerSentence) answerMatchesReport++
      }
    }
  }
  assert(
    'runtime: every QuestionEvidenceView has non-empty locatingSentence',
    locatingPopulated === totalViews,
    `${locatingPopulated} of ${totalViews}`,
  )
  assert(
    'runtime: every QuestionEvidenceView has non-empty answerSentence',
    answerPopulated === totalViews,
    `${answerPopulated} of ${totalViews}`,
  )
  assert(
    'runtime: locatingSentence in view === locatingSentence in report (verbatim copy)',
    locatingMatchesReport === totalViews,
    `${locatingMatchesReport} of ${totalViews}`,
  )
  assert(
    'runtime: answerSentence in view === answerSentence in report (verbatim copy)',
    answerMatchesReport === totalViews,
    `${answerMatchesReport} of ${totalViews}`,
  )
}

/* ─── 3c. distractorCategory null semantics at runtime
 *        (reviewer watch #3 — runtime side) ───────────────────────────
 *
 * support rows: distractorCategory MUST be null (and distractorSubtype too).
 * trap rows: distractorCategory is either null (if the source omitted it)
 *   OR a non-empty string. It is NEVER the empty string.
 *
 * Same for distractorSubtype.
 */
{
  let supportCategoryNull = 0
  let supportSubtypeNull = 0
  let supportTotal = 0
  let trapCategoryEmptyString = 0
  let trapSubtypeEmptyString = 0
  let trapTotal = 0
  for (const e of model.evidenceItems) {
    if (e.evidenceKind === 'support') {
      supportTotal++
      if (e.distractorCategory === null) supportCategoryNull++
      if (e.distractorSubtype === null) supportSubtypeNull++
    } else {
      trapTotal++
      if (e.distractorCategory === '') trapCategoryEmptyString++
      if (e.distractorSubtype === '') trapSubtypeEmptyString++
    }
  }
  assert(
    'support rows: distractorCategory is always null',
    supportCategoryNull === supportTotal,
    `${supportCategoryNull} of ${supportTotal}`,
  )
  assert(
    'support rows: distractorSubtype is always null',
    supportSubtypeNull === supportTotal,
    `${supportSubtypeNull} of ${supportTotal}`,
  )
  assert(
    'trap rows: distractorCategory is never the empty string (null instead)',
    trapCategoryEmptyString === 0,
    `found ${trapCategoryEmptyString} empty-string occurrences across ${trapTotal} trap rows`,
  )
  assert(
    'trap rows: distractorSubtype is never the empty string (null instead)',
    trapSubtypeEmptyString === 0,
    `found ${trapSubtypeEmptyString} empty-string occurrences across ${trapTotal} trap rows`,
  )
}

/* ─── 4. Quote audit core ───────────────────────────────────────────── */

/**
 * verbatim-only audit: returns 'hit' if `body` includes `quote` exactly,
 * else 'miss'. We deliberately do NOT do whitespace normalization or
 * smart-quote folding — the V0 hard rule is verbatim, full stop.
 */
function classifyQuote(body, quote) {
  if (typeof body !== 'string' || body.length === 0) return 'no-passage-body'
  if (typeof quote !== 'string' || quote.length === 0) return 'no-quote'
  return body.includes(quote) ? 'hit' : 'miss'
}

function describeMiss(body, quote) {
  // Cheap heuristic so failure messages are useful to a human reader.
  // We only inspect the first ~120 chars and report the first divergence.
  if (typeof quote !== 'string') return 'quote is not a string'
  const trimmed = quote.trim()
  if (trimmed !== quote) return 'quote has leading/trailing whitespace'
  if (/\s\s/.test(quote)) return 'quote has internal double-space'
  if (/\.\.\.|\u2026/.test(quote)) return 'quote contains ellipsis'
  // Try a normalized fallback to hint at smart-quote / dash drift
  const normBody = body.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  const normQuote = quote.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  if (normBody.includes(normQuote)) return 'differs only in smart quotes (verbatim still required)'
  // Try em-dash vs en-dash
  const dashBody = body.replace(/[\u2014\u2013]/g, '-')
  const dashQuote = quote.replace(/[\u2014\u2013]/g, '-')
  if (dashBody.includes(dashQuote)) return 'differs only in em/en-dash (verbatim still required)'
  return 'quote text not found in passageBody'
}

const failures = []
let answerEvidenceTotal = 0
let answerEvidenceHitCount = 0
let locatingHitCount = 0
let answerSentenceHitCount = 0
let distractorTotal = 0
let distractorQuoteCount = 0
let distractorQuoteHitCount = 0
let textOnlyDistractorCount = 0

// audit walks the report directly so the verbatim-against-passageBody
// claim is anchored on the source-of-truth shape. The EvidenceModel does
// surface locatingSentence / answerSentence as of this cut, but the
// report-side walk is still the one that catches drift between the
// model output and the original input.
for (const passage of report.passages || []) {
  const section = passage?.paperSection
  const body = bodies[section]
  for (const q of passage?.questions || []) {
    answerEvidenceTotal++

    // 4a. answerEvidence.quote
    const aqClass = classifyQuote(body, q?.answerEvidence?.quote)
    if (aqClass === 'hit') answerEvidenceHitCount++
    else {
      failures.push({
        section,
        questionNo: q?.questionNo,
        field: 'answerEvidence.quote',
        quote: q?.answerEvidence?.quote ?? null,
        reason: aqClass === 'miss' ? describeMiss(body, q?.answerEvidence?.quote) : aqClass,
      })
    }

    // 4b. locatingSentence
    if (typeof q?.locatingSentence === 'string' && q.locatingSentence.length > 0) {
      const lc = classifyQuote(body, q.locatingSentence)
      if (lc === 'hit') locatingHitCount++
      else {
        failures.push({
          section,
          questionNo: q?.questionNo,
          field: 'locatingSentence',
          quote: q.locatingSentence,
          reason: lc === 'miss' ? describeMiss(body, q.locatingSentence) : lc,
        })
      }
    }

    // 4c. answerSentence
    if (typeof q?.answerSentence === 'string' && q.answerSentence.length > 0) {
      const ac = classifyQuote(body, q.answerSentence)
      if (ac === 'hit') answerSentenceHitCount++
      else {
        failures.push({
          section,
          questionNo: q?.questionNo,
          field: 'answerSentence',
          quote: q.answerSentence,
          reason: ac === 'miss' ? describeMiss(body, q.answerSentence) : ac,
        })
      }
    }

    // 4d. distractor quotes (only if present)
    for (const d of q?.distractorAnalysis || []) {
      distractorTotal++
      if (typeof d?.quote === 'string' && d.quote.length > 0) {
        distractorQuoteCount++
        const dc = classifyQuote(body, d.quote)
        if (dc === 'hit') distractorQuoteHitCount++
        else {
          failures.push({
            section,
            questionNo: q?.questionNo,
            field: `distractorAnalysis[${d.optionLabel}].quote`,
            quote: d.quote,
            reason: dc === 'miss' ? describeMiss(body, d.quote) : dc,
          })
        }
      } else {
        textOnlyDistractorCount++
      }
    }
  }
}

/* ─── 5. Print summary ──────────────────────────────────────────────── */

const summary = {
  totalQuestions,
  answerEvidenceHitCount,
  answerEvidenceTotal,
  locatingHitCount,
  answerSentenceHitCount,
  distractorTotal,
  distractorQuoteCount,
  distractorQuoteHitCount,
  textOnlyDistractorCount,
  failures,
}

console.log('')
console.log('  audit summary:')
console.log(`    totalQuestions           : ${summary.totalQuestions}`)
console.log(`    answerEvidence hits      : ${summary.answerEvidenceHitCount} / ${summary.answerEvidenceTotal}`)
console.log(`    locatingSentence hits    : ${summary.locatingHitCount}`)
console.log(`    answerSentence hits      : ${summary.answerSentenceHitCount}`)
console.log(`    distractor total         : ${summary.distractorTotal}`)
console.log(`    distractor quote count   : ${summary.distractorQuoteCount}`)
console.log(`    distractor quote hits    : ${summary.distractorQuoteHitCount}`)
console.log(`    text-only distractors    : ${summary.textOnlyDistractorCount}`)
console.log(`    failures                 : ${summary.failures.length}`)
if (summary.failures.length > 0) {
  console.log('')
  console.log('  failure details (first 12):')
  for (const f of summary.failures.slice(0, 12)) {
    console.log(`    - [${f.section} Q${f.questionNo}] ${f.field}: ${f.reason}`)
    if (typeof f.quote === 'string') {
      const preview = f.quote.length > 80 ? f.quote.slice(0, 77) + '...' : f.quote
      console.log(`        quote: ${JSON.stringify(preview)}`)
    }
  }
  if (summary.failures.length > 12) {
    console.log(`    ... and ${summary.failures.length - 12} more`)
  }
}
console.log('')

/* ─── 6. Assert counts ──────────────────────────────────────────────── */

assert(
  'audit: every question has an answerEvidence quote that hits passageBody',
  summary.answerEvidenceHitCount === summary.totalQuestions,
  `${summary.answerEvidenceHitCount} of ${summary.totalQuestions}`,
)
assert(
  'audit: every distractor with a quote hits passageBody',
  summary.distractorQuoteHitCount === summary.distractorQuoteCount,
  `${summary.distractorQuoteHitCount} of ${summary.distractorQuoteCount}`,
)
assert(
  'audit: locatingSentence hits passageBody for every question',
  summary.locatingHitCount === summary.totalQuestions,
  `${summary.locatingHitCount} of ${summary.totalQuestions}`,
)
assert(
  'audit: answerSentence hits passageBody for every question',
  summary.answerSentenceHitCount === summary.totalQuestions,
  `${summary.answerSentenceHitCount} of ${summary.totalQuestions}`,
)
assert('audit: zero failures', summary.failures.length === 0)

/* ─── 7. Adapter id stability ───────────────────────────────────────── */

// Ids must be deterministic and dependent only on (paperSection,
// questionNo[, optionLabel]). Re-running the adapter with the same input
// must produce byte-identical evidence ids in the same order.
const model2 = toEvidenceModel(report, { bodies })
const ids1 = model.evidenceItems.map((e) => e.id).join('|')
const ids2 = model2.evidenceItems.map((e) => e.id).join('|')
assert('adapter ids are stable across re-runs', ids1 === ids2)

// Spot check: ids match the documented pattern.
const allIdsMatchPattern = model.evidenceItems.every((e) =>
  e.evidenceKind === 'support'
    ? e.id === buildSupportEvidenceId(e.paperSection, e.questionNo)
    : e.id === buildTrapEvidenceId(e.paperSection, e.questionNo, e.optionLabel),
)
assert('adapter ids match documented pattern', allIdsMatchPattern)

// Selector smoke test: scoping to one passage / question / option works.
const passageA = selectEvidence(model, { paperSection: 'A' })
assert(
  'selectEvidence({paperSection:A}) returns only A items',
  passageA.length > 0 && passageA.every((e) => e.paperSection === 'A'),
)
const firstQ = model.passages[0].questions[0]
const onlyOne = selectEvidence(model, {
  paperSection: firstQ.paperSection,
  questionNo: firstQ.questionNo,
  optionLabel: firstQ.answer,
})
assert(
  'selectEvidence({section,questionNo,optionLabel}) narrows to one row',
  onlyOne.length === 1 && onlyOne[0].evidenceKind === 'support',
)

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
