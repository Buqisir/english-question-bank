#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function summarizePaginationTiming(report) {
  if (!report.timing?.candidates) return `${report.edition || 'unknown'} | 无 timing 记录`
  const { candidates, totalSeconds, chromiumLaunchMs } = report.timing
  const sum = field => candidates.reduce((total, row) => total + (row[field] || 0), 0)
  const mean = candidates.length ? sum('totalMs') / candidates.length : 0
  const maximum = Math.max(0, ...candidates.map(row => row.totalMs || 0))
  return `${report.edition} | ${candidates.length} | ${totalSeconds.toFixed(2)}s | ${mean.toFixed(2)}ms / ${maximum.toFixed(2)}ms | ${sum('queueWaitMs').toFixed(2)}ms | ${(chromiumLaunchMs || 0).toFixed(2)}ms`
}

export function main(args = process.argv.slice(2)) {
  if (!args[0]) throw new Error('Usage: pagination-timing.mjs <report.json | pagination directory>')
  const target = path.resolve(args[0])
  const files = statSync(target).isDirectory()
    ? readdirSync(target).map(edition => path.join(target, edition, 'report.json')).filter(existsSync)
    : [target]
  console.log(['版次 | 候选数 | 进程总时长 | 单候选平均 / 最大 | 排队合计 | Chromium 启动',
    ...files.map(file => summarizePaginationTiming(JSON.parse(readFileSync(file, 'utf8'))))].join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
