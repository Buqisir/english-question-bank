import { useEffect, useState } from 'react'
import { PAPER_PDF_EDITIONS, type PaperPdfEdition } from '../../../../shared/paperPdfProducts.mjs'

type ProductInventory = {
  paperId: string
  revisionId?: string
  publicationDigest?: string
  editions: PaperPdfEdition[]
}

export function usePaperPdfProducts({
  paperId, revisionId, publicationDigest, defaultEdition = 'largeNoListening',
}: {
  paperId: string
  revisionId?: string
  publicationDigest?: string
  defaultEdition?: PaperPdfEdition
}) {
  const key = JSON.stringify([paperId, revisionId, publicationDigest])
  const [result, setResult] = useState<{ key: string; editions: PaperPdfEdition[]; error: string } | null>(null)
  const [selection, setSelection] = useState<{ key: string; edition: PaperPdfEdition } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const endpoint = revisionId
    ? `/api/import-review-preview/revisions/${encodeURIComponent(revisionId)}/products`
    : publicationDigest
      ? `/api/exports/papers/${encodeURIComponent(paperId)}/products?${new URLSearchParams({ publicationDigest })}`
      : ''

  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    void fetch(endpoint, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('PDF 版本加载失败，请刷新重试。')
        const inventory = await response.json() as ProductInventory
        if (inventory.paperId !== paperId
          || (revisionId ? inventory.revisionId !== revisionId : inventory.publicationDigest !== publicationDigest)
          || !Array.isArray(inventory.editions) || !inventory.editions.length
          || new Set(inventory.editions).size !== inventory.editions.length
          || inventory.editions.some(edition => !PAPER_PDF_EDITIONS.includes(edition))) {
          throw new Error('PDF 与查看版本不一致，请刷新重试。')
        }
        if (!controller.signal.aborted) setResult({ key, editions: inventory.editions, error: '' })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, editions: [], error: 'PDF 版本加载失败，请刷新重试。' })
      })
    return () => controller.abort()
  }, [endpoint, key, paperId, revisionId, publicationDigest, refresh])

  // Derive from the current identity during render, so a changed paper/revision
  // cannot briefly expose the previous version's selection or download link.
  const editions = endpoint && result?.key === key ? result.editions : []
  const preferred = editions.includes(defaultEdition) ? defaultEdition : editions[0]
  const edition = selection?.key === key && editions.includes(selection.edition)
    ? selection.edition : preferred
  return {
    editions, edition,
    setEdition: (edition: PaperPdfEdition) => setSelection({ key, edition }),
    error: endpoint && result?.key === key ? result.error : '',
    retry: () => setRefresh(value => value + 1),
  }
}
