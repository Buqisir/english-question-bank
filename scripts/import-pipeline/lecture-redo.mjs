#!/usr/bin/env node
import { deepStrictEqual } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { finalizeContentSubject, finalizeInventory, finalizeProjection } from '../../server/import-review/finalizeComputation.mjs'
import { validateAgentOcrCorrectionReceipt } from '../../server/import-review/importReviewStore.mjs'
import { buildNck1AnalysisGroup, NCK1_LISTENING_STAGED_ANALYSIS, NCK1_STAGED_ANALYSIS_FILES } from '../../server/import-review/nck1AnalysisProjection.mjs'
import { buildNck1SealedReviewProjection } from '../../server/import-review/revisionProjection.mjs'
import { buildClozeAnalysisMessages } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'
import { buildListeningAnalysisAgentRequest } from '../../server/paper-import-ai/analyzeListening.mjs'
import { buildNarrativeContinuationStagedAnalysisContract } from '../../server/paper-import-ai/analyzeNarrativeContinuation.mjs'
import { buildReadingAnalysisMessages } from '../../server/paper-import-ai/analyzeReading.mjs'
import { buildSevenChoicesAnalysisMessages } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildApplicationStagedAnalysisContract } from '../../server/paper-import-ai/applicationWritingWorkflow.mjs'
import { projectEffectiveAnswers } from '../../server/paper-import/answerCorrections.mjs'
import { PRODUCT_MANIFEST } from '../../server/paper-import/frozenProducts.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { mergeReviewedListeningAnalysis } from './lib-listening-analysis.mjs'
import { alignReviewedListeningSentences } from './listening-sentence-align.mjs'
import { hydrateReviewRevision, hydratedEvidenceBase, prepareReviewPush, reviewCandidate, uploadReviewBundle } from './review.mjs'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
const run = (name, ...args) => execFileSync(process.execPath, [path.join(import.meta.dirname, name), ...args], { stdio: 'inherit' })
const analysisPdf = 'products/analysis.pdf'
const descriptors = [...NCK1_STAGED_ANALYSIS_FILES, NCK1_LISTENING_STAGED_ANALYSIS]
const objectiveBuilders = {
  reading: buildReadingAnalysisMessages, 'seven-choices': buildSevenChoicesAnalysisMessages,
  cloze: buildClozeAnalysisMessages, 'grammar-fill': buildGrammarFillAnalysisMessages,
}
const writingContracts = {
  application: buildApplicationStagedAnalysisContract,
  continuation: buildNarrativeContinuationStagedAnalysisContract,
}
const teachingSchema = readFileSync(new URL('../../schemas/paper-import/objective-teaching-content-v1.schema.json', import.meta.url), 'utf8').trim()
const stagedKey = source => source.writingTask?.taskType ?? {
  'seven-choices': 'seven', 'grammar-fill': 'grammar',
}[source.slotId] ?? source.slotId.replace('.', '-')
const range = numbers => numbers.length ? `${Math.min(...numbers)}–${Math.max(...numbers)}` : '写作任务'

function listening(directory, projection) {
  return alignReviewedListeningSentences(projection.materialization, projection.reviewedListening.review,
    file => readJson(path.join(directory, file)))
}

function groupRequest(projection, source, order, key) {
  const { consumption, materialization, paperAsset } = projection
  const paper = { paperId: projection.paperId, sourceAssetVersion: consumption.sourceAssetVersion,
    sourceFilename: 'nck1-source-materialization-v1.json', sourceHash: projection.sourceDigest }
  const group = buildNck1AnalysisGroup(paperAsset, source, order, materialization.media)
  const material = { paper, group }
  let authoritativeAnswers
  let outputContract
  if (source.writingTask) {
    const { writingTaskId } = paperAsset.content.groups[source.groupId]
    material.writingTask = { ...paperAsset.content.writingTasks[writingTaskId] }
    const given = source.writingTask.givenSkeleton ?? []
    if (key === 'application' && given.length) {
      const isBottom = item => ['closing', 'signature'].includes(item.role)
      material.writingTask.applicationGiven = {
        top: given.filter(item => !isBottom(item)).map(item => item.text),
        bottom: given.filter(isBottom).map(item => item.text),
      }
    }
    authoritativeAnswers = { officialModelAnswer: material.writingTask.officialModelAnswer ?? null }
    outputContract = writingContracts[key]()
  } else {
    authoritativeAnswers = Object.fromEntries(group.questions.map(({ id, answerKey }) =>
      [id, { questionId: id, answer: answerKey }]))
    const [system] = objectiveBuilders[source.family](material)
    outputContract = `${system.content}\n\nExact required groups[groupId].teachingContent JSON Schema:\n${teachingSchema}`
  }
  return { group: key, sourceGroup: { groupKey: key, material }, authoritativeAnswers, outputContract }
}

async function prepare(work, paperId) {
  const base = await reviewCandidate(paperId)
  if (!base || !/^rev-[a-z0-9-]+$/iu.test(base.id)) throw new Error(`没有可用的封存 Candidate：${paperId}`)
  const sealed = path.join(work, 'sealed')
  if (!existsSync(sealed)) {
    await hydrateReviewRevision(base, sealed, { resumeDirectory: path.join(work, `.hydrate-${base.id}`) })
  }
  const restored = hydratedEvidenceBase(sealed)?.revision
  deepStrictEqual([restored?.id, restored?.bundleDigest], [base.id, base.bundleDigest], '工作目录基线已变')
  if (existsSync(path.join(work, 'requests'))) throw new Error('请求已准备，请使用 merge')

  const projection = buildNck1SealedReviewProjection(sealed, base, { requireAnalyses: true })
  const staging = mkdtempSync(path.join(work, '.requests-'))
  try {
    const index = [`# ${paperId} · ${base.id}`, '',
      '| 请求 | 讲评文件 | 题号 | 草稿路径 |', '| --- | --- | --- | --- |']
    function add(descriptor, request, numbers) {
      const file = `${descriptor.key}.request.json`
      writeJson(path.join(staging, file), { ...request, baseRevisionId: base.id,
        instructions: '按权威答案写完整 JSON。精确引用题面，保留来源 ID。只输出讲评对象。' })
      const draft = path.join(work, 'drafts', `${descriptor.key}.json`)
      index.push(`| ${file} | ${descriptor.path} | ${range(numbers)} | \`${draft}\` |`)
    }
    const skipped = []
    projection.materialization.groups.forEach((source, order) => {
      const numbers = source.questions.map(question => question.canonicalNumber)
      const descriptor = NCK1_STAGED_ANALYSIS_FILES.find(item => item.key === stagedKey(source))
      if (descriptor) add(descriptor, groupRequest(projection, source, order + 1, descriptor.key), numbers)
      else skipped.push(`- ${source.slotId}（${range(numbers)}）缺少讲评合同，跳过。`)
    })
    const effective = projectEffectiveAnswers(projection.materialization, projection.answerCorrections)
    if (effective.listening?.state === 'captured') {
      const sentenceTargets = Object.fromEntries(listening(sealed, projection).filter(segment => !segment.degraded)
        .map(({ segment, sentences }) => [segment, sentences.map(({ id, en }) => ({ id, en }))]))
      add(NCK1_LISTENING_STAGED_ANALYSIS, buildListeningAnalysisAgentRequest({
        materialization: effective, sentenceTargets,
      }), effective.listening.questions.map(question => question.canonicalNumber))
    }
    writeFileSync(path.join(staging, 'INDEX.md'), [...index, '', ...skipped, ''].join('\n'))
    mkdirSync(path.join(work, 'drafts'), { recursive: true })
    const bundle = path.join(work, 'bundle')
    if (!existsSync(bundle)) {
      cpSync(sealed, path.join(staging, 'bundle'), { recursive: true })
      renameSync(path.join(staging, 'bundle'), bundle)
    }
    renameSync(staging, path.join(work, 'requests'))
    console.log(path.join(work, 'requests', 'INDEX.md'))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function merge(work) {
  const sealed = path.join(work, 'sealed')
  const base = hydratedEvidenceBase(sealed)?.revision
  if (!base || !existsSync(path.join(work, 'requests', 'INDEX.md'))) throw new Error('请先运行 prepare')
  const ready = path.join(work, 'ready')
  if (existsSync(ready)) throw new Error('该工作目录已有通过 finalize 的合稿')
  const staging = mkdtempSync(path.join(work, '.merge-'))
  try {
    const bundle = path.join(staging, 'bundle')
    const before = buildNck1SealedReviewProjection(sealed, base, { requireAnalyses: true })
    cpSync(path.join(work, 'bundle'), bundle, { recursive: true })
    const merged = []
    for (const filename of readdirSync(path.join(work, 'drafts')).filter(file => file.endsWith('.json')).sort()) {
      const descriptor = descriptors.find(item => `${item.key}.json` === filename)
      if (!descriptor) throw new Error(`无法识别的草稿：${filename}`)
      const { key, path: output } = descriptor
      const draft = path.join(work, 'drafts', filename)
      const request = path.join(work, 'requests', `${key}.request.json`)
      deepStrictEqual(readJson(request).baseRevisionId, base.id, `${key} 的请求版本不同`)
      const target = path.join(bundle, output)
      if (key === NCK1_LISTENING_STAGED_ANALYSIS.key) {
        const effective = projectEffectiveAnswers(before.materialization, before.answerCorrections)
        const analysis = mergeReviewedListeningAnalysis(effective, listening(sealed, before), { authored: readJson(draft) })
        writeFileSync(target, `${JSON.stringify(analysis, null, 2)}\n`)
      } else {
        cpSync(draft, target)
      }
      run('validate-analysis.mjs', request, target)
      merged.push(output)
    }
    if (!merged.length) throw new Error('没有可合入的草稿')
    run('freeze-products.mjs', '--paper-dir', bundle)
    const { manifest } = prepareReviewPush(bundle, { expectedBaseRevisionId: base.id })
    const mutable = new Set([...merged, PRODUCT_MANIFEST, analysisPdf])
    const unchanged = files => files.filter(file => !mutable.has(file.path)).sort((a, b) => a.path.localeCompare(b.path))
    deepStrictEqual(unchanged(manifest.files), unchanged(base.manifest.files), '封存文件哈希或四款 PDF 字节发生变化')
    for (const key of ['sourceDigest', 'candidateDigest', 'visibleStructureDigest']) {
      deepStrictEqual(manifest[key], base.manifest[key], `${key} 发生变化`)
    }
    const local = { ...manifest, manifest, id: 'rev-local-lecture-redo', reviewKind: 'candidate',
      rendererBuildId: manifest.producerBuildId, evidenceBase: { revision: base, directory: sealed } }
    const after = finalizeProjection(bundle, local)
    const hardGate = projection => ({ questions: digestJson(projection.paperAsset.content.questions),
      officialAnswers: digestJson(projection.paperAsset.answerKey),
      listeningReview: digestJson(projection.reviewedListening?.review ?? null) })
    deepStrictEqual(hardGate(after), hardGate(before), '题目、答案或听力复核有变化')
    if (after.ocrCorrectionReport) {
      validateAgentOcrCorrectionReceipt(after.ocrCorrectionReport, readJson(path.join(sealed, 'signals/agent-proofreading-receipt.json')),
        JSON.parse(Buffer.from(after.sourceInput.materializationBytes).toString('utf8')))
    }
    deepStrictEqual(finalizeInventory(bundle, local, after), manifest.files.map(file => `${file.path}\0${file.mediaType}\0${file.role}`).sort())
    const subject = finalizeContentSubject(bundle, local, after)
    if (!subject.ok) throw new Error(`本地 finalize 失败：${subject.reasonCode}`)
    const pdfs = manifest.files.filter(file => file.role === 'pdf_product')
    if (!pdfs.some(file => file.path === analysisPdf)) throw new Error('缺少解析 PDF')
    writeJson(path.join(staging, 'manifest.json'), manifest)
    renameSync(staging, ready)
    const media = manifest.files.filter(file => /^(audio|image)\//u.test(file.mediaType))
    console.log(JSON.stringify({ status: 'local_finalized', bundle: path.join(ready, 'bundle'), merged,
      hardGate: { ...hardGate(after), media: media.map(({ path, sha256 }) => ({ path, sha256 })) },
      identicalToBase: true, pdfs: pdfs.map(({ path, sha256 }) => ({ path, sha256 })) }, null, 2))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

async function push(work) {
  const ready = path.join(work, 'ready')
  const bundle = path.join(ready, 'bundle')
  const manifest = readJson(path.join(ready, 'manifest.json'))
  const base = manifest.expectedBaseRevisionId
  const attempt = path.join(work, 'upload-attempt.json')
  if (existsSync(attempt)) throw new Error('已有上传尝试，请先只读对账上传回执和生产 Candidate')
  const latest = await reviewCandidate(manifest.paperId)
  if (!/^rev-[a-z0-9-]+$/iu.test(base) || latest?.id !== base) throw new Error('最新 Candidate 已变化')
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(bundle, file.path))
    if (bytes.length !== file.byteLength || sha256(bytes) !== file.sha256) throw new Error(`合稿后文件有变化：${file.path}`)
  }
  // Preserve this marker if registration or finalize returns an unknown outcome.
  writeJson(attempt, { base, bundleDigest: manifest.bundleDigest })
  const result = await uploadReviewBundle(bundle, manifest, path.join(work, 'upload-timeline.jsonl'))
  writeJson(path.join(work, 'upload-receipt.json'), result)
  rmSync(path.join(homedir(), '.cache', 'eqbank', 'revisions', base), { recursive: true, force: true })
  console.log(JSON.stringify({ revisionId: result.revision.id }))
}

try {
  const [command, ...args] = process.argv.slice(2)
  const { values } = parseArgs({ args, options: { paper: { type: 'string' }, work: { type: 'string' } } })
  if (!['prepare', 'merge', 'push'].includes(command) || !values.work || (command === 'prepare') !== Boolean(values.paper)) {
    throw new Error('用法：lecture-redo.mjs prepare --paper ID --work DIR | (merge|push) --work DIR')
  }
  const work = path.resolve(values.work)
  if (command === 'prepare') await prepare(work, values.paper)
  else if (command === 'merge') merge(work)
  else await push(work)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
