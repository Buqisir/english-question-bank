import { useEffect, useRef, useState } from 'react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar.tsx'
import { ChevronRight, Paper } from '../../icons'
import { EmptyState } from '../../shared-ui/EmptyState.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { Skeleton, SkeletonGate } from '../../shared-ui/Skeleton.tsx'
import { useRowReveal } from '../../shared-ui/useRowReveal.ts'
import { PaperFontGate } from '../../shared-ui/papersurface/PaperFontGate.tsx'
import { ensurePaperFonts } from '../../shared-ui/papersurface/paperFontLoader.ts'
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

// 一张纸的灰块（等待第五轮，2026-11-15；原来是纸上方居中一行「正在打开这张纸」）。
// 纸用真纸同一个 class（.notebook-sheet：宽、页边、白底、纸面阴影都是那一条规则给的），里面照真纸排：
// 卷名一行、篇名一行、三个生词（词头 + 音标一行、释义一行、例句和译文两行）。字的位置放灰块，行高由真规则给。
const NOTEBOOK_SKELETON_WORDS = [
  { head: 72, phonetic: 140, meaning: '46%', example: '100%', translation: '62%' },
  { head: 96, phonetic: 120, meaning: '38%', example: '92%', translation: '54%' },
  { head: 64, phonetic: 150, meaning: '52%', example: '100%', translation: '70%' },
]

function NotebookSheetSkeleton() {
  return (
    <div className="notebook-sheet notebook-skeleton" aria-hidden="true">
      <h1 className="canonical-paper-cover-title"><Skeleton width={240} height={20} /></h1>
      <div>
        <h2 className="notebook-passage"><Skeleton width={120} height={12} /></h2>
        {NOTEBOOK_SKELETON_WORDS.map((word, index) => (
          <section key={index} className="notebook-word">
            <p className="notebook-head">
              <Skeleton width={word.head} height={14} />
              <Skeleton width={word.phonetic} height={10} />
            </p>
            <p><Skeleton width={word.meaning} height={10} /></p>
            <div className="notebook-example">
              <p><Skeleton width={word.example} height={10} /></p>
              <p><Skeleton width={word.translation} height={10} /></p>
            </div>
          </section>
        ))}
      </div>
    </div>
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
  // 等待第四轮（2026-11-15）：收藏的卷第一次读回来时，一行行依次淡入；从一张纸返回列表不再演（once）。
  const paperListRef = useRef<HTMLElement>(null)
  useRowReveal(paperListRef, '.home-row-list > li', (papers?.length ?? 0) > 0, { once: true })
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
    // 纸面字体和这张纸一起读（灰块挪出 PaperFontGate 以后，免得等纸到了才开始读字体）。读不到由 PaperFontGate 照旧报。
    if (paperId) void ensurePaperFonts('').catch(() => undefined)
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
        // 等待第五轮（2026-11-15）：灰块在 PaperFontGate 外面，一打开就走门槛，不等纸面字体；字体照旧由 PaperFontGate 管真纸。
        // 原来 PaperFontGate 包着整块（连「正在打开这张纸」那一行），字体和这张纸一起读；挪出来以后在下面的 effect 里先读通用字体，仍是一起读。
        <main className="notebook-desk">
          {error ? <Notice kind="error" className="notebook-status">{error}</Notice> : null}
          <SkeletonGate pending={!detail && !error} label="正在打开这张纸" skeleton={<NotebookSheetSkeleton />}>
            {detail ? (
              <PaperFontGate>
                <NotebookSheet detail={detail} titles={titles} />
              </PaperFontGate>
            ) : null}
          </SkeletonGate>
        </main>
      ) : (
        <main className="notebook-main" ref={paperListRef}>
          {error ? <Notice kind="error" className="notebook-error">{error}</Notice> : null}
          {papers && papers.length === 0 ? (
            <EmptyState className="notebook-empty-state" illustration="vocabulary-notebook" action={{ label: '去找题', onClick: onBack }}>
              看卷时选中单词，点「加入生词本」，就会收到这里。
            </EmptyState>
          ) : null}
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
