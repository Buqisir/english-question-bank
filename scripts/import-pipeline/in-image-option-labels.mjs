#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { IN_IMAGE_OPTION_LABELS_VERSION, resolveInImageOptionLabels } from '../../shared/paper-canonical/inImageOptionLabels.mjs'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { deriveNck1MaterializationBundle } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'

const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const parse = bytes => JSON.parse(new TextDecoder().decode(bytes))
const same = (a, b) => digestJson(a) === digestJson(b)
const fail = message => { throw new Error(message) }
const PLAN_VERSION = 'reading-in-image-option-labels-plan-v1'

function context(input) {
  const raw = parse(input.materializationBytes)
  const evidence = parse(input.ocrSourceBytes?.evidenceBytes)
  const confirmation = parse(input.ocrSourceBytes?.confirmationBytes)
  if (!/^nck1-source-materialization-v(?:[3-9]|1[01])$/u.test(raw.schemaVersion)
    || confirmation.schemaVersion !== 'nck1-ocr-source-confirmation-v3' || confirmation.confirmed !== true
    || raw.paperId !== evidence.paperId || raw.paperId !== confirmation.paperId
    || confirmation.evidenceDigest !== evidence.evidenceDigest || confirmation.sourceSetDigest !== evidence.sourceSetDigest
    || input.documents.length !== raw.documents.length
    || raw.documents.some(document => {
      const supplied = input.documents.filter(value => value.documentId === document.documentId)
      return supplied.length !== 1 || sha256(supplied[0].bytes) !== document.sha256
    })) fail('In-image labels require the exact confirmed OCR generation and original PDFs')
  return { raw, evidence, confirmation, binding: {
    materializationSha256: sha256(input.materializationBytes),
    evidenceSha256: sha256(input.ocrSourceBytes.evidenceBytes),
    confirmationSha256: sha256(input.ocrSourceBytes.confirmationBytes),
    sourceDocuments: input.documents.map(document => ({ documentId: document.documentId, sha256: sha256(document.bytes) })),
  } }
}

// Selection supplies every letter/child/label rectangle. None is inferred from
// four images, a coordinate sort, a filename, or an empty OCR itemIds array.
export function planInImageOptionLabels(input, selection) {
  const { raw, evidence, confirmation, binding } = context(input)
  if (!exactKeys(selection, ['groupId', 'questionId', 'parentMediaId', 'parentRegionId', 'parentSource', 'anchorItemId', 'labels', 'reason'])
    || typeof selection.reason !== 'string' || !selection.reason.trim()) fail('Supply a closed explicit label selection and original-image review reason')
  const group = raw.groups.find(group => group.groupId === selection.groupId && group.family === 'reading')
  const question = group?.questions.find(question => question.questionId === selection.questionId)
  const document = raw.documents.find(document => document.documentId === selection.parentSource?.documentId)
  if (!question || !document) fail('Selection requires a Reading question and its original PDF')
  const decision = {
    schemaVersion: IN_IMAGE_OPTION_LABELS_VERSION, groupId: selection.groupId, questionId: selection.questionId,
    questionSource: structuredClone(question.source), anchorItemId: selection.anchorItemId,
    parentMediaId: selection.parentMediaId, parentRegionId: selection.parentRegionId,
    parentSource: structuredClone(selection.parentSource), sourceDocumentSha256: document.sha256,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest,
    confirmationDigest: digestJson(confirmation),
    sourceReview: { reviewedBy: 'import_agent', labelsInParentPixels: true, reason: selection.reason },
    labels: structuredClone(selection.labels),
  }
  resolveInImageOptionLabels({ ...raw, schemaVersion:
    ['nck1-source-materialization-v10', 'nck1-source-materialization-v11'].includes(raw.schemaVersion)
      ? raw.schemaVersion : 'nck1-source-materialization-v9',
    inImageOptionLabels: [...(raw.inImageOptionLabels || []), decision] })
  const plan = { schemaVersion: PLAN_VERSION, paperId: raw.paperId, binding, decision }
  return { ...plan, planDigest: digestJson(plan) }
}

export function applyInImageOptionLabelsPlan(input, plan, { confirmed = false } = {}) {
  if (confirmed !== true) fail('In-image labels require --agent-confirmed original-image review')
  const { raw, binding } = context(input)
  if (!exactKeys(plan, ['schemaVersion', 'paperId', 'binding', 'decision', 'planDigest'])
    || plan.schemaVersion !== PLAN_VERSION || plan.paperId !== raw.paperId || !same(plan.binding, binding)) fail('In-image label plan is stale or belongs to another source generation')
  const { planDigest, ...body } = plan
  if (planDigest !== digestJson(body)) fail('In-image label plan digest is invalid')
  const d = plan.decision
  const regenerated = planInImageOptionLabels(input, {
    groupId: d.groupId, questionId: d.questionId, parentMediaId: d.parentMediaId, parentRegionId: d.parentRegionId,
    parentSource: d.parentSource, anchorItemId: d.anchorItemId, labels: d.labels, reason: d.sourceReview?.reason,
  })
  if (!same(plan, regenerated)) fail('In-image label plan differs from its exact source-bound selection')
  const materialization = { ...raw, schemaVersion:
    ['nck1-source-materialization-v10', 'nck1-source-materialization-v11'].includes(raw.schemaVersion)
      ? raw.schemaVersion : 'nck1-source-materialization-v9',
    inImageOptionLabels: [...(raw.inImageOptionLabels || []), structuredClone(d)] }
  const materializationBytes = encode(materialization)
  // The ordinary adapter replays the immutable question/parent ordering, child
  // crop recipes, coverage and exactly-once ownership before any file is written.
  const derived = deriveNck1MaterializationBundle({ ...input, materializationBytes })
  if (derived.issues.length) fail(`In-image label source admission failed: ${JSON.stringify(derived.issues)}`)
  return { materialization, materializationBytes }
}

function main() {
  const [command, paperId] = process.argv.slice(2)
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
  if (!['plan', 'apply'].includes(command) || !/^paper-[a-z0-9-]+$/u.test(paperId || '')) fail('Use plan/apply <paperId> --paper-dir <dir> --selection/--plan <json> --output <new-file>')
  if (!option('--paper-dir') || !option('--output')) fail('An explicit paper directory and separate output are required')
  const inputOption = command === 'plan' ? '--selection' : '--plan'
  if (!option(inputOption)) fail(`${command} requires ${inputOption} <json>`)
  const paperDir = realpathSync(path.resolve(option('--paper-dir')))
  const output = path.resolve(option('--output'))
  if (existsSync(output)) fail('Output already exists; retain it and choose another path')
  // Resolve the nearest existing ancestor, so symlinked output directories
  // cannot turn an external preview into a source-tree mutation.
  let ancestor = path.dirname(output)
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const resolvedOutput = path.resolve(realpathSync(ancestor), path.relative(ancestor, output))
  if (resolvedOutput === paperDir || resolvedOutput.startsWith(`${paperDir}${path.sep}`)) fail('Output must be outside the read-only source paper directory')
  if (command === 'apply' && !process.argv.includes('--agent-confirmed')) fail('Apply requires --agent-confirmed original-image review')
  const { sourceInput } = loadNck1ReviewSource(paperDir, { preparingSpelling: true })
  if (parse(sourceInput.materializationBytes).paperId !== paperId) fail('Paper identity differs')
  const read = file => JSON.parse(readFileSync(file, 'utf8'))
  const plan = command === 'plan' ? planInImageOptionLabels(sourceInput, read(option('--selection'))) : read(option('--plan'))
  const result = command === 'apply' ? applyInImageOptionLabelsPlan(sourceInput, plan, { confirmed: true }) : null
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, result?.materializationBytes || encode(plan), { flag: 'wx' })
  console.log(JSON.stringify({ ok: true, paperId, mode: command, output, planDigest: plan.planDigest }))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
