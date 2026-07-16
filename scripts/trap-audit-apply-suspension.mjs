#!/usr/bin/env node
/**
 * trap-audit-apply-suspension.mjs — r2-trap-audit Scope 步骤 3
 * (docs/cuts/r2-trap-audit/plan.md).
 *
 * Reads docs/cuts/r2-trap-audit/scan-findings.json (produced by
 * trap-audit-scan.mjs — never re-derives its own judgment, so the applied
 * batch can never disagree with the reported numbers) and writes a
 * `suspension: { level, reason, suspendedAt }` field onto the matching
 * `trap` object in the OWNING `app/public/paper-assets/<paperId>/latest/
 * analyses/reading-choice-analysis-v1.json` — the one and only in-place
 * edit target (versions/ untouched; there is no versions/ directory in this
 * repo today, and this JSON is a normal git-tracked content file, not a
 * runtime-published artifact — same "fix data in place, commit it" pattern
 * as the 2020-ii grammar-fill hint repair (7ed780a)).
 *
 * Only findings whose checkId is in AUTO_SUSPEND_CHECK_IDS get written
 * (rogueType / labelExplanationContradiction / structuralIncompleteness).
 * evidenceFieldLeak findings are left completely untouched — that bucket is
 * the second-段 owner judgment battle's job, not this cut's.
 *
 * Never touches `primaryType` or any explanation/relationNote text — the
 * only key this script ever adds is `suspension` (plan.md Forbidden: 本刀
 * 只摘牌不改判).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTO_SUSPEND_CHECK_IDS } from './trap-audit-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const findingsPath = path.join(rootDir, 'docs', 'cuts', 'r2-trap-audit', 'scan-findings.json')

const dryRun = process.argv.includes('--dry-run')
const suspendedAt = process.argv.includes('--fixed-date-for-tests')
  ? '2026-07-16'
  : new Date().toISOString().slice(0, 10)

if (!existsSync(findingsPath)) {
  console.error(`missing ${path.relative(rootDir, findingsPath)} — run trap-audit-scan.mjs first`)
  process.exit(1)
}

const findings = JSON.parse(readFileSync(findingsPath, 'utf8'))
const suspendable = findings.filter((f) => AUTO_SUSPEND_CHECK_IDS.has(f.checkId) && f.level)

const byPaper = new Map()
for (const finding of suspendable) {
  if (!byPaper.has(finding.paperId)) byPaper.set(finding.paperId, [])
  byPaper.get(finding.paperId).push(finding)
}

let written = 0
let skippedAlready = 0

for (const [paperId, items] of byPaper) {
  const analysisPath = path.join(paperAssetsDir, paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  if (!existsSync(analysisPath)) {
    console.error(`FAIL ${paperId}: latest/analyses/reading-choice-analysis-v1.json missing, cannot apply ${items.length} finding(s)`)
    process.exitCode = 1
    continue
  }
  const raw = readFileSync(analysisPath, 'utf8')
  const analysis = JSON.parse(raw)
  let changed = false

  for (const finding of items) {
    const question = analysis.questions?.[finding.questionId]
    const option = question?.optionAnalysis?.find((item) => item.label === finding.optionLabel)
    if (!option?.trap) {
      console.error(`FAIL ${paperId}/${finding.questionId}/${finding.optionLabel}: trap not found, finding stale?`)
      process.exitCode = 1
      continue
    }
    if (option.trap.suspension) {
      skippedAlready += 1
      continue
    }
    option.trap.suspension = {
      level: finding.level,
      reason: finding.checkId,
      suspendedAt,
    }
    changed = true
    written += 1
  }

  if (changed && !dryRun) {
    writeFileSync(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`)
  }
}

console.log(`trap-audit-apply-suspension: ${written} suspension field(s) ${dryRun ? '(dry-run, not written)' : 'written'}, ${skippedAlready} already suspended (skipped)`)
