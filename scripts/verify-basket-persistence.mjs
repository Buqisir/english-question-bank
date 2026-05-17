#!/usr/bin/env node
/**
 * Verification: Assembly Basket localStorage persistence (Cut B).
 *
 * Static + behavioral checks (no browser):
 *   1. Pure helpers in `paperAssembly/basketPersistence.ts`:
 *      - serialize/parse round-trip preserves items
 *      - parse rejects corrupt JSON
 *      - parse rejects schemaVersion mismatch
 *      - parse rejects non-object payload
 *      - parse rejects non-array items
 *      - parse handles null / undefined / empty input
 *   2. usePaperDraft source contracts:
 *      - imports loadAssemblyBasket / saveAssemblyBasket from
 *        ./basketPersistence
 *      - useState basket initializer calls loadAssemblyBasket()
 *      - commitBasket calls saveAssemblyBasket(next) on every commit
 *      - no debounce wrapper around the save
 *      - replaceDraft routes through commitBasket so loaded layouts
 *        also persist
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const issues = []

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

console.log('\n=== Assembly Basket Persistence (Cut B) ===\n')

// ─── Test 1: pure helpers ───

const persistence = await import(
  '../app/src/paperAssembly/basketPersistence.ts'
)
const {
  ASSEMBLY_BASKET_STORAGE_KEY,
  ASSEMBLY_BASKET_SCHEMA_VERSION,
  serializeAssemblyBasket,
  parseAssemblyBasket,
} = persistence

console.log('Test 1: pure helpers')

assert(
  'storage key is "assembly-basket-v1"',
  ASSEMBLY_BASKET_STORAGE_KEY === 'assembly-basket-v1',
  `got ${ASSEMBLY_BASKET_STORAGE_KEY}`,
)
assert(
  'schema version is 1',
  ASSEMBLY_BASKET_SCHEMA_VERSION === 1,
  `got ${ASSEMBLY_BASKET_SCHEMA_VERSION}`,
)

const sampleItem = {
  id: 'g-test-1',
  title: 'Sample',
  source: '2025·浙江',
  sourceType: 'real_exam',
  year: 2025,
  region: '浙江',
  paperName: 'Test',
  section: '阅读 B',
  passageTitle: 'Sample Passage',
  summary: 'sample',
  groupType: 'reading',
  questionCount: 4,
  difficulty: 'medium',
  tags: [],
  topicLabels: [],
  hit: '',
  answerPreview: '',
  defaultScore: 2.5,
  score: 2.5,
  sectionTitle: '阅读理解',
  note: '',
}

const serialized = serializeAssemblyBasket([sampleItem])
assert(
  'serialize produces a JSON string with schemaVersion + items',
  typeof serialized === 'string' &&
    JSON.parse(serialized).schemaVersion === 1 &&
    Array.isArray(JSON.parse(serialized).items),
  '',
)

const roundTrip = parseAssemblyBasket(serialized)
assert(
  'serialize → parse round-trips item id',
  Array.isArray(roundTrip) && roundTrip.length === 1 && roundTrip[0].id === 'g-test-1',
  `got ${JSON.stringify(roundTrip)}`,
)

assert(
  'parse rejects corrupt JSON → returns null',
  parseAssemblyBasket('{not-json') === null,
  '',
)

assert(
  'parse rejects schemaVersion mismatch → returns null',
  parseAssemblyBasket(JSON.stringify({ schemaVersion: 2, items: [] })) === null,
  '',
)

assert(
  'parse rejects non-object payload (string)',
  parseAssemblyBasket(JSON.stringify('hello')) === null,
  '',
)

assert(
  'parse rejects non-object payload (array at top level)',
  parseAssemblyBasket(JSON.stringify([{ schemaVersion: 1, items: [] }])) === null,
  '',
)

assert(
  'parse rejects items that are not an array',
  parseAssemblyBasket(JSON.stringify({ schemaVersion: 1, items: 'oops' })) === null,
  '',
)

assert(
  'parse handles null → returns null',
  parseAssemblyBasket(null) === null,
  '',
)

assert(
  'parse handles undefined → returns null',
  parseAssemblyBasket(undefined) === null,
  '',
)

assert(
  'parse handles empty string → returns null',
  parseAssemblyBasket('') === null,
  '',
)

// ─── Test 2: usePaperDraft wiring ───

const hookSrc = readFileSync(
  path.join(ROOT, 'app/src/paperAssembly/usePaperDraft.ts'),
  'utf-8',
)

console.log('\nTest 2: usePaperDraft wires persistence helpers')

assert(
  'usePaperDraft imports loadAssemblyBasket / saveAssemblyBasket',
  /import\s*\{\s*[^}]*loadAssemblyBasket[^}]*\}\s*from\s*['"]\.\/basketPersistence(\.ts)?['"]/.test(
    hookSrc,
  ) &&
    /import\s*\{\s*[^}]*saveAssemblyBasket[^}]*\}\s*from\s*['"]\.\/basketPersistence(\.ts)?['"]/.test(
      hookSrc,
    ),
  'missing import',
)

assert(
  'basket useState initializer calls loadAssemblyBasket()',
  /useState<BasketItem\[\]>\(\(\)\s*=>\s*loadAssemblyBasket\(\)\)/.test(hookSrc),
  '',
)

// Strip comments before scanning for write call (so doc-block mentions
// of "no debounce" don't sneak through).
const codeOnly = hookSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

assert(
  'commitBasket persists via saveAssemblyBasket(next)',
  /const commitBasket\s*=\s*useCallback\(\(next:\s*BasketItem\[\]\)\s*=>\s*\{[\s\S]*?saveAssemblyBasket\(next\)/m.test(
    codeOnly,
  ),
  'commitBasket missing saveAssemblyBasket call',
)

assert(
  'no setTimeout / debounce wrapping the save (immediate write)',
  !/setTimeout\([^,]*saveAssemblyBasket/.test(codeOnly),
  'debounce-style timer detected',
)

// Cross-check: all 6 user-edit ops + replaceDraft commit through
// commitBasket, so persistence covers every mutation path.
const opsThatMustCommit = [
  'addGroups',
  'removeGroup',
  'clear',
  'moveGroup',
  'updateGroupScore',
  'updateGroupMeta',
  'replaceDraft',
  'externalRemoveByGroupId',
]

for (const op of opsThatMustCommit) {
  const re = new RegExp(
    `const ${op}\\s*=\\s*useCallback\\(([\\s\\S]*?)(?=\\n  const \\w+\\s*=\\s*useCallback\\(|\\n  return \\{)`,
    'm',
  )
  const body = codeOnly.match(re)?.[1] || ''
  assert(`${op} routes through commitBasket`, /commitBasket\(/.test(body), '')
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.log('\nIssues:')
  issues.forEach((i) => console.log(`  - ${i}`))
}
process.exit(failed > 0 ? 1 : 0)
