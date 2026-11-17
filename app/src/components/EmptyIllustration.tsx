import { useId } from 'react'
import './emptyIllustration.css'

/*
 * 空状态插图（迁移第 12 条，样张 design/texture-2026-11-13/empty-states-sample.html）。
 * 只给「还没东西」的 5 处：插图 = 这一页图标的平涂版，坐标取自 icons-v3.mjs，
 * 线换成色块；前后挡住处留白缝。
 * 例外：线稿里纸在笔周围断开的那道缝（G9）平涂时不照搬：挖开会露出底色，像一块影子；
 * 平涂的笔本来就盖在纸上（Owner 2026-11-13 指出）。搜了没结果、还没选、暂时没有只写一行灰字，不用它。
 */
export type EmptyIllustrationKind = 'archive' | 'vocabulary-notebook' | 'paper-lined' | 'question-bank' | 'board-list'

const LINED_PAPER = 'M7.383 3.009 H16.617 Q19.776 3.009 19.776 6.168 V14.819 H16.52 Q13.458 14.819 13.458 17.881 V20.991 H7.383 Q4.224 20.991 4.224 17.832 V6.168 Q4.224 3.009 7.383 3.009 Z'
const BANK_FRONT = 'M8.445 5.077 H15.555 Q17.988 5.077 17.988 7.509 V13.06 C17.988 16.478 15.311 18.923 11.985 18.923 H8.445 Q6.012 18.923 6.012 16.491 V7.509 Q6.012 5.077 8.445 5.077 Z'

export function EmptyIllustration({ kind }: { kind: EmptyIllustrationKind }) {
  const clipId = useId()
  return (
    <svg className="eqb-empty-ill" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-kind={kind}>
      {kind === 'archive' && (
        <>
          <defs><clipPath id={clipId}><rect x="0" y="0" width="24" height="13.813" /></clipPath></defs>
          <path className="ill-deep-line" d="M8.869 7.854 V4.975 A1.768 1.768 0 0 1 10.636 3.208 H13.364 A1.768 1.768 0 0 1 15.131 4.975 V7.854" />
          <path className="ill-mid" d="M6.445 7.854 H17.555 A3.283 3.283 0 0 1 20.837 11.136 V17.499 A3.283 3.283 0 0 1 17.555 20.782 H6.445 A3.283 3.283 0 0 1 3.162 17.499 V11.136 A3.283 3.283 0 0 1 6.445 7.854 Z" />
          <path className="ill-deep" clipPath={`url(#${clipId})`} d="M6.445 7.854 H17.555 A3.283 3.283 0 0 1 20.837 11.136 V17.499 A3.283 3.283 0 0 1 17.555 20.782 H6.445 A3.283 3.283 0 0 1 3.162 17.499 V11.136 A3.283 3.283 0 0 1 6.445 7.854 Z" />
          <rect className="ill-paper" x="3" y="13.4" width="18" height="0.8" />
        </>
      )}
      {kind === 'vocabulary-notebook' && (
        <>
          <path className="ill-paper" d="M4.365 18.617 Q4.365 20.653 6.91 20.653 H19.635 V16.326 C18.108 16.632 16.581 16.835 13.527 16.835 H6.91 Q4.365 16.835 4.365 18.617 Z" />
          <path className="ill-deep" d="M19.635 16.326 V3.347 H6.91 Q4.365 3.347 4.365 5.892 V18.617 Q4.365 16.835 6.91 16.835 H13.527 C16.581 16.835 18.108 16.632 19.635 16.326 Z" />
          {/* 封面上原是一个 A；2026-11-17 Owner 定全套去掉实心 A，和图标一样换成书名签（图标描边 9.25–14.75、y 8，这里画成同宽的实心圆头条）。 */}
          <rect className="ill-paper" x="8.125" y="6.875" width="7.75" height="2.25" rx="1.125" />
        </>
      )}
      {kind === 'paper-lined' && (
        <>
          <defs><clipPath id={clipId}><path d={LINED_PAPER} /></clipPath></defs>
          <path className="ill-paper" d={LINED_PAPER} />
          <path className="ill-mid-line" clipPath={`url(#${clipId})`} d="M4 8.598 H20 M4 12.729 H11.903 M4 16.86 H9.327" />
          <path className="ill-deep" d="M19.776 14.819 H16.52 Q13.458 14.819 13.458 17.881 V20.991 C16.957 20.991 19.776 18.415 19.776 14.819 Z" />
        </>
      )}
      {kind === 'question-bank' && (
        <>
          <defs><clipPath id={clipId}><path d={BANK_FRONT} /></clipPath></defs>
          <g transform="translate(3.607 -1.087)">
            <path className="ill-mid" transform="rotate(-22 12 27.231)" d="M8.445 5.077 H15.555 Q17.988 5.077 17.988 7.509 V16.491 Q17.988 18.923 15.555 18.923 H8.445 Q6.012 18.923 6.012 16.491 V7.509 Q6.012 5.077 8.445 5.077 Z" />
            <path className="ill-paper" d={BANK_FRONT} />
            <path className="ill-deep" clipPath={`url(#${clipId})`} d="M17.988 13.06 H14.894 Q11.985 13.06 11.985 15.969 V18.923 H25.988 V13.06 Z" />
          </g>
        </>
      )}
      {kind === 'board-list' && (
        <>
          <path className="ill-paper" d="M6.805 4.726 H14.078 Q17.455 4.726 17.455 8.103 V17.975 Q17.455 21.352 14.078 21.352 H6.805 Q3.428 21.352 3.428 17.975 V8.103 Q3.428 4.726 6.805 4.726 Z" />
          <path className="ill-mid-line" d="M7.324 12.52 H9.662" />
          <path className="ill-deep" d="M9.662 12.52 L10.441 8.893 L16.478 2.866 A2.011 2.011 0 0 1 19.315 5.703 L13.288 11.74 Z" />
        </>
      )}
    </svg>
  )
}
