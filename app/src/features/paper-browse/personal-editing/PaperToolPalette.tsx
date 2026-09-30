import {
  PERSONAL_HIGHLIGHT_COLORS,
  PERSONAL_UNDERLINE_INKS,
  type PersonalHighlightColor,
  type PersonalUnderlineInk,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import { Notebook, Palette, Pencil, Target, Underline } from '../../../icons'
import './personalAnnotations.css'

// 纸张视图右侧的批注工具（#489 浮板刀）：选择是默认工具，笔式工具（高亮 /
// 下划线 / 批注 / 文字）保持激活直到 Esc 或点「选择」——同一支笔可以连续
// 画多处，不逐次回到选择态。
export type PaperTool = 'select' | 'highlight' | 'underline' | 'note' | 'text'

const HIGHLIGHT_SWATCH_LABEL: Record<string, string> = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色' }
const INK_SWATCH_LABEL: Record<string, string> = { ink: '黑色', red: '红色' }

const TOOLS: ReadonlyArray<{ id: PaperTool; label: string; Icon: typeof Target }> = [
  { id: 'select', label: '选择', Icon: Target },
  { id: 'highlight', label: '高亮', Icon: Palette },
  { id: 'underline', label: '下划线', Icon: Underline },
  { id: 'note', label: '批注', Icon: Notebook },
  { id: 'text', label: '文字', Icon: Pencil },
]

export function PaperToolPalette({
  tool,
  onToolChange,
  highlightColor,
  onHighlightColorChange,
  underlineInk,
  onUnderlineInkChange,
  canEdit,
}: {
  tool: PaperTool
  onToolChange: (tool: PaperTool) => void
  highlightColor: PersonalHighlightColor
  onHighlightColorChange: (color: PersonalHighlightColor) => void
  underlineInk: PersonalUnderlineInk
  onUnderlineInkChange: (ink: PersonalUnderlineInk) => void
  canEdit: boolean
}) {
  return (
    <div className="paper-tool-palette" role="toolbar" aria-label="批注工具" aria-orientation="vertical">
      {TOOLS.map(({ id, label, Icon }) => (
        <div key={id} className="paper-tool-palette__slot">
          <button
            type="button"
            className={`paper-tool-palette__tool${tool === id ? ' is-active' : ''}`}
            aria-pressed={tool === id}
            disabled={!canEdit}
            onClick={() => onToolChange(id)}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="paper-tool-palette__label">{label}</span>
          </button>
          {/* 记忆色的取色点只随对应工具展开；换色不动工具（笔继续握着）。 */}
          {tool === 'highlight' && id === 'highlight' ? (
            <div className="paper-tool-palette__swatches" role="group" aria-label="高亮颜色">
              {PERSONAL_HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="paper-personal-swatch paper-tool-palette__swatch"
                  data-color={color}
                  aria-label={HIGHLIGHT_SWATCH_LABEL[color]}
                  aria-pressed={highlightColor === color}
                  disabled={!canEdit}
                  onClick={() => onHighlightColorChange(color)}
                />
              ))}
            </div>
          ) : null}
          {tool === 'underline' && id === 'underline' ? (
            <div className="paper-tool-palette__swatches" role="group" aria-label="下划线颜色">
              {PERSONAL_UNDERLINE_INKS.map((ink) => (
                <button
                  key={ink}
                  type="button"
                  className="paper-personal-swatch paper-personal-swatch--ink paper-tool-palette__swatch"
                  data-ink={ink}
                  aria-label={INK_SWATCH_LABEL[ink]}
                  aria-pressed={underlineInk === ink}
                  disabled={!canEdit}
                  onClick={() => onUnderlineInkChange(ink)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
