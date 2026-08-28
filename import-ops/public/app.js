const root = document.querySelector('#app')

const state = {
  user: null,
  actor: null,
  papers: [],
  paperId: null,
  detail: null,
  surface: 'screen',
  target: null,
  error: null,
}

const surfaceLabels = {
  screen: 'Screen',
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
  superseded: '旧版本',
  open: '待处理',
  fixed_pending_review: '待验证',
  closed: '已关闭',
  dismissed: '已撤销',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function status(value) {
  return `<span class="status status--${escapeHtml(value)}">${escapeHtml(stateLabels[value] || value)}</span>`
}

function shortDigest(value) {
  const text = String(value || '')
  return text.length > 24 ? `${text.slice(0, 16)}…${text.slice(-8)}` : text
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
  state.paperId = paperId
  state.target = null
  state.error = null
  try {
    state.detail = await request(`${actorApi()}/papers/${encodeURIComponent(paperId)}`)
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
      <span class="paper-meta">R${escapeHtml(paper.revisionNumber || '—')} · ${escapeHtml(paper.unresolvedCount)} 个未决</span>
      ${status(paper.state)}
    </button>
  `).join('')}</div>`
}

function revisionsHtml() {
  const revisions = state.detail?.revisions || []
  if (revisions.length === 0) return '<p class="empty-state">还没有 revision。</p>'
  return `<ul class="revision-list">${revisions.map((revision) => `
    <li class="revision-item">
      <div class="revision-line">
        <strong>R${escapeHtml(revision.revisionNumber)}</strong>
        ${status(revision.state)}
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
          <p class="paper-meta">${escapeHtml(state.detail.paperId)}</p>
          ${latest ? `<p class="digest" title="${escapeHtml(latest.bundleDigest)}">当前摘要 ${escapeHtml(shortDigest(latest.bundleDigest))}</p>` : ''}
          ${state.detail.rendererStale ? '<p class="boundary-note">Screen / Print 渲染器已经更新。Agent 需重新提交同一 Candidate，生成新的审核 revision。</p>' : ''}
        </section>
        <section class="rail-section"><h3>修订历史</h3>${revisionsHtml()}</section>
        <details class="rail-section structure-section" ${window.matchMedia('(max-width: 760px)').matches ? '' : 'open'}>
          <summary><h3>卷面结构</h3><span class="paper-meta">${escapeHtml((state.detail.visibleStructure || []).length)} 项</span></summary>
          ${structureHtml()}
        </details>
        <section class="rail-section"><h3>源文件</h3>${filesHtml()}</section>
      ` : ''}
    </aside>
  `
}

function surfaceUrl() {
  const revisionId = state.detail?.latestRevisionId
  if (!revisionId) return null
  if (state.surface === 'screen') {
    return `/?view=paper-browse&paperId=${encodeURIComponent(state.detail.paperId)}`
      + `&reviewRevision=${encodeURIComponent(revisionId)}`
  }
  if (state.surface === 'student_print') {
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/print?version=student`
  }
  if (state.surface === 'teacher_print') {
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/print?version=teacher`
  }
  if (state.surface === 'pdf') {
    return `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/pdf?version=teacher`
  }
  return null
}

function surfaceStageHtml() {
  const url = surfaceUrl()
  return `
    <main class="surface-stage" aria-label="真实审核表面">
      <div class="surface-toolbar">
        <div class="surface-tabs" role="tablist" aria-label="审核表面">
          ${Object.entries(surfaceLabels).map(([key, label]) => `
            <button type="button" class="tab-button" data-surface="${key}" role="tab" aria-selected="${state.surface === key}">${label}</button>
          `).join('')}
        </div>
        <span class="paper-meta">${state.surface === 'screen' ? '点击卷面内容可带回语义定位' : '由共享 Canonical Print seam 生成'}</span>
      </div>
      <div class="frame-shell">
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
  ].filter(Boolean)
  return `<div class="target-summary has-target" id="target-summary">已定位：${escapeHtml(values.join(' · '))}</div>`
}

function issueFormHtml() {
  if (state.actor !== 'owner' || !state.detail?.latest) return ''
  return `
    <section class="rail-section">
      <h2>记录问题</h2>
      <form class="issue-form" id="issue-form">
        ${targetSummaryHtml()}
        <div class="field-grid">
          <label class="field"><span>题组 ID</span><input name="groupId" value="${escapeHtml(state.target?.groupId || '')}" placeholder="group:…" /></label>
          <label class="field"><span>题目 ID</span><input name="questionId" value="${escapeHtml(state.target?.questionId || '')}" placeholder="question:…" /></label>
          <label class="field"><span>段落 ID</span><input name="blockId" value="${escapeHtml(state.target?.blockId || '')}" placeholder="block:…" /></label>
          <label class="field"><span>页码</span><input name="pageNumber" inputmode="numeric" placeholder="Print / PDF 可填" /></label>
        </div>
        <label class="field"><span>要 Agent 改什么</span><textarea name="message" required placeholder="说清发生了什么，以及正确结果应该是什么。"></textarea></label>
        <p class="field-help">问题会绑定 R${escapeHtml(state.detail.latest.revisionNumber)} · ${escapeHtml(surfaceLabels[state.surface])}，不会漂到别的 revision。</p>
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

function issueHtml(issue) {
  const messages = issueMessages(issue)
  const location = [issue.groupId, issue.questionId, issue.blockId, issue.pageNumber && `第 ${issue.pageNumber} 页`]
    .filter(Boolean)
    .join(' · ')
  return `<article class="issue ${['open', 'fixed_pending_review'].includes(issue.state) ? 'issue--active' : ''}">
    <div class="issue-head">
      <div class="issue-meta">
        ${status(issue.state)}
        <span class="paper-meta">${escapeHtml(surfaceLabels[issue.surface] || issue.surface)}</span>
        <span class="timestamp">${escapeHtml(formatTime(issue.createdAt))}</span>
      </div>
      <span class="digest">${escapeHtml(location || issue.id)}</span>
    </div>
    <p class="issue-message">${escapeHtml(issue.message)}</p>
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
    return `<section class="rail-section">
      <h2>已认可当前 revision</h2>
      <div class="approval-box">
        ${status('approved')}
        <p class="digest">${escapeHtml(latest.approval.approvalId)}</p>
        <p class="muted">认可绑定 R${escapeHtml(latest.revisionNumber)} 与当前 bundle digest。Agent 可拉取收据继续本地物化。</p>
        <p class="boundary-note">这里没有上线动作。之后仍需另行对 Agent 说“上线 ${escapeHtml(state.detail.paperId)}”。</p>
      </div>
    </section>`
  }
  const blocked = state.detail.unresolvedCount > 0
    || state.detail.rendererStale
    || !['awaiting_review', 'changes_requested'].includes(latest.state)
  return `<section class="rail-section">
    <h2>认可 revision</h2>
    <div class="approval-box">
      <p class="muted">当前 R${escapeHtml(latest.revisionNumber)} · ${escapeHtml(state.detail.unresolvedCount)} 个未决问题</p>
      <p class="digest">${escapeHtml(shortDigest(latest.bundleDigest))}</p>
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

function rightRailHtml() {
  return `<aside class="right-rail" aria-label="QA 问题与认可">
    ${issueFormHtml()}
    <section class="rail-section">
      <h2>${state.actor === 'owner' ? 'QA 对话' : 'Owner 反馈'}</h2>
      ${issuesHtml()}
    </section>
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
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">EQ</div>
        <div><h1>导题审核</h1><p>${state.actor === 'owner' ? '审核真实消费表面' : '读取并回应 Owner QA'}</p></div>
      </div>
      <div class="account">
        <div class="account-copy"><strong>${escapeHtml(state.user.username)}</strong><span>${state.actor === 'owner' ? 'Owner 审核台' : 'Agent 待办箱'}</span></div>
        <button class="button" id="refresh" type="button">刷新</button>
        <button class="button" id="logout" type="button">退出</button>
      </div>
    </header>
    <div class="workspace">
      ${leftRailHtml()}
      ${state.detail ? surfaceStageHtml() : '<main class="surface-stage"><div class="surface-empty"><h2>还没有可审核内容</h2><p class="muted">Agent 提交 revision 后，从左侧打开。</p></div></main>'}
      ${state.detail ? rightRailHtml() : '<aside class="right-rail"></aside>'}
    </div>
    ${state.error ? `<div class="error-banner" role="alert">${escapeHtml(state.error)}。刷新后重试。</div>` : ''}
  </div>`
  bind()
}

function screenTarget(event) {
  const element = typeof event.target?.closest === 'function' ? event.target : null
  if (!element) return null
  const question = element.closest('[data-paper-question-id], [data-pi-question-id]')
  const group = element.closest('[data-paper-browse-anchor]')
  const block = element.closest('[data-canonical-block-id]')
  const questionId = question?.getAttribute('data-paper-question-id')
    || question?.getAttribute('data-pi-question-id')
  const groupId = group?.getAttribute('data-paper-browse-anchor')
  const blockId = block?.getAttribute('data-canonical-block-id')
  if (!questionId && !groupId && !blockId) return null
  return { questionId, groupId, blockId }
}

function applyScreenTarget(target) {
  state.target = target
  const summary = document.querySelector('#target-summary')
  const form = document.querySelector('#issue-form')
  if (!summary || !form) return
  const values = [
    target.questionId && `题 ${target.questionId}`,
    target.groupId && `题组 ${target.groupId}`,
    target.blockId && `段 ${target.blockId}`,
  ].filter(Boolean)
  summary.classList.add('has-target')
  summary.textContent = `已定位：${values.join(' · ')}`
  form.elements.groupId.value = target.groupId || ''
  form.elements.questionId.value = target.questionId || ''
  form.elements.blockId.value = target.blockId || ''
  form.elements.message.focus()
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
  }
  frame.addEventListener('load', frameLoaded)
  if (frame.contentDocument?.readyState === 'complete') frameLoaded()
}

function bind() {
  document.querySelectorAll('[data-paper-id]').forEach((button) => {
    button.addEventListener('click', () => void loadDetail(button.dataset.paperId))
  })
  document.querySelectorAll('[data-surface]').forEach((button) => {
    button.addEventListener('click', () => {
      state.surface = button.dataset.surface
      state.target = null
      render()
    })
  })
  document.querySelector('#refresh')?.addEventListener('click', () => void loadPapers())
  document.querySelector('#logout')?.addEventListener('click', async () => {
    await request('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  })
  document.querySelector('#issue-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const page = String(data.get('pageNumber') || '').trim()
    try {
      state.detail = await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}/issues`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            revisionId: state.detail.latestRevisionId,
            surface: state.surface,
            groupId: String(data.get('groupId') || '').trim() || null,
            questionId: String(data.get('questionId') || '').trim() || null,
            blockId: String(data.get('blockId') || '').trim() || null,
            pageNumber: page || null,
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
  const approvalCheck = document.querySelector('#approval-check')
  const approvalButton = document.querySelector('#approve-revision')
  approvalCheck?.addEventListener('change', () => {
    approvalButton.disabled = !approvalCheck.checked
  })
  approvalButton?.addEventListener('click', async () => {
    approvalButton.disabled = true
    try {
      await request(
        `/api/import-reviews/papers/${encodeURIComponent(state.paperId)}`
          + `/revisions/${encodeURIComponent(state.detail.latestRevisionId)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bundleDigest: state.detail.latest.bundleDigest }),
        },
      )
      await loadDetail(state.paperId)
    } catch (error) {
      state.error = error.message
      render()
    }
  })
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
  const active = document.activeElement
  if (document.hidden || active?.matches('input, textarea, select')) return
  void loadPapers()
}, 30_000)
