/**
 * applied-writing-lecture D4 — B2 框内翻页内容。宿主是 WritingPaperPage 的
 * 答题框（放大态），本组件只负责三块（① 审题卡 / ② 范文·标志 / ③ 亮点
 * 表达）的内容 + 翻页手势（页签 / 胶囊点点 / 横滑 / 拖拽 / ←→ 键交给
 * PaperBrowsePage 统一接线），像素/交互按拍板件
 * docs/cuts/applied-writing-lecture/prototype.html 的 B2 案 1:1 复刻。
 *
 * 全部新类名 pi-writing-review-*（本刀小板 1：白名单账目零变动，全批留
 * 续写渲染刀）。仅讲评态挂载，讲评栏之外（打印/PDF/DOCX/学生版）从不
 * import 本文件 —— Super Teacher Boundary 天然成立。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type {
  ApplicationWritingAnalysis,
  HighlightExpression,
  ReviewCard,
  ReviewGrid,
  ReviewMark,
} from '../../domain/paperAsset.ts'

export type PublishedApplicationWritingAnalysis = ApplicationWritingAnalysis & {
  reviewCard: ReviewCard
  reviewMarks: ReviewMark[]
}

export type WritingAnswerBoxReviewProps = {
  analysis: PublishedApplicationWritingAnalysis
  page: number
  onSetPage: (page: number) => void
  onClose: () => void
}

type CardCellId = ReviewGrid | 'value'

const CARD_CELLS: ReadonlyArray<{ id: CardCellId; label: string }> = [
  { id: 'genre', label: '判型' },
  { id: 'readerWant', label: '读者 · 最想要的一句话' },
  { id: 'readerChecklist', label: '读者 · 落纸清单' },
  { id: 'tense', label: '主时态' },
  { id: 'points', label: '要点编号' },
  { id: 'value', label: '价值落点' },
]

// 屏显字模映射（decisions.md §3）：价值落点格无标志——真源如此，标志只有五种。
const MARK_TAG: Record<ReviewGrid, string> = {
  genre: '判',
  readerWant: '读',
  tense: '时',
  points: '点',
  readerChecklist: '清',
}

const CARD_LABEL: Record<ReviewGrid, string> = {
  genre: '判型',
  readerWant: '读者 · 最想要的一句话',
  readerChecklist: '读者 · 落纸清单',
  tense: '主时态',
  points: '要点编号',
}

function cellText(card: ReviewCard, id: CardCellId): string {
  switch (id) {
    case 'genre':
      return card.genre
    case 'readerWant':
      return card.readerWant
    case 'readerChecklist':
      return card.readerChecklist.join(' / ')
    case 'tense':
      return card.tense
    case 'points':
      return card.points.join('　')
    case 'value':
      return card.value
    default:
      return ''
  }
}

export function WritingAnswerBoxReview({
  analysis,
  page,
  onSetPage,
  onClose,
}: WritingAnswerBoxReviewProps): ReactNode {
  const { reviewCard, reviewMarks, highlightExpressions, modelAnswer } = analysis
  const clampedPage = Math.max(0, Math.min(2, page))

  // 卡↔文互指: click 锁定一个标志(再点同一个取消)，hover 只在无锁定时预览
  // ——镜像 prototype.html 的 wireMarks() 语义。
  const [lockedMarkIndex, setLockedMarkIndex] = useState<number | null>(null)
  const [hoverMarkIndex, setHoverMarkIndex] = useState<number | null>(null)
  const activeMarkIndex = lockedMarkIndex ?? hoverMarkIndex

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const slideRefs = useRef<Array<HTMLElement | null>>([null, null, null])
  const dragRef = useRef<{ startX: number } | null>(null)

  // 框高随当前块过渡（syncHeight 镜像 prototype.html initCarousel）。
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const slide = slideRefs.current[clampedPage]
    if (!viewport || !slide) return
    const sync = (): void => {
      viewport.style.height = `${slide.scrollHeight}px`
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(slide)
    return (): void => observer.disconnect()
  }, [clampedPage, reviewCard, reviewMarks, highlightExpressions, modelAnswer, activeMarkIndex])

  function go(next: number): void {
    onSetPage(Math.max(0, Math.min(2, next)))
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    if (Math.abs(event.deltaX) < 24) return
    event.preventDefault()
    go(clampedPage + (event.deltaX > 0 ? 1 : -1))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest('button')) return
    dragRef.current = { startX: event.clientX }
    if (trackRef.current) trackRef.current.classList.add('pi-writing-review-track--dragging')
  }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current || !trackRef.current) return
    const dx = event.clientX - dragRef.current.startX
    trackRef.current.style.transform = `translateX(calc(-${clampedPage * 100}% + ${dx}px))`
  }
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current || !trackRef.current) return
    const dx = event.clientX - dragRef.current.startX
    dragRef.current = null
    trackRef.current.classList.remove('pi-writing-review-track--dragging')
    trackRef.current.style.transform = ''
    if (Math.abs(dx) > 60) go(clampedPage + (dx < 0 ? 1 : -1))
  }

  return (
    <div className="pi-writing-review" onClick={(event) => event.stopPropagation()}>
      <div className="pi-writing-review-head">
        <span className="pi-writing-review-head-title">讲评 · 应用文解析</span>
        <span className="pi-writing-review-head-badge">仅讲评屏显 · 不进打印/学生版</span>
        <button type="button" className="pi-writing-review-close" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="pi-writing-review-tabs">
        {(['① 审题卡', '② 范文 · 标志', '③ 亮点表达'] as const).map((label, i) => (
          <button
            key={label}
            type="button"
            className={i === clampedPage ? 'on' : ''}
            onClick={() => go(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="pi-writing-review-viewport"
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="pi-writing-review-track"
          ref={trackRef}
          style={{ transform: `translateX(-${clampedPage * 100}%)` }}
        >
          <section
            className={['pi-writing-review-slide', clampedPage === 0 ? 'on' : ''].filter(Boolean).join(' ')}
            ref={(el) => {
              slideRefs.current[0] = el
            }}
          >
            {renderCard(reviewCard, activeMarkIndex, reviewMarks)}
          </section>
          <section
            className={['pi-writing-review-slide', clampedPage === 1 ? 'on' : ''].filter(Boolean).join(' ')}
            ref={(el) => {
              slideRefs.current[1] = el
            }}
          >
            {renderModel({
              modelAnswer,
              card: reviewCard,
              marks: reviewMarks,
              activeMarkIndex,
              onEnter: (i) => setHoverMarkIndex(i),
              onLeave: (i) => setHoverMarkIndex((prev) => (prev === i ? null : prev)),
              onClick: (i) => setLockedMarkIndex((prev) => (prev === i ? null : i)),
            })}
          </section>
          <section
            className={['pi-writing-review-slide', clampedPage === 2 ? 'on' : ''].filter(Boolean).join(' ')}
            ref={(el) => {
              slideRefs.current[2] = el
            }}
          >
            {renderHighlights(highlightExpressions)}
          </section>
        </div>
      </div>
      <div className="pi-writing-review-dots">
        {[0, 1, 2].map((i) => (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 胶囊点点镜像 prototype，纯指示点击
          <i key={i} className={i === clampedPage ? 'on' : ''} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  )
}

function renderCard(card: ReviewCard, activeMarkIndex: number | null, marks: ReviewMark[]): ReactNode {
  const activeGrid = activeMarkIndex != null ? marks[activeMarkIndex]?.grid : null
  return (
    <div className="pi-writing-review-card">
      {CARD_CELLS.map((cell) => (
        <div
          key={cell.id}
          className={['pi-writing-review-cell', activeGrid === cell.id ? 'pi-writing-review-cell--hot' : ''].filter(Boolean).join(' ')}
          data-review-cell={cell.id}
        >
          <b>{cell.label}</b>
          <span>{cellText(card, cell.id)}</span>
        </div>
      ))}
    </div>
  )
}

function renderModel(args: {
  modelAnswer: string
  card: ReviewCard
  marks: ReviewMark[]
  activeMarkIndex: number | null
  onEnter: (index: number) => void
  onLeave: (index: number) => void
  onClick: (index: number) => void
}): ReactNode {
  const { modelAnswer, card, marks, activeMarkIndex, onEnter, onLeave, onClick } = args
  const lines = modelAnswer.split('\n').filter((line) => line.trim().length > 0)
  const activeMark = activeMarkIndex != null ? marks[activeMarkIndex] : null
  return (
    <div className="pi-writing-review-model">
      {lines.map((line, lineIndex) => (
        <p key={lineIndex}>
          {renderLineWithMarks({ line, marks, activeMarkIndex, onEnter, onLeave, onClick })}
        </p>
      ))}
      {activeMark && (
        <div className="pi-writing-review-marknote">
          <b>
            〔{MARK_TAG[activeMark.grid]}〕→ {CARD_LABEL[activeMark.grid]}「{cellText(card, activeMark.grid)}」
          </b>{' '}
          {activeMark.note}
        </div>
      )}
      <p className="pi-writing-review-legend">
        图例：〔判〕判型　〔读〕读者变焦　〔时〕主时态　〔点〕要点编号　〔清〕落纸清单　——点标志亮对应卡格
      </p>
    </div>
  )
}

function renderLineWithMarks(args: {
  line: string
  marks: ReviewMark[]
  activeMarkIndex: number | null
  onEnter: (index: number) => void
  onLeave: (index: number) => void
  onClick: (index: number) => void
}): ReactNode {
  const { line, marks, activeMarkIndex, onEnter, onLeave, onClick } = args
  type Range = { start: number; end: number; markIndex: number }
  const ranges: Range[] = []
  marks.forEach((mark, markIndex) => {
    const idx = line.indexOf(mark.text)
    if (idx === -1) return
    ranges.push({ start: idx, end: idx + mark.text.length, markIndex })
  })
  ranges.sort((a, b) => a.start - b.start)

  const nodes: ReactNode[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start < cursor) continue
    if (range.start > cursor) nodes.push(line.slice(cursor, range.start))
    const mark = marks[range.markIndex]
    const isOn = activeMarkIndex === range.markIndex
    nodes.push(
      <span
        key={`a${range.markIndex}`}
        className={['pi-writing-review-anchor', isOn ? 'pi-writing-review-anchor--on' : ''].filter(Boolean).join(' ')}
      >
        {line.slice(range.start, range.end)}
      </span>,
    )
    nodes.push(
      <button
        key={`m${range.markIndex}`}
        type="button"
        className={['pi-writing-review-mark', isOn ? 'on' : ''].filter(Boolean).join(' ')}
        onMouseEnter={() => onEnter(range.markIndex)}
        onMouseLeave={() => onLeave(range.markIndex)}
        onClick={(event) => {
          event.stopPropagation()
          onClick(range.markIndex)
        }}
      >
        〔{MARK_TAG[mark.grid]}〕
      </button>,
    )
    cursor = range.end
  }
  if (cursor < line.length) nodes.push(line.slice(cursor))
  return nodes
}

function renderHighlights(items: HighlightExpression[]): ReactNode {
  return (
    <ul className="pi-writing-review-highlights">
      {items.map((item, i) => (
        <li key={i}>
          <p className="pi-writing-review-highlight-text">{item.text}</p>
          <p className="pi-writing-review-highlight-note">{item.note}</p>
        </li>
      ))}
    </ul>
  )
}
