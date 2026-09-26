import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const controller = new AbortController()
    setState('checking')
    setNote('')
    fetchNotebookSelectionState({
      clientMutationId: `state-${paperId}-${segment.streamId}-${segment.start}`,
      paperId,
      sourceRevision,
      segments: [segment],
    }).then((result) => {
      if (!controller.signal.aborted) setState(result.state)
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

  const label = state === 'checking' ? '正在检查…'
    : state === 'saving' ? '正在加入…'
    : state === 'occurrence-exists' ? '✓ 已加入生词本'
    : state === 'entry-exists' ? '＋ 加入此语境'
    : state === 'failed' ? '加入失败，重试'
    : '＋ 加入生词本'

  return (
    <div className="paper-dictionary-notebook">
      <button
        type="button"
        className="paper-dictionary-more"
        disabled={state === 'checking' || state === 'saving' || state === 'occurrence-exists'}
        onClick={() => { if (state !== 'occurrence-exists') void add() }}
      >
        {label}
      </button>
      {note ? <p className="paper-dictionary-note">{note}</p> : null}
    </div>
  )
}
