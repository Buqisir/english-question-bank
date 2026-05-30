import type { ReactNode } from 'react'
import type { WritingPageModel } from './writingPageModel'
import './writingPaperPage.css'

// Renders the writing section's A4 page chrome (part/section headings, 注意,
// answer box) around the dumb PaperSurface, which renders the prompt/material
// passage at the `passage` slot. Layout normalizes toward the gold reference
// (docs/product/exam-paper-format-reference page-11/12) — I6-writing-render.
//
// The answer box renders its border + any given lines (continuation starters);
// the empty writing space inside is intentionally not sized in this cut.
export function WritingPaperPage({
  pageModel,
  children,
}: {
  pageModel: WritingPageModel
  children: ReactNode
}) {
  return (
    <div className="pi-writing-page" data-pi-writing-page="">
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
              <div key={index} className="pi-writing-answer-box" aria-label={block.label}>
                {block.givenLines.map((line, lineIndex) => (
                  <p key={lineIndex} className="pi-writing-answer-given">{line}</p>
                ))}
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
