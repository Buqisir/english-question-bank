import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function repoRootFrom(importMetaUrl) {
  const startDir = dirname(fileURLToPath(importMetaUrl))
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: startDir,
      encoding: 'utf8',
    }).trim()
  } catch {
    return resolve(startDir, '..')
  }
}

export function readText(root, relPath) {
  return readFileSync(resolve(root, relPath), 'utf8')
}

export function createVerifier(name) {
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

  function section(label) {
    console.log(`\n─── ${label} ───\n`)
  }

  function summary() {
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`  ${name}: ${passed} passed, ${failed} failed`)
    console.log(`${'═'.repeat(50)}\n`)

    if (failed > 0) {
      process.exit(1)
    }
  }

  return {
    assert,
    section,
    summary,
    get passed() {
      return passed
    },
    get failed() {
      return failed
    },
  }
}

export function safeGitNames(root, args) {
  try {
    const out = execSync(`git diff --name-only ${args}`, {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    return out ? out.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

export function safeGitOutput(root, command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export function changedFiles(root, { baseRef = 'main', includeUntracked = true } = {}) {
  const names = new Set()

  for (const name of safeGitNames(root, baseRef)) names.add(name)
  for (const name of safeGitNames(root, `--cached ${baseRef}`)) names.add(name)

  if (includeUntracked) {
    const untracked = safeGitOutput(root, 'git ls-files --others --exclude-standard')
    for (const name of untracked.split('\n').filter(Boolean)) names.add(name)
  }

  return [...names].sort()
}

export function matchesPath(file, pattern) {
  if (pattern.endsWith('/')) return file.startsWith(pattern)
  return file === pattern || file.startsWith(`${pattern}/`)
}

export function touchesAny(files, patterns) {
  return files.some((file) => patterns.some((pattern) => matchesPath(file, pattern)))
}

export function unexpectedFiles(files, allowedPatterns) {
  return files.filter(
    (file) => !allowedPatterns.some((pattern) => matchesPath(file, pattern))
  )
}
