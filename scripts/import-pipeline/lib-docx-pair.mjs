/**
 * Format ③ (试题 DOCX + 答案解析 DOCX) parse helpers.
 * Answers come from the compact key block above 【答案解析】.
 */
import { normalizePassageText } from '../../server/paper-import-ai/normalizePassageText.mjs'

const pad = (n) => String(n).padStart(3, '0')
const READING_RANGES = [
  { letter: 'a', from: 21, to: 23 },
  { letter: 'b', from: 24, to: 27 },
  { letter: 'c', from: 28, to: 31 },
  { letter: 'd', from: 32, to: 35 },
]

export function paperTail(paperId) {
  return paperId.replace(/^paper-/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

export function stripBidi(text) {
  return String(text).replace(/[\u200e\u200f\u202a-\u202e\ufeff\u000c]/g, '')
}

function splitParas(text) {
  return String(text)
    .split(/\n+/)
    .map((t) => t.replace(/[　]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter((t) => t.length > 1)
}

function sliceBetween(text, startRe, endRe) {
  const start = text.search(startRe)
  if (start < 0) throw new Error(`未找到起始: ${startRe}`)
  const rest = text.slice(start)
  const end = rest.search(endRe)
  return end < 0 ? rest : rest.slice(0, end)
}

/**
 * Copy 21–65 keys from the compact key block above 【答案解析】.
 */
export function parseDocxPairAnswerKeys(answersText) {
  const keyBlock = stripBidi(answersText).split('【答案解析】')[0]
  const keys = {}
  for (const match of keyBlock.matchAll(/(\d{2})-(\d{2})\s+([A-Ga-g]+)/g)) {
    const from = Number(match[1])
    const to = Number(match[2])
    const letters = match[3].toUpperCase()
    if (to - from + 1 !== letters.length) {
      throw new Error(`答案区间 ${from}-${to} 与字母串 ${letters} 长度不符`)
    }
    for (let i = 0; i < letters.length; i += 1) keys[from + i] = letters[i]
  }
  for (const match of keyBlock.matchAll(/(\d{2})\.\s+([^\t\n]+)/g)) {
    const no = Number(match[1])
    if (no < 56 || no > 65) continue
    keys[no] = match[2].replace(/[ \t]+/g, ' ').replace(/[。．.]+$/, '').trim()
  }
  const missing = []
  for (let no = 21; no <= 65; no += 1) {
    if (!keys[no]) missing.push(no)
  }
  if (missing.length > 0) {
    throw new Error(`答案解析缺键: ${missing.join(', ')}`)
  }
  return keys
}

function parseMcqOptions(block) {
  const joined = block.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim()
  const options = {}
  const re = /(?:^|\s)([A-D])(?:[．.]|\s)\s*(.*?)(?=(?:\s+[A-D](?:[．.]|\s))|$)/g
  let match
  while ((match = re.exec(joined))) {
    options[match[1]] = normalizePassageText(match[2].trim())
  }
  return options
}

function parseNumberedMcqs(section, from, to) {
  const questions = []
  for (let no = from; no <= to; no += 1) {
    const start = section.search(new RegExp(`^${no}\\.\\s*`, 'm'))
    if (start < 0) throw new Error(`未找到第 ${no} 题`)
    const after = section.slice(start)
    const next = after.search(new RegExp(`\\n${no + 1}\\.\\s*`))
    const block = (next < 0 ? after : after.slice(0, next)).trim()
    const optionStart = block.search(/(?:^|\s)[A-D](?:[．.]|\s)/)
    const optionBlock = optionStart < 0 ? '' : block.slice(optionStart)
    const options = parseMcqOptions(optionBlock)
    if (Object.keys(options).length !== 4) {
      throw new Error(`第 ${no} 题选项不是 4 个: ${Object.keys(options).join('') || '(空)'} | ${block.slice(0, 120)}`)
    }
    const stemLine = block.split('\n')[0].replace(new RegExp(`^${no}\\.\\s*`), '').trim()
    const stem = optionStart > 0
      ? normalizePassageText(block.slice(0, optionStart).replace(new RegExp(`^${no}\\.\\s*`), '').trim())
      : normalizePassageText(stemLine)
    questions.push({ no, stem, options })
  }
  return questions
}

function buildReadingGroups(readingSection, tail) {
  return READING_RANGES.map(({ letter, from, to }, i) => {
    const headerRe = new RegExp(`^${letter.toUpperCase()}\\s*$`, 'm')
    const header = readingSection.search(headerRe)
    if (header < 0) throw new Error(`阅读 ${letter.toUpperCase()} 未找到篇目标题行`)
    const qStart = readingSection.search(new RegExp(`^${from}\\.\\s*`, 'm'))
    if (qStart < 0) throw new Error(`阅读 ${letter.toUpperCase()} 未找到第 ${from} 题`)
    const passageRaw = readingSection.slice(header, qStart).replace(headerRe, '').trim()
    const paragraphs = splitParas(passageRaw)
      .filter((t) => !/^第[一二三四]/.test(t) && !/^第一节/.test(t) && !/^阅读下列/.test(t))
      .map((text, k) => ({
        id: `para-${tail}-reading-${letter}-${k + 1}`,
        text: normalizePassageText(text),
      }))
    if (paragraphs.length === 0) throw new Error(`阅读 ${letter.toUpperCase()} 段落为空`)
    const nextLetter = READING_RANGES[i + 1]
    const qEnd = nextLetter
      ? readingSection.search(new RegExp(`^${nextLetter.letter.toUpperCase()}\\s*$`, 'm'))
      : readingSection.length
    if (qEnd < qStart) throw new Error(`阅读 ${letter.toUpperCase()} 题区边界无效`)
    const parsed = parseNumberedMcqs(readingSection.slice(qStart, qEnd), from, to)
    return {
      groupId: `group-${tail}-reading-${letter}`,
      title: `Reading ${letter.toUpperCase()}`,
      order: i,
      paragraphs,
      questions: parsed.map((q) => ({
        id: `q-${tail}-${pad(q.no)}`,
        questionNo: String(q.no),
        stem: q.stem,
        options: q.options,
        answerKey: '',
      })),
    }
  })
}

function buildSeven(section, tail) {
  let body = section.replace(/^[\s\S]*?选项中有两项为多余选项。\s*/, '')
  const optStart = body.search(/^[A-G][．.]\s+/m)
  if (optStart < 0) throw new Error('七选五: 未找到 A–G 选项')
  const passage = body.slice(0, optStart).replace(/_{3,}(\d{2})_{3,}/g, '__$1__')
  const paragraphs = splitParas(passage)
    .filter((t) => !/^第二节/.test(t) && !/^阅读下面短文/.test(t))
    .map((text, i) => ({
      id: `para-${tail}-seven-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(text),
    }))
  const optionBank = []
  const seen = new Set()
  for (const match of body.slice(optStart).matchAll(/^([A-G])[．.]\s*(.+)$/gm)) {
    let label = match[1]
    const text = normalizePassageText(match[2].trim())
    if (seen.has(label)) {
      const missing = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].find((item) => !seen.has(item))
      if (!missing) throw new Error('七选五选项标签重复且无法改写为 A–G')
      label = missing
    }
    seen.add(label)
    optionBank.push({ label, text })
  }
  optionBank.sort((a, b) => a.label.localeCompare(b.label))
  if (optionBank.length !== 7) {
    throw new Error(`七选五 optionBank 期望 7，实际 ${optionBank.length}`)
  }
  const questions = Array.from({ length: 5 }, (_, i) => {
    const no = 36 + i
    return {
      id: `q-${tail}-${pad(no)}`,
      stem: String(no),
      answerKey: '',
      blankId: `blank-${tail}-${pad(no)}`,
    }
  })
  return {
    groupId: `group-${tail}-seven-choices`,
    groupType: 'sevenChoices',
    title: '七选五',
    order: 4,
    paragraphs,
    optionBank,
    questions,
    blankIds: questions.map((q) => q.blankId),
  }
}

function buildCloze(section, tail) {
  let body = section.replace(/^[\s\S]*?最佳选项。\s*/, '')
  const firstQ = body.search(/^41\.\s+/m)
  if (firstQ < 0) throw new Error('完形填空: 未找到第 41 题')
  const passage = body.slice(0, firstQ).replace(/__64__/g, '__54__')
  const paragraphs = splitParas(passage)
    .filter((t) => !/^第[一二三四]/.test(t) && !/^第一节/.test(t) && !/^阅读下面短文/.test(t))
    .map((text, i) => ({
      id: `para-${tail}-cloze-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(text),
    }))
  const parsed = parseNumberedMcqs(body, 41, 55)
  return {
    groupId: `group-${tail}-cloze`,
    groupType: 'cloze',
    title: '完形填空',
    order: 5,
    paragraphs,
    questions: parsed.map((q) => ({
      id: `q-${tail}-${pad(q.no)}`,
      stem: String(q.no),
      answerKey: '',
      blankId: `blank-${tail}-${pad(q.no)}`,
      options: q.options,
    })),
    blankIds: parsed.map((q) => `blank-${tail}-${pad(q.no)}`),
  }
}

function buildGrammar(section, tail) {
  let body = section.replace(/^[\s\S]*?正确形式。\s*/, '')
  const hints = {}
  const passage = body.replace(
    /(\d{2})\.{0,1}_{3,}(?:\(([A-Za-z]+)\))?/g,
    (_, no, hint) => {
      const num = Number(no)
      if (hint) hints[num] = hint
      return `__${num}__${hint ? ` (${hint})` : ''}`
    },
  )
  const paragraphs = splitParas(passage)
    .filter((t) => !/^第[一二三四]/.test(t) && !/^第二节/.test(t) && !/^阅读下面短文/.test(t))
    .map((text, i) => ({
      id: `para-${tail}-grammar-fill-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(text),
    }))
  const questions = Array.from({ length: 10 }, (_, i) => 56 + i).map((no) => ({
    id: `q-${tail}-${pad(no)}`,
    stem: String(no),
    answerKey: '',
    blankId: `blank-${tail}-${pad(no)}`,
    prompt: hints[no] || null,
  }))
  return {
    groupId: `group-${tail}-grammar-fill`,
    groupType: 'grammarFill',
    title: '语法填空',
    order: 6,
    paragraphs,
    questions,
    blankIds: questions.map((q) => q.blankId),
  }
}

function buildApplication(section, tail) {
  const body = section
    .replace(/^第[一二三四]部分[^\n]*\n?/, '')
    .replace(/^第[一二]节[^\n]*\n?/, '')
  const lines = splitParas(body)
  const given = lines.find((t) => /^Should the Badminton/.test(t)) || null
  const paragraphs = lines
    .filter((t) => {
      if (/^注意/.test(t)) return false
      if (/^[\(（]\d+[\)）]/.test(t) && /词数|答题卡|格式/.test(t)) return false
      if (/请按如下格式/.test(t)) return false
      if (/^Should the Badminton/.test(t)) return false
      if (/^Good morning/.test(t)) return false
      if (/^Thank you for listening/.test(t)) return false
      if (/^_{3,}$/.test(t)) return false
      return t.length > 4
    })
    .map((text, i) => ({
      id: `para-${tail}-writing-app-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(text),
    }))
  return {
    groupId: `group-${tail}-writing-application`,
    groupType: 'writing',
    title: '应用文写作',
    order: 7,
    paragraphs,
    applicationGiven: given,
    questions: [],
  }
}

function buildContinuation(section, tail) {
  let body = section
    .replace(/^第[一二]节[^\n]*\n?/, '')
    .replace(/^阅读下面材料[^\n]*\n?/, '')
  const material = body.split(/注意：/)[0]
  const afterFormat = body.split(/请按如下格式[^\n]*\n/)[1] || ''
  const starters = afterFormat
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && /^[A-Z]/.test(l))
    .slice(0, 2)
    .map((text) => normalizePassageText(text))
  if (starters.length < 2) {
    throw new Error(`读后续写开头语不足 2 句，实际 ${starters.length}`)
  }
  const paragraphs = splitParas(material)
    .filter((t) => t.length > 4)
    .map((text, i) => ({
      id: `para-${tail}-writing-cont-${i === 0 ? 'title' : `p${i}`}`,
      text: normalizePassageText(text),
    }))
  return {
    groupId: `group-${tail}-writing-continuation`,
    groupType: 'writing',
    title: '读后续写',
    order: 8,
    paragraphs,
    continuationStarters: starters,
    questions: [],
  }
}

function injectAnswers(groups, keys) {
  for (const group of groups.readingGroups) {
    for (const q of group.questions) q.answerKey = keys[Number(q.questionNo)]
  }
  for (const q of groups.seven.questions) q.answerKey = keys[Number(q.stem)]
  for (const q of groups.cloze.questions) q.answerKey = keys[Number(q.stem)]
  for (const q of groups.grammar.questions) q.answerKey = keys[Number(q.stem)]
}

export function buildDocxPairGroups(paperText, answersText, paperId) {
  const text = stripBidi(paperText)
  const keys = parseDocxPairAnswerKeys(answersText)
  const tail = paperTail(paperId)
  const reading = sliceBetween(text, /第二部分\s*阅读/, /第二节\s*[（(]共5小题/)
  const seven = sliceBetween(text, /第二节\s*[（(]共5小题/, /第三部分\s*语言运用/)
  const cloze = sliceBetween(text, /第三部分\s*语言运用/, /第二节\s*[（(]共10小题/)
  const grammar = sliceBetween(text, /第二节\s*[（(]共10小题/, /第四部分\s*写作/)
  const application = sliceBetween(text, /第四部分\s*写作/, /第二节\s*[（(]满分25分/)
  const continuation = text.slice(text.search(/第二节\s*[（(]满分25分/))
  const groups = {
    paper: {
      paperId,
      sourceFilename: '',
      sourceHash: 'pending',
      sourceAssetVersion: 1,
    },
    readingGroups: buildReadingGroups(reading, tail),
    seven: buildSeven(seven, tail),
    cloze: buildCloze(cloze, tail),
    grammar: buildGrammar(grammar, tail),
    application: buildApplication(application, tail),
    continuation: buildContinuation(continuation, tail),
  }
  injectAnswers(groups, keys)
  return groups
}

export function extractOfficialWritingAnswers(answersText) {
  const keyBlock = stripBidi(answersText).split('【答案解析】')[0]
  const app = keyBlock.match(/参考范文\s*一[\s\S]*?(Should the Badminton[\s\S]*?Thank you for listening!)/)
  const cont = keyBlock.match(/第二节\(读后续写\)\s*参考范文[^\n]*\n([\s\S]+)$/)
  return {
    application: app?.[1]?.trim() || null,
    continuation: cont?.[1]?.trim() || null,
  }
}
