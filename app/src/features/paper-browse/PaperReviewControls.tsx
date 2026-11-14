import { useEffect, useState } from 'react'
import { PAPER_PDF_PRODUCTS, type PaperPdfEdition } from '../../../../shared/paperPdfProducts.mjs'
import { usePaperPdfProducts } from './usePaperPdfProducts'
import { Button, ButtonLink } from '../../shared-ui/Button.tsx'
import './paperReviewControls.css'

type ReviewDetail = {
  paperId: string
  latest: { id: string } | null
  discussionThreadId: string | null
  published?: { revisionId: string; publicationDigest: string; sourceAssetVersion: number } | null
}

export function PaperReviewControls({ paperId, paperName, revisionId, publication }: {
  paperId: string
  paperName: string
  revisionId?: string
  publication?: { publicationDigest: string; sourceAssetVersion: number }
}) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const { editions, edition, setEdition, error: productError, retry: retryProducts } =
    usePaperPdfProducts({ paperId, revisionId, defaultEdition: 'largeComplete' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manualCopy, setManualCopy] = useState('')
  const [continueUrl, setContinueUrl] = useState('')
  const [refresh, setRefresh] = useState(0)
  const endpoint = `/api/import-reviews/papers/${encodeURIComponent(paperId)}`
  const publicationQuery = publication ? `?${new URLSearchParams({
    publicationDigest: publication.publicationDigest, sourceAssetVersion: String(publication.sourceAssetVersion),
  })}` : ''

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${endpoint}/product-review${publicationQuery}`, {
      signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error('暂时找不到对应线程，仍可复制试卷信息到 Amp。')
      const result = await response.json() as ReviewDetail
      if (result.paperId !== paperId) throw new Error('试卷与线程信息不一致，请刷新重试。')
      if (!controller.signal.aborted) { setDetail(result); setError('') }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error))
    })
    return () => controller.abort()
  }, [endpoint, paperId, refresh, publicationQuery])

  const threadUrl = /^T-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(detail?.discussionThreadId || '')
    ? `https://ampcode.com/threads/${detail!.discussionThreadId}` : ''
  const current = revisionId && detail?.latest?.id === revisionId
  const pdfUrl = revisionId && edition
    ? `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/pdf?edition=${edition}` : ''

  async function discuss() {
    if (busy) return
    // Reserve the tab during the click, before clipboard permission can consume
    // user activation. It cannot access the review page's opener/session.
    const tab = threadUrl ? window.open('about:blank', '_blank') : null
    if (tab) tab.opener = null
    const publishedRevision = detail?.published?.publicationDigest === publication?.publicationDigest
      && detail?.published?.sourceAssetVersion === publication?.sourceAssetVersion
      ? detail?.published?.revisionId : undefined
    const viewedRevision = revisionId || publishedRevision
    const preview = new URL('/', window.location.origin)
    preview.search = new URLSearchParams({ view: 'paper-browse', paperId,
      ...(viewedRevision ? { reviewRevision: viewedRevision } : {}) }).toString()
    const text = [
      `试卷：${paperName}`, `试卷 ID：${paperId}`,
      ...(viewedRevision ? [`查看版本：${viewedRevision}`] : []),
      ...(publication ? [`发布版本：v${publication.sourceAssetVersion}`, `发布绑定：${publication.publicationDigest}`] : []),
      `查看页面：Screen${publication ? '（已发布）' : '（私有审阅）'}`,
      ...(publication ? [
        `公开页面（可能已更新）：${new URL(`/?${new URLSearchParams({ view: 'paper-browse', paperId })}`, window.location.origin).href}`,
        ...(publishedRevision ? [`对应发布版本的私有预览：${preview.href}`] : ['未取得对应版本的私有预览；请按发布绑定核对，不要用当前公开页代替。']),
      ] : [`预览：${preview.href}`]),
      '请先针对这个版本与我讨论，不自动修改、批准或发布。',
    ].join('\n')
    setBusy(true)
    setNotice('')
    setManualCopy('')
    setContinueUrl('')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      tab?.close()
      setManualCopy(text)
      setContinueUrl(threadUrl)
      setNotice('浏览器未允许复制。手动复制下面的信息，再去 Amp 粘贴。')
      setBusy(false)
      return
    }
    let opened = false
    if (tab && !tab.closed && threadUrl) {
      try {
        tab.location.replace(threadUrl)
        opened = true
      } catch {
        tab.close()
      }
    }
    if (opened) {
      setNotice('已复制试卷信息。在 Amp 粘贴后直接聊，尚未发送消息。')
    } else if (threadUrl) {
      setContinueUrl(threadUrl)
      setNotice('已复制试卷信息。浏览器未打开新标签，请点下面的链接。')
    } else {
      setNotice('已复制试卷信息。这份卷尚未关联线程，先在 Amp 粘贴给我。')
    }
    setBusy(false)
  }

  return <section className="paper-review-controls" aria-label="检查这份卷">
    <div className="paper-review-controls-row">
      {revisionId && <><select className="ghost-button" aria-label="查看哪款 PDF" value={edition ?? ''}
        disabled={!edition} onChange={event => setEdition(event.target.value as PaperPdfEdition)}>
        {editions.map(edition => <option key={edition} value={edition}>{PAPER_PDF_PRODUCTS[edition]}</option>)}
      </select>
      {/* 构件厂第 4 步第九页（2026-11-14，提案 · 单一来源）：这一排的链接和按钮换成 ButtonLink / Button。
          原来的全站 .ghost-button 是透明底墨字、高 36，对上 strong lg；这一行 44 的最小高度仍由 paperReviewControls.css 给。
          「复制中…」沿用原来的整键禁用，没改成 busy：禁用条件里还有「线程信息没回来」，两件事分不开。 */}
      {pdfUrl && <ButtonLink tone="strong" size="lg" href={pdfUrl} target="_blank" rel="noopener noreferrer">查看 PDF</ButtonLink>}</>}
      <Button tone="strong" size="lg" disabled={busy || (!detail && !error)} onClick={() => void discuss()}>
        {busy ? '复制中…' : threadUrl ? '去 Amp 聊这份卷' : '复制试卷信息'}
      </Button>
    </div>
    {revisionId && detail && !current && <p>你正在看旧版，复制的信息会保留这一版。</p>}
    {notice && <p role="status">{notice}</p>}
    {revisionId && productError && <p role="alert">{productError}{' '}
      <Button tone="strong" size="lg" onClick={retryProducts}>刷新 PDF 版本</Button>
    </p>}
    {error && <p role="alert">{error}{' '}
      <Button tone="strong" size="lg" onClick={() => setRefresh(value => value + 1)}>刷新</Button>
    </p>}
    {manualCopy && <textarea aria-label="手动复制试卷信息" value={manualCopy} readOnly rows={7}
      onFocus={event => event.currentTarget.select()} />}
    {continueUrl && <p><a href={continueUrl} target="_blank" rel="noopener noreferrer">打开对应 Amp 线程</a></p>}
  </section>
}
