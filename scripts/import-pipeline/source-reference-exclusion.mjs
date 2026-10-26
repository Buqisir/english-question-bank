#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSourceReferences } from './ocr-proofread.mjs'
import { confirmSourceReferenceFigureExclusion } from '../../server/paper-import/sourceReferenceFigureExclusions.mjs'
import { resolveConfirmedNck1OcrEvidence } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const fail = message => { throw new Error(message) }
const within = (file, directory) => file === directory || file.startsWith(`${directory}${path.sep}`)

export async function excludeExplanationFigure(paperId, {
  paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId),
  output, figureId, figureIdentitySha256, anchorItemId, reason, confirmed,
} = {}) {
  if (!/^paper-[a-z0-9-]+$/u.test(paperId || '')) fail('A valid paperId is required')
  if (confirmed !== true) fail('Explanation figure exclusion requires --agent-confirmed original-page review')
  paperDir = path.resolve(paperDir)
  output = output && path.resolve(output)
  const local = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const work = path.join(root, 'imports/ocr-proofread', paperId)
  if (!output && paperDir !== local) fail('External sources require a separate --output preview')
  if (output && (within(output, paperDir) || within(output, work) || existsSync(output))) {
    fail('Use a new preview output outside the source paper/work directories')
  }
  const { assertExplanationFigureMutable } = await import('./fast-import.mjs')
  const sourceWork = paperDir === local ? work
    : path.join(path.resolve(paperDir, '../../../..'), 'imports/ocr-proofread', paperId)
  assertExplanationFigureMutable(paperId, { paperDir, work: sourceWork, fast: path.join(sourceWork, 'fast') })
  const originals = new Map()
  const bytes = file => {
    const value = readFileSync(file)
    originals.set(file, value)
    return value
  }
  const json = file => JSON.parse(bytes(file))
  const manifest = json(path.join(paperDir, 'universal-source-manifest.json'))
  const materialization = json(path.join(paperDir, 'materialization/nck1-source-materialization-v1.json'))
  if (materialization.paperId !== paperId) fail('Materialization paper identity differs')
  const evidenceFile = path.join(paperDir, 'materialization/nck1-ocr-source-evidence-v1.json')
  const confirmationFile = path.join(paperDir, 'materialization/nck1-ocr-source-confirmation-v1.json')
  const evidence = json(evidenceFile), confirmation = json(confirmationFile)
  const documents = manifest.documents.filter(document => !document.renditionOf)
    .map(document => ({ ...document, bytes: bytes(path.join(paperDir, document.path)) }))
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence, confirmation })
  if (resolved.issues.length) fail(`Invalid source evidence: ${resolved.issues[0].message}`)
  const declaration = confirmSourceReferenceFigureExclusion(materialization, evidence, confirmation,
    resolved.referenceFigures, { figureId, figureIdentitySha256, anchorItemId, reason, confirmed })
  const draftFile = path.join(work, 'source-references-draft.json')
  // External paper previews never borrow this checkout's authored decisions.
  const retainedFile = paperDir === local && existsSync(draftFile) ? draftFile
    : path.join(paperDir, 'source-references-v1.json')
  const retained = existsSync(retainedFile) ? json(retainedFile) : null
  if (retained && retained.paperId !== paperId) fail('Retained reference paper identity differs')
  const figureExclusions = [...(retained?.figureExclusions ?? []), declaration]
  const captured = buildSourceReferences(materialization, evidence, confirmation,
    { sourceDocuments: documents, paperName: manifest.provenance?.paperName, figureExclusions })
  // Prove the same figure/text admission as finalize, without claiming a new
  // Candidate or rebinding any upstream report. Draft digests remain unset.
  const binding = { sourceDigest: sha256('unbound source preview'), candidateDigest: sha256('unbound candidate preview') }
  const sidecar = { schemaVersion: captured.schemaVersion, paperId, ...binding,
    materializationDigest: digestJson(materialization), groups: captured.groups, figureExclusions }
  assertSourceReferenceAdmission({ ...binding, sidecar, materialization,
    sourceInput: { documents, ocrSourceBytes: {
      evidenceBytes: originals.get(evidenceFile), confirmationBytes: originals.get(confirmationFile),
    } } })
  const draft = { ...sidecar, sourceDigest: null, candidateDigest: null, materializationDigest: null }
  let rebuild = null
  if (!output) {
    for (const [file, original] of originals) if (!readFileSync(file).equals(original)) fail('Source changed during exclusion validation')
    const { invalidateExplanationFigureDownstream } = await import('./fast-import.mjs')
    rebuild = await invalidateExplanationFigureDownstream(paperId,
      sha256(originals.get(path.join(paperDir, 'materialization/nck1-source-materialization-v1.json'))))
  }
  const target = output || draftFile
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(draft, null, 2)}\n`, { flag: 'wx' })
  return { ok: true, paperId, output: target, mode: output ? 'preview' : 'applied', declaration, rebuild }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] }
  try {
    console.log(JSON.stringify(await excludeExplanationFigure(process.argv[2], {
      paperDir: option('--paper-dir'), output: option('--output'),
      figureId: option('--figure'), figureIdentitySha256: option('--figure-sha256'),
      anchorItemId: option('--anchor'), reason: option('--reason'),
      confirmed: process.argv.includes('--agent-confirmed'),
    }), null, 2))
  } catch (error) {
    console.error(error.stack)
    process.exitCode = 1
  }
}
