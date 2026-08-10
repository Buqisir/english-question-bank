#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const IPA_DICTIONARY_REVISION = '43c3570eb3553bdd19fccd2bd0091534889af023'
const IPA_DICTIONARY_SHA256 = '2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67'
const CMU_DICTIONARY_REVISION = '74790861f652b15e4ac49015a90074ad62a27690'
const CMU_DICTIONARY_SHA256 = '81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22'

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const dictionaryPath = resolve(readArgument('--dictionary', ''))
const cmuDictionaryPath = resolve(readArgument('--cmudict', ''))
const databasePath = resolve(readArgument('--database', 'data/question-bank.sqlite'))
const outputPath = resolve(readArgument('--output', 'data/vocabulary/wanwei-american-phonetics-v1.json'))

if (!readArgument('--dictionary', '') || !readArgument('--cmudict', '')) {
  throw new Error('Usage: node scripts/vocabulary/build-wanwei-american-phonetics.mjs --dictionary /path/to/ipa-dict-en_US.txt --cmudict /path/to/cmudict.dict')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseDictionary(raw) {
  const result = new Map()
  for (const line of raw.trim().split(/\r?\n/u)) {
    const tab = line.indexOf('\t')
    if (tab < 1) continue
    const headword = line.slice(0, tab).trim().toLowerCase()
    const pronunciations = line.slice(tab + 1).split(/,\s+(?=\/)/u).map((value) => value.trim()).filter(Boolean)
    if (headword && pronunciations.length) result.set(headword, pronunciations)
  }
  return result
}

function parseCmuDictionary(raw) {
  const result = new Map()
  for (const line of raw.trim().split(/\r?\n/u)) {
    const [rawHeadword, ...phones] = line.trim().split(/\s+/u)
    if (!rawHeadword || !phones.length) continue
    const headword = rawHeadword.replace(/\(\d+\)$/u, '').toLowerCase()
    if (!result.has(headword)) result.set(headword, [])
    result.get(headword).push(phones)
  }
  return result
}

const ARPABET_VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'])
const RAW_IPA_BY_ARPABET = {
  AA: ['ɑ'], AE: ['æ'], AH: ['ə'], AO: ['ɔ'], AW: ['aʊ'], AY: ['aɪ'], EH: ['ɛ'],
  ER: ['ɝ', 'ɚ', 'ɹ'], EY: ['eɪ'], IH: ['ɪ'], IY: ['i'], OW: ['oʊ'], OY: ['ɔɪ'],
  UH: ['ʊ'], UW: ['u'], B: ['b'], CH: ['tʃ'], D: ['d'], DH: ['ð'], F: ['f'], G: ['ɡ'],
  HH: ['h'], JH: ['dʒ'], K: ['k'], L: ['ɫ', 'l'], M: ['m'], N: ['n'], NG: ['ŋ'], P: ['p'],
  R: ['ɹ', 'r'], S: ['s'], SH: ['ʃ'], T: ['t'], TH: ['θ'], V: ['v'], W: ['w'], Y: ['j'],
  Z: ['z'], ZH: ['ʒ'],
}

function arpabetVowelToTeachingIpa(phone) {
  const match = String(phone).match(/^([A-Z]+)([012])$/u)
  if (!match || !ARPABET_VOWELS.has(match[1])) return null
  const [, vowel, stress] = match
  const stressed = stress !== '0'
  const primary = stress === '1'
  return {
    AA: 'ɑː',
    AE: 'æ',
    AH: stressed ? 'ʌ' : 'ə',
    AO: 'ɔː',
    AW: 'aʊ',
    AY: 'aɪ',
    EH: 'ɛ',
    ER: stressed ? 'ɜːr' : 'ər',
    EY: 'eɪ',
    IH: 'ɪ',
    IY: primary ? 'iː' : 'i',
    OW: 'oʊ',
    OY: 'ɔɪ',
    UH: 'ʊ',
    UW: primary ? 'uː' : 'u',
  }[vowel]
}

function applyCmuVowels(pronunciation, cmuPhones, label) {
  let result = ''
  let cursor = 0
  for (const phone of cmuPhones) {
    const base = String(phone).replace(/[012]$/u, '')
    const alternatives = RAW_IPA_BY_ARPABET[base]
    if (!alternatives) throw new Error(`Unsupported CMU phone ${phone} for ${label}`)
    let matchIndex = cursor
    while (matchIndex < pronunciation.length && /[\/ˈˌ.\s]/u.test(pronunciation[matchIndex])) matchIndex += 1
    const matched = alternatives.find((alternative) => pronunciation.startsWith(alternative, matchIndex))
    if (!matched) {
      throw new Error(`CMU alignment mismatch for ${label}: ${phone} at ${pronunciation.slice(matchIndex)}`)
    }
    result += pronunciation.slice(cursor, matchIndex)
    result += arpabetVowelToTeachingIpa(phone) ?? matched
    cursor = matchIndex + matched.length
  }
  return result + pronunciation.slice(cursor)
}

function applyMatchingCmuVowels(pronunciation, cmuCandidates, label) {
  const failures = []
  const matches = []
  for (const candidate of cmuCandidates) {
    try {
      const aligned = applyCmuVowels(pronunciation, candidate, label)
      if (!matches.includes(aligned)) matches.push(aligned)
    } catch (error) {
      failures.push(error.message)
    }
  }
  if (matches.length) return matches
  throw new Error(`${label} did not align to any CMU candidate: ${failures.join(' | ')}`)
}

function normalizeForComparison(value) {
  return String(value)
    .normalize('NFC')
    .replaceAll('ɹ', 'r')
    .replaceAll('ɫ', 'l')
    .replaceAll('ɚ', 'ər')
    .replaceAll('ɝ', 'ər')
    .replace(/ɜː\(?r\)?/gu, 'ər')
    .replace(/ɑː\(?r\)?/gu, 'ɑr')
    .replace(/ɔː\(?r\)?/gu, 'ɔr')
    .replace(/ɪə\(?r\)?/gu, 'ɪər')
    .replace(/eə\(?r\)?/gu, 'ɛər')
    .replaceAll('əʊ', 'o')
    .replaceAll('oʊ', 'o')
    .replaceAll('ɒ', 'ɑ')
    .replaceAll('e', 'ɛ')
    .replaceAll('iː', 'i')
    .replaceAll('uː', 'u')
    .replace(/[\/ˈˌː.\s(),;-]/gu, '')
}

function stressPosition(value) {
  const raw = String(value)
  const mark = raw.indexOf('ˈ')
  if (mark < 0) return null
  return normalizeForComparison(raw.slice(0, mark)).length
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1]
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

function scoreCandidate(source, candidate) {
  const sourceNormalized = normalizeForComparison(source)
  const candidateNormalized = normalizeForComparison(candidate)
  const sourceStress = stressPosition(source)
  const candidateStress = stressPosition(candidate)
  const stressPenalty = sourceStress == null || candidateStress == null ? 0 : Math.abs(sourceStress - candidateStress) * 2
  return levenshtein(sourceNormalized, candidateNormalized) + stressPenalty
}

function sourceVariants(phonetic) {
  const slashBodies = [...String(phonetic).matchAll(/\/([^/]+)\//gu)].map((match) => match[1].trim())
  if (slashBodies.length > 1) return slashBodies
  const body = slashBodies[0] ?? String(phonetic).replaceAll('/', '').trim()
  return body.includes(';') ? body.split(';').map((value) => value.trim()).filter(Boolean) : [body]
}

function dictionaryKeyFor(entry) {
  const directAmericanSpelling = entry.headword.match(/\(AmE\s+([^)]+)\)/u)?.[1]?.trim()
  if (directAmericanSpelling) return directAmericanSpelling.replace(/[.,]$/u, '').toLowerCase()
  return entry.headword
    .replace(/\s*\([^)]*\)\s*/gu, ' ')
    .split(/\s+\/\s+/u)[0]
    .trim()
    .toLowerCase()
}

function restoreSourceTeachingToken(source, pronunciation, sourcePattern, outputPattern, convertibleToken, replacement) {
  const sourcePositions = [...String(source).matchAll(sourcePattern)]
    .map((match) => normalizeForComparison(String(source).slice(0, match.index)).length)
  if (!sourcePositions.length) return pronunciation

  const candidates = [...String(pronunciation).matchAll(outputPattern)].map((match) => ({
    index: match.index,
    length: match[0].length,
    token: match[0],
    position: normalizeForComparison(String(pronunciation).slice(0, match.index)).length,
  }))
  const used = new Set()
  const replacements = new Map()
  for (const sourcePosition of sourcePositions) {
    const candidate = candidates
      .filter((item) => !used.has(item.index))
      .sort((left, right) => Math.abs(left.position - sourcePosition) - Math.abs(right.position - sourcePosition))[0]
    if (!candidate) continue
    used.add(candidate.index)
    if (candidate.token === convertibleToken) replacements.set(candidate.index, { length: candidate.length, value: replacement })
  }
  if (!replacements.size) return pronunciation
  let result = ''
  let cursor = 0
  for (const [index, change] of [...replacements].sort((left, right) => left[0] - right[0])) {
    result += String(pronunciation).slice(cursor, index)
    result += change.value
    cursor = index + change.length
  }
  return result + String(pronunciation).slice(cursor)
}

function addClosestLengthMarks(source, pronunciation, sourcePattern, candidateSymbol) {
  const sourceMatches = [...String(source).matchAll(sourcePattern)]
  if (!sourceMatches.length) return pronunciation
  const pronunciationChars = Array.from(String(pronunciation))
  const candidates = pronunciationChars
    .map((character, index) => character === candidateSymbol
      ? {
          index,
          alreadyLong: pronunciationChars[index + 1] === 'ː',
          position: normalizeForComparison(pronunciationChars.slice(0, index).join('')).length,
        }
      : null)
    .filter(Boolean)
  const used = new Set()
  const insertAfter = new Set()
  for (const match of sourceMatches) {
    const sourcePosition = normalizeForComparison(String(source).slice(0, match.index)).length
    const candidate = candidates
      .filter((item) => !used.has(item.index))
      .sort((left, right) => Math.abs(left.position - sourcePosition) - Math.abs(right.position - sourcePosition))[0]
    if (!candidate) continue
    used.add(candidate.index)
    if (!candidate.alreadyLong) insertAfter.add(candidate.index)
  }
  return pronunciationChars.map((character, index) => `${character}${insertAfter.has(index) ? 'ː' : ''}`).join('')
}

function learnerDisplay(source, pronunciation) {
  let display = pronunciation
  display = restoreSourceTeachingToken(source, display, /ɜː/gu, /ɜːr|ər/gu, 'ər', 'ɜːr')
  display = restoreSourceTeachingToken(source, display, /ʌ/gu, /ʌ|ə/gu, 'ə', 'ʌ')
  display = restoreSourceTeachingToken(source, display, /eə/gu, /e(?!ɪ)|ɛ/gu, 'ɛ', 'e')
  display = addClosestLengthMarks(source, display, /iː/gu, 'i')
  display = addClosestLengthMarks(source, display, /uː/gu, 'u')
  display = display
    .replaceAll('ɹ', 'r')
    .replaceAll('ɫ', 'l')
    .replace(/ərˈ(?=[aeiouɑæɛɪʊʌɔə])/gu, 'əˈr')
  const sourceStress = stressPosition(source)
  const primaryMarks = [...display.matchAll(/ˈ/gu)]
  if (!String(source).match(/[ˈˌ]/u)) return display.replace(/[ˈˌ]/gu, '')
  if (sourceStress != null && primaryMarks.length > 1) {
    const keep = primaryMarks
      .map((match, index) => ({ index, distance: Math.abs(normalizeForComparison(display.slice(0, match.index)).length - sourceStress) }))
      .sort((left, right) => left.distance - right.distance || left.index - right.index)[0].index
    let seen = -1
    display = display.replace(/ˈ/gu, () => {
      seen += 1
      return seen === keep ? 'ˈ' : 'ˌ'
    })
  }
  return display
}

function schoolDisplay(pronunciation) {
  return String(pronunciation).replaceAll('ɛ', 'e')
}

const IPA_MULTIGRAPHS = [
  'ɜːr', 'ɑːr', 'ɔːr', 'tʃ', 'dʒ', 'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ',
  'əʊ', 'ɪə', 'eə', 'ʊə', 'ɪr', 'er', 'ʊr', 'iː', 'uː', 'ɜː', 'ɑː',
  'ɔː', 'ər',
].sort((left, right) => right.length - left.length)

const ALIGNMENT_VOWELS = new Set([
  'A', 'AH', 'AIR', 'E', 'EER', 'ER', 'I', 'O', 'OR', 'U',
  'æ', 'ɪ', 'ʊ', 'ə', 'aɪ', 'aʊ', 'eɪ', 'ɔɪ', 'oʊ',
])

function primaryIpaBody(value) {
  const slashBody = [...String(value).matchAll(/\/([^/]+)\//gu)][0]?.[1]
    ?? String(value).replaceAll('/', '')
  return slashBody.split(';')[0].split(',')[0].trim()
}

function normalizeAlignmentToken(token) {
  const normalized = token.replaceAll('ɹ', 'r').replaceAll('ɫ', 'l')
  return {
    'əʊ': 'O', 'oʊ': 'O',
    'ɒ': 'A', 'ɑ': 'A', 'ɑː': 'A', 'ɑːr': 'A',
    'ʌ': 'AH',
    'e': 'E', 'ɛ': 'E',
    'i': 'I', 'iː': 'I',
    'u': 'U', 'uː': 'U',
    'eə': 'AIR', 'er': 'AIR',
    'ɪə': 'EER', 'ɪr': 'EER',
    'ɜː': 'ER', 'ɜːr': 'ER', 'ɝ': 'ER', 'ɚ': 'ER', 'ər': 'ER',
    'ɔː': 'OR', 'ɔːr': 'OR',
  }[normalized] ?? normalized
}

function tokenizeIpa(value) {
  const body = primaryIpaBody(value).replace(/[.\s]/gu, '')
  const characters = Array.from(body)
  const tokens = []
  let index = 0
  let stress = ''
  while (index < characters.length) {
    const character = characters[index]
    if (character === 'ˈ' || character === 'ˌ') {
      stress = character
      index += 1
      continue
    }
    const remaining = characters.slice(index).join('')
    const multigraph = IPA_MULTIGRAPHS.find((candidate) => remaining.startsWith(candidate))
    const token = multigraph ?? character
    tokens.push({ raw: `${stress}${token}`, base: token, normalized: normalizeAlignmentToken(token) })
    stress = ''
    index += Array.from(token).length
  }
  if (stress) throw new Error(`Dangling IPA stress mark in ${value}`)
  return tokens
}

function tokenSubstitutionCost(source, target) {
  if (source.normalized === target.normalized) return 0
  if (ALIGNMENT_VOWELS.has(source.normalized) && ALIGNMENT_VOWELS.has(target.normalized)) return 0.45
  return 1.4
}

function alignAmericanParts(parts, americanPhonetic, label) {
  const sourceTokens = parts.flatMap((part, partIndex) => tokenizeIpa(part.phonetic).map((token) => ({ ...token, partIndex })))
  const targetTokens = tokenizeIpa(americanPhonetic)
  if (!sourceTokens.length || !targetTokens.length) throw new Error(`Missing IPA tokens for ${label}`)

  const rows = sourceTokens.length + 1
  const columns = targetTokens.length + 1
  const costs = Array.from({ length: rows }, () => Array(columns).fill(Number.POSITIVE_INFINITY))
  const operations = Array.from({ length: rows }, () => Array(columns).fill(null))
  costs[0][0] = 0
  for (let sourceIndex = 1; sourceIndex < rows; sourceIndex += 1) {
    costs[sourceIndex][0] = sourceIndex
    operations[sourceIndex][0] = 'delete'
  }
  for (let targetIndex = 1; targetIndex < columns; targetIndex += 1) {
    costs[0][targetIndex] = targetIndex
    operations[0][targetIndex] = 'insert'
  }
  for (let sourceIndex = 1; sourceIndex < rows; sourceIndex += 1) {
    for (let targetIndex = 1; targetIndex < columns; targetIndex += 1) {
      const options = [
        {
          operation: 'match',
          cost: costs[sourceIndex - 1][targetIndex - 1]
            + tokenSubstitutionCost(sourceTokens[sourceIndex - 1], targetTokens[targetIndex - 1]),
        },
        { operation: 'delete', cost: costs[sourceIndex - 1][targetIndex] + 1 },
        { operation: 'insert', cost: costs[sourceIndex][targetIndex - 1] + 1 },
      ].sort((left, right) => left.cost - right.cost || ['match', 'delete', 'insert'].indexOf(left.operation) - ['match', 'delete', 'insert'].indexOf(right.operation))
      costs[sourceIndex][targetIndex] = options[0].cost
      operations[sourceIndex][targetIndex] = options[0].operation
    }
  }

  const assignments = Array(targetTokens.length).fill(null)
  let sourceIndex = sourceTokens.length
  let targetIndex = targetTokens.length
  while (sourceIndex > 0 || targetIndex > 0) {
    const operation = operations[sourceIndex][targetIndex]
    if (operation === 'match') {
      assignments[targetIndex - 1] = sourceTokens[sourceIndex - 1].partIndex
      sourceIndex -= 1
      targetIndex -= 1
    } else if (operation === 'delete') {
      sourceIndex -= 1
    } else if (operation === 'insert') {
      targetIndex -= 1
    } else {
      throw new Error(`IPA alignment stopped early for ${label}`)
    }
  }
  for (let index = 0; index < assignments.length; index += 1) {
    if (assignments[index] != null) continue
    const previous = assignments.slice(0, index).findLast((value) => value != null)
    const next = assignments.slice(index + 1).find((value) => value != null)
    assignments[index] = previous ?? next
  }

  const results = parts.map((part, partIndex) => {
    const sourceStress = part.phonetic.match(/[ˈˌ]/u)?.[0] ?? ''
    const body = targetTokens
      .filter((_token, tokenIndex) => assignments[tokenIndex] === partIndex)
      .map((token) => token.raw.replace(/[ˈˌ]/gu, ''))
      .join('')
    return { spelling: part.spelling, phonetic: `/${sourceStress}${body}/` }
  })
  if (results.some((part) => part.phonetic === '//')) throw new Error(`Empty American part after alignment for ${label}`)
  const rejoined = results.map((part) => part.phonetic.slice(1, -1).replace(/[ˈˌ]/gu, '')).join('')
  const target = targetTokens.map((token) => token.raw.replace(/[ˈˌ]/gu, '')).join('')
  if (rejoined !== target) throw new Error(`American parts do not rejoin for ${label}: ${rejoined} != ${target}`)
  return results
}

const americanFormPartOverrides = new Map([
  ['1:a', '/eɪ, ə/'],
  ['1:an', '/æn, ən/'],
  ['919:organise', '/ˈɔːrɡəˌnaɪz/'],
  ['933:physical education', '/ˌfɪzɪkəl ˌedʒəˈkeɪʃən/'],
  ['1248:artificial intelligence', '/ˌɑːrtəˈfɪʃəl ɪnˈtelədʒəns/'],
  ['1449:maths', '/mæθs/'],
  ['1487:per cent', '/pər ˈsent/'],
  ['1504:postmen', '/ˈpoʊstmən/'],
])

const americanFormDictionaryKeyOverrides = new Map([
  ['919:organise', 'organize'],
])

const americanEntryPartsOverrides = new Map([
  [80, [
    { spelling: 'con', phonetic: '/kən/' },
    { spelling: 've', phonetic: '/ˈviː/' },
    { spelling: 'nient', phonetic: '/njənt/' },
  ]],
  [345, [
    { spelling: 'real', phonetic: '/riːl/' },
  ]],
  [648, [
    { spelling: 'cu', phonetic: '/ˈkjʊ/' },
    { spelling: 'ri', phonetic: '/ri/' },
    { spelling: 'ous', phonetic: '/əs/' },
  ]],
  [678, [
    { spelling: 'dur', phonetic: '/ˈdjʊr/' },
    { spelling: 'ing', phonetic: '/ɪŋ/' },
  ]],
  [709, [
    { spelling: 'fa', phonetic: '/fə/' },
    { spelling: 'mil', phonetic: '/ˈmɪl/' },
    { spelling: 'iar', phonetic: '/jər/' },
  ]],
  [1152, [
    { spelling: 'tour', phonetic: '/ˈtʊr/' },
    { spelling: 'ist', phonetic: '/ɪst/' },
  ]],
  [1422, [
    { spelling: 'ju', phonetic: '/ˈdʒuː/' },
    { spelling: 'nior', phonetic: '/njər/' },
  ]],
  [1472, [
    { spelling: 'op', phonetic: '/ˈɑːp/' },
    { spelling: 'era', phonetic: '/rə/' },
  ]],
])

function buildAmericanFormPart(entry, part, dictionary, cmuDictionary) {
  const overrideKey = `${entry.sourceOrder}:${part.spelling.toLowerCase()}`
  const override = americanFormPartOverrides.get(overrideKey)
  if (override) return { spelling: part.spelling, phonetic: override }

  const dictionaryKey = americanFormDictionaryKeyOverrides.get(overrideKey)
    ?? part.spelling.toLowerCase().replaceAll('.', '').trim()
  const candidates = dictionary.get(dictionaryKey)
  const cmuCandidates = cmuDictionary.get(dictionaryKey)
  if (!candidates?.length || !cmuCandidates?.length) {
    throw new Error(`No American form pronunciation for ${entry.sourceOrder} ${entry.headword}: ${part.spelling}`)
  }
  const displays = []
  for (const sourceVariant of sourceVariants(part.phonetic)) {
    const choice = selectVariant(sourceVariant, candidates)
    const display = applyMatchingCmuVowels(choice.candidate, cmuCandidates, `${entry.sourceOrder} ${entry.headword}: ${part.spelling}`)
      .map((candidate) => learnerDisplay(sourceVariant, candidate))
      .sort((left, right) => scoreCandidate(sourceVariant, left) - scoreCandidate(sourceVariant, right))[0]
    if (!displays.includes(display)) displays.push(display)
  }
  const bodies = displays.map((value) => value.replace(/^\//u, '').replace(/\/$/u, ''))
  return { spelling: part.spelling, phonetic: schoolDisplay(`/${bodies.join('; ')}/`) }
}

function buildAmericanParts(entry, americanPhonetic, dictionary, cmuDictionary) {
  const entryOverride = americanEntryPartsOverrides.get(entry.sourceOrder)
  if (entryOverride) return entryOverride
  const parts = JSON.parse(entry.syllablesJson)
  if (!Array.isArray(parts) || !parts.length) throw new Error(`Missing source parts for ${entry.sourceOrder} ${entry.headword}`)
  const sourcePartsJoined = parts.map((part) => primaryIpaBody(part.phonetic)).join('')
  const sourceWhole = primaryIpaBody(entry.phonetic).replace(/\s/gu, '')
  const partsDescribeOnePronunciation = normalizeForComparison(sourcePartsJoined) === normalizeForComparison(sourceWhole)
  if (entry.pronunciationMode === 'syllables' || partsDescribeOnePronunciation) {
    return alignAmericanParts(parts, americanPhonetic, `${entry.sourceOrder} ${entry.headword}`)
  }
  return parts.map((part) => buildAmericanFormPart(entry, part, dictionary, cmuDictionary))
}

function selectVariant(source, candidates) {
  const ranked = candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(source, candidate) }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
  return ranked[0]
}

const manualOverrides = new Map([
  [1, { phonetic: '/eɪ, ə; æn, ən/', dictionaryKey: 'a / an', note: '保留 a 与 an 的强读、弱读。' }],
  [22, { phonetic: '/æz, əz/', dictionaryKey: 'as', note: '保留功能词的强读、弱读。' }],
  [23, { phonetic: '/æsk/', dictionaryKey: 'ask', note: '采用通用美式元音。' }],
  [156, { phonetic: '/frʌm/', dictionaryKey: 'from', note: '孤立词采用强读，不使用句中弱读。' }],
  [278, { phonetic: '/ʌv/', dictionaryKey: 'of', note: '孤立词采用强读，不使用句中弱读。' }],
  [436, { phonetic: '/tuː, tə/', dictionaryKey: 'to', note: '保留功能词的强读、弱读。' }],
  [483, { phonetic: '/əˈkɔːrdɪŋ tə/', dictionaryKey: 'according + to', note: '保留词条中的固定搭配 according to 及美式卷舌音。' }],
  [487, { phonetic: '/ˈæktər; ˈæktrəs/', dictionaryKey: 'actor + actress', note: '保留词条列出的两个对应词形。' }],
  [513, { phonetic: '/ˈɛnibɑːdi; ˈɛniwʌn/', dictionaryKey: 'anybody + anyone', note: '保留词条列出的两个对应词形。' }],
  [538, { phonetic: '/biː/', dictionaryKey: 'be', note: '孤立词采用完整长元音读音。' }],
  [586, { phonetic: '/kæn, kən/', dictionaryKey: 'can', note: '保留功能词的强读、弱读。' }],
  [919, { phonetic: '/ˈɔːrɡəˌnaɪz/', dictionaryKey: 'organize', note: '按词条标注采用美式拼写 organize。' }],
  [933, { phonetic: '/ˌpiː ˈiː/', dictionaryKey: 'P E', note: '字母缩写按字母名称朗读。' }],
  [1023, { phonetic: '/ˈskuːlˌbæɡ/', dictionaryKey: 'school + bag', note: '词典未收录合成词，按两个已收录词素组合。' }],
  [1143, { phonetic: '/təˈmeɪtoʊ/', dictionaryKey: 'tomato', note: '采用 CMUdict 首列的主流美式读音，不跟随英式源音标选择 /ɑː/ 变体。' }],
  [1166, { phonetic: '/ˈtiː ˌʃɜːrt/', dictionaryKey: 'T-shirt', note: '修正上游 IPA 将 shirt 首辅音误写为 s 的错误。' }],
  [1167, { phonetic: '/ˌtiː ˈviː/', dictionaryKey: 'T V', note: '字母缩写按字母名称朗读。' }],
  [1248, { phonetic: '/ˌeɪ ˈaɪ/', dictionaryKey: 'A I', note: '字母缩写按字母名称朗读。' }],
  [1253, { phonetic: '/ˌeɪ ˈɛm/', dictionaryKey: 'A M', note: '字母缩写按字母名称朗读。' }],
  [1200, { phonetic: '/wʌt/', dictionaryKey: 'what', note: '孤立词采用强读，不使用句中弱读。' }],
  [1201, { phonetic: '/wʌtˈɛvər/', dictionaryKey: 'whatever', note: '保留美式完整元音，不使用弱化首音节。' }],
  [1349, { phonetic: '/ˌdaʊnˈloʊd/', dictionaryKey: 'download', note: '按词条动词义保留后重音。' }],
  [1413, { phonetic: '/ˈaɪs ˌkriːm/', dictionaryKey: 'ice + cream', note: '词典未收录词组，按复合名词重音记录。' }],
  [1425, { phonetic: '/ˈkiːloʊ/', dictionaryKey: 'kilo', note: '采用中学教学常用的完整长元音。' }],
  [1428, { phonetic: '/ˌkʌŋ ˈfuː/', dictionaryKey: 'kung + fu', note: '词典未收录词组，按通用美式词组读音记录。' }],
  [1449, { phonetic: '/mæθ/', dictionaryKey: 'math', note: '按词条标注采用美式形式 math。' }],
  [1495, { phonetic: '/ˌpiː ˈɛm/', dictionaryKey: 'P M', note: '字母缩写按字母名称朗读。' }],
])

const cambridgeUsReducedVowelOverrides = new Map([
  [56, ['celebrate', '/ˈseləbreɪt/']],
  [72, ['communicate', '/kəˈmjuːnəkeɪt/']],
  [168, ['habit', '/ˈhæbɪt/']],
  [189, ['honest', '/ˈɑːnɪst/']],
  [198, ['imagine', '/ɪˈmædʒɪn/']],
  [255, ['minute', '/ˈmɪnɪt/']],
  [328, ['promise', '/ˈprɑːmɪs/']],
  [511, ['animal', '/ˈænɪməl/']],
  [601, ['challenge', '/ˈtʃælɪndʒ/']],
  [689, ['engineer', '/ˌendʒɪˈnɪr/']],
  [692, ['especially', '/ɪˈspeʃəli/']],
  [816, ['kilometer', '/kɪˈlɑːmətər/']],
  [884, ['mountain', '/ˈmaʊntɪn/']],
  [917, ['opposite', '/ˈɑːpəzɪt/']],
  [949, ['planet', '/ˈplænɪt/']],
  [1000, ['responsible', '/rɪˈspɑːnsəbəl/']],
  [1103, ['surface', '/ˈsɜːrfɪs/']],
  [1184, ['wallet', '/ˈwɑːlɪt/']],
  [1271, ['basketball', '/ˈbæskətbɑːl/']],
  [1281, ['biscuit', '/ˈbɪskɪt/']],
  [1310, ['chicken', '/ˈtʃɪkɪn/']],
  [1475, ['palace', '/ˈpælɪs/']],
  [1485, ['penguin', '/ˈpeŋɡwɪn/']],
  [1496, ['pocket', '/ˈpɑːkɪt/']],
  [1501, ['porridge', '/ˈpɔːrɪdʒ/']],
  [1518, ['rocket', '/ˈrɑːkɪt/']],
  [1577, ['uniform', '/ˈjuːnəfɔːrm/']],
  [1579, ['universe', '/ˈjuːnəvɜːrs/']],
])

for (const [sourceOrder, [dictionaryKey, phonetic]] of cambridgeUsReducedVowelOverrides) {
  if (manualOverrides.has(sourceOrder)) throw new Error(`Duplicate manual phonetic override at ${sourceOrder}`)
  manualOverrides.set(sourceOrder, {
    dictionaryKey,
    phonetic,
    note: 'Cambridge US 音标复核：在 CMUdict 将非重读元音合并为 AH0 时，固定本词的 /ə/ 或 /ɪ/ 及教学重音。',
  })
}

const dictionaryBytes = readFileSync(dictionaryPath)
const dictionaryDigest = sha256(dictionaryBytes)
if (dictionaryDigest !== IPA_DICTIONARY_SHA256) {
  throw new Error(`Unexpected en_US dictionary SHA-256: ${dictionaryDigest}`)
}
const dictionary = parseDictionary(dictionaryBytes.toString('utf8'))
const cmuDictionaryBytes = readFileSync(cmuDictionaryPath)
const cmuDictionaryDigest = sha256(cmuDictionaryBytes)
if (cmuDictionaryDigest !== CMU_DICTIONARY_SHA256) {
  throw new Error(`Unexpected CMU dictionary SHA-256: ${cmuDictionaryDigest}`)
}
const cmuDictionary = parseCmuDictionary(cmuDictionaryBytes.toString('utf8'))

const database = new DatabaseSync(databasePath, { readOnly: true })
const sourceEntries = database.prepare(`
  SELECT id, source_order AS sourceOrder, headword, phonetic,
         part_of_speech AS partOfSpeech,
         pronunciation_mode AS pronunciationMode,
         syllables_json AS syllablesJson
  FROM vocabulary_entries
  ORDER BY source_order
`).all()
database.close()

if (sourceEntries.length !== 1600) throw new Error(`Expected 1600 entries, found ${sourceEntries.length}`)

let manualCount = 0
let alternateCandidateCount = 0
const entries = sourceEntries.map((entry, index) => {
  if (entry.sourceOrder !== index + 1) throw new Error(`Non-contiguous source order at ${entry.sourceOrder}`)
  const manual = manualOverrides.get(entry.sourceOrder)
  let result
  if (manual) {
    manualCount += 1
    result = {
      entryId: entry.id,
      sourceOrder: entry.sourceOrder,
      headword: entry.headword,
      sourcePhonetic: entry.phonetic,
      phonetic: schoolDisplay(manual.phonetic),
      dictionaryKey: manual.dictionaryKey,
      selection: 'manual-learner-override',
      note: manual.note,
    }
  } else {
    const dictionaryKey = dictionaryKeyFor(entry)
    const candidates = dictionary.get(dictionaryKey)
    const cmuCandidates = cmuDictionary.get(dictionaryKey)
    if (!candidates?.length) throw new Error(`No en_US pronunciation for ${entry.sourceOrder} ${entry.headword} (${dictionaryKey})`)
    if (!cmuCandidates?.length) throw new Error(`No CMU pronunciation for ${entry.sourceOrder} ${entry.headword} (${dictionaryKey})`)
    const selected = []
    const scores = []
    for (const sourceVariant of sourceVariants(entry.phonetic)) {
      const choice = selectVariant(sourceVariant, candidates)
      if (choice.index > 0) alternateCandidateCount += 1
      const displays = applyMatchingCmuVowels(choice.candidate, cmuCandidates, `${entry.sourceOrder} ${entry.headword}`)
        .map((stressAwareCandidate) => learnerDisplay(sourceVariant, stressAwareCandidate))
      const display = displays.sort((left, right) => scoreCandidate(sourceVariant, left) - scoreCandidate(sourceVariant, right))[0]
      if (!selected.includes(display)) selected.push(display)
      scores.push(choice.score)
    }
    const bodies = selected.map((value) => value.replace(/^\//u, '').replace(/\/$/u, ''))
    result = {
      entryId: entry.id,
      sourceOrder: entry.sourceOrder,
      headword: entry.headword,
      sourcePhonetic: entry.phonetic,
      phonetic: schoolDisplay(`/${bodies.join('; ')}/`),
      dictionaryKey,
      selection: 'cmudict-stress-aware-source-sense',
      candidateCount: candidates.length,
      cmuCandidateCount: cmuCandidates.length,
      score: Math.max(...scores),
    }
  }
  return {
    ...result,
    pronunciationMode: entry.pronunciationMode,
    parts: buildAmericanParts(entry, result.phonetic, dictionary, cmuDictionary),
  }
})

const manifest = {
  schemaVersion: 'wanwei-american-phonetics-v1',
  dialect: 'en-US',
  displayConvention: 'learner-friendly General American broad IPA; CMUdict supplies American phonemes and stress while the Wanwei source preserves school-visible vowel length and teaching distinctions',
  source: {
    name: 'CMU Pronouncing Dictionary',
    url: 'https://github.com/cmusphinx/cmudict',
    revision: CMU_DICTIONARY_REVISION,
    path: 'cmudict.dict',
    sha256: CMU_DICTIONARY_SHA256,
    license: 'BSD-style CMUdict license',
  },
  alignmentSource: {
    name: 'ipa-dict en_US',
    url: 'https://github.com/open-dict-data/ipa-dict',
    revision: IPA_DICTIONARY_REVISION,
    path: 'data/en_US.txt',
    sha256: IPA_DICTIONARY_SHA256,
    license: 'MIT',
    purpose: 'Candidate spelling, consonant symbols, and stress placement aligned to CMUdict variants',
  },
  reviewSources: [{
    name: 'Cambridge Dictionary US pronunciation',
    url: 'https://dictionary.cambridge.org/pronunciation/',
    purpose: 'Resolve the 42-word reduced-vowel audit where CMUdict AH0 does not distinguish school-visible /ə/ from /ɪ/.',
  }],
  policy: {
    preservesSourceEvidence: true,
    selection: 'Match the American candidate to the source sense, replace vowels from stress-marked CMUdict ARPAbet, and use the Cambridge US audit for AH0 reduced-vowel and teaching-stress exceptions.',
    syllableDisplay: 'Every entry carries parallel American and source-book British part IPA so the selected PDF accent stays internally consistent.',
  },
  counts: {
    entries: entries.length,
    automatic: entries.length - manualCount,
    manualOverrides: manualCount,
    selectedNonFirstCandidate: alternateCandidateCount,
  },
  entries,
}

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Wrote ${entries.length} American phonetics to ${outputPath}`)
console.log(`Manual overrides: ${manualCount}; non-first dictionary selections: ${alternateCandidateCount}`)
