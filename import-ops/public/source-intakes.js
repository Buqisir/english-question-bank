import { bindClipboardButtons } from './clipboard.js'

const platformLabels = {
  wechat_official: '公众号',
  xiaohongshu: '小红书',
  teacher_group: '教师群',
  other: '其他',
}

const intakeStateLabels = {
  draft: '草稿',
  awaiting_answers: '待补答案',
  ready_for_agent: '可提交',
  queued: '等待 Amp',
  claimed: '正在导题',
  needs_owner: '需确认',
  handed_off: '等待审核',
}

const activeIntakeStates = new Set(['queued', 'claimed'])
const refreshIntervalMs = 15_000

const roleLabels = {
  question_source: '试题',
  official_answers: '官方答案',
  question_and_answers: '题目与答案',
  listening_audio: '听力音频',
  analyzed_package: '完整解析包',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function plusIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>'
}

function searchIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 18 18"><circle cx="8" cy="8" r="4.75" /><path d="m11.5 11.5 3.25 3.25" /></svg>'
}

function documentIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 18 18"><path d="M4.5 2.5h5l4 4v9h-9z" /><path d="M9.5 2.5v4h4M6.5 10h5M6.5 12.5h4" /></svg>'
}

function closeIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 18 18"><path d="m4 4 10 10M14 4 4 14" /></svg>'
}

function formatActivityTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
}

function fileExtension(fileName) {
  return String(fileName || '').split('.').pop()?.toUpperCase() || 'FILE'
}

function initials(username) {
  return String(username || 'Owner').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'OW'
}

function digest(file) {
  return file.arrayBuffer().then(async (bytes) => {
    const result = await window.crypto.subtle.digest('SHA-256', bytes)
    const hex = [...new Uint8Array(result)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    return `sha256:${hex}`
  })
}

function modeForIntake(intake) {
  if (intake?.files?.some((file) => file.role === 'analyzed_package')) return 'package'
  return intake?.files?.some((file) => file.role === 'question_and_answers')
    ? 'combined'
    : 'separate'
}

function isEditable(intake) {
  return !intake || ['draft', 'awaiting_answers', 'ready_for_agent', 'needs_owner'].includes(intake.state)
}

function groupForState(state) {
  if (state === 'awaiting_answers') return 'awaiting_answers'
  if (state === 'ready_for_agent') return 'ready_for_agent'
  if (['queued', 'claimed'].includes(state)) return 'agent'
  if (state === 'needs_owner') return 'needs_owner'
  return 'other'
}

function ampThreadIdFor(intake) {
  return intake.claim?.ampThreadId || intake.orbWorker?.ampThreadId || null
}

function workflowStatus(intake) {
  if (intake.state === 'queued') {
    if (intake.orbWorker?.ampThreadId) return { label: 'Orb 已创建', tone: 'active' }
    if (intake.orbWorker?.state === 'reserved') return { label: '正在创建 Orb', tone: 'active' }
    if (intake.lastNotification?.state === 'failed') return { label: '通知失败', tone: 'danger' }
    if (intake.lastNotification?.state === 'sent') return { label: '已通知 Amp', tone: 'active' }
    if (intake.lastNotification?.state === 'skipped') return { label: '等待通知 Amp', tone: 'warning' }
  }
  if (intake.state === 'claimed') return { label: '正在导题', tone: 'active' }
  if (intake.state === 'handed_off') return { label: '等待审核', tone: 'success' }
  if (intake.state === 'needs_owner') return { label: '需确认', tone: 'danger' }
  if (intake.state === 'awaiting_answers') return { label: '待补答案', tone: 'warning' }
  if (intake.state === 'ready_for_agent') return { label: '可提交', tone: 'success' }
  return { label: intakeStateLabels[intake.state] || intake.state, tone: 'neutral' }
}

function recentActivity(intake) {
  const candidates = [
    [intake.claim?.heartbeatAt, 'Orb 最近活动'],
    [intake.orbWorker?.updatedAt, intake.orbWorker?.ampThreadId ? 'Orb 线程已创建' : '正在创建 Orb'],
    [intake.lastNotification?.createdAt, intake.lastNotification?.state === 'failed' ? '通知未送达' : '已通知 Amp'],
    [intake.currentSubmission?.updatedAt, intake.state === 'handed_off' ? '已提交审核' : '提交已更新'],
    [intake.updatedAt, intake.state === 'needs_owner' ? '等待 Owner 确认' : '台账已更新'],
  ].filter(([value]) => value)
  candidates.sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
  const [value, label] = candidates[0] || [intake.createdAt, '已记录题源']
  return { value, label }
}

export function mountSourceIntakes({ root, user, request, accessHtml }) {
  root.removeAttribute('aria-live')
  const state = {
    intakes: [],
    filter: 'all',
    query: '',
    loading: true,
    error: null,
    drawerOpen: false,
    editing: null,
    draft: null,
    intakeMode: 'new_paper',
    mode: 'separate',
    selectedFiles: new Map(),
    busy: false,
    submittingIntakeId: null,
    returnFocusIntakeId: null,
  }
  let refreshTimer = null
  let refreshing = false

  function filteredIntakes() {
    const query = state.query.trim().toLowerCase()
    return state.intakes.filter((intake) => {
      if (state.filter !== 'all' && groupForState(intake.state) !== state.filter) return false
      if (!query) return true
      return [
        intake.paperName,
        ...intake.sources.flatMap((source) => [source.sourceName, source.sourceUrl]),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    })
  }

  function count(group) {
    return state.intakes.filter((intake) => group === 'all' || groupForState(intake.state) === group).length
  }

  function statusHtml(intake) {
    const workflow = workflowStatus(intake)
    return `<span class="intake-status intake-status--${escapeHtml(workflow.tone)}">
      <span aria-hidden="true"></span>${escapeHtml(workflow.label)}
    </span>`
  }

  function recentActivityHtml(intake) {
    const activity = recentActivity(intake)
    return `<div class="ledger-activity"><span>${escapeHtml(activity.label)}</span><time datetime="${escapeHtml(activity.value)}">${escapeHtml(formatActivityTime(activity.value))}</time></div>`
  }

  function paperReferenceHtml(intake) {
    if (intake.targetPaperId) {
      return `<span class="ledger-paper-reference"><code>${escapeHtml(intake.targetPaperId)}</code><button class="copy-button" type="button" data-copy-text="${escapeHtml(intake.targetPaperId)}" data-copy-name="Paper ID" aria-label="复制 Paper ID">复制</button></span>`
    }
    if (!intake.handedOffPaperId) {
      return `<span class="ledger-paper-id">R${escapeHtml(intake.currentSubmission?.revisionNumber || '—')}</span>`
    }
    return `<span class="ledger-paper-reference"><code>${escapeHtml(intake.handedOffPaperId)}</code><button class="copy-button" type="button" data-copy-text="${escapeHtml(intake.handedOffPaperId)}" data-copy-name="Paper ID" aria-label="复制 Paper ID">复制</button></span>`
  }

  function sourceHtml(intake) {
    const source = intake.sources[0]
    if (!source) return '<span class="intake-muted">—</span>'
    const note = source.sourceUrl
      ? (source.platform === 'wechat_official' ? '文章来源已记录' : '原帖链接已记录')
      : (source.platform === 'teacher_group' ? '群文件 · 无公开链接' : '未记录公开链接')
    const name = source.sourceUrl
      ? `<a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.sourceName)}</a>`
      : `<strong>${escapeHtml(source.sourceName)}</strong>`
    return `<div class="intake-source">
      <div><span class="platform-tag">${escapeHtml(platformLabels[source.platform] || source.platform)}</span>${name}</div>
      <span>${escapeHtml(note)}</span>
    </div>`
  }

  function filesHtml(intake) {
    if (!intake.files.length) return '<span class="intake-muted">尚未上传</span>'
    const entries = intake.files.map((file) => `<span class="ledger-file ${file.uploadedAt ? '' : 'is-pending'}">
      ${documentIcon()}${escapeHtml(roleLabels[file.role])} ${escapeHtml(file.extension.slice(1).toUpperCase())}
    </span>`)
    if (
      intake.files.some((file) => file.role === 'question_source' && file.uploadedAt)
      && !intake.files.some((file) => file.role === 'official_answers' && file.uploadedAt)
    ) {
      entries.push('<span class="ledger-file is-missing">缺官方答案</span>')
    }
    return `<div class="ledger-files">${entries.join('')}</div>`
  }

  function actionFor(intake) {
    if (intake.state === 'ready_for_agent') {
      const submitting = state.submittingIntakeId === intake.id
      return `<button class="ledger-action ledger-action--primary" type="button" data-submit-intake="${escapeHtml(intake.id)}" ${submitting ? 'disabled' : ''}>${submitting ? '正在提交…' : '提交给 Amp'}</button>`
    }
    if (intake.state === 'awaiting_answers') {
      return `<button class="ledger-action" type="button" data-edit-intake="${escapeHtml(intake.id)}">上传答案</button>`
    }
    if (['draft', 'needs_owner'].includes(intake.state)) {
      return `<button class="ledger-action" type="button" data-edit-intake="${escapeHtml(intake.id)}">${intake.state === 'needs_owner' ? '处理问题' : '继续填写'}</button>`
    }
    if (intake.state === 'handed_off') {
      const command = `继续 ${intake.handedOffPaperId}，处理线上审核反馈`
      return `<span class="ledger-actions"><a class="ledger-action" href="/ops/?view=review">打开审核</a><button class="ledger-action" type="button" data-package-revision="${escapeHtml(intake.id)}">上传修正版包</button><button class="ledger-action" type="button" data-copy-text="${escapeHtml(command)}" data-copy-name="继续导题口令">复制继续口令</button></span>`
    }
    if (intake.state === 'queued' && intake.currentSubmission) {
      const notifying = state.submittingIntakeId === intake.id
      const threadId = ampThreadIdFor(intake)
      return `<span class="ledger-actions">${threadId ? `<a class="ledger-action" href="https://ampcode.com/threads/${encodeURIComponent(threadId)}" target="_blank" rel="noreferrer">打开 Amp 线程</a>` : ''}<button class="ledger-action" type="button" data-notify-intake="${escapeHtml(intake.id)}" data-submission-id="${escapeHtml(intake.currentSubmission.id)}" ${notifying ? 'disabled' : ''}>${notifying ? '正在通知…' : '再次通知 Amp'}</button></span>`
    }
    const threadId = ampThreadIdFor(intake)
    if (threadId) {
      return `<a class="ledger-action" href="https://ampcode.com/threads/${encodeURIComponent(threadId)}" target="_blank" rel="noreferrer">打开 Amp 线程</a>`
    }
    return '<span class="intake-muted">等待 Amp</span>'
  }

  function tableHtml() {
    const intakes = filteredIntakes()
    if (!state.loading && state.intakes.length === 0) {
      return `<section class="intake-empty" aria-labelledby="empty-title">
        <div class="empty-document" aria-hidden="true">${documentIcon()}</div>
        <h2 id="empty-title">还没有题源</h2>
        <p>从公众号、小红书或教师群发现试卷后，先记下来源并上传本地 DOCX / PDF。答案可以稍后补。</p>
        <button class="button button--primary intake-add" type="button">${plusIcon()}添加第一份题源</button>
        <ol><li><span>1</span>记录来源</li><li><span>2</span>上传原文件</li><li><span>3</span>通知 Amp</li></ol>
        <small>原文件仅供后台导题使用，不会作为网站公开资源。</small>
      </section>`
    }
    if (!state.loading && intakes.length === 0) {
      return '<section class="intake-no-results"><h2>没有匹配的题源</h2><p>换一个关键词或筛选状态。</p></section>'
    }
    return `<section class="ledger-shell" aria-label="题源台账">
      <div class="ledger-scroll">
        <table class="intake-ledger">
          <thead><tr><th>试卷</th><th>来源</th><th>原文件</th><th>状态</th><th>最近活动</th><th>下一步</th></tr></thead>
          <tbody>${state.loading ? `<tr><td colspan="6"><div class="ledger-loading">正在读取题源…</div></td></tr>` : intakes.map((intake) => `
            <tr>
              <td><strong class="ledger-paper-name">${escapeHtml(intake.paperName)}</strong>${paperReferenceHtml(intake)}</td>
              <td>${sourceHtml(intake)}</td>
              <td>${filesHtml(intake)}</td>
              <td>${statusHtml(intake)}</td>
              <td>${recentActivityHtml(intake)}</td>
              <td>${actionFor(intake)}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
      <footer><span>显示 ${intakes.length} 条 · 共 ${state.intakes.length} 条题源</span><span>原文件私有保存 · 上传后校验 SHA-256</span></footer>
    </section>`
  }

  function fileValue(role) {
    return state.selectedFiles.get(role)
      || state.editing?.files?.find((file) => file.role === role)
      || null
  }

  function uploadBox(role, label, { audio = false } = {}) {
    const value = fileValue(role)
    const isNew = value instanceof File
    const packageFile = role === 'analyzed_package'
    return `<label class="upload-box" data-upload-role="${escapeHtml(role)}">
      <span class="upload-box-heading"><strong>${escapeHtml(label)}</strong><span>${packageFile ? 'ZIP' : audio ? 'MP3' : 'DOCX / PDF'}</span></span>
      <input type="file" accept="${packageFile ? '.zip,application/zip' : audio ? '.mp3,audio/mpeg' : '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}" data-file-role="${escapeHtml(role)}" />
      ${value ? `<span class="upload-file">
        <span class="file-badge">${escapeHtml(fileExtension(value.name || value.fileName))}</span>
        <span class="upload-file-copy"><strong>${escapeHtml(value.name || value.fileName)}</strong><span>${escapeHtml(formatBytes(value.size || value.byteLength))} · ${isNew ? '待上传' : '上传完成'}</span></span>
        <span class="upload-check" aria-label="${isNew ? '已选择' : '上传完成'}"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 8.2 2.5 2.5L12 5.5" /></svg></span>
      </span>` : `<span class="upload-placeholder">${documentIcon()}<span><strong>选择本地文件</strong><small>单个文件不超过 ${packageFile ? '256' : '64'} MB</small></span></span>`}
    </label>`
  }

  function drawerHtml() {
    if (!state.drawerOpen) return ''
    const draft = state.draft || {}
    const reason = state.editing?.currentSubmission?.needsOwnerMessage
    const supplement = state.intakeMode === 'listening_supplement'
    const packageTarget = state.editing?.packageTarget
    const packageMode = !supplement && state.mode === 'package'
    return `<div class="drawer-layer">
      <button class="drawer-scrim" type="button" aria-label="关闭添加题源"></button>
      <aside class="intake-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header><div><h2 id="drawer-title">${state.editing ? '编辑题源' : '添加题源'}</h2><p>上传原始题源，或整合已完成的解析包。</p></div><button class="drawer-close" type="button" aria-label="关闭">${closeIcon()}</button></header>
        <form id="intake-form">
          <div class="drawer-body">
            ${reason ? `<div class="owner-question" role="status"><strong>Agent 需要确认</strong><span>${escapeHtml(reason)}</span></div>` : ''}
            ${packageTarget ? `<section class="drawer-section"><h3>修正已有试卷</h3><p class="drawer-help">${escapeHtml(state.editing.paperName)} · 基于 ${escapeHtml(packageTarget.revisionId)}。提交完整修正版包，旧审核记录保留。</p></section>` : ''}
            ${state.editing ? '' : `<section class="drawer-section"><h3>添加方式</h3><div class="file-mode" role="group" aria-label="题源添加方式"><button type="button" data-intake-mode="new_paper" aria-pressed="${!supplement}">新试卷</button><button type="button" data-intake-mode="listening_supplement" aria-pressed="${supplement}">为已有试卷补听力</button></div></section>`}
            ${supplement ? `
              <section class="drawer-section"><h3>目标试卷</h3><label class="drawer-field"><span>Paper ID</span><input name="targetPaperId" required maxlength="160" value="${escapeHtml(draft.targetPaperId || '')}" placeholder="paper-…" /></label><p class="drawer-help">必须填写导题审核中已有试卷的准确 Paper ID。</p></section>
              <section class="drawer-section drawer-files"><h3>听力文件</h3><div class="upload-stack">${uploadBox('listening_audio', '整卷听力音频', { audio: true })}</div><p class="drawer-help">只收一个 MP3，单个文件不超过 64 MB。Agent 会转写全文并做轻量内容核对。</p></section>
            ` : `
              <section class="drawer-section"><h3>试卷</h3><label class="drawer-field"><span>试卷名称</span><input name="paperName" required maxlength="300" value="${escapeHtml(draft.paperName || '')}" placeholder="例如：2027 届高三开学考英语" /></label></section>
              <section class="drawer-section"><h3>来源</h3><div class="source-field-row"><label class="drawer-field"><span>平台</span><select name="platform"><option value="wechat_official" ${draft.platform === 'wechat_official' ? 'selected' : ''}>公众号</option><option value="xiaohongshu" ${draft.platform === 'xiaohongshu' ? 'selected' : ''}>小红书</option><option value="teacher_group" ${draft.platform === 'teacher_group' ? 'selected' : ''}>教师群</option><option value="other" ${draft.platform === 'other' ? 'selected' : ''}>其他</option></select></label><label class="drawer-field drawer-field--grow"><span>来源名称</span><input name="sourceName" required maxlength="300" value="${escapeHtml(draft.sourceName || '')}" placeholder="账号、群或老师名称" /></label></div><label class="drawer-field"><span>公开链接（选填）</span><input name="sourceUrl" type="url" maxlength="2000" value="${escapeHtml(draft.sourceUrl || '')}" placeholder="https://…" /></label></section>
              <section class="drawer-section drawer-files"><h3>交付方式</h3>${packageTarget ? '' : `<div class="file-mode" role="group" aria-label="试卷交付方式"><button type="button" data-file-mode="separate" aria-pressed="${!packageMode}">原始题源</button><button type="button" data-file-mode="package" aria-pressed="${packageMode}">完整解析包</button></div>`}
                ${packageMode ? `<div class="upload-stack">${uploadBox('analyzed_package', '解析包')}</div><p class="drawer-help">一个 ZIP 包含题目、官方答案、完整解析、资源和原件。只校验和整合，不重新生成解析；不必另传题卷。</p>` : `<div class="file-mode" role="group" aria-label="文件组合方式"><button type="button" data-file-mode="separate" aria-pressed="${state.mode === 'separate'}">题目与答案分开</button><button type="button" data-file-mode="combined" aria-pressed="${state.mode === 'combined'}">题目和答案在同一文件</button></div><div class="upload-stack">${state.mode === 'combined' ? uploadBox('question_and_answers', '题目与答案') : `${uploadBox('question_source', '试题文件')}${uploadBox('official_answers', '官方答案')}`}${uploadBox('listening_audio', '听力音频（选填）', { audio: true })}</div><p class="drawer-help">暂时没有答案也能先保存；听力音频可以稍后再补。提交后由 Agent 导卷并生成解析。</p>`}
              </section>
            `}
          </div>
          <footer class="drawer-footer"><p>${supplement ? '提交后，Agent 会把音频补进目标试卷的同一审核记录。' : packageMode ? '提交后锁定这一版解析包，校验通过后进入人工审核；不会自动上线。' : '提交后将锁定这一版文件，并通知 Amp 创建专用 Orb 线程开始导题。'}</p>${state.error ? `<div class="drawer-error" role="alert">${escapeHtml(state.error)}</div>` : ''}<div><button class="button drawer-draft" type="submit" data-save-mode="draft" ${state.busy ? 'disabled' : ''}>保存草稿</button><button class="button button--primary" type="submit" data-save-mode="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '正在保存…' : '保存并通知 Amp'}</button></div></footer>
        </form>
      </aside>
    </div>`
  }

  function render() {
    root.innerHTML = `<div class="source-intake-app">
      <div class="sr-only" role="status" aria-live="polite" data-copy-feedback></div>
      <header class="topbar source-topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">EQ</div><div><h1>英语题库</h1><p>后台工作台</p></div></div><nav class="workspace-navigation" aria-label="后台工作台"><a href="/ops/" aria-current="page">题源台账</a><a href="/ops/?view=review">导题审核</a></nav><div class="account"><div class="account-copy"><strong>${escapeHtml(user.username)}</strong><span>Owner</span></div><span class="owner-avatar" aria-hidden="true">${escapeHtml(initials(user.username))}</span></div></header>
      <main class="intake-page"><div class="intake-page-heading"><div><span class="intake-kicker">SOURCE INTAKE</span><h1>题源台账</h1><p>把人工发现的试卷和原文件记在这里，材料齐全后，提交给 Amp Orb 进入既有导题流程。</p></div><button class="button button--primary intake-add" type="button">${plusIcon()}添加题源</button></div>
        <div class="ledger-tools"><div class="ledger-filters" role="group" aria-label="筛选题源">${[['all', '全部'], ['awaiting_answers', '待补答案'], ['ready_for_agent', '可提交'], ['agent', 'Amp 导题中'], ['needs_owner', '需确认']].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${state.filter === key}">${label} <span>${count(key)}</span></button>`).join('')}</div><label class="ledger-search">${searchIcon()}<span class="sr-only">搜索试卷名或来源</span><input type="search" value="${escapeHtml(state.query)}" placeholder="搜索试卷名或来源" /></label></div>
        ${state.error && !state.drawerOpen ? `<div class="intake-page-error" role="alert">${escapeHtml(state.error)}。请刷新后重试。</div>` : ''}
        ${tableHtml()}
      </main>${drawerHtml()}
    </div>`
    bind()
  }

  function openDrawer(intake = null) {
    if (intake && !isEditable(intake)) return
    stopAutoRefresh()
    state.editing = intake
    const source = intake?.sources?.[0] || {}
    state.draft = {
      paperName: intake?.paperName || '',
      targetPaperId: intake?.targetPaperId || '',
      platform: source.platform || 'wechat_official',
      sourceName: source.sourceName || '',
      sourceUrl: source.sourceUrl || '',
    }
    state.returnFocusIntakeId = intake?.id || null
    state.intakeMode = intake?.mode || 'new_paper'
    state.mode = intake?.packageTarget ? 'package' : modeForIntake(intake)
    state.selectedFiles = new Map()
    state.error = null
    state.drawerOpen = true
    render()
    document.querySelector('#intake-form input[name="targetPaperId"], #intake-form input[name="paperName"]')?.focus()
  }

  function closeDrawer() {
    if (state.busy) return
    const returnFocusIntakeId = state.returnFocusIntakeId
    state.drawerOpen = false
    state.editing = null
    state.draft = null
    state.selectedFiles = new Map()
    state.error = null
    render()
    const returnTarget = returnFocusIntakeId
      ? document.querySelector(`[data-edit-intake="${CSS.escape(returnFocusIntakeId)}"]`)
      : document.querySelector('.intake-page-heading .intake-add')
    returnTarget?.focus()
    state.returnFocusIntakeId = null
    scheduleAutoRefresh()
  }

  async function uploadFile(intakeId, role, file) {
    const sha256 = await digest(file)
    const mediaType = role === 'analyzed_package'
      ? 'application/zip'
      : file.name.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : file.name.toLowerCase().endsWith('.mp3')
        ? 'audio/mpeg'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const registered = await request(`/api/source-intakes/${encodeURIComponent(intakeId)}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role,
        fileName: file.name,
        mediaType,
        sha256,
        byteLength: file.size,
      }),
    })
    return request(`/api/source-intakes/${encodeURIComponent(intakeId)}/files/${encodeURIComponent(registered.file.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': registered.file.mediaType,
      },
      body: file,
    })
  }

  async function saveDrawer(form, shouldSubmit) {
    const data = new FormData(form)
    const payload = state.intakeMode === 'listening_supplement'
      ? { targetPaperId: String(data.get('targetPaperId') || '').trim() }
      : {
          paperName: String(data.get('paperName') || '').trim(),
          sources: [{
            platform: String(data.get('platform') || ''),
            sourceName: String(data.get('sourceName') || '').trim(),
            sourceUrl: String(data.get('sourceUrl') || '').trim() || null,
          }],
        }
    state.busy = true
    state.error = null
    render()
    let savedIntake = state.editing
    try {
      const saved = state.editing
        ? await request(`/api/source-intakes/${encodeURIComponent(state.editing.id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await request('/api/source-intakes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
      let intake = saved.intake
      savedIntake = intake
      for (const [role, file] of state.selectedFiles) {
        const uploaded = await uploadFile(intake.id, role, file)
        intake = uploaded.intake
        savedIntake = intake
        state.selectedFiles.delete(role)
      }
      if (shouldSubmit) {
        await request(`/api/source-intakes/${encodeURIComponent(intake.id)}/submit`, { method: 'POST' })
      }
      state.drawerOpen = false
      state.editing = null
      state.draft = null
      state.selectedFiles = new Map()
      await load()
    } catch (error) {
      state.editing = savedIntake
      state.error = error.message
      state.busy = false
      render()
    }
  }

  async function submitReady(intakeId) {
    if (state.submittingIntakeId) return
    state.submittingIntakeId = intakeId
    state.error = null
    render()
    try {
      await request(`/api/source-intakes/${encodeURIComponent(intakeId)}/submit`, { method: 'POST' })
      await load()
    } catch (error) {
      state.error = error.message
      state.submittingIntakeId = null
      render()
    }
  }

  async function notifyAgent(intakeId, submissionId) {
    if (state.submittingIntakeId) return
    state.submittingIntakeId = intakeId
    state.error = null
    render()
    try {
      await request(
        `/api/source-intakes/${encodeURIComponent(intakeId)}/submissions/${encodeURIComponent(submissionId)}/notify`,
        { method: 'POST' },
      )
      await load()
    } catch (error) {
      state.error = error.message
      state.submittingIntakeId = null
      render()
    }
  }

  function bind() {
    bindClipboardButtons(root)
    document.querySelectorAll('.intake-add').forEach((button) =>
      button.addEventListener('click', () => openDrawer()))
    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter
        render()
      })
    })
    document.querySelector('.ledger-search input')?.addEventListener('input', (event) => {
      state.query = event.currentTarget.value
      render()
      const input = document.querySelector('.ledger-search input')
      input?.focus()
      input?.setSelectionRange(state.query.length, state.query.length)
    })
    document.querySelectorAll('[data-edit-intake]').forEach((button) => {
      button.addEventListener('click', () => openDrawer(
        state.intakes.find((intake) => intake.id === button.dataset.editIntake),
      ))
    })
    document.querySelectorAll('[data-package-revision]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true
        try {
          const result = await request('/api/source-intakes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ packageRevisionOf: button.dataset.packageRevision }),
          })
          openDrawer(result.intake)
        } catch (error) {
          state.error = error.message
          render()
        }
      })
    })
    document.querySelectorAll('[data-submit-intake]').forEach((button) => {
      button.addEventListener('click', () => void submitReady(button.dataset.submitIntake))
    })
    document.querySelectorAll('[data-notify-intake]').forEach((button) => {
      button.addEventListener('click', () => void notifyAgent(
        button.dataset.notifyIntake,
        button.dataset.submissionId,
      ))
    })
    document.querySelector('.drawer-scrim')?.addEventListener('click', closeDrawer)
    document.querySelector('.drawer-close')?.addEventListener('click', closeDrawer)
    document.querySelectorAll('[data-intake-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.intakeMode = button.dataset.intakeMode
        state.selectedFiles = new Map()
        state.error = null
        render()
      })
    })
    document.querySelectorAll('[data-file-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.fileMode
        state.selectedFiles = new Map()
        state.error = null
        render()
      })
    })
    document.querySelectorAll('[data-file-role]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) return
        if (input.dataset.fileRole === 'listening_audio' && !file.name.toLowerCase().endsWith('.mp3')) {
          state.error = '听力音频只接受 MP3 文件'
          render()
          return
        }
        const packageFile = input.dataset.fileRole === 'analyzed_package'
        if (packageFile && !file.name.toLowerCase().endsWith('.zip')) {
          state.error = '完整解析包只接受 ZIP 文件，请使用配套工具重新打包'
          render()
          return
        }
        const limitMb = packageFile ? 256 : 64
        if (file.size > limitMb * 1024 * 1024) {
          state.error = `${file.name} 超过 ${limitMb} MB`
          render()
          return
        }
        state.selectedFiles.set(input.dataset.fileRole, file)
        state.error = null
        render()
      })
    })
    document.querySelectorAll('#intake-form [name]').forEach((control) => {
      control.addEventListener('input', () => {
        if (state.draft) state.draft[control.name] = control.value
      })
      control.addEventListener('change', () => {
        if (state.draft) state.draft[control.name] = control.value
      })
    })
    const form = document.querySelector('#intake-form')
    form?.addEventListener('click', (event) => {
      const submitter = event.target.closest('[data-save-mode]')
      if (submitter) form.dataset.saveMode = submitter.dataset.saveMode
    })
    form?.addEventListener('submit', (event) => {
      event.preventDefault()
      void saveDrawer(event.currentTarget, event.currentTarget.dataset.saveMode === 'submit')
    })
  }

  function hasActiveIntakes() {
    return state.intakes.some((intake) => activeIntakeStates.has(intake.state))
  }

  function stopAutoRefresh() {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = null
  }

  function scheduleAutoRefresh() {
    stopAutoRefresh()
    if (!hasActiveIntakes() || document.hidden || state.drawerOpen) return
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      const active = document.activeElement
      if (document.hidden || state.drawerOpen || active?.matches('input, textarea, select, button, a[href]')) {
        scheduleAutoRefresh()
        return
      }
      void load({ background: true })
    }, refreshIntervalMs)
  }

  async function load({ background = false } = {}) {
    if (refreshing) return
    refreshing = true
    stopAutoRefresh()
    if (!background) state.loading = true
    state.busy = false
    let changed = true
    try {
      const result = await request('/api/source-intakes')
      const intakes = result.intakes || []
      changed = !background || state.error !== null
        || JSON.stringify(intakes) !== JSON.stringify(state.intakes)
      state.intakes = intakes
      state.error = null
    } catch (error) {
      if (/forbidden|not_authenticated/i.test(error.message)) {
        root.innerHTML = accessHtml('这个账号不能进入题源台账', '只有 Owner 可以管理私有题源。')
        return
      }
      state.error = error.message
    } finally {
      state.loading = false
      state.submittingIntakeId = null
      refreshing = false
    }
    if (changed) render()
    scheduleAutoRefresh()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh()
    } else if (hasActiveIntakes() && !state.drawerOpen) {
      void load({ background: true })
    }
  })
  window.addEventListener('pagehide', stopAutoRefresh)

  window.addEventListener('keydown', (event) => {
    if (!state.drawerOpen) return
    if (event.key === 'Escape') {
      closeDrawer()
      return
    }
    if (event.key !== 'Tab') return
    const drawer = document.querySelector('.intake-drawer')
    const focusable = [...(drawer?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
    ) || [])].filter((element) => element.getClientRects().length > 0)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })
  void load()
}
