import { closeSync, openSync, readFileSync, readdirSync, readSync } from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { splitSentences } from '../../shared/paper-selection/segmentation.mjs'
import { codePointOffset, locatePhraseOccurrence, normalizePhraseText } from '../../shared/paper-dictionary/phraseOccurrence.mjs'
import { createBoundedLru } from '../paper-translation/boundedLru.mjs'

const normalize = (text) => text.normalize('NFC').trim()
const normalizePhraseAlias = (text) => normalize(text).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase()
const cleanExample = (text) => text.trim().replace(/^(?:[■□●○•▪▫‣◦]\s*)+/, '')
const occurrenceKey = (...parts) => JSON.stringify(parts)
const sentenceKey = (paperId, groupId, id, sentence) => occurrenceKey(paperId, groupId, id, sentence)

function leafLocator(leaf) {
  if (leaf.kind === 'option') return leaf.id.replace(/:([^:]+)$/, '#option=$1')
  if (leaf.kind === 'option-bank') return `option-bank:${leaf.id}`
  return leaf.id
}

export function readOtterOccurrence(stream, word) {
  const leaf = stream.leaves.find(item => item.start <= word.start && item.end >= word.end)
  if (!leaf) return null
  const sentences = splitSentences(stream.text.slice(leaf.start, leaf.end))
  const index = sentences.findIndex(item => item.start <= word.start - leaf.start && item.end >= word.end - leaf.start)
  if (index < 0) return null
  const sentence = sentences[index]
  const start = word.start - leaf.start - sentence.start
  const end = word.end - leaf.start - sentence.start
  return { leaf, sentence: sentence.text, sentenceNumber: index + 1, start, end }
}

const MONTHS = { jan: 1, feb: 2, jun: 6, jul: 7 }
const ROUNDS = { first: '一', second: '二', third: '三' }
const SECTION_LABELS = {
  cloze: '完形填空',
  'grammar-fill': '语法填空',
  'listening.long-form': '听力',
  'listening.short-dialogue': '听力',
  'seven-choices': '七选五',
  'writing-application': '应用文写作',
  'writing-continuation': '读后续写',
  'writing-short-error-correction': '短文改错',
}
const MOCK_SHORT_TITLES = {
  'paper-mock-zhejiang-zhenhai-2026-05-gaokao-mock-test': '2026 镇海中学 5 月模拟',
  'paper-mock-hubei-edongnan-2025-11-senior-three-midterm-joint-exam': '2025 鄂东南期中联考',
  'paper-mock-hunan-huaihua-2026-03-nine-school-alliance-second-joint-exam-first-gaokao-mock': '2026 湖南九校二联暨怀化一模',
  'paper-mock-hubei-five-cities-2025-09-senior-three-first-quality-monitoring': '2025 湖北五地市州质量监测',
  'paper-mock-zhejiang-2026-02-gaosan-fanxiao-liankao': '2026 浙江四联盟返校联考',
  'paper-mock-hubei-yuanchuang-alliance-2025-11-senior-three-stage-training': '2025 圆创联盟 11 月阶段训练',
  'paper-mock-zhejiang-zhedongbei-county-alliance-2025-11-senior-three-diagnostic-test': '2025 浙东北县域名校联盟诊断',
  'paper-mock-zhejiang-z20-alliance-2025-12-senior-three-second-joint-exam': '2025 Z20+ 名校联盟二联',
  'paper-mock-jiangsu-suzhou-nanjing-nine-schools-2025-12-senior-three-first-round-review-joint-assessment': '2025 苏州南京九校一轮调研',
  'paper-mock-hubei-huazhong-normal-university-first-affiliated-high-school-2026-05-adaptability-test-v2': '2026 华师一附中 5 月适应性检测',
  'paper-mock-zhejiang-hangzhou-2026-april-three-province-joint-exam': '2026 三省三校联考',
}

function shortPaperTitle(paperId, paperTitle) {
  if (Object.hasOwn(MOCK_SHORT_TITLES, paperId)) return MOCK_SHORT_TITLES[paperId]
  const title = paperTitle.normalize('NFKC')
  const exam = /^paper-gaokao-(\d{4})-(.+)$/.exec(paperId)
  if (exam) {
    const [, year, series] = exam
    const regional = /^(zhejiang|four-provinces|eight-provinces|nine-provinces)-([a-z]+)$/.exec(series)
    if (regional) {
      const names = { zhejiang: '浙江', 'four-provinces': '四省联考', 'eight-provinces': '八省联考', 'nine-provinces': '九省联考' }
      const name = series === 'eight-provinces-jan' && /适应性演练/.test(title) ? '八省适应性演练' : names[regional[1]]
      return `${year} ${name}${MONTHS[regional[2]] ? ` ${MONTHS[regional[2]]} 月` : ''}`
    }
    const volume = /(新高考|新课标|全国)\s*(?:全国)?\s*(I{1,3}|甲|乙|丙)\s*卷?(?=[)\s]|$)/.exec(title)
    if (volume) return `${year} ${volume[1]}${/[A-Z]/.test(volume[2]) ? ` ${volume[2]} ` : volume[2]}卷`
  }

  const date = /-(20\d\d)(?:-(0[1-9]|1[0-2]|mar|apr))?(?=-|$)/.exec(paperId)
  const printedYear = title.match(/(?:20\d\d\s*[-~—～]\s*)?(20\d\d)\s*(?:届|年|学年)/)?.[1]
  const year = date?.[1] ?? printedYear
  const month = date?.[2] === 'mar' ? 3 : date?.[2] === 'apr' ? 4 : Number(date?.[2])
  const compact = title
    .replace(/(?:20\d\d\s*[-~—～]\s*)?20\d\d\s*(?:学年度?|届|年)?(?:\s*\d{1,2}\s*月)?/g, '')
    .replace(/普通高等学校招生全国统一考试|普通高中毕业班|高中毕业班|高三年级|高三|英语(?:学科)?[\s]*(?:试题卷?|试卷|试题)?/g, '')
    .replace(/^(?:第[一二]学期|\s)+/, '').trim()
  const place = /(?:[\p{Script=Han}]{2,6}省)?([\p{Script=Han}]{2,8})(?:市|区)(?=[\s、(]|第|[^\p{Script=Han}]|$)/u.exec(compact)
    ?? /^(?:[\p{Script=Han}]{2,6}省)?([\p{Script=Han}]{2,8}?)(?:市|区)/u.exec(compact)
  const roundKey = paperId.split('-').findLast(part => Object.hasOwn(ROUNDS, part))
  const round = compact.match(/第([一二三四五六七八九十]+)次(?:高考)?模拟|([一二三四五六七八九十]+)模/)
  const roundNumber = round?.[1] ?? round?.[2] ?? (roundKey && ROUNDS[roundKey])
  if (year && place && roundNumber && /模拟|[一二三四五六七八九十]模/.test(compact)) {
    return `${year} ${place[1]}${roundNumber}模`
  }
  const kind = /模拟|适应性|期中|期末|联考|月考|调研|检测|诊断|摸底|训练/.exec(compact)?.[0]
  if (year && place && kind) return `${year} ${place[1]}${month ? ` ${month} 月` : ''}${kind}`
  return [year, compact || title].filter(Boolean).join(' ')
}

function prepareEntry(entry, phrases) {
  for (const sense of entry.senses) {
    for (const example of sense.examples) {
      example.text = cleanExample(example.text)
      const { paperId, paperTitle, groupId, locator } = example.source
      if (entry.kind === 'phrase') {
        const rows = phrases.get(occurrenceKey(paperId, groupId, locator.paragraphId ?? locator.questionId))
        const points = [...example.text]
        const row = rows?.find(row => row.entryId === entry.entryId && row.senseId === sense.senseId
          && row.sentence === locator.sentence && row.end <= points.length
          && (!row.surface || points.slice(row.start, row.end).join('') === row.surface))
        if (row) example.highlightRanges = row.parts ?? [[row.start, row.end]]
      }
      const reading = /:reading-([a-d])$/i.exec(groupId)?.[1]?.toUpperCase()
      const section = reading ? `阅读 ${reading}` : SECTION_LABELS[groupId.split(':').at(-1)]
      example.source.label = [shortPaperTitle(paperId, paperTitle), section].filter(Boolean).join(' · ')
    }
  }
  return entry
}

function readOptional(read, fallback) {
  try {
    return read()
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function* readOccurrenceRows(file) {
  const fd = readOptional(() => openSync(file, 'r'), null)
  if (fd === null) return
  try {
    const buffer = Buffer.alloc(128 * 1024)
    const decoder = new StringDecoder('utf8')
    let remainder = ''
    let bytesRead
    while ((bytesRead = readSync(fd, buffer)) > 0) {
      const lines = (remainder + decoder.write(buffer.subarray(0, bytesRead))).split('\n')
      remainder = lines.pop()
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line)
      }
    }
    const last = remainder + decoder.end()
    if (last.trim()) yield JSON.parse(last)
  } finally {
    closeSync(fd)
  }
}

export function openOtterDictionary(rootDir) {
  // Keep the bundled dictionary in the release, whose top-level data directory is shared.
  const dir = path.join(rootDir, 'server', 'paper-dictionary', 'otter-data')
  const entriesDir = path.join(dir, 'entries')
  const files = new Map()
  const headwords = new Map()
  const aliases = new Map()
  const phraseAliases = new Map()
  const phraseIds = new Set()
  const exampleSentences = new Map()
  const entries = createBoundedLru({ maxEntries: 300 })
  const readEntry = name => JSON.parse(readFileSync(path.join(entriesDir, name), 'utf8'))
  const names = readOptional(() => readdirSync(entriesDir), []).filter(name => name.endsWith('.json')).sort()
  for (const name of names) {
    const { entryId, headword, variants, forms, kind, senses } = readEntry(name)
    if (kind === 'phrase') phraseIds.add(entryId)
    files.set(entryId, name)
    headwords.set(normalize(headword), entryId)
    for (const form of [headword, ...variants, ...forms.map(item => item.form)]) {
      const key = normalize(form).toLowerCase()
      aliases.set(key, !aliases.has(key) || aliases.get(key) === entryId ? entryId : null)
      if (kind === 'phrase') {
        const phraseKey = normalizePhraseAlias(form)
        phraseAliases.set(phraseKey, !phraseAliases.has(phraseKey) || phraseAliases.get(phraseKey) === entryId ? entryId : null)
      }
    }
    for (const sense of senses) {
      for (const { text, source: { paperId, groupId, locator } } of sense.examples) {
        const key = sentenceKey(paperId, groupId, locator.paragraphId ?? locator.questionId, locator.sentence)
        if (!exampleSentences.has(key)) exampleSentences.set(key, new Set())
        exampleSentences.get(key).add(cleanExample(text))
      }
    }
  }
  const occurrences = new Map()
  const matches = new Map()
  const phrases = new Map()
  for (const row of readOccurrenceRows(path.join(dir, 'occurrence-senses.ndjson'))) {
    const locator = occurrenceKey(row.paperId, row.groupId, row.paragraphId ?? row.questionId)
    if (phraseIds.has(row.entryId)) {
      // occurrence-senses.ndjson schema: optional sentenceStart is a zero-based
      // code-point offset of the trimmed sentence in the original block.
      // Bundled legacy rows store the sentence ordinal but leave the text in the examples.
      const indexedSentences = row.sentenceText
        ? [row.sentenceText]
        : exampleSentences.get(sentenceKey(row.paperId, row.groupId, row.paragraphId ?? row.questionId, row.sentence))
      if (!indexedSentences) continue
      if (!phrases.has(locator)) phrases.set(locator, [])
      phrases.get(locator).push({ ...row, indexedSentences })
      continue
    }
    let positions = occurrences.get(locator)
    if (!positions) occurrences.set(locator, positions = new Map())
    const key = occurrenceKey(row.sentence, row.start, row.end, row.surface)
    const previous = positions.get(key)
    if (previous === null || (previous && previous.entryId !== row.entryId)) {
      positions.set(key, null)
      continue
    }
    const matchKey = occurrenceKey(row.entryId, row.senseId)
    if (!matches.has(matchKey)) matches.set(matchKey, { entryId: row.entryId, senseId: row.senseId })
    positions.set(key, matches.get(matchKey))
  }
  exampleSentences.clear()
  function entryById(entryId) {
    const name = files.get(entryId)
    if (!name) return null
    const cached = entries.get(entryId)
    if (cached) return cached
    const entry = prepareEntry(readEntry(name), phrases)
    entries.set(entryId, entry)
    return entry
  }
  function findId(surface) {
    const key = normalize(surface)
    const direct = headwords.get(key) ?? aliases.get(key.toLowerCase())
    if (direct !== undefined || !/\s/u.test(key)) return direct
    const phrase = normalizePhraseAlias(key)
    if (phraseAliases.has(phrase)) return phraseAliases.get(phrase)
    return phraseAliases.get(phrase.replace(/\b(?:my|your|his|her|its|our|their)\b/g, "one's"))
  }
  return {
    available: files.size > 0,
    phrasesAvailable: phrases.size > 0,
    entryById,
    findId,
    find: surface => entryById(findId(surface)),
    relatedPhrases(entry) {
      return [...new Set(entry.relatedPhrases)].filter(id => phraseIds.has(id)).map(id => ({
        entryId: id, headword: entryById(id).headword,
      }))
    },
    findPhrases(paperId, stream, { start, end }, word) {
      return stream.leaves.flatMap(leaf => {
        if (leaf.end <= start || leaf.start >= end) return []
        const locator = occurrenceKey(paperId, stream.groupId, leafLocator(leaf))
        const rows = phrases.get(locator)
        if (!rows?.length) return []
        const text = stream.text.slice(leaf.start, leaf.end)
        const block = normalizePhraseText(text)
        const from = codePointOffset(text, Math.max(0, start - leaf.start))
        const to = codePointOffset(text, end - leaf.start)
        return [...rows].sort((a, b) => a.sentence - b.sentence || a.start - b.start).flatMap(row => {
          const positions = new Map()
          for (const sentence of row.indexedSentences) {
            const indexed = locatePhraseOccurrence(block, row, sentence)
            if (indexed) positions.set(occurrenceKey(indexed.from, indexed.to, indexed.parts), indexed)
          }
          if (positions.size !== 1) return []
          const [indexed] = positions.values()
          const hit = word
            ? indexed.parts.some(([s, e]) => s <= from && to <= e)
            : from <= indexed.from && indexed.to <= to
          if (!hit) return []
          const entry = entryById(row.entryId)
          const sense = entry.senses.find(item => item.senseId === row.senseId)
          if (!sense) return []
          const exact = !word && start >= leaf.start && end <= leaf.end && from === indexed.from && to === indexed.to
          return [{ entry, sense, exact }]
        })
      })
    },
    findOccurrence(paperId, stream, word) {
      const occurrence = readOtterOccurrence(stream, word)
      if (!occurrence) return null
      const { leaf, sentence, sentenceNumber } = occurrence
      const start = [...sentence.slice(0, occurrence.start).trimStart()].length
      const end = start + [...word.surface].length
      const positions = occurrences.get(occurrenceKey(paperId, stream.groupId, leafLocator(leaf)))
      const match = positions?.get(occurrenceKey(sentenceNumber, start, end, word.surface))
      if (!match) return null
      const entry = entryById(match.entryId)
      return entry?.senses.some(sense => sense.senseId === match.senseId)
        ? { entry, senseId: match.senseId }
        : null
    },
  }
}
