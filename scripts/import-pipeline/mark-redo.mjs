#!/usr/bin/env node
import { deepStrictEqual } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { finalizeContentSubject, finalizeInventory, finalizeProjection } from '../../server/import-review/finalizeComputation.mjs'
import { validateAgentOcrCorrectionReceipt } from '../../server/import-review/importReviewStore.mjs'
import { buildNck1SealedReviewProjection, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { LISTENING_REVIEW_FILE, listeningReviewSubject, RETAINED_LISTENING_NAVIGATION } from '../../server/paper-import/listeningReview.mjs'
import { NCK1_OCR_CONFIRMATION_FILE_NAME } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { SOURCE_REFERENCES_FILE } from '../../server/paper-import/sourceReferences.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { prepareSealedCandidate, pushPreparedCandidate } from './lecture-redo.mjs'
import { hydratedEvidenceBase, prepareReviewPush, withLocalReviewEvidence } from './review.mjs'

const confirmationFile = `materialization/${NCK1_OCR_CONFIRMATION_FILE_NAME}`
const reportFile = 'agent-ocr-correction-report-v2.json'
const bindingFiles = ['paragraph-summaries-v1.json', 'public-search-metadata-v1.json',
  reportFile, 'pagination-plan.json', SOURCE_REFERENCES_FILE]
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value, flag = 'w') => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag })

export function moveUnderline(item, from, to, text) {
  function coordinates(value) {
    if (!/^\d+,\d+$/u.test(value ?? '')) throw new Error('坐标必须为 start,end')
    const [start, end] = value.split(',').map(Number)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start
      || end > item.text.length || !text || item.text.slice(start, end) !== text) {
      throw new Error('坐标文本与 --text 不符')
    }
    return { start, end }
  }
  const next = coordinates(to)
  if (!/^[\p{L}\p{M}\p{N}].*[\p{L}\p{M}\p{N}]$|^[\p{L}\p{M}\p{N}]$/u.test(text)
    || /[\p{L}\p{M}\p{N}]['’‐‑-]?$/u.test(item.text.slice(0, next.start))
    || /^['’‐‑-]?[\p{L}\p{M}\p{N}]/u.test(item.text.slice(next.end))) {
    throw new Error('新坐标必须匹配整词')
  }
  const ranges = item.sourceEmphasis ?? []
  const previous = from === 'none' ? null : coordinates(from)
  const matched = previous && ranges.find(range => range.start === previous.start
    && range.end === previous.end && range.marks.includes('underline'))
  if (previous && (!matched || (previous.start === next.start && previous.end === next.end))) {
    throw new Error('旧坐标须匹配一处待移动的画线')
  }
  const remaining = ranges.filter(range => range !== matched)
  if (remaining.some(range => range.start < next.end && range.end > next.start)) {
    throw new Error('新坐标与现有标注重叠')
  }
  return [...remaining, { ...next, marks: matched?.marks ?? ['underline'] }].sort((a, b) => a.start - b.start)
}

function editConfirmation(sealed, { block: blockId, from, to, text }) {
  const { materialization } = loadNck1ReviewSource(sealed)
  const block = materialization.groups.filter(group => group.family === 'reading')
    .flatMap(group => group.blocks).find(block => block.blockId === blockId)
  if (block?.kind !== 'paragraph' || block.source.kind !== 'page_region'
    || !block.content.every(run => run.kind === 'text')) throw new Error('须指定一处 OCR 阅读正文段落')
  const paragraph = block.content.map(run => run.text).join('')
  const confirmation = readJson(path.join(sealed, confirmationFile))
  const items = confirmation.documents.filter(doc => doc.documentId === block.source.documentId)
    .flatMap(doc => doc.pages.filter(page => page.page === block.source.page))
    .flatMap(page => page.orderedItems.filter(item => item.text === paragraph))
  if (items.length !== 1) throw new Error('正文段落须唯一对应同页一个 OCR 条目')
  const [item] = items
  item.sourceEmphasis = moveUnderline(item, from, to, text)
  return { confirmation, itemId: item.itemId, source: block.source }
}

function merge(work, sealed, base) {
  const edit = readJson(path.join(work, 'mark-receipt.json'))
  deepStrictEqual([edit.baseRevisionId, edit.bundleDigest], [base.id, base.bundleDigest], '修订回执与基线不符')
  const ready = path.join(work, 'ready')
  if (existsSync(ready)) throw new Error('该工作目录已有通过 finalize 的候选')
  const before = buildNck1SealedReviewProjection(sealed, base, { requireAnalyses: true })
  const staging = mkdtempSync(path.join(work, '.mark-merge-'))
  try {
    const bundle = path.join(staging, 'bundle')
    cpSync(sealed, bundle, { recursive: true, filter: source => source !== path.join(sealed, 'products') })
    const { confirmation, itemId, source } = editConfirmation(sealed, edit)
    deepStrictEqual([itemId, source], [edit.itemId, edit.source])
    writeJson(path.join(bundle, confirmationFile), confirmation)
    const loaded = loadNck1ReviewSource(bundle)
    const { candidate, issues } = withLocalReviewEvidence(bundle, () => importCanonicalCandidate(loaded.sourceInput,
      undefined, { materializationAuthorityRef: before.consumption.authorityRef }))
    if (!candidate || issues.length) throw new Error(issues[0]?.message ?? '无法重建 Candidate')
    const binding = { sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest }
    for (const file of bindingFiles) {
      const target = path.join(bundle, file)
      if (existsSync(target)) writeJson(target, { ...readJson(target), ...binding })
    }
    if (before.reviewedListening) {
      writeJson(path.join(bundle, LISTENING_REVIEW_FILE), { ...before.reviewedListening.review,
        subject: listeningReviewSubject(loaded, candidate), method: RETAINED_LISTENING_NAVIGATION })
    }
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'freeze-products.mjs'), '--paper-dir', bundle],
      { stdio: 'inherit' })
    const { manifest } = prepareReviewPush(bundle, { expectedBaseRevisionId: base.id })
    const mutable = new Set([confirmationFile, ...bindingFiles, LISTENING_REVIEW_FILE])
    const unchanged = files => files.filter(file => !mutable.has(file.path) && !file.path.startsWith('products/'))
      .sort((a, b) => a.path.localeCompare(b.path))
    deepStrictEqual(unchanged(manifest.files), unchanged(base.manifest.files), '题文、源文件、媒体或讲评字节有变化')
    const local = { ...manifest, manifest, id: 'rev-local-mark-redo', reviewKind: 'candidate',
      rendererBuildId: manifest.producerBuildId, evidenceBase: { revision: base, directory: sealed } }
    const after = finalizeProjection(bundle, local)
    const content = projection => ({ materialization: digestJson(projection.materialization),
      questions: digestJson(projection.paperAsset.content.questions),
      answers: digestJson(projection.paperAsset.answerKey), analysis: projection.analysisDigest })
    deepStrictEqual(content(after), content(before), '题文、题号、选项、答案或讲评有变化')
    if (after.ocrCorrectionReport) {
      validateAgentOcrCorrectionReceipt(after.ocrCorrectionReport, readJson(path.join(sealed, 'signals/agent-proofreading-receipt.json')),
        JSON.parse(Buffer.from(after.sourceInput.materializationBytes).toString('utf8')))
    }
    deepStrictEqual(finalizeInventory(bundle, local, after), manifest.files.map(file => `${file.path}\0${file.mediaType}\0${file.role}`).sort())
    const subject = finalizeContentSubject(bundle, local, after)
    if (!subject.ok) throw new Error(`本地 finalize 失败：${subject.reasonCode}`)
    const pdfs = revision => revision.files.filter(file => file.role === 'pdf_product')
      .map(({ path, sha256 }) => ({ path, sha256 }))
    deepStrictEqual(pdfs(manifest).map(file => file.path).sort(), pdfs(base.manifest).map(file => file.path).sort())
    const comparison = { before: content(before), after: content(after),
      unchangedFiles: unchanged(manifest.files), pdfs: { before: pdfs(base.manifest), after: pdfs(manifest) } }
    writeJson(path.join(staging, 'manifest.json'), manifest)
    writeJson(path.join(staging, 'merge-receipt.json'), { baseRevisionId: base.id,
      bundleDigest: manifest.bundleDigest, merged: [confirmationFile], edit, comparison })
    renameSync(staging, ready)
    console.log(JSON.stringify({ status: 'local_finalized', baseRevisionId: base.id, ...binding, comparison }))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const { values } = parseArgs({ args, options: Object.fromEntries(
    ['paper', 'work', 'block', 'from', 'to', 'text'].map(name => [name, { type: 'string' }]),
  ) })
  const required = { prepare: ['paper'], fix: ['block', 'from', 'to', 'text'], merge: [], push: [] }[command]
  const { work: workDir, ...options } = values
  if (!workDir || !required || required.length !== Object.keys(options).length || required.some(key => !options[key])) {
    throw new Error('用法：mark-redo.mjs prepare --paper ID --work DIR | fix --work DIR --block ID --from START,END|none --to START,END --text WORD | merge|push --work DIR')
  }
  const work = path.resolve(workDir)
  if (command === 'prepare') {
    const { base, sealed } = await prepareSealedCandidate(work, options.paper)
    console.log(JSON.stringify({ baseRevisionId: base.id, sealed }))
    return
  }
  if (command === 'push') return pushPreparedCandidate(work)
  const sealed = path.join(work, 'sealed')
  const base = hydratedEvidenceBase(sealed)?.revision
  if (!base) throw new Error('请先运行 prepare')
  if (command === 'merge') return merge(work, sealed, base)
  const { itemId, source } = editConfirmation(sealed, options)
  writeJson(path.join(work, 'mark-receipt.json'), { baseRevisionId: base.id, bundleDigest: base.bundleDigest,
    ...options, itemId, source }, 'wx')
}

if (import.meta.main) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
