import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { WritingGivenPart, WritingPageModel } from './writingPageModel'
import { RetainedModelAnswer } from '../paper-browse/RetainedWritingLecture.tsx'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { applicationWritingRhythm } from '../../../../shared/paper-canonical/applicationWritingRhythm.mjs'
import { continuationWritingRhythm } from '../../../../shared/paper-canonical/continuationWritingRhythm.mjs'
import { sectionHeadingRuntime } from '../../../../shared/paper-canonical/sectionHeadingContract.mjs'
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
  '--ps-font-stack-zh': paperSurfaceTokens.paperFontStackZh,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-stack-writing-part':
    paperSurfaceTokens.paperFontStackWritingPart,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-section-heading-font-stack':
    sectionHeadingRuntime.screen.fontStack,
  '--ps-section-heading-font-size':
    `${sectionHeadingRuntime.screen.fontSizePx}px`,
  '--ps-section-heading-line-height':
    `${sectionHeadingRuntime.screen.lineHeightPx}px`,
  '--ps-part-heading-indent':
    `${sectionHeadingRuntime.screen.partHeadingIndentEm}em`,
  '--ps-section-heading-indent':
    `${sectionHeadingRuntime.screen.sectionHeadingIndentEm}em`,
  '--ps-group-instruction-indent':
    `${sectionHeadingRuntime.screen.groupInstructionFirstLineIndentEm}em`,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

const applicationWritingPageStyle: WritingPageStyle = {
  '--application-writing-page-gap':
    `${applicationWritingRhythm.rendererMapping.screen.pageBlockGapPx}px`,
  '--application-writing-response-width':
    `${applicationWritingRhythm.responseGeometry.widthMm}mm`,
  '--application-writing-response-height':
    `${applicationWritingRhythm.responseGeometry.heightMm}mm`,
  '--application-writing-response-border':
    `${applicationWritingRhythm.responseGeometry.screenBorderPx}px`,
  '--application-writing-response-padding':
    `${applicationWritingRhythm.responseGeometry.paddingMm}mm`,
  '--application-writing-prompt-gap':
    `${applicationWritingRhythm.rendererMapping.screen.promptParagraphGapPx}px`,
  '--application-writing-notice-margin-top':
    `${applicationWritingRhythm.rendererMapping.screen.noticeMarginTopPx}px`,
  '--application-writing-response-margin-top':
    `${applicationWritingRhythm.rendererMapping.screen.responseMarginTopPx}px`,
}

const continuationWritingPageStyle: WritingPageStyle = {
  '--continuation-writing-page-gap':
    `${continuationWritingRhythm.rendererMapping.screen.pageBlockGapPx}px`,
  '--continuation-writing-response-width':
    `${continuationWritingRhythm.responseGeometry.widthMm}mm`,
  '--continuation-writing-response-height':
    `${continuationWritingRhythm.responseGeometry.heightMm}mm`,
  '--continuation-writing-response-border':
    `${continuationWritingRhythm.responseGeometry.screenBorderPx}px`,
  '--continuation-writing-response-margin-top':
    `${continuationWritingRhythm.rendererMapping.screen.responseMarginTopPx}px`,
  '--continuation-writing-response-padding-block':
    `${continuationWritingRhythm.rendererMapping.screen.responsePaddingTopBottomPx}px`,
  '--continuation-writing-response-padding-inline':
    `${continuationWritingRhythm.rendererMapping.screen.responsePaddingLeftRightPx}px`,
  '--continuation-writing-starter-indent':
    `${continuationWritingRhythm.starterGeometry.firstLineIndentEm}em`,
  '--continuation-writing-starter-row-inset':
    `${continuationWritingRhythm.starterGeometry.rowTopInsetEm}em`,
  '--continuation-writing-starter-second-row':
    `${continuationWritingRhythm.starterGeometry.secondRowStartRatio * 100}%`,
  '--continuation-writing-starter-trailing-inset':
    `${continuationWritingRhythm.starterGeometry.trailingInsetEm}em`,
}

function writingGivenText(part: WritingGivenPart): string {
  return typeof part === 'string' ? part : part.text
}

function writingGivenIdentity(part: WritingGivenPart): Record<string, string> {
  if (typeof part === 'string') return {}
  if ('starterId' in part) {
    return {
      'data-canonical-starter-id': part.starterId,
      'data-canonical-block-id': part.contentRef,
    }
  }
  return {
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
  grammarFillPredecessorGroupId,
  applicationWritingPredecessorGroupId,
}: {
  pageModel: WritingPageModel
  children: ReactNode
  retainedModelAnswer?: string
  retainedOfficialModelAnswer?: string
  onAnswerBoxActivate?: () => void
  grammarFillPredecessorGroupId?: string
  applicationWritingPredecessorGroupId?: string
}) {
  const isApplicationWriting = pageModel.blocks.some(
    (block) =>
      block.kind === 'answerBox'
      && block.answerRegionRef === 'writing.application-box',
  )
  const isContinuationWriting = pageModel.blocks.some(
    (block) =>
      block.kind === 'answerBox'
      && block.answerRegionRef === 'writing.continuation-box',
  )
  const handleAnswerBoxKeyDown = onAnswerBoxActivate
    ? (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onAnswerBoxActivate()
      }
    : undefined

  return (
    <div
      className={[
        'pi-writing-page',
        isApplicationWriting ? 'pi-writing-page--application' : '',
        isContinuationWriting ? 'pi-writing-page--continuation' : '',
      ].filter(Boolean).join(' ')}
      data-pi-writing-page=""
      style={
        isApplicationWriting
          ? { ...writingPageTokenStyle, ...applicationWritingPageStyle }
          : isContinuationWriting
            ? { ...writingPageTokenStyle, ...continuationWritingPageStyle }
            : writingPageTokenStyle
      }
    >
      {pageModel.blocks.map((block, index) => {
        switch (block.kind) {
          case 'partHeading':
            return (
              <h2
                key={index}
                className="pi-writing-part"
                data-canonical-instruction-id={block.instructionId}
                data-canonical-writing-chrome-role="part_heading"
                data-canonical-application-writing-rhythm-role={
                  isApplicationWriting ? 'part_heading' : undefined
                }
                data-canonical-continuation-writing-rhythm-role={
                  isContinuationWriting ? 'part_heading' : undefined
                }
                data-canonical-grammar-fill-rhythm-role={
                  grammarFillPredecessorGroupId
                    ? 'next_section'
                    : undefined
                }
                data-canonical-grammar-fill-following-for={
                  grammarFillPredecessorGroupId
                }
              >
                {block.text}
              </h2>
            )
          case 'sectionHeading':
            return (
              <h3
                key={index}
                className="pi-writing-section"
                data-canonical-instruction-id={block.instructionId}
                data-canonical-writing-chrome-role="section_heading"
                data-canonical-application-writing-rhythm-role={
                  isApplicationWriting
                    ? 'section_heading'
                    : isContinuationWriting
                      ? 'continuation_section'
                      : undefined
                }
                data-canonical-application-writing-following-for={
                  isContinuationWriting
                    ? applicationWritingPredecessorGroupId
                    : undefined
                }
                data-canonical-continuation-writing-rhythm-role={
                  isContinuationWriting ? 'section_heading' : undefined
                }
              >
                {block.text}
              </h3>
            )
          case 'instruction':
            return (
              <p
                key={index}
                className="pi-writing-instruction"
                data-canonical-instruction-id={block.instructionId}
                data-canonical-writing-chrome-role="instruction"
                data-canonical-application-writing-rhythm-role={
                  isContinuationWriting
                    ? 'continuation_prompt'
                    : undefined
                }
                data-canonical-continuation-writing-rhythm-role={
                  isContinuationWriting ? 'instruction' : undefined
                }
              >
                {block.text}
              </p>
            )
          case 'passage':
            return <div key={index} className="pi-writing-passage">{children}</div>
          case 'answerBox':
            return (
              <Fragment key={index}>
                <div
                  className={[
                    'pi-writing-answer-box',
                    block.answerRegionRef === 'writing.application-box'
                      ? 'pi-writing-answer-box--application'
                      : '',
                    block.answerRegionRef === 'writing.continuation-box'
                      ? 'pi-writing-answer-box--continuation'
                      : '',
                    block.givenBottom.length > 0 ? 'pi-writing-answer-box--letter' : '',
                    onAnswerBoxActivate ? 'pi-writing-answer-box--lecture-trigger' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={onAnswerBoxActivate ? `${block.label}，点击打开讲评` : block.label}
                  data-canonical-application-semantic-signature={block.semanticSignature}
                  data-canonical-application-occurrence-signature={block.occurrenceSignature}
                  data-canonical-writing-semantic-signature={block.semanticSignature}
                  data-canonical-writing-occurrence-signature={block.occurrenceSignature}
                  data-canonical-answer-region-ref={block.answerRegionRef}
                  data-canonical-response-slot-id={block.responseSlotId}
                  data-canonical-application-writing-rhythm-role={
                    block.answerRegionRef === 'writing.application-box'
                      ? 'response_box'
                      : undefined
                  }
                  data-canonical-continuation-writing-rhythm-role={
                    block.answerRegionRef === 'writing.continuation-box'
                      ? 'response_box'
                      : undefined
                  }
                  data-writing-lecture-trigger={onAnswerBoxActivate ? '' : undefined}
                  role={onAnswerBoxActivate ? 'button' : undefined}
                  tabIndex={onAnswerBoxActivate ? 0 : undefined}
                  onClick={onAnswerBoxActivate}
                  onKeyDown={handleAnswerBoxKeyDown}
                >
                  <div className="pi-writing-answer-top">
                    {block.givenTop.map((part, lineIndex) => {
                      const partKey = typeof part === 'string'
                        ? `t${lineIndex}`
                        : 'starterId' in part
                          ? part.starterId
                          : part.givenPartId
                      const given = (
                        <p
                          className={[
                            'pi-writing-answer-given',
                            typeof part !== 'string'
                            && !('starterId' in part)
                            && part.role === 'title'
                              ? 'pi-writing-answer-given--title'
                              : '',
                          ].filter(Boolean).join(' ')}
                          {...writingGivenIdentity(part)}
                          data-canonical-continuation-writing-rhythm-role={
                            isContinuationWriting
                            && typeof part !== 'string'
                            && 'starterId' in part
                              ? `starter_${lineIndex + 1}`
                              : undefined
                          }
                          data-canonical-application-writing-rhythm-role={
                            typeof part !== 'string' && !('starterId' in part)
                              ? part.role === 'title'
                                ? 'given_title'
                                : part.role === 'salutation'
                                  ? 'given_addressee'
                                  : undefined
                              : undefined
                          }
                        >
                          {writingGivenText(part)}
                        </p>
                      )
                      if (!isContinuationWriting) {
                        return <Fragment key={partKey}>{given}</Fragment>
                      }
                      return (
                        <div
                          key={partKey}
                          className="pi-writing-continuation-row"
                        >
                          {given}
                          <span
                            className="pi-writing-continuation-writable-area"
                            data-canonical-continuation-writing-rhythm-role={
                              `writable_after_starter_${lineIndex + 1}`
                            }
                            aria-hidden="true"
                          />
                        </div>
                      )
                    })}
                  </div>
                  {block.givenBottom.length > 0 && (
                    <div className="pi-writing-answer-bottom">
                      {block.givenBottom.map((part, lineIndex) => (
                        <p
                          key={
                            typeof part === 'string'
                              ? `b${lineIndex}`
                              : 'starterId' in part
                                ? part.starterId
                                : part.givenPartId
                          }
                          className="pi-writing-answer-given pi-writing-answer-given--tight"
                          {...writingGivenIdentity(part)}
                          data-canonical-application-writing-rhythm-role={
                            typeof part !== 'string' && !('starterId' in part)
                              ? 'given_closing'
                              : undefined
                          }
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
