import type { ReactNode } from 'react'
import {
  PERSONAL_FONT_PRESETS,
  PERSONAL_FONT_PRESET_IDS,
  PERSONAL_SIZE_PRESETS,
  PERSONAL_SIZE_PRESET_IDS,
  type PersonalFontPresetId,
  type PersonalSizePresetId,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import { Copy, Trash } from '../../../icons'

export type TextBoxPresentationChange = {
  fontPresetId?: PersonalFontPresetId
  sizePresetId?: PersonalSizePresetId
}

/*
 * Font and size controls shared by the selected-box strip and the editing
 * toolbar (both float above the box). Each change is one presentation update
 * op applied by the caller.
 */
export function TextBoxPresentationControls({
  document,
  onChange,
}: {
  document: PersonalTextDocumentV1
  onChange: (patch: TextBoxPresentationChange) => void
}): ReactNode {
  return (
    <>
      <select
        className="paper-personal-text-box__font-select"
        aria-label="文字框字体"
        value={document.presentation.fontPresetId}
        onChange={(event) => onChange({ fontPresetId: event.target.value as PersonalFontPresetId })}
      >
        {PERSONAL_FONT_PRESET_IDS.map((id) => (
          <option key={id} value={id}>{PERSONAL_FONT_PRESETS[id].label}</option>
        ))}
      </select>
      <div className="paper-personal-text-box__sizes" role="group" aria-label="文字框字号">
        {PERSONAL_SIZE_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="paper-personal-text-box__size-option"
            aria-pressed={document.presentation.sizePresetId === id}
            onClick={() => onChange({ sizePresetId: id })}
          >
            {PERSONAL_SIZE_PRESETS[id].label}
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
      <button
        type="button"
        className="paper-personal-text-box__strip-action"
        onClick={onDuplicate}
      >
        <Copy size={16} />
        复制文字框
      </button>
      <button
        type="button"
        className="paper-personal-text-box__strip-action"
        onClick={onDelete}
      >
        <Trash size={16} />
        删除文字框
      </button>
    </div>
  )
}
