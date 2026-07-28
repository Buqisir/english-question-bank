/**
 * Paper Surface — shared 部/节标题 判定单源 (heading-fidelity cut, 刀⑤
 * render-fidelity SW-B 销账).
 *
 * `docs/product/exam-paper-format-standards.md` §2/§4: 部标题(第X部分…)
 * 中黑加粗左顶格 10.5pt, 节标题(第X节…) 书宋常规缩进 2 字符 10.5pt —
 * 层级靠字重与缩进区分, 一律不放大字号。Screen 与
 * `server/print-renderer.mjs` 都要对同一个 `section_header` block title
 * 做出 part/section 判定, 判定逻辑必须单源, 不得在两个渲染面各写一份正则
 * (blankPattern.mjs 先例)。
 *
 * Rules for this module (same posture as blankPattern.mjs / tokens.mjs):
 *   - Pure ESM, no React, no app/, no server/ imports.
 *   - `headingKind` is a pure function of the title string — no state.
 */

const PART_PATTERN = /^第[一二三四五六七八九十\d]+部分/
const SECTION_PATTERN = /^第[一二三四五六七八九十\d]+节/

/**
 * @param {string} title - a `section_header` block's `title` text.
 * @returns {'part' | 'section'} — 'part' for 「第X部分…」, 'section' for
 *   「第X节…」. Anything else (no current synthesized title takes another
 *   shape) falls back to 'part' — the conservative choice per Locked
 *   Decision 1 (heading-fidelity plan.md).
 */
export function headingKind(title) {
  const text = String(title ?? '')
  if (SECTION_PATTERN.test(text)) return 'section'
  if (PART_PATTERN.test(text)) return 'part'
  return 'part'
}
