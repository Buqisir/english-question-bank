/**
 * PaperBrowsePage — 刀B 整卷预览页 v1.
 *
 * Route: `?view=paper-browse&paperId=<id>[&focusGroupId=<gid>]`.
 *
 * Streams the whole paper-asset in document order (content.blocks) as one
 * `<PaperSurface>` mount per question-group card, reusing the same
 * per-groupType adapters the Paper Intelligence harness uses
 * (`buildPaperAssetSurfaceModel` / `buildSevenChoicesSurfaceModel` /
 * `buildClozePaperView` / `buildGrammarFillPaperView` /
 * `buildWritingPaperView`). This page is READ-ONLY:
 *   - `onFocusIntent` is a no-op, `lectureFocus` is always `null` — no
 *     evidence/annotation interaction, no active-question highlight.
 *   - PaperSurface itself is untouched (zero modification); all card
 *     chrome and the 加入草稿卷 action bar live in this page.
 *   - Unknown/unsupported block or group types render a placeholder row
 *     instead of crashing.
 *
 * Draft actions reuse the same `draftPaperButtonState` machine as the
 * detail page (looked up from App's loaded `questionGroups` by groupId,
 * which is the paper-asset `groupId` verbatim — see
 * `server/api.mjs#buildPaperAssetQuestionGroupCard`: `id: groupId`).
 * Groups not present in `questionGroupById` render no button. There is
 * no remove action and no whole-paper "整卷加入" action (aggregate add is
 * out of scope per aggregatePaperResults.ts:8-11).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
} from '../paper-intelligence/paperAssetSurfaceAdapter.ts'
import {
  buildSevenChoicesSurfaceModel,
  type SevenChoicesSurfaceModel,
  type ReviewedSevenChoicesAnalysisV1,
} from '../paper-intelligence/sevenChoicesSurfaceAdapter.ts'
import {
  buildClozePaperView,
  type ClozePaperViewModel,
} from '../paper-intelligence/clozePaperViewAdapter.ts'
import {
  buildGrammarFillPaperView,
  type GrammarFillPaperViewModel,
} from '../paper-intelligence/grammarFillPaperViewAdapter.ts'
import {
  buildWritingPaperView,
  type WritingPaperViewModel,
} from '../paper-intelligence/writingPaperViewAdapter.ts'
import { findWritingBlockRange } from '../paper-intelligence/writingPageModel.mjs'
import type {
  AnswerKeyEntry,
  PaperAssetV1,
  PaperContentBlock,
  PaperContentGroup,
} from '../../domain/paperAsset.ts'
import type { QuestionGroupCard } from '../../domain/questionBank'
import './paperBrowsePage.css'

type GroupModel =
  | { kind: 'reading'; model: PaperAssetSurfaceModel }
  | { kind: 'sevenChoices'; model: SevenChoicesSurfaceModel }
  | { kind: 'cloze'; model: ClozePaperViewModel }
  | { kind: 'grammarFill'; model: GrammarFillPaperViewModel }
  | { kind: 'writing'; model: WritingPaperViewModel }
  | { kind: 'unsupported'; groupType: string }
  | { kind: 'error'; message: string }

export type PaperBrowsePageProps = {
  paperId: string
  focusGroupId?: string | null
  /** App's loaded questionGroups, keyed by id (== paper-asset groupId). */
  questionGroupById: Map<string, QuestionGroupCard>
  onAddGroupsToBasket: (groups: QuestionGroupCard[]) => void
  currentDraftPaperId: string | null
  currentDraftGroupCount: number
  onOpenDraftPaperWorkbench: (draftPaperId?: string | null) => void
  onBackToWorkbench: () => void
  shellNav: AppTopbarNav
}

function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

// 讲评栏 — 答案行. `null` means "don't render an answer row at all"
// (groupType === 'writing'); an empty-but-non-null case renders the
// 答案未入库 fallback below. Logic moved from the撤刀 flow-hover Chunk B
// (7c13124) — answerKey is already loaded on `asset`, zero new fetches.
function buildAnswerRowText(asset: PaperAssetV1, group: PaperContentGroup): string | null {
  if (group.groupType === 'writing') return null
  const entries = group.questionIds
    .map((qid) => asset.answerKey.answers[qid])
    .filter((entry): entry is AnswerKeyEntry => Boolean(entry))
    .sort((a, b) => a.questionNo - b.questionNo)
  if (entries.length === 0) return '答案未入库'
  return entries.map((entry) => `${entry.questionNo}. ${entry.answer}`).join('　')
}

function buildGroupRangeLabel(asset: PaperAssetV1, group: PaperContentGroup): string {
  const questionNos = group.questionIds
    .map((qid) => asset.content.questions[qid]?.questionNo)
    .filter((no): no is number => typeof no === 'number')
    .sort((a, b) => a - b)
  if (questionNos.length === 0) return ''
  if (questionNos.length === 1) return `${questionNos[0]}`
  return `${questionNos[0]}-${questionNos[questionNos.length - 1]}`
}

export function PaperBrowsePage(props: PaperBrowsePageProps): ReactNode {
  const {
    paperId,
    focusGroupId,
    questionGroupById,
    onAddGroupsToBasket,
    currentDraftPaperId,
    currentDraftGroupCount,
    onOpenDraftPaperWorkbench,
    onBackToWorkbench,
    shellNav,
  } = props

  const [asset, setAsset] = useState<PaperAssetV1 | null>(null)
  const [groupModels, setGroupModels] = useState<Record<string, GroupModel>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  // 讲评态开关 — 挑题态(默认收起)/讲评态(展开). State only, per 刀 1 契约;
  // URL 承载留给刀 3。
  const [lectureOpen, setLectureOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const focusAppliedRef = useRef(false)
  const lectureHandleRef = useRef<HTMLButtonElement | null>(null)

  // CR should-fix（同 my-space 先例）：讲评栏开着时文档级 Esc 关闭并还焦
  // 到把手，补齐窄屏抽屉的模态语义。
  useEffect(() => {
    if (!lectureOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setLectureOpen(false)
      lectureHandleRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return (): void => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [lectureOpen])

  useEffect(() => {
    let cancelled = false
    focusAppliedRef.current = false
    setLoading(true)
    setError(null)
    setAsset(null)
    setGroupModels({})

    async function load(): Promise<void> {
      try {
        let resolvedBase = `/paper-assets/${paperId}/latest`
        let assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        if (!assetRes.ok) {
          resolvedBase = `/paper-assets/${paperId}`
          assetRes = await fetch(`${resolvedBase}/paper-asset.json`)
        }
        if (!assetRes.ok) {
          throw new Error(`没找到这份卷面（${paperId}），可能已被移除。回到找题页重新打开吧。`)
        }
        const loadedAsset = (await assetRes.json()) as PaperAssetV1

        const groupBlocks = loadedAsset.content.blocks.filter(
          (block): block is Extract<PaperContentBlock, { type: 'group' }> => block.type === 'group',
        )
        const groupTypes = new Set(
          groupBlocks.map((block) => loadedAsset.content.groups[block.groupId]?.groupType),
        )

        let readingAnalysis: ReviewedReadingChoiceAnalysisV1 | null = null
        if (groupTypes.has('reading')) {
          try {
            const res = await fetch(`${resolvedBase}/analyses/reading-choice-analysis-v1.json`)
            if (res.ok) readingAnalysis = (await res.json()) as ReviewedReadingChoiceAnalysisV1
          } catch {
            /* graceful degradation — group renders as a placeholder below */
          }
        }
        let sevenChoicesAnalysis: ReviewedSevenChoicesAnalysisV1 | null = null
        if (groupTypes.has('sevenChoices')) {
          try {
            const res = await fetch(`${resolvedBase}/analyses/seven-choices-analysis-v1.json`)
            if (res.ok) sevenChoicesAnalysis = (await res.json()) as ReviewedSevenChoicesAnalysisV1
          } catch {
            /* graceful degradation */
          }
        }

        const models: Record<string, GroupModel> = {}
        for (const block of groupBlocks) {
          const group = loadedAsset.content.groups[block.groupId]
          if (!group) {
            models[block.groupId] = { kind: 'error', message: '题组数据缺失' }
            continue
          }
          try {
            if (group.groupType === 'reading') {
              if (!readingAnalysis) throw new Error('未找到已审阅阅读解析')
              models[block.groupId] = {
                kind: 'reading',
                model: buildPaperAssetSurfaceModel({
                  asset: loadedAsset,
                  analysis: readingAnalysis,
                  groupId: block.groupId,
                }),
              }
            } else if (group.groupType === 'sevenChoices') {
              if (!sevenChoicesAnalysis) throw new Error('未找到已审阅七选五解析')
              models[block.groupId] = {
                kind: 'sevenChoices',
                model: buildSevenChoicesSurfaceModel({
                  asset: loadedAsset,
                  analysis: sevenChoicesAnalysis,
                  groupId: block.groupId,
                }),
              }
            } else if (group.groupType === 'cloze') {
              models[block.groupId] = {
                kind: 'cloze',
                model: buildClozePaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
            } else if (group.groupType === 'grammarFill') {
              models[block.groupId] = {
                kind: 'grammarFill',
                model: buildGrammarFillPaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
            } else if (group.groupType === 'writing') {
              models[block.groupId] = {
                kind: 'writing',
                model: buildWritingPaperView({ asset: loadedAsset, groupId: block.groupId }),
              }
            } else {
              models[block.groupId] = { kind: 'unsupported', groupType: group.groupType }
            }
          } catch (e) {
            models[block.groupId] = {
              kind: 'error',
              message: e instanceof Error ? e.message : String(e),
            }
          }
        }

        if (cancelled) return
        setAsset(loadedAsset)
        setGroupModels(models)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId])

  // Scroll to the requested group once the page has finished loading.
  useEffect(() => {
    if (focusAppliedRef.current) return
    if (!focusGroupId || loading || !asset) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-browse-anchor="${cssAttr(focusGroupId)}"]`,
    )
    if (!target) return
    focusAppliedRef.current = true
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  }, [focusGroupId, loading, asset])

  // Block indices already consumed by a writing group's own pageModel (part/
  // section heading, prompt instruction, 注意 instruction, answerBox — the
  // full run WritingPaperPage renders around the passage) — the top-level
  // loop below must not render them a second time. The group's own block
  // index is excluded from the skip set: that one still renders via
  // renderGroupCard (the card that mounts WritingPaperPage in the first
  // place).
  const writingSkipIndices = useMemo(() => {
    const skip = new Set<number>()
    if (!asset) return skip
    for (const block of asset.content.blocks) {
      if (block.type !== 'group') continue
      if (groupModels[block.groupId]?.kind !== 'writing') continue
      const group = asset.content.groups[block.groupId]
      if (!group) continue
      const range = findWritingBlockRange(asset, group)
      if (!range) continue
      for (let i = range.startIdx; i <= range.endIdx; i += 1) {
        if (i !== range.groupIdx) skip.add(i)
      }
    }
    return skip
  }, [asset, groupModels])

  // rail scrollspy — highlight the topmost anchor currently visible in the
  // scroll container. Simple ordering-based arbitration (no pixel-level
  // tie-breaking): among all anchors the observer currently reports as
  // intersecting, pick the first one in document order.
  //
  // root is the browser viewport (null), not the scroller ref: the page
  // scrolls at the document level (.paper-browse-content itself has no
  // overflow/height constraint — it grows to full content height), so a
  // percentage rootMargin must be computed against the viewport, not
  // against the ~9000px-tall content element (which would make the
  // margin thousands of pixels and break the "topmost visible" signal).
  useEffect(() => {
    if (loading || !asset) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const anchorEls = Array.from(
      scroller.querySelectorAll<HTMLElement>('[data-paper-browse-anchor]'),
    )
    if (anchorEls.length === 0) return
    const order = anchorEls.map((el) => el.getAttribute('data-paper-browse-anchor') || '')
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const anchor = (entry.target as HTMLElement).getAttribute('data-paper-browse-anchor')
          if (!anchor) continue
          if (entry.isIntersecting) visible.add(anchor)
          else visible.delete(anchor)
        }
        const current = order.find((anchor) => visible.has(anchor))
        if (current) setActiveAnchor(current)
      },
      { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    for (const el of anchorEls) observer.observe(el)
    return (): void => observer.disconnect()
  }, [asset, loading])

  const railItems = useMemo(() => {
    if (!asset) return []
    const items: Array<{
      anchor: string
      label: string
      /** 讲评态紧凑 rail 用的短标签：题号区间，无题号时退回题组名。 */
      compactLabel?: string
      kind: 'part' | 'section' | 'group'
    }> = []
    for (const block of asset.content.blocks) {
      if (block.type === 'partHeading') {
        items.push({ anchor: block.partId, label: block.text, kind: 'part' })
      } else if (block.type === 'sectionHeading') {
        items.push({ anchor: block.sectionId, label: block.text, kind: 'section' })
      } else if (block.type === 'group') {
        const group = asset.content.groups[block.groupId]
        if (!group) continue
        const questionNos = group.questionIds
          .map((qid) => asset.content.questions[qid]?.questionNo)
          .filter((no): no is number => typeof no === 'number')
          .sort((a, b) => a - b)
        const range = questionNos.length
          ? questionNos.length === 1
            ? `${questionNos[0]}`
            : `${questionNos[0]}-${questionNos[questionNos.length - 1]}`
          : ''
        items.push({
          anchor: block.groupId,
          label: range ? `${group.title} · ${range}` : group.title,
          compactLabel: range || group.title,
          kind: 'group',
        })
      }
    }
    return items
  }, [asset])

  function scrollToAnchor(anchor: string): void {
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = scroller.querySelector<HTMLElement>(
      `[data-paper-browse-anchor="${cssAttr(anchor)}"]`,
    )
    if (!target) return
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
  }

  function renderGroupBody(entry: GroupModel | undefined): ReactNode {
    if (!entry) {
      return <div className="paper-browse-placeholder">加载中…</div>
    }
    if (entry.kind === 'error') {
      return <div className="paper-browse-placeholder">该题组暂不可预览：{entry.message}</div>
    }
    if (entry.kind === 'unsupported') {
      return (
        <div className="paper-browse-placeholder">
          该题型（{entry.groupType}）本页暂不支持预览。
        </div>
      )
    }
    const surfaceEl = (
      <PaperSurface
        textMap={entry.model.surfaceData.textMap}
        annotations={[]}
        evidence={entry.model.surfaceData.evidence}
        questions={entry.model.surfaceData.questions}
        // seven-options-on-paper: the 七选五 A-G pool, display-only.
        // `entry.model.options` (SevenChoicesOptionView[]) is structurally
        // compatible with PaperQuestionOption ({label, text, translation?}
        // vs {label, text, chain}) — no adapter change needed.
        optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
        mode="lecture"
        lectureFocus={null}
        readingFocusBySection={{}}
        onFocusIntent={() => {}}
      />
    )
    if (entry.kind === 'writing') {
      return <WritingPaperPage pageModel={entry.model.pageModel}>{surfaceEl}</WritingPaperPage>
    }
    return surfaceEl
  }

  function renderGroupCard(groupId: string, index: number): ReactNode {
    const group = asset?.content.groups[groupId]
    const entry = groupModels[groupId]
    const card = questionGroupById.get(groupId)

    return (
      <section
        key={`group-${index}`}
        className="paper-browse-group-card"
        data-paper-browse-anchor={groupId}
        aria-label={group?.title || groupId}
      >
        {card && (
          <div className="paper-browse-group-actions">
            <button
              type="button"
              className="add-button"
              onClick={() => onAddGroupsToBasket([card])}
              disabled={card.draftPaperButtonState === 'disabled'}
              title={
                card.draftPaperButtonState === 'disabled'
                  ? card.printUnavailableReason || '暂不可组卷'
                  : undefined
              }
            >
              {card.draftPaperButtonState === 'in_current_draft'
                ? '已在草稿卷中'
                : card.draftPaperButtonState === 'disabled'
                  ? '暂不可组卷'
                  : '加入草稿卷'}
            </button>
          </div>
        )}
        {renderGroupBody(entry)}
      </section>
    )
  }

  // 讲评栏内容 — 组级速览，跟随 scrollspy 的 activeAnchor。activeAnchor 落
  // 在 part/section 标题上时（不是一个 groupId）没有对应题组，走空态，
  // 实现从简（刀 1 契约允许）。
  function renderLecturePanel(): ReactNode {
    if (!asset) return null
    const group = activeAnchor ? asset.content.groups[activeAnchor] : undefined
    if (!activeAnchor || !group) {
      return <p className="paper-browse-lecture-empty">滚动到题组查看速览</p>
    }
    const range = buildGroupRangeLabel(asset, group)
    const answerRow = buildAnswerRowText(asset, group)
    const card = questionGroupById.get(activeAnchor)
    const showDeepLink = Boolean(card?.hasPaperSurfaceAnalysis && card?.paperSurfaceHref)
    return (
      <div className="paper-browse-lecture-body">
        <h4 className="paper-browse-lecture-title">
          {group.title}
          {range && <span className="paper-browse-lecture-range"> · {range}</span>}
        </h4>
        {answerRow && <p className="paper-browse-answer-row">{answerRow}</p>}
        {showDeepLink && card && (
          <a className="paper-browse-deep-link" href={card.paperSurfaceHref ?? undefined}>
            {card.paperSurfaceLabel ?? '深读解析'}
          </a>
        )}
      </div>
    )
  }

  function renderBlock(block: PaperContentBlock, index: number): ReactNode {
    switch (block.type) {
      case 'partHeading':
        return (
          <h2
            key={`part-${index}`}
            className="paper-browse-part-heading"
            data-paper-browse-anchor={block.partId}
          >
            {block.text}
          </h2>
        )
      case 'sectionHeading':
        return (
          <h3
            key={`section-${index}`}
            className="paper-browse-section-heading"
            data-paper-browse-anchor={block.sectionId}
          >
            {block.text}
          </h3>
        )
      case 'instruction':
        return (
          <p key={`instruction-${index}`} className="paper-browse-instruction">
            {block.text}
          </p>
        )
      case 'group':
        return renderGroupCard(block.groupId, index)
      case 'pageBreakHint':
        return <div key={`pagebreak-${index}`} className="paper-browse-pagebreak" aria-hidden="true" />
      default:
        // notice / exampleQuestion / questionRange / answerBox and any
        // future block type: render a placeholder row, never crash.
        return (
          <div key={`placeholder-${index}`} className="paper-browse-placeholder">
            该内容类型（{block.type}）本页暂不支持预览。
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-loading">加载中…</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="paper-browse-page">
        <AppTopbar {...shellNav} pageTitle="整卷预览" onBack={onBackToWorkbench} />
        <div className="paper-browse-error">
          <h2>没找到这份卷面</h2>
          <p>{error || '卷面数据为空，回到找题页重新打开吧。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="paper-browse-page">
      <AppTopbar {...shellNav} pageTitle={asset.paper.title} onBack={onBackToWorkbench} />
      <div
        className={`paper-browse-shell${
          lectureOpen ? ' paper-browse-shell--lecture-open' : ''
        }`}
      >
        <nav
          className={`paper-browse-rail${lectureOpen ? ' paper-browse-rail--compact' : ''}`}
          aria-label="目录"
        >
          {railItems.map((item) => {
            // 讲评态 rail 收窄给卷面让宽：只留题组项（题号区间），部分/节
            // 标题隐去；完整名走 title tooltip。
            if (lectureOpen && item.kind !== 'group') return null
            const isActive = item.anchor === activeAnchor
            return (
              <button
                key={item.anchor}
                type="button"
                className={`paper-browse-rail-item paper-browse-rail-item--${item.kind}${
                  isActive ? ' paper-browse-rail-item--active' : ''
                }`}
                aria-current={isActive ? 'true' : undefined}
                title={lectureOpen ? item.label : undefined}
                onClick={() => scrollToAnchor(item.anchor)}
              >
                {lectureOpen ? item.compactLabel || item.label : item.label}
              </button>
            )
          })}
        </nav>
        <div className="paper-browse-content" ref={scrollerRef}>
          {asset.content.blocks.map((block, index) =>
            writingSkipIndices.has(index) ? null : renderBlock(block, index),
          )}
        </div>
        {lectureOpen && (
          <aside className="paper-browse-lecture-panel" aria-label="讲评">
            {renderLecturePanel()}
          </aside>
        )}
      </div>
      {lectureOpen && (
        <button
          type="button"
          className="paper-browse-lecture-backdrop"
          aria-label="关闭讲评栏"
          onClick={() => setLectureOpen(false)}
        />
      )}
      <button
        type="button"
        ref={lectureHandleRef}
        className={`paper-browse-lecture-handle${
          lectureOpen ? ' paper-browse-lecture-handle--open' : ''
        }`}
        onClick={() => setLectureOpen((open) => !open)}
        aria-pressed={lectureOpen}
        aria-expanded={lectureOpen}
      >
        讲评
      </button>
      <button
        type="button"
        className="basket-chip"
        onClick={() => onOpenDraftPaperWorkbench(currentDraftPaperId)}
        aria-label={`打开草稿卷，已选 ${currentDraftGroupCount} 个题组`}
        disabled={!currentDraftPaperId || currentDraftGroupCount === 0}
      >
        <ClipboardList size={15} />
        <span>草稿卷 · {currentDraftGroupCount} 题组</span>
      </button>
    </div>
  )
}
