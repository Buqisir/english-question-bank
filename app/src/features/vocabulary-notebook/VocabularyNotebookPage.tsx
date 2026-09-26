import { useEffect, useState } from 'react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar.tsx'
import { ChevronRight, Paper } from '../../icons'
import { PaperFontGate } from '../../shared-ui/papersurface/PaperFontGate.tsx'
import { fetchQuestionGroups } from '../../services/questionGroups.ts'
import {
  fetchNotebookPaper,
  fetchNotebookPapers,
  type NotebookContext,
  type NotebookEntry,
  type NotebookPaper,
  type NotebookPaperDetail,
} from '../../services/vocabularyNotebook.ts'
import './vocabularyNotebook.css'

type PaperTitles = {
  title: string
  groups: Record<string, string>
}

function pronounce(entry: NotebookEntry) {
  const seen = new Set<string>()
  const items: string[] = []
  for (const group of entry.pronunciations) {
    for (const item of group.items) {
      const key = `${item.ipa}|${item.dialect}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(`${item.ipa} ${item.dialect}`)
    }
  }
  return items.length ? items.join('  ') : '音标暂缺'
}

function MarkedSentence({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <>
      {text.slice(0, start)}
      <strong>{text.slice(start, end)}</strong>
      {text.slice(end)}
    </>
  )
}

function MarkedTranslation({ text, ranges }: { text: string; ranges: NotebookContext['targetRanges'] }) {
  const range = ranges.find((item) => text.slice(item.start, item.end) === item.quote)
  if (!range) return text
  return (
    <>
      {text.slice(0, range.start)}
      <strong>{text.slice(range.start, range.end)}</strong>
      {text.slice(range.end)}
    </>
  )
}

async function loadPaperTitles(paperId: string): Promise<PaperTitles | null> {
  let response = await fetch(`/paper-assets/${encodeURIComponent(paperId)}/latest/paper-asset.json`)
  if (!response.ok) response = await fetch(`/paper-assets/${encodeURIComponent(paperId)}/paper-asset.json`)
  if (!response.ok) return null
  const asset = await response.json()
  const groups: Record<string, string> = {}
  for (const part of asset.layoutTree?.parts || []) {
    for (const section of part.sections || []) {
      for (const group of section.groups || []) {
        if (group.groupId && group.title) groups[group.groupId] = group.title
      }
    }
  }
  const cards = await fetchQuestionGroups().catch(() => [])
  const named = cards.find((card) => card.canonicalPaperId === paperId && card.paperName.trim())
  return { title: named?.paperName.trim() || asset.paper?.title || '', groups }
}

function NotebookSheet({
  detail,
  titles,
}: {
  detail: NotebookPaperDetail
  titles: PaperTitles | null
}) {
  const title = titles?.title || (detail.paperTitle === '未命名试卷' ? detail.paperId : detail.paperTitle)
  return (
    <article className="notebook-sheet" aria-label={title}>
      <h1 className="canonical-paper-cover-title">{title}</h1>
      {detail.revisions.map((revision) => (
        <section key={revision.sourceRevision}>
          {revision.groups.map((group) => (
            <div key={group.groupId}>
              <h2 className="notebook-passage">{titles?.groups[group.groupId] || group.groupLabel}</h2>
              {group.entries.map((entry) => (
                <section key={entry.id} className="notebook-word">
                  <p className="notebook-head">
                    <strong>{entry.headword}</strong>
                    <span>{pronounce(entry)}</span>
                  </p>
                  <p>{entry.meanings.length ? entry.meanings.join('；') : '待补全'}</p>
                  {entry.contexts.map((context) => (
                    <div key={context.id} className="notebook-example">
                      <p>
                        <MarkedSentence
                          text={context.source.sentenceText}
                          start={context.source.selectionInSentence.start}
                          end={context.source.selectionInSentence.end}
                        />
                      </p>
                      {context.translationZh ? (
                        <p><MarkedTranslation text={context.translationZh} ranges={context.targetRanges} /></p>
                      ) : null}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ))}
        </section>
      ))}
      {detail.entryCount === 0 ? <p>这一卷还没有生词。</p> : null}
    </article>
  )
}

export function VocabularyNotebookPage({
  paperId,
  shellNav,
  onBack,
  onOpenPaper,
  onOpenList,
}: {
  paperId: string | null
  shellNav: AppTopbarNav
  onBack: () => void
  onOpenPaper: (paperId: string) => void
  onOpenList: () => void
}) {
  const [papers, setPapers] = useState<NotebookPaper[] | null>(null)
  const [paperNames, setPaperNames] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<NotebookPaperDetail | null>(null)
  const [titles, setTitles] = useState<PaperTitles | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const reload = () => {
      const request = paperId
        ? Promise.all([fetchNotebookPaper(paperId), loadPaperTitles(paperId)]).then(([nextDetail, nextTitles]) => {
          if (cancelled) return
          setDetail(nextDetail)
          setTitles(nextTitles)
        })
        : fetchNotebookPapers().then((result) => {
          if (!cancelled) setPapers(result.papers)
        })
      request.catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '生词本没有打开')
      })
    }
    reload()
    const channel = new BroadcastChannel('eqb-vocabulary-notebook')
    channel.addEventListener('message', reload)
    return () => {
      cancelled = true
      channel.removeEventListener('message', reload)
      channel.close()
    }
  }, [paperId])

  useEffect(() => {
    if (!papers?.length) return
    let cancelled = false
    fetchQuestionGroups().then((cards) => {
      if (cancelled) return
      const names: Record<string, string> = {}
      for (const paper of papers) {
        const named = cards.find((card) => card.canonicalPaperId === paper.paperId && card.paperName.trim())
        if (named) names[paper.paperId] = named.paperName.trim()
      }
      setPaperNames(names)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [papers])

  return (
    <div className="notebook-page">
      <AppTopbar
        {...shellNav}
        pageTitle="生词本"
        onBack={paperId ? onOpenList : onBack}
      />
      {paperId ? (
        <PaperFontGate>
          <main className="notebook-desk">
            {error ? <p className="notebook-status">{error}</p> : null}
            {detail ? <NotebookSheet detail={detail} titles={titles} /> : <p className="notebook-status">正在打开这张纸…</p>}
          </main>
        </PaperFontGate>
      ) : (
        <main className="notebook-main">
          {error ? <p className="notebook-empty">{error}</p> : null}
          {papers && papers.length === 0 ? <p className="notebook-empty">在试卷中选中单词，点击加入生词本</p> : null}
          {papers && papers.length > 0 ? (
            <section className="home-section" aria-label="已收藏的卷">
              <h2 className="home-section-label">已收藏</h2>
              <ul className="home-row-list">
                {papers.map((paper) => {
                  const title = paperNames[paper.paperId]
                    || (paper.paperTitle !== '未命名试卷' ? paper.paperTitle : paper.paperId)
                  return (
                    <li key={paper.paperId}>
                      <button type="button" className="home-row" onClick={() => onOpenPaper(paper.paperId)} aria-label={title}>
                        <span className="home-row-icon" aria-hidden="true"><Paper size={16} /></span>
                        <span className="home-row-text">
                          <span className="home-row-title">{title}</span>
                        </span>
                        <span className="home-row-aside">
                          <span className="home-row-time">{paper.entryCount} 个生词</span>
                          <ChevronRight size={14} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </main>
      )}
    </div>
  )
}
