import type { ReactNode } from 'react'
import { Skeleton } from '../../shared-ui/Skeleton.tsx'

/**
 * 相似候选卡在等时的灰块（等待第六轮，2026-11-15；DESIGN.md §5「Waiting 等待」：整块内容还没来时，按真东西的位置和大小画灰块）。
 * 原来三处都是一行字的「加载中」：讲评栏「配相似 / 相似篇章」（SimilarQuestionsRailView）、首页和详情页的「相似篇章」
 * （SimilarPassagesPanel）、草稿卷换篇抽屉（DraftPaperRail 的 DraftPaperSwapDrawer）。
 * 照真卡画 3 张：外框、内边距、行高都用真卡同一套 class（.similar-rcard、.similar-rcard-title、.similar-rcard-source、
 * .similar-rcard-chips，样子在 paperBrowsePage.css），灰块放在字的位置（Skeleton inline），一张卡和真卡一样高。
 * 三处的卡不一样，按 variant 画：
 * - rail   讲评栏：左边勾选框，正文三行（标题、出处、理由小签）。
 * - panel  相似篇章面板：正文三行，右边一个「加入草稿卷」键。
 * - drawer 换篇抽屉（约 208 宽）：标题一行、出处折成两行，右边两个键，理由小签在卡底跨满。
 * 门槛、读屏那一句由调用处的 SkeletonGate 给；这里整块对读屏隐藏。
 */
export type SimilarCardSkeletonVariant = 'rail' | 'panel' | 'drawer'

const SKELETON_CARD_COUNT = 3
// 标题（「B 篇」这类短名）、理由小签（「同话题：人与自然」）各张宽度错开一点，看着像真卡。
const TITLE_WIDTHS = [36, 40, 34]
const CHIP_WIDTHS = [108, 92, 96]

function ActionSlot({ width }: { width: number }): ReactNode {
  // 一个小号键（28 高，button.css）的位置：灰块放在键上字的位置，键本身是淡底，不画整块。
  return <span className="similar-rcard-skeleton-action"><Skeleton inline width={width} height={12} /></span>
}

export function SimilarCardSkeletons({ variant }: { variant: SimilarCardSkeletonVariant }): ReactNode {
  return (
    <div className="similar-rcard-list similar-rcard-skeletons" aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="similar-rcard">
          {variant === 'rail' && <Skeleton className="similar-rcard-skeleton-check" width={15} height={15} />}
          <div className="similar-rcard-body">
            <div className="similar-rcard-title"><Skeleton inline width={TITLE_WIDTHS[index]} height={12} /></div>
            {variant === 'drawer' ? (
              // 抽屉窄，出处（「2026年新课标Ⅰ卷 阅读」）折成两行。
              <div className="similar-rcard-source">
                <Skeleton inline width={72} height={10} /><br /><Skeleton inline width={36} height={10} />
              </div>
            ) : (
              <div className="similar-rcard-source"><Skeleton inline width={120} height={10} /></div>
            )}
            {variant !== 'drawer' && (
              <div className="similar-rcard-chips"><Skeleton shape="pill" width={CHIP_WIDTHS[index]} height={24} /></div>
            )}
          </div>
          {variant === 'panel' && (
            <div className="similar-rcard-actions"><ActionSlot width={84} /></div>
          )}
          {variant === 'drawer' && (
            <>
              <div className="similar-rcard-actions"><ActionSlot width={64} /><ActionSlot width={40} /></div>
              <div className="similar-rcard-chips similar-rcard-chips--foot"><Skeleton shape="pill" width={CHIP_WIDTHS[index]} height={24} /></div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
