import {
  ALLOWED_REGION,
  MODEL_ID,
  PROVIDER_ID,
} from '../../shared/paper-selection/constants.mjs'

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

export function truthyEnv(value) {
  return value === '1' || value === 'true' || value === 'yes'
}

export function readPaperTranslationConfig(env = process.env) {
  const enabled = truthyEnv(env.QUESTION_BANK_PAPER_TRANSLATION_ENABLED)
  const apiKey = typeof env.DASHSCOPE_API_KEY === 'string' ? env.DASHSCOPE_API_KEY.trim() : ''
  const region = (env.QWEN_MT_REGION || ALLOWED_REGION).trim()
  const workspaceId = typeof env.QWEN_MT_WORKSPACE_ID === 'string'
    ? env.QWEN_MT_WORKSPACE_ID.trim()
    : ''
  const budgetCnyRaw = env.QWEN_MT_MONTHLY_BUDGET_CNY
  const monthlyBudgetCny = budgetCnyRaw == null || budgetCnyRaw === ''
    ? null
    : Number(budgetCnyRaw)
  const allowOpenAuth = truthyEnv(env.QUESTION_BANK_PAPER_TRANSLATION_ALLOW_OPEN_AUTH)
  const dataDir = env.QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR || ''
  const publicOrigin = env.QUESTION_BANK_PUBLIC_ORIGIN || ''

  const issues = []
  if (region !== ALLOWED_REGION) issues.push('region')
  if (workspaceId && !WORKSPACE_ID.test(workspaceId)) issues.push('workspace')
  if (monthlyBudgetCny != null && (!Number.isFinite(monthlyBudgetCny) || monthlyBudgetCny < 0)) {
    issues.push('budget')
  }

  const endpoint = workspaceId && region === ALLOWED_REGION
    ? `https://${workspaceId}.${region}.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
    : null

  return {
    enabled,
    keyAvailable: apiKey.length > 0,
    apiKey,
    region,
    workspaceId,
    endpoint,
    monthlyBudgetCny,
    allowOpenAuth,
    dataDir,
    publicOrigin,
    provider: PROVIDER_ID,
    model: MODEL_ID,
    configValid: issues.length === 0,
    configIssues: issues,
  }
}

export function endpointAllowed(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
      && parsed.pathname === '/compatible-mode/v1/chat/completions'
      && /^[A-Za-z0-9][A-Za-z0-9-]{0,63}\.cn-beijing\.maas\.aliyuncs\.com$/.test(parsed.hostname)
      && parsed.port === ''
      && parsed.username === ''
      && parsed.password === ''
  } catch {
    return false
  }
}
