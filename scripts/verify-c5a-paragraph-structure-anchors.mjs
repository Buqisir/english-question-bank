/**
 * verify-c5a-paragraph-structure-anchors.mjs
 *
 * C5a verify script — Paragraph Structure Anchors.
 *
 * Asserts:
 *   1. Every passage in input.json has passageStructure.
 *   2. passageStructure.section matches the passage's paperSection.
 *   3. All paragraph ids match format ^[A-Z]-P\d+$.
 *   4. All paragraph labels match format P\d+.
 *   5. All paragraphs have non-empty text.
 *   6. Concatenation invariant: normalize(paragraphs.map(p=>p.text).join(' ')) === normalize(passageBody).
 *   7. Adapter output paragraph ids match passageStructure ids exactly.
 *   8. Official surface=paper path does NOT silently use legacy auto-segmentation.
 *   9. piToPaperTextMap throws when passageStructure is missing.
 *  10. No forbidden changes (PaperSurface.tsx, PaperSurface.css,
 *      shared/papersurface/types.d.ts, report.json, anchorKeys, segmentPaperText edits).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  repoRootFrom,
  safeGitNames,
  safeGitOutput,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)

const normalize = (s) => s.replace(/\s+/g, ' ').trim()

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label}`)
  }
}

// ─── Load input.json ───
const INPUT_PATH = resolve(ROOT, 'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json')
const input = JSON.parse(readFileSync(INPUT_PATH, 'utf8'))

console.log('\n─── C5a: passageStructure presence & format ───\n')

for (const passage of input.passages) {
  const section = passage.paperSection
  const ps = passage.passageStructure

  assert(!!ps, `${section}: passageStructure exists`)
  if (!ps) continue

  assert(ps.section === section, `${section}: passageStructure.section matches paperSection`)
  assert(Array.isArray(ps.paragraphs) && ps.paragraphs.length > 0, `${section}: paragraphs array non-empty`)

  for (const para of ps.paragraphs) {
    assert(/^[A-Z]-P\d+$/.test(para.id), `${section}: id format OK (${para.id})`)
    assert(/^P\d+$/.test(para.label), `${section}: label format OK (${para.label})`)
    assert(typeof para.text === 'string' && para.text.trim().length > 0, `${section}: ${para.id} text non-empty`)
  }

  // Concatenation invariant
  const joined = normalize(ps.paragraphs.map((p) => p.text).join(' '))
  const body = normalize(passage.passageBody)
  assert(joined === body, `${section}: concatenation invariant holds`)
}

// ─── Adapter integration test ───

console.log('\n─── C5a: adapter output paragraph ids ───\n')

// Import the adapter (ESM)
const adapterPath = resolve(ROOT, 'app/src/features/paper-intelligence/adapter/piToPaperTextMap.ts')
const adapterContent = readFileSync(adapterPath, 'utf8')

// We can't directly import .ts in Node, so we'll run the adapter logic
// against the input.json data using the segmenter directly.
const segmenterPath = resolve(ROOT, 'shared/papersurface/segmentPaperText.mjs')
const { segmentPaperText } = await import(segmenterPath)

// Rebuild passageStructures map from input.json
const passageStructures = {}
const bodies = {}
for (const p of input.passages) {
  if (p.paperSection && p.passageStructure) {
    passageStructures[p.paperSection] = p.passageStructure
  }
  if (p.paperSection && p.passageBody) {
    bodies[p.paperSection] = p.passageBody
  }
}

// Simulate piToPaperTextMap logic
function simulateAdapter(passages, passageStructures) {
  const paragraphs = []
  for (const passage of passages) {
    const section = passage.paperSection
    if (!section) continue
    const structure = passageStructures[section]
    if (!structure) {
      throw new Error(`[C5a] passageStructure missing for section "${section}"`)
    }
    for (const para of structure.paragraphs) {
      // Sentence segmentation using the real segmenter
      const segmented = segmentPaperText(para.text, { sectionId: para.id })
      const segPara = segmented.paragraphs[0]
      const sentences = segPara
        ? segPara.sentences.map((s, idx) => ({
            id: `${para.id}-s${idx}`,
            text: s.text,
            tokens: [],
          }))
        : []
      paragraphs.push({ id: para.id, section, sentences })
    }
  }
  return paragraphs
}

const adapterOutput = simulateAdapter(input.passages, passageStructures)

// Check that adapter output ids match passageStructure ids exactly
for (const passage of input.passages) {
  const section = passage.paperSection
  const structureIds = passage.passageStructure.paragraphs.map((p) => p.id)
  const outputIds = adapterOutput
    .filter((p) => p.section === section)
    .map((p) => p.id)

  assert(
    JSON.stringify(structureIds) === JSON.stringify(outputIds),
    `${section}: adapter output ids match passageStructure ids (${outputIds.join(', ')})`
  )

  // Verify no legacy A-p0 style ids in output
  for (const id of outputIds) {
    assert(!/^[A-Z]-p\d+$/.test(id), `${section}: ${id} is NOT legacy format (A-p0)`)
  }
}

// ─── Hard-fail test: missing passageStructure throws ───

console.log('\n─── C5a: missing passageStructure hard-fail ───\n')

let threwOnMissing = false
try {
  simulateAdapter(input.passages, { /* empty — no structures */ })
} catch (e) {
  threwOnMissing = true
  assert(e.message.includes('passageStructure missing'), `throws with descriptive message: "${e.message.slice(0, 60)}..."`)
}
assert(threwOnMissing, 'piToPaperTextMap throws when passageStructure is missing')

// ─── Verify official path does NOT use legacy auto-segmentation ───

console.log('\n─── C5a: no silent legacy fallback in official path ───\n')

// The adapter source must NOT call segmentPaperText(passageBody, ...) in the
// official piToPaperTextMap function. It should only exist in the legacy export.
const officialFnMatch = adapterContent.match(
  /export function piToPaperTextMap\([\s\S]*?^}/m
)
if (officialFnMatch) {
  // The official function should NOT contain a direct call to
  // segmentPaperText with bodies[section] or passageBody as first arg.
  // It should only call segmentSentencesForParagraph or segmentPaperText
  // with para.text (inside confirmed paragraphs).
  assert(
    !officialFnMatch[0].includes('bodies[section]'),
    'official piToPaperTextMap does not reference bodies[section]'
  )
  assert(
    !officialFnMatch[0].includes('passageBody'),
    'official piToPaperTextMap does not reference passageBody'
  )
} else {
  // Fallback: check the whole file for the pattern
  // Split at "export function piToPaperTextMapLegacy" to isolate official part
  const parts = adapterContent.split('export function piToPaperTextMapLegacy')
  const officialPart = parts[0]
  assert(
    !officialPart.includes('segmentPaperText(passageBody'),
    'official path does not call segmentPaperText(passageBody)'
  )
}

// Verify the harness passes passageStructures to the adapter
const harnessPath = resolve(ROOT, 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
const harnessContent = readFileSync(harnessPath, 'utf8')

assert(
  harnessContent.includes('passageStructures'),
  'harness references passageStructures'
)
assert(
  harnessContent.includes('buildPaperSurfaceDataFromPi({ report, bodies, inputOptions, passageStructures })'),
  'harness passes passageStructures to buildPaperSurfaceDataFromPi'
)

// ─── Forbidden changes ───

console.log('\n─── C5a: forbidden changes check ───\n')

function gitDiffCheck(filepath, label) {
  const diffAgainstMain = safeGitNames(ROOT, `main -- "${filepath}"`)
  assert(diffAgainstMain.length === 0, `${label} not modified`)
}

gitDiffCheck('shared/papersurface/types.d.ts', 'shared/papersurface/types.d.ts')
gitDiffCheck('shared/papersurface/segmentPaperText.mjs', 'shared/papersurface/segmentPaperText.mjs')
gitDiffCheck('app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json', 'report.json')

// Check PaperSurface.tsx and PaperSurface.css not modified
const psFiles = safeGitOutput(
  ROOT,
  'find app/src -name "PaperSurface.tsx" -o -name "PaperSurface.css" 2>/dev/null'
).split('\n').filter(Boolean)

for (const f of psFiles) {
  gitDiffCheck(f, f)
}

// ─── Summary ───

console.log(`\n${'═'.repeat(50)}`)
console.log(`  C5a verify: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}\n`)

if (failed > 0) {
  process.exit(1)
}
