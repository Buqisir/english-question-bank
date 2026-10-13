import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ensurePaperFonts, paperFontsReady, requiredPaperFonts } from './paperFontLoader'
import '../../../../shared/papersurface/fontRendering.css'

// Mount geometry-measuring consumers only after the pinned bytes are ready.
export function PaperFontGate({ children, content = children }: { children: ReactNode; content?: unknown }) {
  const fonts = useMemo(() => requiredPaperFonts(content), [content])
  const key = fonts.map(font => font.sha256).sort().join(':')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [, rerender] = useState(0)
  const ready = paperFontsReady(fonts)
  useEffect(() => {
    if (ready || errorKey === key) return
    let active = true
    ensurePaperFonts(content).then(
      () => { if (active) rerender(value => value + 1) },
      () => { if (active) setErrorKey(key) },
    )
    return () => { active = false }
  }, [content, ready, key, errorKey])
  // Static markup consumers have no layout engine or FontFaceSet. Keep their
  // semantic HTML available; the mounted browser path still waits above.
  if (typeof document === 'undefined') return children
  if (!ready && errorKey === key) return <p role="alert">试卷字体加载失败，请刷新重试。</p>
  if (!ready) return <p role="status">正在加载试卷字体…</p>
  return children
}
