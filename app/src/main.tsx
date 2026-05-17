import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReadingAnalysisDemoRoute } from './features/reading-analysis/ReadingAnalysisDemoRoute.tsx'
import { parseReadingAnalysisRoute } from './features/reading-analysis/readingAnalysisRoute.ts'
import { parsePaperIntelligenceRoute } from './features/paper-intelligence/paperIntelligenceRoute.ts'

/**
 * Tiny client-side router. The main app is unchanged; the URL is consulted
 * once at boot to decide whether to render the Reading Analysis view,
 * Paper Intelligence preview (via App shell), or the default App.
 *
 * Dispatch:
 *   - `?view=paper-intelligence&paperId=…`    → App shell renders PI preview
 *   - `?view=reading-analysis[&groupId=…]`    → product entry
 *   - `?demo=reading-analysis` / `#reading-analysis` → dev/demo alias
 *   - anything else                           → `<App />`
 *
 * Paper Intelligence route is parsed here and forwarded to App as a prop
 * so App can supply basket-related context to PaperIntelligencePreview.
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
  if (raRoute.kind === 'reading-analysis') {
    return <ReadingAnalysisDemoRoute />
  }
  return <App piRoute={piRoute} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
