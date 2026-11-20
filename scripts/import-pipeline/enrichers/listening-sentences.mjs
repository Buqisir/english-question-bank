import {
  LISTENING_STAGED_ANALYSIS_FILE_NAME as output, mergeListeningSentenceAnalysis, validateListeningAnalysis,
} from '../../../server/paper-import-ai/analyzeListening.mjs'
import { ANSWER_CORRECTIONS_FILE, projectEffectiveAnswers, validateAnswerCorrections } from '../../../server/paper-import/answerCorrections.mjs'
import { LISTENING_REVIEW_FILE } from '../../../server/paper-import/listeningReview.mjs'
import { alignReviewedListeningSentences } from '../listening-sentence-align.mjs'

const engine = /apple|whisper/iu
const skip = reason => ({ state: 'skip', reason })

async function plan(ctx) {
  const has = path => ctx.files.some(file => file.path === path)
  // The current Candidate format admits listening analysis alongside the other staged analyses.
  if (!has(output)) return skip('无封存听力讲解')
  if (!has(LISTENING_REVIEW_FILE)) return skip('无封存听力段界')
  const materialization = ctx.files.find(file => file.role === 'materialization')
  if (!materialization) return skip('无封存听力原文')
  const analysis = await ctx.readBase(output)
  const source = await ctx.readBase(materialization.path)
  const corrections = has(ANSWER_CORRECTIONS_FILE)
    ? validateAnswerCorrections(await ctx.readBase(ANSWER_CORRECTIONS_FILE), source, materialization.sha256)
    : null
  const document = projectEffectiveAnswers(source, corrections)
  const transcript = document.listening?.transcript ?? []
  if (!transcript.length) return skip('无封存听力原文')
  const pending = new Set(transcript.filter(({ segmentId }) =>
    analysis.materials?.[segmentId] && !analysis.materials[segmentId].sentences?.length).map(({ segmentId }) => segmentId))
  if (!pending.size) return skip('已有逐句数据或无可追补的讲解段')
  const review = await ctx.readBase(LISTENING_REVIEW_FILE)
  const windows = new Map()
  for (const file of review.evidence ?? []) {
    if (file.kind === 'asr_window' && engine.test(file.settings?.engine) && has(file.path)) {
      windows.set(file.path, await ctx.readBase(file.path))
    }
  }
  const segments = alignReviewedListeningSentences(
    document,
    { ...review, evidence: (review.evidence ?? []).filter(file => windows.has(file.path)) },
    file => windows.get(file),
  ).filter(segment => pending.has(segment.segment))
  const aligned = segments.filter(segment => !segment.degraded && segment.sentences.length)
  const missing = segments.filter(segment => segment.reasons.includes('word-level ASR unavailable')).length
  const degraded = segments.length - aligned.length - missing
  const skipped = `缺词级 ASR ${missing} 段，其他未对齐 ${degraded} 段`
  if (!aligned.length) return skip(`无可对齐段；${skipped}`)
  const count = aligned.reduce((sum, segment) => sum + segment.sentences.length, 0)
  return { state: 'ok', reason: `${aligned.length} 段 ${count} 句；${skipped}`, analysis, document, aligned }
}

function run(_ctx, plan) {
  const sentences = plan.aligned.flatMap(segment => segment.sentences.map(({ id, en }) => ({ id, en })))
  return { ...plan, sentences }
}

function agentRequest({ paperId, baseRev }, { sentences }) {
  return { paperId, baseRev, sentences }
}

function mergeAgentResponse(ctx, result, request, response) {
  if (response?.paperId !== request.paperId || response?.baseRev !== request.baseRev
    || !Array.isArray(response.sentences) || response.sentences.length !== request.sentences.length) {
    throw new Error('Agent 回复的卷、基线或句数不匹配')
  }
  const expected = new Map(request.sentences.map(sentence => [sentence.id, sentence.en]))
  const translations = new Map()
  for (const { id, en, zh } of response.sentences) {
    if (!expected.has(id) || expected.get(id) !== en || translations.has(id)
      || typeof zh !== 'string' || !zh.trim()) throw new Error(`Agent 句子 ID、en 或 zh 不匹配：${id}`)
    translations.set(id, zh)
  }
  const { analysis, aligned, document } = result
  const materials = Object.fromEntries(aligned.map(({ segment, sentences }) => [segment, {
    sentences: sentences.map(({ id }) => ({ id, zh: translations.get(id) })),
  }]))
  const merged = mergeListeningSentenceAnalysis(analysis, aligned, { materials })
  for (const [id, material] of Object.entries(analysis.materials)) {
    if (!Object.hasOwn(materials, id)) merged.materials[id] = material
  }
  validateListeningAnalysis(merged, { materialization: document, sourceAssetVersion: analysis.sourceAssetVersion })
  ctx.writeJson(output, merged)
}

export default { name: 'listening-sentences', allowedOutputs: [output], needsAnalysis: true,
  plan, run, agentRequest, mergeAgentResponse }
