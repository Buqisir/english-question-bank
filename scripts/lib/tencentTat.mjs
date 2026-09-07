import { createHash, createHmac } from 'node:crypto'
import { TextDecoder } from 'node:util'

const TAT_ENDPOINT = 'tat.tencentcloudapi.com'
const TAT_SERVICE = 'tat'
const TAT_VERSION = '2020-10-28'
const CONTENT_TYPE = 'application/json'
const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const REGION = /^[a-z][a-z0-9-]{2,63}$/u
const INSTANCE_ID = /^(?:ins|lhins)-[a-z0-9]{8,64}$/u
const TRANSPORT_USER = /^[a-z_][a-z0-9_-]*$/u
const INVOCATION_ID = /^inv-[a-z0-9]{8,64}$/u
const INVOCATION_TASK_ID = /^invt-[a-z0-9]{8,64}$/u
const COMMAND_ID = /^cmd-[a-z0-9]{8,64}$/u
const NONTERMINAL_INVOCATION_STATUSES = new Set(['PENDING', 'RUNNING', 'CANCELLING'])
const TERMINAL_INVOCATION_STATUSES = new Set([
  'SUCCESS',
  'TIMEOUT',
  'FAILED',
  'CANCELLED',
  'PARTIAL_FAILED',
  'PARTIAL_CANCELLED',
])
const TERMINAL_TASK_STATUSES = new Set([
  'DELIVER_FAILED',
  'START_FAILED',
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'TASK_TIMEOUT',
  'CANCELLED',
  'TERMINATED',
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest()
}

function requiredEnvironmentValue(environment, name) {
  const value = environment?.[name]
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4096
    || /[\0\r\n]/u.test(value)
  ) {
    throw new Error(`Tencent TAT environment ${name} is missing or invalid`)
  }
  return value
}

export function readTencentTatConfiguration(environment = process.env) {
  const secretId = requiredEnvironmentValue(environment, 'TENCENTCLOUD_SECRET_ID')
  const secretKey = requiredEnvironmentValue(environment, 'TENCENTCLOUD_SECRET_KEY')
  const region = requiredEnvironmentValue(environment, 'TENCENTCLOUD_REGION')
  const instanceId = requiredEnvironmentValue(
    environment,
    'QUESTION_BANK_TENCENT_TAT_INSTANCE_ID',
  )
  const sessionToken = environment?.TENCENTCLOUD_SESSION_TOKEN
  if (!REGION.test(region)) {
    throw new Error('Tencent TAT region is invalid')
  }
  if (!INSTANCE_ID.test(instanceId)) {
    throw new Error('Tencent TAT instance identity is invalid')
  }
  if (
    sessionToken !== undefined
    && (
      typeof sessionToken !== 'string'
      || sessionToken.length === 0
      || sessionToken.length > 8192
      || /[\0\r\n]/u.test(sessionToken)
    )
  ) {
    throw new Error('Tencent TAT session token is invalid')
  }
  return { secretId, secretKey, sessionToken: sessionToken || null, region, instanceId }
}

export function tencentTatTargetDigest({ region, instanceId }) {
  if (!REGION.test(region || '') || !INSTANCE_ID.test(instanceId || '')) {
    throw new Error('Tencent TAT target is invalid')
  }
  return sha256(`${region}\0${instanceId}`)
}

export function createTencentCloudApiRequest({
  action,
  payload,
  secretId,
  secretKey,
  sessionToken = null,
  region,
  timestamp,
  host = TAT_ENDPOINT,
  service = TAT_SERVICE,
  version = TAT_VERSION,
} = {}) {
  if (
    !/^[A-Z][A-Za-z0-9]{1,63}$/u.test(action || '')
    || !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || typeof secretId !== 'string'
    || !secretId
    || typeof secretKey !== 'string'
    || !secretKey
    || !REGION.test(region || '')
    || !Number.isSafeInteger(timestamp)
    || timestamp <= 0
    || timestamp > 8_640_000_000
    || !/^[a-z][a-z0-9.-]+$/u.test(host || '')
    || !/^[a-z][a-z0-9-]*$/u.test(service || '')
    || !/^\d{4}-\d{2}-\d{2}$/u.test(version || '')
  ) {
    throw new Error('Tencent Cloud API request is invalid')
  }
  const body = JSON.stringify(payload)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const signedHeaders = 'content-type;host'
  const canonicalHeaders = `content-type:${CONTENT_TYPE}\nhost:${host}\n`
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const secretDate = hmac(Buffer.from(`TC3${secretKey}`, 'utf8'), date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  const headers = {
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': CONTENT_TYPE,
    'X-TC-Action': action,
    'X-TC-Region': region,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
  }
  if (sessionToken) headers['X-TC-Token'] = sessionToken
  return { url: `https://${host}/`, body, headers }
}

async function requestTencentTatApi({
  action,
  payload,
  configuration,
  fetchImpl,
  now,
}) {
  const request = createTencentCloudApiRequest({
    action,
    payload,
    ...configuration,
    timestamp: Math.floor(now() / 1000),
  })
  let response
  try {
    response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error(`Tencent TAT ${action} transport failed`)
  }
  let envelope
  try {
    envelope = JSON.parse(await response.text())
  } catch {
    throw new Error(`Tencent TAT ${action} response is not valid JSON`)
  }
  const body = envelope?.Response
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`Tencent TAT ${action} response is invalid`)
  }
  if (body.Error) {
    const code = body.Error?.Code
    throw new Error(
      `Tencent TAT ${action} API rejected the request${
        typeof code === 'string' && /^[A-Za-z0-9._-]+$/u.test(code) ? ` (${code})` : ''
      }`,
    )
  }
  return body
}

function decodeTaskOutput(value) {
  if (
    typeof value !== 'string'
    || value.length > 32 * 1024
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    throw new Error('Tencent TAT task output encoding is invalid')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) {
    throw new Error('Tencent TAT task output is not canonical base64')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Tencent TAT task output is not valid UTF-8')
  }
}

function exactSingleton(value, label) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`Tencent TAT ${label} is not an exact singleton`)
  }
  return value[0]
}

export function buildMaintenanceReadinessTatCommand({
  inspectorSource,
  targetSha,
  payloadDigest,
  transportUser,
} = {}) {
  if (
    typeof inspectorSource !== 'string'
    || !inspectorSource.startsWith('#!/usr/bin/env bash\n')
    || inspectorSource.includes('\0')
    || !SHA.test(targetSha || '')
    || !DIGEST.test(payloadDigest || '')
    || !TRANSPORT_USER.test(transportUser || '')
    || transportUser === 'root'
  ) {
    throw new Error('Tencent TAT maintenance-readiness command input is invalid')
  }
  const delimiter = `EQB_INSPECTOR_${sha256(inspectorSource).slice(0, 24)}`
  if (inspectorSource.split('\n').includes(delimiter)) {
    throw new Error('Tencent TAT inspector heredoc delimiter collides with source')
  }
  const source = inspectorSource.endsWith('\n') ? inspectorSource : `${inspectorSource}\n`
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    '/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin \\',
    `  /bin/bash -s -- '${targetSha}' '${payloadDigest}' '${transportUser}' <<'${delimiter}'`,
    source.slice(0, -1),
    delimiter,
    '',
  ].join('\n')
}

export async function executeTencentTatCommand({
  command,
  commandName,
  description = 'Read-only EQB maintenance-controller installation readiness',
  configuration,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  pollIntervalMs = 2_000,
  pollTimeoutMs = 6 * 60 * 1000,
  onDispatched = () => {},
} = {}) {
  const targetDigest = tencentTatTargetDigest(configuration || {})
  if (
    typeof fetchImpl !== 'function'
    || typeof onDispatched !== 'function'
    || typeof now !== 'function'
    || typeof sleep !== 'function'
    || typeof command !== 'string'
    || command.includes('\0')
    || typeof description !== 'string' || description.length < 1 || description.length > 200
    || /[\0\r\n]/u.test(description)
    || !/^[A-Za-z0-9_.-]{1,60}$/u.test(commandName || '')
    || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 1
    || !Number.isSafeInteger(pollTimeoutMs)
    || pollTimeoutMs < pollIntervalMs
  ) {
    throw new Error('Tencent TAT command invocation is invalid')
  }
  const content = Buffer.from(command, 'utf8').toString('base64')
  if (content.length > 64 * 1024) {
    throw new Error('Tencent TAT command exceeds the encoded 64 KiB limit')
  }
  const startedAt = now()
  let dispatched
  try {
    dispatched = await requestTencentTatApi({
      action: 'RunCommand',
      payload: {
        Content: content,
        InstanceIds: [configuration.instanceId],
        CommandName: commandName,
        Description: description,
        CommandType: 'SHELL',
        WorkingDirectory: '/root',
        Timeout: 300,
        SaveCommand: false,
        EnableParameter: false,
        Username: 'root',
      },
      configuration,
      fetchImpl,
      now,
    })
  } catch {
    throw new Error(
      'Tencent TAT RunCommand outcome is unknown; do not retry without reconciling Tencent invocation history',
    )
  }
  const invocationId = dispatched.InvocationId
  const commandId = dispatched.CommandId
  if (!INVOCATION_ID.test(invocationId || '') || !COMMAND_ID.test(commandId || '')) {
    throw new Error(
      'Tencent TAT RunCommand returned no usable invocation identity; do not retry without reconciling Tencent invocation history',
    )
  }
  // An optional private durable save point; failure stops polling, never dispatches again.
  await onDispatched({ commandId, invocationId, targetDigest })

  while (now() - startedAt <= pollTimeoutMs) {
    let described
    try {
      described = await requestTencentTatApi({
        action: 'DescribeInvocations',
        payload: { InvocationIds: [invocationId], Limit: 1, Offset: 0 },
        configuration,
        fetchImpl,
        now,
      })
    } catch {
      throw new Error(`Tencent TAT invocation polling failed for ${invocationId}`)
    }
    if (described.TotalCount === 0 && Array.isArray(described.InvocationSet)
      && described.InvocationSet.length === 0) {
      await sleep(pollIntervalMs)
      continue
    }
    if (described.TotalCount !== 1) {
      throw new Error('Tencent TAT invocation lookup count is invalid')
    }
    const invocation = exactSingleton(described.InvocationSet, 'invocation result')
    if (invocation?.InvocationId !== invocationId) {
      throw new Error('Tencent TAT invocation identity changed during polling')
    }
    const invocationStatus = invocation.InvocationStatus
    if (NONTERMINAL_INVOCATION_STATUSES.has(invocationStatus)) {
      await sleep(pollIntervalMs)
      continue
    }
    if (!TERMINAL_INVOCATION_STATUSES.has(invocationStatus)) {
      throw new Error('Tencent TAT invocation status is invalid')
    }
    const basicTask = exactSingleton(
      invocation.InvocationTaskBasicInfoSet,
      'invocation task summary',
    )
    if (
      basicTask?.InstanceId !== configuration.instanceId
      || !INVOCATION_TASK_ID.test(basicTask?.InvocationTaskId || '')
      || !TERMINAL_TASK_STATUSES.has(basicTask?.TaskStatus)
    ) {
      throw new Error('Tencent TAT invocation task summary is invalid')
    }
    let tasks
    try {
      tasks = await requestTencentTatApi({
        action: 'DescribeInvocationTasks',
        payload: {
          InvocationTaskIds: [basicTask.InvocationTaskId],
          HideOutput: false,
          Limit: 1,
          Offset: 0,
        },
        configuration,
        fetchImpl,
        now,
      })
    } catch {
      throw new Error(`Tencent TAT task result polling failed for ${invocationId}`)
    }
    if (tasks.TotalCount !== 1) {
      throw new Error('Tencent TAT task result count is invalid')
    }
    const task = exactSingleton(tasks.InvocationTaskSet, 'task result')
    if (
      task?.InvocationId !== invocationId
      || task?.InvocationTaskId !== basicTask.InvocationTaskId
      || task?.InstanceId !== configuration.instanceId
      || task?.TaskStatus !== basicTask.TaskStatus
      || !TERMINAL_TASK_STATUSES.has(task?.TaskStatus)
      || !Number.isSafeInteger(task?.TaskResult?.ExitCode)
      || task?.TaskResult?.Dropped !== 0
      || (task.TaskStatus === 'SUCCESS') !== (task.TaskResult.ExitCode === 0)
      || (invocationStatus === 'SUCCESS') !== (task.TaskStatus === 'SUCCESS')
    ) {
      throw new Error('Tencent TAT task result is invalid or truncated')
    }
    return {
      commandId,
      invocationId,
      invocationTaskId: task.InvocationTaskId,
      invocationStatus,
      taskStatus: task.TaskStatus,
      exitCode: task.TaskResult.ExitCode,
      output: decodeTaskOutput(task.TaskResult.Output),
      targetDigest,
    }
  }
  throw new Error(`Tencent TAT invocation ${invocationId} did not finish before the polling deadline`)
}
