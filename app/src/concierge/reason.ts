/**
 * Reason text helpers for the concierge result row.
 *
 * Steward-side reason strings sometimes start with the rank annotation
 * "DeepSeek 检测第 N 位" — which is a developer-facing breadcrumb, not a
 * teacher-facing rationale. Strip it before display so what's left is the
 * actual recommendation reason.
 */

export function cleanReason(raw: string): string {
  if (!raw) return ''
  return raw.replace(/^\s*DeepSeek\s*检测第\s*\d+\s*位\s*[;；]?\s*/i, '').trim()
}
