import type { CSSProperties, ReactNode } from 'react'
import type { WritingPageModel } from './writingPageModel'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import './writingPaperPage.css'

// Renders the writing section's A4 page chrome (part/section headings, 注意,
// answer box) around the dumb PaperSurface, which renders the prompt/material
// passage at the `passage` slot. Layout normalizes toward the gold reference
// (docs/product/exam-paper-format-reference page-11/12) — I6-writing-render.
//
// The answer box renders its border + any given lines (continuation starters);
// the empty writing space inside is intentionally not sized in this cut.

export type WritingPaperPageReviewProps = {
  /** true when the講評态「解析」入口双手势 (点答题框 / 「解析」钮) should be
   * live for this group — applied-writing-lecture D4 gates this on
   * `lectureOpen && taskType === 'application'` at the call site
   * (PaperBrowsePage.tsx); continuation groups never get this prop. */
  available: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Rendered inside the answer box in place of the given salutation/signature
   * lines when `open` — owned entirely by the caller (B2 三块翻页
   * carousel), this component stays a dumb chrome host. */
  content: ReactNode
}

/**
 * Extended CSSProperties to allow CSS custom properties on the root.
 */
type WritingPageStyle = CSSProperties & Record<`--${string}`, string | number>

/**
 * Inject shared paper-surface tokens as CSS custom properties, same
 * mechanism as `PaperSurface.tsx`. This page wraps PaperSurface as a
 * child, so it cannot read PaperSurface's own `--ps-*` custom properties
 * (CSS custom properties inherit down the tree, not up) — it needs its
 * own injection to drive `writingPaperPage.css` (刀⑤ render-fidelity
 * Chunk A).
 */
const writingPageTokenStyle: WritingPageStyle = {
  '--ps-font-stack': paperSurfaceTokens.paperFontStack,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

export function WritingPaperPage({
  pageModel,
  children,
  review,
}: {
  pageModel: WritingPageModel
  children: ReactNode
  /** applied-writing-lecture D4: B2 内嵌解析区接线 — undefined for any
   * group the caller doesn't wire review for (挑题态、非应用文写作组）. */
  review?: WritingPaperPageReviewProps
}) {
  return (
    <div className="pi-writing-page" data-pi-writing-page="" style={writingPageTokenStyle}>
      {review?.available && (
        <button
          type="button"
          className="pi-writing-review-toggle"
          onClick={review.open ? review.onClose : review.onOpen}
        >
          解析
        </button>
      )}
      {pageModel.blocks.map((block, index) => {
        switch (block.kind) {
          case 'partHeading':
            return <h2 key={index} className="pi-writing-part">{block.text}</h2>
          case 'sectionHeading':
            return <h3 key={index} className="pi-writing-section">{block.text}</h3>
          case 'instruction':
            return <p key={index} className="pi-writing-instruction">{block.text}</p>
          case 'passage':
            return <div key={index} className="pi-writing-passage">{children}</div>
          case 'answerBox': {
            const isReviewOpen = Boolean(review?.available && review.open)
            const boxClassName = [
              'pi-writing-answer-box',
              block.givenBottom.length > 0 ? 'pi-writing-answer-box--letter' : '',
              review?.available ? 'pi-writing-answer-box--clickable' : '',
              isReviewOpen ? 'pi-writing-answer-box--review-open' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                key={index}
                className={boxClassName}
                aria-label={block.label}
                data-pi-writing-answerbox={review?.available ? '' : undefined}
                onClick={review?.available && !review.open ? review.onOpen : undefined}
              >
                {isReviewOpen ? (
                  review!.content
                ) : (
                  <>
                    <div className="pi-writing-answer-top">
                      {block.givenTop.map((line, lineIndex) => (
                        <p key={`t${lineIndex}`} className="pi-writing-answer-given">{line}</p>
                      ))}
                    </div>
                    {block.givenBottom.length > 0 && (
                      <div className="pi-writing-answer-bottom">
                        {block.givenBottom.map((line, lineIndex) => (
                          <p key={`b${lineIndex}`} className="pi-writing-answer-given pi-writing-answer-given--tight">{line}</p>
                        ))}
                      </div>
                    )}
                    {review?.available && <span className="pi-writing-review-hint">点击查看解析</span>}
                  </>
                )}
              </div>
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}
