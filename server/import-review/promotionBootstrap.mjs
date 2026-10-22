import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { rendererBuildIdProvider } from './rendererBuildIdProvider.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function files(target) {
  if (!existsSync(target)) return []
  if (!statSync(target).isDirectory()) return [target]
  return readdirSync(target).sort().flatMap(entry => files(path.join(target, entry)))
}
function hashFiles(roots) {
  const hash = createHash('sha256')
  for (const file of roots.flatMap(files).sort()) {
    hash.update(path.relative(rootDir, file)); hash.update('\0')
    hash.update(readFileSync(file)); hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}
export function actualRendererBuildId() {
  return hashFiles(['app/dist', 'app/src', 'app/pnpm-lock.yaml', 'shared', 'server/figures',
    'server/import-review/revisionProjection.mjs', 'server/import-review/reviewPagination.mjs',
    'server/draft-paper/fixedPagePdfPlanner.mjs', 'server/draft-paper/studentProductPdf.mjs',
    'server/draft-paper/paginationRenderer.mjs', 'server/paper-import/paginationPlan.mjs',
    'server/paper-canonical', 'server/print-renderer.mjs'].map(file => path.join(rootDir, file)))
}
export const rendererBuildId = rendererBuildIdProvider({
  explicitBuildId: process.env.QUESTION_BANK_BUILD_ID,
  production: process.env.NODE_ENV === 'production', compute: actualRendererBuildId,
})
let releaseIdentity
export function promotionReleaseIdentity() {
  return releaseIdentity ??= hashFiles(['server/import-review', 'server/paper-import',
    'server/paper-canonical', 'shared/paper-canonical', 'server/api.mjs', 'server/package.json',
    'server/package-lock.json'].map(file => path.join(rootDir, file)))
}
export function forkPromotionProcess(role, args, heapMb) {
  const module = role === 'supervisor' ? './promotionSupervisor.mjs'
    : role === 'executor' ? './promotionWorker.mjs' : null
  if (!module) throw new Error('Invalid fixed promotion role')
  return fork(new URL(module, import.meta.url), args, {
    execPath: fileURLToPath(new URL('./promotionNode.sh', import.meta.url)),
    execArgv: [`--max-old-space-size=${heapMb}`], detached: true,
    env: { ...process.env, EQB_PROMOTION_NODE: process.execPath },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
}
// Trusted server bootstrap only. HTTP never supplies command/module/path/budget.
export function promotionBootstrap() {
  function budget(name, fallback, min, max) {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
    return value
  }
  return {
    dbPath: path.resolve(process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite')),
    reviewDbPath: path.resolve(process.env.QUESTION_BANK_IMPORT_OPS_DB || path.join(rootDir, 'data/import-ops.sqlite')),
    filesRoot: path.resolve(process.env.QUESTION_BANK_IMPORT_OPS_ROOT || path.join(rootDir, 'data/import-ops/files')),
    paperAssetsDir: path.resolve(process.env.QUESTION_BANK_PAPER_ASSET_ROOT || path.join(rootDir, 'app/public/paper-assets')),
    releaseIdentity: promotionReleaseIdentity(),
    // Provisional: MUST be fixed from Linux 2CPU/2GiB measurements.
    heapMb: budget('EQB_PROMOTION_HEAP_MB', 512, 16, 512),
    rssMb: budget('EQB_PROMOTION_RSS_MB', 1400, 16, 1400),
    deadlineMs: budget('EQB_PROMOTION_DEADLINE_MS', 900_000, 100, 900_000),
  }
}
export function openPromotionBank(config, { readOnly = false } = {}) {
  const db = new DatabaseSync(config.dbPath, { readOnly })
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
  return db
}
