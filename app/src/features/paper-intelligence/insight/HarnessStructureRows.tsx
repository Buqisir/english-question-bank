/**
 * HarnessStructureRows.tsx — C5b inline clickable structure rows.
 *
 * Replaces the bottom `.pi-ps-structure-controls` button strip with
 * interactive rows that integrate directly into the structure content.
 * Each row is a real <button> with aria-pressed for a11y.
 *
 * Layout:
 *   [篇章]  mainIdea / overview text
 *   [P1]    段1 summary...
 *   [P2]    段2 summary...
 *   [P3]    段3 summary...
 *
 * The 篇章 row targets mode='passage'.
 * Each Pn row targets mode='paragraph' with the paragraph id.
 * Clicking the same active row toggles it off (handled by parent).
 */

import type { ReactNode } from 'react'
import type { PassageOutline } from '../paperIntelligenceTypes'
import type { StructureTarget } from '../structureBrace'

type ParagraphInfo = {
  id: string
  label: string
  text: string
}

type Props = {
  paperSection: string
  paragraphs: ParagraphInfo[]
  passageOutline: PassageOutline
  activeStructureTarget: StructureTarget | null
  onStructureTarget: (paperSection: string, mode: 'passage' | 'paragraph', paragraphId?: string) => void
}

export function HarnessStructureRows({
  paperSection,
  paragraphs,
  passageOutline,
  activeStructureTarget,
  onStructureTarget,
}: Props): ReactNode {
  const isPassageActive =
    activeStructureTarget?.paperSection === paperSection &&
    activeStructureTarget?.mode === 'passage'

  return (
    <div className="pi-ps-structure-rows" data-c5b-structure-rows="true">
      {/* 篇章 row — targets entire passage body */}
      <button
        type="button"
        className={
          isPassageActive
            ? 'pi-ps-structure-row pi-ps-structure-row--active'
            : 'pi-ps-structure-row'
        }
        onClick={() => onStructureTarget(paperSection, 'passage')}
        aria-pressed={isPassageActive}
        data-structure-row-mode="passage"
      >
        <span className="pi-ps-structure-row-badge">篇章</span>
        <span className="pi-ps-structure-row-text">
          {passageOutline.mainIdea}
        </span>
      </button>

      {/* Pn rows — each targets a specific paragraph */}
      {paragraphs.map((para, idx) => {
        const isActive = activeStructureTarget?.paragraphId === para.id
        // Use logicalLayers[idx] as summary fallback if available
        const summary = passageOutline.logicalLayers[idx] || para.text.slice(0, 60)
        return (
          <button
            key={para.id}
            type="button"
            className={
              isActive
                ? 'pi-ps-structure-row pi-ps-structure-row--active'
                : 'pi-ps-structure-row'
            }
            onClick={() => onStructureTarget(paperSection, 'paragraph', para.id)}
            aria-pressed={isActive}
            data-structure-row-mode="paragraph"
            data-paper-paragraph-id-target={para.id}
          >
            <span className="pi-ps-structure-row-badge">{para.label}</span>
            <span className="pi-ps-structure-row-text">{summary}</span>
          </button>
        )
      })}
    </div>
  )
}
