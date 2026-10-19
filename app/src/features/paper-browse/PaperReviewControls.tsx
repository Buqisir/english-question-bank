import { useEffect, useState } from 'react'
import { PAPER_PDF_PRODUCTS, type PaperPdfEdition } from '../../../../shared/paperPdfProducts.mjs'
import { usePaperPdfProducts } from './usePaperPdfProducts'
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
      {pdfUrl && <a className="ghost-button" href={pdfUrl} target="_blank" rel="noopener noreferrer">查看 PDF</a>}</>}
      <button className="ghost-button" type="button" disabled={busy || (!detail && !error)} onClick={() => void discuss()}>
        {busy ? '复制中…' : threadUrl ? '去 Amp 聊这份卷' : '复制试卷信息'}
      </button>
    </div>
    {revisionId && detail && !current && <p>你正在看旧版，复制的信息会保留这一版。</p>}
    {notice && <p role="status">{notice}</p>}
    {revisionId && productError && <p role="alert">{productError}{' '}
      <button className="ghost-button" type="button" onClick={retryProducts}>刷新 PDF 版本</button>
    </p>}
    {error && <p role="alert">{error}{' '}
      <button className="ghost-button" type="button" onClick={() => setRefresh(value => value + 1)}>刷新</button>
    </p>}
    {manualCopy && <textarea aria-label="手动复制试卷信息" value={manualCopy} readOnly rows={7}
      onFocus={event => event.currentTarget.select()} />}
    {continueUrl && <p><a href={continueUrl} target="_blank" rel="noopener noreferrer">打开对应 Amp 线程</a></p>}
  </section>
}
