/**
 * ConciergeHomeSections — the parts of the home desk that belong to the
 * teacher rather than to the catalog (DESIGN.md §1「首页是归来」, 2026-09-15
 * 补: 归到老师自己的工作).
 *
 *   接着做   the current draft paper (only when it holds groups) and the last
 *            passages the teacher opened (localStorage trail, see
 *            recentlyOpened.ts). Rendered only when there is something.
 *   今天翻到 one passage from the library, fixed for the calendar day. Fills
 *            the desk with content when nothing else is going on, and gives
 *            a returning teacher one thing to read — never a control.
 *
 * Display-only: every row opens an existing view (detail / draft workbench).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FluidHoverList } from '../components/FluidHoverList.tsx'
import { groupTypeLabel, type DraftPaperSummary, type QuestionGroupCard } from '../domain/questionBank.ts'
import { fetchDraftPapers } from '../services/draftPapers.ts'
import { BoardList, ChevronRight } from '../icons'
import { pickDailyPassage } from './dailyPassage.ts'
import { paperHeadline } from './paperHeadline.ts'
import { buildTopicText, compactPassageTitle, compactSummary } from './passageText.ts'
import { relativeTimeLabel, type RecentlyOpenedEntry } from './recentlyOpened.ts'

const RECENT_PASSAGE_LIMIT = 3

/** "阅读 C" — the same passage label the group index uses, with a space before the letter so it reads as a label. */
function passageLabel(group: QuestionGroupCard): string {
  const compact = compactPassageTitle(group)
  const letter = compact.match(/^([A-G])篇$/)
  if (letter) return `${groupTypeLabel.reading.slice(0, 2)} ${letter[1]}`
  return compact
}

/** "2024 新课标Ⅰ卷" */
function paperOrigin(group: QuestionGroupCard): string {
  const headline = paperHeadline(group.paperName, group.region, group.year || null)
  return [group.year ? String(group.year) : '', headline].filter(Boolean).join(' ')
}

function HomeSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="home-section" aria-label={label}>
      <h2 className="home-section-label">{label}</h2>
      {children}
    </section>
  )
}

type HomeRowProps = {
  icon?: typeof BoardList
  title: string
  meta?: string
  detail?: string
  aside?: string
  action?: string
  onOpen: () => void
  ariaLabel: string
}

function HomeRow({ icon: Icon, title, meta, detail, aside, action, onOpen, ariaLabel }: HomeRowProps) {
  return (
    <li>
      <button type="button" className="home-row" onClick={onOpen} aria-label={ariaLabel}>
        {Icon && <span className="home-row-icon" aria-hidden="true"><Icon size={16} /></span>}
        <span className="home-row-text">
          <span className="home-row-title-line">
            <span className="home-row-title">{title}</span>
            {meta && <span className="home-row-meta">{meta}</span>}
          </span>
          {detail && <span className="home-row-detail">{detail}</span>}
        </span>
        <span className="home-row-aside">
          {aside && <span className="home-row-time">{aside}</span>}
          {action && <span className="home-row-action">{action}</span>}
          <span className="home-row-chevron" aria-hidden="true"><ChevronRight size={14} /></span>
        </span>
      </button>
    </li>
  )
}

export type HomeContinueSectionProps = {
  questionGroupById: Map<string, QuestionGroupCard>
  recentlyOpened: RecentlyOpenedEntry[]
  /** Current draft paper id and its group count, as App.tsx already derives them for the draft pill. */
  draftPaperId: string | null
  draftGroupCount: number
  onOpenDetail: (group: QuestionGroupCard) => void
  onOpenDraftPaper: (draftPaperId: string) => void
}

export function HomeContinueSection({
  questionGroupById,
  recentlyOpened,
  draftPaperId,
  draftGroupCount,
  onOpenDetail,
  onOpenDraftPaper,
}: HomeContinueSectionProps) {
  const showDraft = Boolean(draftPaperId) && draftGroupCount > 0
  // Keyed by draft id so a switched draft never shows the previous title.
  const [draftSummaries, setDraftSummaries] = useState<Record<string, DraftPaperSummary>>({})
  const draftSummary = draftPaperId ? draftSummaries[draftPaperId] ?? null : null
  useEffect(() => {
    if (!showDraft || !draftPaperId) return
    let cancelled = false
    fetchDraftPapers()
      .then((drafts) => {
        const found = drafts.find((draft) => draft.id === draftPaperId)
        if (!cancelled && found) setDraftSummaries((prev) => ({ ...prev, [found.id]: found }))
      })
      .catch(() => {
        /* the row still renders with its title fallback */
      })
    return () => {
      cancelled = true
    }
  }, [showDraft, draftPaperId, draftGroupCount])

  const recentPassages = useMemo(
    () => recentlyOpened
      .map((entry) => ({ entry, group: questionGroupById.get(entry.id) }))
      .filter((item): item is { entry: RecentlyOpenedEntry; group: QuestionGroupCard } => Boolean(item.group))
      .slice(0, RECENT_PASSAGE_LIMIT),
    [recentlyOpened, questionGroupById],
  )

  if (!showDraft && recentPassages.length === 0) return null

  return (
    <HomeSection label="接着做">
      <FluidHoverList className="home-row-list" itemSelector=".home-row">
        {showDraft && draftPaperId && (
          <HomeRow
            icon={BoardList}
            title={draftSummary?.title || '草稿卷'}
            meta={`${draftGroupCount} 题组`}
            aside={draftSummary ? relativeTimeLabel(`${draftSummary.updatedAt.replace(' ', 'T')}Z`) : undefined}
            action="继续组卷"
            onOpen={() => onOpenDraftPaper(draftPaperId)}
            ariaLabel={`继续组卷：${draftSummary?.title || '草稿卷'}，已选 ${draftGroupCount} 个题组`}
          />
        )}
        {recentPassages.map(({ entry, group }) => (
          <HomeRow
            key={group.id}
            title={passageLabel(group)}
            meta={paperOrigin(group)}
            detail={buildTopicText(group) ?? undefined}
            aside={relativeTimeLabel(entry.at)}
            onOpen={() => onOpenDetail(group)}
            ariaLabel={`打开 ${paperOrigin(group)} ${passageLabel(group)}`}
          />
        ))}
      </FluidHoverList>
    </HomeSection>
  )
}

export type HomeDailyPassageProps = {
  questionGroups: QuestionGroupCard[]
  onOpenDetail: (group: QuestionGroupCard) => void
}

export function HomeDailyPassage({ questionGroups, onOpenDetail }: HomeDailyPassageProps) {
  const group = useMemo(() => pickDailyPassage(questionGroups), [questionGroups])
  if (!group) return null
  return (
    <HomeSection label="今天翻到">
      <FluidHoverList className="home-row-list" itemSelector=".home-row">
        <HomeRow
          title={passageLabel(group)}
          meta={paperOrigin(group)}
          detail={compactSummary(group)}
          onOpen={() => onOpenDetail(group)}
          ariaLabel={`打开 ${paperOrigin(group)} ${passageLabel(group)}`}
        />
      </FluidHoverList>
    </HomeSection>
  )
}
