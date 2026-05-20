/**
 * HarnessInsightPanelContent.tsx — Issue #21-C4 / C5b PaperSurface
 * Insight Parity.
 *
 * Harness-local presentational component that renders the body of the
 * passage-structure panel for `surface=paper`.
 *
 * C5b adds clickable paragraph rows and a passage-level "篇章" button
 * that drive the structure brace overlay. Each row calls
 * `onBraceTarget` with the appropriate target descriptor.
 *
 * Module discipline:
 *   - Presentational only. No hooks, no `useState`, no `useEffect`.
 *   - No fetch, no `localStorage` / `sessionStorage` / `indexedDB` /
 *     `document.cookie`, no router.
 *   - No PaperSurface imports.
 *   - No basket / paperAssembly / draft action.
 *   - No annotation pack.
 *   - No "read this sentence" / `request-reading-focus` button.
 *   - Pure JSX off the read-only `PassageReport` type + structure data.
 */

import type { ReactNode } from 'react'
import type { PassageOutline, PassageReport, PassageStructure } from '../paperIntelligenceTypes'
import type { StructureBraceTarget } from '../structureBrace'

export function HarnessInsightPanelContent(props: {
  reportPassage: PassageReport
  passageStructure?: PassageStructure | null
  braceTarget?: StructureBraceTarget
  onBraceTarget?: (target: StructureBraceTarget) => void
}): ReactNode {
  const { reportPassage, passageStructure, braceTarget, onBraceTarget } = props
  return (
    <>
      <HarnessOutline outline={reportPassage.passageOutline} />
      {passageStructure && onBraceTarget && (
        <HarnessStructureRows
          structure={passageStructure}
          braceTarget={braceTarget ?? null}
          onBraceTarget={onBraceTarget}
        />
      )}
    </>
  )
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

/**
 * C5b: Clickable paragraph structure rows + passage-level button.
 *
 * Each row is a real <button> so keyboard navigation works. Clicking
 * a paragraph row sets the brace to paragraph mode; clicking "篇章"
 * sets it to passage mode. Re-clicking the active row toggles the
 * brace off (handled by the parent's toggle logic).
 */
function HarnessStructureRows(props: {
  structure: PassageStructure
  braceTarget: StructureBraceTarget
  onBraceTarget: (target: StructureBraceTarget) => void
}): ReactNode {
  const { structure, braceTarget, onBraceTarget } = props

  const isPassageActive =
    braceTarget !== null &&
    braceTarget.mode === 'passage' &&
    braceTarget.section === structure.section

  return (
    <div className="pi-ps-insight-structure-rows">
      <button
        type="button"
        className={
          isPassageActive
            ? 'pi-ps-insight-structure-row pi-ps-insight-structure-row--active'
            : 'pi-ps-insight-structure-row'
        }
        onClick={() =>
          onBraceTarget({ mode: 'passage', section: structure.section })
        }
        aria-pressed={isPassageActive}
        data-structure-row="passage"
      >
        <span className="pi-ps-insight-structure-row-label">篇章</span>
      </button>
      {structure.paragraphs.map((para) => {
        const isActive =
          braceTarget !== null &&
          braceTarget.mode === 'paragraph' &&
          braceTarget.section === structure.section &&
          braceTarget.paragraphId === para.id
        return (
          <button
            key={para.id}
            type="button"
            className={
              isActive
                ? 'pi-ps-insight-structure-row pi-ps-insight-structure-row--active'
                : 'pi-ps-insight-structure-row'
            }
            onClick={() =>
              onBraceTarget({
                mode: 'paragraph',
                section: structure.section,
                paragraphId: para.id,
              })
            }
            aria-pressed={isActive}
            data-structure-row={para.id}
          >
            <span className="pi-ps-insight-structure-row-label">{para.label}</span>
          </button>
        )
      })}
    </div>
  )
}
