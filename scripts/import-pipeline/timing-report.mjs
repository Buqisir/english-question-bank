#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const defaultRoot = path.resolve(import.meta.dirname, '../..')
const json = (file) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
const seconds = (value) => Number.isFinite(value) ? `${value.toFixed(1)}s` : '无记录'

export function readTimeline(file) {
  if (!existsSync(file)) return []
  // A running writer can leave a partial last line; keep all complete receipts.
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
}

export function grouped(rows, key, fields) {
  const groups = new Map()
  for (const row of rows) {
    const name = row[key] || 'unknown'
    const group = groups.get(name) || { label: name, count: 0 }
    group.count++
    for (const field of fields) {
      if (Number.isFinite(row[field])) group[field] = (group[field] || 0) + row[field]
    }
    groups.set(name, group)
  }
  return [...groups.values()]
}

export function paperReport(root, paperId) {
  if (!/^paper-[a-z0-9-]+$/u.test(paperId || '')) throw new Error('需要有效的 paperId')
  const fast = path.join(root, 'imports/ocr-proofread', paperId, 'fast')
  const state = json(path.join(fast, 'state.json'))
  const rows = []
  const add = (section, entries) => {
    if (!entries.length) rows.push([section, '无记录', ''])
    else rows.push(...entries.map(([label, detail]) => [section, label, detail]))
  }
  add('脚本步骤', Object.entries(state?.steps || {}).map(([label, step]) =>
    [label, `${seconds(step.seconds)}${step.finishedAt ? '' : '（未完成）'}`]))
  const agents = readTimeline(path.join(fast, 'agent-timeline.jsonl'))
  const pending = agents.filter((row) => row.event === 'started'
    && !agents.some((end) => end.event === 'finished' && end.log === row.log))
  add('AI 阶段', [...grouped(agents.filter((row) => row.event === 'finished'), 'label', ['seconds'])
    .map((row) => [row.label, `${row.count} 次 / ${seconds(row.seconds)}`]),
  ...pending.map((row) => [row.label, '未完成（仅起始记录）'])])
  add('模型槽', grouped(readTimeline(path.join(fast, 'slot-timeline.jsonl')), 'job', ['waitSeconds', 'runSeconds'])
    .map((row) => [row.label, `${row.count} 次 / 等待 ${seconds(row.waitSeconds)} / 运行 ${seconds(row.runSeconds)}`]))
  add('生产锁', grouped(readTimeline(path.join(fast, 'production-timeline.jsonl')), 'label', ['lockWaitSeconds', 'gapWaitSeconds'])
    .map((row) => [row.label, `${row.count} 次 / 等锁 ${seconds(row.lockWaitSeconds)} / 间隔 ${seconds(row.gapWaitSeconds)}`]))
  add('上传', readTimeline(path.join(fast, 'upload-timeline.jsonl')).map((row) =>
    [row.startedAt, `manifest ${row.manifestFiles} / 实传 ${row.uploadedFiles} / ${row.uploadedBytes} bytes / PUT ${seconds(row.putSeconds)} (${row.putMode}) / finalize ${seconds(row.finalizeSeconds)}${row.completed ? '' : '（未完成）'}`]))
  return [paperId, '类别 | 阶段 | 耗时 / 明细', ...rows.map((row) => row.join(' | '))].join('\n')
}

export function batchRow(root, paperId) {
  if (!/^paper-[a-z0-9-]+$/u.test(paperId || '')) throw new Error('需要有效的 paperId')
  const fast = path.join(root, 'imports/ocr-proofread', paperId, 'fast')
  const total = (rows, field) => {
    const values = rows.map((row) => row[field]).filter(Number.isFinite)
    return seconds(values.length ? values.reduce((sum, value) => sum + value, 0) : null)
  }
  const steps = Object.values(json(path.join(fast, 'state.json'))?.steps || {})
  const agents = readTimeline(path.join(fast, 'agent-timeline.jsonl')).filter((row) => row.event === 'finished')
  const slots = readTimeline(path.join(fast, 'slot-timeline.jsonl'))
  const production = readTimeline(path.join(fast, 'production-timeline.jsonl'))
  const uploads = readTimeline(path.join(fast, 'upload-timeline.jsonl'))
  return [paperId, total(steps, 'seconds'), total(agents, 'seconds'),
    `${total(slots, 'waitSeconds')} / ${total(slots, 'runSeconds')}`,
    `${total(production, 'lockWaitSeconds')} / ${total(production, 'gapWaitSeconds')}`,
    `${total(uploads, 'putSeconds')} / ${total(uploads, 'finalizeSeconds')}`].join(' | ')
}

export function main(args = process.argv.slice(2)) {
  const rootIndex = args.indexOf('--root')
  const root = rootIndex < 0 ? defaultRoot : path.resolve(args[rootIndex + 1])
  const batchIndex = args.indexOf('--batch')
  if (batchIndex < 0) {
    console.log(paperReport(root, args[0]))
    return
  }
  const batch = args[batchIndex + 1]
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,79}$/u.test(batch || '')) throw new Error('需要有效的批次名')
  const directory = path.join(root, 'imports/batch', batch)
  const state = json(path.join(directory, 'status.json'))
  const ids = new Set(Object.values(state?.papers || {}).map((paper) => paper.paperId).filter(Boolean))
  const queue = path.join(directory, 'queue')
  if (existsSync(queue)) {
    for (const file of readdirSync(queue).filter((file) => file.endsWith('.json'))) {
      const item = json(path.join(queue, file))
      if (item?.paperId) ids.add(item.paperId)
    }
  }
  console.log(ids.size ? [batch, 'paperId | 脚本累计 | AI 累计 | 槽等待 / 运行 | 生产等锁 / 间隔 | PUT / finalize',
    ...[...ids].map((id) => batchRow(root, id)), '累计为已记录阶段之和；并行阶段不代表墙钟总耗时。'].join('\n') : `${batch}：无记录`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
