const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character])

const labels = {
  awaiting_review: '待审核', changes_requested: '待修改', approved: '已批准',
  publishing: '发布中', published: '已发布', failed: '发布失败',
}

export const isReviewCompatible = compatibility => {
  if (compatibility?.result === 'different') return false
  if (compatibility?.result === 'equal') return !compatibility.pending
  return compatibility?.fallback === true && compatibility.guard === 'legacy_renderer'
    && compatibility.eligible === true && compatibility.legacyRendererStale === false
}

export function reviewCompatibilityMessage(compatibility) {
  if (isReviewCompatible(compatibility)) return ''
  if (compatibility?.pending || compatibility?.result === 'pending'
    || (compatibility?.result === 'unknown' && compatibility.reasonCode === 'BACKFILL_PENDING')) return '正在核验预览版本…'
  if (compatibility?.result === 'different') return '预览内容有变化，请在 Droid 中核验后重新送审'
  const reason = {
    MISSING_BASELINE: '缺少原预览记录',
    BASELINE_UNTRUSTED: '原预览记录未通过校验',
    TARGET_IDENTITY_INVALID: '当前版本无法核验',
    WORKER_TIMEOUT: '核验超时',
    WORKER_OOM: '核验资源不足',
    WORKER_EXIT: '核验进程已中断',
    WORKER_ABORTED: '核验已中断',
  }[compatibility?.reasonCode]
  return `无法核验原预览版本，请在 Droid 中核验后重新送审${reason ? `（${reason}）` : ''}`
}

export async function mountOwnerReview({ root, user, request, mediaConfirmationChecks }) {
  let papers = []
  let busy = false
  let fresh = false
  let error = ''
  let notice = ''
  let expanded = null
  let expandedKind = 'feedback'
  let detail = null
  const drafts = new Map()
  const draftKey = paper => JSON.stringify([paper.paperId, paper.latestRevisionId, paper.bundleDigest])
  const uncertain = new Set()
  const endpoint = paper => `/api/import-reviews/papers/${encodeURIComponent(paper.paperId)}`
  const screenUrl = paper => `/?${new URLSearchParams({
    view: 'paper-browse', paperId: paper.paperId, reviewRevision: paper.latestRevisionId,
  })}`
  const headers = { 'content-type': 'application/json', 'x-eqb-csrf': 'owner-review' }

  function feedbackHtml(paper) {
    if (expanded !== paper.paperId || expandedKind !== 'feedback' || !detail) return ''
    const threadId = detail.discussionThreadId
    const threadLink = /^T-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(threadId || '')
      ? `<a href="https://ampcode.com/threads/${threadId}" target="_blank" rel="noopener noreferrer">提交后由 Agent 自动处理</a>`
      : '提交后由 Agent 自动处理'
    const issues = detail.issues.filter(issue => ['open', 'fixed_pending_review'].includes(issue.state))
    return `<div class="owner-review-feedback">
      ${issues.length ? `<ul>${issues.map(issue => `<li>
        <p>${escapeHtml(issue.message)}</p>
        <div class="owner-review-actions">
          <span>${issue.state === 'fixed_pending_review' ? 'Agent 已修改，请查看新版后确认' : '待 Agent 修改'}</span>
          ${issue.state === 'fixed_pending_review' ? `<button type="button" data-issue="${escapeHtml(issue.id)}" data-action="close" ${busy || !fresh ? 'disabled' : ''}>确认已解决</button>` : ''}
          <button type="button" data-issue="${escapeHtml(issue.id)}" data-action="dismiss" ${busy || !fresh ? 'disabled' : ''}>撤销这条反馈</button>
        </div>
      </li>`).join('')}</ul>` : ''}
      <form data-return-form="${escapeHtml(paper.paperId)}">
        <label for="return-message">需要修改什么？</label>
        <textarea id="return-message" name="message" rows="3" maxlength="4000" required
          placeholder="例如：第 3 题的选项被遮挡，请调整后重新送审。" ${busy ? 'disabled' : ''}>${escapeHtml(drafts.get(draftKey(paper)) || '')}</textarea>
        <div class="owner-review-actions">
          <button type="submit" ${busy || !fresh || uncertain.has(paper.paperId) ? 'disabled' : ''}>提交退回</button>
          <button type="button" data-cancel ${busy ? 'disabled' : ''}>收起</button>
          <span>${threadLink}</span>
        </div>
      </form>
    </div>`
  }

  function mediaHtml(paper) {
    if (expanded !== paper.paperId || expandedKind !== 'media' || !detail) return ''
    return `<div class="owner-review-media">
      <p>图片确认不发布整卷，也不自动替换原图；选用后仍需回 Amp 重新送审。</p>
      ${(detail.mediaDerivations || []).filter(item => item.candidate).map(item => {
        const base = `/api/import-review-preview/revisions/${encodeURIComponent(paper.latestRevisionId)}/media/${encodeURIComponent(item.mediaId)}`
        const confirmed = (detail.mediaConfirmations || []).some(receipt =>
          receipt.revisionId === paper.latestRevisionId && receipt.bundleDigest === paper.bundleDigest
          && receipt.mediaId === item.mediaId && receipt.sourceSha256 === item.source.sha256
          && receipt.candidateSha256 === item.candidate.sha256 && receipt.presentationDigest === item.presentationDigest)
        const canConfirm = !confirmed && item.candidate.kind === 'ai_assisted_redraw'
          && item.publication.selection === 'source_crop' && !paper.rendererStale
          && ['awaiting_review', 'changes_requested'].includes(paper.state)
        const layout = item.presentation
        return `<section data-media-item="${escapeHtml(item.mediaId)}">
          <h2>${escapeHtml(item.mediaId)}</h2>
          <div class="media-compare-grid">
            <figure><img src="${base}/source" alt="不可变原始裁图" /><figcaption>原始裁图</figcaption></figure>
            <figure><img src="${base}/candidate" alt="独立候选图" /><figcaption>候选图</figcaption></figure>
          </div>
          <div class="media-overlay"><img src="${base}/source" alt="原图叠加层" /><img class="media-overlay-candidate" src="${base}/candidate" alt="候选图叠加层" /></div>
          <label class="owner-media-opacity">叠加透明度<input type="range" min="0" max="100" value="50" data-media-opacity /></label>
          <p>布局：${escapeHtml(({ left: '左对齐', center: '居中', right: '右对齐' })[layout.alignment])} · 正文宽度 ${Math.round(layout.widthRatio * 100)}% · 前后留白 ${escapeHtml(layout.spacingBefore)}/${escapeHtml(layout.spacingAfter)}</p>
          ${confirmed ? '<p role="status">这张候选图已确认</p>' : ''}
          ${canConfirm ? `<form data-confirm-media="${escapeHtml(item.mediaId)}">
            <p>逐项确认一致或原图没有该要素：</p>
            <div class="media-checklist">${mediaConfirmationChecks.map(([key, label]) => `<label><input type="checkbox" name="${key}" ${busy ? 'disabled' : ''} />${label}</label>`).join('')}</div>
            <button type="submit" disabled>确认这张候选图</button>
          </form>` : ''}
        </section>`
      }).join('')}
      <button type="button" data-cancel ${busy ? 'disabled' : ''}>收起</button>
    </div>`
  }

  function rowHtml(paper) {
    const state = paper.promotionState || paper.state
    const pending = uncertain.has(paper.paperId)
    const canPublish = !busy && fresh && !pending && isReviewCompatible(paper.compatibility)
      && !paper.promotionState && paper.unresolvedCount === 0
      && ['awaiting_review', 'changes_requested', 'approved'].includes(paper.state)
    const frozen = Boolean(paper.promotionState)
    const hint = pending ? '请求结果待核实，请刷新状态；不要重复提交。'
      : state === 'publishing' ? '服务器正在处理。如长时间未完成，请在 Amp 核实，不要重试。'
      : state === 'failed' ? '请在 Amp 核实失败原因，保留原发布记录。'
      : !isReviewCompatible(paper.compatibility) ? reviewCompatibilityMessage(paper.compatibility)
      : paper.unresolvedCount ? `${paper.unresolvedCount} 条反馈尚未确认解决。` : ''
    return `<li class="owner-review-item" data-review-paper="${escapeHtml(paper.paperId)}">
      <div class="owner-review-row">
        <div class="owner-review-name">
          <a href="${escapeHtml(screenUrl(paper))}" target="_blank" rel="noopener noreferrer">${escapeHtml(paper.paperName)}</a>
          <span>R${escapeHtml(paper.revisionNumber)} · Screen</span>
          ${paper.hasMediaCandidates && !frozen ? `<button class="owner-review-media-link" type="button" data-media-review="${escapeHtml(paper.paperId)}" aria-expanded="${expanded === paper.paperId && expandedKind === 'media'}" ${busy || !fresh ? 'disabled' : ''}>核对候选图</button>` : ''}
        </div>
        <span class="owner-review-state">${escapeHtml(labels[state] || state)}</span>
        <div class="owner-review-actions">
          ${state === 'published'
            ? `<a href="/?${escapeHtml(new URLSearchParams({ view: 'paper-browse', paperId: paper.paperId }))}" target="_blank" rel="noopener noreferrer">查看已发布</a>`
            : `<button type="button" data-publish="${escapeHtml(paper.paperId)}" ${canPublish ? '' : 'disabled'}>发布到题库</button>
              <button type="button" data-feedback="${escapeHtml(paper.paperId)}" aria-expanded="${expanded === paper.paperId && expandedKind === 'feedback'}" ${busy || frozen || !fresh ? 'disabled' : ''}>${paper.unresolvedCount ? '查看反馈' : '退回修改'}</button>`}
        </div>
      </div>
      ${hint ? `<p class="owner-review-hint">${escapeHtml(hint)}</p>` : ''}
      ${feedbackHtml(paper)}
      ${mediaHtml(paper)}
    </li>`
  }

  function render() {
    root.innerHTML = `<div class="owner-review">
      <header class="owner-review-header">
        <a href="/">英语题库</a>
        <span>${escapeHtml(user.username)}</span>
      </header>
      <main>
        <div class="owner-review-heading"><h1>试卷审核</h1>
          <button type="button" id="owner-review-refresh" ${busy ? 'disabled' : ''}>刷新状态</button>
        </div>
        <p class="owner-review-intro">点击卷名直接看 Screen。发布即认可这一版，并向用户公开。</p>
        ${error ? `<p class="owner-review-error" role="alert">${escapeHtml(error)}</p>` : ''}
        ${notice ? `<p role="status">${escapeHtml(notice)}</p>` : ''}
        ${papers.length ? `<ul class="owner-review-list" aria-label="送审试卷">${papers.map(rowHtml).join('')}</ul>`
          : `<p class="owner-review-empty">${busy ? '正在读取待审试卷…' : fresh ? '还没有送审试卷。在 Amp 确认可以送审后，试卷会出现在这里。' : '未能读取试卷，请刷新状态。'}</p>`}
      </main>
    </div>`
    root.querySelector('#owner-review-refresh').onclick = () => void load()
    root.querySelectorAll('[data-publish]').forEach(button => {
      const paper = papers.find(item => item.paperId === button.dataset.publish)
      button.onclick = () => void mutate(paper, `${endpoint(paper)}/revisions/${encodeURIComponent(paper.latestRevisionId)}/publish`, {
        intent: 'publish', bundleDigest: paper.bundleDigest, rendererBuildId: paper.rendererBuildId,
      }, '发布请求已处理，请以列表中的状态为准。')
    })
    root.querySelectorAll('[data-feedback], [data-media-review]').forEach(button => {
      button.onclick = async () => {
        if (busy) return
        const kind = button.dataset.mediaReview ? 'media' : 'feedback'
        const paper = papers.find(item => item.paperId === (button.dataset.mediaReview || button.dataset.feedback))
        if (expanded === paper.paperId && expandedKind === kind) { expanded = null; render(); return }
        busy = true
        error = ''
        render()
        try {
          const result = await request(`${endpoint(paper)}${kind === 'media' ? '' : '/review-state'}`, { cache: 'no-store' })
          if (result.latestRevisionId !== paper.latestRevisionId
            || (kind === 'media' && result.latest.bundleDigest !== paper.bundleDigest)) throw new Error('待审版本已变化，请刷新后查看新版。')
          detail = result
          expanded = paper.paperId
          expandedKind = kind
        } catch (failure) { error = failure.message; fresh = false }
        busy = false
        render()
        root.querySelector('textarea')?.focus()
      }
    })
    root.querySelector('[data-cancel]')?.addEventListener('click', () => { expanded = null; render() })
    const form = root.querySelector('[data-return-form]')
    form?.querySelector('textarea').addEventListener('input', event => {
      const paper = papers.find(item => item.paperId === form.dataset.returnForm)
      drafts.set(draftKey(paper), event.target.value)
    })
    form?.addEventListener('submit', event => {
      event.preventDefault()
      const paper = papers.find(item => item.paperId === form.dataset.returnForm)
      const message = String(new FormData(form).get('message') || '').trim()
      if (!message) return
      void mutate(paper, `${endpoint(paper)}/issues`, {
        revisionId: paper.latestRevisionId, bundleDigest: paper.bundleDigest, surface: 'paper', message,
      }, '已退回修改。请回 Amp 继续，修改后重新确认送审。')
    })
    root.querySelectorAll('[data-media-opacity]').forEach(input => {
      input.oninput = () => { input.closest('section').querySelector('.media-overlay-candidate').style.opacity = Number(input.value) / 100 }
    })
    root.querySelectorAll('[data-confirm-media]').forEach(form => {
      const ready = () => !busy && fresh && !uncertain.has(expanded)
        && mediaConfirmationChecks.every(([key]) => form.elements[key].checked)
      form.onchange = () => { form.querySelector('button').disabled = !ready() }
      form.onsubmit = event => {
        event.preventDefault()
        if (!ready()) return
        const paper = papers.find(item => item.paperId === expanded)
        const item = detail.mediaDerivations.find(item => item.mediaId === form.dataset.confirmMedia)
        void mutate(paper, `${endpoint(paper)}/revisions/${encodeURIComponent(paper.latestRevisionId)}/confirm-media`, {
          bundleDigest: paper.bundleDigest, mediaId: item.mediaId, sourceSha256: item.source.sha256,
          candidateSha256: item.candidate.sha256, presentationDigest: item.presentationDigest,
          checklist: Object.fromEntries(mediaConfirmationChecks.map(([key]) => [key, form.elements[key].checked])),
        }, '候选图已确认。请回 Amp 选用并重新送审，整卷尚未发布。')
      }
    })
    root.querySelectorAll('[data-issue]').forEach(button => {
      button.onclick = () => {
        const paper = papers.find(item => item.paperId === expanded)
        void mutate(paper, `${endpoint(paper)}/issues/${encodeURIComponent(button.dataset.issue)}`, {
          action: button.dataset.action, revisionId: paper.latestRevisionId,
        }, '反馈已更新，尚未发布试卷。', 'PATCH')
      }
    })
  }

  async function load() {
    if (busy) return
    busy = true
    fresh = false
    error = ''
    render()
    try {
      const result = await request('/api/import-reviews', { cache: 'no-store' })
      if (papers.some(old => drafts.get(draftKey(old)) && result.papers.some(next =>
        next.paperId === old.paperId && draftKey(next) !== draftKey(old)))) {
        notice = '待审版本已变化，旧版反馈草稿未带入新版。请查看新 Screen 后重新填写。'
      }
      papers = result.papers.filter(paper => paper.reviewKind === 'candidate'
        && paper.latestRevisionId && paper.state !== 'uploading')
      uncertain.clear()
      expanded = null
      detail = null
      fresh = true
    } catch (failure) { error = `状态读取失败：${failure.message}。请刷新状态。` }
    busy = false
    render()
  }

  async function mutate(paper, url, body, successMessage, method = 'POST') {
    if (busy || !fresh || uncertain.has(paper.paperId)) return
    if (body.intent === 'publish' && !isReviewCompatible(paper.compatibility)) return
    busy = true
    error = ''
    notice = method === 'POST' && body.intent === 'publish' ? '正在发布，请勿重复提交…' : '正在保存…'
    render()
    try {
      await request(url, { method, headers, body: JSON.stringify(body) })
      if (body.surface === 'paper') drafts.delete(draftKey(paper))
      busy = false
      notice = successMessage
      await load()
    } catch (failure) {
      uncertain.add(paper.paperId)
      notice = ''
      error = `操作结果需核实：${failure.message}。先刷新状态，不要重复提交；若仍在发布中或失败，请回 Amp 处理。`
      busy = false
      render()
    }
  }

  await load()
}
