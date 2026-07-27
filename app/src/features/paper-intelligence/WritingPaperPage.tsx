import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { WritingGivenPart, WritingPageModel } from './writingPageModel'
import { RetainedModelAnswer } from '../paper-browse/RetainedWritingLecture.tsx'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import './writingPaperPage.css'

// Renders the writing section's A4 page chrome (part/section headings, 注意,
// answer box) around the dumb PaperSurface, which renders the prompt/material
// passage at the `passage` slot. Layout normalizes toward the gold reference
// (docs/product/exam-paper-format-reference page-11/12) — I6-writing-render.
//
// The answer box renders its border + any given lines (continuation starters);
// the empty writing space inside is intentionally not sized in this cut.

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

function writingGivenText(part: WritingGivenPart): string {
  return typeof part === 'string' ? part : part.text
}

function writingGivenIdentity(part: WritingGivenPart): Record<string, string> {
  return typeof part === 'string'
    ? {}
    : {
        'data-canonical-given-part-id': part.givenPartId,
        'data-canonical-given-role': part.role,
        'data-canonical-given-placement': part.placement,
        'data-canonical-block-id': part.blockRef,
      }
}

export function WritingPaperPage({
  pageModel,
  children,
  retainedModelAnswer,
  retainedOfficialModelAnswer,
  onAnswerBoxActivate,
}: {
  pageModel: WritingPageModel
  children: ReactNode
  retainedModelAnswer?: string
  retainedOfficialModelAnswer?: string
  onAnswerBoxActivate?: () => void
}) {
  const handleAnswerBoxKeyDown = onAnswerBoxActivate
    ? (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onAnswerBoxActivate()
      }
    : undefined

  return (
    <div className="pi-writing-page" data-pi-writing-page="" style={writingPageTokenStyle}>
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
          case 'answerBox':
            return (
              <Fragment key={index}>
                <div
                  className={[
                    'pi-writing-answer-box',
                    block.responseSlotId ? 'pi-writing-answer-box--application' : '',
                    block.givenBottom.length > 0 ? 'pi-writing-answer-box--letter' : '',
                    onAnswerBoxActivate ? 'pi-writing-answer-box--lecture-trigger' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={onAnswerBoxActivate ? `${block.label}，点击打开讲评` : block.label}
                  data-canonical-application-semantic-signature={block.semanticSignature}
                  data-canonical-application-occurrence-signature={block.occurrenceSignature}
                  data-canonical-answer-region-ref={block.answerRegionRef}
                  data-canonical-response-slot-id={block.responseSlotId}
                  data-writing-lecture-trigger={onAnswerBoxActivate ? '' : undefined}
                  role={onAnswerBoxActivate ? 'button' : undefined}
                  tabIndex={onAnswerBoxActivate ? 0 : undefined}
                  onClick={onAnswerBoxActivate}
                  onKeyDown={handleAnswerBoxKeyDown}
                >
                  <div className="pi-writing-answer-top">
                    {block.givenTop.map((part, lineIndex) => (
                      <p
                        key={typeof part === 'string' ? `t${lineIndex}` : part.givenPartId}
                        className={[
                          'pi-writing-answer-given',
                          typeof part !== 'string'
                          && part.role === 'title'
                            ? 'pi-writing-answer-given--title'
                            : '',
                        ].filter(Boolean).join(' ')}
                        {...writingGivenIdentity(part)}
                      >
                        {writingGivenText(part)}
                      </p>
                    ))}
                  </div>
                  {block.givenBottom.length > 0 && (
                    <div className="pi-writing-answer-bottom">
                      {block.givenBottom.map((part, lineIndex) => (
                        <p
                          key={typeof part === 'string' ? `b${lineIndex}` : part.givenPartId}
                          className="pi-writing-answer-given pi-writing-answer-given--tight"
                          {...writingGivenIdentity(part)}
                        >
                          {writingGivenText(part)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {retainedModelAnswer !== undefined && (
                  <aside
                    className="pi-writing-answer-supplement"
                    data-writing-answer-supplement=""
                  >
                    <RetainedModelAnswer
                      modelAnswer={retainedModelAnswer}
                      officialModelAnswer={retainedOfficialModelAnswer}
                    />
                  </aside>
                )}
              </Fragment>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
