import { Check } from '../../icons'
import { useMemo, useState } from 'react'
import { Dialog } from '../../shared-ui/Dialog.tsx'
import type { VocabularyHandwritingMode } from '../../services/vocabulary'

export type VocabularyHandwritingEntry = {
  id: string
  headword: string
  sourceMeanings?: string[]
  teachingSense?: string
  teachingSenses?: string[]
}

type VocabularyHandwritingSelectorProps = {
  title: string
  entries: VocabularyHandwritingEntry[]
  busy?: boolean
  onCancel: () => void
  onConfirm: (entryIds: string[], mode: VocabularyHandwritingMode) => void
  /** 关上以后焦点回到哪里。打开它的是下载菜单里的项，打开时菜单已经收起，所以调用处指回菜单的触发键。 */
  returnFocus?: () => HTMLElement | null | undefined
}

export function VocabularyHandwritingSelector({
  title,
  entries,
  busy = false,
  onCancel,
  onConfirm,
  returnFocus,
}: VocabularyHandwritingSelectorProps) {
  const initialIds = useMemo(
    () => entries.slice(0, entries.length <= 10 ? entries.length : 10).map((entry) => entry.id),
    [entries],
  )
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialIds))
  const [mode, setMode] = useState<VocabularyHandwritingMode>('standard')
  const selectedCount = selectedIds.size

  function toggleEntry(entryId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  // 外壳换成共用 Dialog（design/components-2026-11-13/migrate-dialog/README.md）：焦点圈、Esc、关上后焦点回去、
  // 背后不滚都由它管，原来这里自己写的 keydown 循环删了。
  // 点遮罩不关（构件收尾 2026-11-15）：原来保留了「点遮罩关」，和全站对话框不一样；勾了半天的单词点一下框外就没了，
  // 现在照 Dialog 默认，只有 Esc、右上角关闭、「取消」能关。
  // 调用处挂上才渲染、关上就卸载，所以 open 一直是 true，没有退场动画（和原来一样）。
  // <dialog> 上还挂 vocabulary-handwriting-selector-backdrop：打印样式靠它把这一层藏掉（打印样式不动）。
  return (
    <Dialog
      open
      onClose={onCancel}
      size="lg"
      busy={busy}
      className="vocabulary-handwriting-selector-backdrop"
      bodyClassName="vocabulary-handwriting-selector"
      title="选择练字单词"
      description={`${title} · 保持原词序`}
      closeLabel="关闭练字单词选择"
      returnFocus={returnFocus}
      footnote={selectedCount
        ? mode === 'single'
          ? '每词保留 1 个书写位，每页约 10 词。'
          : '描红后独立书写，每页约 7 词。'
        : '请至少选择 1 个单词。'}
      cancel={{ label: '取消' }}
      confirm={{
        // 生成中：键上的字不换、不变淡，用 Button busy（DESIGN.md §5 Waiting）。
        label: `生成 ${selectedCount} 词练字纸`,
        busy,
        disabled: selectedCount === 0,
        onClick: () => onConfirm(entries.filter((entry) => selectedIds.has(entry.id)).map((entry) => entry.id), mode),
      }}
    >
      <div className="vocabulary-handwriting-selector-toolbar">
        <strong>已选 {selectedCount} / {entries.length} 词</strong>
        <div>
          <button type="button" onClick={() => setSelectedIds(new Set(entries.map((entry) => entry.id)))} disabled={busy}>全选</button>
          <button type="button" onClick={() => setSelectedIds(new Set())} disabled={busy || selectedCount === 0}>清空</button>
        </div>
      </div>

      <fieldset className="vocabulary-handwriting-selector-mode">
        <legend>练习方式</legend>
        <label className={mode === 'standard' ? 'is-selected' : undefined}>
          <input
            type="radio"
            name="vocabulary-handwriting-mode"
            value="standard"
            checked={mode === 'standard'}
            onChange={() => setMode('standard')}
            disabled={busy}
          />
          <span><strong>标准练习</strong><small>描红后独立书写</small></span>
        </label>
        <label className={mode === 'single' ? 'is-selected' : undefined}>
          <input
            type="radio"
            name="vocabulary-handwriting-mode"
            value="single"
            checked={mode === 'single'}
            onChange={() => setMode('single')}
            disabled={busy}
          />
          <span><strong>每词写 1 遍</strong><small>看范字，独立书写一次</small></span>
        </label>
      </fieldset>

      <div className="vocabulary-handwriting-selector-list" role="group" aria-label="练字单词">
        {entries.map((entry, index) => {
          const checked = selectedIds.has(entry.id)
          return (
            <label key={entry.id} className={checked ? 'is-selected' : undefined}>
              <input type="checkbox" checked={checked} onChange={() => toggleEntry(entry.id)} disabled={busy} />
              <span className="vocabulary-handwriting-selector-check" aria-hidden="true">{checked && <Check size={14} />}</span>
              <span className="vocabulary-handwriting-selector-order">{index + 1}</span>
              <strong>{entry.headword}</strong>
            </label>
          )
        })}
      </div>
    </Dialog>
  )
}
