export const ANSWER_CORRECTIONS_FILE = 'answer-corrections.json'

function reject(message) {
  throw Object.assign(new Error(`答案更正：${message}`), { code: 'ANSWER_CORRECTION_INVALID', status: 422 })
}

function hasKeys(value, keys) {
  return value && typeof value === 'object' && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key))
}

export function validateAnswerCorrections(declaration, materialization, sourceDigest) {
  if (!hasKeys(declaration, ['paperId', 'sourceDigest', 'corrections'])
    || declaration.paperId !== materialization.paperId
    || declaration.sourceDigest !== sourceDigest
    || !Array.isArray(declaration.corrections) || !declaration.corrections.length) {
    reject('声明必须绑定本卷的精确源版本，并列出更正')
  }

  const listening = materialization.listening
  const answers = new Map(materialization.answers.map(answer => [answer.questionId, answer]))
  const options = new Map(materialization.groups.flatMap(group => group.questions.map(question =>
    [question.questionId, question.options?.length ? question.options : group.optionBank])))
  for (const answer of listening.answers || []) {
    if (answer.provenance !== 'unofficial') answers.set(`question:listening:${answer.canonicalNumber}`, answer)
  }
  for (const question of listening.questions || []) {
    options.set(`question:listening:${question.canonicalNumber}`, question.options)
  }

  const seen = new Set()
  for (const entry of declaration.corrections) {
    if (!hasKeys(entry, ['questionId', 'officialAnswer', 'correctedAnswer', 'reason'])
      || ![entry.questionId, entry.officialAnswer, entry.correctedAnswer, entry.reason]
        .every(value => typeof value === 'string' && value.trim())) reject('声明条目缺少题目、答案或依据')
    const { questionId, officialAnswer, correctedAnswer } = entry
    if (seen.has(questionId)) reject(`${questionId} 重复声明`)
    if (answers.get(questionId)?.value !== officialAnswer) reject(`${questionId} 原答案与封存抄录不符`)
    if (!options.get(questionId)?.some(option => option.label === correctedAnswer)) {
      reject(`${questionId} 更正答案不属于本题选项`)
    }
    seen.add(questionId)
  }
  return declaration
}

export function answerCorrectionsByQuestion(declaration) {
  return new Map((declaration?.corrections || []).map(entry => [entry.questionId, entry]))
}

export function effectiveAnswer(corrections, questionId, officialAnswer) {
  return corrections.get(questionId)?.correctedAnswer ?? officialAnswer
}

export function officialAnswerEntries(entries) {
  return Object.fromEntries(Object.entries(entries).map(([id, { officialAnswer, ...entry }]) =>
    [id, { ...entry, answer: officialAnswer ?? entry.answer }]))
}

export function answerCorrectionPublication(declarationJson, approval) {
  if (!declarationJson) return null
  const { approvalId, revisionId, bundleDigest, approvedBy, approvedAt } = approval || {}
  if (![approvalId, revisionId, bundleDigest, approvedBy, approvedAt].every(Boolean)) {
    reject('缺少精确版本的服务端审批回执')
  }
  return { declaration: JSON.parse(declarationJson), approvalId, revisionId, bundleDigest, approvedBy, approvedAt }
}

export function projectEffectiveAnswers(materialization, declaration) {
  if (!declaration) return materialization
  const corrections = answerCorrectionsByQuestion(declaration)
  return {
    ...materialization,
    answers: materialization.answers.map(answer => ({
      ...answer, value: effectiveAnswer(corrections, answer.questionId, answer.value),
    })),
    listening: {
      ...materialization.listening,
      ...(materialization.listening.answers ? { answers: materialization.listening.answers.map(answer => ({
        ...answer, value: effectiveAnswer(corrections, `question:listening:${answer.canonicalNumber}`, answer.value),
      })) } : {}),
    },
  }
}

export function answerCorrectionChanges(current, previous, currentAnswers = {}) {
  const next = answerCorrectionsByQuestion(current)
  const old = answerCorrectionsByQuestion(previous)
  return [...new Set([...next.keys(), ...old.keys()])].flatMap(questionId => {
    const before = old.get(questionId)
    const after = next.get(questionId)
    const entry = after || before
    return [{
      questionId,
      label: questionId.startsWith('question:listening:') ? `听力 ${questionId.split(':').at(-1)}` : questionId,
      from: after ? entry.officialAnswer : before.correctedAnswer,
      to: after?.correctedAnswer ?? currentAnswers[questionId]?.answer ?? '无答案',
      reason: entry.reason,
      withdrawn: !after,
    }]
  })
}
