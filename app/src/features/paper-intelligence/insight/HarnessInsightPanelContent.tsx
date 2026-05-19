/**
 * HarnessInsightPanelContent.tsx — Issue #21-C4 PaperSurface Insight
 * Parity.
 *
 * Harness-local presentational component that renders the body of the
 * passage-structure panel for `surface=paper`.
 *
 * Why a local copy:
 *
 *   - The harness lives at `surface=paper`. The default PI route is
 *     at `surface=printable` (and the rest of the PI feature). We
 *     intentionally avoid refactoring `PaperIntelligencePreview.tsx`
 *     in the C4 cut so the default route ships unchanged.
 *   - The PaperSurface page is an A4 reading surface, not the full
 *     Paper Intelligence dashboard. Browser QA showed that load bars
 *     and chunk counts were too heavy for the left rail at normal
 *     zoom. This panel now keeps only the article structure that
 *     helps the teacher orient the passage while reading the paper.
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
import type { PassageOutline, PassageReport } from '../paperIntelligenceTypes'

export function HarnessInsightPanelContent(props: {
  reportPassage: PassageReport
}): ReactNode {
  const { reportPassage } = props
  return <HarnessOutline outline={reportPassage.passageOutline} />
}

function HarnessOutline({ outline }: { outline: PassageOutline }): ReactNode {
  return (
    <div className="pi-ps-insight-outline">
      <h3 className="pi-ps-insight-outline-title">行文结构</h3>
      <p className="pi-ps-insight-outline-idea">{outline.mainIdea}</p>
      <ol className="pi-ps-insight-outline-layers">
        {outline.logicalLayers.map((layer, i) => (
          <li key={i}>{layer}</li>
        ))}
      </ol>
    </div>
  )
}
