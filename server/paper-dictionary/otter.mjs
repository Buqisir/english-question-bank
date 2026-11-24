import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { splitSentences } from '../../shared/paper-selection/segmentation.mjs'

const normalize = (text) => text.normalize('NFC').trim()
const cleanExample = (text) => text.trim().replace(/^(?:[■□●○•▪▫‣◦]\s*)+/, '')
const normalizeSentence = (text) => cleanExample(normalize(text)).replace(/\s+/g, ' ').replace(/ +([.,!?])/g, '$1')
const occurrenceKey = (...parts) => JSON.stringify(parts)

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

function prepareEntry(entry) {
  for (const sense of entry.senses) {
    for (const example of sense.examples) {
      example.text = cleanExample(example.text)
      const { paperId, paperTitle, groupId } = example.source
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

export function openOtterDictionary(rootDir) {
  const dir = path.join(rootDir, 'data', 'otter-dictionary')
  const entriesDir = path.join(dir, 'entries')
  const entries = readOptional(() => readdirSync(entriesDir), [])
    .filter(name => name.endsWith('.json')).sort()
    .map(name => prepareEntry(JSON.parse(readFileSync(path.join(entriesDir, name), 'utf8'))))
  const headwords = new Map(entries.map(entry => [normalize(entry.headword), entry]))
  const aliases = new Map()
  for (const entry of entries) {
    for (const form of [entry.headword, ...entry.variants, ...entry.forms.map(item => item.form)]) {
      const key = normalize(form).toLowerCase()
      aliases.set(key, !aliases.has(key) || aliases.get(key) === entry ? entry : null)
    }
  }
  const occurrences = new Map()
  const mapFile = path.join(dir, 'occurrence-senses.ndjson')
  const rows = readOptional(() => readFileSync(mapFile, 'utf8'), '').trim()
  for (const line of rows ? rows.split('\n') : []) {
    const row = JSON.parse(line)
    const key = occurrenceKey(row.paperId, row.groupId, row.paragraphId ?? row.questionId,
      row.sentence, row.start, row.end, row.surface, row.entryId)
    occurrences.set(key, row.senseId)
  }
  return {
    available: entries.length > 0,
    find(surface) {
      const key = normalize(surface)
      return headwords.get(key) ?? aliases.get(key.toLowerCase()) ?? null
    },
    match(entry, paperId, stream, word) {
      const leaf = stream.leaves.find(item => item.start <= word.start && item.end >= word.end)
      if (!leaf) return null
      const text = stream.text.slice(leaf.start, leaf.end)
      const sentences = splitSentences(text)
      const index = sentences.findIndex(item => item.start <= word.start - leaf.start && item.end >= word.end - leaf.start)
      if (index < 0) return null
      const sentence = sentences[index]
      const start = [...text.slice(sentence.start, word.start - leaf.start).trimStart()].length
      const end = start + [...word.surface].length
      const locator = leaf.kind === 'option' ? leaf.id.replace(/:([^:]+)$/, '#option=$1') : leaf.id
      const key = occurrenceKey(paperId, stream.groupId, locator, index + 1, start, end, word.surface, entry.entryId)
      const senseId = occurrences.get(key)
      if (entry.senses.some(sense => sense.senseId === senseId)) return senseId
      const sentenceText = normalizeSentence(sentence.text)
      const matches = entry.senses.filter(sense => sense.examples.some(example =>
        normalizeSentence(example.text) === sentenceText))
      return matches.length === 1 ? matches[0].senseId : null
    },
  }
}
