import { useCallback, useEffect, useRef, useState } from 'react'

export function useClipboardCopy() {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle')
  const [error, setError] = useState('')
  const active = useRef(false)
  const request = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      request.current += 1
      clearTimeout(timeout.current)
    }
  }, [])

  const reset = useCallback(() => {
    request.current += 1
    clearTimeout(timeout.current)
    setState('idle')
    setError('')
  }, [])
  const copy = useCallback(async (text: string) => {
    if (!text) return
    const id = ++request.current
    clearTimeout(timeout.current)
    setState('pending')
    setError('')
    try {
      await navigator.clipboard.writeText(text)
      if (!active.current || id !== request.current) return
      setState('done')
      timeout.current = setTimeout(() => setState('idle'), 1800)
    } catch {
      if (!active.current || id !== request.current) return
      setState('idle')
      setError('复制未成功，请重试。')
    }
  }, [])
  return { state, copied: state === 'done', error, copy, reset }
}
