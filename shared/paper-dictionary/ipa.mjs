// Wiktionary 用严式 IPA（ɹ、ɛ、t͡ʃ、音节点 ˈwɔː.tə、送气 kʰ、非成音节 aʊ̯）；国内教材、高考词表和
// 牛津/剑桥学习词典用宽式写法（r、e、tʃ、不标音节点和细节附加符）。卡片面向中国学生，
// 统一换成后者，只改写法不改读音。
const REPLACEMENTS = [
  // 连音弧、成音节、非成音节、送气、腭化、浊化、央化等附加符只标音值细节
  [/[\u0361\u0329\u032F\u032C\u0308ʰʲ]/g, ''],
  [/‿/g, ' '],
  [/ɹ/g, 'r'],
  [/ɫ/g, 'l'],
  [/ʍ/g, 'w'],
  [/[ɨᵻ]/g, 'ɪ'],
  [/ɛə/g, 'eə'],
  [/ɛː/g, 'eə'],
  [/ɛ/g, 'e'],
  [/ɝː?/g, 'ɜːr'],
  [/ɚ/g, 'ər'],
]

const VOWEL = /[iɪeæaɑɒɔoʊuʌɜəɐyøœɵɘɤɯ]/

// Wiktionary 的美音（通用美国音）按惯例不标长音：read /rid/、aboard /əˈbɔrd/。教材美音与英音一样标长音，
// 这里按学习词典的规则补上：ɑ、ɔ（ɔɪ 除外）、ɜ 一律长；i、u 在重读音节里长，u 在词尾也长
// （value /ˈvæljuː/）；非重读 i 保持短（happy /ˈhæpi/、happiness /ˈhæpinəs/），非重读词中 u 保持短
// （document /ˈdɑːkjumənt/）。
function addLengthMarks(word, soleWord) {
  const chars = [...word]
  const stressed = new Set()
  // 不标重音的单音节词按重读算（see /siː/）；短语里不标重音的是弱读虚词（the /ði/），词缀（-cy）也不算。
  let pendingStress = soleWord && !/[ˈˌ-]/.test(word) && (word.match(/[iɪeæaɑɒɔoʊuʌɜəɐ]+/g) ?? []).length === 1
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] === 'ˈ' || chars[index] === 'ˌ') pendingStress = true
    else if (pendingStress && VOWEL.test(chars[index])) {
      stressed.add(index)
      pendingStress = false
    }
  }
  let lastVowel = -1
  chars.forEach((char, index) => { if (VOWEL.test(char)) lastVowel = index })
  return chars.map((char, index) => {
    const next = chars[index + 1]
    // 双元音的后半（əu、eɪ 一类）不是独立的长元音
    if (next === 'ː' || (/[iu]/.test(char) && VOWEL.test(chars[index - 1] ?? ''))) return char
    if (char === 'ɑ' && next !== 'ɪ' && next !== 'ʊ') return 'ɑː'
    if (char === 'ɔ' && next !== 'ɪ') return 'ɔː'
    if (char === 'ɜ') return 'ɜː'
    if (char === 'i' && stressed.has(index)) return 'iː'
    // 紧挨重音前的 u 也长（museum /mjuːˈziːəm/、superb /suːˈpɜːrb/）
    if (char === 'u' && (stressed.has(index) || index === lastVowel || /[ˈˌ]/.test(next ?? ''))) return 'uː'
    return char
  }).join('')
}

export function learnerIpa(ipa) {
  if (typeof ipa !== 'string' || !ipa) return ipa
  // 「/twelfθ/ [tw̥elfθ]」这类宽严并列的只留宽式；只有严式 [ ] 的，经下面换写后按宽式显示。
  let text = ipa.replace(/^(\/[^/]+\/)\s*\[[^\]]*\]$/, '$1').replace(/^\[([^\]]+)\]$/, '/$1/')
  // 原文一处长音都没有，说明用的是不标长音的美式记法；已经标了长音的（英音、高考表）不动。
  const unmarkedLength = !/ː/.test(text)
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement)
  // 音节点只出现在 / / 之内（包括 (ə.) 这种可省略音节里），整段去掉。
  return text.replace(/\/[^/]*\//g, (part) => {
    const broad = part.replace(/\./g, '')
    if (!unmarkedLength) return broad
    const words = broad.split(' ')
    return words.map((word) => addLengthMarks(word, words.length === 1)).join(' ')
  })
}
