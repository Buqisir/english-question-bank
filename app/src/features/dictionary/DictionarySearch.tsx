import { useEffect, useRef, useState } from 'react'
import { searchOtterEntry } from '../../services/paperDictionary'
import { Notice } from '../../shared-ui/Notice'
import { SearchField } from '../../shared-ui/SearchField'

export function DictionarySearch({ onFound }: { onFound: (entryId: string) => void }) {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController>(null)
  useEffect(() => () => request.current?.abort(), [])

  function change(value: string) {
    request.current?.abort()
    setQuery(value)
    setMessage('')
    setBusy(false)
  }

  async function search() {
    const text = query.trim()
    if (!text || busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setMessage('')
    try {
      const entryId = await searchOtterEntry(text, controller.signal)
      if (controller.signal.aborted) return
      if (entryId) onFound(entryId)
      else setMessage('没有找到这个单词或短语')
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '词典搜索失败，请重试')
    } finally {
      if (request.current === controller && !controller.signal.aborted) setBusy(false)
    }
  }

  return <>
    <SearchField tier="compact" label="查单词或短语" placeholder="输入单词或短语"
      submitLabel="查词" submitDisabled={!query.trim() || busy} submitBusy={busy}
      inputRef={input} value={query} onValueChange={change} maxLength={128} spellCheck={false}
      onClear={() => { change(''); input.current?.focus() }}
      onSubmit={event => { event.preventDefault(); void search() }} />
    {busy && <Notice kind="waiting">正在查词</Notice>}
    {message && <Notice kind="info">{message}</Notice>}
  </>
}
