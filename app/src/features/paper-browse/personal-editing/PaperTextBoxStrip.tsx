import type { ReactNode } from 'react'
import {
  PERSONAL_FONT_PRESETS,
  PERSONAL_FONT_PRESET_IDS,
  PERSONAL_SIZE_PRESET_IDS,
  type PersonalFontPresetId,
  type PersonalSizePresetId,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import { ChevronDown, Copy, Trash } from '../../../icons'

export type TextBoxPresentationChange = {
  fontPresetId?: PersonalFontPresetId
  sizePresetId?: PersonalSizePresetId
}

// The registry labels the normal size 「常规」, same as the normal font; next
// to each other in one strip that reads as a stutter, so the strip says 中.
const SIZE_LABELS: Record<PersonalSizePresetId, string> = { small: '小', normal: '中', large: '大' }

/*
 * Font and size controls shared by the selected-box strip and the editing
 * toolbar (both float above the box). Each change is one presentation update
 * op applied by the caller. `subject` only names the aria labels; the note
 * layer passes 旁注 while the text box keeps the default.
 */
export function TextBoxPresentationControls({
  document,
  onChange,
  subject = '文字框',
}: {
  document: PersonalTextDocumentV1
  onChange: (patch: TextBoxPresentationChange) => void
  subject?: string
}): ReactNode {
  return (
    <>
      <span className="paper-personal-strip-divider" aria-hidden="true" />
      <span className="paper-personal-text-box__font">
        <select
          className="paper-personal-text-box__font-select"
          aria-label={`${subject}字体`}
          value={document.presentation.fontPresetId}
          onChange={(event) => onChange({ fontPresetId: event.target.value as PersonalFontPresetId })}
        >
          {PERSONAL_FONT_PRESET_IDS.map((id) => (
            <option key={id} value={id}>{PERSONAL_FONT_PRESETS[id].label}</option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
      <div className="paper-personal-text-box__sizes" role="group" aria-label={`${subject}字号`}>
        {PERSONAL_SIZE_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="paper-personal-text-box__size-option"
            aria-pressed={document.presentation.sizePresetId === id}
            onClick={() => onChange({ sizePresetId: id })}
          >
            {SIZE_LABELS[id]}
          </button>
        ))}
      </div>
    </>
  )
}

/*
 * Floating strip above a selected (not editing) text box: presentation
 * controls plus duplicate and delete. Rendered inside the box element, so it
 * inherits its pointer events; drag handlers must ignore pointerdowns that
 * start here.
 */
export function TextBoxSelectionStrip({
  document,
  onPresentationChange,
  onDuplicate,
  onDelete,
}: {
  document: PersonalTextDocumentV1
  onPresentationChange: (patch: TextBoxPresentationChange) => void
  onDuplicate: () => void
  onDelete: () => void
}): ReactNode {
  return (
    <div className="paper-personal-text-box__strip" role="toolbar" aria-label="文字框操作">
      <TextBoxPresentationControls document={document} onChange={onPresentationChange} />
      <span className="paper-personal-strip-divider" aria-hidden="true" />
      <button
        type="button"
        className="paper-personal-text-box__strip-action"
        aria-label="复制文字框"
        onClick={onDuplicate}
      >
        <Copy size={16} />
        复制
      </button>
      <button
        type="button"
        className="paper-personal-text-box__strip-action paper-personal-text-box__strip-action--danger"
        aria-label="删除文字框"
        onClick={onDelete}
      >
        <Trash size={16} />
        删除
      </button>
    </div>
  )
}
