#!/usr/bin/env node
import path from 'node:path'
import { existsSync, realpathSync, statfsSync } from 'node:fs'
import { createReviewCompatibilityStore } from '../server/import-review/reviewCompatibilityStore.mjs'
import { runReviewCompatibilityBatch } from '../server/import-review/runReviewCompatibilityWorker.mjs'

// Deliberately no write flag. Authorized maintenance uses store CAS; this
// command neither initializes/migrates a DB nor logs source content.
const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1]) throw new Error(`Required: ${name}`)
  return realpathSync(path.resolve(args[index + 1]))
}
if (args.some(arg => arg === '--write' || /^https?:/.test(arg))) throw new Error('Local dry-run only')
const dbPath = option('--db')
const filesRoot = option('--files-root')
if (!existsSync(dbPath)) throw new Error('Local DB does not exist')
const disk = statfsSync(filesRoot)
const freeBytes = disk.bavail * disk.bsize
if (freeBytes < 10 * 1024 ** 3) throw new Error(freeBytes < 7 * 1024 ** 3 ? 'DISK_STOP_BELOW_7_GIB' : 'DISK_WAIT_BELOW_10_GIB')
const store = createReviewCompatibilityStore({ dbPath, filesRoot })
console.log(JSON.stringify({ dryRun: true, ...(await runReviewCompatibilityBatch(store, { dryRun: true })) }))
