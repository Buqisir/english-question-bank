#!/usr/bin/env node
// Local projection only. Refresh production facts separately with batch-run.mjs snapshot.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inventoryMatch, paperNameKey, questionPdfNames } from './batch-run.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = (file, fallback = {}) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
const cleanName = (name) => name.replace(/^(?:（修订版）)?含[^：:]+[：:]/u, '')
const statuses = ['未导入', '本地进行中/卡住', '本地完成/待送审', '待 Owner 审', '生产上传未完成', '已审核通过', '缺材料', '本批不导：题型待支持', '已撤回/重复']
const passedStates = new Set(['approved', 'published'])
const pendingStates = new Set(['uploading', 'changes_requested', 'publishing'])
const knownProductionState = (state) => passedStates.has(state) || pendingStates.has(state) || state === 'awaiting_review'

export function parseExamMonth(name) {
  const text = String(name).normalize('NFKC')
  const monthPattern = '(\\d+|[一二三四五六七八九十]+)'
  const explicit = new RegExp(`(?<!\\d)(20\\d{2}|\\d{2})年\\s*${monthPattern}月`, 'u').exec(text)
  const monthNumber = (value) => /^\d+$/u.test(value) ? Number(value) : ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'].indexOf(value) + 1
  const format = (year, month) => month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : null
  if (explicit) return format(explicit[1].length === 2 ? 2000 + Number(explicit[1]) : Number(explicit[1]), monthNumber(explicit[2]))
  const month = new RegExp(`${monthPattern}月`, 'u').exec(text)
  if (!month) return null
  const n = monthNumber(month[1])
  const academic = /(?<!\d)(20\d{2})\s*[-—–]\s*(20\d{2})学年/u.exec(text)
  if (academic) return format(Number(academic[n >= 8 ? 1 : 2]), n)
  const cohort = /(?<!\d)(20\d{2}|\d{2})届/u.exec(text)
  // Cohort years are not exam years: autumn belongs to the preceding calendar year.
  if (cohort) return format((cohort[1].length === 2 ? 2000 + Number(cohort[1]) : Number(cohort[1])) - (n >= 8 ? 1 : 0), n)
  const year = /(?<!\d)(20\d{2}|\d{2})年/u.exec(text)
  return year ? format(year[1].length === 2 ? 2000 + Number(year[1]) : Number(year[1]), n) : null
}

export function classifyStatus({ production, submitted, local, answer, audio, listening, excluded }) {
  if (production) {
    if (passedStates.has(production.state)) return '已审核通过'
    if (production.state === 'awaiting_review') return '待 Owner 审'
    return '生产上传未完成'
  }
  if (submitted?.state === 'submitted' && submitted.revisionId) return '待 Owner 审'
  if (local?.state === 'local_ready') return '本地完成/待送审'
  if (local && !/withdrawn|duplicate/u.test(`${local.state} ${local.blocked?.kind || ''}`)) return '本地进行中/卡住'
  if (local) return '已撤回/重复'
  if (excluded) return '本批不导：题型待支持'
  if (!answer || (!audio && listening !== 'absent-by-exam-design')) return '缺材料'
  return '未导入'
}

export function compareRows(a, b) {
  return (b.examMonth || '').localeCompare(a.examMonth || '')
    || a.province.localeCompare(b.province, 'zh') || a.sourceDirectory.localeCompare(b.sourceDirectory, 'zh')
}

function scanInventory(base) {
  const entries = []
  const walk = (directory) => {
    const files = readdirSync(directory, { withFileTypes: true })
    const pdfs = files.filter((f) => f.isFile() && /\.pdf$/iu.test(f.name)).map((f) => f.name).sort()
    if (questionPdfNames(pdfs).length) {
      const key = path.relative(base, directory)
      const [prov, ...parts] = key.split(path.sep)
      entries.push({ key, prov, paper: parts.join('/'), pdfs,
        audio: files.filter((f) => f.isFile() && /\.(mp3|wav|m4a|aac|wma|flac|ogg)$/iu.test(f.name)).map((f) => f.name) })
    }
    for (const file of files) if (file.isDirectory()) walk(path.join(directory, file.name))
  }
  walk(base)
  return entries
}

export function buildRoster({ sourceRoot = process.env.EQB_BATCH_SOURCE_ROOT || path.join(os.homedir(), '导题2026届模拟题/2026届模拟题'),
  batchRoot = path.join(root, 'imports/batch'),
  cacheFile = path.join(os.homedir(), '.cache/eqbank/roster-sha-cache.json'),
  sourceDecisions = readJson(path.join(root, 'scripts/import-pipeline/guangdong-source-decisions-20261019.json')).sources || {} } = {}) {
  const snapshot = readJson(path.join(batchRoot, 'production-sources.json'))
  const known = Object.entries(snapshot.papers || {}).filter(([, p]) => !p.missingFromList).map(([id, p]) => [id, p, 'snapshot'])
  const ledger = Object.entries(readJson(path.join(batchRoot, 'submitted.json')).papers || {})
  const batches = []
  for (const dir of readdirSync(batchRoot, { withFileTypes: true })) {
    const file = path.join(batchRoot, dir.name, 'status.json')
    if (!dir.isDirectory() || !existsSync(file)) continue
    for (const paper of Object.values(readJson(file).papers || {})) batches.push({ ...paper, batch: dir.name })
  }
  const cache = readJson(cacheFile, { entries: {} })
  cache.entries ||= {}
  let hashReads = 0
  const hash = (file) => {
    const stat = statSync(file)
    const signature = `${stat.size}:${stat.mtimeMs}`
    if (cache.entries[file]?.signature === signature) return cache.entries[file].sha256
    hashReads++
    const sha256 = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
    cache.entries[file] = { signature, sha256 }
    return sha256
  }
  const rows = scanInventory(sourceRoot).map((entry) => {
    const key = entry.key
    const decision = sourceDecisions[key] || {}
    const questions = questionPdfNames(entry.pdfs)
    const hashes = questions.map((file) => hash(path.join(sourceRoot, key, file)))
    const localMatches = batches.filter((p) => p.item?.inventoryKey === key
      || (p.item?.question && questions.some((q) => path.resolve(sourceRoot, key, q) === path.resolve(p.item.question))))
    const local = localMatches.filter((p) => !/withdrawn|duplicate/u.test(`${p.state} ${p.blocked?.kind || ''}`)).at(-1) || localMatches.at(-1)
    const name = local?.paperName || cleanName(entry.paper)
    const names = [name, cleanName(entry.paper)].map(paperNameKey)
    const submission = ledger.find(([id, p]) => p.state === 'submitted' && p.revisionId
      && (localMatches.some((l) => l.paperId === id) || p.sha256?.some((h) => hashes.includes(h))))
    // prep uploads an approved OCR revision before materialization/submit. Its mere presence
    // in the Review list must not hide a blocked import as a completed production paper.
    const ocrOnly = known.find(([id, p]) => localMatches.some((l) => l.paperId === id
      && l.ocrRevisionId && p.latestRevisionId === l.ocrRevisionId && !l.revisionId))
    const eligible = known.filter(([id, p]) => id !== ocrOnly?.[0] && !p.notInventoryKeys?.includes(key))
    const mapped = inventoryMatch(eligible, key)
    // A submitted source-hash/queue match plus the exact production revision is stronger than
    // a name match, even when the production list itself has no source hashes.
    const revisionMatch = submission && eligible.find(([id, p]) => id === submission[0] && p.latestRevisionId === submission[1].revisionId)
    const exact = mapped?.confirmed ? mapped.entry : eligible.find(([, p]) => p.sha256?.some((h) => hashes.includes(h))) || revisionMatch
    const suspect = exact ? null : (mapped?.entry || eligible.find(([, p]) => p.paperName && names.includes(paperNameKey(p.paperName))))
    const production = exact || suspect
    const productionEntry = (production || ocrOnly)?.[1]
    const answer = entry.pdfs.some((f) => /答案|解析/u.test(f))
    const audio = entry.audio.length > 0
    const notes = []
    const needsConfirmation = []
    if (productionEntry && !knownProductionState(productionEntry.state)) {
      needsConfirmation.push(`未知生产 state：${productionEntry.state ?? '缺失'}，需人工确认`)
    }
    if (production && !passedStates.has(productionEntry.state) && productionEntry.state !== 'awaiting_review') {
      notes.push(`生产尚未完成：state=${productionEntry.state ?? '缺失'}`)
    }
    if (submission && !production) notes.push('本地已有送审 revision，生产快照尚未确认')
    if (ocrOnly) notes.push(`生产仅有 OCR revision ${ocrOnly[1].latestRevisionId}，尚未完成送审；保留本地进度`)
    if (local?.state === 'local_ready') notes.push('local_ready：仅完成本机隔离验收，尚未生产送审')
    if (suspect) needsConfirmation.push(`疑似生产匹配：${suspect[0]}（仅${mapped ? '可能目录映射' : '规范化卷名'}，需人工确认）`)
    if (!answer) notes.push('缺答案')
    if (decision.note) notes.push(decision.note)
    if (decision.listening === 'absent-by-exam-design') notes.push('原卷设计无听力（Owner 已核对，不是缺音频推断）')
    else if (!audio && !decision.excluded) notes.push('缺音频；尚无原卷设计无听力的明确声明')
    if (key.includes('含新版听力')) notes.push('含新版听力')
    if (key.includes('真题')) notes.push('真题：按 intake 规则不进入模拟卷导入')
    if (questions.length > 1) notes.push(`题卷 ${questions.length} 个版本（按一套计）`)
    if (local?.blocked) {
      const reason = local.blocked.reason?.replace(/\s+/gu, ' ') || ''
      const codes = [...new Set(reason.match(/NCK1_[A-Z_]+/gu) || [])]
      notes.push(`${local.blocked.kind}：${reason.slice(0, 220)}${reason.length > 220 ? '…' : ''}`)
      if (codes.length) notes.push(`阻塞项：${codes.join('、')}`)
    }
    const provenance = local?.item?.provenance
    const identityMonth = provenance?.year && provenance?.month && provenance.month >= 1 && provenance.month <= 12
      ? `${provenance.year}-${String(provenance.month).padStart(2, '0')}` : null
    const folderMonth = parseExamMonth(entry.paper)
    const examMonth = identityMonth || decision.examMonth || parseExamMonth(local?.paperName || '') || folderMonth
    if (!examMonth) needsConfirmation.push('考试年月未知（仅有届别/考试轮次不猜日期）')
    if (identityMonth && folderMonth && identityMonth !== folderMonth) notes.push(`目录年月 ${folderMonth}；采用批次首页核对年月 ${identityMonth}`)
    if (localMatches.length > 1) notes.push(`合并 ${localMatches.length} 条批次记录，优先保留有效进度`)
    notes.push(...needsConfirmation)
    const status = classifyStatus({ production: production?.[1], submitted: submission?.[1], local, answer, audio, ...decision })
    return { province: entry.prov.replace(/模拟题$/u, ''), examMonth, examName: cleanName(name),
      sourceDirectory: key, inventoryKey: key, materials: { question: true, answer, audio, questionVersions: questions.length },
      status, productionPaperId: production?.[0] || ocrOnly?.[0] || '',
      productionState: productionEntry?.state ?? null, productionRevisionId: productionEntry?.latestRevisionId ?? null,
      revisionId: productionEntry ? productionEntry.latestRevisionId ?? null : submission?.[1].revisionId || local?.revisionId || '',
      paperId: local?.paperId || submission?.[0] || '', batch: local?.batch || '', match: exact ? (mapped?.confirmed ? 'inventoryKey' : exact === revisionMatch ? 'submittedRevision' : 'sha256') : suspect ? 'suspected' : ocrOnly ? 'ocrOnly' : null,
      notes, needsConfirmation, questionSha256: hashes }
  }).sort(compareRows).map((row, i) => ({ number: i + 1, ...row }))
  // Detect identical question bytes across directories without conflating versions or deleting rows.
  const duplicates = new Map()
  for (const row of rows) for (const h of new Set(row.questionSha256)) {
    if (!duplicates.has(h)) duplicates.set(h, [])
    duplicates.get(h).push(row)
  }
  for (const group of duplicates.values()) if (group.length > 1) for (const row of group) {
    const note = `疑似重复源题卷：${group.filter((r) => r !== row).map((r) => r.sourceDirectory).join('；')}`
    if (!row.notes.includes(note)) { row.notes.push(note); row.needsConfirmation.push(note) }
  }
  mkdirSync(path.dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)
  const byStatus = Object.fromEntries(statuses.map((s) => [s, rows.filter((r) => r.status === s).length]))
  const byProvince = Object.fromEntries([...new Set(rows.map((r) => r.province))].sort((a, b) => a.localeCompare(b, 'zh')).map((p) => [p,
    { total: rows.filter((r) => r.province === p).length, unimported: rows.filter((r) => r.province === p && r.status === '未导入').length,
      missing: rows.filter((r) => r.province === p && r.status === '缺材料').length }]))
  return { generatedAt: new Date().toISOString(), sourceRoot, snapshotCapturedAt: snapshot.capturedAt || null,
    total: rows.length, byStatus, byProvince, hashReads,
    unmappedProduction: known.filter(([id]) => !rows.some((r) => r.productionPaperId === id))
      .map(([paperId, p]) => ({ paperId, paperName: p.paperName, state: p.state, latestRevisionId: p.latestRevisionId ?? null,
        status: classifyStatus({ production: p }), needsConfirmation: !knownProductionState(p.state), note: p.note })),
    rows }
}

const columns = [['number', '序号'], ['province', '省份'], ['examMonth', '考试年月'], ['examName', '考试名'], ['sourceDirectory', '源目录'],
  ['materialsText', '材料'], ['status', '状态'], ['productionStateText', '生产状态'], ['productionPaperId', '生产卷号'], ['revisionId', 'revision'], ['notesText', '备注']]
const display = (row) => ({ ...row, examMonth: row.examMonth || '未知',
  productionStateText: row.productionPaperId ? `${row.productionState ?? '未知'} / latestRevisionId=${row.productionRevisionId ?? 'null'}` : '',
  materialsText: `题卷 ${row.materials.questionVersions} 版 / 答案${row.materials.answer ? '有' : '无'} / 音频${row.materials.audio ? '有' : '无'}`,
  notesText: row.notes.join('；') })
export function writeRoster(result, batchRoot = path.join(root, 'imports/batch')) {
  const csvCell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  writeFileSync(path.join(batchRoot, 'roster.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(batchRoot, 'roster.csv'), `\ufeff${[columns.map(([, label]) => label), ...result.rows.map((r) => columns.map(([key]) => display(r)[key]))].map((line) => line.map(csvCell).join(',')).join('\n')}\n`)
  const escape = (v) => String(v ?? '').replaceAll('|', '\\|').replace(/\r?\n/gu, ' ')
  const table = (rows) => [columns.map(([, label]) => label), columns.map(() => '---'),
    ...rows.map((r) => columns.map(([key]) => display(r)[key]))].map((line) => `| ${line.map(escape).join(' | ')} |`).join('\n')
  const md = ['# 模拟题导入名单', '', `生成：${result.generatedAt}；生产快照：${result.snapshotCapturedAt || '无'}。考试年月新→旧，同月按省份；未知日期排最后。`,
    '', '生产状态列保留快照原始 state 与 latestRevisionId；approved / published 为已审核通过，awaiting_review 为待 Owner 审，其它状态注明原值，未知值需人工确认。仅有 OCR revision 的卷保留本地进度，不计为整卷审核通过。原卷设计无听力须有明确声明；未声明而缺音频仍是缺材料。本批不导单列，不计缺材料。高二卷在备注中标明，不计入 2026 届高三模拟。', '',
    '| 统计 | 数量 |', '| --- | --- |', `| 总数 | ${result.total} |`, ...Object.entries(result.byStatus).map(([s, n]) => `| ${s} | ${n} |`),
    '', '## 各省未导入数量', '', '| 省份 | 总数 | 未导入 | 缺材料（另计） |', '| --- | --- | --- | --- |',
    ...Object.entries(result.byProvince).map(([p, n]) => `| ${p} | ${n.total} | ${n.unimported} | ${n.missing} |`)]
  for (const [heading, values] of [['未导入', ['未导入']], ['本地卡住 / 进行中', ['本地进行中/卡住']],
    ['本地完成 / 待送审', ['本地完成/待送审']],
    ['待 Owner 审', ['待 Owner 审']], ['生产上传未完成', ['生产上传未完成']], ['已审核通过', ['已审核通过']], ['缺材料 / 重复', ['缺材料', '已撤回/重复']], ['本批不导', ['本批不导：题型待支持']]]) {
    const rows = result.rows.filter((r) => values.includes(r.status))
    md.push('', `## ${heading}（${rows.length}）`, '', rows.length ? table(rows) : '无')
  }
  const uncertain = result.rows.filter((r) => r.needsConfirmation.length)
  md.push('', `## 需人工确认（${uncertain.length}）`, '',
    ...uncertain.map((r) => `- #${r.number} ${escape(r.sourceDirectory)}：${escape(r.needsConfirmation.join('；'))}`))
  for (const p of result.unmappedProduction.filter((p) => p.needsConfirmation)) {
    md.push(`- ${escape(p.paperName)}（${p.paperId}）：未知生产 state=${escape(p.state ?? '缺失')}，需人工确认`)
  }
  if (result.unmappedProduction.length) md.push('', '## 这些卷在生产里，但源目录里找不到对应文件夹（可能来自其它来源），不影响未导入清单', '',
    ...result.unmappedProduction.map((p) => `- ${escape(p.paperName)}（${p.paperId}）：${p.status}；state=${escape(p.state ?? '未知')}；latestRevisionId=${escape(p.latestRevisionId ?? 'null')}；${escape(p.note || '缺少源文件或目录映射依据')}`))
  writeFileSync(path.join(batchRoot, 'roster.md'), `${md.join('\n')}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = buildRoster()
  writeRoster(result)
  console.log(JSON.stringify({ total: result.total, byStatus: result.byStatus, byProvince: result.byProvince,
    hashReads: result.hashReads, needsConfirmation: result.rows.filter((r) => r.needsConfirmation.length).length,
    markdown: path.join(root, 'imports/batch/roster.md') }, null, 2))
}
