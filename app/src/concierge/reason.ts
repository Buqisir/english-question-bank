/**
 * Strip the "DeepSeek 检测第 N 位；" prefix and other internal source markers
 * from a steward reason string, and gently normalize ASCII single quotes around
 * Chinese phrases.
 *
 * Internal markers we never want shown to teachers:
 *   - 管家规则过滤
 *   - DeepSeek 检测第 N 位
 *   - DeepSeek
 *   - 检测第 N 位
 *   - steward
 *   - fallback
 */
const INTERNAL_MARKERS = [
  /管家规则过滤[；;]?\s*/g,
  /DeepSeek\s*检测第\s*\d+\s*位[；;]?\s*/gi,
  /\bDeepSeek\b[；;]?\s*/g,
  /检测第\s*\d+\s*位[；;]?\s*/g,
  /\bsteward\b[；;]?\s*/gi,
  /\bfallback\b[；;]?\s*/gi,
  // V1.1 extras: surface dev-side eval slugs that occasionally leak through
  // (these are pipeline tags from reading-parse / source-gap pipelines).
  /\breading-parse(?:-eval)?\b[；;]?\s*/gi,
  /\bsource-gap(?:-fill)?\b[；;]?\s*/gi,
]

export function cleanReason(raw: string): string {
  if (!raw) return ''
  let text = raw
  for (const marker of INTERNAL_MARKERS) {
    text = text.replace(marker, '')
  }
  // Normalize straight single quotes around tight CJK phrases like '阅读理解C' → 阅读理解 C
  // (drop the ASCII quote chrome; insert a space between Chinese letters and ASCII letters).
  text = text.replace(/'([^']*)'/g, (_match, inner) => inner)
  text = text.replace(/([\u4E00-\u9FFF])([A-Za-z])/g, '$1 $2')
  text = text.replace(/([A-Za-z])([\u4E00-\u9FFF])/g, '$1 $2')
  // Collapse stray whitespace and leading/trailing separators left behind by removals.
  return text
    .replace(/^\s*[，,；;。.\s]+/, '')
    .replace(/[，,；;。.\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
