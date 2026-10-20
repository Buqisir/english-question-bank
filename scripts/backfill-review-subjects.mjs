#!/usr/bin/env node
import path from 'node:path'
import { existsSync, realpathSync, statfsSync } from 'node:fs'
import { backfillReviewSubjects } from '../server/import-review/reviewSubjectBackfill.mjs'

// Local, explicit maintenance. JSON goes to stdout, Chinese summary to stderr;
// neither channel includes passages, preview payloads or receipt account data.
const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1]) throw new Error(`Required: ${name}`)
  return realpathSync(path.resolve(args[index + 1]))
}
for (let index = 0; index < args.length; index++) {
  if (['--db', '--files-root'].includes(args[index])) { index++; continue }
  if (args[index] !== '--apply') throw new Error(`Unknown option: ${args[index]}`)
}
const dbPath = option('--db')
const filesRoot = option('--files-root')
if (!existsSync(dbPath)) throw new Error('Local DB does not exist')
const disk = statfsSync(filesRoot)
const freeBytes = disk.bavail * disk.bsize
if (freeBytes < 10 * 1024 ** 3) throw new Error(freeBytes < 7 * 1024 ** 3 ? 'DISK_STOP_BELOW_7_GIB' : 'DISK_WAIT_BELOW_10_GIB')
const report = await backfillReviewSubjects({ dbPath, filesRoot, apply: args.includes('--apply') })
console.log(JSON.stringify(report))
console.error(`${report.dryRun ? '只读预检' : '维护回填'}：可回填 ${report.canBackfill} 套，已写入 ${report.applied} 套，跳过 ${report.skipped} 套，已有基准 ${report.alreadyPresent} 套${report.paused ? `；暂停原因 ${report.paused}` : ''}`)
for (const row of report.results) console.error(`${row.paperId || row.revisionId}：${row.action}（${row.reasonCode}）`)
