import { readFileSync } from 'node:fs'
import { learnerIpa } from '../../shared/paper-dictionary/ipa.mjs'
import { posLabel } from '../../shared/paper-dictionary/morphology.mjs'

const PROGRAM_ID = 'gaokao-curriculum-3000-frequency-v1'
const STAGES = { high_frequency: 'high', mid_frequency: 'mid', low_frequency: 'low' }
const DIALECTS = [
  { code: 'US', label: '美', key: 'american' },
  { code: 'UK', label: '英', key: 'british' },
]
// 高考表的词性写法换成词典 posLabel 的写法，两边才比得上（int. 对词典的 intj）。
const SOURCE_POS = { 'int.': posLabel('intj') }

function readVocabulary(name) {
  return JSON.parse(readFileSync(new URL(`../../data/vocabulary/${name}`, import.meta.url), 'utf8'))
}

// 源表是 PDF 抽取的词头，含「a,an」「colo (u )r」「ow n」这类写法；
// 拆成可直接与词典词头比较的小写变体。多词短语保留空格，单词查词不会命中它们。
export function gaokaoHeadwordVariants(raw) {
  const variants = new Set()
  for (const piece of String(raw).split(',')) {
    let part = piece.trim().replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')')
    if (!part) continue
    const tokens = part.split(/\s+/)
    if (tokens.length > 1 && tokens.some((token) => token.length === 1)) part = tokens.join('')
    if (part.includes('(')) {
      variants.add(part.replace(/\([^)]*\)/g, ''))
      variants.add(part.replace(/[()]/g, ''))
    } else {
      variants.add(part)
    }
  }
  return [...variants].filter(Boolean).map((cased) => ({ cased, folded: cased.toLowerCase() }))
}

function sourcePosLabels(raw) {
  return new Set(String(raw || '').split(/[\s&/]+/).filter(Boolean).map((item) => SOURCE_POS[item] || item))
}

export function buildGaokaoVocabulary({
  source = readVocabulary('gaokao-frequency-source-content-v1.json'),
  reviewed = readVocabulary('gaokao-frequency-learning-reviewed-v1.json'),
  overrides = readVocabulary('gaokao-frequency-headword-overrides-v1.json'),
  american = readVocabulary('gaokao-frequency-full-american-audio-manifest-v1.json'),
  british = readVocabulary('gaokao-frequency-full-british-audio-manifest-v1.json'),
} = {}) {
  if (source.programId !== PROGRAM_ID || !Array.isArray(source.entries)) {
    throw new Error('Invalid gaokao frequency source content')
  }
  for (const manifest of [american, british]) {
    if (manifest.programId !== PROGRAM_ID || manifest.status !== 'owner_approved' || !manifest.publicBasePath) {
      throw new Error('Gaokao audio manifest is not owner approved')
    }
  }
  const reviewedById = new Map(reviewed.entries.map((entry) => [entry.entryId, entry]))
  const overrideByOrder = new Map(overrides.entries.map((entry) => [entry.sourceOrder, entry.headword]))
  const audioBy = (manifest) => new Map(manifest.entries.map((entry) => [
    entry.entryId,
    { url: `${manifest.publicBasePath}/${entry.path}`, text: String(entry.text || '').toLowerCase() },
  ]))
  const audio = { american: audioBy(american), british: audioBy(british) }

  const exact = new Map()
  const folded = new Map()
  const ordered = [...source.entries].sort((a, b) => a.frequencyRank - b.frequencyRank)
  for (const entry of ordered) {
    const stage = STAGES[entry.frequencyStage]
    if (!stage) continue
    const review = reviewedById.get(entry.entryId)
    const info = {
      entryId: entry.entryId,
      frequencyRank: entry.frequencyRank,
      frequencyStage: stage,
      posLabels: sourcePosLabels(entry.partOfSpeech),
      phonetics: {
        american: review?.phonetics?.american || null,
        british: review?.phonetics?.british || null,
      },
      audio: {
        american: audio.american.get(entry.entryId) || null,
        british: audio.british.get(entry.entryId) || null,
      },
    }
    const headword = overrideByOrder.get(entry.sourceOrder) || entry.headword
    const variants = gaokaoHeadwordVariants(headword)
    // 一条收了多个写法（toward(s)、defence / defense）时，音标与录音只对应其中一个，不拿来兜底。
    info.pronunciationFallback = variants.length === 1
    // 「liv ely」「X- ray」这类断词只有录音文本还原得出来。
    const spoken = info.audio.american?.text
    if (spoken && spoken === headword.replace(/\s+/g, '').toLowerCase() && !variants.some((item) => item.folded === spoken)) {
      variants.push({ cased: spoken, folded: spoken })
      info.pronunciationFallback = true
    }
    for (const variant of variants) {
      if (!exact.has(variant.cased)) exact.set(variant.cased, info)
      // may / May 都在表里；大小写不敏感的回退保留排名更靠前的那条。
      if (!folded.has(variant.folded)) folded.set(variant.folded, info)
    }
  }
  return {
    find(headword) {
      const text = String(headword)
      return exact.get(text) || folded.get(text.toLowerCase()) || null
    },
  }
}

let shared = null

export function sharedGaokaoVocabulary() {
  if (!shared) shared = buildGaokaoVocabulary()
  return shared
}

// 不同词性组给出互不相交的音标（record n./v.、live v./adj.），
// 说明这个词按词性变读音；高考表每词只有一个音标，这种词不能拿它兜底。
// 各组只标了不同方言（read 一组英式 /riːd/、一组美式 /rɛd/）时按方言比较会漏掉，
// 所以也按不分英美的音标集合比较一次；宁可少兜底，不把两个读音合成一个。
// 未标口音的多是各地方音（antique 的菲律宾读法），不拿来判断。
function hasHeteronymEvidence(entry) {
  const usUk = new Set(DIALECTS.map((item) => item.code))
  for (const code of [...usUk, null]) {
    const sets = entry.posGroups
      .map((group) => new Set(group.pronunciations
        .filter((item) => item.ipa && (code == null ? usUk.has(item.dialect) : item.dialect === code))
        .map((item) => item.ipa)))
      .filter((set) => set.size > 0)
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        if (![...sets[i]].some((ipa) => sets[j].has(ipa))) return true
      }
    }
  }
  return false
}

function ownPronunciation(dialect, info, headword, groupIndex) {
  return {
    pronunciationId: `${groupIndex}:gaokao-${dialect.code}`,
    ipa: learnerIpa(info.phonetics[dialect.key]),
    dialect: dialect.code,
    dialectLabel: dialect.label,
    spokenForm: headword,
    audio: info.audio[dialect.key] ? {
      url: info.audio[dialect.key].url,
      source: 'EQB',
      author: null,
      license: null,
      licenseUrl: null,
      synthetic: true,
    } : null,
  }
}

// 读音先用 Wiktionary 的真人录音；整个词条里某个方言都没有真人录音时，
// 才换成我们审过的音标与合成发音，避免同一方言在卡片上出现两遍。
function withOwnPronunciations(group, info, headword, humanDialects) {
  let pronunciations = [...group.pronunciations]
  let replacedAny = false
  for (const dialect of DIALECTS) {
    // toward 与 towards 共用一条；录音念的是哪一个就只给哪一个兜底。
    const spokenMatches = info.audio[dialect.key]?.text === headword.toLowerCase()
    if (humanDialects.has(dialect.code)) {
      // 真人录音放不出来时，播放器改播同口音的合成发音。
      if (!spokenMatches) continue
      pronunciations = pronunciations.map((item) => (item.dialect === dialect.code && item.audio
        ? { ...item, audio: { ...item.audio, fallbackUrl: info.audio[dialect.key].url } }
        : item))
      continue
    }
    if (!info.phonetics[dialect.key] || !spokenMatches) continue
    const own = ownPronunciation(dialect, info, headword, group.posGroupIndex)
    const at = pronunciations.findIndex((item) => item.dialect === dialect.code)
    pronunciations = pronunciations.filter((item, index) => item.dialect !== dialect.code || index === at)
    const slot = pronunciations.findIndex((item) => item.dialect === dialect.code)
    if (slot >= 0) pronunciations[slot] = own
    else pronunciations.push(own)
    replacedAny = true
  }
  if (replacedAny) {
    pronunciations = pronunciations.filter((item) => item.dialect !== 'unspecified' || item.audio)
  }
  return { ...group, pronunciations }
}

export function enrichWithGaokao(entries, vocabulary) {
  if (!vocabulary) return entries
  return entries.map((entry) => {
    const info = vocabulary.find(entry.headword)
    if (!info) return entry
    const sharesPos = entry.posGroups.some((group) => info.posLabels.has(group.posLabel || posLabel(group.pos)))
    const fallback = info.pronunciationFallback && sharesPos && !hasHeteronymEvidence(entry)
    const humanDialects = new Set(entry.posGroups.flatMap((group) => (
      group.pronunciations.filter((item) => item.audio).map((item) => item.dialect)
    )))
    return {
      ...entry,
      gaokao: { frequencyStage: info.frequencyStage, frequencyRank: info.frequencyRank },
      posGroups: fallback
        ? entry.posGroups.map((group) => withOwnPronunciations(group, info, entry.headword, humanDialects))
        : entry.posGroups,
    }
  })
}
