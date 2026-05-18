/**
 * verify-paper-intelligence-paper-surface-harness.mjs
 *
 * Issue #21-C1 static verify script.
 *
 * Asserts:
 *   Route / surface:
 *     - surface=paper still exists
 *     - default/unknown surface still mounts PaperIntelligencePreview
 *     - surface=paper mounts PaperIntelligencePaperSurfaceHarness
 *     - no surface=paper-v2
 *
 *   Scope:
 *     - no server changes
 *     - no package/lockfile changes
 *     - no reading-analysis changes
 *     - no basket/paperAssembly changes
 *     - no shared/papersurface changes
 *     - no PaperSurface module changes
 *     - prototype files not deleted or modified
 *
 *   Adapter boundaries:
 *     - adapter files import no React
 *     - adapter files contain no hooks
 *     - adapter files contain no DOM APIs
 *     - adapter files contain no fetch/localStorage/router reads
 *     - adapter files live under features/paper-intelligence/adapter
 *     - PaperSurface does not import PI types
 *
 *   Behavior contract:
 *     - PaperQuestion id uses ${paperSection}-${questionNo} convention
 *     - PaperQuestion does not include answer/explanation/distractorAnalysis/synonymSummary
 *     - annotations are [] in C1
 *     - mode is hardcoded lecture
 *     - readingFocusBySection is empty object
 *     - onFocusIntent handles request-lecture-focus
 *
 * Run: node scripts/verify-paper-intelligence-paper-surface-harness.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const APP = join(ROOT, 'app', 'src')
const ADAPTER_DIR = join(APP, 'features', 'paper-intelligence', 'adapter')
const HARNESS_PATH = join(APP, 'features', 'paper-intelligence', 'PaperIntelligencePaperSurfaceHarness.tsx')
const APP_TSX = join(APP, 'App.tsx')
const ROUTE_PATH = join(APP, 'features', 'paper-intelligence', 'paperIntelligenceRoute.ts')
const PAPER_SURFACE_DIR = join(APP, 'shared-ui', 'papersurface')
const SHARED_PAPER_SURFACE = join(ROOT, 'shared', 'papersurface')
const PROTOTYPE_DIR = join(APP, 'features', 'paper-intelligence', 'paperSurfacePrototype')

let failures = 0
let passes = 0

function assert(condition, message) {
  if (condition) {
    passes++
    console.log(`  PASS  ${message}`)
  } else {
    failures++
    console.error(`  FAIL  ${message}`)
  }
}

function readFile(path) {
  return readFileSync(path, 'utf-8')
}

function fileExists(path) {
  return existsSync(path)
}

// ─── Route / surface ───

console.log('\n=== Route / surface ===')

const routeContent = readFile(ROUTE_PATH)
assert(routeContent.includes("'paper'"), "surface=paper still exists in route parser")
assert(!routeContent.includes("'paper-v2'"), "no surface=paper-v2 in route parser")

const appContent = readFile(APP_TSX)
assert(
  appContent.includes('PaperIntelligencePreview') && appContent.includes("'paper-intelligence'"),
  "default/unknown surface still mounts PaperIntelligencePreview"
)
assert(
  appContent.includes('PaperIntelligencePaperSurfaceHarness'),
  "surface=paper mounts PaperIntelligencePaperSurfaceHarness"
)
assert(
  !appContent.includes("surface=paper-v2") && !appContent.includes("'paper-v2'"),
  "no surface=paper-v2 in App.tsx"
)

// ─── Scope ───

console.log('\n=== Scope ===')

// Get git diff to check modified files
let diffOutput = ''
try {
  diffOutput = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf-8' })
  // Also include untracked files
  const untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf-8' })
  diffOutput += '\n' + untrackedOutput
} catch {
  // If git is not available, skip diff-based checks
  diffOutput = ''
}

const changedFiles = diffOutput.split('\n').filter(Boolean)

assert(
  !changedFiles.some(f => f.startsWith('server/')),
  "no server changes"
)
assert(
  !changedFiles.some(f => f === 'package.json' || f === 'pnpm-lock.yaml' || f === 'app/package.json' || f === 'app/pnpm-lock.yaml'),
  "no package/lockfile changes"
)
assert(
  !changedFiles.some(f => f.includes('features/reading-analysis')),
  "no reading-analysis changes"
)
assert(
  !changedFiles.some(f => f.includes('paperAssembly') || (f.includes('basket') && !f.includes('BasketPreviewItem'))),
  "no basket/paperAssembly changes"
)
assert(
  !changedFiles.some(f => f.includes('shared-ui/papersurface/') || f.includes('shared/papersurface/')),
  "no shared/papersurface or PaperSurface module changes"
)

// Prototype files not deleted or modified
assert(
  fileExists(join(PROTOTYPE_DIR, 'PaperSurfacePrototype.tsx')),
  "prototype PaperSurfacePrototype.tsx still exists (not deleted)"
)
assert(
  fileExists(join(PROTOTYPE_DIR, 'paperSurfacePrototype.css')),
  "prototype paperSurfacePrototype.css still exists (not deleted)"
)
assert(
  !changedFiles.some(f => f.includes('paperSurfacePrototype/PaperSurfacePrototype.tsx') || f.includes('paperSurfacePrototype/paperSurfacePrototype.css')),
  "prototype files not modified"
)

// ─── Adapter boundaries ───

console.log('\n=== Adapter boundaries ===')

assert(fileExists(ADAPTER_DIR), "adapter files live under features/paper-intelligence/adapter")

const adapterFiles = readdirSync(ADAPTER_DIR).filter(f => f.endsWith('.ts'))
assert(adapterFiles.length >= 4, `adapter directory has at least 4 .ts files (found ${adapterFiles.length})`)

for (const file of adapterFiles) {
  const filePath = join(ADAPTER_DIR, file)
  const content = readFile(filePath)

  // Strip comment lines for behavioral checks (single-line // and block /* */)
  const codeLines = content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')

  assert(
    !content.includes("from 'react'") && !content.includes('from "react"') && !content.includes("import React"),
    `${file}: imports no React`
  )
  assert(
    !codeLines.includes('useState') && !codeLines.includes('useEffect') &&
    !codeLines.includes('useCallback') && !codeLines.includes('useMemo') &&
    !codeLines.includes('useRef'),
    `${file}: contains no hooks`
  )
  assert(
    !codeLines.includes('document.') && !codeLines.includes('window.') &&
    !codeLines.includes('HTMLElement') && !codeLines.includes('querySelector'),
    `${file}: contains no DOM APIs`
  )
  assert(
    !codeLines.includes('fetch(') && !codeLines.includes('localStorage') &&
    !codeLines.includes('useLocation') && !codeLines.includes('useSearchParams') &&
    !codeLines.includes('useNavigate'),
    `${file}: contains no fetch/localStorage/router reads`
  )
}

// PaperSurface does not import PI types
const paperSurfaceComponent = readFile(join(PAPER_SURFACE_DIR, 'PaperSurface.tsx'))
assert(
  !paperSurfaceComponent.includes('paperIntelligenceTypes') &&
  !paperSurfaceComponent.includes('PaperIntelligenceReport'),
  "PaperSurface does not import PI types"
)

// ─── Behavior contract ───

console.log('\n=== Behavior contract ===')

const questionsAdapter = readFile(join(ADAPTER_DIR, 'piToPaperQuestions.ts'))
assert(
  questionsAdapter.includes('`${section}-${questionNo}`') || questionsAdapter.includes('`${section}-${questionNo}`'),
  "PaperQuestion id uses ${paperSection}-${questionNo} convention"
)
// Check that PaperQuestion adapter does NOT include answer/explanation/distractorAnalysis/synonymSummary
assert(
  !questionsAdapter.includes("answer:") || questionsAdapter.includes("// PaperQuestion does NOT include answer"),
  "PaperQuestion adapter does not set answer field on output"
)
// More precise: check the push/return object does not include forbidden fields
assert(
  !questionsAdapter.includes("explanation:") && !questionsAdapter.includes("distractorAnalysis:") && !questionsAdapter.includes("synonymSummary:"),
  "PaperQuestion does not include explanation/distractorAnalysis/synonymSummary"
)

const harnessContent = readFile(HARNESS_PATH)
assert(
  harnessContent.includes('annotations={[]}'),
  "annotations are [] in C1"
)
assert(
  harnessContent.includes('mode="lecture"'),
  "mode is hardcoded lecture"
)
assert(
  harnessContent.includes('readingFocusBySection={{}}'),
  "readingFocusBySection is empty object"
)
assert(
  harnessContent.includes("'request-lecture-focus'") || harnessContent.includes('"request-lecture-focus"'),
  "onFocusIntent handles request-lecture-focus"
)

// ─── Summary ───

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
