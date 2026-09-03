import { timingSafeEqual } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'

import { defineRoute } from '../router/index.mjs'
import { receiveVerifiedUpload } from '../import-ops/receiveVerifiedUpload.mjs'

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ''))
  const rightBytes = Buffer.from(String(right || ''))
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''))
  return match?.[1] || ''
}

function agentIdentity(request, context, agentToken) {
  if (context.session?.accountKind === 'import_agent') return context.session.username
  if (agentToken && safeEqual(bearerToken(request), agentToken)) return 'import-agent-token'
  return null
}

function requireOwner(response, context) {
  if (context.session?.role === 'owner' && context.session?.accountKind !== 'import_agent') {
    return true
  }
  context.sendJson(response, 403, { error: 'forbidden' })
  return false
}

function route(handler) {
  return async (input) => {
    try {
      await handler(input)
    } catch (error) {
      input.context.sendJson(input.response, Number(error?.status || 500), {
        error: error instanceof Error ? error.message : String(error),
        code: error?.code || 'SOURCE_INTAKE_FAILED',
      })
    }
  }
}

function leaseToken(request) {
  return String(request.headers['x-source-intake-lease'] || '')
}

function ampThreadId(request) {
  return String(request.headers['x-amp-thread-id'] || '')
}

function mp3FrameAt(bytes, offset) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
    return false
  }
  const version = (bytes[offset + 1] >> 3) & 0x03
  const layer = (bytes[offset + 1] >> 1) & 0x03
  const bitrate = (bytes[offset + 2] >> 4) & 0x0f
  const sampleRate = (bytes[offset + 2] >> 2) & 0x03
  return version !== 0x01 && layer !== 0 && bitrate !== 0 && bitrate !== 0x0f && sampleRate !== 0x03
}

function mp3AudioStart(bytes) {
  if (bytes.length < 10 || bytes.subarray(0, 3).toString('ascii') !== 'ID3') return 0
  const sizeBytes = bytes.subarray(6, 10)
  if ([...sizeBytes].some((byte) => byte > 0x7f)) return -1
  const tagSize = (sizeBytes[0] << 21)
    | (sizeBytes[1] << 14)
    | (sizeBytes[2] << 7)
    | sizeBytes[3]
  return 10 + tagSize + ((bytes[5] & 0x10) ? 10 : 0)
}

export function validateSourceIntakeUploadMagic(filePath, expected) {
  const bytes = readFileSync(filePath)
  let valid = false
  if (expected.extension === '.pdf') {
    valid = bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
  } else if (expected.extension === '.docx') {
    valid = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      && bytes.includes(Buffer.from('[Content_Types].xml'))
      && bytes.includes(Buffer.from('word/'))
  } else if (expected.extension === '.mp3') {
    const audioStart = mp3AudioStart(bytes)
    const searchEnd = Math.min(bytes.length - 3, Math.max(audioStart, 0) + 4096)
    for (let offset = audioStart; offset >= 0 && offset < searchEnd; offset += 1) {
      if (mp3FrameAt(bytes, offset)) {
        valid = true
        break
      }
    }
  }
  if (!valid) {
    const error = new Error('Uploaded bytes do not match the declared file type')
    error.code = 'SOURCE_INTAKE_FILE_MAGIC_INVALID'
    error.status = 400
    throw error
  }
}

function sendPrivateFile(response, download) {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.file.fileName)}`,
    'content-length': String(download.file.byteLength),
    'content-type': download.file.mediaType,
    'x-content-type-options': 'nosniff',
    'x-source-file-sha256': download.file.sha256,
  })
  createReadStream(download.path).pipe(response)
}

export function createSourceIntakeRoutes({ getStore, notifier, agentToken = '' }) {
  const store = new Proxy({}, {
    get(_target, property) {
      const current = getStore()
      const value = current[property]
      return typeof value === 'function' ? value.bind(current) : value
    },
  })
  const routes = []

  async function notifySubmission(submission, actor) {
    const outcome = await notifier.notify(submission)
    store.recordNotification(submission.id, outcome, actor)
    return outcome
  }

  routes.push(defineRoute('GET', /^\/api\/source-intakes$/, route(({
    response,
    url,
    context,
  }) => {
    if (!requireOwner(response, context)) return
    context.sendJson(response, 200, {
      intakes: store.listIntakes({
        query: url.searchParams.get('query') || '',
        state: url.searchParams.get('state') || '',
      }),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/source-intakes$/, route(async ({
    request,
    response,
    context,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 30_000 })
    context.sendJson(
      response,
      201,
      { intake: store.createIntake(input, context.session.username) },
    )
  })))

  routes.push(defineRoute('GET', /^\/api\/source-intakes\/([^/]+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    context.sendJson(response, 200, { intake: store.intakeDetail(match[1]) })
  })))

  routes.push(defineRoute('PATCH', /^\/api\/source-intakes\/([^/]+)$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 30_000 })
    context.sendJson(response, 200, {
      intake: store.updateIntake(match[1], input, context.session.username),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/source-intakes\/([^/]+)\/files$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    const result = store.registerFile(match[1], input, context.session.username)
    context.sendJson(response, result.created ? 201 : 200, result)
  })))

  routes.push(defineRoute('PUT', /^\/api\/source-intakes\/([^/]+)\/files\/([^/]+)$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const upload = store.fileForUpload(match[1], match[2])
    const received = await receiveVerifiedUpload(
      request,
      upload.destination,
      upload.file,
      {
        errorPrefix: 'SOURCE_INTAKE',
        expectedContentType: upload.file.mediaType,
        validateTemporaryFile: validateSourceIntakeUploadMagic,
      },
    )
    context.sendJson(response, 200, {
      intake: store.completeFileUpload(
        match[1],
        match[2],
        received,
        context.session.username,
      ),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/source-intakes\/([^/]+)\/submit$/, route(async ({
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const result = store.submitIntake(match[1], context.session.username)
    const notification = await notifySubmission(result.submission, context.session.username)
    context.sendJson(response, 201, { ...result, notification })
  })))

  routes.push(defineRoute('POST', /^\/api\/source-intakes\/([^/]+)\/submissions\/([^/]+)\/notify$/, route(async ({
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const submission = store.assertQueuedForNotification(match[2])
    if (submission.intakeId !== match[1]) {
      const error = new Error('Submission does not belong to source intake')
      error.code = 'SOURCE_INTAKE_SUBMISSION_NOT_FOUND'
      error.status = 404
      throw error
    }
    const notification = await notifySubmission(submission, context.session.username)
    context.sendJson(response, 200, {
      intake: store.intakeDetail(match[1]),
      notification,
    })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-source-intakes$/, route(({
    request,
    response,
    context,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, { submissions: store.listQueue() })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/orb-worker\/reserve$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000 })
    context.sendJson(response, 200, {
      worker: store.reserveOrbWorker(match[1], input, actor),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/orb-worker\/bind$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000 })
    context.sendJson(response, 200, {
      worker: store.bindOrbWorker(match[1], input, actor),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/claim$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000 })
    context.sendJson(response, 200, store.claimSubmission(
      match[1],
      actor,
      input.leaseSeconds,
      ampThreadId(request),
    ))
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-source-intakes\/([^/]+)$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, {
      submission: store.claimedSubmission(
        match[1],
        actor,
        leaseToken(request),
        ampThreadId(request),
      ),
    })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-source-intakes\/([^/]+)\/files\/([^/]+)$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    sendPrivateFile(
      response,
      store.fileForDownload(
        match[1],
        match[2],
        actor,
        leaseToken(request),
        ampThreadId(request),
      ),
    )
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/heartbeat$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000 })
    context.sendJson(response, 200, {
      claim: store.heartbeat(
        match[1],
        actor,
        leaseToken(request),
        input.leaseSeconds,
        ampThreadId(request),
      ),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/needs-owner$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 10_000 })
    context.sendJson(response, 200, {
      intake: store.needsOwner(
        match[1],
        actor,
        leaseToken(request),
        input,
        ampThreadId(request),
      ),
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-source-intakes\/([^/]+)\/handoff$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000 })
    context.sendJson(response, 200, {
      intake: store.handoff(
        match[1],
        actor,
        leaseToken(request),
        input,
        ampThreadId(request),
      ),
    })
  })))

  return routes
}
