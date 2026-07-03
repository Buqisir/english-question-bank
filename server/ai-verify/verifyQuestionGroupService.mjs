// verify-question-group service — AI verification of a question group's answers/analysis.
// Extracted VERBATIM (indent 0, no re-indent) from server/api.mjs (cut H5-E,
// refactor-roadmap-2026-06) so the prompt template literals stay byte-identical — the prompt
// text is the frozen AI contract and whitespace there is NOT inert. Deps are module-scoped
// bindings the factory populates; appendVerifyAudit is injected (stays in api.mjs; the
// /api/ai/verify-trace route reads its JSONL). Module never imports api.mjs (no cycle).

import { randomUUID } from 'node:crypto'
import { AI_DAILY_LIMIT_EXCEEDED_CODE } from '../ai-providers/dailyLimitCounter.mjs'
import { safeTruncate } from '../ai-providers/jsonExtraction.mjs'

let getQuestionGroupDetail
let appendVerifyAudit
let callDeepSeekWithFallback
let normalizeDeepSeekModel
let describeKeySource
let maskApiKey
let elapsedMs
let groupTypeLabels
let DEEPSEEK_API_KEY

export function createVerifyImplementation(deps) {
  ;({
    getQuestionGroupDetail,
    appendVerifyAudit,
    callDeepSeekWithFallback,
    normalizeDeepSeekModel,
    describeKeySource,
    maskApiKey,
    elapsedMs,
    groupTypeLabels,
    DEEPSEEK_API_KEY,
  } = deps)
  return { verifyQuestionGroup }
}

async function verifyQuestionGroup(questionGroupId, apiKey, model, verifyRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedVerifyRequestId = verifyRequestId || randomUUID()
  const verifyStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  console.log(
    `AI verify trace=${resolvedVerifyRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )
  appendVerifyAudit({
    type: 'group_start',
    traceId: resolvedVerifyRequestId,
    questionGroupId,
    groupType: detail.groupType,
        model: selectedModel,
        thinkingMode,
        keySource: keySource.source,
        keyMask: maskApiKey(key),
        questionCount: detail.questions.length,
  })

  let calledCount = 0
  const questionCount = detail.questions.length

  const results = []
  for (const question of detail.questions) {
    if (!question.answer) {
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: '无答案，跳过验证。',
        apiCall: false,
      })
      continue
    }

    calledCount += 1
    const startedAt = Date.now()
    try {
      const result = await callDeepSeekVerify({
        apiKey: key,
        model: selectedModel,
        thinkingMode,
        questionGroupId,
        groupType: detail.groupType,
        questionId: question.id,
        passageTitle: detail.passage.title,
        passageText: detail.passage.materialText?.slice(0, 2000) || '',
        questionNo: question.questionNo,
        stem: question.stem,
        options: question.options.map((o) => `${o.label}. ${o.content}`).join('\n'),
        answer: question.answer,
        explanation: question.explanation || '',
        traceId: resolvedVerifyRequestId,
      })
      results.push({
        ...result,
        apiCall: true,
        apiLatencyMs: elapsedMs(startedAt),
      })
    } catch (error) {
      // cut m0-5-ai-daily-limit (C3/C6): the daily-limit error must reach the route's
      // 429 translation instead of being folded into a per-question "uncertain"
      // verdict — otherwise an exhausted quota returns HTTP 200 with an all-uncertain
      // result that looks like a completed verification. Once the quota trips, every
      // remaining question would fail the same way, so aborting the whole group loses
      // nothing; the teacher re-runs with their own key.
      if (error?.code === AI_DAILY_LIMIT_EXCEEDED_CODE) {
        throw error
      }
      const reason = error instanceof Error ? `AI 调用失败：${error.message}` : 'AI 调用失败。'
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'uncertain',
        reason,
        apiCall: true,
        apiLatencyMs: elapsedMs(startedAt),
      })
    }
  }

  appendVerifyAudit({
    type: 'group_end',
    traceId: resolvedVerifyRequestId,
    questionGroupId,
    questionCount: detail.questions.length,
    calledCount,
    verifiedCount: results.filter((r) => r.verdict !== 'skipped').length,
  })

  return {
    questionGroupId,
    title: detail.title,
    questionCount,
    verifiedCount: results.filter((r) => r.verdict !== 'skipped').length,
    calledCount,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedVerifyRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(verifyStartedAt),
    allApiCalled: calledCount === detail.questions.length,
    results,
  }
}

async function callDeepSeekVerify(context) {
  const optionsText = context.options ? `\n选项:\n${context.options}` : ''
  const stem = context.groupType === 'cloze'
    ? `第 ${context.questionNo} 空`
    : context.stem

  const messages = [
    {
      role: 'system',
      content: `你是一位高考英语阅卷老师。请只验证以下试题的当前答案是否正确，不评价解析文本。

题型：${groupTypeLabels[context.groupType]}
篇章：${context.passageTitle}

${context.passageText ? `篇章内容（节选）:\n${context.passageText}` : ''}

返回 JSON 格式：
{"verdict": "correct"|"answer_wrong"|"uncertain", "correctAnswer": "正确的答案（如答案错误）", "reason": "简短理由（中文，50字内）"}`,
    },
    {
      role: 'user',
      content: `请验证：

试题：${stem}${optionsText}
当前答案：${context.answer}`,
    },
  ]

  const requestStartAt = Date.now()
  try {
    console.log(
      `AI verify trace=${context.traceId} q=${context.questionNo} model=${context.model} groupType=${context.groupType} passage=${context.passageTitle}`,
    )

    const verifyParsed = await callDeepSeekWithFallback(
      {
        apiKey: context.apiKey,
        model: context.model,
        expectedResponseSchema: 'verify',
        messages,
        temperature: 0.1,
        maxTokens: context.thinkingMode ? 1600 : 600,
        thinkingMode: context.thinkingMode,
        onHttpResponse: ({ rawStatusText, status, ok, latencyMs }) => {
          appendVerifyAudit({
            type: 'question_call_http',
            traceId: context.traceId,
            questionGroupId: context.questionGroupId || '',
            questionId: context.questionId || '',
            questionNo: context.questionNo,
            model: context.model,
            status,
            ok,
            latencyMs,
            passageTitle: context.passageTitle,
            contentPreview: safeTruncate(rawStatusText, 120),
          })
        },
      },
      (error, options) => {
        appendVerifyAudit({
          type: 'question_call_parse_error',
          traceId: context.traceId,
          questionGroupId: context.questionGroupId || '',
          questionId: context.questionId || '',
          questionNo: context.questionNo,
          model: options?.model || context.model,
          thinkingMode: options?.thinkingMode ? 'on' : 'off',
          expectedResponseSchema: options?.expectedResponseSchema,
          rawPreview: safeTruncate(options?.rawPreview || error.message, 200),
        })
      },
    )

    const parsed = verifyParsed.parsed
    console.log(`AI verify: Q${context.questionNo} verdict from DeepSeek`)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('DeepSeek 返回结果不符合预期 JSON。')
    }

    if (!parsed.verdict) {
      appendVerifyAudit({
        type: 'question_call_parse_error',
        traceId: context.traceId,
        questionGroupId: context.questionGroupId || '',
        questionId: context.questionId || '',
        questionNo: context.questionNo,
        model: context.model,
        thinkingMode: context.thinkingMode ? 'on' : 'off',
        rawPreview: safeTruncate(String(parsed ? JSON.stringify(parsed) : ''), 200),
      })
    } else {
      appendVerifyAudit({
        type: 'question_call_success',
        traceId: context.traceId,
        questionGroupId: context.questionGroupId || '',
        questionId: context.questionId || '',
        questionNo: context.questionNo,
        verdict: parsed.verdict || 'uncertain',
        reason: parsed.reason || '',
        correctAnswer: parsed.correctAnswer || '',
      })
    }

    return {
      questionId: context.questionId || '',
      questionNo: context.questionNo,
      verdict: parsed.verdict || 'uncertain',
      reason: parsed.reason || '无法解析 AI 返回。',
      correctAnswer: parsed.correctAnswer || '',
    }
  } catch (error) {
    appendVerifyAudit({
      type: 'question_call_error',
      traceId: context.traceId,
      questionGroupId: context.questionGroupId || '',
      questionId: context.questionId || '',
      questionNo: context.questionNo,
      model: context.model,
      errorMessage: error instanceof Error ? error.message : String(error),
      latencyMs: elapsedMs(requestStartAt),
    })
    throw error
  }
}
