/**
 * Paper headline text — shared by ConciergePaperRow (search/feed rows) and
 * the home 接着做 rows. Pure; no React.
 */
/**
 * home-editorial — the year now renders in its own column, so the headline
 * should not repeat it. `paperName` occasionally carries its own leading
 * year token (e.g. "26.3 广东深圳..."); we strip that best-effort so it
 * doesn't visually double up with the year column. Not a hard guarantee —
 * a paperName that embeds the year in an unrecognized shape will still show
 * it once in the headline (Should Watch, not hard-scrubbed per plan).
 *
 * C5a (trust-cracks) — the year token is sometimes followed by a `.M` month
 * digit ("26.3重庆市…"), which the old separator-only strip left as a bare
 * leading digit ("3重庆市…", read as a stray "3"). We now capture that month
 * digit explicitly and rewrite it as "M月" instead of dropping or leaving it
 * bare — "26.3重庆市…" → "3月重庆市…".
 */
function stripLeadingYearToken(paperName: string, year: number | null): string {
  if (!year) return paperName
  const full = String(year)
  const short = full.slice(2)
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*(?:${escape(full)}|${escape(short)})(?:\\.(\\d{1,2}))?[.\\-年\\s]*`)
  const match = paperName.match(pattern)
  if (!match) return paperName
  const month = match[1]
  const rest = paperName.slice(match[0].length).trim()
  if (!rest) return paperName
  return month ? `${Number(month)}月${rest}` : rest
}

/**
 * C5b (trust-cracks) — 卷名结巴: dedupe `region` against the (year-stripped)
 * `paperName` before joining them. Real卷名 frequently already embed the
 * region ("全国甲卷" paperName + "全国甲卷" region, or "新课标Ⅰ卷" paperName +
 * "全国新课标Ⅰ" region) — prefixing region again reads as a stutter
 * ("全国甲卷 全国甲卷"). We compare `name` (with a trailing "卷" stripped, so
 * "新课标Ⅰ卷" contributes its "新课标Ⅰ" core) against `region` in both
 * directions: either containing the other counts as overlap, and when it
 * does we show only the paperName. No overlap → keep the existing
 * "region 卷名" shape.
 *
 * "3月深圳高三一模" / "新课标Ⅰ卷" — the paper name without its year token, region-prefixed only when the name doesn't already carry it. */
export function paperHeadline(paperName: string, regionValue: string | null | undefined, year: number | null): string {
  const name = stripLeadingYearToken(paperName, year).trim()
  const region = (regionValue || '').trim()
  if (!region || region === '未标地区' || region === '未标') return name
  if (!name) return region
  const core = name.endsWith('卷') ? name.slice(0, -1) : name
  const overlaps = core.length > 0 && (name.includes(region) || region.includes(core))
  return overlaps ? name : `${region} ${name}`.trim()
}

