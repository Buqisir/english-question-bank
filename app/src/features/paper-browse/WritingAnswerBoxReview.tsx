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
 *
 * DP-3 owner QA 返工（2026-07-21，decisions.md §6）：
 *   - 审题卡换成课堂通用真卡四节（基础五定 / 圈要点编号 / 读者三问 /
 *     价值落点），讲评态显填好版，值直接渲数据，卡页本身不再随 activeMark
 *     变色——唯一允许的激活指示是范文页锚句的虚线↔实线下划线切换。
 *   - 范文页删掉〔判〕〔读〕〔时〕〔点〕〔清〕字模按钮与图例：锚句本身可
 *     点（极淡虚线下划线 affordance），点开在该句所在段落下方就地展开
 *     讲解条（含对应卡格内容），再点/点别处收起。
 */
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

// 基础五定六格（decisions.md §6）：label 用课堂真卡中文名。
const BASICS_CELLS: ReadonlyArray<{ id: 'form' | 'topic' | 'reader' | 'person' | 'tense' | 'type'; label: string }> = [
  { id: 'form', label: '文体' },
  { id: 'topic', label: '话题' },
  { id: 'reader', label: '读者' },
  { id: 'person', label: '人称' },
  { id: 'tense', label: '主时态' },
  { id: 'type', label: '判型' },
]

// 讲解条 grid → 卡格映射（decisions.md §6 owner 拍板）：
// type→判型、tense→主时态、points→圈要点、cares→他最关心什么、wants→他要什么具体信息。
const MARK_CELL_LABEL: Record<ReviewGrid, string> = {
  type: '判型',
  tense: '主时态',
  points: '圈要点',
  cares: '他最关心什么',
  wants: '他要什么具体信息',
}

function markCellValue(card: ReviewCard, grid: ReviewGrid): string {
  switch (grid) {
    case 'type':
      return card.type
    case 'tense':
      return card.tense
    case 'points':
      return card.points.join('　')
    case 'cares':
      return card.readerCares
    case 'wants':
      return card.readerWants
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
            {renderCard(reviewCard)}
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
              // click 收起后清掉 hover 预览态，避免鼠标仍停留在锚句上时 hover
              // 预览把刚收起的讲解条又顶回来（hover 只在无锁定/无刚收起时预览）。
              onToggle: (i) => {
                setHoverMarkIndex(null)
                setLockedMarkIndex((prev) => (prev === i ? null : i))
              },
              onClickOutside: () => {
                setHoverMarkIndex(null)
                setLockedMarkIndex(null)
              },
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

// 讲评态显填好版：值直接渲数据，卡页本身不带任何激活/高亮态（decisions.md
// §6 D：唯一允许的激活指示在范文页锚句下划线，卡页不参与）。
function renderCard(card: ReviewCard): ReactNode {
  return (
    <div className="pi-writing-review-card-sections">
      <section className="pi-writing-review-section">
        <h4 className="pi-writing-review-section-title">基础五定</h4>
        <div className="pi-writing-review-card">
          {BASICS_CELLS.map((cell) => (
            <div key={cell.id} className="pi-writing-review-cell">
              <b>{cell.label}</b>
              <span>{card[cell.id]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="pi-writing-review-section">
        <h4 className="pi-writing-review-section-title">圈要点、编号</h4>
        <ul className="pi-writing-review-points">
          {card.points.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      </section>
      <section className="pi-writing-review-section">
        <h4 className="pi-writing-review-section-title">读者三问</h4>
        <div className="pi-writing-review-reader-qa">
          <div className="pi-writing-review-cell">
            <b>读者是谁？</b>
            <span>{card.readerWho}</span>
          </div>
          <div className="pi-writing-review-cell">
            <b>他最关心什么？</b>
            <span>{card.readerCares}</span>
          </div>
          <div className="pi-writing-review-cell">
            <b>他要什么具体信息？</b>
            <span>{card.readerWants}</span>
          </div>
        </div>
      </section>
      <section className="pi-writing-review-section">
        <h4 className="pi-writing-review-section-title">价值落点</h4>
        <p className="pi-writing-review-value">{card.value}</p>
      </section>
    </div>
  )
}

// 范文页（decisions.md §6 C）：不再有〔判〕〔读〕〔时〕〔点〕〔清〕字模按钮或
// 图例——锚句本身可点，affordance 只有一条极淡虚线下划线；点开在该句所在
// 段落下方就地展开讲解条（note + 对应卡格内容），再点/点别处收起。
function renderModel(args: {
  modelAnswer: string
  card: ReviewCard
  marks: ReviewMark[]
  activeMarkIndex: number | null
  onEnter: (index: number) => void
  onLeave: (index: number) => void
  onToggle: (index: number) => void
  onClickOutside: () => void
}): ReactNode {
  const { modelAnswer, card, marks, activeMarkIndex, onEnter, onLeave, onToggle, onClickOutside } = args
  const lines = modelAnswer.split('\n').filter((line) => line.trim().length > 0)
  return (
    <div className="pi-writing-review-model" onClick={onClickOutside}>
      {lines.map((line, lineIndex) => {
        const { nodes, containsActive } = renderLineWithMarks({ line, marks, activeMarkIndex, onEnter, onLeave, onToggle })
        const activeMark = containsActive && activeMarkIndex != null ? marks[activeMarkIndex] : null
        return (
          <Fragment key={lineIndex}>
            <p>{nodes}</p>
            {activeMark && (
              <div className="pi-writing-review-marknote">
                <b>
                  {MARK_CELL_LABEL[activeMark.grid]}「{markCellValue(card, activeMark.grid)}」
                </b>{' '}
                {activeMark.note}
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function renderLineWithMarks(args: {
  line: string
  marks: ReviewMark[]
  activeMarkIndex: number | null
  onEnter: (index: number) => void
  onLeave: (index: number) => void
  onToggle: (index: number) => void
}): { nodes: ReactNode[]; containsActive: boolean } {
  const { line, marks, activeMarkIndex, onEnter, onLeave, onToggle } = args
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
  let containsActive = false
  for (const range of ranges) {
    if (range.start < cursor) continue
    if (range.start > cursor) nodes.push(line.slice(cursor, range.start))
    const isOn = activeMarkIndex === range.markIndex
    if (isOn) containsActive = true
    nodes.push(
      <button
        key={`a${range.markIndex}`}
        type="button"
        className={['pi-writing-review-anchor', isOn ? 'pi-writing-review-anchor--on' : ''].filter(Boolean).join(' ')}
        onMouseEnter={() => onEnter(range.markIndex)}
        onMouseLeave={() => onLeave(range.markIndex)}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(range.markIndex)
        }}
      >
        {line.slice(range.start, range.end)}
      </button>,
    )
    cursor = range.end
  }
  if (cursor < line.length) nodes.push(line.slice(cursor))
  return { nodes, containsActive }
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
