// 干扰项类型名怎么印（Owner 2026-11-22 定）。
//
// A distractor line prints as 「X 项（译文）错在<名>：<说明>」. Only four names
// may print, because each names a trick a reader can learn to spot:
// 黑白颠倒, 对象错配, 范围偷换, 原文词钩. 无中生有 never prints: 「原文没提 X」
// already says it, and it is the catch-all type.
//
// A name prints only when two things agree: the writer ended the explanation
// with 「，属<名>。」 and `trap.primaryType` is the same type; and the sentence
// proves the name (selfProof below), checked against the trap's own structured
// fields. Otherwise the tail is left as written and no name prints. A trailing
// 「属无中生有」 is always dropped.

const NAMES = {
  polarityReversal: '黑白颠倒',
  entityMismatch: '对象错配',
  scopeShift: '范围偷换',
  sourceLexicalTrap: '原文词钩',
}

const TAIL_NAME_TYPES = [
  [/^(?:原文)?词钩(?:干扰)?项?$/u, 'sourceLexicalTrap'],
  [/^黑白颠倒$/u, 'polarityReversal'],
  [/^对象错配$/u, 'entityMismatch'],
  [/^范围偷换$/u, 'scopeShift'],
  [/^无中生有$/u, 'unsupportedClaim'],
]

// 「，属于无中生有。」「；属黑白颠倒」, or a bare known name: 「，对象错配。」
const TAIL_WITH_SHU = /[，,；;]\s*属于?\s*([^，,；;。]{2,12}?)\s*[。.]?$/u
const TAIL_BARE = /[，,；;]\s*((?:原文)?词钩(?:干扰)?项?|黑白颠倒|对象错配|范围偷换|无中生有)\s*[。.]?$/u

const LATIN = /[A-Za-z][A-Za-z'’-]{2,}/gu
const CONTRAST = /相反|反而|却|并非|不是|而非|并不|并未|没有|否定|肯定|正好|矛盾|反转|说成|当作/u
const ENTITY_CONTRAST = /不是|并非|而非|而是|只有|仅|只在|只说|不同|偷换|指的是|无关|并无/u
const SCOPE = /只|仅|全|所有|都|每|扩大|缩小|夸大|拔高|窄化|泛化|绝对|总|部分|一律|唯一|任何|一人|单/u

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function words(text) {
  return new Set((str(text).match(LATIN) ?? []).map((word) => word.toLowerCase()))
}

function within(part, whole) {
  return Boolean(part) && Boolean(whole) && whole.includes(part)
}

export function trapExplanation(trap) {
  return str(trap?.explanation) || str(trap?.relationNote)
}

function tailOf(text) {
  const match = text.match(TAIL_WITH_SHU) ?? text.match(TAIL_BARE)
  if (!match) return null
  const name = match[1].trim()
  const known = TAIL_NAME_TYPES.find(([pattern]) => pattern.test(name))
  return { name, type: known ? known[1] : null, body: text.slice(0, match.index) }
}

// Does the sentence show the trick its name claims? Each check leans on the
// trap's structured fields, which the validator already ties to the passage.
export function selfProof(trap, body) {
  switch (trap?.primaryType) {
    case 'sourceLexicalTrap': {
      const borrowed = [...words(trap.sourceText)].filter((word) => words(trap.optionText).has(word))
      const said = words(body)
      return borrowed.some((word) => said.has(word))
    }
    case 'polarityReversal':
      return within(str(trap.sourceHighlight), str(trap.sourceQuote))
        && within(str(trap.optionHighlight), str(trap.optionText))
        && CONTRAST.test(body)
    case 'entityMismatch':
      // The same name in a different role (改编者 vs 作曲者) is still a mismatch.
      return Boolean(str(trap.sourceEntity)) && Boolean(str(trap.optionEntity))
        && ENTITY_CONTRAST.test(body)
    case 'scopeShift':
      return within(str(trap.sourceHighlight), str(trap.sourceQuote))
        && within(str(trap.optionHighlight), str(trap.optionText))
        && SCOPE.test(body)
    default:
      return false
  }
}

// → { name, text, change, reason }
//   change: 'named' (tail moved to 错在<名>), 'dropped' (属无中生有 removed),
//           'kept' (a tail stays as written), 'none' (no tail).
export function trapVerdict(trap) {
  const text = trapExplanation(trap)
  const tail = tailOf(text)
  if (!tail) return { name: '', text, change: 'none', reason: '' }
  const body = tail.body.trim().replace(/[，,；;]$/u, '')
  const finish = body ? `${body}。` : text
  if (tail.type === 'unsupportedClaim') return { name: '', text: finish, change: 'dropped', reason: '无中生有不写名' }
  if (!tail.type) return { name: '', text, change: 'kept', reason: `「${tail.name}」不在四个名字里` }
  if (tail.type !== trap?.primaryType) return { name: '', text, change: 'kept', reason: `句尾写「${tail.name}」，数据标的是 ${trap?.primaryType}` }
  if (!selfProof(trap, body)) return { name: '', text, change: 'kept', reason: `句子没证出「${NAMES[tail.type]}」` }
  return { name: NAMES[tail.type], text: finish, change: 'named', reason: '' }
}

// For new freezes: what the import validator refuses.
export function trapTailIssue(trap) {
  const verdict = trapVerdict(trap)
  if (verdict.change === 'dropped') return '无中生有不写类型名：删掉句尾「属无中生有」，句子只写原文没说什么。'
  if (verdict.change === 'kept') return `${verdict.reason}。句尾只能写「，属黑白颠倒/对象错配/范围偷换/原文词钩。」之一，要和 primaryType 一致，且句子要写出这一骗法；做不到就不写名字。`
  return ''
}
