import type { CSSProperties } from 'react'
import {
  personalTextStyle,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import { ensurePersonalFontsStylesheet } from './personalFonts'

export function personalTextRootStyle(document: PersonalTextDocumentV1): CSSProperties {
  ensurePersonalFontsStylesheet()
  const style = personalTextStyle(document.presentation)
  if (!style) return {}
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
  }
}
