// Claude-driven verb-profile backfill (no DeepSeek). Mirrors the shipped service
// but the AI provider is a Claude subagent (output pre-fetched into files).
// Phase 1:  node vp-driver.mjs list      -> writes vp/<paperId>__<groupId>.combined.txt + vp/manifest.json
// Phase 2:  node vp-driver.mjs persist   -> classify (validate) via injected provider + write sidecars
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { listGrammarFillVerbWork, classifyVerbProfileGroup, persistVerbProfileGroup } from '../../server/grammar-verb-profile/verbProfileBackfillService.mjs'
import { buildVerbProfileMessages } from '../../server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs'

const ROOT = process.cwd()
const PAPER_ASSETS = path.join(ROOT, 'app/public/paper-assets')
const VP = path.join(ROOT, '.scratch/import-pilot/vp')
const ALLOWED = new Set(['paper-2020-i','paper-2020-ii','paper-2021-i','paper-2021-ii','paper-2022-i','paper-2022-ii','paper-2023-i','paper-2023-ii','paper-2024-i','paper-2024-ii','paper-2025-i','paper-2025-ii'])
const mode = process.argv[2]
mkdirSync(VP, { recursive: true })
const key = (g) => `${g.paperId}__${g.groupId}`

const { groups, skipped } = listGrammarFillVerbWork({ paperAssetsDir: PAPER_ASSETS })
const work = groups.filter((g) => ALLOWED.has(g.paperId))

if (mode === 'list') {
  const manifest = []
  for (const g of work) {
    const messages = buildVerbProfileMessages(g.blanks)
    const combined = ['=== SYSTEM ===', messages[0].content, '', '=== TASK ===', messages[1].content].join('\n')
    writeFileSync(path.join(VP, `${key(g)}.combined.txt`), combined)
    writeFileSync(path.join(VP, `${key(g)}.blanks.json`), JSON.stringify(g, null, 2))
    manifest.push({ key: key(g), paperId: g.paperId, groupId: g.groupId, blanks: g.blanks.length })
  }
  writeFileSync(path.join(VP, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`work groups: ${work.length} (skipped/non-allowed: ${groups.length - work.length}; globally skipped: ${skipped})`)
  for (const m of manifest) console.log(`  ${m.key}  blanks=${m.blanks}`)
} else if (mode === 'persist') {
  let ok = 0, fail = 0
  for (const g of work) {
    const outPath = path.join(VP, `${key(g)}.out.json`)
    if (!existsSync(outPath)) { console.log(`MISSING ${key(g)}`); fail++; continue }
    const rawText = readFileSync(outPath, 'utf8')
    try {
      const profiles = classifyVerbProfileGroup(g, { providerCaller: async () => ({ rawText }) })
      // classifyVerbProfileGroup may be async (analyze is async) — await defensively
      const resolved = profiles && typeof profiles.then === 'function' ? await profiles : profiles
      persistVerbProfileGroup({ paperAssetsDir: PAPER_ASSETS }, g, resolved)
      ok++
      console.log(`OK ${key(g)} -> ${Object.keys(resolved).length} profiles`)
    } catch (e) {
      fail++
      console.log(`FAIL ${key(g)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`\npersist: ${ok} ok, ${fail} fail`)
} else {
  console.error('usage: vp-driver.mjs list|persist')
  process.exit(2)
}
