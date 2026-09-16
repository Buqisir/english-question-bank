import { bindClipboardButtons } from './clipboard.js'

const root = document.querySelector('#app')

const state = {
  user: null,
  actor: null,
  view: 'review',
  papers: [],
  paperId: null,
  detail: null,
  surface: 'screen',
  issueSurface: 'screen',
  pagination: null,
  paginationError: null,
  pdfEdition: 'natural',
  target: null,
  pendingScreenTargetId: null,
  ocrDocumentId: null,
  ocrPage: 1,
  ocrDraft: null,
  error: null,
}

const surfaceLabels = {
  screen: 'Screen',
  teaching: '教学解析',
  student_print: 'Student Print',
  teacher_print: 'Teacher Print',
  pdf: 'PDF',
  source: '源文件',
}

const stateLabels = {
  uploading: '上传中',
  awaiting_review: '待审核',
  changes_requested: '待修改',
  approved: '已认可',
  publishing: '上线中',
  published: '已上线',
  failed: '上线失败',
  superseded: '旧版本',
  open: '待处理',
  fixed_pending_review: '待验证',
  closed: '已关闭',
  dismissed: '已撤销',
}

const mediaConfirmationChecks = [
  ['text', '文字'],
  ['numbers', '数字'],
  ['units', '单位'],
  ['arrows', '箭头与方向'],
  ['legend', '图例'],
  ['colorAndLineStyle', '颜色与线型'],
  ['nodeCountAndOrder', '节点数量与顺序'],
  ['curvesIntersectionsAndScale', '曲线、交点与比例'],
  ['layoutIntent', '大小、位置与留白关系'],
  ['sourceAuthorization', '来源授权'],
  ['watermarkIntegrity', '未移除或改造来源水印'],
]

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function status(value, label = null) {
  return `<span class="status status--${escapeHtml(value)}">${escapeHtml(label || stateLabels[value] || value)}</span>`
}

function shortDigest(value) {
  const text = String(value || '')
  return text.length > 24 ? `${text.slice(0, 16)}…${text.slice(-8)}` : text
}

function copyButton(value, name, label = '复制') {
  return `<button class="copy-button" type="button" data-copy-text="${escapeHtml(value)}" data-copy-name="${escapeHtml(name)}" aria-label="复制${escapeHtml(name)}">${escapeHtml(label)}</button>`
}

function commandCopyHtml(command) {
  return `<div class="command-copy"><code>${escapeHtml(command)}</code>${copyButton(command, '口令', '复制口令')}</div>`
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
}

function formatDuration(value) {
  const seconds = Math.round(Number(value) || 0)
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

async function request(pathname, init) {
  const response = await fetch(pathname, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `请求失败（${response.status}）`)
  }
  return body
}

function actorApi() {
  return state.actor === 'owner' ? '/api/import-reviews' : '/api/import-agent-reviews'
}

async function loadPapers({ preserveSelection = true } = {}) {
  const result = await request(actorApi())
  state.papers = result.papers || []
  if (!preserveSelection || !state.papers.some((paper) => paper.paperId === state.paperId)) {
    state.paperId = state.papers[0]?.paperId || null
  }
  if (state.paperId) await loadDetail(state.paperId, false)
  else state.detail = null
  render()
}

async function loadDetail(paperId, shouldRender = true) {
  const previousRevisionId = state.detail?.latestRevisionId
  state.paperId = paperId
  state.target = null
  state.issueSurface = state.surface
  state.error = null
  state.pagination = null
  state.paginationError = null
  try {
    state.detail = await request(`${actorApi()}/papers/${encodeURIComponent(paperId)}`)
    if (
      state.detail.latest?.reviewKind === 'ocr'
      && (state.detail.latestRevisionId !== previousRevisionId || !state.ocrDraft)
    ) initializeOcrDraft()
    if (state.detail.latest?.reviewKind !== 'ocr') {
      state.ocrDocumentId = null
      state.ocrPage = 1
      state.ocrDraft = null
      if (state.detail.latestRevisionId && state.detail.latest?.state !== 'uploading') {
        try {
          state.pagination = await request(`/api/import-review-preview/revisions/${encodeURIComponent(state.detail.latestRevisionId)}/pagination`)
          if (state.detail.latestRevisionId !== previousRevisionId
            || (state.pdfEdition !== 'natural' && !state.pagination.editions.some(({ edition }) => edition === state.pdfEdition))) {
            state.pdfEdition = state.pagination.editions.at(-1)?.edition || 'natural'
          }
        } catch (error) {
          state.paginationError = error.message
          state.pdfEdition = 'natural'
        }
      }
    }
  } catch (error) {
    state.error = error.message
    state.detail = null
  }
  if (shouldRender) render()
}

function paperListHtml() {
  if (state.papers.length === 0) {
    return '<p class="empty-state">还没有待审 revision。Agent 提交第一版后会出现在这里。</p>'
  }
  return `<div class="paper-list">${state.papers.map((paper) => `
    <button
      type="button"
      class="paper-button"
      data-paper-id="${escapeHtml(paper.paperId)}"
      aria-current="${paper.paperId === state.paperId}"
    >
      <span class="paper-name">${escapeHtml(paper.paperName)}</span>
      <span class="paper-meta">${paper.reviewKind === 'ocr' ? 'OCR' : 'Candidate'} R${escapeHtml(paper.revisionNumber || '—')}${paper.reviewKind === 'ocr' ? ' · 原图识别核对' : ` · ${escapeHtml(paper.unresolvedCount)} 个未决`}</span>
      ${status(paper.state, paper.reviewKind === 'ocr' && paper.state === 'approved' ? 'OCR 已确认' : null)}
      ${paper.promotionState ? status(paper.promotionState) : ''}
    </button>
  `).join('')}</div>`
}

function revisionsHtml() {
  const revisions = state.detail?.revisions || []
  if (revisions.length === 0) return '<p class="empty-state">还没有 revision。</p>'
  return `<ul class="revision-list">${revisions.map((revision) => `
    <li class="revision-item">
      <div class="revision-line">
        <strong>${revision.reviewKind === 'ocr' ? 'OCR ' : ''}R${escapeHtml(revision.revisionNumber)}</strong>
        ${status(revision.state, revision.reviewKind === 'ocr' && revision.state === 'approved' ? 'OCR 已确认' : null)}
        <span class="timestamp">${escapeHtml(formatTime(revision.finalizedAt || revision.createdAt))}</span>
      </div>
      <div class="digest" title="${escapeHtml(revision.bundleDigest)}">${escapeHtml(shortDigest(revision.bundleDigest))}</div>
    </li>
  `).join('')}</ul>`
}

function structureHtml() {
  const structure = state.detail?.visibleStructure || []
  if (structure.length === 0) {
    return '<p class="empty-state">Agent 账号可在 Screen 中查看结构；详细结构随 revision 保存。</p>'
  }
  return `<ul class="structure-list">${structure.map((item) => {
    const identity = item.groupId || item.sectionId || item.partId || item.instructionId
    const kind = item.familyContractId || item.kind
    return `<li class="structure-item"><strong>${escapeHtml(identity)}</strong><span class="paper-meta">${escapeHtml(kind)}</span></li>`
  }).join('')}</ul>`
}

function sourceFiles() {
  return state.detail?.files || state.detail?.latest?.manifest?.files || []
}

function filesHtml() {
  const revisionId = state.detail?.latestRevisionId
  const files = sourceFiles()
  if (!revisionId || files.length === 0) return '<p class="empty-state">没有可读源文件。</p>'
  return `<div class="file-list">${files.map((file) => {
    const href = `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
      + `/files?path=${encodeURIComponent(file.path)}`
    return `<a class="file-link" href="${href}" target="_blank" rel="noreferrer">
      <span>${escapeHtml(file.path)}</span>
      <span class="file-role">${escapeHtml(file.role)} · ${escapeHtml(Math.ceil(file.byteLength / 1024))} KB</span>
    </a>`
  }).join('')}</div>`
}

function isOcrReview() {
  return state.detail?.latest?.reviewKind === 'ocr' && Boolean(state.detail?.ocrReview)
}

function orderedOcrObservations(page) {
  const observations = page.observations || []
  const ids = observations.map((observation) => observation.observationId)
  const byId = new Map(observations.map((observation) => [
    observation.observationId,
    observation,
  ]))
  const outgoing = new Map(ids.map((id) => [id, []]))
  const indegree = new Map(ids.map((id) => [id, 0]))
  for (const edge of page.readingOrderEdges || []) {
    if (!outgoing.has(edge.before) || !outgoing.has(edge.after) || edge.before === edge.after) {
      return observations
    }
    outgoing.get(edge.before).push(edge.after)
    indegree.set(edge.after, indegree.get(edge.after) + 1)
  }
  const ordered = []
  while (ordered.length < ids.length) {
    const available = ids.filter((id) => indegree.get(id) === 0)
    if (available.length !== 1) return observations
    const current = available[0]
    ordered.push(byId.get(current))
    indegree.set(current, -1)
    for (const target of outgoing.get(current)) {
      indegree.set(target, indegree.get(target) - 1)
    }
  }
  return ordered
}

function initializeOcrDraft() {
  const documents = state.detail?.ocrReview?.documents || []
  state.ocrDraft = {
    documents: documents.map((document) => ({
      documentId: document.documentId,
      pages: document.pages.map((page) => ({
        page: page.page,
        items: orderedOcrObservations(page).map((observation, index) => ({
          itemId: `${document.documentId}:page-${page.page}:item-${index + 1}`,
          observationIds: [observation.observationId],
          regionId: observation.regionId,
          region: observation.region,
          text: observation.text,
          confidence: observation.confidence,
          alternatives: observation.alternatives || [],
          classification: 'content',
          verified: false,
        })),
        visuals: page.regions
          .filter((region) => region.kind !== 'text')
          .map((region) => ({
            regionId: region.regionId,
            region: region.region,
            classification: '',
            verified: false,
          })),
      })),
    })),
  }
  state.ocrDocumentId = documents[0]?.documentId || null
  state.ocrPage = documents[0]?.pages?.[0]?.page || 1
}

function currentOcrDocument() {
  return state.detail?.ocrReview?.documents?.find((document) =>
    document.documentId === state.ocrDocumentId) || null
}

function currentOcrPage() {
  const source = currentOcrDocument()?.pages?.find((page) => page.page === state.ocrPage)
  const draft = state.ocrDraft?.documents?.find((document) =>
    document.documentId === state.ocrDocumentId)?.pages?.find((page) =>
    page.page === state.ocrPage)
  return source && draft ? { source, draft } : null
}

function ocrCompletion() {
  const pages = state.ocrDraft?.documents?.flatMap((document) => document.pages) || []
  const items = pages.flatMap((page) => page.items)
  const visuals = pages.flatMap((page) => page.visuals)
  const verified = items.filter((item) =>
    item.verified
    && ['content', 'furniture'].includes(item.classification)
    && (item.classification !== 'content' || item.text.trim())).length
    + visuals.filter((visual) =>
      visual.verified && visual.classification === 'furniture').length
  return {
    verified,
    total: items.length + visuals.length,
    ready: items.length > 0
      && verified === items.length + visuals.length,
  }
}

function ocrRegionStyle(region) {
  return `left:${Number(region.x) * 100}%;top:${Number(region.y) * 100}%;width:${Number(region.width) * 100}%;height:${Number(region.height) * 100}%`
}

function ocrReviewStageHtml() {
  const current = currentOcrPage()
  const documents = state.detail.ocrReview.documents
  if (!current) return '<main class="surface-stage"><div class="surface-empty"><h2>OCR 页不可用</h2><p class="boundary-note">页覆盖不完整，不能确认。</p></div></main>'
  const { source, draft } = current
  const revisionId = state.detail.latestRevisionId
  const sourceHref = `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
    + `/ocr/pages/${encodeURIComponent(state.ocrDocumentId)}/${source.page}`
  const editable = state.actor === 'owner' && state.detail.latest.state === 'awaiting_review'
  return `<main class="surface-stage ocr-stage" aria-label="OCR 原图核对">
    <div class="surface-toolbar ocr-toolbar">
      <div class="ocr-navigation">
        <div class="surface-tabs" role="tablist" aria-label="题卷或答案">
          ${documents.map((document) => `<button type="button" class="tab-button" data-ocr-document="${escapeHtml(document.documentId)}" role="tab" aria-selected="${document.documentId === state.ocrDocumentId}">${document.role === 'official_answers' ? '答案图' : '题卷图'}</button>`).join('')}
        </div>
        <div class="surface-tabs" role="tablist" aria-label="图片页码">
          ${currentOcrDocument().pages.map((page) => `<button type="button" class="tab-button" data-ocr-page="${page.page}" role="tab" aria-selected="${page.page === state.ocrPage}">第 ${page.page} 页</button>`).join('')}
        </div>
      </div>
      <span class="paper-meta">原图与 OCR 并排；不是整页截图发布</span>
    </div>
    <div class="ocr-workspace">
      <section class="ocr-source-pane" aria-label="不可变原图">
        <div class="ocr-pane-heading"><div><strong>不可变原图</strong><span class="paper-meta">${escapeHtml(state.ocrDocumentId)} · 第 ${source.page} 页</span></div><span class="digest" title="${escapeHtml(source.source.sha256)}">${escapeHtml(shortDigest(source.source.sha256))}</span></div>
        <div class="ocr-page-canvas">
          <img src="${escapeHtml(sourceHref)}" alt="${escapeHtml(state.ocrDocumentId)} 第 ${source.page} 页原图" />
          ${draft.items.map((item) => `<span class="ocr-region ocr-region--${escapeHtml(item.classification)}" style="${escapeHtml(ocrRegionStyle(item.region))}" title="${escapeHtml(item.observationIds.join(', '))}"></span>`).join('')}
          ${draft.visuals.map((visual) => `<span class="ocr-region ocr-region--visual" style="${escapeHtml(ocrRegionStyle(visual.region))}" title="${escapeHtml(visual.regionId)}"></span>`).join('')}
        </div>
      </section>
      <section class="ocr-items-pane" aria-label="OCR 文字与顺序">
        <div class="ocr-pane-heading"><div><strong>OCR 文字与源顺序</strong><span class="paper-meta">低置信与备选必须人工核对</span></div>${editable ? '<button class="button" type="button" data-ocr-verify-page>本页全部已核对</button>' : ''}</div>
        <div class="ocr-item-list">
          ${draft.items.map((item, index) => `<article class="ocr-item" data-ocr-item="${escapeHtml(item.itemId)}">
            <div class="ocr-item-head"><strong>顺序 ${index + 1}</strong><span class="${item.confidence < state.detail.ocrReview.confidenceThreshold || item.alternatives.length ? 'ocr-confidence ocr-confidence--review' : 'ocr-confidence'}">置信度 ${Math.round(item.confidence * 1000) / 10}%</span></div>
            <textarea data-ocr-text ${editable ? '' : 'disabled'} aria-label="顺序 ${index + 1} OCR 文字">${escapeHtml(item.text)}</textarea>
            ${item.alternatives.length ? `<p class="ocr-alternatives">备选：${escapeHtml(item.alternatives.map((alternative) => typeof alternative === 'string' ? alternative : JSON.stringify(alternative)).join('；'))}</p>` : ''}
            <div class="ocr-item-controls">
              <label><span>归类</span><select data-ocr-classification ${editable ? '' : 'disabled'}><option value="content" ${item.classification === 'content' ? 'selected' : ''}>正文</option><option value="furniture" ${item.classification === 'furniture' ? 'selected' : ''}>页眉页脚/杂项</option></select></label>
              <div class="inline-actions"><button class="text-button" type="button" data-ocr-move="up" ${!editable || index === 0 ? 'disabled' : ''}>上移</button><button class="text-button" type="button" data-ocr-move="down" ${!editable || index === draft.items.length - 1 ? 'disabled' : ''}>下移</button></div>
              <label class="ocr-verified"><input type="checkbox" data-ocr-verified ${item.verified ? 'checked' : ''} ${editable ? '' : 'disabled'} />已对照原图核对</label>
            </div>
          </article>`).join('')}
          ${draft.visuals.map((visual) => `<article class="ocr-item ocr-item--visual" data-ocr-visual="${escapeHtml(visual.regionId)}">
            <div class="ocr-item-head"><strong>非文字区域</strong><span class="digest">${escapeHtml(visual.regionId)}</span></div>
            <p class="boundary-note">只能诚实确认为页眉页脚/装饰。若它是表格、插图或题目内容，请选择“正文图形”，本次导入会保持阻断。</p>
            <div class="ocr-item-controls"><label><span>归类</span><select data-ocr-visual-classification ${editable ? '' : 'disabled'}><option value="" ${!visual.classification ? 'selected' : ''}>请选择</option><option value="furniture" ${visual.classification === 'furniture' ? 'selected' : ''}>页眉页脚/装饰</option><option value="unsupported_content" ${visual.classification === 'unsupported_content' ? 'selected' : ''}>正文图形（当前不支持）</option></select></label><label class="ocr-verified"><input type="checkbox" data-ocr-visual-verified ${visual.verified ? 'checked' : ''} ${editable ? '' : 'disabled'} />已对照原图核对</label></div>
          </article>`).join('')}
        </div>
      </section>
    </div>
  </main>`
}

function buildOcrConfirmation() {
  return {
    schemaVersion: 'nck1-ocr-source-confirmation-v1',
    paperId: state.detail.paperId,
    sourceSetDigest: state.detail.latest.manifest.sourceSetDigest,
    evidenceDigest: state.detail.latest.manifest.evidenceDigest,
    confirmed: true,
    documents: state.ocrDraft.documents.map((document) => ({
      documentId: document.documentId,
      pages: document.pages.map((page) => ({
        page: page.page,
        orderedItems: page.items
          .filter((item) => item.classification === 'content')
          .map(({ itemId, observationIds, text }) => ({
            itemId,
            observationIds,
            text,
          })),
        furnitureObservationIds: page.items
          .filter((item) => item.classification === 'furniture')
          .flatMap((item) => item.observationIds),
        visualClassifications: page.visuals
          .filter((visual) => visual.classification === 'furniture')
          .map((visual) => ({
            regionId: visual.regionId,
            classification: 'furniture',
          })),
      })),
    })),
  }
}

function ocrReviewRailHtml() {
  const completion = ocrCompletion()
  const latest = state.detail.latest
  const findings = state.detail.ocrReview.reviewFindings || []
  if (latest.state === 'approved' && latest.approval?.confirmation) {
    return `<aside class="right-rail" aria-label="OCR 确认结果"><section class="rail-section"><h2>OCR 已确认</h2><div class="approval-box">${status('approved', 'OCR 已确认')}<p class="muted">确认绑定原图、OCR engine output 与 observation digest。Agent 现在可拉取确认并生成真实 Screen revision。</p><p class="digest">${escapeHtml(latest.approval.confirmationId)}</p></div></section></aside>`
  }
  return `<aside class="right-rail" aria-label="OCR 核对进度">
    <section class="rail-section"><h2>核对进度</h2><p class="ocr-progress" id="ocr-progress">${completion.verified} / ${completion.total} 项已核对</p><p class="muted">每段文字、顺序和归类都必须明确确认。正文图形保持 fail closed。</p></section>
    <section class="rail-section"><h2>识别证据</h2><p class="paper-meta">${escapeHtml(state.detail.ocrReview.engine.name)} ${escapeHtml(state.detail.ocrReview.engine.version)} · 阈值 ${escapeHtml(state.detail.ocrReview.confidenceThreshold)}</p>${findings.length ? `<ul class="ocr-finding-list">${findings.map((finding) => `<li><strong>${escapeHtml(finding.code)}</strong><span>第 ${escapeHtml(finding.source?.page)} 页 · ${escapeHtml(finding.source?.documentId)}</span></li>`).join('')}</ul>` : '<p class="muted">结构证据完整；仍需人工逐项确认。</p>'}</section>
    ${state.actor === 'owner' ? `<section class="rail-section"><h2>完成 OCR 确认</h2><p class="boundary-note">这里只确认“原图读成什么、顺序怎样、哪些是杂项”。不会认可试卷，也不会发布。</p><button class="button button--primary" id="confirm-ocr" type="button" ${completion.ready ? '' : 'disabled'}>确认全部 OCR</button><p class="field-help" id="ocr-confirm-help">${completion.ready ? '全部项目已核对，可以提交精确确认。' : '先核对所有页面和项目。'}</p></section>` : '<section class="rail-section"><h2>Agent 边界</h2><p class="boundary-note">Agent 可查看进度，不能代替 Owner 确认 OCR。</p></section>'}
  </aside>`
}

function leftRailHtml() {
  const latest = state.detail?.latest
  return `
    <aside class="left-rail" aria-label="卷与 revision">
      <section class="rail-section">
        <h2>${state.actor === 'owner' ? '待审核' : '我的待办'}</h2>
        ${paperListHtml()}
      </section>
      ${state.detail ? `
        <section class="rail-section">
          <h3>${escapeHtml(state.detail.paperName)}</h3>
          <div class="copy-row"><code class="paper-meta">${escapeHtml(state.detail.paperId)}</code>${copyButton(state.detail.paperId, 'Paper ID')}</div>
          ${latest ? `<p class="digest" title="${escapeHtml(latest.bundleDigest)}">当前摘要 ${escapeHtml(shortDigest(latest.bundleDigest))}</p>` : ''}
          ${isOcrReview() ? '<p class="boundary-note">第一阶段：对照原图核准 OCR。确认后 Agent 才能生成真实 Screen revision。</p>' : ''}
          ${state.detail.rendererStale ? '<p class="boundary-note">Screen / Print 渲染器已经更新。Agent 需重新提交同一 Candidate，生成新的审核 revision。</p>' : ''}
        </section>
        <section class="rail-section"><h3>修订历史</h3>${revisionsHtml()}</section>
        ${isOcrReview() ? '' : `<details class="rail-section structure-section" ${window.matchMedia('(max-width: 760px)').matches ? '' : 'open'}>
          <summary><h3>卷面结构</h3><span class="paper-meta">${escapeHtml((state.detail.visibleStructure || []).length)} 项</span></summary>
          ${structureHtml()}
        </details>`}
        <section class="rail-section"><h3>源文件</h3>${filesHtml()}</section>
      ` : ''}
    </aside>
  `
}

function pdfEditionLabel(edition = state.pdfEdition) {
  return edition === 'friendly10' ? '10 页含听力学生卷'
    : edition === 'friendly8' ? '8 页无听力学生卷' : '教师 PDF（自然分页）'
}

function surfaceUrl() {
  const revisionId = state.detail?.latestRevisionId
  if (!revisionId) return null
  if (state.surface === 'screen') {
    return `/?view=paper-browse&paperId=${encodeURIComponent(state.detail.paperId)}`
      + `&reviewRevision=${encodeURIComponent(revisionId)}`
  }
  if (state.surface === 'teaching' && state.actor === 'owner') {
    return `/api/import-reviews/papers/${encodeURIComponent(state.detail.paperId)}`
      + `/revisions/${encodeURIComponent(revisionId)}/teaching`
  }
  if (state.surface === 'student_print') {
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/print?version=student`
  }
  if (state.surface === 'teacher_print') {
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/print?version=teacher`
  }
  if (state.surface === 'pdf') {
    const query = state.pdfEdition === 'natural' ? 'version=teacher'
      : `version=student&pageLayout=${encodeURIComponent(state.pdfEdition)}`
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/pdf?${query}`
  }
  return null
}

function surfaceStageHtml() {
  const url = surfaceUrl()
  return `
    <main class="surface-stage" aria-label="真实审核表面">
      <div class="surface-toolbar">
        <div class="surface-tabs" role="tablist" aria-label="审核表面">
          ${Object.entries(surfaceLabels).filter(([key]) => key !== 'teaching' || state.actor === 'owner').map(([key, label]) => `
            <button type="button" class="tab-button" data-surface="${key}" role="tab" aria-selected="${state.surface === key}">${label}</button>
          `).join('')}
        </div>
        ${state.surface === 'pdf' ? `
          <div class="pagination-controls">
            <label for="pdf-edition">交付版式</label>
            <select id="pdf-edition">
              ${(state.pagination?.editions || []).map(({ edition }) => `<option value="${escapeHtml(edition)}" ${state.pdfEdition === edition ? 'selected' : ''}>${escapeHtml(pdfEditionLabel(edition))}</option>`).join('')}
              <option value="natural" ${state.pdfEdition === 'natural' ? 'selected' : ''}>${pdfEditionLabel('natural')}</option>
            </select>
            <span class="paper-meta">${state.pdfEdition === 'natural' ? '非定页交付版' : state.pagination?.editions.find(({ edition }) => edition === state.pdfEdition)?.mode === 'explicit' ? '本卷分页方案' : '自动分页'}</span>
          </div>
        ` : `<span class="paper-meta">${state.surface === 'screen' ? '点击卷面内容可带回语义定位' : '由共享 Canonical Print seam 生成'}</span>`}
      </div>
      <div class="frame-shell">
        ${state.surface === 'pdf' && state.paginationError ? `<p class="pagination-error" role="alert">定页版式未加载：${escapeHtml(state.paginationError)}。请刷新重试，当前教师 PDF 不能代替定页 QA。</p>` : ''}
        ${url ? `
          <div class="frame-loading" id="frame-loading">正在打开 ${escapeHtml(surfaceLabels[state.surface])}…</div>
          <iframe
            class="review-frame is-loading"
            id="review-frame"
            title="${escapeHtml(surfaceLabels[state.surface])} 审核表面"
            src="${escapeHtml(url)}"
          ></iframe>
        ` : `
          <div class="surface-empty">
            <h2>源文件保持原样</h2>
            <p class="muted">从左栏打开原始 PDF / DOCX / Materialization；问题仍绑定当前 revision。</p>
          </div>
        `}
      </div>
    </main>
  `
}

function targetSummaryHtml() {
  if (!state.target) {
    return '<div class="target-summary" id="target-summary">在 Screen 点题目或段落，也可手填下面的语义 ID。</div>'
  }
  const values = [
    state.target.questionId && `题 ${state.target.questionId}`,
    state.target.groupId && `题组 ${state.target.groupId}`,
    state.target.blockId && `段 ${state.target.blockId}`,
    state.target.mediaId && `媒体 ${state.target.mediaId}`,
    state.target.contentNodeId && `内容节点 ${state.target.contentNodeId}`,
  ].filter(Boolean)
  return `<div class="target-summary has-target" id="target-summary">已定位：${escapeHtml(values.join(' · '))}</div>`
}

function selectedSourceVisual() {
  if (!state.target) return null
  const targetIds = [
    state.target.mediaId,
    state.target.contentNodeId,
    state.target.blockId,
    state.target.questionId,
    state.target.groupId,
  ].filter(Boolean)
  const visuals = state.detail?.sourceVisuals || []
  for (const targetId of targetIds) {
    const visual = visuals.find((candidate) => candidate.targetId === targetId)
    if (visual) return visual
  }
  return null
}

function sourceFileHref(visual) {
  const revisionId = state.detail?.latestRevisionId
  if (!revisionId || !visual?.path) return null
  return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
    + `/files?path=${encodeURIComponent(visual.path)}`
}

function sourceVisualHtml() {
  const visual = selectedSourceVisual()
  if (!state.target) {
    return '<p class="empty-state">在 Screen 点一个表格、图片或图标，这里会显示原卷对应局部。</p>'
  }
  if (!visual) {
    return '<p class="boundary-note">源区域未配对。不能猜测原卷位置；请 Agent 补充通用 locator 后再核对。</p>'
  }
  const wholeSourceHref = sourceFileHref(visual)
  const actions = `
    <div class="source-proof-actions">
      <button class="button" type="button" data-locate-screen="${escapeHtml(visual.targetId)}">定位 Screen</button>
      ${wholeSourceHref ? `<a class="button source-file-button" href="${escapeHtml(wholeSourceHref)}" target="_blank" rel="noreferrer">打开整份源文件</a>` : ''}
    </div>`
  if (visual.state === 'external_package_pointer') {
    return `<div class="source-proof source-proof--unlocated">
      <p class="boundary-note">此内容来自外部成品包的结构化 JSON 定位 ${escapeHtml(visual.pointer)}；没有原卷页码或 OCR 区域可展示，须由 Owner 核对外部转录。</p>
      ${actions}
    </div>`
  }
  if (visual.state !== 'paired' || !visual.region) {
    return `<div class="source-proof source-proof--unlocated">
      <p class="boundary-note">源区域未配对。已知它来自第 ${escapeHtml(visual.page)} 页，但不能把整页当作局部证据。</p>
      ${actions}
    </div>`
  }
  const revisionId = state.detail.latestRevisionId
  const cropHref = `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
    + `/source-visuals/${encodeURIComponent(visual.visualId)}`
  return `<figure class="source-proof">
    <img src="${escapeHtml(cropHref)}" alt="原卷第 ${escapeHtml(visual.page)} 页中与 ${escapeHtml(visual.targetId)} 对应的局部" />
    <figcaption>
      <strong>第 ${escapeHtml(visual.page)} 页 · ${escapeHtml(visual.disposition)}</strong>
      <span class="digest" title="${escapeHtml(visual.sourceDigest)}">${escapeHtml(shortDigest(visual.sourceDigest))}</span>
      <span class="paper-meta">${escapeHtml(visual.targetId)}</span>
      <span class="paper-meta">区域 ${escapeHtml(Object.values(visual.region).join(', '))}</span>
    </figcaption>
    ${actions}
    ${state.actor === 'owner' ? '<button class="button button--primary" type="button" data-use-source-proof>按这个原卷局部记录问题</button>' : ''}
  </figure>`
}

function sourceVisualSectionHtml() {
  return `<section class="rail-section source-proof-section" id="source-proof-section">
    <h2>原卷局部</h2>
    ${sourceVisualHtml()}
  </section>`
}

function selectedListeningReviewQuestion() {
  const questionId = state.target?.questionId
  if (!questionId) return null
  return (state.detail?.listeningReview?.questions || []).find((question) =>
    question.questionId === questionId) || null
}

function listeningReviewSectionHtml() {
  const review = state.detail?.listeningReview
  if (!review) return ''
  const question = selectedListeningReviewQuestion()
  if (!question) {
    return `<section class="rail-section listening-review-section" id="listening-review-section">
      <h2>听力核对</h2>
      <p class="empty-state">在 Screen 点一道听力题，这里会显示听力原文、官方答案和音频检查结果。</p>
    </section>`
  }
  const audio = review.audio
  if (audio.state === 'pending_external_playback_review') {
    const revisionId = state.detail.latestRevisionId
    const playbackHref = `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
      + `/files?path=${encodeURIComponent(audio.path)}`
    return `<section class="rail-section listening-review-section" id="listening-review-section">
      <h2>听力核对 · 第 ${escapeHtml(question.questionNo)} 题</h2>
      <div class="listening-review-answer"><span>官方答案</span><strong>${escapeHtml(question.officialAnswer)}</strong></div>
      <div class="listening-review-transcript">
        <h3>外部提交听力原文</h3>
        ${question.transcriptSegments.map((segment) => `<div class="listening-transcript-segment"><p>${escapeHtml(segment.text)}</p><span>覆盖第 ${escapeHtml(segment.questionNumbers.join('、'))} 题</span></div>`).join('')}
      </div>
      <div class="listening-audio-evidence">
        <div class="listening-evidence-statuses">
          ${status('pending', '待 Owner 播放并核对外部音频')}
        </div>
        <p class="paper-meta">真实 MP3 · 已测量 ${escapeHtml(formatDuration(audio.durationSeconds))}；未生成或伪造 ASR、比对及内容安全检查。</p>
        <audio class="listening-review-player" controls preload="metadata" src="${escapeHtml(playbackHref)}">浏览器无法播放此音频。</audio>
        <p class="digest" title="${escapeHtml(audio.playbackAudioSha256)}">音频 ${escapeHtml(shortDigest(audio.playbackAudioSha256))}</p>
      </div>
    </section>`
  }
  const basisLabel = audio.comparison.basis === 'authoritative_transcript'
    ? '官方听力原文'
    : '听力题目'
  const quick = audio.scope?.kind === 'first_dialogue'
  return `<section class="rail-section listening-review-section" id="listening-review-section">
    <h2>听力核对 · 第 ${escapeHtml(question.questionNo)} 题</h2>
    <div class="listening-review-answer"><span>官方答案</span><strong>${escapeHtml(question.officialAnswer)}</strong></div>
    <div class="listening-review-transcript">
      <h3>听力原文</h3>
      ${question.transcriptSegments.map((segment) => `<div class="listening-transcript-segment"><p>${escapeHtml(segment.text)}</p><span>覆盖第 ${escapeHtml(segment.questionNumbers.join('、'))} 题</span></div>`).join('')}
    </div>
    <div class="listening-audio-evidence">
      <div class="listening-evidence-statuses">
        ${status(audio.comparison.verdict === (quick ? 'partial_pass' : 'pass') ? 'approved' : 'failed', quick ? '首段快速匹配、后续内容未核对' : `与${basisLabel}比对通过`)}
        ${status(audio.contentSafety.verdict === 'pass' ? 'approved' : 'failed', quick ? '仅开头采样内容安全检查通过' : '内容安全检查通过')}
      </div>
      <p class="paper-meta">${quick ? `ASR 开头 ${escapeHtml(formatDuration(audio.scope.endSeconds))}` : 'ASR 全文'} · ${escapeHtml(audio.engine.name)} ${escapeHtml(audio.engine.model)} · 全文件 ${escapeHtml(formatDuration(audio.durationSeconds))}</p>
      <p class="digest" title="${escapeHtml(audio.playbackAudioSha256)}">音频 ${escapeHtml(shortDigest(audio.playbackAudioSha256))}</p>
      <p class="digest" title="${escapeHtml(audio.asrSha256)}">转写 ${escapeHtml(shortDigest(audio.asrSha256))}</p>
    </div>
  </section>`
}

function selectedMediaDerivation() {
  if (!state.target?.mediaId) return null
  return (state.detail?.mediaDerivations || []).find((derivation) =>
    derivation.mediaId === state.target.mediaId) || null
}

function mediaConfirmationFor(derivation) {
  return (state.detail?.mediaConfirmations || []).find((confirmation) =>
    confirmation.revisionId === state.detail.latestRevisionId
    && confirmation.mediaId === derivation.mediaId
    && confirmation.sourceSha256 === derivation.source.sha256
    && confirmation.candidateSha256 === derivation.candidate?.sha256
    && confirmation.presentationDigest === derivation.presentationDigest) || null
}

function mediaDerivationSectionHtml() {
  const derivation = selectedMediaDerivation()
  if (!state.target?.mediaId) {
    return `<section class="rail-section media-review-section" id="media-review-section">
      <h2>媒体核对</h2>
      <p class="empty-state">在 Screen 点一张图片，这里会显示原图、候选图和布局意图。</p>
    </section>`
  }
  if (!derivation) {
    return `<section class="rail-section media-review-section" id="media-review-section">
      <h2>媒体核对</h2>
      <p class="boundary-note">这个媒体没有完整的原图、布局和派生证据，不能确认或猜测。</p>
    </section>`
  }
  const revisionId = state.detail.latestRevisionId
  const base = `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}`
    + `/media/${encodeURIComponent(derivation.mediaId)}`
  const sourceHref = `${base}/source`
  const candidateHref = `${base}/candidate`
  const presentation = derivation.presentation
  const layout = `${({ left: '左对齐', center: '居中', right: '右对齐' })[presentation.alignment]}`
    + ` · 正文宽度 ${Math.round(presentation.widthRatio * 100)}%`
    + ` · 前后留白 ${presentation.spacingBefore}/${presentation.spacingAfter}`
  if (!derivation.candidate) {
    return `<section class="rail-section media-review-section" id="media-review-section">
      <h2>媒体核对</h2>
      <figure class="media-source-only"><img src="${escapeHtml(sourceHref)}" alt="不可变原始裁图" /><figcaption><strong>发布使用原始裁图</strong><span class="digest">${escapeHtml(shortDigest(derivation.source.sha256))}</span><span class="paper-meta">${escapeHtml(layout)}</span></figcaption></figure>
    </section>`
  }
  const confirmation = mediaConfirmationFor(derivation)
  const isAiCandidate = derivation.candidate.kind === 'ai_assisted_redraw'
  const awaitingConfirmation = isAiCandidate
    && derivation.publication.selection === 'source_crop'
    && !confirmation
  return `<section class="rail-section media-review-section" id="media-review-section">
    <h2>原图与候选图</h2>
    <p class="boundary-note">候选图不会自动替换原图。先逐项比对；来源授权与技术清晰化是两件事。</p>
    <div class="media-compare-grid">
      <figure><img src="${escapeHtml(sourceHref)}" alt="不可变原始裁图" /><figcaption><strong>原始裁图</strong><span class="digest">${escapeHtml(shortDigest(derivation.source.sha256))}</span></figcaption></figure>
      <figure><img src="${escapeHtml(candidateHref)}" alt="独立候选图" /><figcaption><strong>${isAiCandidate ? 'AI 辅助重绘候选' : '确定性增强候选'}</strong><span class="digest">${escapeHtml(shortDigest(derivation.candidate.sha256))}</span></figcaption></figure>
    </div>
    <div class="media-overlay" data-media-overlay>
      <img src="${escapeHtml(sourceHref)}" alt="原图叠加层" />
      <img class="media-overlay-candidate" data-media-compare-layer src="${escapeHtml(candidateHref)}" alt="候选图叠加层" />
    </div>
    <div class="media-compare-controls">
      <label><span>叠加透明度</span><input type="range" min="0" max="100" value="50" data-media-overlay-opacity /></label>
      <button class="button" type="button" data-media-toggle>切到候选图</button>
    </div>
    <p class="paper-meta">布局意图：${escapeHtml(layout)}</p>
    ${confirmation ? `<div class="approval-box">${status('approved', '这张候选图已确认')}<p class="digest">${escapeHtml(confirmation.confirmationId)}</p><p class="muted">Agent 可取回这张图的精确收据，提交下一 revision；这不等于认可整卷。</p></div>` : ''}
    ${awaitingConfirmation && state.actor === 'owner' ? `<form class="media-confirmation-form" id="media-confirmation-form">
      <p><strong>逐项确认一致或原图没有该要素</strong></p>
      <div class="media-checklist">${mediaConfirmationChecks.map(([key, label]) => `<label><input type="checkbox" name="${escapeHtml(key)}" />${escapeHtml(label)}</label>`).join('')}</div>
      <button class="button button--primary" type="submit" disabled>确认这张候选图</button>
      <p class="field-help">只确认这张图；不会认可整卷、发布或上线。</p>
    </form>` : ''}
    ${isAiCandidate && derivation.publication.selection === 'source_crop' && state.actor !== 'owner' && !confirmation ? '<p class="boundary-note">等待 Owner 逐项确认。Agent 不能代为确认。</p>' : ''}
  </section>`
}

function issueFormHtml() {
  if (state.actor !== 'owner' || !state.detail?.latest) return ''
  const visual = selectedSourceVisual()
  const sourcePage = state.issueSurface === 'source' ? visual?.page : null
  return `
    <section class="rail-section">
      <h2>记录问题</h2>
      <form class="issue-form" id="issue-form">
        ${targetSummaryHtml()}
        <div class="field-grid">
          <label class="field"><span>题组 ID</span><input name="groupId" value="${escapeHtml(state.target?.groupId || '')}" placeholder="group:…" /></label>
          <label class="field"><span>题目 ID</span><input name="questionId" value="${escapeHtml(state.target?.questionId || '')}" placeholder="question:…" /></label>
          <label class="field"><span>段落 ID</span><input name="blockId" value="${escapeHtml(state.target?.blockId || '')}" placeholder="block:…" /></label>
          <label class="field"><span>媒体 ID</span><input name="mediaId" value="${escapeHtml(state.target?.mediaId || '')}" placeholder="media:…" /></label>
          <label class="field"><span>内容节点 ID</span><input name="contentNodeId" value="${escapeHtml(state.target?.contentNodeId || '')}" placeholder="media-ref:…" /></label>
          <label class="field"><span>页码</span><input name="pageNumber" inputmode="numeric" value="${escapeHtml(sourcePage || '')}" placeholder="Print / PDF 可填" /></label>
        </div>
        <label class="field"><span>要 Agent 改什么</span><textarea name="message" required placeholder="说清发生了什么，以及正确结果应该是什么。"></textarea></label>
        <p class="field-help">问题会绑定 R${escapeHtml(state.detail.latest.revisionNumber)} · ${escapeHtml(state.issueSurface === 'pdf' ? pdfEditionLabel() : surfaceLabels[state.issueSurface])}，不会漂到别的 revision。</p>
        <button class="button button--primary" type="submit">记录这个问题</button>
      </form>
    </section>
  `
}

function issueMessages(issue) {
  return (state.detail?.issueMessages || []).filter((message) => message.issueId === issue.id)
}

function issueActionsHtml(issue) {
  if (state.actor !== 'owner') return ''
  if (issue.state === 'fixed_pending_review') {
    return `<div class="issue-actions">
      <button class="button button--primary" type="button" data-issue-action="close" data-issue-id="${escapeHtml(issue.id)}">验证通过</button>
      <button class="button" type="button" data-issue-action="reopen" data-issue-id="${escapeHtml(issue.id)}">仍有问题</button>
    </div>`
  }
  if (issue.state === 'open') {
    return `<div class="issue-actions"><button class="button" type="button" data-issue-action="dismiss" data-issue-id="${escapeHtml(issue.id)}">撤销这个问题</button></div>`
  }
  return `<div class="issue-actions"><button class="button" type="button" data-issue-action="reopen" data-issue-id="${escapeHtml(issue.id)}">重新打开</button></div>`
}

function sourceVisualForIssue(issue) {
  if (
    issue.surface !== 'source'
    || issue.revisionId !== state.detail?.latestRevisionId
    || !issue.rect
  ) return null
  const targetIds = [
    issue.mediaId,
    issue.contentNodeId,
    issue.blockId,
    issue.questionId,
    issue.groupId,
  ].filter(Boolean)
  return (state.detail?.sourceVisuals || []).find((visual) =>
    visual.state === 'paired'
    && targetIds.includes(visual.targetId)
    && visual.page === issue.pageNumber
    && ['x', 'y', 'width', 'height'].every((key) =>
      visual.region?.[key] === issue.rect[key])) || null
}

function issueHtml(issue) {
  const messages = issueMessages(issue)
  const replayVisual = sourceVisualForIssue(issue)
  const location = [
    issue.groupId,
    issue.questionId,
    issue.blockId,
    issue.mediaId,
    issue.contentNodeId,
    issue.pageNumber && `第 ${issue.pageNumber} 页`,
  ]
    .filter(Boolean)
    .join(' · ')
  return `<article class="issue ${['open', 'fixed_pending_review'].includes(issue.state) ? 'issue--active' : ''}">
    <div class="issue-head">
      <div class="issue-meta">
        ${status(issue.state)}
        <span class="paper-meta">${escapeHtml(issue.edition ? pdfEditionLabel(issue.edition) : surfaceLabels[issue.surface] || issue.surface)}</span>
        <span class="timestamp">${escapeHtml(formatTime(issue.createdAt))}</span>
      </div>
      <span class="digest">${escapeHtml(location || issue.id)}</span>
    </div>
    <p class="issue-message">${escapeHtml(issue.message)}</p>
    ${replayVisual ? `<button class="button" type="button" data-open-source-issue="${escapeHtml(issue.id)}">查看原卷定位</button>` : ''}
    ${messages.length ? `<div class="thread">${messages.map((message) => `
      <div class="thread-message thread-message--${escapeHtml(message.authorKind)}">
        <div class="thread-author"><strong>${escapeHtml(message.authorName)}</strong><span>${escapeHtml(formatTime(message.createdAt))}</span></div>
        <div>${escapeHtml(message.message)}</div>
      </div>
    `).join('')}</div>` : ''}
    ${issueActionsHtml(issue)}
    <form class="reply-form" data-reply-issue="${escapeHtml(issue.id)}">
      <label class="sr-only" for="reply-${escapeHtml(issue.id)}">回复这个问题</label>
      <input id="reply-${escapeHtml(issue.id)}" name="message" required placeholder="回复这条 QA 对话" />
      <button class="button" type="submit">发送回复</button>
    </form>
  </article>`
}

function issuesHtml() {
  const issues = state.detail?.issues || []
  if (issues.length === 0) {
    return `<p class="empty-state">还没有问题。${state.actor === 'owner' ? '检查完所有表面后，可直接认可当前 revision。' : 'Owner 留下反馈后会出现在这里。'}</p>`
  }
  const ordered = [...issues].sort((left, right) => {
    const weight = { open: 0, fixed_pending_review: 1, closed: 2, dismissed: 3 }
    return (weight[left.state] ?? 9) - (weight[right.state] ?? 9)
  })
  return `<div class="issue-list">${ordered.map(issueHtml).join('')}</div>`
}

function approvalHtml() {
  if (state.actor !== 'owner' || !state.detail?.latest) return `
    <section class="rail-section">
      <h2>Agent 边界</h2>
      <p class="boundary-note">这个账号可以读 QA、回复并提交新 revision；不能关闭问题、认可或部署。</p>
    </section>`
  const latest = state.detail.latest
  if (latest.approval && latest.state === 'approved' && !state.detail.rendererStale) {
    const externalListeningReview = latest.approval.externalListeningReview
    return `<section class="rail-section">
      <h2>已认可当前 revision</h2>
      <div class="approval-box">
        ${status('approved')}
        <p class="digest">${escapeHtml(latest.approval.approvalId)}</p>
        ${externalListeningReview ? `
          <p class="muted">外部听力真人播放核验已绑定：原文一致、全部段落/题目/答案对应、实际内容适合且安全。</p>
          <p class="digest" title="${escapeHtml(externalListeningReview.audio.sha256)}">核验音频 ${escapeHtml(shortDigest(externalListeningReview.audio.sha256))}</p>
        ` : ''}
        <p class="muted">认可绑定 R${escapeHtml(latest.revisionNumber)} 与当前 bundle digest。Agent 可拉取收据继续本地物化。</p>
        <p class="boundary-note">这里没有上线动作。之后仍需另行对 Agent 说“上线 ${escapeHtml(state.detail.paperId)}”。</p>
      </div>
    </section>`
  }
  const blocked = state.detail.unresolvedCount > 0
    || state.detail.rendererStale
    || !['awaiting_review', 'changes_requested'].includes(latest.state)
  const externalAudio = state.detail.listeningReview?.audio?.state
    === 'pending_external_playback_review'
    ? state.detail.listeningReview.audio
    : null
  const externalPlaybackHref = externalAudio
    ? `/api/import-review-preview/revisions/${encodeURIComponent(state.detail.latestRevisionId)}`
      + `/files?path=${encodeURIComponent(externalAudio.path)}`
    : null
  const externalListeningChecks = externalAudio ? `
      <fieldset class="external-listening-approval" ${blocked ? 'disabled' : ''}>
        <legend>外部听力 MP3 人工核验（必须逐项确认）</legend>
        <p class="muted">这些确认只记录当前 revision 的真人播放结论，不会生成 ASR、相似度或自动安全分数。</p>
        <audio class="listening-review-player" controls preload="metadata" src="${escapeHtml(externalPlaybackHref)}">浏览器无法播放此音频。</audio>
        <label class="approval-check">
          <input data-external-listening-check="playback" type="checkbox" />
          <span>我已完整播放当前 MP3，并确认实际声音与所提供的听力原文一致。</span>
        </label>
        <label class="approval-check">
          <input data-external-listening-check="cohesion" type="checkbox" />
          <span>我已核对全部 ${escapeHtml(externalAudio.transcriptSegmentCount)} 段原文、${escapeHtml(externalAudio.questionCount)} 道题及 ${escapeHtml(externalAudio.answerCount)} 个官方答案，确认它们与这一个音频完整对应并属于同一套听力。</span>
        </label>
        <label class="approval-check">
          <input data-external-listening-check="safety" type="checkbox" />
          <span>我已根据实际播放内容确认该音频适合教学使用，且不含不安全或不当内容。</span>
        </label>
        <p class="digest" title="${escapeHtml(externalAudio.playbackAudioSha256)}">核验音频 ${escapeHtml(shortDigest(externalAudio.playbackAudioSha256))}</p>
      </fieldset>` : ''
  return `<section class="rail-section">
    <h2>认可 revision</h2>
    <div class="approval-box">
      <p class="muted">当前 R${escapeHtml(latest.revisionNumber)} · ${escapeHtml(state.detail.unresolvedCount)} 个未决问题</p>
      <p class="digest">${escapeHtml(shortDigest(latest.bundleDigest))}</p>
      ${externalListeningChecks}
      <label class="approval-check">
        <input id="approval-check" type="checkbox" ${blocked ? 'disabled' : ''} />
        <span>我已检查 Screen、Student Print、Teacher Print 与 PDF，认可当前摘要对应的内容。</span>
      </label>
      <button class="button button--primary" id="approve-revision" type="button" disabled>认可这个 revision</button>
      ${blocked ? `<p class="field-help">${state.detail.rendererStale ? '渲染器已更新，请 Agent 先重新提交 Candidate。' : '先处理所有待处理和待验证问题。'}</p>` : ''}
      <p class="boundary-note">认可不是部署授权；后台永远不提供上线按钮。</p>
    </div>
  </section>`
}

function promotionHtml() {
  if (isOcrReview()) return ''
  const promotion = state.detail?.promotion
  const approval = state.detail?.latest?.approval
  if (!promotion && !approval) return ''
  if (approval && promotion?.approvalId !== approval.approvalId) {
    return `<section class="rail-section">
      <h2>上线审计</h2>
      <div class="approval-box">
        ${status('approved', '已认可，未上线')}
        <p class="muted">认可不会公开这套卷。Owner 如决定上线，需在当前 Agent 对话明确说：</p>
        ${commandCopyHtml(`上线 ${state.detail.paperId}`)}
        ${promotion ? `<p class="boundary-note">上一份上线回执：${escapeHtml(stateLabels[promotion.state] || promotion.state)} · ${escapeHtml(promotion.versionName || '未提交版本')}</p>` : ''}
        <p class="boundary-note">网页不持有上线权限，也没有上线按钮。</p>
      </div>
    </section>`
  }
  const command = promotion.state === 'failed'
    ? `重试上线 ${state.detail.paperId}`
    : `上线 ${state.detail.paperId}`
  const promotedRevision = state.detail.revisions?.find((revision) =>
    revision.id === promotion.revisionId)
  const version = promotion.versionName
    ? ` · ${promotion.versionName}`
    : ''
  const timestamp = promotion.publishedAt || promotion.failedAt || promotion.updatedAt
  return `<section class="rail-section">
    <h2>上线审计</h2>
    <div class="approval-box">
      ${status(promotion.state)}
      <p class="muted">R${escapeHtml(promotedRevision?.revisionNumber || '—')}${escapeHtml(version)} · 尝试 ${escapeHtml(promotion.attemptCount)}</p>
      <p class="digest" title="${escapeHtml(promotion.promotionId)}">${escapeHtml(promotion.promotionId)}</p>
      ${promotion.canonicalPublicationDigest ? `<p class="digest" title="${escapeHtml(promotion.canonicalPublicationDigest)}">Canonical ${escapeHtml(shortDigest(promotion.canonicalPublicationDigest))}</p>` : ''}
      ${promotion.analysisPublicationDigest ? `<p class="digest" title="${escapeHtml(promotion.analysisPublicationDigest)}">五份分析 ${escapeHtml(shortDigest(promotion.analysisPublicationDigest))}</p>` : ''}
      ${promotion.failureCode ? `<p class="boundary-note">${escapeHtml(promotion.failureCode)}：${escapeHtml(promotion.failureMessage)}</p>` : ''}
      <p class="timestamp">${escapeHtml(formatTime(timestamp))}</p>
      ${promotion.state === 'failed' ? `<p class="muted">确认生产状态后，如需重试，Owner 必须另说：</p>${commandCopyHtml(command)}` : ''}
      <p class="boundary-note">这是只读回执；网页不执行上线。</p>
    </div>
  </section>`
}

function rightRailHtml() {
  return `<aside class="right-rail" aria-label="QA 问题与认可">
    ${listeningReviewSectionHtml()}
    ${sourceVisualSectionHtml()}
    ${mediaDerivationSectionHtml()}
    ${issueFormHtml()}
    <section class="rail-section">
      <h2>${state.actor === 'owner' ? 'QA 对话' : 'Owner 反馈'}</h2>
      ${issuesHtml()}
    </section>
    ${promotionHtml()}
    ${approvalHtml()}
  </aside>`
}

function accessHtml(title, message, action = '') {
  return `<main class="access-state">
    <div class="boot-mark" aria-hidden="true">EQ</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${action}
  </main>`
}

function render() {
  if (!state.user) return
  root.innerHTML = `<div class="app-shell">
    <div class="sr-only" role="status" aria-live="polite" data-copy-feedback></div>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">EQ</div>
        <div><h1>英语题库</h1><p>${state.actor === 'owner' ? '后台工作台' : 'Agent 待办箱'}</p></div>
      </div>
      ${state.actor === 'owner' ? `<nav class="workspace-navigation" aria-label="后台工作台">
        <a href="/ops/">题源台账</a>
        <a href="/ops/?view=review" aria-current="page">导题审核</a>
      </nav>` : ''}
      <div class="account">
        <div class="account-copy"><strong>${escapeHtml(state.user.username)}</strong><span>${state.actor === 'owner' ? 'Owner 审核台' : 'Agent 待办箱'}</span></div>
        <button class="button" id="refresh" type="button">刷新</button>
        <button class="button" id="logout" type="button">退出</button>
      </div>
    </header>
    <div class="workspace">
      ${leftRailHtml()}
      ${state.detail ? (isOcrReview() ? ocrReviewStageHtml() : surfaceStageHtml()) : '<main class="surface-stage"><div class="surface-empty"><h2>还没有可审核内容</h2><p class="muted">Agent 提交 revision 后，从左侧打开。</p></div></main>'}
      ${state.detail ? (isOcrReview() ? ocrReviewRailHtml() : rightRailHtml()) : '<aside class="right-rail"></aside>'}
    </div>
    ${state.error ? `<div class="error-banner" role="alert">${escapeHtml(state.error)}。刷新后重试。</div>` : ''}
  </div>`
  bind()
}

function updateOcrCompletionUi() {
  const completion = ocrCompletion()
  const progress = document.querySelector('#ocr-progress')
  if (progress) progress.textContent = `${completion.verified} / ${completion.total} 项已核对`
  const button = document.querySelector('#confirm-ocr')
  if (button) button.disabled = !completion.ready
  const help = document.querySelector('#ocr-confirm-help')
  if (help) help.textContent = completion.ready
    ? '全部项目已核对，可以提交精确确认。'
    : '先核对所有页面和项目。'
}

function bindOcrReview() {
  document.querySelectorAll('[data-ocr-document]').forEach((button) => {
    button.addEventListener('click', () => {
      state.ocrDocumentId = button.dataset.ocrDocument
      state.ocrPage = currentOcrDocument()?.pages?.[0]?.page || 1
      render()
    })
  })
  document.querySelectorAll('[data-ocr-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.ocrPage = Number(button.dataset.ocrPage)
      render()
    })
  })
  const current = currentOcrPage()
  if (!current) return
  document.querySelectorAll('[data-ocr-item]').forEach((element) => {
    const item = current.draft.items.find((candidate) =>
      candidate.itemId === element.dataset.ocrItem)
    if (!item) return
    element.querySelector('[data-ocr-text]')?.addEventListener('input', (event) => {
      item.text = event.currentTarget.value
      updateOcrCompletionUi()
    })
    element.querySelector('[data-ocr-classification]')?.addEventListener('change', (event) => {
      item.classification = event.currentTarget.value
      updateOcrCompletionUi()
    })
    element.querySelector('[data-ocr-verified]')?.addEventListener('change', (event) => {
      item.verified = event.currentTarget.checked
      updateOcrCompletionUi()
    })
    element.querySelectorAll('[data-ocr-move]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = current.draft.items.indexOf(item)
        const targetIndex = button.dataset.ocrMove === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= current.draft.items.length) return
        const [moved] = current.draft.items.splice(index, 1)
        current.draft.items.splice(targetIndex, 0, moved)
        render()
      })
    })
  })
  document.querySelectorAll('[data-ocr-visual]').forEach((element) => {
    const visual = current.draft.visuals.find((candidate) =>
      candidate.regionId === element.dataset.ocrVisual)
    if (!visual) return
    element.querySelector('[data-ocr-visual-classification]')?.addEventListener('change', (event) => {
      visual.classification = event.currentTarget.value
      updateOcrCompletionUi()
    })
    element.querySelector('[data-ocr-visual-verified]')?.addEventListener('change', (event) => {
      visual.verified = event.currentTarget.checked
      updateOcrCompletionUi()
    })
  })
  document.querySelector('[data-ocr-verify-page]')?.addEventListener('click', () => {
    current.draft.items.forEach((item) => { item.verified = true })
    current.draft.visuals.forEach((visual) => {
      if (visual.classification) visual.verified = true
    })
    render()
  })
  document.querySelector('#confirm-ocr')?.addEventListener('click', async (event) => {
    if (!ocrCompletion().ready) return
    event.currentTarget.disabled = true
    try {
      await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}`
          + `/revisions/${encodeURIComponent(state.detail.latestRevisionId)}/confirm-ocr`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bundleDigest: state.detail.latest.bundleDigest,
            confirmation: buildOcrConfirmation(),
          }),
        },
      )
      await loadDetail(state.paperId)
    } catch (error) {
      state.error = error.message
      render()
    }
  })
}

function screenTarget(event) {
  const element = typeof event.target?.closest === 'function' ? event.target : null
  if (!element) return null
  const question = element.closest('[data-paper-question-id], [data-pi-question-id]')
  const group = element.closest('[data-paper-browse-anchor]')
  const block = element.closest('[data-canonical-block-id]')
  const media = element.closest('[data-canonical-media-id]')
  const contentNode = element.closest('[data-canonical-content-node-id]')
  const questionId = question?.getAttribute('data-paper-question-id')
    || question?.getAttribute('data-pi-question-id')
  const groupId = group?.getAttribute('data-paper-browse-anchor')
  const blockId = block?.getAttribute('data-canonical-block-id')
  const mediaId = media?.getAttribute('data-canonical-media-id')
  const contentNodeId = contentNode?.getAttribute('data-canonical-content-node-id')
  if (!questionId && !groupId && !blockId && !mediaId && !contentNodeId) return null
  return { questionId, groupId, blockId, mediaId, contentNodeId }
}

function applyScreenTarget(target) {
  state.target = target
  state.issueSurface = 'screen'
  const listeningSection = document.querySelector('#listening-review-section')
  if (listeningSection) listeningSection.outerHTML = listeningReviewSectionHtml()
  const sourceSection = document.querySelector('#source-proof-section')
  if (sourceSection) sourceSection.outerHTML = sourceVisualSectionHtml()
  const mediaSection = document.querySelector('#media-review-section')
  if (mediaSection) mediaSection.outerHTML = mediaDerivationSectionHtml()
  bindSourceProof()
  bindMediaReview()
  const summary = document.querySelector('#target-summary')
  const form = document.querySelector('#issue-form')
  if (!summary || !form) return
  const values = [
    target.questionId && `题 ${target.questionId}`,
    target.groupId && `题组 ${target.groupId}`,
    target.blockId && `段 ${target.blockId}`,
    target.mediaId && `媒体 ${target.mediaId}`,
    target.contentNodeId && `内容节点 ${target.contentNodeId}`,
  ].filter(Boolean)
  summary.classList.add('has-target')
  summary.textContent = `已定位：${values.join(' · ')}`
  form.elements.groupId.value = target.groupId || ''
  form.elements.questionId.value = target.questionId || ''
  form.elements.blockId.value = target.blockId || ''
  form.elements.mediaId.value = target.mediaId || ''
  form.elements.contentNodeId.value = target.contentNodeId || ''
  form.elements.pageNumber.value = ''
  form.querySelector('.field-help').textContent =
    `问题会绑定 R${state.detail.latest.revisionNumber} · Screen，不会漂到别的 revision。`
  if (selectedListeningReviewQuestion()) {
    document.querySelector('#listening-review-section')?.scrollIntoView({ block: 'nearest' })
  } else {
    form.elements.message.focus()
  }
}

function locateScreenTarget(targetId) {
  if (state.surface !== 'screen') {
    state.surface = 'screen'
    state.pendingScreenTargetId = targetId
    render()
    return false
  }
  const frame = document.querySelector('#review-frame')
  if (!frame) return false
  try {
    const escaped = frame.contentWindow.CSS.escape(targetId)
    const element = frame.contentDocument.querySelector(
      `[data-canonical-media-id="${escaped}"],`
      + `[data-canonical-content-node-id="${escaped}"],`
      + `[data-canonical-block-id="${escaped}"],`
      + `[data-paper-question-id="${escaped}"],`
      + `[data-paper-browse-anchor="${escaped}"]`,
    )
    if (!element) return false
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.setAttribute('tabindex', '-1')
    element.focus({ preventScroll: true })
    return true
  } catch {
    // Exact same-origin target lookup only; no nearest-element fallback.
    return false
  }
}

function bindSourceProof() {
  document.querySelector('[data-locate-screen]')?.addEventListener('click', (event) => {
    locateScreenTarget(event.currentTarget.dataset.locateScreen)
  })
  document.querySelector('[data-use-source-proof]')?.addEventListener('click', () => {
    const visual = selectedSourceVisual()
    if (!visual?.region) return
    state.issueSurface = 'source'
    const form = document.querySelector('#issue-form')
    if (!form) return
    form.elements.pageNumber.value = String(visual.page)
    form.querySelector('.field-help').textContent =
      `问题会绑定 R${state.detail.latest.revisionNumber} · 源文件 · 第 ${visual.page} 页的精确区域。`
    form.elements.message.focus()
  })
}

function bindMediaReview() {
  const layer = document.querySelector('[data-media-compare-layer]')
  const opacity = document.querySelector('[data-media-overlay-opacity]')
  const toggle = document.querySelector('[data-media-toggle]')
  opacity?.addEventListener('input', (event) => {
    if (layer) layer.style.opacity = String(Number(event.currentTarget.value) / 100)
  })
  toggle?.addEventListener('click', () => {
    if (!layer) return
    const showingCandidate = layer.style.opacity === '1'
    layer.style.opacity = showingCandidate ? '0' : '1'
    if (opacity) opacity.value = showingCandidate ? '0' : '100'
    toggle.textContent = showingCandidate ? '切到候选图' : '切回原图'
  })
  const form = document.querySelector('#media-confirmation-form')
  if (!form) return
  const submit = form.querySelector('button[type="submit"]')
  const updateReady = () => {
    submit.disabled = mediaConfirmationChecks.some(([key]) =>
      !form.elements[key]?.checked)
  }
  form.querySelectorAll('input[type="checkbox"]').forEach((input) =>
    input.addEventListener('change', updateReady))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const derivation = selectedMediaDerivation()
    if (!derivation?.candidate || submit.disabled) return
    submit.disabled = true
    try {
      await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}`
          + `/revisions/${encodeURIComponent(state.detail.latestRevisionId)}/confirm-media`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bundleDigest: state.detail.latest.bundleDigest,
            mediaId: derivation.mediaId,
            sourceSha256: derivation.source.sha256,
            candidateSha256: derivation.candidate.sha256,
            presentationDigest: derivation.presentationDigest,
            checklist: Object.fromEntries(
              mediaConfirmationChecks.map(([key]) => [key, true]),
            ),
          }),
        },
      )
      await loadDetail(state.paperId)
    } catch (error) {
      state.error = error.message
      render()
    }
  })
}

function bindFrame() {
  const frame = document.querySelector('#review-frame')
  const loading = document.querySelector('#frame-loading')
  if (!frame) return
  const attachScreenTargeting = () => {
    if (state.surface !== 'screen' || state.actor !== 'owner') return
    try {
      const frameDocument = frame.contentDocument
      if (!frameDocument || frameDocument.documentElement.dataset.importReviewTargeting) return
      frameDocument.documentElement.dataset.importReviewTargeting = 'true'
      frameDocument.addEventListener('click', (event) => {
        const target = screenTarget(event)
        if (!target) return
        // Observe semantic QA targets without cancelling PaperBrowse's real
        // lecture controls inside the Screen iframe.
        applyScreenTarget(target)
      }, true)
    } catch {
      // Production and local review are same-origin. If a local proxy is
      // misconfigured, manual semantic fields remain the fail-closed path.
    }
  }
  const frameLoaded = () => {
    frame.classList.remove('is-loading')
    if (loading) loading.hidden = true
    attachScreenTargeting()
    if (state.pendingScreenTargetId) {
      const targetId = state.pendingScreenTargetId
      if (locateScreenTarget(targetId)) state.pendingScreenTargetId = null
    }
  }
  frame.addEventListener('load', frameLoaded)
  if (frame.contentDocument?.readyState === 'complete') frameLoaded()
}

function bind() {
  bindClipboardButtons(root)
  document.querySelectorAll('[data-paper-id]').forEach((button) => {
    button.addEventListener('click', () => void loadDetail(button.dataset.paperId))
  })
  document.querySelectorAll('[data-surface]').forEach((button) => {
    button.addEventListener('click', () => {
      state.surface = button.dataset.surface
      state.issueSurface = state.surface === 'teaching' ? 'teacher_print' : state.surface
      render()
    })
  })
  document.querySelector('#refresh')?.addEventListener('click', () => void loadPapers())
  document.querySelector('#pdf-edition')?.addEventListener('change', (event) => {
    state.pdfEdition = event.target.value
    state.issueSurface = 'pdf'
    state.target = null
    render()
  })
  document.querySelector('#logout')?.addEventListener('click', async () => {
    await request('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  })
  if (isOcrReview()) {
    bindOcrReview()
    return
  }
  document.querySelector('#issue-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const page = String(data.get('pageNumber') || '').trim()
    const visual = selectedSourceVisual()
    try {
      state.detail = await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}/issues`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            revisionId: state.detail.latestRevisionId,
            surface: state.issueSurface,
            edition: state.issueSurface === 'pdf' && state.pdfEdition !== 'natural' ? state.pdfEdition : null,
            groupId: String(data.get('groupId') || '').trim() || null,
            questionId: String(data.get('questionId') || '').trim() || null,
            blockId: String(data.get('blockId') || '').trim() || null,
            mediaId: String(data.get('mediaId') || '').trim() || null,
            contentNodeId: String(data.get('contentNodeId') || '').trim() || null,
            pageNumber: page || null,
            rect: state.issueSurface === 'source' && visual?.region
              ? visual.region
              : null,
            message: String(data.get('message') || '').trim(),
          }),
        },
      )
      state.target = null
      render()
    } catch (error) {
      state.error = error.message
      render()
    }
  })
  document.querySelectorAll('[data-reply-issue]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const issueId = event.currentTarget.dataset.replyIssue
      const base = state.actor === 'owner' ? '/api/import-reviews' : '/api/import-agent-reviews'
      try {
        state.detail = await request(
          `${base}/papers/${encodeURIComponent(state.paperId)}/issues/${encodeURIComponent(issueId)}/messages`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: String(data.get('message') || '').trim() }),
          },
        )
        render()
      } catch (error) {
        state.error = error.message
        render()
      }
    })
  })
  document.querySelectorAll('[data-issue-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        state.detail = await request(
          `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}`
            + `/issues/${encodeURIComponent(button.dataset.issueId)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: button.dataset.issueAction }),
          },
        )
        render()
      } catch (error) {
        state.error = error.message
        render()
      }
    })
  })
  document.querySelectorAll('[data-open-source-issue]').forEach((button) => {
    button.addEventListener('click', () => {
      const issue = state.detail.issues.find((candidate) =>
        candidate.id === button.dataset.openSourceIssue)
      const visual = issue ? sourceVisualForIssue(issue) : null
      if (!issue || !visual) return
      state.target = {
        groupId: issue.groupId,
        questionId: issue.questionId,
        blockId: issue.blockId,
        mediaId: issue.mediaId,
        contentNodeId: issue.contentNodeId,
      }
      state.issueSurface = 'source'
      state.surface = 'screen'
      state.pendingScreenTargetId = visual.targetId
      render()
    })
  })
  const approvalCheck = document.querySelector('#approval-check')
  const approvalButton = document.querySelector('#approve-revision')
  const externalListeningChecks = [...document.querySelectorAll('[data-external-listening-check]')]
  const updateApprovalButton = () => {
    approvalButton.disabled = !approvalCheck.checked
      || externalListeningChecks.some((check) => !check.checked)
  }
  approvalCheck?.addEventListener('change', updateApprovalButton)
  externalListeningChecks.forEach((check) => check.addEventListener('change', updateApprovalButton))
  approvalButton?.addEventListener('click', async () => {
    approvalButton.disabled = true
    try {
      await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}`
          + `/revisions/${encodeURIComponent(state.detail.latestRevisionId)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bundleDigest: state.detail.latest.bundleDigest,
            ...(externalListeningChecks.length ? {
              externalListeningReview: {
                audioSha256: state.detail.listeningReview.audio.playbackAudioSha256,
                playbackMatchesSuppliedTranscript: true,
                allSegmentsQuestionsAnswersBelongTogether: true,
                actualAudioContentSuitableAndSafe: true,
              },
            } : {}),
          }),
        },
      )
      await loadDetail(state.paperId)
    } catch (error) {
      state.error = error.message
      render()
    }
  })
  bindSourceProof()
  bindMediaReview()
  bindFrame()
}

async function boot() {
  try {
    const response = await fetch('/api/auth/me')
    const me = await response.json().catch(() => ({}))
    if (response.status === 401 || !me.authRequired || !me.user) {
      root.innerHTML = accessHtml(
        '先登录官网账号',
        'Owner 或 import_agent 登录后，再回到 /ops/。',
        '<a class="button button--primary" href="/">去登录</a>',
      )
      return
    }
    if (!response.ok) throw new Error(me.error || `账号读取失败（${response.status}）`)
    state.user = me.user
    if (me.user.role === 'owner' && me.user.accountKind !== 'import_agent') {
      state.actor = 'owner'
      if (new URLSearchParams(window.location.search).get('view') !== 'review') {
        state.view = 'sources'
        const { mountSourceIntakes } = await import('./source-intakes.js')
        mountSourceIntakes({ root, user: state.user, request, accessHtml })
        return
      }
    } else if (me.user.accountKind === 'import_agent') {
      state.actor = 'agent'
    } else {
      root.innerHTML = accessHtml('这个账号不能进入导题审核', '普通老师账号只使用题库消费端。')
      return
    }
    await loadPapers({ preserveSelection: false })
  } catch (error) {
    root.innerHTML = accessHtml('导题审核暂时无法打开', `${error.message}。检查连接后刷新。`)
  }
}

void boot()

window.setInterval(() => {
  if (state.view !== 'review') return
  const active = document.activeElement
  if (document.hidden || active?.matches('input, textarea, select')) return
  void loadPapers()
}, 30_000)
