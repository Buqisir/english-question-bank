#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['source', 'selection', 'inputs']) if (!args[key]) throw new Error(`Missing --${key}`)
  return args
}

const args = parseArgs(process.argv.slice(2))
const sourceEntries = JSON.parse(readFileSync(path.resolve(args.source), 'utf8')).entries
const selectionPath = path.resolve(args.selection)
const selectionPayload = JSON.parse(readFileSync(selectionPath, 'utf8'))
const auditEntries = args.inputs.split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .flatMap((filePath) => JSON.parse(readFileSync(path.resolve(filePath), 'utf8')).entries ?? [])
const sourceById = new Map(sourceEntries.map((entry) => [entry.entryId, entry]))
const selectionById = new Map(selectionPayload.entries.map((entry) => [entry.entryId, entry]))

if (sourceEntries.length !== 3_000) throw new Error('Expected the full 3000-entry source')
if (new Set(auditEntries.map((entry) => entry.entryId)).size !== auditEntries.length) throw new Error('Audit inputs contain duplicate entryId values')

for (const audit of auditEntries) {
  const source = sourceById.get(audit.entryId)
  const selection = selectionById.get(audit.entryId)
  if (!source || !selection || !selection.asset) throw new Error(`Missing selected candidate for ${audit.entryId}`)
  if (audit.headword !== source.headword || audit.assetSlug !== selection.asset.slug) throw new Error(`Audit snapshot drift for ${audit.entryId}`)
  if (!['pending_owner_semantic_qa', 'subagent_visual_qa_pass_pending_owner'].includes(selection.qa?.status)) throw new Error(`Candidate is not eligible for Subagent QA or binding-drift invalidation for ${audit.entryId}`)
  if (!['pass', 'fail', 'unsure'].includes(audit.verdict)) throw new Error(`Invalid audit verdict for ${audit.entryId}`)
  if (!/\S/u.test(audit.visibleFacts ?? '') || !/[\u3400-\u9fff]/u.test(audit.reason ?? '')) throw new Error(`Audit lacks visible evidence for ${audit.entryId}`)

  if (audit.verdict === 'pass') {
    selectionById.set(audit.entryId, {
      ...selection,
      qa: {
        status: 'subagent_visual_qa_pass_pending_owner',
        verdict: 'pass',
        reviewer: 'codex-subagent-actual-svg-review-v1',
        visibleFacts: audit.visibleFacts,
        reason: audit.reason,
        integratedIntoProduct: false,
      },
    })
    continue
  }

  selectionById.set(audit.entryId, {
    ...selection,
    status: 'visual_gap_pending_owner_decision',
    selectionMethod: 'codex-subagent-actual-svg-review-v1',
    asset: undefined,
    rejectedCandidate: {
      slug: selection.asset.slug,
      path: selection.asset.path,
      verdict: audit.verdict,
      visibleFacts: audit.visibleFacts,
      reason: audit.reason,
    },
    gapReason: audit.reason,
    excludedSlugs: [...new Set([...(selection.excludedSlugs ?? []), selection.asset.slug])],
    qa: {
      status: 'visual_gap_after_subagent_review',
      verdict: 'gap',
      reviewer: 'codex-subagent-actual-svg-review-v1',
      integratedIntoProduct: false,
    },
  })
}

const ordered = sourceEntries.filter((entry) => selectionById.has(entry.entryId)).map((entry) => selectionById.get(entry.entryId))
const counts = {
  total: ordered.length,
  selected: ordered.filter((entry) => entry.asset).length,
  visualGap: ordered.filter((entry) => !entry.asset).length,
  subagentPass: ordered.filter((entry) => entry.qa?.status === 'subagent_visual_qa_pass_pending_owner').length,
  pendingSubagentQa: ordered.filter((entry) => entry.qa?.status === 'pending_owner_semantic_qa').length,
}
writeFileSync(selectionPath, `${JSON.stringify({
  ...selectionPayload,
  schemaVersion: 'gaokao-frequency-koboyo-selection-v3',
  status: 'subagent_visual_qa_in_progress',
  counts,
  entries: ordered,
}, null, 2)}\n`)
console.log(JSON.stringify(counts))
