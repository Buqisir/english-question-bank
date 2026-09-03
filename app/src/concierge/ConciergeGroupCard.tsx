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
import { BookOpen, Check, FileText, Files, Plus } from 'lucide-react'
import { type QuestionGroupCard } from '../domain/questionBank.ts'
import { ConciergeGroupRowMenu, type ConciergeGroupRowMenuItem } from './ConciergeGroupRowMenu.tsx'
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

// similar-passages-entry (E6): one-line, purely presentational recipe
function isDisplayTag(tag: string | undefined): tag is string {
  const value = (tag || '').trim()
  if (!value) return false
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value)) return false
  if (/^[\x21-\x7E]+$/.test(value) && value.length > 16) return false
  return !/(deepseek|steward|parse|eval|import|reading-parse|source-gap|gap-fill|导入草稿|管家规则|待审阅)/i.test(value)
}

function compactPassageTitle(group: QuestionGroupCard): string {
  const passageTitle = (group.passageTitle || '').trim()
  if (passageTitle && isDisplayTag(passageTitle)) return passageTitle
  const title = (group.title || '').trim()
  if (title && isDisplayTag(title)) return title
  return '篇章题组'
}

function compactSummary(group: QuestionGroupCard): string {
  const summary = (group.summary || '').trim()
  // 无真摘要的题组（完形/语法常见）summary 就是题组名本身——同词复读
  // 不渲，目录行只留名称+题数。
  if (summary === compactPassageTitle(group)) return ''
  return summary
}

/**
 * Topic labels are stored as a full `theme-themeGroup-subtopic` path (e.g.
 * "人与自然-自然生态-生态环境"). The row shows only the leaf subtopic — the
 * specific, teacher-recognizable phrase — not the whole path.
 */
function topicLeafLabel(group: QuestionGroupCard): string | null {
  const first = group.topicLabels?.[0]
  if (!first) return null
  const leaf = (first.subtopic || first.label.split('-').pop() || '').trim()
  return leaf || null
}

/** Falls back to the first display-worthy free tag when no topic leaf is usable. */
function buildTopicText(group: QuestionGroupCard): string | null {
  const topic = topicLeafLabel(group)
  if (topic && isDisplayTag(topic)) return topic
  const tag = group.tags?.find(isDisplayTag)
  return tag || null
}

export type ConciergeGroupCardProps = {
  group: QuestionGroupCard
  reason: string
  alreadyInBasket: boolean
  onAdd: (group: QuestionGroupCard) => void
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
    onAdd,
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
  const draftButtonLabel =
    draftState === 'in_current_draft'
      ? '已在草稿卷中'
      : draftState === 'disabled'
        ? '暂不可组卷'
        : '加入草稿卷'
  const draftAriaLabel =
    draftState === 'in_current_draft'
      ? '从草稿卷移出'
      : draftState === 'disabled'
        ? '暂不可组卷'
        : '加入当前草稿卷'
  const draftButtonTitle =
    draftState === 'disabled'
      ? group.printUnavailableReason || '该题组暂不可加入草稿卷'
      : draftAriaLabel

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenDetail) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"], [role="menu"]')) return
    onOpenDetail(group)
  }

  const menuItems: ConciergeGroupRowMenuItem[] = []
  if (similarEligible) {
    menuItems.push({
      key: 'similar',
      label: '相似篇章',
      icon: <Files size={16} strokeWidth={1.5} aria-hidden="true" />,
      dataRaEntry: 'group-card-similar',
      dataRaGroupId: group.id,
      onSelect: () => onToggleSimilar(group.id),
    })
  }
  if (onOpenDetail) {
    menuItems.push({
      key: 'detail',
      label: '详情',
      icon: <FileText size={16} strokeWidth={1.5} aria-hidden="true" />,
      href: `?view=detail&groupId=${encodeURIComponent(group.id)}`,
      onClick: (event) => {
        event.preventDefault()
        onOpenDetail(group)
      },
    })
  }
  if (paperSurfaceAnalysisHref) {
    menuItems.push({
      key: 'analysis',
      label: group.paperSurfaceLabel || '阅读解析',
      icon: <BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />,
      href: paperSurfaceAnalysisHref,
      dataRaEntry: 'group-card',
      dataRaGroupId: group.id,
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
            <span className="concierge-group-row-count">{group.questionCount} 题</span>
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
          <button
            type="button"
            className="concierge-group-row-icon concierge-action-add"
            onClick={(event) => {
              event.stopPropagation()
              onAdd(group)
            }}
            disabled={draftState === 'disabled'}
            aria-pressed={draftState === 'in_current_draft'}
            aria-label={draftAriaLabel}
            title={draftButtonTitle}
          >
            <span className="visually-hidden">{draftButtonLabel}</span>
            {draftState === 'in_current_draft' ? (
              <span className="concierge-group-row-icon-mark">
                <Check size={16} strokeWidth={1.5} aria-hidden="true" />
              </span>
            ) : (
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          <ConciergeGroupRowMenu items={menuItems} />
        </div>
      </div>

      {isSimilarPassagesOpen && similarPassagesRequest && (
        <SimilarPassagesPanel
          recipeSummary={similarPassagesRecipeSummary(group.groupType)}
          request={similarPassagesRequest}
          questionGroupById={questionGroupById}
          onAdd={onAdd}
          onCollapse={() => onToggleSimilar(group.id)}
          onRetry={onRetrySimilar}
        />
      )}
    </div>
  )
}
