import type { ReactNode } from 'react'

type PointingHandProps = {
  size?: number
  className?: string
  /**
   * `right` 是 2026-09-04 owner 在目录里夸过的那只（拇指在观者左边，
   * 掌心朝我们，是右手）。那条路径不许重画、不许替换。
   * `left` 是 owner 在 Figma 里定稿的左手，目录选中态再顺时针倾 15°。
   */
  side?: 'left' | 'right'
}

/**
 * 小手 — 看整卷目录「我读到这儿」的标记。
 *
 * 画法：一根不断的三次贝塞尔轮廓，不是五根手指各画一根管子。
 * 路线：左腕底边进画 → 左掌边 → 绕拇指一圈 → 食/中/无名/小指
 * 各一个「上去、绕指尖、从指缝下来」→ 右掌边落到右腕。
 * y=18 底边不封口，手腕像从纸外伸进来。
 *
 * viewBox 0 0 16 18。size 是渲染高度，宽度 = size × 16/18。
 * 线宽 1.3（2026-09-15 同重法：与目录粗体字母等重；1.05 偏瘦，1.5 指缝糊），
 * round cap / join。路径本身未动。
 *
 * RIGHT_HAND_OUTLINE 是 owner 保留的目录版。以后画砸了就切回 side="right"。
 */
export const RIGHT_HAND_OUTLINE =
  'M5.1 18 C4.6 15.2 4.5 13.4 4.3 12 C3.2 11.6 2.1 10.4 1.7 9.2 C1.4 8.3 2 7.5 2.8 7.6 C3.6 7.7 4.3 8.6 4.6 9.6 C4.7 8.2 4.5 6.6 4.6 5.5 C4.7 4.7 5.5 4.3 6.1 4.8 C6.5 5.1 6.6 6.2 6.6 7.2 C6.8 6 6.9 4.8 7.2 4.1 C7.5 3.4 8.4 3.4 8.7 4.2 C8.9 4.8 8.9 6.2 8.8 7.3 C9.1 6.4 9.4 5.4 9.8 4.9 C10.3 4.3 11.1 4.7 11.2 5.5 C11.3 6.2 11.1 7.4 10.9 8.2 C11.3 7.6 11.8 7.2 12.3 7.4 C12.9 7.7 12.9 8.6 12.5 9.2 C12 10 11.4 10.8 11.3 12 C11.2 14 11.4 16 11 18'

export const LEFT_HAND_OUTLINE =
  'M9.7 18.0 C10.2 15.2 10.2 14.1 10.4 12.7 C11.6 11.9 12.2 11.4 12.9 10.1 C13.3 9.4 12.9 8.8 11.9 8.8 C11.4 8.8 10.6 9.1 10.0 9.8 C10.0 8.6 10.5 7.5 10.4 6.4 C10.3 5.6 9.5 5.2 8.7 5.8 C8.3 6.1 8.0 8.1 8.0 9.1 C7.8 7.9 7.9 5.7 7.6 5.0 C7.3 4.3 6.2 4.3 5.9 5.1 C5.7 5.7 5.8 7.7 5.9 8.8 C5.6 7.9 5.2 6.3 4.8 5.8 C4.3 5.2 3.5 5.6 3.4 6.4 C3.3 7.1 3.8 8.6 4.0 9.4 C3.6 8.8 2.8 8.1 2.3 8.3 C1.7 8.6 1.7 9.5 2.1 10.1 C2.6 10.9 3.2 11.7 3.3 12.9 C3.4 14.9 3.2 15.7 3.6 17.7'

export function PointingHand({
  size = 16,
  className,
  side = 'left',
}: PointingHandProps): ReactNode {
  const width = (size * 16) / 18
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 16 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {side === 'right' ? (
        <path d={RIGHT_HAND_OUTLINE} />
      ) : (
        <g transform="rotate(15 8 10)">
          <path d={LEFT_HAND_OUTLINE} />
        </g>
      )}
    </svg>
  )
}
