import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
}

export function VocabularyHandwritingSelector({
  title,
  entries,
  busy = false,
  onCancel,
  onConfirm,
}: VocabularyHandwritingSelectorProps) {
  const initialIds = useMemo(
    () => entries.slice(0, entries.length <= 10 ? entries.length : 10).map((entry) => entry.id),
    [entries],
  )
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialIds))
  const [mode, setMode] = useState<VocabularyHandwritingMode>('standard')
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCancelRef = useRef(onCancel)
  const busyRef = useRef(busy)

  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  const selectedCount = selectedIds.size

  function toggleEntry(entryId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  return (
    <div
      className="vocabulary-handwriting-selector-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        className="vocabulary-handwriting-selector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocabulary-handwriting-selector-title"
      >
        <header>
          <div>
            <h2 id="vocabulary-handwriting-selector-title">选择练字单词</h2>
            <p>{title} · 保持原词序</p>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="关闭练字单词选择" onClick={onCancel} disabled={busy}>
            <X size={18} />
          </button>
        </header>

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

        <footer>
          <p>{selectedCount
            ? mode === 'single'
              ? '每词保留 1 个书写位，每页约 10 词。'
              : '描红后独立书写，每页约 7 词。'
            : '请至少选择 1 个单词。'}</p>
          <div>
            <button className="ghost-button" type="button" onClick={onCancel} disabled={busy}>取消</button>
            <button
              className="primary-button"
              type="button"
              onClick={() => onConfirm(entries.filter((entry) => selectedIds.has(entry.id)).map((entry) => entry.id), mode)}
              disabled={busy || selectedCount === 0}
            >
              {busy ? '正在生成…' : `生成 ${selectedCount} 词练字纸`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
