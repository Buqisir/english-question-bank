#!/usr/bin/env node
/**
 * Reading Analysis quote coverage report.
 *
 * Iterates `app/src/features/reading-analysis/sidecar/index.json`, fetches
 * each group's `QuestionGroupDetail` from the local API, runs the existing
 * selector, and writes `reports/reading-analysis-quote-coverage.md` with:
 *
 *   1. Summary
 *   2. Miss reason breakdown
 *   3. Per-group coverage table
 *   4. Miss details
 *   5. Initial recommendation (machine-generated)
 *
 * Selector matching semantics are NOT changed by this script — it only
 * observes the diagnostics the selector already exposes.
 */

import path from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const here = path.dirname(new URL(import.meta.url).pathname)
const repoRoot = path.resolve(here, '..')
const sidecarDir = path.resolve(repoRoot, 'app/src/features/reading-analysis/sidecar/data')
const indexPath = path.resolve(repoRoot, 'app/src/features/reading-analysis/sidecar/index.json')
const selectorPath = path.resolve(
  repoRoot,
  'app/src/features/reading-analysis/selectors/selectReadingAnalysis.ts',
)
const reportDir = path.resolve(repoRoot, 'reports')
const reportPath = path.resolve(reportDir, 'reading-analysis-quote-coverage.md')
const apiBase = process.env.READING_ANALYSIS_API_BASE || 'http://127.0.0.1:8787'

mkdirSync(reportDir, { recursive: true })

const { selectReadingAnalysisFromDetail } = await import(selectorPath)
const manifest = JSON.parse(readFileSync(indexPath, 'utf8'))
if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
  console.error('No samples in sidecar index.json; nothing to report.')
  process.exit(1)
}

const groupRows = []
const allDiagnostics = []
let totalEntries = 0
let totalHits = 0
let totalMisses = 0
let okGroups = 0
const failedGroups = []

for (const sample of manifest.samples) {
  let detail
  try {
    const res = await fetch(`${apiBase}/api/question-groups/${encodeURIComponent(sample.groupId)}`)
    if (!res.ok) {
      failedGroups.push({ ...sample, error: `HTTP ${res.status}` })
      continue
    }
    const body = await res.json()
    detail = body?.questionGroup
    if (!detail) {
      failedGroups.push({ ...sample, error: 'detail missing' })
      continue
    }
  } catch (err) {
    failedGroups.push({ ...sample, error: err instanceof Error ? err.message : String(err) })
    continue
  }

  let sidecar
  try {
    sidecar = JSON.parse(readFileSync(path.join(sidecarDir, `${sample.groupId}.json`), 'utf8'))
  } catch (err) {
    failedGroups.push({ ...sample, error: `sidecar load: ${err instanceof Error ? err.message : String(err)}` })
    continue
  }

  const result = selectReadingAnalysisFromDetail({
    detail,
    sidecar,
    questionNo: sample.questionNo,
  })
  if (!result.ok) {
    failedGroups.push({ ...sample, error: `selector: ${result.reason}` })
    continue
  }
  okGroups++

  const diagnostics = result.quoteDiagnostics
  const hits = diagnostics.filter((d) => d.status === 'hit').length
  const misses = diagnostics.filter((d) => d.status === 'miss').length
  totalEntries += diagnostics.length
  totalHits += hits
  totalMisses += misses
  for (const d of diagnostics) {
    allDiagnostics.push({ ...d, groupTitle: sample.title, sampleCase: sample.case })
  }

  groupRows.push({
    groupId: sample.groupId,
    title: sample.title,
    case: sample.case,
    entries: diagnostics.length,
    hits,
    misses,
    fixtureTitle: result.fixture.passage.title,
  })
}

const reasonCounts = {
  not_found: 0,
  cross_sentence: 0,
  multiple_matches: 0,
}
for (const d of allDiagnostics) {
  if (d.status === 'miss' && d.reason && d.reason in reasonCounts) {
    reasonCounts[d.reason]++
  }
}

const missRate = totalEntries === 0 ? 0 : totalMisses / totalEntries
const missRatePct = (missRate * 100).toFixed(1)

/* ─── Markdown writer ─────────────────────────────────────────────────── */
const lines = []
lines.push('# Reading Analysis — Quote Coverage Report')
lines.push('')
lines.push('Generated: deterministic by `scripts/reading-analysis-report.mjs`')
lines.push('')
lines.push(`Source: \`app/src/features/reading-analysis/sidecar/index.json\` (${manifest.samples.length} samples)`)
lines.push(`API:    \`${apiBase}\``)
lines.push('')

lines.push('## Summary')
lines.push('')
lines.push(`- total groups: ${manifest.samples.length}`)
lines.push(`- ok groups: ${okGroups}`)
lines.push(`- failed groups: ${failedGroups.length}`)
lines.push(`- total sidecar entries: ${totalEntries}`)
lines.push(`- hits: ${totalHits}`)
lines.push(`- misses: ${totalMisses}`)
lines.push(`- miss rate: ${missRatePct}%`)
lines.push('')

lines.push('## Miss Reason Breakdown')
lines.push('')
lines.push('| reason | count |')
lines.push('|---|---:|')
for (const reason of ['not_found', 'cross_sentence', 'multiple_matches']) {
  lines.push(`| ${reason} | ${reasonCounts[reason]} |`)
}
lines.push('')

lines.push('## Per Group Coverage')
lines.push('')
lines.push('| groupId | title | case | entries | hits | misses |')
lines.push('|---|---|---|---:|---:|---:|')
for (const row of groupRows) {
  lines.push(
    `| \`${row.groupId}\` | ${escapeMd(row.title)} | ${row.case} | ${row.entries} | ${row.hits} | ${row.misses} |`,
  )
}
lines.push('')

if (failedGroups.length > 0) {
  lines.push('### Failed groups')
  lines.push('')
  lines.push('| groupId | case | error |')
  lines.push('|---|---|---|')
  for (const row of failedGroups) {
    lines.push(`| \`${row.groupId}\` | ${row.case} | ${escapeMd(row.error)} |`)
  }
  lines.push('')
}

lines.push('## Miss Details')
lines.push('')
const misses = allDiagnostics.filter((d) => d.status === 'miss')
if (misses.length === 0) {
  lines.push('_No misses observed in current sample set._')
  lines.push('')
} else {
  for (const d of misses) {
    const optionPart = d.optionLabel ? ` / option ${d.optionLabel}` : ''
    lines.push(`### \`${d.groupId}\` / Q${d.questionNo}${optionPart}`)
    lines.push('')
    lines.push(`- kind: ${d.kind}`)
    lines.push(`- reason: ${d.reason ?? 'unknown'}`)
    lines.push(`- group: ${escapeMd(d.groupTitle)}`)
    lines.push('- quote:')
    lines.push('')
    lines.push(`> ${escapeQuote(d.quote)}`)
    lines.push('')
  }
}

lines.push('## Notable Hits with Coexistence')
lines.push('')
const sameSentenceHits = allDiagnostics.filter(
  (d) => d.status === 'hit' && d.reason === 'same_sentence_multi',
)
if (sameSentenceHits.length === 0) {
  lines.push('_No same-sentence coexistence in current sample set._')
} else {
  lines.push('| groupId | Q | option | kind |')
  lines.push('|---|---|---|---|')
  for (const d of sameSentenceHits) {
    lines.push(`| \`${d.groupId}\` | ${d.questionNo} | ${d.optionLabel ?? '(stem)'} | ${d.kind} |`)
  }
}
lines.push('')

lines.push('## Initial Recommendation')
lines.push('')
lines.push(buildRecommendation({ totalEntries, totalHits, totalMisses, reasonCounts, okGroups }))
lines.push('')

writeFileSync(reportPath, lines.join('\n'))

console.log(`Report written: ${path.relative(repoRoot, reportPath)}`)
console.log(`Summary: ${totalHits}/${totalEntries} hits (${missRatePct}% miss rate)`)
for (const reason of Object.keys(reasonCounts)) {
  if (reasonCounts[reason] > 0) {
    console.log(`  ${reason}: ${reasonCounts[reason]}`)
  }
}
if (failedGroups.length > 0) {
  console.error(`\nWARNING: ${failedGroups.length} group(s) failed to load:`)
  for (const f of failedGroups) console.error(`  - ${f.groupId}: ${f.error}`)
  process.exit(1)
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function escapeMd(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function escapeQuote(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\n+/g, ' ').trim()
}

function buildRecommendation({ totalEntries, totalHits, totalMisses, reasonCounts, okGroups }) {
  if (totalEntries === 0) {
    return '_Not enough sidecar entries to recommend a direction yet._'
  }
  const SAMPLE_FLOOR = 30
  const lines = []
  lines.push(
    `Hit rate ${(totalHits / totalEntries * 100).toFixed(1)}% across ${totalEntries} entries from ${okGroups} groups.`,
  )
  lines.push('')
  if (totalEntries < SAMPLE_FLOOR) {
    lines.push(
      `Sample size is below the working floor of ${SAMPLE_FLOOR} entries. ` +
        'Do NOT use these numbers to argue for or against a matcher upgrade. ' +
        'The right next step is to expand sidecar coverage on real groups.',
    )
  } else {
    lines.push(
      `Sample size is at or above the working floor (${SAMPLE_FLOOR} entries), but coverage is still narrow ` +
        'and skewed toward 阅读 reading prompts. The numbers below are a first-look snapshot, not evidence ' +
        'of representativeness — keep adding real samples before discussing any matcher policy change.',
    )
  }
  lines.push('')

  if (reasonCounts.cross_sentence > 0) {
    lines.push(
      `- Cross-sentence misses: ${reasonCounts.cross_sentence}. Expected for the ` +
        'current single-sentence matcher; sidecar authors can either tighten the ' +
        'quote to a single sentence or accept the miss until matcher policy is revisited.',
    )
  }
  if (reasonCounts.multiple_matches > 0) {
    lines.push(
      `- Ambiguous matches: ${reasonCounts.multiple_matches}. Prefer requiring ` +
        'a longer quote in the sidecar over disambiguating heuristically.',
    )
  } else {
    lines.push(
      '- multiple_matches: 0 in current sample. If real candidates show up later ' +
        'they should be flagged in this section, not silently disambiguated.',
    )
  }
  if (reasonCounts.not_found > 0) {
    lines.push(
      `- Not-found misses: ${reasonCounts.not_found}. Most likely a quote authoring ` +
        'error — fix the sidecar JSON, not the matcher.',
    )
  }

  lines.push('')
  lines.push(
    'Do not introduce fuzzy matching, adjacent-sentence concatenation, or ' +
      'token-level matching at this stage. Continue observing as the sidecar grows.',
  )

  return lines.join('\n')
}
