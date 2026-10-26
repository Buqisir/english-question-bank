#!/usr/bin/env node
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reviewMediaFileName, resolveReviewFile } from '../../server/import-review/revisionProjection.mjs'
import { planMaterializationListeningSource, applyMaterializationListeningSourcePlan } from './materialization-listening-source.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const fail = message => { throw new Error(message) }
const within = (file, dir) => file === dir || file.startsWith(`${dir}${path.sep}`)
const actualPath = file => existsSync(file) ? realpathSync(file)
  : path.join(actualPath(path.dirname(file)), path.basename(file))

// Authoring can precede audio QA, spelling and independent image fixes. Never
// pretend this narrow loader is a complete Review/publication-ready manifest.
export function loadListeningSourceAuthorInput(paperDir) {
  paperDir = realpathSync(paperDir)
  const originals = new Map()
  const read = relative => {
    const file = resolveReviewFile(paperDir, relative)
    const bytes = readFileSync(file)
    originals.set(file, bytes)
    return bytes
  }
  const manifest = JSON.parse(read('universal-source-manifest.json'))
  const materializationBytes = read(manifest.materializationPath)
  const materialization = JSON.parse(materializationBytes)
  const input = { kind: 'nck1-source-materialization', materializationBytes,
    documents: materialization.documents.map(document => {
      const declared = manifest.documents.filter(item => item.documentId === document.documentId)
      if (declared.length !== 1) fail('Manifest document is missing or ambiguous')
      return { documentId: document.documentId, bytes: read(declared[0].path) }
    }),
    media: materialization.media.map(media => ({ mediaId: media.mediaId,
      bytes: read(path.posix.join(manifest.mediaDirectory, reviewMediaFileName(media))) })),
    ocrSourceBytes: { evidenceBytes: read('materialization/nck1-ocr-source-evidence-v1.json'),
      confirmationBytes: read('materialization/nck1-ocr-source-confirmation-v1.json') } }
  const receiptBytes = read('signals/agent-proofreading-receipt.json')
  return { input, receiptBytes, materialization, manifest,
    assertUnchanged() {
      for (const [file, before] of originals) if (!readFileSync(file).equals(before)) fail(`Bound original changed during replay: ${file}`)
    } }
}

export async function authorListeningSource({ command, paperId, paperDir, output, request, plan, confirmed }) {
  if (!['plan', 'apply'].includes(command) || !/^paper-[a-z0-9-]+$/u.test(paperId || '')) fail('Use plan/apply and a valid paperId')
  if (command === 'apply' && confirmed !== true) fail('Listening source apply requires --agent-confirmed original-page review')
  paperDir = realpathSync(paperDir || path.join(root, 'scripts/import-pipeline/papers', paperId))
  if (!output) fail('Both plan and apply require a new --output outside the source directories')
  output = actualPath(path.resolve(output))
  const sourceRoot = path.resolve(paperDir, '../../../..')
  const work = actualPath(path.join(sourceRoot, 'imports/ocr-proofread', paperId))
  if (within(output, paperDir) || within(output, work)
    || within(output, path.join(root, 'scripts/import-pipeline/papers'))
    || within(output, path.join(root, 'imports/ocr-proofread')) || existsSync(output)) fail('Output must be new and outside source paper/work directories')
  const loaded = loadListeningSourceAuthorInput(paperDir)
  if (loaded.manifest.paperId !== paperId || loaded.materialization.paperId !== paperId) fail('Paper identity differs')
  const selectedPlan = command === 'plan'
    ? planMaterializationListeningSource(loaded.input, loaded.receiptBytes, request) : plan
  const result = applyMaterializationListeningSourcePlan(loaded.input, loaded.receiptBytes, selectedPlan, { confirmed: true })
  loaded.assertUnchanged()
  mkdirSync(path.dirname(output), { recursive: true })
  const temporary = `${output}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, command === 'plan' ? `${JSON.stringify(selectedPlan, null, 2)}\n` : result.materializationBytes, { flag: 'wx' })
    linkSync(temporary, output)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return { ok: true, paperId, mode: command, output, planDigest: selectedPlan.planDigest,
    installed: false, invalidatesFrom: 'spelling', publicReplay: result.publicReplay }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
  try {
    const command = process.argv[2]
    console.log(JSON.stringify(await authorListeningSource({
      command, paperId: process.argv[3], paperDir: option('--paper-dir'), output: option('--output'),
      request: command === 'plan' ? JSON.parse(readFileSync(option('--request'), 'utf8')) : undefined,
      plan: command === 'apply' ? JSON.parse(readFileSync(option('--plan'), 'utf8')) : undefined,
      confirmed: process.argv.includes('--agent-confirmed'),
    }), null, 2))
  } catch (error) { console.error(error.stack); process.exitCode = 1 }
}
