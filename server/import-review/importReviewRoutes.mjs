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
import { reviewUploadMetrics } from './reviewUploadMetrics.mjs'
import { rasterPdfRegion } from '../paper-canonical/pdfRegionRaster.mjs'
import { cropNck1SourceImage } from '../paper-import/nck1ImageSourceBundle.mjs'
import { sendListeningAudioFile } from '../paper-import/paperAssetStatic.mjs'
import { FIXED_PAGINATION_EDITIONS } from '../paper-import/paginationPlan.mjs'
import { frozenProductResult, PRODUCT_MANIFEST } from '../paper-import/frozenProducts.mjs'
import { SOURCE_REFERENCES_FILE } from '../paper-import/sourceReferences.mjs'
import { resolveReviewFile } from './revisionProjection.mjs'
import { PAPER_PDF_PRODUCTS, requirePaperPdfEdition } from '../../shared/paperPdfProducts.mjs'
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
    ...(error?.metrics ? { metrics: error.metrics } : {}),
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function requireSameOrigin(request, response, context, trustedPublicOrigin, csrf = 'scoped-publication') {
  const origin = String(request.headers.origin || '')
  const host = String(request.headers.host || '')
  const trusted = trustedPublicOrigin ? new URL(trustedPublicOrigin).origin : ''
  if (request.headers['x-eqb-csrf'] === csrf
    && origin && ((host && [`https://${host}`, `http://${host}`].includes(origin)) || origin === trusted)) return true
  context.sendJson(response, 403, { error: 'same_origin_required' })
  return false
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

function frozenProductForRevision(store, revisionId, edition) {
  requirePaperPdfEdition(edition)
  const { revision, filePath: manifestPath } = store.verifiedFileForRead(revisionId, PRODUCT_MANIFEST)
  if (revision.reviewKind !== 'candidate') {
    throw reviewError('IMPORT_REVIEW_CANDIDATE_REQUIRED', 'A finalized Candidate is required', 409)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const relativePath = `products/${edition}.pdf`
  const { file, filePath } = store.verifiedFileForRead(revisionId, relativePath)
  const expected = manifest.files.find(file => file.path === relativePath)
  if (expected?.sha256 !== file.sha256 || expected?.byteLength !== file.byteLength) {
    throw reviewError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', 'Frozen product differs from its revision', 409)
  }
  return { revision,
    sourceReferencesDigest: revision.manifest.files.find(file => file.path === SOURCE_REFERENCES_FILE)?.sha256 || '',
    rendered: frozenProductResult({
    manifest, bytes: { [relativePath]: readFileSync(filePath) },
  }, edition) }
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
  getBlobStore = null,
  agentToken,
  shipToken,
  buildPrintHtml,
  promotionService = null,
  scopedPublicationEnabled = false,
  trustedPublicOrigin = '',
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

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/publication-requests$/, route(async ({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) { context.sendJson(response, 401, { error: 'agent_auth_required' }); return }
    const input = await context.readJsonBody(request, { maxBytes: 4_096 })
    context.sendJson(response, 201, { request: store.registerPublicationRequest(
      decodeURIComponent(match[1]), input, actor,
    ) })
  })))

  routes.push(defineRoute('GET', /^\/api\/import-agent-reviews\/publication-requests\/([^/]+)$/, route(({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) { context.sendJson(response, 401, { error: 'agent_auth_required' }); return }
    context.sendJson(response, 200, { request: store.publicationRequest(match[1], actor) })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/publication-requests\/([^/]+)\/redeem$/, route(async ({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) { context.sendJson(response, 401, { error: 'agent_auth_required' }); return }
    if (!promotionService?.promoteScoped) throw reviewError('IMPORT_REVIEW_PROMOTION_UNAVAILABLE', 'Single-paper promotion service is unavailable', 503)
    const input = await context.readJsonBody(request, { maxBytes: 1_024 })
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(input?.requestSecret || ''))) {
      throw reviewError('IMPORT_REVIEW_PUBLICATION_SECRET_INVALID', 'Publication capability is invalid', 400)
    }
    const result = await promotionService.promoteScoped(
      decodeURIComponent(match[1]), match[2], sha256(String(input?.requestSecret || '')), actor,
    )
    context.sendJson(response, result.status === 'published' ? 201 : 200, result)
  })))

  routes.push(defineRoute('GET', /^\/api\/import-reviews\/publication-requests\/([^/]+)\/confirmation$/, route(({ response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    if (!requireOwner(response, context)) return
    const request = store.publicationRequest(match[1])
    const expired = Date.parse(request.expiresAt) <= Date.now()
    const disabled = expired || request.state !== 'pending'
    const preview = `/?view=paper-browse&paperId=${encodeURIComponent(request.paperId)}&reviewRevision=${encodeURIComponent(request.revisionId)}`
    sendHtml(response, `<!doctype html><html lang="zh-CN"><head>
<meta name="viewport" content="width=device-width,initial-scale=1"><title>确认试卷与发布</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#F3F6F0;color:#191D18;font:14px/1.55 Inter,'PingFang SC',system-ui,sans-serif}.page{max-width:680px;margin:0 auto;padding:64px 24px 80px}.eyebrow{font-size:12px;color:#60665C}.sheet{margin-top:16px;padding:32px;background:#FAFCF8;border:1px solid #D5DACF;border-radius:12px}h1{font-size:24px;line-height:1.25;margin:8px 0}a{color:#191D18;text-underline-offset:3px}.steps{display:grid;gap:24px;margin-top:32px}.step{padding-top:24px;border-top:1px solid #E3E8DF}.step h2{font-size:16px;margin:0 0 8px}.muted{color:#60665C}button{font:inherit;font-weight:600;padding:9px 16px;border:1px solid #191D18;border-radius:8px;background:#191D18;color:#FAFCF8}button:disabled{border-color:#D5DACF;background:#E5EAE1;color:#60665C}details{margin-top:28px;color:#60665C}code{font-size:12px;overflow-wrap:anywhere}.state{margin-top:20px}#revoke{background:transparent;color:#60665C;border-color:#D5DACF}@media(max-width:560px){.page{padding:24px 16px}.sheet{padding:24px 20px}}</style>
</head><body><main class="page"><div class="eyebrow">单卷确认</div><section class="sheet">
<h1>${escapeHtml(request.paperName || request.paperId)}</h1>
<p>R${escapeHtml(request.revisionNumber || request.revisionId)} · <a href="${escapeHtml(preview)}" target="_blank" rel="noopener">查看这个精确预览</a></p>
<p class="muted">查看不会写入。版式认可与发布委托是两项独立确认。</p>
<div class="steps"><section class="step"><h2>1. 认可版式</h2><p>确认网页预览与 PDF 中的这一版布局。</p>
<button id="approve" ${request.approvalId || disabled ? 'disabled' : ''}>认可这个版式</button></section>
<section class="step"><h2>2. 委托发布</h2><p>另行允许导题 Agent 仅发布上面这一份精确版本。</p>
<button id="grant" ${!request.approvalId || disabled ? 'disabled' : ''}>授予这一次发布权限</button></section></div>
<p class="state" id="result" role="status">${request.state === 'consumed' ? `权限已使用。发布状态：${escapeHtml(request.promotion?.state || '待核实')}。` : request.state === 'revoked' ? '权限已撤销。' : expired ? '请求已过期，不能再确认。' : request.state === 'granted' ? '发布权限已授予，等待 Agent 兑换。' : request.approvalId ? '版式已认可，等待单独的发布委托。' : '等待确认。'}</p>
<button id="revoke" ${['pending', 'granted'].includes(request.state) ? '' : 'disabled hidden'}>撤销这次请求</button>
<details><summary>技术绑定</summary><p><code>${escapeHtml(request.paperId)} · ${escapeHtml(request.revisionId)} · ${escapeHtml(request.bundleDigest)} · ${escapeHtml(request.rendererBuildId)}</code></p></details>
</section></main><script>
const result=document.querySelector('#result');
async function act(kind){
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const r=await fetch('/api/import-reviews/publication-requests/${encodeURIComponent(request.requestId)}/'+kind,{method:'POST',headers:{'content-type':'application/json','x-eqb-csrf':'scoped-publication'},body:'{}'});
    const v=await r.json();if(!r.ok)throw new Error(v.error||'确认失败');
    window.location.reload();
  }catch(e){result.textContent=e.message+'。请刷新页面核实状态，不要重复提交。'}
}
for(const kind of ['approve','grant','revoke'])document.querySelector('#'+kind).onclick=()=>act(kind);
</script></body></html>`)
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/publication-requests\/([^/]+)\/approve$/, route(async ({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    if (!requireOwner(response, context) || !requireSameOrigin(request, response, context, trustedPublicOrigin)) return
    const pending = store.publicationRequest(match[1])
    const approval = store.approveRevision(pending.paperId, pending.revisionId,
      { bundleDigest: pending.bundleDigest, approvalScope: 'layout_only' }, context.session.username, pending.requestId)
    context.sendJson(response, 200, { approval })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/publication-requests\/([^/]+)\/grant$/, route(({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    if (!requireOwner(response, context) || !requireSameOrigin(request, response, context, trustedPublicOrigin)) return
    context.sendJson(response, 200, { request: store.grantPublicationRequest(match[1], context.session.username) })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/publication-requests\/([^/]+)\/revoke$/, route(({ request, response, context, match }) => {
    if (!scopedPublicationEnabled) throw reviewError('IMPORT_REVIEW_SCOPED_PUBLICATION_DISABLED', 'Scoped publication is disabled', 404)
    if (!requireOwner(response, context) || !requireSameOrigin(request, response, context, trustedPublicOrigin)) return
    context.sendJson(response, 200, { request: store.revokePublicationRequest(match[1], context.session.username) })
  })))

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

  routes.push(defineRoute('PUT', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/discussion-thread$/, route(async ({
    request, response, context, match,
  }) => {
    if (!agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 1000 })
    context.sendJson(response, 200, store.linkDiscussionThread(decodeURIComponent(match[1]), input))
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/revisions$/, route(async ({
    request,
    response,
    context,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
    context.sendJson(response, 201, store.createRevision(input, { blobStore: getBlobStore?.(), actor }))
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
    const timer = reviewUploadMetrics('put', { revisionId, path: relativePath },
      ['status', 'receive', 'adoption', 'installationAndMark'])
    let upload
    try {
      upload = store.beginFileUpload(revisionId, relativePath)
      if (upload.file.uploadedAt && existsSync(upload.destination)) {
        context.sendJson(response, 200, store.uploadStatus(revisionId))
        timer.finish()
        return
      }
      const largeAsset = /^(audio\/|image\/|application\/pdf$)/.test(upload.file.mediaType)
      const blobStore = largeAsset ? getBlobStore?.() : null
      timer.phase('receive')
      const received = await receiveVerifiedUpload(request, upload.destination, upload.file, {
        validateTemporaryFile: async (temporary, expected) => {
          if (blobStore?.adoptLocalFile) {
            timer.phase('adoption')
            await blobStore.adoptLocalFile(temporary, expected)
          }
          timer.phase('installationAndMark')
        },
      })
      const status = store.completeFileUpload(revisionId, relativePath, received)
      timer.finish()
      context.sendJson(response, 200, status)
    } catch (error) {
      timer.finish(error)
      throw error
    } finally { upload?.release() }
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
    const metrics = {}
    const revision = store.finalizeRevision(match[1], { metrics })
    context.sendJson(response, 200, { revision, metrics })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-agent-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/proofread-ocr$/, route(async ({
    request, response, context, match,
  }) => {
    const actor = agentIdentity(request, context, agentToken)
    if (!actor) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const input = await context.readJsonBody(request, { maxBytes: 5_000_000 })
    context.sendJson(response, 200, { receipt: store.confirmOcrRevision(
      decodeURIComponent(match[1]), match[2], input, actor, { reviewerKind: 'import_agent' },
    ) })
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
      || !['approved', 'superseded'].includes(revision.state)
      || !revision.finalizedAt
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

  routes.push(defineRoute('GET', /^\/api\/import-reviews\/papers\/([^/]+)\/review-state$/, route(({
    response, context, match,
  }) => {
    if (!requireOwner(response, context)) return
    const detail = store.paperDetail(decodeURIComponent(match[1]), { includeProjection: false })
    context.sendJson(response, 200, {
      paperId: detail.paperId, latestRevisionId: detail.latestRevisionId,
      issues: detail.issues, discussionThreadId: detail.discussionThreadId,
    })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/revisions\/([^/]+)\/publish$/, route(async ({
    request, response, context, match,
  }) => {
    if (!requireOwner(response, context)
      || !requireSameOrigin(request, response, context, trustedPublicOrigin, 'owner-review')) return
    if (!promotionService?.promoteOwner) {
      throw reviewError('IMPORT_REVIEW_PROMOTION_UNAVAILABLE', '发布服务暂不可用。', 503)
    }
    const input = await context.readJsonBody(request, { maxBytes: 2_048 })
    const result = await promotionService.promoteOwner(
      decodeURIComponent(match[1]), match[2], input, context.session.username,
    )
    context.sendJson(response, result.status === 'publishing' ? 202 : result.status === 'failed' ? 409 : 200, {
      status: result.status, promotion: result.promotion,
      ...(result.status === 'failed' ? { error: '发布失败，请在 Amp 核实原因；网页不会自动重试。' } : {}),
    })
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

  routes.push(defineRoute('GET', /^\/api\/import-reviews\/papers\/([^/]+)\/product-review$/, route(({
    response, context, match, url,
  }) => {
    if (!requireOwner(response, context)) return
    const { paperId, latest, discussionThreadId } = store.paperDetail(
      decodeURIComponent(match[1]), { includeProjection: false },
    )
    const published = url.searchParams.has('publicationDigest') ? store.publishedReview(paperId, {
      publicationDigest: url.searchParams.get('publicationDigest'),
      sourceAssetVersion: Number(url.searchParams.get('sourceAssetVersion')),
    }) : null
    context.sendJson(response, 200, { paperId, latest: latest ? { id: latest.id } : null, discussionThreadId, published })
  })))

  routes.push(defineRoute('POST', /^\/api\/import-reviews\/papers\/([^/]+)\/issues$/, route(async ({
    request,
    response,
    context,
    match,
  }) => {
    if (!requireOwner(response, context)) return
    const input = await context.readJsonBody(request, { maxBytes: 20_000 })
    if (input.surface === 'paper'
      && !requireSameOrigin(request, response, context, trustedPublicOrigin, 'owner-review')) return
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
    if (input.revisionId !== undefined
      && !requireSameOrigin(request, response, context, trustedPublicOrigin, 'owner-review')) return
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
    const { preview } = store.productPreviewForRevision(match[1])
    context.sendJson(response, 200, preview.consumption)
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
    const { preview } = store.productPreviewForRevision(match[1])
    if (match[2] === 'paper-asset.json') {
      context.sendJson(response, 200, preview.paperAsset)
      return
    }
    const sidecarMatch = /^analyses\/([^/]+\.json)$/.exec(match[2])
    const sidecar = sidecarMatch
      ? preview.analysisSidecars?.[sidecarMatch[1]]
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
    if (url.searchParams.has('edition')) {
      if (url.searchParams.has('version') || url.searchParams.has('pageLayout')) {
        throw reviewError('IMPORT_REVIEW_EDITION_INVALID', 'edition 不与旧 version/pageLayout 混用', 400)
      }
      const { rendered } = frozenProductForRevision(store, match[1], url.searchParams.get('edition'))
      sendHtml(response, rendered.paginatedHtml)
      return
    }
    const { projection } = candidateProjectionForRevision(store, match[1])
    const pageLayout = url.searchParams.get('pageLayout') || 'natural'
    if (pageLayout === 'natural') {
      sendHtml(response, reviewPrintHtml(projection, url.searchParams.get('version'), buildPrintHtml))
      return
    }
    if (!FIXED_PAGINATION_EDITIONS.includes(pageLayout) || url.searchParams.get('version') !== 'student') {
      throw reviewError('IMPORT_REVIEW_PAGE_LAYOUT_INVALID', 'Fixed editions require a supported student page layout', 400)
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
    if (url.searchParams.has('edition')) {
      if (url.searchParams.has('version') || url.searchParams.has('pageLayout')) {
        throw reviewError('IMPORT_REVIEW_EDITION_INVALID', 'edition 不与旧 version/pageLayout 混用', 400)
      }
      const edition = requirePaperPdfEdition(url.searchParams.get('edition'))
      const { revision, sourceReferencesDigest, rendered } = frozenProductForRevision(store, match[1], edition)
      const title = revision.manifest.paperName.replace(/[\\/:*?"<>|]/g, '-')
      sendBinary(response, rendered.pdfBytes, 'application/pdf', `${title}-${PAPER_PDF_PRODUCTS[edition]}.pdf`, 'inline', {
        'x-eqb-pagination-edition': edition,
        'x-eqb-pagination-mode': rendered.mode,
        'x-eqb-pagination-pages': String(rendered.pageCount),
        'x-eqb-source-references-digest': edition === 'answerOnly' ? sourceReferencesDigest : '',
      })
      return
    }
    const { projection } = candidateProjectionForRevision(store, match[1])
    const version = url.searchParams.get('version')
    const pageLayout = url.searchParams.get('pageLayout') || 'natural'
    if (pageLayout !== 'natural') {
      if (!FIXED_PAGINATION_EDITIONS.includes(pageLayout) || version !== 'student') {
        throw reviewError('IMPORT_REVIEW_PAGE_LAYOUT_INVALID', 'Fixed editions require a supported student page layout', 400)
      }
      const rendered = await renderReviewFixedEdition(projection, pageLayout, buildPrintHtml)
      const fileName = `${projection.paperId}-${pageLayout}${rendered.fontSizePt ? `-${rendered.fontSizePt}pt-${rendered.pageCount}页` : pageLayout.startsWith('long') ? `-${rendered.pageCount}页` : ''}.pdf`
      sendBinary(response, rendered.pdfBytes, 'application/pdf', fileName, 'inline', {
        'x-eqb-pagination-edition': pageLayout,
        'x-eqb-pagination-mode': rendered.mode,
        'x-eqb-pagination-pages': String(rendered.pageCount),
        ...(rendered.fontSizePt ? { 'x-paper-font-size-pt': String(rendered.fontSizePt) } : {}),
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

  routes.push(defineRoute('GET', /^\/api\/(?:import-agent-reviews|import-review-preview)\/revisions\/([^/]+)\/files$/, route(({
    request,
    response,
    url,
    context,
    match,
  }) => {
    // The Agent namespace passes the session gate, so authenticate it here.
    // Owner previews retain their existing cookie gate and reviewer policy.
    if (url.pathname.startsWith('/api/import-agent-reviews/')
      && !agentIdentity(request, context, agentToken)) {
      context.sendJson(response, 401, { error: 'agent_auth_required' })
      return
    }
    const reviewer = context.session?.role === 'owner'
      || context.session?.accountKind === 'import_agent'
      || agentIdentity(request, context, agentToken)
    if (!reviewer) {
      context.sendJson(response, 403, { error: 'forbidden' })
      return
    }
    const relativePath = url.searchParams.get('path') || ''
    const { file, filePath } = store.verifiedFileForRead(match[1], relativePath)
    if (file.role === 'listening_audio_playback' && file.mediaType === 'audio/mpeg') {
      sendListeningAudioFile(request, response, filePath, { cacheControl: 'private, no-store' })
      return
    }
    sendBinary(response, readFileSync(filePath), file.mediaType, path.basename(file.path))
  })))

  return routes
}
