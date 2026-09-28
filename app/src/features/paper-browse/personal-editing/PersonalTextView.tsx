import { createElement, Fragment, type ReactNode } from 'react'
import {
  walkPersonalTextContent,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import { personalTextRootStyle } from './personalTextRootStyle'
import './personalText.css'

type PersonalTextViewProps = {
  document: PersonalTextDocumentV1
  className?: string
}

export function PersonalTextView({ document, className }: PersonalTextViewProps) {
  const content = walkPersonalTextContent<ReactNode>(document.content, {
    text: (text) => text,
    element: (tag, attrs, children, key) => (
      // Empty paragraphs keep one line of height, matching the editor and print.
      tag === 'p' && children.length === 0
        ? createElement('p', { key }, createElement('br'))
        : createElement(tag, { ...attrs, key }, ...children)
    ),
    fragment: (children, key) => createElement(Fragment, { key }, ...children),
  })
  return (
    <div
      className={className ? `eqb-personal-text ${className}` : 'eqb-personal-text'}
      style={personalTextRootStyle(document)}
    >
      {content}
    </div>
  )
}
