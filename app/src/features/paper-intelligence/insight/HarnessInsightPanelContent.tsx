/**
 * HarnessInsightPanelContent.tsx — Issue #21-C4 PaperSurface Insight
 * Parity.
 *
 * Harness-local presentational component that renders the body of the
 * insight popover for `surface=paper`. Mirrors the
 * `<LoadsPanel /> + <OutlinePanel /> + <ChunksSummary />` block from
 * `PaperIntelligencePreview.tsx` (Cut D1) so the popover content reads
 * identically to the default PI route.
 *
 * Why a local copy:
 *
 *   - The harness lives at `surface=paper`. The default PI route is
 *     at `surface=printable` (and the rest of the PI feature). We
 *     intentionally avoid refactoring `PaperIntelligencePreview.tsx`
 *     in the C4 cut so the default route ships unchanged.
 *   - Importing the default PI's three internal helpers would couple
 *     the harness to `paperIntelligence.css` for the
 *     `.pi-loads / .pi-outline / .pi-chunks` classes. We use harness-
 *     local class names (`pi-ps-insight-...`) styled in
 *     `paperIntelligencePaperSurfaceHarness.css`, so the harness does
 *     not need `paperIntelligence.css`.
 *   - The duplication is recorded in
 *     `docs/paper-surface-watch-ledger.md` as the future dedupe
 *     target — both routes can later collapse onto a single shared
 *     `<InsightPanelContent />` once the print-mode mount story
 *     stabilizes.
 *
 * Module discipline:
 *   - Presentational only. No hooks, no `useState`, no `useEffect`.
 *   - No fetch, no `localStorage` / `sessionStorage` / `indexedDB` /
 *     `document.cookie`, no router.
 *   - No PaperSurface imports.
 *   - No basket / paperAssembly / draft action.
 *   - No annotation pack.
 *   - No "read this sentence" / `request-reading-focus` button.
 *   - Pure JSX off the read-only `PassageReport` type.
 */

import type { ReactNode } from 'react'
import type {
  KeyChunk,
  LoadBar,
  PassageLoads,
  PassageOutline,
  PassageReport,
} from '../paperIntelligenceTypes'

/**
 * Same five-row order as the default PI route's `LOAD_KEYS`. Kept
 * inline (rather than imported) so the harness file boundary stays
 * clean — the default PI route file is forbidden to edit in C4.
 */
const LOAD_ROWS: ReadonlyArray<{ key: keyof PassageLoads; label: string }> = [
  { key: 'vocabularyChunkLoad', label: '词汇词块' },
  { key: 'grammarLoad', label: '语法' },
  { key: 'discourseStructureLoad', label: '语篇结构' },
  { key: 'topicBackgroundLoad', label: '主题背景' },
  { key: 'evidenceFindingLoad', label: '证据寻找' },
]

export function HarnessInsightPanelContent(props: {
  reportPassage: PassageReport
}): ReactNode {
  const { reportPassage } = props
  return (
    <>
      <HarnessLoads loads={reportPassage.loads} />
      <HarnessOutline outline={reportPassage.passageOutline} />
      <HarnessChunksSummary chunks={reportPassage.keyChunks} />
    </>
  )
}

function HarnessLoads({ loads }: { loads: PassageLoads }): ReactNode {
  return (
    <div className="pi-ps-insight-loads">
      <h3 className="pi-ps-insight-loads-title">篇章负荷</h3>
      {LOAD_ROWS.map(({ key, label }) => {
        const bar = loads[key] as LoadBar | undefined
        if (!bar) return null
        return <HarnessLoadRow key={key} label={label} bar={bar} />
      })}
    </div>
  )
}

function HarnessLoadRow({ label, bar }: { label: string; bar: LoadBar }): ReactNode {
  return (
    <div className="pi-ps-insight-load-row">
      <span className="pi-ps-insight-load-label">{label}</span>
      <div className="pi-ps-insight-load-bar">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="pi-ps-insight-load-cell"
            data-filled={i <= bar.score ? 'true' : undefined}
            data-high={i <= bar.score && bar.score >= 4 ? 'true' : undefined}
          />
        ))}
      </div>
      <span className="pi-ps-insight-load-score">{bar.label}</span>
      <span className="pi-ps-insight-load-reason">{bar.shortReason}</span>
    </div>
  )
}

function HarnessOutline({ outline }: { outline: PassageOutline }): ReactNode {
  return (
    <div className="pi-ps-insight-outline">
      <p className="pi-ps-insight-outline-idea">{outline.mainIdea}</p>
      <ol className="pi-ps-insight-outline-layers">
        {outline.logicalLayers.map((layer, i) => (
          <li key={i}>{layer}</li>
        ))}
      </ol>
    </div>
  )
}

function HarnessChunksSummary({ chunks }: { chunks: KeyChunk[] }): ReactNode {
  const count = Array.isArray(chunks) ? chunks.length : 0
  return (
    <div className="pi-ps-insight-chunks">
      <h3 className="pi-ps-insight-chunks-title">重要词块 · {count} 个</h3>
    </div>
  )
}
