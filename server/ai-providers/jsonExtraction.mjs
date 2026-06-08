// AI-completion JSON / verify-verdict extraction leaf.
// Extracted verbatim from server/api.mjs (cut H5-C, refactor-roadmap-2026-06).
// Zero dependencies, no injected state: raw provider text/payload -> parsed JSON +
// normalized verify verdict. The 3 normalizeVerifyVerdict variants are intentionally
// divergent and must NOT be unified (different accepted-token vocabularies).

export function parseJsonFromString(rawText) {
  try {
    return JSON.parse(rawText)
  } catch {
    return null
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractBalancedJsonCandidates(rawText, maxCandidates = 8) {
  if (typeof rawText !== 'string') return []

  const text = rawText.trim()
  if (!text) return []

  const candidates = []
  let depth = 0
  let inString = false
  let escape = false
  let start = -1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, index + 1).trim()
        if (candidate) {
          candidates.push(candidate)
          if (candidates.length >= maxCandidates) {
            break
          }
        }
        start = -1
      }
    }
  }

  return candidates
}

function parseJsonObject(text) {
  const parsed = parseJsonFromString(String(text || '').trim())
  if (isPlainObject(parsed)) {
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const message = parsed.choices[0].message || parsed.choices[0]
      const messageText = getDeepSeekMessageText(message)
      const messageParsed = parseJsonObject(messageText)
      if (messageParsed) {
        return messageParsed
      }
      return null
    }

    return parsed
  }

  const balancedCandidates = extractBalancedJsonCandidates(text)
  for (const candidate of balancedCandidates) {
    const balancedParsed = parseJsonFromString(candidate)
    if (isPlainObject(balancedParsed)) {
      return balancedParsed
    }
  }

  return null
}

function normalizeVerifyVerdict(value) {
  if (!value) return ''
  const normalized = String(value)
    .toLowerCase()
    .replace(/[\s]/g, '')
    .replace(/[:：，。,;；!！?？]/g, '')

  const isCorrect = ['correct', '答案正确', '正确', '正确答案', '答案无误', '无误', '对'].includes(normalized)
  const isAnswerWrong = [
    'answer_wrong',
    'answerwrong',
    '答案错误',
    'answererror',
    '答案有误',
    '答案不对',
    '答案不正确',
  ].includes(normalized)
  const isExplanationWrong = [
    'explanation_wrong',
    'explanationwrong',
    '解析有误',
    '解析错误',
    '解析不当',
    '解析有问题',
  ].includes(normalized)
  const isBothWrong = [
    'both_wrong',
    'bothwrong',
    '答案和解析均错',
    '答案与解析均错',
    '答案和解析都错',
    '两项均错',
    '答案及解析错误',
  ].includes(normalized)
  const isUncertain = ['uncertain', 'unknown', '未知', '不确定', '待定', '待确认'].includes(normalized)

  if (isBothWrong) return 'both_wrong'
  if (isCorrect) return 'correct'
  if (isAnswerWrong) return 'answer_wrong'
  if (isExplanationWrong) return 'explanation_wrong'
  if (isUncertain) return 'uncertain'

  return ''
}

function inferVerifyVerdictFromText(rawText) {
  const text = String(rawText || '').toLowerCase()
  if (!text.trim()) return ''

  const normalized = text.replace(/[\s:：，。,;；!！?？]/g, '')

  if ((normalized.includes('bothwrong') || normalized.includes('答案和解析均错') || normalized.includes('答案与解析均错') || normalized.includes('答案和解析都错') || normalized.includes('两项均错')))
    return 'both_wrong'
  if (normalized.includes('答案正确') || normalized.includes('正确答案') || normalized === 'correct' || normalized.includes('答案无误') || normalized === '正确')
    return 'correct'
  if (normalized.includes('answerwrong') || normalized.includes('答案错误') || normalized.includes('答案有误') || normalized.includes('答案不对') || normalized.includes('答案不正确'))
    return 'answer_wrong'
  if (normalized.includes('explanationwrong') || normalized.includes('解析有误') || normalized.includes('解析错误') || normalized.includes('解析不当') || normalized.includes('解析不对'))
    return 'explanation_wrong'
  if (normalized.includes('uncertain') || normalized.includes('未知') || normalized.includes('待定') || normalized.includes('不确定') || normalized.includes('待确认'))
    return 'uncertain'

  return ''
}

export function getDeepSeekMessageText(message) {
  if (!message || typeof message !== 'object') return ''
  const normalizeText = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .join('\n')
    }
    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') return String(value.text)
      if (typeof value.content === 'string') {
        return String(value.content)
      }
      if (Array.isArray(value.content)) {
        return value
          .content
          .map((entry) => normalizeText(entry))
          .filter(Boolean)
          .join('\n')
      }
      if (typeof value.value === 'string') {
        return String(value.value)
      }
      if (typeof value.data === 'string') {
        return String(value.data)
      }
      if (typeof value.text === 'string') {
        return String(value.text)
      }
      if (Array.isArray(value.parts)) {
        return normalizeText(value.parts)
      }
    }

    return ''
  }

  const contentText = normalizeText(message.content)
  if (contentText.trim()) return contentText

  const reasoningText = normalizeText(message.reasoning_content)
  if (reasoningText.trim()) return reasoningText

  const reasoningFallbackText = normalizeText(message.reasoning)
  if (reasoningFallbackText.trim()) return reasoningFallbackText

  const choiceMessage = message?.choices?.[0]?.message
  const choiceMessageText = getDeepSeekMessageText(choiceMessage)
  if (choiceMessageText.trim()) {
    return choiceMessageText
  }

  if (Array.isArray(message.choices)) {
    for (const choice of message.choices) {
      const choiceText = getDeepSeekMessageText(choice?.message || choice)
      if (choiceText.trim()) {
        return choiceText
      }
    }
  }

  return ''
}

export function collectDeepSeekMessageTexts(message) {
  const texts = []
  const seen = new Set()
  const seenObjects = new Set()

  const normalizeTextValue = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeTextValue(entry))
        .filter(Boolean)
        .join('\n')
    }

    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') return String(value.text)
      if (typeof value.content === 'string') return String(value.content)
      if (Array.isArray(value.content)) {
        return value
          .content
          .map((entry) => normalizeTextValue(entry))
          .filter(Boolean)
          .join('\n')
      }
      if (typeof value.value === 'string') return String(value.value)
      if (typeof value.data === 'string') return String(value.data)
      if (Array.isArray(value.parts)) {
        return normalizeTextValue(value.parts)
      }
    }

    return ''
  }

  const addText = (value) => {
    const normalized = normalizeTextValue(value).trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    texts.push(normalized)
  }

  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object') return
    if (depth > 6) return
    if (seenObjects.has(node)) return
    seenObjects.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1)
      }
      return
    }

    addText(node.content)
    addText(node.reasoning_content)
    addText(node.reasoning)
    addText(node.output)
    addText(node.text)

    Object.values(node).forEach((value) => {
      if (typeof value === 'string') {
        addText(value)
        return
      }
      visit(value, depth + 1)
    })
  }

  visit(message)

  return texts
}

export function parseLooseVerifyResult(rawText) {
  if (!rawText) return null

  const direct = isPlainObject(rawText) ? normalizeVerifyResultObject(rawText) : null
  if (direct && direct.verdict) return direct

  const text = String(rawText)
  if (!text.trim()) return null

  const matchWithValue = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    return ''
  }

  const verdictRaw = matchWithValue([
    /(?:^|[\n\s])(?:verdict|判定)\s*[:：]?\s*(correct|answer_wrong|explanation_wrong|both_wrong|uncertain|correct answer|答案正确|答案错误|答案有误|解析有误|答案和解析均错|答案与解析均错|答案和解析都错|两项均错|解析错误)\b/i,
    /(?:^|[\n\s])(?:结论|最终结论|结果)\s*[:：]?\s*(correct|answer_wrong|explanation_wrong|both_wrong|uncertain|正确|正确答案|答案错误|答案有误|解析有误|答案和解析均错|答案与解析均错|答案和解析都错|两项均错|解析错误|均错误|不确定)\b/i,
  ])
  const normalizeVerifyVerdict = (value) => {
    if (!value) return ''
    const normalized = String(value)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[:：，。,;；!！?？]/g, '')
    if (['correct', 'correctanswer', '答案正确', 'correctanswer', '正确'].includes(normalized)) return 'correct'
    if (['answer_wrong', 'answerwrong', '答案错误', 'answererror', '答案有误', 'answeriswrong'].includes(normalized)) return 'answer_wrong'
    if (['explanation_wrong', 'explanationwrong', '解析有误', '解析错误', '解析不对', 'explicationwrong'].includes(normalized))
      return 'explanation_wrong'
    if (
      [
        'both_wrong',
        'bothwrong',
        '答案和解析均错',
        '答案与解析均错',
        '答案和解析都错',
        '两项均错',
        '解析与答案均错',
      ].includes(normalized)
    )
      return 'both_wrong'
    if (['uncertain', '未知', '待定', '不确定'].includes(normalized)) return 'uncertain'
    return ''
  }

  let verdict = normalizeVerifyVerdict(verdictRaw)
  if (!verdict) verdict = inferVerifyVerdictFromText(text)
  if (!verdict) {
    const candidatePayload = extractFirstJson(text)
    if (candidatePayload) {
      const candidate = normalizeVerifyResultObject(candidatePayload) || extractVerifyResultFromPayload(candidatePayload)
      if (candidate) return candidate
    }
    const nested = extractVerifyResultFromPayload(getDeepSeekMessageText(rawText))
    if (nested) return nested
  }

  const correctAnswer = matchWithValue([/(?:^|[\n\s])(?:correctanswer|correct answer|正确答案)\s*[:：]\s*([A-Z]{1,2}|[A-Z]{0,2}[0-9]+|[\w\u4e00-\u9fff-]+)/i])
  const reason = matchWithValue([
    /(?:^|[\n\s])(?:reason|reasoning|解析|理由|说明)\s*[:：]?\s*([\s\S]{1,220}?)(?:\n|$)/i,
    /(?:模型返回|根据解析|主要是)\s*([\s\S]{1,220}?)(?:\n|$)/i,
  ])

  if (!verdict) return null

  return {
    verdict,
    reason: reason || '模型返回了非标准 JSON，已按兜底规则解析。',
    correctAnswer: correctAnswer || '',
  }
}

function extractJsonCandidates(rawText) {
  if (rawText === null || rawText === undefined) return []
  if (typeof rawText === 'string') {
    const trimmed = rawText.trim()
    if (!trimmed) return []

    const candidates = [trimmed]
    const codeMatch = trimmed.match(/```json\s*([\s\S]*?)```/i)
    if (codeMatch && codeMatch[1]) {
      candidates.push(codeMatch[1].trim())
    }
    for (const candidate of extractBalancedJsonCandidates(trimmed, 6)) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }

    return candidates
  }

  if (typeof rawText !== 'object') return []

  const candidates = []
  const seen = new Set()
  const addCandidate = (value) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
  }

  collectDeepSeekMessageTexts(rawText).forEach(addCandidate)

  return candidates
}

export function extractVerifyResultFromPayload(payload, options = { seen: new Set(), depth: 0 }) {
  if (!payload) return null
  if (options.depth > 8) return null

  if (typeof payload === 'string') {
    const jsonPayload = extractFirstJson(payload)
    if (jsonPayload) {
      const extracted = normalizeVerifyResultObject(jsonPayload) || extractVerifyResultFromPayload(jsonPayload, options)
      if (extracted) return extracted
    }
    return parseLooseVerifyResult(payload)
  }

  if (typeof payload !== 'object') return null

  if (options.seen.has(payload)) return null
  options.seen.add(payload)

  const direct = normalizeVerifyResultObject(payload)
  if (direct) return direct

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractVerifyResultFromPayload(entry, {
        seen: options.seen,
        depth: options.depth + 1,
      })
      if (nested) return nested
    }

    return null
  }

  for (const value of Object.values(payload)) {
    const nested = extractVerifyResultFromPayload(value, {
      seen: options.seen,
      depth: options.depth + 1,
    })
    if (nested) return nested
  }

  return null
}

export function extractReadingParsePayloadFromPayload(payload, options = { seen: new Set(), depth: 0 }) {
  if (!payload) return null
  if (options.depth > 8) return null

  if (typeof payload === 'string') {
    const jsonPayload = extractFirstJson(payload)
    if (jsonPayload) {
      return extractReadingParsePayloadFromPayload(jsonPayload, options)
    }
    return null
  }

  if (typeof payload !== 'object') return null
  if (options.seen.has(payload)) return null
  options.seen.add(payload)

  if (isPlainObject(payload) && Array.isArray(payload.questions)) {
    return payload
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractReadingParsePayloadFromPayload(entry, {
        seen: options.seen,
        depth: options.depth + 1,
      })
      if (nested) return nested
    }
    return null
  }

  for (const value of Object.values(payload)) {
    const nested = extractReadingParsePayloadFromPayload(value, {
      seen: options.seen,
      depth: options.depth + 1,
    })
    if (nested) return nested
  }

  return null
}

function normalizeVerifyResultObject(value) {
  if (!isPlainObject(value)) return null

  const verdictRaw = value.verdict || value.result || value.label || value.conclusion || value.结论
  const reasonRaw = value.reason || value.explanation || value.analysis || value.note || value.reasoning
  const correctAnswerRaw = value.correctAnswer || value.correct_answer || value.correctanswer || value.answer || value.答案

  const normalizeVerifyVerdict = (value) => {
    if (!value) return ''
    const normalized = String(value)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[:：]/g, '')

    if (['correct', '正确', '对', '答案正确'].includes(normalized)) return 'correct'
    if (['answer_wrong', 'answerwrong', '答案错误', 'answererror', '答案有误'].includes(normalized)) return 'answer_wrong'
    if (['explanation_wrong', 'explanationwrong', '解析有误', '解析错误'].includes(normalized)) return 'explanation_wrong'
    if (['both_wrong', 'bothwrong', '答案和解析均错', '两项均错', '答案与解析均错', '答案和解析都错'].includes(normalized)) return 'both_wrong'
    if (['uncertain', 'unknown', '未知', '不确定', '待定'].includes(normalized)) return 'uncertain'
    return ''
  }

  const verdict = normalizeVerifyVerdict(verdictRaw)
  if (!verdict) return null

  const correctAnswer = String(correctAnswerRaw || '')
  const reason = String(reasonRaw || '')

  return {
    verdict,
    reason: reason || '模型返回了非标准 JSON，已按兜底规则解析。',
    correctAnswer: correctAnswer ? correctAnswer.trim() : '',
  }
}

export function extractFirstJson(rawText) {
  const candidates = extractJsonCandidates(rawText)

  for (const candidate of candidates) {
    const parsedPayload = parseJsonObject(candidate)
    if (parsedPayload && typeof parsedPayload === 'object') {
      return parsedPayload
    }
  }

  const message = rawText && typeof rawText === 'object' ? getDeepSeekMessageText(rawText?.choices?.[0]?.message || rawText) : ''
  if (typeof message === 'string') {
    const messagePayload = parseJsonObject(message)
    if (messagePayload && typeof messagePayload === 'object') {
      return messagePayload
    }
  }

  return null
}

export function safeTruncate(rawText, maxLength = 320) {
  if (typeof rawText !== 'string') return ''
  const text = rawText.trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}
