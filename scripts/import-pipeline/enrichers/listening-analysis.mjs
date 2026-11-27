import {
  buildListeningAnalysisAgentRequest, LISTENING_STAGED_ANALYSIS_FILE_NAME as output,
} from '../../../server/paper-import-ai/analyzeListening.mjs'
import { loadNck1ReviewSource } from '../../../server/import-review/revisionProjection.mjs'
import { projectEffectiveAnswers } from '../../../server/paper-import/answerCorrections.mjs'
import { LISTENING_REVIEW_FILE } from '../../../server/paper-import/listeningReview.mjs'
import { digestJson } from '../../../shared/paper-canonical/stable.mjs'
import { assertListeningSentenceTranslations, mergeReviewedListeningAnalysis } from '../lib-listening-analysis.mjs'
import { alignReviewedListeningSentences } from '../listening-sentence-align.mjs'

const skip = reason => ({ state: 'skip', reason })

async function plan(ctx) {
  if (ctx.files.some(file => file.path === output)) return skip('已有听力讲解，交给 listening-sentences')
  const source = ctx.files.find(file => file.role === 'materialization')
  if (!source) return skip('无封存听力原文')
  const document = await ctx.readBase(source.path)
  const listening = document.listening
  if (listening?.state !== 'captured' || !listening.transcript?.length
    || listening.transcript.some(segment => !segment.text?.trim())) return skip('无封存听力原文')
  if (!listening.questions?.length || !listening.answers?.length) return skip('无封存听力题或官方答案')
  return { state: 'ok', reason: `${listening.transcript.length} 段，${listening.questions.length} 题` }
}

async function run(ctx, { reason }) {
  const { materialization, answerCorrections } = loadNck1ReviewSource(ctx.bundle)
  const document = projectEffectiveAnswers(materialization, answerCorrections)
  const review = ctx.files.some(file => file.path === LISTENING_REVIEW_FILE)
    ? await ctx.readBase(LISTENING_REVIEW_FILE) : null
  const windows = new Map()
  for (const file of review?.evidence ?? []) {
    if (file.kind === 'asr_window' && /apple|whisper/iu.test(file.settings?.engine)
      && ctx.files.some(item => item.path === file.path)) windows.set(file.path, await ctx.readBase(file.path))
  }
  const segments = review ? alignReviewedListeningSentences(
    document, { ...review, evidence: review.evidence?.filter(file => windows.has(file.path)) },
    file => windows.get(file),
  ) : []
  const aligned = segments.filter(segment => !segment.degraded && segment.sentences.length)
  const sentenceTargets = Object.fromEntries(aligned.map(({ segment, sentences }) =>
    [segment, sentences.map(({ id, en }) => ({ id, en }))]))
  const sentenceCount = aligned.reduce((sum, segment) => sum + segment.sentences.length, 0)
  return {
    document, aligned, sentenceTargets, inputDigest: digestJson({
      transcript: document.listening.transcript, boundaries: review?.groups ?? [],
      questions: document.listening.questions, answers: document.listening.answers, sentenceTargets,
    }),
    reason: review
      ? `${reason}；${aligned.length} 段 ${sentenceCount} 句，${segments.length - aligned.length} 段无句时`
      : `${reason}；无封存听力段界，生成段级讲解`,
  }
}

function agentRequest({ paperId, baseRev }, { document, sentenceTargets, inputDigest }) {
  return { paperId, baseRev, inputDigest,
    responseInstructions: 'Copy paperId, baseRev and inputDigest from this request. Put the JSON described by outputContract in the analysis field of agent-response.json.',
    ...buildListeningAnalysisAgentRequest({ materialization: document, sentenceTargets }) }
}

function mergeAgentResponse(ctx, { document, aligned, sentenceTargets }, request, response) {
  if (response?.paperId !== request.paperId || response.baseRev !== request.baseRev
    || response.inputDigest !== request.inputDigest) throw new Error('Agent 回复的卷、基线或输入摘要不匹配')
  const authored = response.analysis
  assertListeningSentenceTranslations(authored, sentenceTargets)
  const merged = mergeReviewedListeningAnalysis(document, aligned, { authored, requireHeardDistractors: true })
  ctx.writeJson(output, merged)
}

export default { name: 'listening-analysis', allowedOutputs: [output], plan, run, agentRequest, mergeAgentResponse }
