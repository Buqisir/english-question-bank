/**
 * PaperBlockCanvas — renders the assembled paper block canvas inside排版预览.
 *
 * Pure presentational; receives all state and handlers via props. Rendering rules
 * (block ordering, insertion seams, continuous numbering) live here. Block mutation
 * logic stays in usePaperBlocks. Question number ranges are computed by the caller
 * via domain/paperLayout.computeQuestionNumbers.
 */

import { type ReactNode } from 'react'
import {
  groupTypeLabel,
  type BasketItem,
  type PaperBlock,
  type QuestionGroupDetail,
  type VersionType,
} from '../domain/questionBank.ts'
import { computeQuestionNumbers } from '../domain/paperLayout.ts'

export type PaperBlockCanvasProps = {
  paperBlocks: PaperBlock[]
  basket: BasketItem[]
  previewDetails: Record<string, QuestionGroupDetail>
  versionType: VersionType
  questionNumberStart: number

  selectedPaperBlockId: string | null
  openInsertionIndex: number | null

  onSelectBlock: (blockId: string | null) => void
  onToggleInsertionSeam: (index: number | null) => void

  onMoveBlock: (blockId: string, direction: -1 | 1) => void
  onRemoveBlock: (blockId: string) => void
  onInsertBlockAt: (index: number, type: 'section_header' | 'page_break') => void
  onInsertSectionHeaderBefore: (blockId: string) => void
  onInsertPageBreakAfter: (blockId: string) => void
}

export function PaperBlockCanvas(props: PaperBlockCanvasProps): ReactNode {
  const {
    paperBlocks,
    basket,
    previewDetails,
    versionType,
    questionNumberStart,
    selectedPaperBlockId,
    openInsertionIndex,
    onSelectBlock,
    onToggleInsertionSeam,
    onMoveBlock,
    onRemoveBlock,
    onInsertBlockAt,
    onInsertSectionHeaderBefore,
    onInsertPageBreakAfter,
  } = props

  const canvasNumberRanges = computeQuestionNumbers(paperBlocks, questionNumberStart, (gid) => {
    const detail = previewDetails[gid]
    const item = basket.find((i) => i.id === gid)
    return detail?.questions.length ?? item?.questionCount ?? 0
  })
  const rangeByBlockId = new Map(canvasNumberRanges.map((r) => [r.blockId, r]))

  const renderSeam = (index: number) => {
    const isOpen = openInsertionIndex === index
    return (
      <div className={`paper-insertion-seam${isOpen ? ' open' : ''}`} key={`seam-${index}`}>
        <button
          className="paper-insertion-trigger"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleInsertionSeam(isOpen ? null : index)
          }}
          aria-label="插入块"
        >
          +
        </button>
        {isOpen && (
          <div className="paper-insertion-menu">
            <button type="button" onClick={() => onInsertBlockAt(index, 'section_header')}>
              大题标题
            </button>
            <button type="button" onClick={() => onInsertBlockAt(index, 'page_break')}>
              分页
            </button>
            <button type="button" disabled>
              说明文字
            </button>
          </div>
        )}
      </div>
    )
  }

  const elements: ReactNode[] = []

  if (paperBlocks.length === 0) {
    elements.push(
      <div className="paper-insertion-seam open empty-canvas" key="seam-empty">
        <div className="paper-insertion-menu">
          <button type="button" onClick={() => onInsertBlockAt(0, 'section_header')}>
            大题标题
          </button>
          <button type="button" onClick={() => onInsertBlockAt(0, 'page_break')}>
            分页
          </button>
          <button type="button" disabled>
            说明文字
          </button>
        </div>
      </div>,
    )
    return <>{elements}</>
  }

  elements.push(renderSeam(0))

  paperBlocks.forEach((block, blockIndex) => {
    const isSelected = selectedPaperBlockId === block.id

    if (block.type === 'section_header') {
      elements.push(
        <div
          className={`paper-canvas-block paper-canvas-sh${isSelected ? ' selected' : ''}`}
          key={block.id}
          onClick={() => onSelectBlock(isSelected ? null : block.id)}
        >
          <h3>{block.title}</h3>
          {isSelected && (
            <div className="paper-canvas-actions">
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, -1) }}>上移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, 1) }}>下移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveBlock(block.id) }}>删除</button>
            </div>
          )}
        </div>,
      )
    } else if (block.type === 'page_break') {
      elements.push(
        <div
          className={`paper-canvas-block paper-canvas-pb${isSelected ? ' selected' : ''}`}
          key={block.id}
          onClick={() => onSelectBlock(isSelected ? null : block.id)}
        >
          <span>— 分页 —</span>
          {isSelected && (
            <div className="paper-canvas-actions">
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, -1) }}>上移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, 1) }}>下移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveBlock(block.id) }}>删除</button>
            </div>
          )}
        </div>,
      )
    } else {
      // question_group
      const basketItem = basket.find((i) => i.id === block.questionGroupId)
      if (!basketItem) {
        elements.push(renderSeam(blockIndex + 1))
        return
      }
      const detail = previewDetails[block.questionGroupId]
      const range = rangeByBlockId.get(block.id)
      const startNum = range?.startNum ?? 1
      const endNum = range?.endNum ?? startNum
      const count = detail?.questions.length ?? basketItem.questionCount

      elements.push(
        <section
          className={`paper-canvas-block paper-canvas-qg${isSelected ? ' selected' : ''}`}
          key={block.id}
          onClick={() => onSelectBlock(isSelected ? null : block.id)}
        >
          <div className="paper-canvas-qg-head">
            <span className="paper-canvas-qg-range">
              {startNum === endNum ? startNum : `${startNum}–${endNum}`}
            </span>
            <div className="paper-canvas-qg-meta">
              <strong>{basketItem.sectionTitle || (detail?.title ?? basketItem.title)}</strong>
              <span>{groupTypeLabel[basketItem.groupType]} · {count} 题 · {block.score} 分/题</span>
            </div>
          </div>
          {isSelected && (
            <div className="paper-canvas-actions">
              <button type="button" onClick={(e) => { e.stopPropagation(); onInsertSectionHeaderBefore(block.id) }}>+标题↑</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, -1) }}>上移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMoveBlock(block.id, 1) }}>下移</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onInsertPageBreakAfter(block.id) }}>+分页↓</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveBlock(block.id) }}>删除</button>
            </div>
          )}
          {detail ? (
            <>
              <div className="paper-passage">
                <h5>{detail.passage.title}</h5>
                <pre>{detail.passage.materialText || detail.passage.summary || '暂无完整原文。'}</pre>
              </div>
              <ol className="paper-question-list" start={startNum}>
                {detail.questions.map((question, qIdx) => (
                  <li className="paper-question" key={question.id} value={startNum + qIdx}>
                    <p>{question.stem}</p>
                    {question.options.length > 0 && (
                      <div className={`paper-options${detail.groupType === 'cloze' ? ' paper-options-inline' : ''}`}>
                        {question.options.map((option) => (
                          <div key={option.id}>
                            <strong>{option.label}.</strong>
                            <span>{option.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {versionType === 'teacher' && (
                      <div className="teacher-answer">
                        <strong>答案：{question.answer || '待补'}</strong>
                        <p>解析：{question.explanation || question.note || '待补'}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="detail-message">该题组详情还未载入。</p>
          )}
        </section>,
      )
    }

    elements.push(renderSeam(blockIndex + 1))
  })

  return <>{elements}</>
}
