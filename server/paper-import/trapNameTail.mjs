// 干扰项解析不写陷阱类型名（Owner 2026-11-22 定）。
//
// A distractor line prints as 「X 项（译文）错在：<说明>」. The sentence says
// what the passage says and what the option changed; it does not end with a
// type label such as 「，属无中生有。」 or 「，对象错配。」, because a label adds
// nothing the sentence has not shown, and a wrong label is itself an error.
// `trap.primaryType` stays in the data (future 相似题 work needs it); it is
// just never printed.
//
// Frozen data still has such tails. stripTrapName() drops a trailing label at
// export time and leaves the rest of the sentence as written; the import
// validator warns about the same tails in new freezes. Only the last clause is
// looked at, and only when it is a bare label: 「选项把对象错配到作者身上」
// explains the trick and stays, 「'考试'属于无中生有」 says which part is
// made up and stays, 「属性与来源都不符」 is not a 属 tail at all.

const LABEL_WORD = /无中生有|颠倒|错配|张冠李戴|偷换|词钩|钩子|设钩|词族|夸大|拔高|臆造|干扰|偏题|曲解/u

// 「，属于无中生有。」「；故属对象错配」「，属同词族干扰。」
const SHU_TAIL = /[，,；;]\s*(?:故|纯|即|也)?属于?(?!性)\s*([^，,；;。]{1,16}?)\s*[。.]?$/u
// 「，对象错配。」「，态度黑白颠倒。」「，此项无中生有。」: a short noun phrase
// ending in a label, with no verb, negation or second clause in it.
const BARE_TAIL = /[，,；;]\s*([一-龥]{0,6}?(?:张冠李戴|错配|颠倒|偷换|无中生有|拔高))\s*[。.]?$/u
const NOT_BARE = /[把被了为将与和而且不非未没是属]/u

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function trapExplanation(trap) {
  return str(trap?.explanation) || str(trap?.relationNote)
}

function labelTail(text) {
  const shu = text.match(SHU_TAIL)
  if (shu && LABEL_WORD.test(shu[1])) return shu
  const bare = text.match(BARE_TAIL)
  if (bare && !NOT_BARE.test(bare[1].replace(/^(?:此项|此说法|纯属|故属)/u, ''))) return bare
  return null
}

// → { text, label }: the explanation without its trailing type label.
export function stripTrapName(trap) {
  const text = trapExplanation(trap)
  const tail = labelTail(text)
  if (!tail) return { text, label: '' }
  const body = text.slice(0, tail.index).trim().replace(/[，,；;]$/u, '')
  return body ? { text: `${body}。`, label: tail[1].trim() } : { text, label: '' }
}

// For new freezes: what the import validator warns about.
export function trapNameIssue(trap) {
  const { label } = stripTrapName(trap)
  return label ? `句尾写了类型名「${label}」：解析不写陷阱类型名，删掉它，句子只写原文怎么说、选项改成了什么。` : ''
}
