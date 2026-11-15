import { ArrowDown, ArrowUp, Grip, Trash } from '../../icons'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FluidHoverList } from '../../components/FluidHoverList'
import { Button } from '../../shared-ui/Button.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { Chip } from '../../shared-ui/Chip.tsx'
import { useRowReveal } from '../../shared-ui/useRowReveal.ts'
import { Row } from '../../shared-ui/Row.tsx'
import { Surface } from '../../shared-ui/Surface.tsx'
import { groupTypeLabel, type DraftPaperItem, type QuestionGroupCard } from '../../domain/questionBank'
import type { SimilarPassagesRequestState } from '../similar-passages/SimilarPassagesPanel'

/** similar-workbench-swap (E7, plan.md "抽屉"): the swap drawer's own props,
 * kept in this file (not similar-passages/SimilarPassagesPanel.tsx) — plan's
 * 施工要点 3 calls for a sibling view when extending that shared panel with
 * per-card replace/add actions would cost more than it's worth (its `onAdd`
 * contract hands back a full QuestionGroupCard for a client-only basket;
 * this drawer's two actions are both server round-trips keyed by groupId
 * alone, and needs a SECOND action per card, not a single primary one). The
 * `.similar-*` chip/card class language is reused verbatim (DESIGN.md §7 —
 * no new color literal), only the structural wrapper (`.draft-swap-drawer`)
 * and the two-button `.similar-rcard-actions` stack are new.
 */
export type DraftPaperSwapDrawerProps = {
  seedTitle: string
  recipeSummary: string
  request: SimilarPassagesRequestState
  /** groupIds already present as an item in THIS draft paper (including the
   * seed's own item) — disables both actions, C8 "已在草稿卷中" wording. */
  existingGroupIds: Set<string>
  /** Full corpus lookup (App.tsx's questionGroupById, threaded through
   * DraftPaperWorkbench) — a candidate groupId absent here is "thin" (paper
   * asset analyzed, DB not yet synced), same SW-3 parity as
   * SimilarPassagesPanel. */
  questionGroupById: Map<string, QuestionGroupCard>
  onCollapse: () => void
  onRetry: () => void
  onReplace: (candidateGroupId: string) => void
  onAdd: (candidateGroupId: string) => void
}

export function DraftPaperSwapDrawer(props: DraftPaperSwapDrawerProps): ReactNode {
  const { seedTitle, recipeSummary, request, existingGroupIds, questionGroupById, onCollapse, onRetry, onReplace, onAdd } = props
  // 等待第四轮（2026-11-15）：结果回来时，候选卡从上到下依次淡入（只动透明度）。每次请求回来演一次；
  // 勾选、加入、换篇这些不改 request.status 的变化不演。
  const drawerRef = useRef<HTMLDivElement>(null)
  useRowReveal(drawerRef, '.similar-rcard', request.status === 'ready')

  return (
    <div className="draft-swap-drawer" ref={drawerRef}>
      <div className="similar-passages-head">
        <h4 className="paper-browse-lecture-title">相似篇章 · {seedTitle}</h4>
        <Button tone="quiet" size="sm" className="similar-backlink" onClick={onCollapse}>
          返回目录
        </Button>
      </div>
      <p className="similar-passages-sub">{recipeSummary}</p>

      {request.status === 'loading' && <Notice kind="waiting">加载中</Notice>}

      {request.status === 'error' && (
        <Notice kind="error" className="similar-rail-error" action={{ label: '重试', onClick: onRetry }}>
          {request.message}
        </Notice>
      )}

      {request.status === 'ready' && (
        <>
          {request.data.results.length === 0 ? (
            <p className="paper-browse-lecture-empty">
              {request.data.notice || '库里暂时没有匹配的相似篇章。'}
            </p>
          ) : (
            <div className="similar-rcard-list">
              {request.data.results.map((result) => {
                const isThin = !questionGroupById.has(result.groupId)
                const alreadyInDraft = existingGroupIds.has(result.groupId)
                const disabled = isThin || alreadyInDraft
                const title = alreadyInDraft
                  ? '已在草稿卷中'
                  : isThin
                    ? '该卷未入库存，暂不能加入'
                    : undefined
                return (
                  <div key={result.groupId} className="similar-rcard" data-group-id={result.groupId}>
                    <div className="similar-rcard-body">
                      <div className="similar-rcard-title">{result.title}</div>
                      <div className="similar-rcard-source">{result.sourceLabel}</div>
                    </div>
                    <div className="similar-rcard-actions">
                      {/* Owner 2026-11-14 决定 #17：「替换这篇」每张卡片都有，不用雾薄荷主键（草稿卷页的主键是「导出」），
                          改成墨字键 strong，和下面「加入」同一档。 */}
                      <Button
                        tone="strong"
                        size="sm"
                        className="similar-btn"
                        disabled={disabled}
                        title={title}
                        onClick={() => onReplace(result.groupId)}
                      >
                        ⇄ 替换这篇
                      </Button>
                      <Button
                        tone="strong"
                        size="sm"
                        className="similar-btn"
                        disabled={disabled}
                        title={title}
                        onClick={() => onAdd(result.groupId)}
                      >
                        ＋ 加入
                      </Button>
                    </div>
                    {/* 胶囊第二轮（2026-11-14）：换篇栏只有 208 宽，理由小签挤在标题左栏里，胶囊不折行以后连「同话题：人与自然」
                        都只剩「同话题：…」。这里把这一行挪到卡片底部、两个键下面，跨满整张卡（DraftPaperWorkbench.css .draft-swap-drawer）。
                        首页相似篇章面板（SimilarPassagesPanel.tsx）不动。 */}
                    <div className="similar-rcard-chips similar-rcard-chips--foot">
                      {result.reasons.map((reason, index) => (
                        <Chip key={`${reason.kind}-${index}`} className="similar-chip">
                          {reason.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="similar-pool-note">
            库内同话题还剩 {Math.max(request.data.poolStats.totalInPool - request.data.poolStats.returned, 0)} 组
          </p>
        </>
      )}
    </div>
  )
}

export type DraftPaperRailProps = {
  items: DraftPaperItem[]
  activeGroupId: string | null
  onItemClick: (groupId: string) => void
  onDragStart: (itemId: string) => void
  onDrop: (targetId: string) => void
  onMoveItem: (itemId: string, direction: -1 | 1) => void
  /** 缺题项的「移除」：trigger 是被点的那个键，删之前用它定删完焦点落到哪（shared-ui/focusAfterRemoval.ts）。 */
  onDeleteItem: (item: DraftPaperItem, trigger: HTMLButtonElement) => void
  /* workbench-header-unify Locked Decision 5: the "共 N 页 · 双面 M 张"
     真值 text retired from `.draft-paper-meta-row` (which retired along with
     it) and relocates here as a quiet annotation at the rail's top —
     DraftPaperWorkbench.tsx still owns the pageCount/printForm math, this
     component only renders the finished string. */
  metaText?: string
  /* similar-workbench-swap (E7, plan.md "抽屉（rail 原地切换）"): non-null
     swaps the ENTIRE rail body (this nav's content) for the swap drawer —
     "目录 ⇄ 抽屉两态原地切换", never both at once. `<nav>` itself (width/
     sticky positioning) is unchanged either way. */
  swapDrawer?: DraftPaperSwapDrawerProps | null
}

type ActivePlate = {
  top: number
  left: number
  width: number
  height: number
  motion: 'none' | 'adjacent' | 'relocate'
  revision: number
}

export function DraftPaperRail(props: DraftPaperRailProps): ReactNode {
  const { items, activeGroupId, onItemClick, onDragStart, onDrop, onMoveItem, onDeleteItem, metaText, swapDrawer } = props

  const panelRef = useRef<HTMLDivElement>(null)
  const swapPanelRef = useRef<HTMLElement>(null)
  const swapping = Boolean(swapDrawer)
  const previousActiveGroupIdRef = useRef<string | null>(null)
  const previousPanelRef = useRef<HTMLDivElement | null>(null)
  const [activePlate, setActivePlate] = useState<ActivePlate | null>(null)

  const syncActivePlate = useCallback((animate = false): void => {
    const panel = panelRef.current
    if (!panel || !activeGroupId) {
      setActivePlate(null)
      previousPanelRef.current = panel
      return
    }
    const row = panel.querySelector<HTMLElement>(
      `[data-draft-group-id="${CSS.escape(activeGroupId)}"]`,
    )
    if (!row) {
      setActivePlate(null)
      return
    }

    const previousGroupId = previousActiveGroupIdRef.current
    const previousIndex = previousGroupId
      ? items.findIndex((item) => item.groupId === previousGroupId)
      : -1
    const nextIndex = items.findIndex((item) => item.groupId === activeGroupId)
    const canAnimate = animate && previousPanelRef.current === panel && previousGroupId !== activeGroupId
    const motion = canAnimate && previousIndex >= 0 && nextIndex >= 0
      ? Math.abs(previousIndex - nextIndex) === 1 ? 'adjacent' : 'relocate'
      : 'none'

    previousPanelRef.current = panel
    previousActiveGroupIdRef.current = activeGroupId
    setActivePlate((previous) => ({
      top: row.offsetTop,
      left: row.offsetLeft,
      width: row.offsetWidth,
      height: row.offsetHeight,
      motion,
      revision: motion === 'relocate' ? (previous?.revision ?? 0) + 1 : previous?.revision ?? 0,
    }))
  }, [activeGroupId, items])

  useLayoutEffect(() => {
    syncActivePlate(true)
  }, [activeGroupId, swapDrawer, syncActivePlate])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const syncGeometry = (): void => syncActivePlate(false)
    const observer = new ResizeObserver(syncGeometry)
    observer.observe(panel)
    window.addEventListener('resize', syncGeometry)
    return (): void => {
      observer.disconnect()
      window.removeEventListener('resize', syncGeometry)
    }
  }, [swapDrawer, syncActivePlate])

  useEffect(() => {
    if (swapping && window.matchMedia('(max-width: 900px)').matches) {
      swapPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
  }, [swapping])

  if (swapDrawer) {
    return (
      <Surface as="nav" ref={swapPanelRef} className="draft-paper-rail draft-paper-rail--swap" aria-label="相似篇章候选">
        <DraftPaperSwapDrawer {...swapDrawer} />
      </Surface>
    )
  }

  // 卷面字母：按草稿顺序数阅读题组（缺失题组不上卷面，不占字母）。
  const readingLetterByItemId = new Map(
    items
      .filter((item) => !item.groupMissing && item.questionGroup?.groupType === 'reading')
      .map((item, index) => [item.id, String.fromCharCode(65 + index)]),
  )

  // 目录项换成共用行 Row（2026-11-15；记录 design/components-2026-11-13/migrate-rail/README.md）。
  // - 能跳的项（题组在卷上）：整行目标是 <button>（就地把卷面滚到这一组，不离开这一页），名字是行上看得见的字。
  //   原来整项是 role="button" 的 div 自己接 Enter / 空格，现在是真按钮。
  // - 缺题的项（题组已从题库里没了，不上卷面）：没有可跳的地方，是不可点的行；上移 / 下移 / 移除三个键是行里的键，
  //   Tab 只停在这三个键上（原来整项本身也是一个 Tab 停点，按了什么也不做）。
  // - 当前项：<li aria-current="location">，白底板（.draft-paper-rail-current）照旧由这里量位置画。
  // - 拖动排序照旧挂在 <li> 上（draggable），类名 draft-paper-rail-item / active / is-missing 留作脚本挂钩。
  // 列表是 <ul>，不用 RowList：左栏是板里的目录，行间是 4px 空隙、没有分隔线（和整卷页左栏一样），RowList 的分隔线不要。
  return (
    <Surface as="nav" className="draft-paper-rail" aria-label="卷面目录">
      {metaText && <p className="draft-paper-rail-meta">{metaText}</p>}
      {/* 当前项的白底板和列表共用这一层量位置：板是这一层里的第一个，列表（<ul>，从左上角 0,0 起排）画在它上面。 */}
      <div className="draft-paper-rail-panel" ref={panelRef}>
        {activePlate && (
          <span
            key={`active-plate-${activePlate.revision}`}
            aria-hidden="true"
            className={`draft-paper-rail-current draft-paper-rail-current--${activePlate.motion}`}
            style={{
              height: `${activePlate.height}px`,
              transform: `translate(${activePlate.left}px, ${activePlate.top}px)`,
              width: `${activePlate.width}px`,
            }}
          />
        )}
        {/* 滑块停在能跳的项的整行目标上（它和行一样大）；行和行之间 4px 空隙里点一下，FluidHoverList 点的是
            最近那一项的整行目标（原来点的是整项 div），照旧能跳。缺题项（不可点）也要算进来、停在 <li> 上，
            否则滑块总挑最近的一项，鼠标停在缺题项上会把它上面那一项铺上悬停底（换后第一次实拍看到的）；
            停在缺题项上时滑块藏起来（DraftPaperWorkbench.css），不可点的行没有悬停。 */}
        <FluidHoverList
          as="ul"
          axis="y"
          className="draft-paper-rail-list"
          itemSelector=".draft-paper-rail-item > .eqb-row-hit, .draft-paper-rail-item.is-missing"
        >
          {items.map((item) => {
            const isMissing = item.groupMissing
            const sourceTitle = item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId
            const sourceLetter = /^Reading\s+([A-D])$/i.exec(sourceTitle)?.[1]?.toUpperCase()
            // Owner 2026-11-14（走查 find-compose-export 第四节第 1 条）：卷面篇目字母
            // 跟老师排的顺序重排（server draftPaperStore.mjs draftReadingPassageLetters
            // 用同一条规则），左栏主名跟卷面一致，原卷字母放进同一行的小字当来源。
            const paperLetter = readingLetterByItemId.get(item.id)
            const label = isMissing
              ? '题组已从题库中移除'
              : sourceLetter
                ? `${paperLetter ?? sourceLetter}篇`
                : sourceTitle
            const sourceNote = !isMissing && sourceLetter && paperLetter ? `原卷 ${sourceLetter} 篇` : ''
            // Keep custom titles and ordering; secondary type/count information lives in the tooltip.
            const groupTypeText = groupTypeLabel[item.questionGroup?.groupType || 'other']
            const questionCount = item.questionGroup?.questionCount || 0
            const rowTitle = isMissing
              ? undefined
              : `${label}${sourceNote ? `（${sourceNote}）` : ''} · ${groupTypeText} · ${questionCount} 题`
            const isActive = activeGroupId === item.groupId

            return (
              <Row
                key={item.id}
                className={`draft-paper-rail-item${isActive ? ' active' : ''}${isMissing ? ' is-missing' : ''}`}
                padding="none"
                size="sm"
                data-draft-group-id={item.groupId}
                aria-current={isActive ? 'location' : undefined}
                draggable
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => onDragStart(item.id)}
                onDrop={() => onDrop(item.id)}
                title={rowTitle}
                action={isMissing
                  ? undefined
                  : { kind: 'button', label: sourceNote ? `${label} ${sourceNote}` : label, onClick: () => onItemClick(item.groupId) }}
              >
                <span className="draft-paper-rail-label">
                  {label}
                  {sourceNote && <span className="draft-paper-rail-source">{sourceNote}</span>}
                </span>
                {/* ui-northstar: 拖拽把手移到行尾——它 hover 前不可见但仍占位，
                    留在行首会把小手和标题顶开一格。 */}
                <Grip aria-hidden="true" className="draft-paper-rail-grip" size={12} />
                {/* draft-desk-a scope note: the plan retires per-item action buttons from
                    the rail in favor of the paper-hover sticker (裁点1) — but a groupMissing
                    item never renders in the paper (server/draft-paper/draftPaperStore.mjs's
                    buildDraftPaperBlocks skips it), so it would otherwise lose its only path
                    to reorder/delete. Keeping a compact action row for this one edge case is
                    a deliberate exception, not a regression of the plan's "rail = pure list"
                    simplification for the common case. */}
                {isMissing && (
                  <span className="draft-paper-rail-acts">
                    <button aria-label="上移" onClick={() => onMoveItem(item.id, -1)} title="上移" type="button">
                      <ArrowUp size={12} />
                    </button>
                    <button aria-label="下移" onClick={() => onMoveItem(item.id, 1)} title="下移" type="button">
                      <ArrowDown size={12} />
                    </button>
                    {/* 删后焦点：把这个键交给 onDeleteItem，删之前定好删完落到哪（DraftPaperWorkbench.tsx removeFromRail）。 */}
                    <button
                      aria-label="移除"
                      className="danger draft-paper-rail-remove"
                      onClick={(event) => onDeleteItem(item, event.currentTarget)}
                      title="移除"
                      type="button"
                    >
                      <Trash size={12} />
                    </button>
                  </span>
                )}
              </Row>
            )
          })}
        </FluidHoverList>
      </div>
      {items.length === 0 && <p className="draft-paper-rail-empty">从搜索结果添加题组。</p>}
    </Surface>
  )
}
