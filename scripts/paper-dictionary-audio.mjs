import { createHash } from 'node:crypto'
import { allowedUpstreamAudioUrl } from '../shared/paper-dictionary/audioUrl.mjs'

export const MIRROR_PUBLIC_PATH = '/dictionary-audio/wikimedia-v1'

// Wiktionary 给的多是 Commons 自动转出的 mp3（…/transcoded/a/ab/X.ogg/X.ogg.mp3），
// 取回原始文件（…/a/ab/X.ogg）只转码一次，避免二次有损。
export function commonsOriginalUrl(playUrl) {
  const url = new URL(playUrl)
  const match = url.pathname.match(/^(\/wikipedia\/commons)\/transcoded\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/[^/]+$/)
  if (match) url.pathname = `${match[1]}/${match[2]}`
  return url.toString()
}

export function mirrorPathFor(originalUrl) {
  const hash = createHash('sha256').update(originalUrl).digest('hex').slice(0, 16)
  return `${MIRROR_PUBLIC_PATH}/${hash}.mp3`
}

const UK_TAGS = new Set([
  'uk',
  'british',
  'rp',
  'received-pronunciation',
  'england',
])
const US_TAGS = new Set([
  'us',
  'usa',
  'ga',
  'general-american',
  'american',
  'california',
])

export function normalizeIpa(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\/\[\]]/g, '').replace(/[ˈˌ. ]/g, '').toLowerCase()
}

export function normalizePos(value) {
  const pos = String(value || '').toLowerCase()
  if (pos === 'adjective') return 'adj'
  if (pos === 'adverb') return 'adv'
  if (pos === 'pronoun') return 'pron'
  if (pos === 'preposition') return 'prep'
  if (pos === 'conjunction') return 'conj'
  if (pos === 'interjection' || pos === 'interj') return 'intj'
  if (pos === 'determiner') return 'det'
  if (pos === 'numeral') return 'num'
  if (pos === 'proper noun') return 'name'
  return pos
}

function tagList(tags) {
  return (Array.isArray(tags) ? tags : []).map((tag) => (
    String(tag).toLowerCase().replace(/[_\s]+/g, '-')
  ))
}

export function dialectOf(tags, filename = '') {
  const list = tagList(tags)
  const uk = list.some((tag) => UK_TAGS.has(tag))
  const us = list.some((tag) => US_TAGS.has(tag))
  if (uk && us) return null
  if (uk) return 'UK'
  if (us) return 'US'
  const file = String(filename || '').toLowerCase()
  if (file.startsWith('en-uk-') || file.startsWith('en-gb-')) return 'UK'
  if (file.startsWith('en-us-')) return 'US'
  return 'unspecified'
}

export function sameSpokenForm(headword, recordedWord) {
  if (headword === recordedWord) return true
  if (typeof headword !== 'string' || typeof recordedWord !== 'string') return false
  if (headword.toLowerCase() !== recordedWord.toLowerCase()) return false
  const headIsCaps = headword.length > 1 && headword === headword.toUpperCase()
  const recordedIsCaps = recordedWord.length > 1 && recordedWord === recordedWord.toUpperCase()
  return headIsCaps === recordedIsCaps
}

export function playableSound(sound) {
  const fileName = typeof sound?.audio === 'string' ? sound.audio.trim() : ''
  const mp3 = allowedUpstreamAudioUrl(sound?.mp3_url)
  const ogg = allowedUpstreamAudioUrl(sound?.ogg_url)
  const playUrl = mp3 || ogg
  if (!fileName || !playUrl) return null
  const dialect = dialectOf(sound.tags, fileName)
  if (!dialect) return null
  return {
    word: sound.word,
    pos: normalizePos(sound.pos),
    ipa: typeof sound.ipa === 'string' ? sound.ipa : '',
    dialect,
    playUrl,
    fileName,
  }
}

export function cleanAuthor(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  if (/no machine-readable author/i.test(text)) return null
  if (/assumed \(based on copyright claims\)/i.test(text)) return null
  return text.slice(0, 180)
}

export function acceptedLicense(name) {
  if (typeof name !== 'string') return false
  const value = name.trim().toLowerCase()
  if (!value || value === 'unknown' || value.includes('fair use') || value.includes('non-free') || value === 'copyrighted') {
    return false
  }
  return value.includes('public domain')
    || value.startsWith('cc')
    || value.includes('creative commons')
    || value.includes('gfdl')
}

function fold(value) {
  return value.toLowerCase()
}

export function matchPronunciations(rows, sounds) {
  const grouped = new Map()
  for (const sound of sounds) {
    if (!sound?.word || !sound.playUrl || !sound.dialect) continue
    const key = fold(sound.word)
    const bucket = grouped.get(key)
    if (bucket) bucket.push(sound)
    else grouped.set(key, [sound])
  }
  const posCount = new Map()
  for (const row of rows) {
    const key = `${fold(row.headword)}\n${row.headword}`
    posCount.set(key, (posCount.get(key) || new Set()))
    posCount.get(key).add(row.pos || '')
  }
  const assigned = new Map()
  const dialectByUrl = new Map()
  for (const row of rows) {
    const pool = (grouped.get(fold(row.headword)) || []).filter((sound) => (
      sameSpokenForm(row.headword, sound.word) && sound.dialect === row.dialect
    ))
    const forms = posCount.get(`${fold(row.headword)}\n${row.headword}`)
    const filtered = pool.filter((sound) => {
      if (sound.pos && row.pos && sound.pos !== row.pos) return false
      if (!sound.pos && forms && forms.size > 1) return false
      const soundIpa = normalizeIpa(sound.ipa)
      const rowIpa = normalizeIpa(row.ipa)
      if (soundIpa && rowIpa && soundIpa !== rowIpa) return false
      return true
    })
    const siblingIpas = new Set(rows.filter((other) => (
      other.headword === row.headword && other.pos === row.pos && other.dialect === row.dialect
    )).map((other) => normalizeIpa(other.ipa)).filter(Boolean))
    const usable = filtered.filter((sound) => {
      if (normalizeIpa(sound.ipa)) return true
      return siblingIpas.size <= 1
    }).filter((sound) => {
      const previous = dialectByUrl.get(sound.playUrl)
      return !previous || previous === sound.dialect
    })
    if (usable.length === 0) continue
    const urls = new Set(usable.map((sound) => sound.playUrl))
    if (!normalizeIpa(row.ipa) && siblingIpas.size > 1) continue
    if (urls.size > 1 && !usable.some((sound) => normalizeIpa(sound.ipa) && normalizeIpa(sound.ipa) === normalizeIpa(row.ipa))) {
      continue
    }
    const chosen = usable.find((sound) => normalizeIpa(sound.ipa) && normalizeIpa(sound.ipa) === normalizeIpa(row.ipa)) || usable[0]
    assigned.set(row.key, chosen)
    dialectByUrl.set(chosen.playUrl, chosen.dialect)
  }
  return assigned
}
