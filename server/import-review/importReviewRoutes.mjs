import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'

import { canonicalConsumptionPrintPayload } from '../../scripts/import-pipeline/canonical-consumption-print-payload.mjs'
import { defineRoute } from '../router/index.mjs'
import { withChromiumPage } from '../draft-paper/chromiumPool.mjs'
import { printConsumption, resolveReviewFile } from './revisionProjection.mjs'

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ''))
  const rightBytes = Buffer.from(String(right || ''))
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''))
  return match?.[1] || ''
}

function sendError(response, context, error) {
  context.sendJson(response, Number(error?.status || 500), {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code || 'IMPORT_REVIEW_FAILED',
  })
}

function route(handler) {
  return async (input) => {
    try {
      await handler(input)
    } catch (error) {
      sendError(input.response, input.context, error)
    }
  }
}

function requireOwner(response, context) {
  if (context.session?.role === 'owner' && context.session?.accountKind !== 'import_agent') {
    return true
  }
  context.sendJson(response, 403, { error: 'forbidden' })
  return false
}

function requireReviewer(response, context) {
  if (
    context.session?.role === 'owner'
    || context.session?.accountKind === 'import_agent'
  ) return true
  context.sendJson(response, 403, { error: 'forbidden' })
  return false
}

function agentIdentity(request, context, agentToken) {
  if (context.session?.accountKind === 'import_agent') {
    return context.session.username
  }
  if (agentToken && safeEqual(bearerToken(request), agentToken)) return 'import-agent-token'
  return null
}

function shippingIdentity(request, shipToken) {
  if (shipToken && safeEqual(bearerToken(request), shipToken)) {
    return 'ship-authorizer-token'
  }
  return null
}

async function receiveFile(request, destination, expected) {
  const contentLength = Number(request.headers['content-length'])
  if (Number.isFinite(contentLength) && contentLength !== expected.byteLength) {
    const error = new Error('Content-Length does not match manifest')
    error.code = 'IMPORT_REVIEW_FILE_SIZE_MISMATCH'
    error.status = 400
    throw error
  }
  mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.upload-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx')
  const hash = createHash('sha256')
  let byteLength = 0
  try {
    try {
      for await (const chunk of request) {
        byteLength += chunk.length
        if (byteLength > expected.byteLength) {
          const error = new Error('Uploaded file is larger than manifest')
          error.code = 'IMPORT_REVIEW_FILE_SIZE_MISMATCH'
          error.status = 400
          throw error
        }
        hash.update(chunk)
        writeSync(descriptor, chunk)
      }
    } finally {
      closeSync(descriptor)
    }
    const sha256 = `sha256:${hash.digest('hex')}`
    if (byteLength !== expected.byteLength || sha256 !== expected.sha256) {
      const error = new Error('Uploaded file does not match manifest')
      error.code = 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH'
      error.status = 400
      throw error
    }
    renameSync(temporary, destination)
    return { sha256, byteLength }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw error
  }
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  })
  response.end(html)
}

function sendBinary(response, body, contentType, fileName, disposition = 'inline') {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': contentType,
  })
  response.end(body)
}

function reviewPrintHtml(projection, versionType, buildPrintHtml) {
  if (!['student', 'teacher'].includes(versionType)) {
    const error = new Error('version must be student or teacher')
    error.code = 'IMPORT_REVIEW_VERSION_INVALID'
    error.status = 400
    throw error
  }
  const consumption = printConsumption(projection.consumption)
  const answerByQuestionId = new Map(
    Object.entries(projection.paperAsset.answerKey?.answers || {})
      .map(([questionId, answer]) => [questionId, answer.answer]),
  )
  const payload = canonicalConsumptionPrintPayload(
    consumption,
    projection.paperName,
    answerByQuestionId,
  )
  const items = payload.items.map((item) => ({
    detail: payload.details.get(item.questionGroupId),
    note: '',
    score: 0,
    sectionTitle: '',
  }))
  return buildPrintHtml({
    title: payload.title,
    versionType,
    printStyle: payload.printStyle,
    items,
    blocks: payload.blocks,
    questionNumberStart: payload.questionNumberStart,
    canonicalConsumption: consumption,
  })
}

export function createImportReviewRoutes({
  getStore,
  agentToken,
  shipToken,
  buildPrintHtml,
}) {
  if (agentToken && shipToken && agentToken === shipToken) {
    throw new Error('Import Review Agent and shipping tokens must be different')
  }
  const store = new Proxy({}, {
    get(_target, property) {
      const current = getStore()
      const value = current[property]
      return typeof value === 'function' ? value.bind(current) : value
    },
  })
  const routes = []

  routes.push(defineRoute('GET', /^\/api\/import-agent-reviews$/, route(({
    request,
    response,
    context,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, { papers: store.listPapers() })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-reviews\/papers\/([^/]+)$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, store.agentPaperStatus(decodeURIComponent(match[1])))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/shipping-guards$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    const actor = shippingIdentity(request, shipToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'shipping_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 201, { guard: store.acquireShippingGuard(
      decodeURIComponent(match[1]),
      input,
      actor,
    ) })
  })))

  routes.push(defineRoute('DELETE', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/shipping-guards\/([^/]+)$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    const actor = shippingIdentity(request, shipToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'shipping_auth_required' })
      return
    }
    context.sendJson(response, 200, store.releaseShippingGuard(
      decodeURIComponent(match[1]),
      match[2],
      actor,
    ))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/revisions$/, route(async ({
    request,
    response,
    context,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
    context.sendJson(response, 201, store.createRevision(input))
  })))

  routes.push(defineRoute('PUT', /^\/api\/import-agent-reviews\/revisions\/([^/]+)\/files$/, route(async ({
    request,
    response,
    url,
    context,
    match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const revisionId = match[1]
    const relativePath = url.searchParams.get('path') || ''
    const upload = store.fileForUpload(revisionId, relativePath)
    if (upload.file.uploadedAt && existsSync(upload.destination)) {
      context.sendJson(response, 200, store.uploadStatus(revisionId))
      return
    }
    const received = await receiveFile(request, upload.destination, upload.file)
    context.sendJson(
      response,
      200,
      store.completeFileUpload(revisionId, relativePath, received),
    )
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/revisions\/([^/]+)\/finalize$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, { revision: store.finalizeRevision(match[1]) })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/issues\/([^/]+)\/messages$/, route(async ({
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
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 200, store.addIssueMessage(
      decodeURIComponent(match[1]),
      match[2],
      input,
      actor,
      'agent',
    ))
  })))

  routes.push(defineRoute('GET', /^\/api\/import-reviews$/, route(({ response, context }) => {
    if (!requireOwner(response, context)) return
    context.sendJson(response, 200, { papers: store.listPapers() })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-reviews\/papers\/([^/]+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    context.sendJson(response, 200, store.paperDetail(decodeURIComponent(match[1])))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/issues$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 201, store.createIssue(
      decodeURIComponent(match[1]),
      input,
      context.session.username,
    ))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/issues\/([^/]+)\/messages$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 200, store.addIssueMessage(
      decodeURIComponent(match[1]),
      match[2],
      input,
      context.session.username,
      'owner',
    ))
  })))

  routes.push(defineRoute('PATCH', /^\/api\/import-reviews\/papers\/([^/]+)\/issues\/([^/]+)$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 200, store.updateIssue(
      decodeURIComponent(match[1]),
      match[2],
      input,
    ))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/approve$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    context.sendJson(response, 200, { approval: store.approveRevision(
      decodeURIComponent(match[1]),
      match[2],
      input,
      context.session.username,
    ) })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/consumption$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = store.projectionForRevision(match[1])
    context.sendJson(response, 200, projection.consumption)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/asset\/(.+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    if (match[2] !== 'paper-asset.json') {
      context.sendJson(response, 404, { error: 'Review asset not found' })
      return
    }
    const { projection } = store.projectionForRevision(match[1])
    context.sendJson(response, 200, projection.paperAsset)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/print$/, route(({
    response,
    url,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = store.projectionForRevision(match[1])
    sendHtml(response, reviewPrintHtml(projection, url.searchParams.get('version'), buildPrintHtml))
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/pdf$/, route(async ({
    response,
    url,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = store.projectionForRevision(match[1])
    const version = url.searchParams.get('version')
    const html = reviewPrintHtml(projection, version, buildPrintHtml)
    const pdf = await withChromiumPage(async (page) => {
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    })
    sendBinary(response, pdf, 'application/pdf', `${projection.paperId}-${version}.pdf`)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/files$/, route(({
    response,
    url,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const relativePath = url.searchParams.get('path') || ''
    const { revision } = store.projectionForRevision(match[1])
    const file = revision?.manifest?.files?.find((candidate) => candidate.path === relativePath)
    if (!revision || !file) {
      context.sendJson(response, 404, { error: 'Review file not found' })
      return
    }
    const filePath = resolveReviewFile(store.revisionDirectory(match[1]), relativePath)
    if (!existsSync(filePath)) {
      context.sendJson(response, 404, { error: 'Review file not found' })
      return
    }
    sendBinary(response, readFileSync(filePath), file.mediaType, path.basename(file.path))
  })))

  return routes
}
