import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V2, TEXT_REVIEW_POLICY_V4 } from './spellingReview.mjs'

const editions = [
  ['cover8', '保留“英语”及考试说明 · 8 页（不含听力）', 8],
  ['cover10', '保留“英语”及考试说明 · 10 页（含听力）', 10],
  ['no-cover8', '去掉“英语”及考试说明 · 8 页（不含听力）', 8],
  ['no-cover10', '去掉“英语”及考试说明 · 10 页（含听力）', 10],
]
const longEditions = [
  ['cover-long10', '保留卷首 · 长卷最多 10 页（不含听力）', 10],
  ['cover-long12', '保留卷首 · 长卷最多 12 页（含听力）', 12],
  ['no-cover-long10', '去掉卷首 · 长卷最多 10 页（不含听力）', 10],
  ['no-cover-long12', '去掉卷首 · 长卷最多 12 页（含听力）', 12],
]
const productEditions = [
  ['economy8', '省纸八页版（不含听力）', 8],
  ['largeNoListening', '大字无听力版（最多 10 页）', 10],
  ['largeComplete', '大字完整版（含听力，最多 12 页）', 12],
]
const cell = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('|', '\\|').replaceAll('\n', '<br>')

function fail(message) { throw new Error(`PREPROCESSING_REPORT_INVALID: ${message}`) }

function verifiedFile(file, baseDirectory) {
  if (!file || typeof file.path !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(file.sha256 ?? '')) fail('file evidence requires path and SHA-256')
  const absolute = path.resolve(baseDirectory, file.path)
  if (sha256(new Uint8Array(readFileSync(absolute))) !== file.sha256) fail(`file evidence changed: ${file.path}`)
  return absolute
}

// This is an evidence report, never an approval or a substitute for visual QA.
// Source/answer/visual assertions are labelled as Agent records and must carry
// exact-candidate bindings plus retained, hash-checked evidence. Missing != PASS.
export function buildPreprocessingReport(projection, evidence, { baseDirectory = process.cwd() } = {}) {
  for (const key of ['paperId', 'sourceDigest', 'candidateDigest']) {
    if (!projection[key] || evidence?.[key] !== projection[key]) fail(`stale ${key}`)
  }
  if (!['preprocessing-handoff-evidence-v1', 'preprocessing-handoff-evidence-v2', 'preprocessing-handoff-evidence-v3'].includes(evidence.schemaVersion)) {
    fail('unsupported evidence version')
  }
  const longPaper = evidence.schemaVersion === 'preprocessing-handoff-evidence-v2'
  const products = evidence.schemaVersion === 'preprocessing-handoff-evidence-v3'
  const expectedEditions = products ? productEditions : longPaper ? longEditions : editions
  const editionLabel = products ? '三版' : '四版'
  const checked = (key) => {
    const check = evidence.checks?.[key]
    if (!check) return ['未检查', '没有本次检查记录']
    if (!['pass', 'not_performed', 'not_applicable'].includes(check.status)
      || typeof check.detail !== 'string' || !check.detail.trim()) fail(`invalid ${key} check`)
    if (check.status === 'pass') {
      if (!Number.isFinite(Date.parse(check.checkedAt)) || !Array.isArray(check.files) || !check.files.length) fail(`${key} PASS requires dated retained evidence`)
      check.files.forEach(file => verifiedFile(file, baseDirectory))
    }
    return [check.status === 'pass' ? '已完成（Agent 检查记录）' : check.status === 'not_applicable' ? '不适用／按约定不做' : '未做', check.detail]
  }
  const pdfs = evidence.pdfs ?? []
  if (!Array.isArray(pdfs) || new Set(pdfs.map(pdf => pdf.edition)).size !== pdfs.length
    || pdfs.some(pdf => !expectedEditions.some(([id]) => id === pdf.edition))) fail('invalid or duplicate PDF editions')
  if ((longPaper || products) && new Set(pdfs.map(pdf => pdf.sha256)).size !== pdfs.length) {
    fail('long-paper editions must have distinct PDF bytes')
  }
  if ((longPaper || products) && pdfs.length === expectedEditions.length) {
    for (const key of ['pdfContent', 'pdfVisual']) {
      if (evidence.checks?.[key]?.status !== 'pass'
        || pdfs.some(pdf => !evidence.checks[key].files?.some(file =>
          file.path === pdf.path && file.sha256 === pdf.sha256))) {
        fail(`long-paper ${key} PASS must bind every delivered PDF`)
      }
      checked(key)
    }
  }
  const pdfRows = expectedEditions.map(([id, label, pages]) => {
    const pdf = pdfs.find(item => item.edition === id)
    if (!pdf) return `| ${label} | 尚未生成 | — |`
    const file = verifiedFile(pdf, baseDirectory)
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
    const actualPages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1])
    const atMost = longPaper || (products && id !== 'economy8')
    if (!Number.isInteger(actualPages) || actualPages < 1 || (atMost ? actualPages > pages : actualPages !== pages)) {
      fail(`${id} page count differs from edition`)
    }
    return `| ${label} | [查看 PDF](${pathToFileURL(file).href}) | ${actualPages} |`
  })
  let screen = 'Screen：尚未提供本次精确 revision 的预览地址。'
  if (evidence.screen) {
    const url = new URL(evidence.screen.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || url.searchParams.get('view') !== 'paper-browse'
      || url.searchParams.get('paperId') !== projection.paperId
      || !evidence.screen.revisionId || url.searchParams.get('reviewRevision') !== evidence.screen.revisionId
      || [...url.searchParams.keys()].some(key => !['view', 'paperId', 'reviewRevision'].includes(key))
      || [...url.searchParams.keys()].length !== 3) fail('Screen URL must identify the exact paper/revision without credentials')
    screen = `[打开 Screen 预览](${url.href} "amp-portal") · revision：${cell(evidence.screen.revisionId)}。链接不等于已完成可视检查，请看下表。`
  }
  const spelling = projection.sourceInput.spellingReviewBytes
    ? JSON.parse(new TextDecoder().decode(projection.sourceInput.spellingReviewBytes)) : null
  const modern = [TEXT_REVIEW_POLICY_V2, TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V4].includes(spelling?.schemaVersion)
  const punctuationReview = [TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V4].includes(spelling?.schemaVersion)
  const corrections = spelling?.targets.flatMap(target => target.corrections.map(correction => ({ ...correction, jsonPointer: target.jsonPointer }))) ?? []
  const doubts = spelling?.targets.filter(target => target.decision === 'uncertain') ?? []
  const paragraphs = projection.paragraphSummaries?.groups.reduce((sum, group) => sum + group.paragraphs.length, 0)
  const metadata = projection.publicSearchMetadata?.groups.length
  const audio = projection.listeningReview?.audio
  const rows = [
    ['源材料提取与原文对照', ...checked('sourceExtraction')],
    ['官方答案抄录核对', ...checked('answerTranscription')],
    ['正文逐段摘要', paragraphs === undefined ? '未提供' : '已通过绑定校验', paragraphs === undefined ? '无当前候选卷的摘要记录' : `${paragraphs} 段`],
    ['结构化检索元数据', metadata === undefined ? '未提供' : '已通过绑定校验', metadata === undefined ? '无当前候选卷的元数据记录' : `${metadata} 组`],
    [spelling?.schemaVersion === TEXT_REVIEW_POLICY_V4 ? '全卷拼写、明确语法、重复空格、英文标点及选项尾空白审校' : punctuationReview ? '全卷拼写、明确语法、重复空格及英文标点审校' : modern ? '全卷拼写、明确语法及重复空格审校' : '全卷拼写专项', spelling ? '已完成并应用' : '尚未运行', spelling ? `${spelling.targets.length} 个文本目标；${corrections.length} 处修正；${doubts.length} 个保留疑点（不阻塞）` : '没有本卷审校记录，不能以通用代码完成代替本卷完成'],
    [modern ? '不地道表达、文风润色' : '不地道表达、语法润色', '按约定不做', '保留原文，不改写命题内容'],
    ['听力播放', ...checked('listeningPlayback')],
    ['听力语义核验', audio?.contentValidation === 'not_performed' ? '未做' : '未在本报告中验证', '播放、分段及答案抄录不等于音频语义核验'],
    ['Screen 排版及交互', ...checked('screenVisual')],
    [`${editionLabel} PDF 文件及页数`, pdfs.length === expectedEditions.length ? '已核对' : '尚未齐全', `${pdfs.length}/${expectedEditions.length} 份；仅核对文件哈希和实际页数，内容与可视结论以逐版 Agent 检查记录为准`],
    ['PDF 内容一致性', ...checked('pdfContent')],
    ['PDF 可视检查', ...checked('pdfVisual')],
    ['OCR', ...checked('ocr')],
  ]
  const categories = { spelling: '拼写', grammar: '明确语法', whitespace: '重复空格', punctuation: '英文标点与空格', terminal_whitespace: '选项尾部空白' }
  const correctionTable = corrections.length
    ? '| 文本定位 | 类别 | 原文 | 修正 | 原因 |\n| --- | --- | --- | --- | --- |\n' + corrections.map(c => `| ${[c.jsonPointer, categories[c.category], c.before.replaceAll(' ', '␠').replaceAll('\t', '⇥'), c.after.replaceAll(' ', '␠').replaceAll('\t', '⇥'), c.sourceParagraphLocator ? `${c.reason}（源段 ${c.sourceParagraphLocator}）` : c.reason].map(cell).join(' | ')} |`).join('\n') + '\n\n表中 ␠ 表示普通空格，⇥ 表示 tab，仅用于显示差异，不写入试卷。'
    : spelling ? '本次审校未应用文本修正。' : '尚未运行，不能据此断言没有错误。'
  return `# 校正报告与预处理完成表\n\n试卷：${cell(projection.paperId)}\n\nSource：\`${projection.sourceDigest}\`\n\nCandidate：\`${projection.candidateDigest}\`\n\n本报告只交付当前候选卷及检查记录，不代表批准、发布或部署。\n\n## ${editionLabel} PDF 与 Screen\n\n| 版本 | 文件 | 实际页数 |\n| --- | --- | ---: |\n${pdfRows.join('\n')}\n\n${screen}\n\n## 预处理完成表\n\n| 项目 | 状态 | 范围与限制 |\n| --- | --- | --- |\n${rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}\n\n## 已应用的文本修正\n\n${correctionTable}\n\n## 保留原文的疑点\n\n${doubts.length ? doubts.map(target => `- **${cell(target.jsonPointer)}**：${cell(target.note)}`).join('\n') : spelling ? '本次审校未记录疑点。' : '尚未审校，暂无可据以判断的清单。'}\n\n疑点保留原文，导题继续，不要求中途确认。可视、源对照等项目来自上述绑定的 Agent 检查记录；机器未独立证明其语义结论。\n`
}
