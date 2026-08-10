import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { VocabularyListenPage } from './features/vocabulary-listen/VocabularyListenPage.tsx'
import { VocabularyDictationPage } from './features/vocabulary-dictation/VocabularyDictationPage.tsx'
import type { VocabularyAudioAccent } from './features/vocabulary-listen/vocabularyAudioVariants.ts'

/**
 * reading-analysis-retire (2026-07-16): boot-time self-heal for the two
 * retired orphan routes — `?view=reading-analysis` (+ `?demo=` /
 * `#reading-analysis` aliases) and `?view=paper-intelligence` (both the
 * default preview and the `surface=paper` harness). Neither route parser
 * nor either feature survives this cut (see
 * docs/cuts/reading-analysis-retire/reachability.md §2); any old URL still
 * pointing at them must not dead-end on a blank/broken screen.
 *
 * Self-heal contract (owner-ratified, plan.md Scope 步 1):
 *   - `?view=paper-intelligence&paperId=<id>` (with or without
 *     `surface=paper`) → replaceState to
 *     `?view=paper-browse&paperId=<id>&lecture=1` (the live 整卷页讲评态).
 *   - `?view=paper-intelligence` with no `paperId`, or
 *     `?view=reading-analysis` / `?demo=reading-analysis` /
 *     `#reading-analysis` → replaceState to the bare home URL.
 *
 * Runs once, synchronously, before the first render — `history.replaceState`
 * so the broken URL never enters browser history (nothing to Back into).
 */
function healRetiredOrphanRoutes(): void {
  if (typeof window === 'undefined') return
  const { location, history } = window
  const params = new URLSearchParams(location.search)
  const view = params.get('view')

  if (view === 'paper-intelligence') {
    const paperId = params.get('paperId')?.trim()
    if (paperId) {
      const next = new URLSearchParams()
      next.set('view', 'paper-browse')
      next.set('paperId', paperId)
      next.set('lecture', '1')
      history.replaceState(history.state, '', `${location.pathname}?${next.toString()}`)
    } else {
      history.replaceState(history.state, '', location.pathname)
    }
    return
  }

  if (
    view === 'reading-analysis' ||
    params.get('demo') === 'reading-analysis' ||
    location.hash === '#reading-analysis'
  ) {
    history.replaceState(history.state, '', location.pathname)
  }
}

healRetiredOrphanRoutes()

function getPublicVocabularyShareId(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/vocabulary\/listen\/([^/]+)\/?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

const publicVocabularyShareId = getPublicVocabularyShareId()

function getPublicVocabularyDictationRequest(): { shareId: string; accent: VocabularyAudioAccent } | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/vocabulary\/dictation\/([^/]+)\/?$/)
  if (!match) return null
  try {
    return {
      shareId: decodeURIComponent(match[1]),
      accent: new URLSearchParams(window.location.search).get('accent') === 'british' ? 'british' : 'american',
    }
  } catch {
    return { shareId: '', accent: 'american' }
  }
}

const publicVocabularyDictationRequest = getPublicVocabularyDictationRequest()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicVocabularyDictationRequest ? (
      <VocabularyDictationPage {...publicVocabularyDictationRequest} />
    ) : publicVocabularyShareId !== null ? (
      <VocabularyListenPage shareId={publicVocabularyShareId} />
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </StrictMode>,
)
