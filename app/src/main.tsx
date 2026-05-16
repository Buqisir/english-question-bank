import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReadingAnalysisDemoRoute } from './features/reading-analysis/ReadingAnalysisDemoRoute.tsx'

/**
 * Tiny demo router. The main app is unchanged; appending
 * `?demo=reading-analysis` (or `#reading-analysis`) to the URL boots into the
 * Reading Analysis PoC instead.
 */
function pickRoot(): 'app' | 'reading-analysis' {
  if (typeof window === 'undefined') return 'app'
  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') === 'reading-analysis') return 'reading-analysis'
  if (window.location.hash === '#reading-analysis') return 'reading-analysis'
  return 'app'
}

const rootKind = pickRoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {rootKind === 'reading-analysis' ? <ReadingAnalysisDemoRoute /> : <App />}
  </StrictMode>,
)
