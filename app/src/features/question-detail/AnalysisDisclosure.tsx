import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export type AnalysisDisclosureProps = {
  /**
   * Static title shown in the toggle row regardless of expanded state, e.g.
   * a group-level block's own name ("全文翻译", "文章主旨"). When omitted,
   * the toggle row shows `expandText`/`collapseText` instead (per-question
   * analysis blocks, per 刀A plan: 「展开解析」/「收起」).
   */
  label?: string
  /** Text shown when collapsed and `label` is not set. Default: 展开解析. */
  expandText?: string
  /** Text shown when expanded and `label` is not set. Default: 收起. */
  collapseText?: string
  children: ReactNode
  className?: string
}

/**
 * Generic collapsible block for question-detail解析 content (刀A
 * analysis-layering). Owns its own expand/collapse state so
 * `QuestionGroupDetailView.tsx` can stay props-driven / zero-useState
 * (hard guardrail, `verify-classic-retire-2.mjs`). Default collapsed.
 *
 * Accessibility pattern follows `PaperAssetAnalysisPanel.tsx`'s option-row
 * toggle: a `<button>` with `aria-expanded` + `aria-pressed` reflecting
 * open state, and the disclosed content only rendered while expanded.
 */
export function AnalysisDisclosure({
  label,
  expandText = '展开解析',
  collapseText = '收起',
  children,
  className,
}: AnalysisDisclosureProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`analysis-disclosure${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="analysis-disclosure-toggle"
        aria-expanded={expanded}
        aria-pressed={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {label && <span className="analysis-disclosure-toggle-label">{label}</span>}
        <span className="analysis-disclosure-toggle-hint">{expanded ? collapseText : expandText}</span>
        <ChevronDown className="analysis-disclosure-chevron" size={14} aria-hidden="true" />
      </button>
      {expanded && <div className="analysis-disclosure-body">{children}</div>}
    </div>
  )
}
