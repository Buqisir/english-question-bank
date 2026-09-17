import { timingSafeEqual } from 'node:crypto'
import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { defineRoute } from '../router/index.mjs'
import { withChromiumPage } from '../draft-paper/chromiumPool.mjs'
import { buildCompanionAnalysisHtml } from '../exports/companionAnalysisRenderer.mjs'
import { receiveVerifiedUpload } from '../import-ops/receiveVerifiedUpload.mjs'
import { rasterPdfRegion } from '../paper-canonical/pdfRegionRaster.mjs'
import { cropNck1SourceImage } from '../paper-import/nck1ImageSourceBundle.mjs'
import { resolveReviewFile } from './revisionProjection.mjs'
import {
  renderReviewFixedEdition,
  reviewPaginationMetadata,
  reviewPrintHtml,
} from './reviewPagination.mjs'

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

function sendHtml(response, html) {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  })
  response.end(html)
}

function sendBinary(
  response,
  body,
  contentType,
  fileName,
  disposition = 'inline',
  headers = {},
) {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': contentType,
    ...headers,
  })
  response.end(body)
}

function reviewError(code, message, status) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function candidateProjectionForRevision(store, revisionId) {
  const result = store.projectionForRevision(revisionId)
  if (result.revision?.reviewKind === 'ocr' || result.projection.reviewKind === 'ocr') {
    throw reviewError(
      'IMPORT_REVIEW_CANDIDATE_REQUIRED',
      'OCR review has no Candidate Screen, Print, or PDF surface',
      409,
    )
  }
  return result
}

function companionAnalyses(sidecars = {}) {
  return {
    reading: sidecars['reading-choice-analysis-v1.json'] || null,
    sevenChoices: sidecars['seven-choices-analysis-v1.json'] || null,
    cloze: sidecars['cloze-analysis-v1.json'] || null,
    grammarFill: sidecars['grammar-fill-analysis-v1.json'] || null,
    writing: sidecars['writing-analysis-v1.json'] || null,
    listening: sidecars['listening-analysis-v1.json'] || null,
  }
}

function paragraphText(block) {
  if (!block || typeof block !== 'object') return ''
  if (block.kind === 'paragraph') {
    return (block.content || [])
      .filter((item) => item?.kind === 'text')
      .map((item) => item.text || '')
      .join('')
  }
  if (block.kind === 'framed_columns') {
    return (block.columns || [])
      .flatMap((column) => column.blocks || [])
      .map(paragraphText)
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export function publicPaperReviewDetail(store, paperId) {
  const detail = store.paperDetail(paperId)
  if (
    !detail.latestRevisionId
    || detail.latest?.state === 'uploading'
    || detail.latest?.reviewKind === 'ocr'
  ) return detail
  const { projection } = candidateProjectionForRevision(store, detail.latestRevisionId)
  if (projection.importProfile !== 'public-paper-v1') return detail

  const sourceParagraphs = new Map()
  for (const group of projection.materialization?.groups || []) {
    const visit = (blocks = []) => {
      for (const block of blocks) {
        if (block?.kind === 'framed_columns') {
          for (const column of block.columns || []) visit(column.blocks)
        } else if (block?.kind === 'paragraph') {
          sourceParagraphs.set(`${group.groupId}\0${block.blockId}`, paragraphText(block))
        }
      }
    }
    visit(group.blocks)
  }

  return {
    ...detail,
    importProfile: projection.importProfile,
    paragraphSummariesDigest: projection.paragraphSummariesDigest,
    publicSearchMetadata: projection.publicSearchMetadata,
    publicSearchMetadataBytes: projection.publicSearchMetadataBytes,
    publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
    paragraphSummaryBinding: {
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
    },
    paragraphSummaries: {
      ...projection.paragraphSummaries,
      groups: (projection.paragraphSummaries?.groups || []).map((group) => ({
        ...group,
        paragraphs: group.paragraphs.map((paragraph) => ({
          ...paragraph,
          sourceText: sourceParagraphs.get(`${group.groupId}\0${paragraph.paragraphId}`) || '',
        })),
      })),
    },
  }
}

export function createImportReviewRoutes({
  getStore,
  agentToken,
  shipToken,
  buildPrintHtml,
  promotionService = null,
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

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/promotions$/, route(async ({
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
    if (!promotionService) {
      throw reviewError(
        'IMPORT_REVIEW_PROMOTION_UNAVAILABLE',
        'Single-paper promotion service is unavailable',
        503,
      )
    }
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    const result = await promotionService.promote(
      decodeURIComponent(match[1]),
      input,
      actor,
    )
    if (result.status === 'failed') {
      context.sendJson(response, 409, {
        status: result.status,
        promotion: result.promotion,
        code: result.failure.failureCode,
        error: result.failure.failureMessage,
      })
      return
    }
    context.sendJson(response, result.status === 'published' ? 201 : 200, {
      status: result.status,
      promotion: result.promotion,
    })
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
    const received = await receiveVerifiedUpload(request, upload.destination, upload.file)
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

  routes.push(defineRoute('GET', /^\/api\/import-agent-reviews\/revisions\/([^/]+)\/ocr-confirmation$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const revision = store.getRevision(match[1])
    if (
      !revision
      || revision.reviewKind !== 'ocr'
      || revision.state !== 'approved'
      || revision.approval?.schemaVersion !== 'web-import-ocr-review-confirmation-v1'
    ) {
      throw reviewError(
        'IMPORT_REVIEW_OCR_CONFIRMATION_PENDING',
        'OCR confirmation is not available',
        404,
      )
    }
    context.sendJson(response, 200, {
      receipt: revision.approval,
      confirmation: revision.approval.confirmation,
    })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-reviews\/revisions\/([^/]+)\/media-confirmations\/([^/]+)$/, route(({
    request,
    response,
    context,
    match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    context.sendJson(response, 200, {
      receipt: store.mediaConfirmation(
        match[1],
        decodeURIComponent(match[2]),
      ),
    })
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
    const paperId = decodeURIComponent(match[1])
    context.sendJson(response, 200, publicPaperReviewDetail(store, paperId))
  })))

  routes.push(defineRoute('GET', /^\/api\/import-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/teaching$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const paperId = decodeURIComponent(match[1])
    const { projection } = candidateProjectionForRevision(store, match[2])
    if (projection.paperId !== paperId) {
      context.sendJson(response, 404, { error: 'Review revision not found for paper' })
      return
    }
    sendHtml(response, buildCompanionAnalysisHtml({
      paperAsset: projection.paperAsset,
      analyses: companionAnalyses(projection.analysisSidecars),
    }))
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

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/confirm-ocr$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 5_000_000 })
    context.sendJson(response, 200, { receipt: store.confirmOcrRevision(
      decodeURIComponent(match[1]),
      match[2],
      input,
      context.session.username,
    ) })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/confirm-media$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 30_000 })
    context.sendJson(response, 200, { receipt: store.confirmMediaDerivation(
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
    const { projection } = candidateProjectionForRevision(store, match[1])
    context.sendJson(response, 200, projection.consumption)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/media\/([^/]+)\/(source|candidate)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = candidateProjectionForRevision(store, match[1])
    const mediaId = decodeURIComponent(match[2])
    const rendition = match[3]
    const derivation = projection.mediaDerivations?.find((candidate) =>
      candidate.mediaId === mediaId)
    const image = derivation?.[rendition]
    if (!image?.encodedBytes || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) {
      throw reviewError(
        'IMPORT_REVIEW_MEDIA_RENDITION_NOT_FOUND',
        'Media rendition not found',
        404,
      )
    }
    const bytes = Buffer.from(image.encodedBytes, 'base64')
    if (sha256(bytes) !== image.sha256) {
      throw reviewError(
        'IMPORT_REVIEW_MEDIA_DIGEST_MISMATCH',
        'Media rendition no longer matches its immutable digest',
        409,
      )
    }
    const extension = ({
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    })[image.mimeType]
    sendBinary(
      response,
      bytes,
      image.mimeType,
      `review-media-${rendition}.${extension}`,
      'inline',
      {
        'x-eqb-media-id': mediaId,
        'x-eqb-media-rendition': rendition,
        'x-eqb-media-digest': image.sha256,
      },
    )
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/source-visuals\/([^/]+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    let revision
    let projection
    try {
      ({ revision, projection } = candidateProjectionForRevision(store, match[1]))
    } catch (error) {
      if (error?.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH') {
        throw reviewError(
          'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH',
          'Revision bytes changed; source proof is unavailable',
          409,
        )
      }
      throw error
    }
    const visualId = decodeURIComponent(match[2])
    const visual = projection.sourceVisuals?.find((candidate) =>
      candidate.visualId === visualId)
    if (!visual) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_VISUAL_NOT_FOUND',
        'Source visual not found',
        404,
      )
    }
    if (
      visual.state !== 'paired'
      || !visual.region
      || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
        .includes(visual.mediaType)
    ) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE',
        'Source visual has no exact source region',
        409,
      )
    }
    const sourcePath = resolveReviewFile(
      store.revisionDirectory(revision.id),
      visual.path,
      'Source visual document',
    )
    if (!existsSync(sourcePath)) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH',
        'Source visual document is unavailable',
        409,
      )
    }
    const sourceBytes = new Uint8Array(readFileSync(sourcePath))
    if (sha256(sourceBytes) !== visual.sourceDigest) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH',
        'Source visual document no longer matches its immutable digest',
        409,
      )
    }
    let crop
    try {
      crop = visual.mediaType === 'application/pdf'
        ? rasterPdfRegion({
            pdfBytes: sourceBytes,
            page: visual.page,
            region: visual.region,
            density: 150,
          })
        : cropNck1SourceImage(sourceBytes, visual.region)
    } catch {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE',
        'Source visual region cannot be rendered',
        409,
      )
    }
    sendBinary(
      response,
      crop.bytes,
      'image/png',
      `${visual.visualId.replaceAll(':', '-')}.png`,
      'inline',
      {
        'x-eqb-source-digest': visual.sourceDigest,
        'x-eqb-source-page': String(visual.page),
        'x-eqb-source-region': JSON.stringify(visual.region),
        'x-eqb-pixel-width': String(crop.pixelWidth),
        'x-eqb-pixel-height': String(crop.pixelHeight),
      },
    )
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/ocr\/pages\/([^/]+)\/(\d+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { revision, projection } = store.projectionForRevision(match[1])
    const documentId = decodeURIComponent(match[2])
    const pageNumber = Number(match[3])
    const page = projection.reviewKind === 'ocr'
      ? projection.ocrReview?.documents
        ?.find((document) => document.documentId === documentId)
        ?.pages?.find((candidate) => candidate.page === pageNumber)
      : null
    if (!page) {
      throw reviewError(
        'IMPORT_REVIEW_OCR_PAGE_NOT_FOUND',
        'OCR source page not found',
        404,
      )
    }
    const sourcePath = resolveReviewFile(
      store.revisionDirectory(revision.id),
      page.source.path,
      'OCR source page',
    )
    if (!existsSync(sourcePath)) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH',
        'OCR source page is unavailable',
        409,
      )
    }
    const sourceBytes = new Uint8Array(readFileSync(sourcePath))
    if (sha256(sourceBytes) !== page.source.sha256) {
      throw reviewError(
        'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH',
        'OCR source page no longer matches its immutable digest',
        409,
      )
    }
    const headers = {
      'x-eqb-source-digest': page.source.sha256,
      'x-eqb-source-page': String(page.page),
    }
    if (page.source.mediaType === 'application/pdf') {
      const raster = rasterPdfRegion({
        pdfBytes: sourceBytes,
        page: page.page,
        region: { x: 0, y: 0, width: 1, height: 1 },
        density: 150,
      })
      sendBinary(
        response,
        raster.bytes,
        'image/png',
        `${documentId}-page-${page.page}.png`,
        'inline',
        {
          ...headers,
          'x-eqb-pixel-width': String(raster.pixelWidth),
          'x-eqb-pixel-height': String(raster.pixelHeight),
        },
      )
      return
    }
    sendBinary(
      response,
      sourceBytes,
      page.source.mediaType,
      `${documentId}-page-${page.page}`,
      'inline',
      headers,
    )
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/asset\/(.+)$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = candidateProjectionForRevision(store, match[1])
    if (match[2] === 'paper-asset.json') {
      context.sendJson(response, 200, projection.paperAsset)
      return
    }
    const sidecarMatch = /^analyses\/([^/]+\.json)$/.exec(match[2])
    const sidecar = sidecarMatch
      ? projection.analysisSidecars?.[sidecarMatch[1]]
      : null
    if (!sidecar) {
      context.sendJson(response, 404, { error: 'Review asset not found' })
      return
    }
    context.sendJson(response, 200, sidecar)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/pagination$/, route(({
    response,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = candidateProjectionForRevision(store, match[1])
    context.sendJson(response, 200, reviewPaginationMetadata(projection))
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/print$/, route(async ({
    response,
    url,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = candidateProjectionForRevision(store, match[1])
    const pageLayout = url.searchParams.get('pageLayout') || 'natural'
    if (pageLayout === 'natural') {
      sendHtml(response, reviewPrintHtml(projection, url.searchParams.get('version'), buildPrintHtml))
      return
    }
    if (!['friendly8', 'friendly10'].includes(pageLayout) || url.searchParams.get('version') !== 'student') {
      throw reviewError('IMPORT_REVIEW_PAGE_LAYOUT_INVALID', 'Fixed editions require student friendly8 or friendly10', 400)
    }
    const rendered = await renderReviewFixedEdition(projection, pageLayout, buildPrintHtml)
    sendHtml(response, rendered.paginatedHtml)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/pdf$/, route(async ({
    response,
    url,
    context,
    match,
  }) => {
    if (!requireReviewer(response, context)) return
    const { projection } = candidateProjectionForRevision(store, match[1])
    const version = url.searchParams.get('version')
    const pageLayout = url.searchParams.get('pageLayout') || 'natural'
    if (pageLayout !== 'natural') {
      if (!['friendly8', 'friendly10'].includes(pageLayout) || version !== 'student') {
        throw reviewError('IMPORT_REVIEW_PAGE_LAYOUT_INVALID', 'Fixed editions require student friendly8 or friendly10', 400)
      }
      const rendered = await renderReviewFixedEdition(projection, pageLayout, buildPrintHtml)
      sendBinary(response, rendered.pdfBytes, 'application/pdf', `${projection.paperId}-${pageLayout}.pdf`, 'inline', {
        'x-eqb-pagination-edition': pageLayout,
        'x-eqb-pagination-mode': rendered.mode,
        'x-eqb-pagination-pages': String(rendered.pageCount),
        'x-eqb-pagination-plan-digest': projection.paginationPlanDigest || '',
      })
      return
    }
    const html = reviewPrintHtml(projection, version, buildPrintHtml)
    const pdf = await withChromiumPage(async (page) => {
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    })
    sendBinary(response, pdf, 'application/pdf', `${projection.paperId}-${version}.pdf`)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-review-preview\/revisions\/([^/]+)\/files$/, route(({
    request,
    response,
    url,
    context,
    match,
  }) => {
    const reviewer = context.session?.role === 'owner'
      || context.session?.accountKind === 'import_agent'
      || agentIdentity(request, context, agentToken)
    if (!reviewer) {
      context.sendJson(response, 403, { error: 'forbidden' })
      return
    }
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
