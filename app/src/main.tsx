import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReadingAnalysisDemoRoute } from './features/reading-analysis/ReadingAnalysisDemoRoute.tsx'
import { parseReadingAnalysisRoute } from './features/reading-analysis/readingAnalysisRoute.ts'

/**
 * Tiny client-side router. The main app is unchanged; the URL is consulted
 * once at boot to decide whether to render the Reading Analysis view
 * instead.
 *
 * The actual matching logic lives in `readingAnalysisRoute.ts` — this file
 * only knows the dispatch:
 *
 *   - `?view=reading-analysis[&groupId=…]`    → product entry
 *   - `?demo=reading-analysis` / `#reading-analysis` → dev/demo alias
 *   - anything else                           → `<App />`
 *
 * No `?demo=reading-analysis` literal lives in this file. Adding new alias
 * forms or a new query parameter belongs in `readingAnalysisRoute.ts`.
 */
const route =
  typeof window === 'undefined'
    ? { kind: 'app' as const }
    : parseReadingAnalysisRoute(window.location)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route.kind === 'reading-analysis' ? <ReadingAnalysisDemoRoute /> : <App />}
  </StrictMode>,
)
