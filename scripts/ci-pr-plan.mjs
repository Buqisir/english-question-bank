#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyAmpOrbCIPullRequest, parseAmpOrbCIDiffRaw } from './lib/ampOrbCIPolicy.mjs'

const trustedRoot = fileURLToPath(new URL('..', import.meta.url))
const reducedPacks = new Map([
  ['no-changes', 'ui'],
  ['ui-micro', 'ui'],
  ['ordinary-local-feature', 'feature'],
  ['known-shape-paper-data', 'paper-data'],
  ['single-paper-import', 'import-paper'],
])

function readExistingPlan(files, pack = 'all') {
  return JSON.parse(execFileSync(process.execPath, [
    path.join(trustedRoot, 'scripts/verify-ci.mjs'), '--plan-json',
    ...(files === null ? ['--pack', pack] : ['--changed', ...files.flatMap(file => ['--changed-file', file])]),
  ], { cwd: trustedRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
}

// Run from the PR base checkout, never import the candidate's classifier.
export function classifyActionsChanges(changes, readPlan = readExistingPlan) {
  const files = [...new Set(changes.flatMap(change => change.paths))].sort()
  const full = reason => ({ ...readPlan(null), files, pack: 'all', reason })
  if (files.length === 0) return full('empty-diff')
  const policy = classifyAmpOrbCIPullRequest(changes)
  if (policy.override) return full(policy.override)
  try {
    const selected = readPlan(files)
    if (reducedPacks.get(selected.risk) !== selected.pack) return full(selected.risk || 'unknown-risk')
    // Even prose-only changes run the UI baseline; summarize the actual executed pack.
    if (selected.risk === 'no-changes') selected.scripts = readPlan(null, 'ui').scripts
    if (!Array.isArray(selected.scripts) || selected.scripts.some(script =>
      typeof script !== 'string' || !/^scripts\/[A-Za-z0-9_./-]+\.mjs$/u.test(script))) {
      return full('invalid-classifier-plan')
    }
    return { ...selected, files, reason: 'base-classifier' }
  } catch {
    return full('classifier-failed')
  }
}

export function planPullRequest({ repository, base, head, tested }) {
  for (const sha of [base, head, tested]) {
    if (!/^[a-f0-9]{40}$/u.test(sha || '')) throw new Error('Invalid PR commit identity')
  }
  const git = args => execFileSync('git', args, {
    cwd: repository, maxBuffer: 8 * 1024 * 1024,
  })
  if (git(['status', '--porcelain']).toString().trim()
    || git(['rev-parse', 'HEAD']).toString().trim() !== tested
    || git(['show', '-s', '--format=%P', tested]).toString().trim() !== `${base} ${head}`) {
    throw new Error('Checkout is not the exact PR test merge')
  }
  git(['merge-base', '--is-ancestor', base, head])
  if (git(['rev-parse', `${tested}^{tree}`]).toString() !== git(['rev-parse', `${head}^{tree}`]).toString()) {
    throw new Error('PR must contain its current base before verification')
  }
  let selected
  try {
    const changes = parseAmpOrbCIDiffRaw(git([
      'diff', '--raw', '-z', '--no-abbrev', '--find-renames', '--no-ext-diff', '--no-textconv', base, head, '--',
    ]))
    selected = changes.length === 0
      ? { ...readExistingPlan(null), reason: 'empty-diff' }
      : classifyActionsChanges(changes)
  } catch {
    selected = { ...readExistingPlan(null), reason: 'diff-or-classifier-failed' }
  }
  return { ...selected, base, head, tested, policySource: base }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repository, base, head, tested] = process.argv.slice(2)
  console.log(JSON.stringify(planPullRequest({ repository, base, head, tested }), null, 2))
}
