// The student-facing reason of a non-finite blank must not name a different
// sentence role from the stored `role`. Only explicit role claims count:
// 作/做/充当/当 + 成分词, or a compound such as 后置定语 / 伴随状语. A claim
// right after a negation (不是/并非/而非/不作…) is a contrast, not a claim,
// and a claim about a clause member (作从句主语) is about another word.
const ROLE_OF_TERM = [
  ['subject-complement', /主语补足语|主补/u],
  ['object-complement', /宾语补足语|宾补/u],
  ['appositive', /同位语/u],
  ['attributive', /定语/u],
  ['adverbial', /状语/u],
  ['predicative', /表语/u],
  ['subject', /主语/u],
  ['object', /宾语/u],
]
const ROLE_CLAIM = /(作|做|充当|当)(?:句子的?|句中的?|整句的?|从句的?)?(?:后置|前置)?(?:伴随|方式|目的|结果|原因|时间|条件|让步|地点)?(主语补足语|主补|宾语补足语|宾补|同位语|定语|状语|表语|主语|宾语)|(后置定语|前置定语|(?:伴随|方式|目的|结果|原因|时间|条件|让步)状语)/gu
const NEGATED = /(?:不是|并非|而非|不作|不做|不能作|不能当|不当|非|不)\s*$/u

export function grammarFillReasonRoleClaims(reason) {
  const text = String(reason || '')
  const claims = []
  for (const match of text.matchAll(ROLE_CLAIM)) {
    if (/从句/u.test(match[0])) continue
    if (NEGATED.test(text.slice(Math.max(0, match.index - 4), match.index))) continue
    const term = match[2] || match[3]
    const role = ROLE_OF_TERM.find(([, pattern]) => pattern.test(term))?.[0]
    if (role) claims.push({ role, quote: match[0] })
  }
  return claims
}

export function grammarFillReasonRoleConflicts(item) {
  if (item?.facetKey !== 'grammar-fill.given.verb.non-finite' || !item.role) return []
  return grammarFillReasonRoleClaims(item.reason).filter((claim) => claim.role !== item.role)
}
