/**
 * verify-zj-package.mjs <paperId>
 *
 * Dump the deterministic package files emitted by buildPaperImportAiPackageFiles
 * for one already-split+analysed paper, as a stable sorted JSON, for byte-diff
 * back-compat checking (MF-2) and ZJ correctness checking (MF-1).
 *
 * Reuses 02-publish's payload assembly (groups.json + analysis-<key>.json).
 * Does NOT publish. Prints JSON {files:[{name,text}]} sorted by name to stdout.
 *
 * Usage: node verify-zj-package.mjs paper-zj-2026-jan > /tmp/pkg.json
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPaperImportAiPackageFiles } from '../../server/paper-import-ai/packageBuilder.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const paperId = process.argv[2]
if (!paperId) { console.error('usage: verify-zj-package.mjs <paperId>'); process.exit(2) }

const dir = path.join(__dirname, 'papers', paperId)
const groups = JSON.parse(readFileSync(path.join(dir, 'groups.json'), 'utf8'))
const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups

const load = (key) => {
  const p = path.join(dir, `analysis-${key}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
const letters = ['a', 'b', 'c', 'd']
const analysesByGroupId = {}
readingGroups.forEach((g, i) => {
  const a = load(`reading-${letters[i]}`)
  if (a) analysesByGroupId[g.groupId] = a
})

const files = buildPaperImportAiPackageFiles({
  parseResult: { paper, readingGroups },
  analysesByGroupId,
  sevenChoicesGroup: seven,
  sevenChoicesAnalysis: load('seven'),
  clozeGroup: cloze,
  clozeAnalysis: load('cloze'),
  grammarFillGroup: grammar,
  grammarFillAnalysis: load('grammar'),
  applicationGroup: application,
  continuationGroup: continuation,
  sourceDocx: null,
})

const norm = (Array.isArray(files) ? files : [])
  .filter(Boolean)
  .map((f) => ({
    name: f.fileName || f.path || f.name || '(unnamed)',
    // Normalize the non-deterministic importedAt timestamp so byte-diff is stable.
    text: (Buffer.isBuffer(f.buffer) ? f.buffer.toString('utf8') : String(f.buffer ?? f.content ?? ''))
      .replace(/("importedAt":\s*")[^"]*"/g, '$1NORMALIZED"'),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

process.stdout.write(JSON.stringify({ paperId, files: norm }, null, 2))
