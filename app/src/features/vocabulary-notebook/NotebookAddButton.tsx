import { useEffect, useState } from 'react'
import { CheckRevealIcon } from '../../icons/MotionIcons'
import { iconMotionInput } from '../../icons/motionInput'
import { InlineWaitDots } from '../../shared-ui/WaitDots.tsx'
import { addNotebookContext, enrichNotebookContext, fetchNotebookSelectionState } from '../../services/vocabularyNotebook.ts'

type Segment = { streamId: string; start: number; end: number; selectedText: string }

export function NotebookAddButton({
  paperId,
  sourceRevision,
  segment,
}: {
  paperId: string
  sourceRevision: string
  segment: Segment
}) {
  const [state, setState] = useState<'checking' | 'not-added' | 'entry-exists' | 'occurrence-exists' | 'saving' | 'failed'>('checking')
  const [note, setNote] = useState('')
  // 只有本次点击“正在加入 → 已加入”才揭示勾；进来时就已加入的，直接显示静态勾。
  const [justAdded, setJustAdded] = useState(false)
  // 检查出来是「词已在生词本、这个语境还没有」时，键上写「加入此语境」；忙着加入、加入失败后重试时都照这个写。
  const [contextOnly, setContextOnly] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setState('checking')
    setNote('')
    setJustAdded(false)
    setContextOnly(false)
    fetchNotebookSelectionState({
      paperId,
      sourceRevision,
      segments: [segment],
    }).then((result) => {
      if (controller.signal.aborted) return
      setState(result.state)
      setContextOnly(result.state === 'entry-exists')
    }).catch(() => {
      if (!controller.signal.aborted) setState('failed')
    })
    return () => controller.abort()
  }, [paperId, sourceRevision, segment.streamId, segment.start, segment.end, segment.selectedText])

  async function add() {
    setState('saving')
    setNote('')
    try {
      const saved = await addNotebookContext({
        clientMutationId: crypto.randomUUID(),
        paperId,
        sourceRevision,
        segments: [segment],
      })
      setState('occurrence-exists')
      setJustAdded(true)
      const channel = new BroadcastChannel('eqb-vocabulary-notebook')
      channel.postMessage({ type: 'changed' })
      channel.close()
      await enrichNotebookContext(saved.contextId).catch(() => {
        setNote('译文待补全')
      })
    } catch (error) {
      setState('failed')
      setNote(error instanceof Error ? error.message : '没有加入成功')
    }
  }

  // 等待第三轮（Owner 2026-11-15 定，DESIGN.md §5 Waiting）：文字链不改成按键；在等（检查、加入）时字不换，
  // 固定成静止时那句「加入」的字，字后面跟小号所以点（12px 小字旁 14px，自带 300ms 门槛）。
  // 原来写「正在检查… / 正在加入…」。检查时还不知道是哪一种，按最常见的「加入生词本」写。
  const busy = state === 'checking' || state === 'saving'
  const addLabel = contextOnly ? '＋ 加入此语境' : '＋ 加入生词本'
  const label = busy ? addLabel
    : state === 'occurrence-exists' ? '已加入生词本'
    : state === 'failed' ? '加入失败，重试'
    : addLabel

  return (
    <div className="paper-dictionary-notebook">
      {/* 在等时点了不再触发、读屏念「忙」：照 shared-ui/Button 的 busy，用 aria-busy + aria-disabled，
          不用原生 disabled（焦点不掉）。已加入以后没有可做的事，仍是原生 disabled。 */}
      <button
        type="button"
        className="paper-dictionary-more"
        {...iconMotionInput}
        disabled={state === 'occurrence-exists'}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={() => { if (!busy && state !== 'occurrence-exists') void add() }}
      >
        {state === 'occurrence-exists' ? <CheckRevealIcon size={14} reveal={justAdded} /> : null}
        {/* 字和所以点包在一层里：键的 flex gap（3px）不落在它们之间，字和点之间不另加间距（waiting.css「所以点和字的间距」）。 */}
        <span>
          {label}
          <InlineWaitDots pending={busy} size="sm" />
        </span>
      </button>
      {note ? <p className="paper-dictionary-note">{note}</p> : null}
    </div>
  )
}
