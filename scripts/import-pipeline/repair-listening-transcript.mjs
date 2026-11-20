#!/usr/bin/env node
import { deepStrictEqual } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { finalizeContentSubject, finalizeInventory, finalizeProjection } from '../../server/import-review/finalizeComputation.mjs'
import { validateAgentOcrCorrectionReceipt } from '../../server/import-review/importReviewStore.mjs'
import { buildNck1SealedReviewProjection, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { LISTENING_STAGED_ANALYSIS_FILE_NAME, mergeListeningSentenceAnalysis } from '../../server/paper-import-ai/analyzeListening.mjs'
import { LISTENING_REVIEW_FILE, listeningReviewSubject, validateListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { SOURCE_REFERENCES_FILE } from '../../server/paper-import/sourceReferences.mjs'
import { SPELLING_REVIEW_FILE, verifyListeningEditOccurrences } from '../../server/paper-import/spellingReview.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { LISTENING_RULE_EVIDENCE_VERSION } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { alignReviewedListeningSentences } from './listening-sentence-align.mjs'
import { rebindFastListening } from './fast-import.mjs'
import { segmentListening } from './listening-segment.mjs'
import { hydratedEvidenceBase, hydrateReviewRevision, prepareReviewPush, reviewCandidate,
  uploadReviewBundle, withLocalReviewEvidence } from './review.mjs'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const editKey = ({ segmentId, start, before, after }) => digestJson({ segmentId, start, before, after })
const transcriptText = ({ listening, ...source }) => ({
  ...source, listening: { ...listening, transcript: listening.transcript.map(({ text, ...segment }) => segment) },
})
const boundSidecars = ['paragraph-summaries-v1.json', 'public-search-metadata-v1.json',
  'agent-ocr-correction-report-v2.json', 'pagination-plan.json', SOURCE_REFERENCES_FILE]

function rebindNavigation(sealed, bundle, work, loaded, candidate) {
  const old = readJson(path.join(sealed, LISTENING_REVIEW_FILE))
  const transcript = loaded.materialization.listening.transcript
  const subject = listeningReviewSubject(loaded, candidate)
  const rule = old.evidence.filter(file => file.kind === 'review_notes')
    .map(file => readJson(path.join(sealed, file.path))).find(notes => notes.schemaVersion === LISTENING_RULE_EVIDENCE_VERSION)
  const result = segmentListening({ paperDir: bundle, output: path.join(work, 'navigation'),
    request: { transcript, sourceInstructions: loaded.materialization.sourcePresentation?.instructions,
      report: { ...old, subject } }, retainedReview: { directory: sealed, review: old },
    fuzzyAnchors: rule?.rule.fuzzyAnchorsEnabled })
  const review = readJson(result.review)
  // Reuse an existing agent boundary judgment only where the replay still
  // needs one. The validator checks every word against the new evidence paths.
  if (old.method === 'agent_asr_comparison') {
    const paths = new Map(old.evidence.map(file => [file.path,
      review.evidence.find(next => next.sha256 === file.sha256)?.path]))
    review.groups = review.groups.map((group, index) => {
      const previous = old.groups[index]
      if (group.decision !== 'review_required' || !previous?.boundaryJudgment) return group
      const rebound = structuredClone(previous)
      for (const occurrence of rebound.occurrences) {
        occurrence.evidencePaths = occurrence.evidencePaths.map(file => paths.get(file)).filter(Boolean)
      }
      for (const edge of Object.values(rebound.boundaryJudgment)) {
        for (const word of edge.words) word.evidencePath = paths.get(word.evidencePath)
      }
      review.method = old.method
      return rebound
    })
  }
  validateListeningReview(result.attempt, review, subject, transcript)
  for (const file of review.evidence) copyFileSync(path.join(result.attempt, file.path), path.join(bundle, file.path))
  writeJson(path.join(bundle, LISTENING_REVIEW_FILE), review)
  return { review, boundaryChanges: review.groups.flatMap((group, index) => {
    const before = old.groups[index].playback
    return digestJson(before) === digestJson(group.playback) ? [] : [{ segmentId: group.segmentId, before, after: group.playback }]
  }) }
}

function refreshAnalysis(bundle, materialization, aligned, changedSegments, replacement) {
  const file = path.join(bundle, LISTENING_STAGED_ANALYSIS_FILE_NAME)
  if (!existsSync(file)) return
  const analysis = readJson(file)
  const authored = replacement ? readJson(replacement) : analysis
  for (const { segmentId, text } of materialization.listening.transcript) {
    const material = analysis.materials[segmentId]
    if (!changedSegments.has(segmentId) || !material) continue
    const next = structuredClone(authored.materials[segmentId])
    // Sentence IDs are positional. Preserve a translation only when its
    // English text and speaker identify a single sentence in both versions.
    const sentences = aligned.find(segment => segment.segment === segmentId)?.sentences ?? []
    const same = (a, b) => a.en === b.en && a.speaker === b.speaker
    const translated = next.sentences ?? []
    next.sentences = sentences.flatMap(sentence => {
      const matches = translated.filter(old => same(old, sentence))
      return matches.length === 1 && matches[0].zh && sentences.filter(other => same(other, sentence)).length === 1
        ? [{ id: sentence.id, zh: matches[0].zh }] : []
    })
    analysis.materials[segmentId] = { ...next, transcript: text }
    for (const id of material.questionIds) {
      const question = authored.questions[id]
      if (!text.includes(question?.evidence?.quote)) {
        throw new Error(`${id} 引文已失效。请用 --analysis 提供修订后的完整听力讲解。`)
      }
      analysis.questions[id] = question
    }
  }
  const merged = mergeListeningSentenceAnalysis(analysis, aligned)
  for (const [id, material] of Object.entries(analysis.materials)) {
    if (!changedSegments.has(id) && !material.sentences) delete merged.materials[id].sentences
  }
  writeJson(file, merged)
}

function bindOccurrences(edits, review) {
  return edits.map(edit => {
    const group = review.groups.find(group => group.segmentId === edit.segmentId && group.decision === 'usable')
    const occurrence = group?.occurrences.find(({ startSeconds, endSeconds }) =>
      startSeconds <= edit.startSeconds && endSeconds >= edit.endSeconds)
    if (!occurrence) throw new Error(`${edit.segmentId} 的更正录音已超出重算段界，请核对段界`)
    const { startSeconds, endSeconds } = occurrence
    return { ...edit, occurrence: { startSeconds, endSeconds } }
  })
}

async function prepare({ paper, revision, edits, analysis, 'work-dir': workDir, 'sealed-dir': sealedDir }) {
  const work = path.resolve(workDir)
  const sealed = sealedDir ? path.resolve(sealedDir) : path.join(work, 'sealed')
  const bundle = path.join(work, 'bundle')
  mkdirSync(work, { mode: 0o700 })
  if (!sealedDir) {
    const latest = await reviewCandidate(paper)
    if (latest?.id !== revision) throw new Error(`最新 Candidate 为 ${latest?.id ?? '无'}，请重新核对更正`)
    await hydrateReviewRevision(latest, sealed)
  }
  const base = hydratedEvidenceBase(sealed)?.revision
  if (base?.id !== revision || base.paperId !== paper) throw new Error('封存基线与指定卷或 revision 不符')
  for (const file of base.manifest.files) {
    const bytes = readFileSync(path.join(sealed, file.path))
    if (bytes.length !== file.byteLength || sha256(bytes) !== file.sha256) throw new Error(`封存文件已变化：${file.path}`)
  }
  const before = buildNck1SealedReviewProjection(sealed, base, { requireAnalyses: true })
  if (!before.reviewedListening) throw new Error('封存基线缺少已审听力段界')
  cpSync(sealed, bundle, { recursive: true })
  const { listeningEdits } = readJson(edits)
  if (!Array.isArray(listeningEdits) || !listeningEdits.length) throw new Error('缺少 listeningEdits')
  const spellingPath = path.join(bundle, SPELLING_REVIEW_FILE)
  if (!existsSync(spellingPath)) throw new Error('封存基线缺少已完成的 spelling-review-v1.json')
  const spelling = readJson(spellingPath)
  const existing = new Set((spelling.listeningEdits ?? []).map(editKey))
  const newEdits = listeningEdits.filter(edit => !existing.has(editKey(edit)))
  if (!newEdits.length) throw new Error('这些更正已经存在于封存基线')
  verifyListeningEditOccurrences(Buffer.from(JSON.stringify({ listeningEdits: newEdits })), before.reviewedListening.review)
  spelling.listeningEdits = [...(spelling.listeningEdits ?? []), ...newEdits]
  writeJson(spellingPath, spelling)
  const loaded = loadNck1ReviewSource(bundle)
  const rebuild = source => {
    const { candidate, issues } = withLocalReviewEvidence(bundle, () => importCanonicalCandidate(
      source.sourceInput, undefined, { materializationAuthorityRef: before.consumption.authorityRef },
    ))
    if (!candidate || issues.length) throw new Error(issues[0]?.message ?? '无法重建 Candidate')
    return candidate
  }
  deepStrictEqual(transcriptText(loaded.materialization), transcriptText(before.materialization))
  let candidate = rebuild(loaded)
  const navigation = rebindNavigation(sealed, bundle, work, loaded, candidate)
  let { review } = navigation
  const reboundEdits = bindOccurrences(spelling.listeningEdits, review)
  if (digestJson(reboundEdits) !== digestJson(spelling.listeningEdits)) {
    writeJson(spellingPath, { ...spelling, listeningEdits: reboundEdits })
    const rebound = loadNck1ReviewSource(bundle)
    candidate = rebuild(rebound)
    review = rebindFastListening(bundle, review, listeningReviewSubject(rebound, candidate), rebound.materialization.listening.transcript)
    writeJson(path.join(bundle, LISTENING_REVIEW_FILE), review)
  }
  const binding = { sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest }
  for (const file of boundSidecars) {
    const target = path.join(bundle, file)
    if (!existsSync(target)) continue
    const sidecar = readJson(target)
    writeJson(target, { ...sidecar, ...binding, ...(file === SOURCE_REFERENCES_FILE
      ? { materializationDigest: digestJson(loaded.materialization) } : {}) })
  }
  const aligned = alignReviewedListeningSentences(loaded.materialization, review, file => readJson(path.join(bundle, file)))
  writeJson(path.join(work, 'alignment.json'), aligned)
  const changedSegments = new Set(newEdits.map(({ segmentId }) => segmentId))
  refreshAnalysis(bundle, loaded.materialization, aligned, changedSegments, analysis)
  if (existsSync(path.join(bundle, 'products'))) renameSync(path.join(bundle, 'products'), path.join(work, 'previous-products'))
  execFileSync(process.execPath, [fileURLToPath(new URL('./freeze-products.mjs', import.meta.url)),
    '--paper-dir', bundle, '--parallel'], { stdio: 'inherit' })
  const { manifest } = prepareReviewPush(bundle, { expectedBaseRevisionId: base.id })
  const local = { ...manifest, manifest, id: 'rev-local-transcript-repair', reviewKind: 'candidate',
    rendererBuildId: manifest.producerBuildId, evidenceBase: { revision: base, directory: sealed } }
  const finalized = finalizeProjection(bundle, local)
  deepStrictEqual(finalized.paperAsset.answerKey, before.paperAsset.answerKey)
  deepStrictEqual(finalized.paperAsset.content.questions, before.paperAsset.content.questions)
  if (finalized.ocrCorrectionReport) {
    validateAgentOcrCorrectionReceipt(finalized.ocrCorrectionReport,
      readJson(path.join(sealed, 'signals', 'agent-proofreading-receipt.json')),
      JSON.parse(Buffer.from(finalized.sourceInput.materializationBytes).toString('utf8')))
  }
  deepStrictEqual(finalizeInventory(bundle, local, finalized),
    manifest.files.map(file => `${file.path}\0${file.mediaType}\0${file.role}`).sort())
  const subject = finalizeContentSubject(bundle, local, finalized)
  if (!subject.ok) throw new Error(`本地 finalize 无法封存：${subject.reasonCode}`)
  writeJson(path.join(work, 'manifest.json'), manifest)
  console.log(JSON.stringify({ paperId: paper, expectedBaseRevisionId: base.id, ...binding, boundaryChanges: navigation.boundaryChanges,
    alignment: aligned.map(({ segment, degraded, reasons, sentences }) => ({ segment, degraded, reasons, sentences: sentences.length })),
    status: 'local_finalized' }, null, 2))
}

async function main() {
  const { values: options } = parseArgs({ options: {
    paper: { type: 'string' }, revision: { type: 'string' }, edits: { type: 'string' },
    analysis: { type: 'string' }, 'work-dir': { type: 'string' }, 'sealed-dir': { type: 'string' },
    'dry-run': { type: 'boolean' }, push: { type: 'boolean' },
  } })
  if (!options['work-dir'] || Boolean(options.push) === Boolean(options['dry-run'])) {
    throw new Error('用法：repair-listening-transcript.mjs --work-dir DIR (--dry-run --paper ID --revision REV --edits JSON [--analysis JSON] [--sealed-dir DIR] | --push)')
  }
  if (options.push) {
    const work = path.resolve(options['work-dir'])
    const manifest = readJson(path.join(work, 'manifest.json'))
    if ((await reviewCandidate(manifest.paperId))?.id !== manifest.expectedBaseRevisionId) {
      throw new Error('最新 Candidate 已变化，请从新基线重做')
    }
    const result = await uploadReviewBundle(path.join(work, 'bundle'), manifest, path.join(work, 'upload-timeline.jsonl'))
    console.log(JSON.stringify({ revisionId: result.revision.id }))
  } else {
    if (!options.paper || !options.revision || !options.edits) throw new Error('dry-run 需要 --paper、--revision 和 --edits')
    await prepare(options)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
