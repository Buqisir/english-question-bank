import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PAPER_PDF_PRODUCTS, type PaperPdfEdition } from '../../../../shared/paperPdfProducts.mjs'
import { useCurrentUser } from '../../auth/AuthGate.tsx'
import { logout } from '../../auth/session'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { ArrowLeft } from '../../icons'
import { Button, ButtonLink } from '../../shared-ui/Button'
import { ChipToggle } from '../../shared-ui/Chip'
import { EmptyState } from '../../shared-ui/EmptyState'
import { SelectField, TextAreaField } from '../../shared-ui/Field'
import { Notice } from '../../shared-ui/Notice'
import { Row, RowList } from '../../shared-ui/Row'
import { SearchField } from '../../shared-ui/SearchField'
import { Skeleton } from '../../shared-ui/Skeleton'
import { Surface } from '../../shared-ui/Surface'
import { Toast } from '../../shared-ui/Toast'
import { PaperBrowsePage } from '../paper-browse/PaperBrowsePage'
import { usePaperPdfProducts } from '../paper-browse/usePaperPdfProducts'
import {
  coverageLabels, endpoint, issueLabels, request, reviewKey, ReviewRequestError,
  sectionKeys, sections, stateLabels, writeReview, type Coverage, type ReviewDetail, type ReviewPaper,
} from './reviewClient'
import '../../App.css'
import './opsReview.css'

const batches = {
  screen: { title: '卷面待审', description: '核对卷面、题号与答案。' },
  followUp: { title: '讲解追补', description: '已发布且有新版本待审。' },
  returned: { title: '退回修改', description: '查看已退回、等待修正的试卷。' },
} as const
type Batch = keyof typeof batches
type ListView = 'home' | 'all' | Batch
type Tab = 'screen' | 'pdf' | 'history'
const tabs: Record<Tab, string> = { screen: '卷面', pdf: 'PDF', history: '改动摘要' }
const pageSize = 24
const emptyQuestionGroups = new Map()
const goHome = () => { window.location.href = '/' }
const noDraft = () => {}
const emptyFilters = { year: '', sourceType: '', region: '', status: '', coverage: '' }
type ListPosition = { view: ListView; query: string; filters: typeof emptyFilters; page: number; top: number; tableLeft: number }
type PaperRoute = { paperId: string; revisionId: string | null }
type AnswerCorrectionChange = { questionId: string; label: string; from: string; to: string; reason: string; withdrawn: boolean }

function readPaperRoute(): PaperRoute | null {
  const params = new URLSearchParams(window.location.search)
  const paperId = params.get('paper')
  return paperId ? { paperId, revisionId: params.get('rev') } : null
}

function writePaperRoute(route: PaperRoute | null, state: object, method: 'pushState' | 'replaceState') {
  const url = new URL(window.location.href)
  if (route) url.searchParams.set('paper', route.paperId)
  else url.searchParams.delete('paper')
  if (route?.revisionId) url.searchParams.set('rev', route.revisionId)
  else url.searchParams.delete('rev')
  window.history[method](state, '', url)
}

const reviewState = (paper: ReviewPaper) => paper.promotionState || paper.state
const stateName = (state: string) => stateLabels[state] || '未知状态'
const display = (value: string | number) => value === 'unknown' ? '未知' : value
const matchesBatch = (paper: ReviewPaper, batch: Batch) => {
  const state = reviewState(paper)
  if (batch === 'returned') return state === 'changes_requested'
  return state === 'awaiting_review' && (paper.hasEarlierPublication === true) === (batch === 'followUp')
}

function groupByState(papers: ReviewPaper[]) {
  const groups = new Map<string, ReviewPaper[]>()
  for (const paper of papers) {
    const state = reviewState(paper)
    const group = groups.get(state)
    if (group) group.push(paper)
    else groups.set(state, [paper])
  }
  return groups
}

export function OpsReviewPage() {
  const user = useCurrentUser()
  if (user?.role !== 'owner' || user.accountKind === 'import_agent') {
    return <main className="ops-review"><EmptyState primitive="paper" action={{ label: '返回首页', onClick: goHome }}>
      这个账号不能进入导题审核。请使用 Owner 账号登录。
    </EmptyState></main>
  }
  return <OpsReviewWorkspace shellNav={{ user, onLogout: () => { void logout().finally(() => window.location.reload()) } }} />
}

function OpsReviewWorkspace({ shellNav }: { shellNav: AppTopbarNav }) {
  const [route, setRoute] = useState(readPaperRoute)
  const [initialList] = useState<ListPosition | undefined>(() => window.history.state?.opsReviewList)
  const [papers, setPapers] = useState<ReviewPaper[]>([])
  const [view, setView] = useState<ListView>(initialList?.view ?? (route ? 'all' : 'home'))
  const [query, setQuery] = useState(initialList?.query ?? '')
  const [filters, setFilters] = useState(initialList?.filters ?? emptyFilters)
  const [page, setPage] = useState(initialList?.page ?? 0)
  const [pinned, setPinned] = useState<ReviewPaper | null>(null)
  const [routeError, setRouteError] = useState('')
  const [readyScreenKey, setReadyScreenKey] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('screen')
  const [loading, setLoading] = useState(true)
  const [listVersion, setListVersion] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null)
  const [publicationBlock, setPublicationBlock] = useState<{ key: string; error: ReviewRequestError }>()
  const drafts = useRef(new Map<string, string>())
  const uncertain = useRef(new Set<string>())
  const writing = useRef(false)
  const table = useRef<HTMLDivElement>(null)
  const restoreList = useRef(route ? undefined : initialList)

  const load = useCallback(async (signal?: AbortSignal) => {
    setFresh(false)
    setLoading(true)
    setError('')
    try {
      const result = await request<{ papers: ReviewPaper[] }>('/api/import-reviews', { signal })
      if (signal?.aborted) return
      const next = result.papers.filter(paper => paper.reviewKind === 'candidate'
        && paper.latestRevisionId && paper.state !== 'uploading')
      const keys = new Set(next.map(reviewKey))
      let discardedDraft = false
      for (const [key, value] of drafts.current) {
        if (keys.has(key)) continue
        discardedDraft ||= Boolean(value.trim())
        drafts.current.delete(key)
      }
      if (discardedDraft) setNotice('待审版本已变化。请查看新版后重新填写反馈。')
      setPapers(next)
      setListVersion(version => version + 1)
      uncertain.current.clear()
      setFresh(true)
    } catch (failure) {
      if (!signal?.aborted) setError(`状态读取失败。${(failure as Error).message} 请刷新状态。`)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  function open(next: typeof view, sourceType = '') {
    setView(next)
    setQuery('')
    setPage(0)
    setFilters({ ...emptyFilters, sourceType })
  }

  async function mutate(paper: ReviewPaper, url: string, body: object, success: string, method?: 'PATCH') {
    if (!canWrite || reviewKey(paper) !== selectedKey || writing.current) return
    writing.current = true
    setBusy(true)
    setError('')
    setPublicationBlock(undefined)
    setNotice(null)
    try {
      await writeReview(url, body, method)
      if ('surface' in body) drafts.current.delete(reviewKey(paper))
      setNotice(success)
      await load()
    } catch (failure) {
      if (failure instanceof ReviewRequestError
        && failure.code === 'IMPORT_REVIEW_PUBLICATION_COMPATIBILITY_REJECTED' && failure.compatibility) {
        setPublicationBlock({ key: reviewKey(paper), error: failure })
      } else {
        uncertain.current.add(paper.paperId)
        setError(`操作结果需核实。${(failure as Error).message} 先刷新状态。若仍在发布中或失败，请回 Amp 处理。`)
      }
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  const batchPapers = view === 'home' || view === 'all' ? papers : papers.filter(paper => matchesBatch(paper, view))
  const needle = query.trim().toLowerCase()
  const visible = batchPapers.filter(paper => {
    const [section, coverage] = filters.coverage.split('/') as [keyof typeof sections, Coverage]
    return (!needle || `${paper.paperName} ${paper.paperId}`.toLowerCase().includes(needle))
      && (!filters.year || String(paper.year) === filters.year)
      && (!filters.sourceType || paper.sourceType === filters.sourceType)
      && (!filters.region || paper.region === filters.region)
      && (!filters.status || reviewState(paper) === filters.status)
      && (!section || paper.analysisCoverage[section] === coverage)
  })
  const grouped = groupByState(visible)
  const ordered = Array.from(grouped.values()).flat()
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const pageIndex = Math.min(page, pageCount - 1)
  const pagePapers = ordered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  const latest = route && papers.find(paper => paper.paperId === route.paperId)
  const pinnedRoute = pinned && route?.paperId === pinned.paperId && route.revisionId === pinned.latestRevisionId ? pinned : null
  const sameRevision = latest && pinnedRoute && reviewKey(latest) === reviewKey(pinnedRoute)
  const selected = sameRevision ? latest : pinnedRoute
  const selectedKey = selected ? reviewKey(selected) : null
  const correctionsUrl = selected
    ? `${endpoint(selected)}/revisions/${encodeURIComponent(selected.latestRevisionId)}/answer-corrections`
    : null
  const correctionsKey = `${correctionsUrl}:${listVersion}`
  const [correctionResult, setCorrectionResult] = useState<{ key: string; changes?: AnswerCorrectionChange[]; failed?: boolean }>()
  useEffect(() => {
    if (!correctionsUrl) return
    const controller = new AbortController()
    void request<{ corrections: AnswerCorrectionChange[] }>(correctionsUrl, { signal: controller.signal })
      .then(({ corrections }) => {
        if (!controller.signal.aborted) setCorrectionResult({ key: correctionsKey, changes: corrections })
      }).catch(() => {
        if (!controller.signal.aborted) setCorrectionResult({ key: correctionsKey, failed: true })
      })
    return () => controller.abort()
  }, [correctionsUrl, correctionsKey])
  const correctionState = correctionResult?.key === correctionsKey ? correctionResult : undefined
  const answerChanges = correctionState?.changes
  const canWrite = Boolean(selected && sameRevision && readyScreenKey === selectedKey && tab === 'screen'
    && fresh && !busy && !selected.promotionState && !uncertain.current.has(selected.paperId))
  const onScreenReady = useCallback((ready: boolean) => {
    setReadyScreenKey(current => ready ? selectedKey : current === selectedKey ? null : current)
  }, [selectedKey])
  const selectedBlock = publicationBlock?.key === selectedKey ? publicationBlock?.error : undefined
  const markStale = useCallback(() => setFresh(false), [])

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const onPop = (event: PopStateEvent) => {
      const next = readPaperRoute()
      setRoute(next)
      setTab('screen')
      setReadyScreenKey(null)
      setFeedbackKey(null)
      setRouteError('')
      if (next) {
        window.scrollTo(0, 0)
      } else {
        const saved: ListPosition | undefined = event.state?.opsReviewList
        if (saved) {
          setView(saved.view)
          setQuery(saved.query)
          setFilters(saved.filters)
          setPage(saved.page)
          restoreList.current = saved
        }
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    if (route || loading || !restoreList.current) return
    window.scrollTo(0, restoreList.current.top)
    if (table.current) table.current.scrollLeft = restoreList.current.tableLeft
    restoreList.current = undefined
  }, [route, loading])

  useEffect(() => {
    if (!route || pinnedRoute || loading || !fresh) return
    setRouteError('')
    if (!latest) {
      setRouteError('找不到这套待审试卷。请返回列表或刷新状态。')
      return
    }
    if (!route.revisionId || route.revisionId === latest.latestRevisionId) {
      if (!route.revisionId) {
        const exact = { paperId: latest.paperId, revisionId: latest.latestRevisionId }
        writePaperRoute(exact, window.history.state, 'replaceState')
        setRoute(exact)
      }
      setPinned(latest)
      return
    }
    const controller = new AbortController()
    void request<ReviewDetail>(endpoint(latest), { signal: controller.signal }).then(detail => {
      if (controller.signal.aborted) return
      const revision = detail.paperId === route.paperId && detail.revisions.find(item =>
        item.id === route.revisionId && item.reviewKind === 'candidate' && item.state !== 'uploading')
      if (!revision) throw new Error('找不到链接中的审卷版本。')
      setPinned({
        ...latest, paperName: detail.paperName, latestRevisionId: revision.id, revisionNumber: revision.revisionNumber,
        state: revision.state, bundleDigest: revision.bundleDigest, rendererBuildId: revision.rendererBuildId,
        promotionState: null, hasEarlierPublication: 'unknown', hasTeachingAnalyses: false,
        hasMediaCandidates: false, unresolvedCount: 0,
      })
    }).catch(failure => {
      if (!controller.signal.aborted) setRouteError(failure.message)
    })
    return () => controller.abort()
  }, [route, latest, pinnedRoute, loading, fresh])

  function select(paper: ReviewPaper) {
    const opsReviewList: ListPosition = { view, query, filters, page: pageIndex, top: window.scrollY, tableLeft: table.current?.scrollLeft ?? 0 }
    const state = { ...window.history.state, opsReviewList }
    window.history.replaceState(state, '')
    showRevision(paper, 'pushState', { ...state, opsReviewFromList: true })
  }

  function showRevision(paper: ReviewPaper, method: 'pushState' | 'replaceState', state = window.history.state) {
    const next = { paperId: paper.paperId, revisionId: paper.latestRevisionId }
    writePaperRoute(next, state, method)
    setRoute(next)
    setPinned(paper)
    setReadyScreenKey(null)
    setTab('screen')
    setFeedbackKey(null)
    setRouteError('')
    window.scrollTo(0, 0)
  }

  function returnToList() {
    if (window.history.state?.opsReviewFromList) {
      window.history.back()
      return
    }
    writePaperRoute(null, window.history.state, 'replaceState')
    setRoute(null)
    setReadyScreenKey(null)
    setFeedbackKey(null)
    setRouteError('')
    window.scrollTo(0, 0)
  }

  function changeTab(next: Tab) {
    if (next === tab) return
    setReadyScreenKey(null)
    setTab(next)
  }

  function filter(name: keyof typeof emptyFilters, label: string, values: [string, string][]) {
    return <SelectField label={label} value={filters[name]} size="sm"
      options={[{ value: '', label: '全部' }, ...values.map(([value, label]) => ({ value, label }))]}
      onChange={event => { setFilters({ ...filters, [name]: event.target.value }); setPage(0) }} />
  }
  function options(values: (string | number)[], label: (value: string) => string | number = display): [string, string][] {
    return [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      .map(value => [value, String(label(value))])
  }
  const search = <SearchField tier="compact" label="搜索试卷" placeholder="搜索卷名或试卷 ID" submitLabel="搜索试卷"
    value={query} onValueChange={value => { setQuery(value); setPage(0) }}
    onClear={() => { setQuery(''); setPage(0) }} onSubmit={event => event.preventDefault()} />

  function renderToolbar(lectureToggle?: ReactNode) {
    return <header className="ops-review-toolbar">
      <div className="ops-review-toolbar-row">
        <Button icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={returnToList}>返回列表</Button>
        <div className="ops-review-paper-title">
          <h1>{selected?.paperName ?? '试卷审核'}</h1>
          {selected && <p>R{selected.revisionNumber} · {stateName(reviewState(selected))}
            {selected.hasEarlierPublication === 'unknown' && ' · 发布记录未知'}
          </p>}
        </div>
        {selected && <nav className="ops-review-actions" aria-label="预览内容">
          {(Object.keys(tabs) as Tab[]).map(key => <ChipToggle key={key} pressed={key === tab}
            onClick={() => changeTab(key)}>{tabs[key]}</ChipToggle>)}
          {lectureToggle}
        </nav>}
        <div className="ops-review-actions">
          <Button onClick={() => void load()} disabled={busy || loading}>刷新状态</Button>
          {selected?.promotionState === 'published' ? <ButtonLink href={`/?view=paper-browse&paperId=${encodeURIComponent(selected.paperId)}`}>
            查看已发布
          </ButtonLink> : selected && <>
            <Button disabled={!canWrite && !(sameRevision && selected.unresolvedCount > 0)}
              onClick={() => setFeedbackKey(feedbackKey === selectedKey ? null : selectedKey)}
              aria-expanded={feedbackKey === selectedKey}>{selected.unresolvedCount ? '查看反馈' : '退回修改'}</Button>
            <Button tone="solid" disabled={!canWrite || !answerChanges || selected.unresolvedCount > 0
              || !['awaiting_review', 'changes_requested', 'approved'].includes(selected.state)}
              onClick={() => void mutate(selected, `${endpoint(selected)}/revisions/${encodeURIComponent(selected.latestRevisionId)}/publish`,
                { intent: 'publish', bundleDigest: selected.bundleDigest, rendererBuildId: selected.rendererBuildId },
                '发布请求已处理，请以列表中的状态为准')}>发布到题库</Button>
          </>}
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {routeError && <Notice kind="error">{routeError}</Notice>}
      {selected && latest && !sameRevision && <Notice kind="info" action={{
        label: '切换查看', onClick: () => showRevision(latest, 'replaceState'),
      }}>{`有新版本 R${latest.revisionNumber}`}</Notice>}
      {selected && <>
        {correctionState?.failed && <Notice kind="error">答案更正读取失败。请刷新状态。</Notice>}
        {tab !== 'history' && <AnswerCorrectionSummary changes={answerChanges} />}
        {!selected.promotionState && sameRevision && <small>发布即认可并公开这一版{selected.hasTeachingAnalyses ? '，并认可附带讲解为精选官方参考' : ''}。</small>}
        {selected.hasMediaCandidates && <ButtonLink href="/ops/?view=review">到旧审卷页核对候选图</ButtonLink>}
        {selected.promotionState === 'publishing' && <Notice kind="waiting">服务器正在发布，请刷新查看状态。</Notice>}
        {selected.promotionState === 'failed' && <Notice kind="error">请在 Amp 核实失败原因，保留原发布记录。</Notice>}
        {selectedBlock && <>
          <Notice kind="error">{selectedBlock.message}</Notice>
          {selectedBlock.compatibility?.differences?.length ? <ul>
            {selectedBlock.compatibility.differences.map(pointer => <li key={pointer}>{pointer}</li>)}
          </ul> : null}
          {selectedBlock.compatibility?.differencesTruncated && <p>差异较多，仅显示部分位置。</p>}
        </>}
        {sameRevision && selectedKey && feedbackKey === selectedKey && <ReviewFeedback key={`${selectedKey}:${listVersion}`} paper={selected}
          disabled={!canWrite}
          draft={drafts.current.get(selectedKey) ?? ''} onDraft={value => drafts.current.set(selectedKey, value)}
          onCancel={() => setFeedbackKey(null)} onStale={markStale}
          mutate={(url, body, success, method) => void mutate(selected, url, body, success, method)} />}
      </>}
    </header>
  }

  if (route) return <main className="ops-review">
    {selected && tab === 'screen' ? <PaperBrowsePage key={selectedKey}
      embeddedReview renderEmbeddedToolbar={renderToolbar}
      paperId={selected.paperId} reviewRevision={selected.latestRevisionId} onEmbeddedScreenReady={onScreenReady}
      questionGroupById={emptyQuestionGroups} onAddGroupsToBasket={async () => ({ kind: 'none' })}
      currentDraftPaperId={null} currentDraftGroupCount={0} onOpenDraftPaperWorkbench={noDraft}
      onBackToWorkbench={returnToList} shellNav={shellNav}
    /> : <>
      {renderToolbar()}
      {selected ? tab === 'pdf' ? <ReviewPdf key={selectedKey} paper={selected} />
        : <ReviewHistory key={`${selectedKey}:${listVersion}`} paper={selected} answerChanges={answerChanges} />
        : !error && !routeError && <Skeleton height={112} />}
    </>}
    <Toast message={notice} kind="info" duration={6000} onClose={() => setNotice(null)} />
  </main>

  return <div className="ops-review">
    <AppTopbar {...shellNav} pageTitle="试卷审核" onBack={goHome} actionsSlot={<div role="group" aria-label="试卷审核">
        <ChipToggle pressed={view !== 'all'} onClick={() => open('home')}>待处理批次</ChipToggle>
        <ChipToggle pressed={view === 'all'} onClick={() => open('all')}>全部试卷</ChipToggle>
      </div>} />
    <main className="ops-review-main" data-view={view}>
      <header className="ops-review-heading">
        {view !== 'home' && view !== 'all' && <Button onClick={() => open('home')}>返回批次</Button>}
        <h1>{view === 'home' ? '待处理批次' : view === 'all' ? '全部试卷' : batches[view].title}
          {view === 'screen' && filters.sourceType ? ` · ${filters.sourceType}` : ''}
        </h1>
        <Button onClick={() => void load()} disabled={busy || loading}>刷新状态</Button>
      </header>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !papers.length ? <Skeleton height={112} /> : view === 'home' ? (
        <div className="ops-review-batches">
          {(Object.keys(batches) as Batch[]).map(batch => {
            const rows = papers.filter(paper => matchesBatch(paper, batch))
            return <Surface key={batch} variant="board" padding="md" className={`ops-review-batch ops-review-batch--${batch}`}>
              <h2>{batches[batch].title}<span>{rows.length} 套</span></h2>
              <p>{batches[batch].description}</p>
              {batch === 'screen' && <RowList board={false} aria-label="按试卷类型审卷">
                {(['真题', '模拟'] as const).map(kind => {
                  const count = rows.filter(paper => paper.sourceType === kind).length
                  return <Row key={kind} action={{ kind: 'button', label: `${kind} ${count} 套`, onClick: () => open('screen', kind) }}>
                    <span>{kind}</span><span>{count} 套</span>
                  </Row>
                })}
              </RowList>}
              <Button tone="subtle" onClick={() => open(batch)}>打开{batches[batch].title}队列</Button>
            </Surface>
          })}
        </div>
      ) : <>
        {view === 'all' && <Surface variant="board" padding="md" className="ops-review-filters">
          {search}
          {filter('year', '年份', options(papers.map(paper => paper.year)))}
          {filter('region', '地区', options(papers.map(paper => paper.region)))}
          {filter('sourceType', '类型', options(papers.map(paper => paper.sourceType)))}
          {filter('status', '状态', options(papers.map(reviewState), stateName))}
          {filter('coverage', '讲解', sectionKeys.flatMap(section => (Object.keys(coverageLabels) as Coverage[])
            .map((coverage): [string, string] => [`${section}/${coverage}`, `${sections[section]} · ${coverageLabels[coverage]}`])))}
        </Surface>}
        <section className="ops-review-results" aria-label="试卷列表">
          <p className="ops-review-count">{visible.length} 套试卷</p>
          {view !== 'all' && search}
          {pagePapers.length === 0 ? <EmptyState primitive="paper">暂无符合条件的试卷</EmptyState> : view === 'all' ? (
            <Surface ref={table} variant="board" padding="none" className="ops-review-table">
              <table>
                <thead><tr>
                  <th scope="col">试卷</th><th scope="col">年份</th><th scope="col">地区</th><th scope="col">类型</th>
                  {sectionKeys.map(section => <th key={section} scope="col">{sections[section]}</th>)}
                  <th scope="col">未解决</th>
                </tr></thead>
                {Array.from(groupByState(pagePapers), ([state, rows]) => <tbody key={state}>
                  <tr className="ops-review-status"><th scope="rowgroup" colSpan={11}>{stateName(state)} · {grouped.get(state)?.length} 套</th></tr>
                  {rows.map(paper => <tr key={paper.paperId}
                    onClick={() => select(paper)}>
                    <td><button type="button" onClick={event => {
                      event.stopPropagation(); select(paper)
                    }}>{paper.paperName}</button></td>
                    <td>{display(paper.year)}</td><td>{display(paper.region)}</td><td>{display(paper.sourceType)}</td>
                    {sectionKeys.map(section => <td key={section}>{coverageLabels[paper.analysisCoverage[section]]}</td>)}
                    <td>{paper.unresolvedCount}</td>
                  </tr>)}
                </tbody>)}
              </table>
            </Surface>
          ) : <RowList aria-label={batches[view].title}>
            {pagePapers.map(paper => <Row key={paper.paperId}
              action={{ kind: 'button', label: paper.paperName, onClick: () => select(paper) }}>
              <div><strong>{paper.paperName}</strong><small>{display(paper.year)} · {display(paper.region)} · {display(paper.sourceType)}</small></div>
            </Row>)}
          </RowList>}
          {pageCount > 1 && <nav className="ops-review-pagination" aria-label="试卷分页">
            <Button disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>上一页</Button>
            <span>{pageIndex + 1} / {pageCount}</span>
            <Button disabled={pageIndex + 1 >= pageCount} onClick={() => setPage(pageIndex + 1)}>下一页</Button>
          </nav>}
        </section>
      </>}
      <Toast message={notice} kind="info" duration={6000} onClose={() => setNotice(null)} />
    </main>
  </div>
}

function useReviewDetail(paper: ReviewPaper, stateOnly = false) {
  const [detail, setDetail] = useState<ReviewDetail>()
  const [error, setError] = useState('')
  const url = endpoint(paper) + (stateOnly ? '/review-state' : '')
  useEffect(() => {
    const controller = new AbortController()
    void request<ReviewDetail>(url, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      if (result.paperId !== paper.paperId || result.latestRevisionId !== paper.latestRevisionId) {
        throw new Error('待审版本已变化，请刷新状态。')
      }
      setDetail(result)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [url, paper.paperId, paper.latestRevisionId])
  return { detail, error }
}

function ReviewFeedback({ paper, disabled, draft, onDraft, onCancel, onStale, mutate }: {
  paper: ReviewPaper; disabled: boolean; draft: string; onDraft: (value: string) => void
  onCancel: () => void; onStale: () => void
  mutate: (url: string, body: object, success: string, method?: 'PATCH') => void
}) {
  const { detail, error } = useReviewDetail(paper, true)
  const [message, setMessage] = useState(draft)
  useEffect(() => { if (error) onStale() }, [error, onStale])
  if (error) return <Notice kind="error">{error}</Notice>
  if (!detail) return <Skeleton height={48} />
  return <div className="ops-review-feedback">
    {detail.issues.filter(issue => ['open', 'fixed_pending_review'].includes(issue.state)).map(issue =>
      <Fragment key={issue.id}>
        <p>{issue.message} · {issueLabels[issue.state]}</p>
        <div className="ops-review-actions">
          {(issue.state === 'fixed_pending_review' ? ['close', 'dismiss'] : ['dismiss']).map(action =>
            <Button key={action} disabled={disabled} onClick={() => mutate(`${endpoint(paper)}/issues/${encodeURIComponent(issue.id)}`,
              { action, revisionId: paper.latestRevisionId }, '反馈已更新，试卷尚未发布', 'PATCH')}>
              {action === 'close' ? '确认已解决' : '撤销这条反馈'}
            </Button>)}
        </div>
      </Fragment>)}
    <form onSubmit={event => {
      event.preventDefault()
      if (!disabled && message.trim()) mutate(`${endpoint(paper)}/issues`, {
        revisionId: paper.latestRevisionId, bundleDigest: paper.bundleDigest, surface: 'paper', message: message.trim(),
      }, '已退回修改')
    }}>
      <TextAreaField label="需要修改什么？" placeholder="例如：第 3 题的选项被遮挡，请调整后重新送审。"
        value={message} autoFocus required rows={3} maxLength={4000} disabled={disabled}
        onChange={event => { setMessage(event.target.value); onDraft(event.target.value) }} />
      <div className="ops-review-actions">
        <Button type="submit" tone="strong" disabled={disabled || !message.trim()}>提交退回</Button>
        <Button onClick={onCancel}>收起</Button><small>提交后由 Agent 自动处理</small>
      </div>
    </form>
  </div>
}

function AnswerCorrectionSummary({ changes }: { changes?: AnswerCorrectionChange[] }) {
  if (!changes?.length) return null
  return <Surface as="section" variant="board" padding="md" aria-label="答案更正">
    <h3>答案更正</h3>
    <ul>{changes.map(change => <li key={change.questionId}>
      <strong>{change.withdrawn ? '撤销更正 · ' : ''}{change.label}：{change.from} → {change.to}</strong>
      <p>{change.reason}</p>
    </li>)}</ul>
  </Surface>
}

function ReviewHistory({ paper, answerChanges }: { paper: ReviewPaper; answerChanges?: AnswerCorrectionChange[] }) {
  const { detail, error } = useReviewDetail(paper)
  if (error) return <Notice kind="error">{error}</Notice>
  if (!detail) return <Skeleton height={96} />
  return <div className="ops-review-history">
    <AnswerCorrectionSummary changes={answerChanges} />
    <h3>版本历史</h3>
    {detail.revisions.length ? <ul>{detail.revisions.map(revision => <li key={revision.id}>
      R{revision.revisionNumber} · {stateName(revision.state)} · <time dateTime={revision.createdAt}>
        {new Date(revision.createdAt).toLocaleDateString('zh-CN')}
      </time>
    </li>)}</ul> : <p>暂无记录</p>}
    <h3>问题记录</h3>
    {detail.issues.length ? <ul>{detail.issues.map(issue => <li key={issue.id}>
      {issue.message} · {issueLabels[issue.state] || '未知状态'}
      {issue.resolutionNote && <p>{issue.resolutionNote}</p>}
    </li>)}</ul> : <p>暂无记录</p>}
  </div>
}

function ReviewPdf({ paper }: { paper: ReviewPaper }) {
  const { editions, edition, setEdition, error, retry } = usePaperPdfProducts({
    paperId: paper.paperId, revisionId: paper.latestRevisionId, defaultEdition: 'largeComplete',
  })
  if (error) return <Notice kind="error" action={{ label: '刷新 PDF 版本', onClick: retry }}>{error}</Notice>
  if (!edition) return <Skeleton height={96} />
  const pdfUrl = `/api/import-review-preview/revisions/${encodeURIComponent(paper.latestRevisionId)}/pdf?edition=${edition}`
  return <div className="ops-review-pdf">
    <div className="ops-review-actions">
      <SelectField label="PDF 版本" value={edition} size="sm"
        options={editions.map(value => ({ value, label: PAPER_PDF_PRODUCTS[value] }))}
        onChange={event => setEdition(event.target.value as PaperPdfEdition)} />
      <ButtonLink href={pdfUrl} target="_blank" rel="noopener noreferrer">在新标签打开 PDF</ButtonLink>
    </div>
    <iframe title={`${paper.paperName} · ${PAPER_PDF_PRODUCTS[edition]}`} src={pdfUrl} />
  </div>
}
