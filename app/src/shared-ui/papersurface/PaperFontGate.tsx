import { useEffect, useState, type ReactNode } from 'react'
import { paperFontFaces } from '../../../../shared/papersurface/paperFonts.mjs'
import '../../../../shared/papersurface/fontRendering.css'

let ready: Promise<void> | undefined
let loaded = false

function loadFonts(): Promise<void> {
  ready ??= Promise.all(paperFontFaces.map(async ({ family, style, weight, path, sha256 }) => {
    const response = await fetch(`/fonts/paper/${path}`)
    if (!response.ok) throw new Error('Paper font unavailable')
    const bytes = await response.arrayBuffer()
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('')
    if (digest !== sha256) throw new Error('Paper font integrity mismatch')
    const face = await new FontFace(family, bytes, { style, weight }).load()
    document.fonts.add(face)
  })).then(() => { loaded = true }).catch(error => {
    ready = undefined
    throw error
  })
  return ready
}

// Mount geometry-measuring consumers only after the pinned bytes are ready.
export function PaperFontGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState(loaded ? 'ready' : 'loading')
  useEffect(() => {
    let active = true
    loadFonts().then(
      () => { if (active) setStatus('ready') },
      () => { if (active) setStatus('error') },
    )
    return () => { active = false }
  }, [])
  // Static markup consumers have no layout engine or FontFaceSet. Keep their
  // semantic HTML available; the mounted browser path still waits above.
  if (typeof document === 'undefined') return children
  if (status === 'error') return <p role="alert">试卷字体加载失败，请刷新重试。</p>
  if (status !== 'ready') return <p role="status">正在加载试卷字体…</p>
  return children
}
