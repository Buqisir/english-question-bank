#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { planMaterializationParagraphJoin, applyMaterializationParagraphJoinPlan } from './materialization-paragraph-joins.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const [command, paperId] = process.argv.slice(2)
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
const fail = message => { throw new Error(message) }
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
if (!['plan', 'apply'].includes(command) || !/^paper-[a-z0-9-]+$/u.test(paperId || '')) fail('Use plan/apply with a valid paperId')
const applying = command === 'apply'
const defaultDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
const paperDir = path.resolve(option('--paper-dir') || defaultDir)
const output = option('--output') && path.resolve(option('--output'))
// External paper inputs are read-only; installation uses the ordinary local
// paper and the existing downstream redo transaction.
if (applying && !output && paperDir !== defaultDir) fail('External paper directories require a separate --output preview')
if (output && (output === paperDir || output.startsWith(`${paperDir}${path.sep}`))) fail('Paragraph join preview/plan output must be outside its source paper directory')
if (output && existsSync(output)) fail('Paragraph join output already exists; retain it and choose a new path')
if (!applying && !output) fail('Paragraph join plan requires a new --output file')
if (applying && !process.argv.includes('--agent-confirmed')) fail('Paragraph join requires --agent-confirmed original-page review')
const { sourceInput, manifest } = loadNck1ReviewSource(paperDir, { preparingSpelling: true })
if (JSON.parse(new TextDecoder().decode(sourceInput.materializationBytes)).paperId !== paperId) fail('Paper identity differs')
const receiptFile = path.join(paperDir, 'signals/agent-proofreading-receipt.json')
const receiptBytes = new Uint8Array(readFileSync(receiptFile))
const plan = applying ? readJson(option('--plan'))
  : planMaterializationParagraphJoin(sourceInput, receiptBytes, {
    groupId: option('--group'), itemIds: option('--items')?.split(','), reason: option('--reason'),
  })
// Plan is only a review artifact. Both paths prove the proposed source and
// Canonical Candidate before writing any output.
const result = applyMaterializationParagraphJoinPlan(sourceInput, receiptBytes, plan, { confirmed: true })
const imported = importCanonicalCandidate({ ...sourceInput, materializationBytes: result.materializationBytes })
if (imported.issues.length) fail(`Paragraph join source admission failed: ${JSON.stringify(imported.issues)}`)
const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
if (!preview.compilation) fail(`Paragraph join Canonical validation failed: ${JSON.stringify(preview.unresolvedIssues)}`)
let rebuild = null
if (applying && !output) {
  // Re-read every bound original after expensive replay and before mutation.
  // Existing locks and single-writer ownership remain required.
  const fresh = loadNck1ReviewSource(paperDir, { preparingSpelling: true })
  applyMaterializationParagraphJoinPlan(fresh.sourceInput, new Uint8Array(readFileSync(receiptFile)), plan, { confirmed: true })
  const { invalidateParagraphJoinDownstream } = await import('./fast-import.mjs')
  rebuild = await invalidateParagraphJoinDownstream(paperId, plan.binding.materializationSha256)
  writeJson(path.join(root, 'imports/ocr-proofread', paperId, `paragraph-join-${plan.planDigest.slice(7)}.json`), plan)
  writeJson(path.join(paperDir, manifest.materializationPath), result.materialization)
} else {
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, applying ? result.materializationBytes : `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
}
console.log(JSON.stringify({ ok: true, paperId, mode: applying ? (output ? 'preview' : 'applied') : 'plan',
  output: output || path.join(paperDir, manifest.materializationPath), planDigest: plan.planDigest,
  relation: plan.relation, rebuild,
  next: applying && !output ? `fast-import.mjs after-proofread ${paperId}; then finish and recheck Screen/PDF` : null }, null, 2))
