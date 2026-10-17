// Tesseract `chi_sim+eng` reads the bold section headings of NCK1 papers as Latin garbage
// ("第二节（共5小题；…" → "Bo GES 小题；…", "第四部分 写作" → "SOMSTE"), so every proofreader
// would retype them. NCK1 has a fixed heading grammar, so the garbled prefix is rebuilt from the
// paper structure (ordinal = position within its part) and from evidence that survives OCR: the
// score tail kept from the original line, the question count read by a single-line `chi_sim`
// re-OCR, and the count implied by 满分 ÷ 每小题. Agreement of two count sources is required
// before a rebuilt line is offered without an uncertainty note.
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ORDINALS = ['一', '二', '三', '四']
const PART_NAMES = ['听力', '阅读', '语言运用', '写作']
const PART_NAME = /^(?:听力|阅读(?:理解)?|语言(?:知识)?运用|写作)$/u
const PART = /^第([一二三四])部分/u
const SECTION = /^第([一二])节/u
const compact = (text) => String(text).replace(/\s+/gu, '')

export function classifyHeading(text) {
  const line = compact(text)
  if (!line || line.length > 48 || /折算|考试时间|考试结束|总分|本试卷/u.test(line)) return null
  const part = PART.exec(line)
  if (part) return { kind: 'part', ok: true, ordinal: ORDINALS.indexOf(part[1]) }
  const section = SECTION.exec(line)
  if (section && /分/u.test(line)) return { kind: 'section', ok: true, ordinal: ORDINALS.indexOf(section[1]) }
  if (/共[两二三四]节/u.test(line) && /满分\d+分/u.test(line)) return { kind: 'part', ok: false }
  if (/每小题[\d.]+分|满分[\d.]+分/u.test(line)) return { kind: 'section', ok: false }
  return null
}

// OCR drops the decimal point of "2.5分" often enough that 每小题 × 题数 must reproduce 满分;
// a per-question score is read as tenths only when that is what makes the arithmetic close.
// Sections hold 3–20 questions, which rules out coincidences such as 15 ÷ 15.
function score(raw) {
  const each = /每小题(\d+(?:\.\d+)?)分/u.exec(raw)?.[1]
  const total = Number(/满分(\d+(?:\.\d+)?)分/u.exec(raw)?.[1])
  if (!each || !(total > 0)) return null
  const readings = [each, ...(/^\d{2}$/u.test(each) ? [`${each[0]}.${each[1]}`] : [])]
  for (const reading of readings) {
    const count = total / Number(reading)
    if (Number.isInteger(count) && count >= 3 && count <= 20) return { each, reading, count: String(count) }
  }
  return null
}

function counts(raw, observed, fromScore) {
  const fromRaw = /(?<![\d.])(\d{1,2})小题/u.exec(raw.slice(0, raw.search(/每小题|$/u)))?.[1]
  const fromReocr = /共(\d{1,2})[小个]/u.exec(observed || '')?.[1]
  return [['原行', fromRaw], ['重识别', fromReocr], ['分值', fromScore]]
    .filter(([, value]) => value && Number(value) >= 3 && Number(value) <= 20)
}

export function rebuildSection(raw, ordinal, observed) {
  const line = compact(raw)
  const name = `第${ORDINALS[ordinal]}节`
  const scoreAt = line.search(/每小题/u)
  if (scoreAt === -1) {
    // Writing sections carry no per-question score: "第二节（满分25分）".
    const totalAt = line.search(/满分/u)
    if (totalAt === -1) return null
    return { text: `${name}（${line.slice(totalAt)}`, sources: [] }
  }
  const scored = score(line)
  const sources = counts(line, observed, scored?.count)
  const values = [...new Set(sources.map(([, value]) => value))]
  const agreed = values.find((value) => sources.filter(([, other]) => other === value).length >= 2)
  const count = agreed || (values.length === 1 ? values[0] : null)
  if (!count) return null
  const separator = /小题([；;：:，,、])每小题/u.exec(line)?.[1] || '；'
  let tail = line.slice(scoreAt)
  const notes = []
  if (scored && scored.reading !== scored.each && scored.count === count) {
    tail = tail.replace(`每小题${scored.each}分`, `每小题${scored.reading}分`)
    notes.push(`每小题「${scored.each}分」按 ${count} 题 × ${scored.reading} 分 = 满分补回小数点`)
  }
  return {
    text: `${name}（共${count}小题${separator}${tail}`,
    sources,
    ...(notes.length ? { notes } : {}),
    ...(agreed ? {} : { uncertain: `题数 ${count} 只有${sources.map(([label]) => label).join('、')}一处依据，请对图核对` }),
  }
}

export function rebuildPart(raw, ordinal, observed) {
  const line = compact(raw)
  const tailAt = line.search(/共[两二三四]节/u)
  if (tailAt === -1) return null
  const read = /^第[一二三四]部分(.+?)[（(〈《【]/u.exec(compact(observed || ''))?.[1]
  const name = read && PART_NAME.test(read) ? read : PART_NAMES[ordinal]
  return {
    text: `第${ORDINALS[ordinal]}部分 ${name}（${line.slice(tailAt)}`,
    ...(read && PART_NAME.test(read) ? {} : { uncertain: `部分名称未能重识别，按第${ORDINALS[ordinal]}部分补为「${name}」，请对图核对` }),
  }
}

// One `chi_sim` single-line pass over the line box, widened to the left where a cut-off 「第」
// usually sits; a 2x upscale is tried when the first pass reads no count.
export async function reocrLine(imagePath, box) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'eqb-heading-'))
  try {
    const left = Math.max(0, box.left - 40)
    const top = Math.max(0, box.top - 8)
    const crop = path.join(temp, 'line.png')
    await execFileAsync('magick', [imagePath, '-crop', `${box.right - left + 8}x${box.bottom - top + 8}+${left}+${top}`, '+repage', crop])
    const read = async (file) => compact((await execFileAsync('tesseract', [file, 'stdout', '-l', 'chi_sim', '--psm', '7'],
      { env: { ...process.env, OMP_THREAD_LIMIT: '1' } })).stdout)
    const first = await read(crop)
    if (/共\d/u.test(first)) return first
    const large = path.join(temp, 'line-2x.png')
    await execFileAsync('magick', [crop, '-resize', '200%', large])
    const second = await read(large)
    return /共\d/u.test(second) ? second : first
  } catch {
    return null
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

// pages: question-source pages in order, each { key, imagePath, lines: [{ id, text, box }] } where
// text already excludes watermark words. Returns { [pageKey]: { [lineId]: repair } }.
export async function planHeadingRepairs(pages, reocr = reocrLine, concurrency = 4) {
  const jobs = []
  let part = -1
  let section = -1
  for (const page of pages) {
    for (const line of page.lines) {
      const heading = classifyHeading(line.text)
      if (!heading) continue
      if (heading.kind === 'part') {
        part = heading.ok ? heading.ordinal : Math.min(part + 1, 3)
        section = -1
      } else {
        if (part < 0) continue
        section = heading.ok ? heading.ordinal : Math.min(section + 1, 1)
      }
      if (!heading.ok) jobs.push({ page, line, kind: heading.kind, ordinal: heading.kind === 'part' ? part : section })
    }
  }
  const repairs = {}
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const { page, line, kind, ordinal } = jobs[next++]
      const observed = await reocr(page.imagePath, line.box)
      const rebuilt = kind === 'part' ? rebuildPart(line.text, ordinal, observed) : rebuildSection(line.text, ordinal, observed)
      if (rebuilt) (repairs[page.key] ||= {})[line.id] = { raw: line.text, observed, ...rebuilt }
    }
  }))
  return repairs
}
