import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 启动壳和启动失败页（等待第五轮，2026-11-15）：只有壳的标记和样式，不拿页面代码；页面代码块照旧按需加载（verify-launch-deploy Slice 1）。
import {
  BootstrapError,
  PublicVocabularyDictationBootShell,
  PublicVocabularyListenBootShell,
} from './publicVocabularyBootShell.tsx'
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

const root = createRoot(document.getElementById('root')!)

/** 灰块一呼一吸一圈的长度：和 waiting.css .eqb-skeleton 的 --eqb-skeleton-cycle 同一个数（DESIGN §5「灰块」）。 */
const BOOT_SKELETON_CYCLE_MS = 1800

async function bootstrap() {
  if (publicVocabularyDictationRequest) {
    const bootStartedAt = performance.now()
    root.render(<PublicVocabularyDictationBootShell phaseDelay={`-${Math.round(bootStartedAt % BOOT_SKELETON_CYCLE_MS)}ms`} />)
    const { VocabularyDictationPage } = await import('./features/vocabulary-dictation/VocabularyDictationPage.tsx')
    root.render(
      <StrictMode>
        <VocabularyDictationPage {...publicVocabularyDictationRequest} bootStartedAt={bootStartedAt} />
      </StrictMode>,
    )
    return
  }

  if (publicVocabularyShareId !== null) {
    root.render(<PublicVocabularyListenBootShell />)
    const { VocabularyListenPage } = await import('./features/vocabulary-listen/VocabularyListenPage.tsx')
    root.render(
      <StrictMode>
        <VocabularyListenPage shareId={publicVocabularyShareId} />
      </StrictMode>,
    )
    return
  }

  const [{ default: App }, { AuthGate }] = await Promise.all([
    import('./App.tsx'),
    import('./auth/AuthGate.tsx'),
  ])
  root.render(
    <StrictMode>
      <AuthGate>
        <App />
      </AuthGate>
    </StrictMode>,
  )
}

void bootstrap().catch(() => root.render(<BootstrapError />))
