import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReadingAnalysisDemoRoute } from './features/reading-analysis/ReadingAnalysisDemoRoute.tsx'
import { parseReadingAnalysisRoute } from './features/reading-analysis/readingAnalysisRoute.ts'
import { PaperIntelligencePreview } from './features/paper-intelligence/PaperIntelligencePreview.tsx'
import { parsePaperIntelligenceRoute } from './features/paper-intelligence/paperIntelligenceRoute.ts'

/**
 * Tiny client-side router. The main app is unchanged; the URL is consulted
 * once at boot to decide whether to render the Reading Analysis view,
 * Paper Intelligence preview, or the default App.
 *
 * Dispatch:
 *   - `?view=paper-intelligence&paperId=…`    → Paper Intelligence preview (readonly)
 *   - `?view=reading-analysis[&groupId=…]`    → product entry
 *   - `?demo=reading-analysis` / `#reading-analysis` → dev/demo alias
 *   - anything else                           → `<App />`
 *
 * Paper Intelligence is checked first because it's a distinct view param
 * that doesn't conflict with reading-analysis.
 */
const piRoute =
  typeof window === 'undefined'
    ? { kind: 'none' as const }
    : parsePaperIntelligenceRoute(window.location)

const raRoute =
  typeof window === 'undefined'
    ? { kind: 'app' as const }
    : parseReadingAnalysisRoute(window.location)

function RootComponent() {
  if (piRoute.kind === 'paper-intelligence') {
    return <PaperIntelligencePreview paperId={piRoute.paperId} />
  }
  if (raRoute.kind === 'reading-analysis') {
    return <ReadingAnalysisDemoRoute />
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
