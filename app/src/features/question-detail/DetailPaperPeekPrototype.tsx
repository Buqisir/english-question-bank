/**
 * PROTOTYPE — throwaway，勿当生产代码收口。
 *
 * 详情页形态 B「速览头 + 一张纸露一角」试衣间（owner 2026-07-15 brainstorming
 * 拍板方向后的验证原型）：`?detailVariant=paper-peek` 启用，DEV-only 底部
 * 切换丸。回答的问题：速览头（大意+题型分布+动作）+ 只读 PaperSurface
 * 露一角，这个形态在真数据上手感对不对？
 *
 * 拍板后按正式刀重写折回 QuestionGroupDetailView 并整删本文件。
 * 题型 chips：阅读用已存 parse 的 questionType 真值；其余题型原型期占位
 * （正式刀接 D1 v2 考点词表）。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ClipboardList, Eye, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { PaperSurface } from '../../shared-ui/papersurface/PaperSurface'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { WritingPaperPage } from '../paper-intelligence/WritingPaperPage'
import {
  buildPaperAssetSurfaceModel,
  type PaperAssetSurfaceModel,
  type ReviewedReadingChoiceAnalysisV1,
  type PaperFigureManifestEntry,
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
import type { PaperAssetV1, PaperContentBlock } from '../../domain/paperAsset.ts'
import type { QuestionGroupDetail, ReadingParseQuestionGroupResult } from '../../domain/questionBank'
import { sourceTypeLabel } from '../../domain/questionBank'
import { compactGroupMeta } from './detailHelpers'
import { parsePaperIdFromHref } from '../../concierge/paperSurfaceHref'
import './detailPaperPeek.css'

type PeekModel =
  | { kind: 'reading'; model: PaperAssetSurfaceModel }
  | { kind: 'sevenChoices'; model: SevenChoicesSurfaceModel }
  | { kind: 'cloze'; model: ClozePaperViewModel }
  | { kind: 'grammarFill'; model: GrammarFillPaperViewModel }
  | { kind: 'writing'; model: WritingPaperViewModel }

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: PeekModel }

const psTokenStyle: CSSProperties & Record<`--${string}`, string | number> = {
  '--ps-font-stack': paperSurfaceTokens.paperFontStack,
  '--ps-font-stack-heading': paperSurfaceTokens.paperFontStackHeading,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-passage-indent': paperSurfaceTokens.passageIndent,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

// ── variant param + DEV 切换丸 ──────────────────────────────────────────

export function useDetailPeekVariant(): ['original' | 'paper-peek', (v: 'original' | 'paper-peek') => void] {
  const [variant, setVariant] = useState<'original' | 'paper-peek'>(() =>
    // PROD 双保险：原型变体只在 DEV 可达（切换丸本就 DEV-only，这里把
    // URL 参数直达也关死，防"原型被部署后可拼参进入"）
    !import.meta.env.PROD &&
    new URLSearchParams(window.location.search).get('detailVariant') === 'paper-peek'
      ? 'paper-peek'
      : 'original',
  )
  const set = (next: 'original' | 'paper-peek') => {
    setVariant(next)
    const url = new URL(window.location.href)
    if (next === 'original') url.searchParams.delete('detailVariant')
    else url.searchParams.set('detailVariant', next)
    window.history.replaceState(window.history.state, '', url)
  }
  return [variant, set]
}

export function DetailPeekSwitcher({
  current,
  onChange,
}: {
  current: 'original' | 'paper-peek'
  onChange: (v: 'original' | 'paper-peek') => void
}) {
  if (import.meta.env.PROD) return null
  const other = current === 'original' ? 'paper-peek' : 'original'
  return (
    <div className="pdp-switcher" role="toolbar" aria-label="详情页原型切换（仅开发环境）">
      <span className={current === 'original' ? 'pdp-switcher-on' : ''}>原版</span>
      <button type="button" onClick={() => onChange(other)} aria-label="切换详情页形态">
        ⇄
      </button>
      <span className={current === 'paper-peek' ? 'pdp-switcher-on' : ''}>纸片版</span>
    </div>
  )
}

// ── 题型 chips ─────────────────────────────────────────────────────────

function buildTypeChips(
  detail: QuestionGroupDetail,
  readingParse: ReadingParseQuestionGroupResult | null,
): Array<{ label: string; count?: number; placeholder?: boolean }> {
  if (detail.groupType === 'reading' && readingParse?.questions?.length) {
    const counts = new Map<string, number>()
    for (const q of readingParse.questions) {
      const t = (q.questionType || '').trim() || '未标注'
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }))
  }
  return [{ label: '考点分布 · 原型占位（正式刀接 v2 词表）', placeholder: true }]
}

// ── 主组件 ─────────────────────────────────────────────────────────────

export function DetailPaperPeekPrototype({
  detail,
  readingParse,
  onAddToBasket,
  onOpenPaperBrowse,
  onOpenPaperBrowseLecture,
}: {
  detail: QuestionGroupDetail
  readingParse: ReadingParseQuestionGroupResult | null
  onAddToBasket: (detail: QuestionGroupDetail) => void
  onOpenPaperBrowse: (detail: QuestionGroupDetail) => void
  onOpenPaperBrowseLecture: (detail: QuestionGroupDetail) => void
}) {
  const paperId = parsePaperIdFromHref(detail.paperSurfaceHref)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
    if (!paperId) {
      setLoad({ status: 'error', message: '该题组暂无卷面资产——去整卷预览或等待生产线补齐。' })
      return
    }
    let cancelled = false
    async function loadModel(): Promise<void> {
      try {
        let base = `/paper-assets/${paperId}/latest`
        let res = await fetch(`${base}/paper-asset.json`)
        if (!res.ok) {
          base = `/paper-assets/${paperId}`
          res = await fetch(`${base}/paper-asset.json`)
        }
        if (!res.ok) throw new Error(`没找到卷面（${paperId}）`)
        const asset = (await res.json()) as PaperAssetV1
        const block = asset.content.blocks.find(
          (b): b is Extract<PaperContentBlock, { type: 'group' }> =>
            b.type === 'group' && b.groupId === detail.id,
        )
        const group = block ? asset.content.groups[block.groupId] : undefined
        if (!block || !group) throw new Error('本题组不在该卷面资产内')

        let figures: PaperFigureManifestEntry[] = []
        try {
          const figRes = await fetch(`${base}/figures/manifest.json`)
          if (figRes.ok) {
            const manifest = (await figRes.json()) as { figures?: PaperFigureManifestEntry[] }
            figures = Array.isArray(manifest.figures) ? manifest.figures : []
          }
        } catch {
          /* 零图卷零断言 */
        }

        let model: PeekModel
        if (group.groupType === 'reading') {
          const aRes = await fetch(`${base}/analyses/reading-choice-analysis-v1.json`)
          if (!aRes.ok) throw new Error('未找到已审阅阅读解析')
          const analysis = (await aRes.json()) as ReviewedReadingChoiceAnalysisV1
          model = {
            kind: 'reading',
            model: buildPaperAssetSurfaceModel({
              asset,
              analysis,
              groupId: block.groupId,
              figures,
              assetBase: base,
            }),
          }
        } else if (group.groupType === 'sevenChoices') {
          const aRes = await fetch(`${base}/analyses/seven-choices-analysis-v1.json`)
          if (!aRes.ok) throw new Error('未找到已审阅七选五解析')
          const analysis = (await aRes.json()) as ReviewedSevenChoicesAnalysisV1
          model = {
            kind: 'sevenChoices',
            model: buildSevenChoicesSurfaceModel({ asset, analysis, groupId: block.groupId }),
          }
        } else if (group.groupType === 'cloze') {
          model = { kind: 'cloze', model: buildClozePaperView({ asset, groupId: block.groupId }) }
        } else if (group.groupType === 'grammarFill') {
          model = {
            kind: 'grammarFill',
            model: buildGrammarFillPaperView({ asset, groupId: block.groupId }),
          }
        } else if (group.groupType === 'writing') {
          model = { kind: 'writing', model: buildWritingPaperView({ asset, groupId: block.groupId }) }
        } else {
          throw new Error(`该题型（${group.groupType}）暂不支持卷面预览`)
        }
        if (!cancelled) setLoad({ status: 'ready', model })
      } catch (e) {
        if (!cancelled)
          setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }
    setLoad({ status: 'loading' })
    void loadModel()
    return (): void => {
      cancelled = true
    }
  }, [paperId, detail.id])

  const chips = buildTypeChips(detail, readingParse)

  let paperBody: ReactNode = null
  if (load.status === 'loading') {
    paperBody = <div className="pdp-paper-placeholder">卷面加载中…</div>
  } else if (load.status === 'error') {
    paperBody = <div className="pdp-paper-placeholder">{load.message}</div>
  } else {
    const entry = load.model
    const surfaceData = entry.model.surfaceData
    const surfaceEl = (
      <PaperSurface
        textMap={surfaceData.textMap}
        annotations={[]}
        evidence={surfaceData.evidence}
        questions={surfaceData.questions}
        optionBank={entry.kind === 'sevenChoices' ? entry.model.options : undefined}
        mode="lecture"
        lectureFocus={null}
        readingFocusBySection={{}}
        onFocusIntent={() => {}}
      />
    )
    paperBody =
      entry.kind === 'writing' ? (
        <WritingPaperPage pageModel={entry.model.pageModel}>{surfaceEl}</WritingPaperPage>
      ) : (
        surfaceEl
      )
  }

  return (
    <section className="pdp-root" aria-label="题组速览（原型）">
      <header className="pdp-hero">
        <div className="pdp-meta-line">
          <span>{compactGroupMeta(detail.groupType, detail.questionCount)}</span>
          <span className="pdp-meta-dot">·</span>
          <span>{sourceTypeLabel[detail.sourceType]}</span>
        </div>
        <h3 className="pdp-title">{detail.title}</h3>
        {detail.summary && <p className="pdp-summary">{detail.summary}</p>}
        <div className="pdp-chips" aria-label="题型分布">
          {chips.map((chip) => (
            <span key={chip.label} className={`pdp-chip${chip.placeholder ? ' pdp-chip--placeholder' : ''}`}>
              {chip.label}
              {chip.count !== undefined && <b> ×{chip.count}</b>}
            </span>
          ))}
        </div>
        {detail.topicLabels?.length > 0 && (
          <div className="pdp-topics" aria-label="话题标签">
            {detail.topicLabels.map((t) => (
              <span key={t.label} className="pdp-topic">
                {t.label}
              </span>
            ))}
          </div>
        )}
        <div className="pdp-actions">
          <button className="pdp-btn pdp-btn--primary" type="button" onClick={() => onAddToBasket(detail)}>
            <ClipboardList size={15} />
            加入草稿卷
          </button>
          {detail.paperSurfaceHref && (
            <button className="pdp-btn" type="button" onClick={() => onOpenPaperBrowse(detail)}>
              <Eye size={15} />
              看整卷
            </button>
          )}
          {detail.hasPaperSurfaceAnalysis && detail.paperSurfaceHref && (
            <button className="pdp-btn" type="button" onClick={() => onOpenPaperBrowseLecture(detail)}>
              <BookOpen size={15} />
              讲评
            </button>
          )}
        </div>
      </header>

      <div className={`pdp-paper${expanded ? ' pdp-paper--expanded' : ''}`} style={psTokenStyle}>
        <div className="pdp-paper-clip">{paperBody}</div>
        {load.status === 'ready' && !expanded && (
          <button className="pdp-expand" type="button" onClick={() => setExpanded(true)}>
            <ChevronDown size={15} />
            展开卷面
          </button>
        )}
        {load.status === 'ready' && expanded && (
          <button className="pdp-expand pdp-expand--collapse" type="button" onClick={() => setExpanded(false)}>
            <ChevronUp size={15} />
            收起卷面
          </button>
        )}
      </div>
    </section>
  )
}
