import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCanonicalPublicationBackfill } from './lib/productionCanonicalBackfill.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const write = args.includes('--write')
const runtimeOnly = args.includes('--runtime-only')

function readOption(name, fallback) {
  const prefix = `${name}=`
  const value = args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  return path.resolve(repoRoot, value || fallback)
}

try {
  const report = await runCanonicalPublicationBackfill({
    repoRoot,
    targetDbPath: readOption('--target-db', 'data/question-bank.sqlite'),
    targetAssetsRoot: readOption('--target-assets', 'app/public/paper-assets'),
    write,
    runtimeOnly,
  })
  console.log(JSON.stringify(report))
} catch (error) {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code || 'CANONICAL_PRODUCTION_BACKFILL_FAILED',
    message: error?.message || String(error),
    details: error?.details || null,
  }))
  process.exitCode = 1
}
