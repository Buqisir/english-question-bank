/**
 * ConciergeGroupCard — one 题组/篇章 row inside the expanded 卷面目录
 * (home-editorial cut retired the old nine-card grid; this component now
 * renders a dense index row, not a card — the file name is kept unchanged
 * per the cut's contract even though the visual is a list row).
 *
 * Carries the per-group reason and the teacher-facing actions (加入草稿卷
 * as a `+` icon, plus 相似篇章 / 详情 / 阅读解析 inside a `…` menu).
 * Clicking the row (outside `+` / `…` / the menu) opens the same detail
 * view as the 详情 item.
 *
 * Smallest add unit is still QuestionGroup. There is no per-question add UI.
 */

import { type MouseEvent, type ReactNode } from 'react'
import { ReadingAnalysis, Paper, Papers } from '../icons'
import { DraftAddButton } from '../shared-ui/DraftAddButton.tsx'
import { type QuestionGroupCard } from '../domain/questionBank.ts'
import { buildTopicText, compactPassageTitle, compactSummary } from './passageText.ts'
import { Menu, type MenuAction } from '../shared-ui/Menu.tsx'
import { buildPaperBrowseLectureHref } from './paperSurfaceHref.ts'
import {
  SimilarPassagesPanel,
  similarPassagesRecipeSummary,
  type SimilarPassagesRequestState,
} from '../features/similar-passages/SimilarPassagesPanel'

// similar-passages-entry (E6, was similar-entrypoints E3): the four
// groupTypes the v2 passages recipe supports (program.md Q5 — writing
// excluded, no facet). `QuestionGroupCard`'s `groupType` is DB-style
// (domain/questionBank.ts GroupType) — this file is not the domain schema,
// just a display-gate reading the type's existing string values.
const SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'seven_choices', 'grammar_cloze'])

export type ConciergeGroupCardProps = {
  group: QuestionGroupCard
  reason: string
  alreadyInBasket: boolean
  /** classic-retire-2-detail-view — opens the read-only detail view for this group. */
  onOpenDetail?: (group: QuestionGroupCard) => void
  /**
   * home-editorial — search-hit rows render at full ink; non-hit rows inside
   * an expanded search result dim to ink-faint instead of the retired
   * green-tint/teal-stripe treatment. Feed rows (browsing, no search) never
   * pass true here — every group in a browse feed is trivially "hit".
   */
  dimmed?: boolean

  /** similar-passages-entry (E6): full corpus lookup, for resolving a
   * candidate's groupId to a full QuestionGroupCard (加入草稿卷 + SW-3 thin
   * disabled state). Owned by ConciergeDesk. */
  questionGroupById: Map<string, QuestionGroupCard>
  /** similar-passages-entry (E6): true when THIS card's候选面板 is the one
   * currently expanded (ConciergeDesk enforces only one at a time —
   * "切卡自动收起"). */
  isSimilarPassagesOpen: boolean
  /** similar-passages-entry (E6): null until `isSimilarPassagesOpen`, then
   * the shared fetch's request state (owned by ConciergeDesk). */
  similarPassagesRequest: SimilarPassagesRequestState | null
  onToggleSimilar: (groupId: string) => void
  onRetrySimilar: () => void
}

export function ConciergeGroupCard(props: ConciergeGroupCardProps): ReactNode {
  const {
    group,
    reason,
    alreadyInBasket,
    onOpenDetail,
    dimmed,
    questionGroupById,
    isSimilarPassagesOpen,
    similarPassagesRequest,
    onToggleSimilar,
    onRetrySimilar,
  } = props
  const passageTitle = compactPassageTitle(group)
  const summary = compactSummary(group)
  const topicText = buildTopicText(group)
  // flow-panel 刀 3: 看解析 entry migrates from the old解析页
  // (?view=paper-intelligence&surface=paper...) to the整卷页讲评态
  // (?view=paper-browse&...&lecture=1) via the shared href helper. Stays a
  // plain `<a href>` (native navigation — 中键/新标签可用); no SPA
  // click-intercept here because threading a paper-browse-lecture opener
  // through ConciergeDesk/ConciergePaperRow is out of this cut's Scope
  // whitelist (only ConciergeGroupCard.tsx itself is in-scope for this
  // entry's link shape).
  const paperSurfaceAnalysisHref =
    group.hasPaperSurfaceAnalysis && group.paperSurfaceHref && group.paperSurfaceLabel
      ? buildPaperBrowseLectureHref(group.paperSurfaceHref)
      : null
  // similar-passages-entry (E6, was similar-entrypoints E3 深链导航):「配
  // 相似」→「相似篇章」，深链退役——点击原地展开卡下方的共享候选面板
  // （ConciergeDesk 拥有 fetch，本组件只切换 isSimilarPassagesOpen）。渲染
  // 条件同详情页：只有配方收录的四类题型才出现，写作组隐藏（池子诚实）。
  const similarEligible = SIMILAR_SUPPORTED_GROUP_TYPES.has(group.groupType)
  const draftState = group.draftPaperButtonState || (alreadyInBasket ? 'in_current_draft' : 'add')

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenDetail) return
    const target = event.target as HTMLElement
    // .eqb-draft-add：加入键加入后的「已加入」那块纸不是按钮，点在上面也不打开详情。
    if (target.closest('button, a, input, textarea, select, [role="button"], [role="menu"], .eqb-draft-add')) return
    onOpenDetail(group)
  }

  const menuItems: MenuAction[] = []
  if (similarEligible) {
    menuItems.push({
      key: 'similar',
      label: '相似篇章',
      icon: <Papers size={16} aria-hidden="true" />,
      data: { 'data-ra-entry': 'group-card-similar', 'data-ra-group-id': group.id },
      onSelect: () => onToggleSimilar(group.id),
    })
  }
  if (onOpenDetail) {
    menuItems.push({
      key: 'detail',
      label: '详情',
      icon: <Paper size={16} aria-hidden="true" />,
      href: `?view=detail&groupId=${encodeURIComponent(group.id)}`,
      onSelect: (event) => {
        event.preventDefault()
        onOpenDetail(group)
      },
    })
  }
  if (paperSurfaceAnalysisHref) {
    menuItems.push({
      key: 'analysis',
      label: group.paperSurfaceLabel || '阅读解析',
      icon: <ReadingAnalysis size={16} aria-hidden="true" />,
      href: paperSurfaceAnalysisHref,
      data: { 'data-ra-entry': 'group-card', 'data-ra-group-id': group.id },
    })
  }

  return (
    <div
      className={`concierge-group-row${dimmed ? ' is-dim' : ''}`}
      data-group-id={group.id}
    >
      <div className="concierge-group-row-line" onClick={handleRowClick}>
        <div className="concierge-group-row-body">
          <div className="concierge-group-row-main">
            <strong className="concierge-group-row-title" title={passageTitle}>
              {passageTitle}
            </strong>
            {summary && (
              <span className="concierge-group-row-summary" title={summary}>
                {summary}
              </span>
            )}
          </div>
          {reason && (
            <p className="concierge-group-row-reason" title={reason}>
              <span className="concierge-group-reason-label">推荐理由：</span>
              {reason}
            </p>
          )}
        </div>

        <div className="concierge-group-row-trail">
          {topicText && <span className="concierge-group-row-topic">{topicText}</span>}
          {/* 走查第四节第 6 条：加入键换成共用 DraftAddButton（紧凑档，加入前只有加号；加入后是「已加入 · 撤回」那块纸）。
              行上点击（handleRowClick）碰到 button 或 .eqb-draft-add 就不打开详情，所以不用再 stopPropagation。 */}
          <DraftAddButton
            className="concierge-group-row-add"
            target={{ ...group, draftPaperButtonState: draftState }}
            tone="subtle"
            size="sm"
            compact
          />
          <Menu items={menuItems} label="更多操作" triggerClassName="concierge-group-row-menu-trigger" />
        </div>
      </div>

      {isSimilarPassagesOpen && similarPassagesRequest && (
        <SimilarPassagesPanel
          recipeSummary={similarPassagesRecipeSummary(group.groupType)}
          request={similarPassagesRequest}
          questionGroupById={questionGroupById}
          onCollapse={() => onToggleSimilar(group.id)}
          onRetry={onRetrySimilar}
        />
      )}
    </div>
  )
}
