// Generic single-group analysis validator (for workflow agents to self-check).
// Usage: node .scratch/import-pilot/validate-one.mjs <configPath> <key>
//   key ∈ reading-a|reading-b|reading-c|reading-d|seven|cloze|grammar
// Exits 0 on PASS, 1 on FAIL (prints the validation error).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { analyzeReadingImportCandidate } from '../../server/paper-import-ai/analyzeReading.mjs'
import { analyzeSevenChoicesImportCandidate } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { analyzeClozeImportCandidate } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { analyzeGrammarFillImportCandidate } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'

const [configPath, key] = process.argv.slice(2)
if (!configPath || !key) { console.error('usage: validate-one.mjs <configPath> <key>'); process.exit(2) }
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const dir = path.dirname(configPath)
const groups = JSON.parse(readFileSync(path.join(dir, 'groups.json'), 'utf8'))
const paper = { paperId: config.paperId, sourceFilename: path.basename(config.docxPath), sourceHash: 'validate', sourceAssetVersion: 1 }

let group
let analyze
if (key.startsWith('reading-')) {
  const letter = key.split('-')[1]
  group = groups.readingGroups.find((g) => g.groupId.endsWith(`-reading-${letter}`))
  analyze = analyzeReadingImportCandidate
} else if (key === 'seven') { group = groups.seven; analyze = analyzeSevenChoicesImportCandidate }
else if (key === 'cloze') { group = groups.cloze; analyze = analyzeClozeImportCandidate }
else if (key === 'grammar') { group = groups.grammar; analyze = analyzeGrammarFillImportCandidate }
else { console.error('unknown key', key); process.exit(2) }

const rawText = readFileSync(path.join(dir, `analysis-${key}.json`), 'utf8')
const injected = { providerCallers: { deepseek: async () => ({ rawText, provider: 'claude', model: 'opus', latencyMs: 0 }) }, providerRetries: 0, analysisRetries: 0 }
try {
  await analyze({ paper, group, providerId: 'deepseek-v4-pro' }, injected)
  console.log(`PASS ${config.paperId}:${key}`)
} catch (err) {
  console.log(`FAIL ${config.paperId}:${key}: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
