#!/usr/bin/env node
// motion-pass P3 gate (docs/cuts/motion-pass/plan.md #9): scans app/src/**/*.css
// (excluding shared-ui/papersurface/PaperSurface.css, a contract file this cut
// does not touch) and asserts the motion token discipline landed by this cut
// holds: no `ease-in` direction bugs, no `transition: all` perf smell, and no
// bare hand-written duration literals outside documented `token-exempt`
// loading or signature moments.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const scanRoot = path.join(rootDir, 'app/src')
const excludePath = path.join(rootDir, 'app/src/shared-ui/papersurface/PaperSurface.css')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function walkCssFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkCssFiles(full))
    } else if (entry.endsWith('.css') && full !== excludePath) {
      out.push(full)
    }
  }
  return out
}

const cssFiles = walkCssFiles(scanRoot)
assert('found css files to scan', cssFiles.length > 0, `scanned root: ${scanRoot}`)

// Word-boundary ease-in check: flags bare `ease-in`, does not flag `ease-in-out`.
const EASE_IN_RE = /\bease-in\b(?!-out)/

// `transition: all` (with or without other transition-property tokens mixed
// into a shorthand list — this cut's contract is a fully explicit property
// list, never the `all` keyword).
const TRANSITION_ALL_RE = /transition(-property)?\s*:\s*(?:[^;]*,\s*)?all\b/

// Bare duration literal (`123ms` or `1.23s`) inside a transition/animation
// shorthand or a `*-duration` longhand. Token-exempt lines (signature moments)
// carry a trailing `token-exempt` comment.
const DURATION_RE = /\d+(?:\.\d+)?m?s\b/g

for (const file of cssFiles) {
  const rel = path.relative(rootDir, file)
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  let fileHasEaseIn = false
  let fileHasTransitionAll = false
  let fileHasBareDuration = false

  lines.forEach((line, idx) => {
    const lineNo = idx + 1
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    if (EASE_IN_RE.test(line)) {
      fileHasEaseIn = true
      console.error(`  ease-in found: ${rel}:${lineNo}: ${trimmed}`)
    }

    if (TRANSITION_ALL_RE.test(line)) {
      fileHasTransitionAll = true
      console.error(`  transition: all found: ${rel}:${lineNo}: ${trimmed}`)
    }

    const isTransitionOrAnimation = /^(transition|animation)(-duration)?\s*:/.test(trimmed) ||
      /transition\s*:|animation\s*:|animation-duration\s*:/.test(trimmed)
    if (!isTransitionOrAnimation) return
    if (trimmed.includes('token-exempt')) return

    const matches = trimmed.match(DURATION_RE) || []
    for (const m of matches) {
      fileHasBareDuration = true
      console.error(`  bare duration "${m}" found: ${rel}:${lineNo}: ${trimmed}`)
    }
  })

  assert(`no ease-in in ${rel}`, !fileHasEaseIn)
  assert(`no transition: all in ${rel}`, !fileHasTransitionAll)
  assert(`no bare duration literals in ${rel}`, !fileHasBareDuration)
}

if (failed > 0) {
  console.error(`\nMotion tokens verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nMotion tokens verify passed: ${passed} passed, 0 failed (${cssFiles.length} css files scanned)`)
