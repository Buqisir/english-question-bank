#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

// Read data from the immutable natural event, never execute body text.
export function parseRiskAdvice(body, { head, base }) {
  const invalid = detail => ({ status: 'invalid', detail })
  if (body == null || body === '') return { status: 'missing' }
  if (typeof body !== 'string' || body.length > 65536) return invalid('body-shape')
  const marker = '<!-- eqb-risk-plan'
  if (!body.includes(marker)) return { status: 'missing' }
  if (body.split(marker).length !== 2) return invalid('duplicate-block')
  const block = /<!-- eqb-risk-plan\r?\n([^]*?)\r?\n-->/u.exec(body)
  if (!block || block[1].length > 4096) return invalid('block-shape')
  let advice
  try { advice = JSON.parse(block[1]) } catch { return invalid('json') }
  // Four string-valued members have exactly 17 tokens. Reject duplicate members
  // before JSON.parse's last-value-wins semantics can hide an extra choice.
  const tokens = block[1].match(/"(?:[^"\\]|\\.)*"|[^\s]/gu)
  if (!advice || Array.isArray(advice) || typeof advice !== 'object'
    || tokens?.length !== 17
    || Object.keys(advice).sort().join(',') !== 'base,head,pack,reason'
    || typeof advice.head !== 'string' || typeof advice.base !== 'string'
    || !/^[a-f0-9]{40}$/u.test(advice.head) || !/^[a-f0-9]{40}$/u.test(advice.base)
    || !['ui', 'feature', 'paper-data', 'import-paper', 'all'].includes(advice.pack)
    || typeof advice.reason !== 'string' || !advice.reason.trim() || advice.reason.length > 1000
    || !advice.reason.isWellFormed()
    || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(advice.reason)) return invalid('schema')
  if (advice.head !== head || advice.base !== base) return { status: 'stale' }
  return { status: 'valid', pack: advice.pack, reason: advice.reason }
}

function adviceFromEvent(eventPath, plan) {
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'))
    if (event?.pull_request?.head?.sha !== plan.head || event?.pull_request?.base?.sha !== plan.base) {
      return { status: 'invalid', detail: 'event-identity' }
    }
    return parseRiskAdvice(event.pull_request.body, plan)
  } catch {
    return { status: 'invalid', detail: 'event-unreadable' }
  }
}

function readExistingPlan(files, pack = 'all') {
  return JSON.parse(execFileSync(process.execPath, [
    path.join(trustedRoot, 'scripts/verify-ci.mjs'), '--plan-json',
    ...(files === null ? ['--pack', pack] : ['--changed', ...files.flatMap(file => ['--changed-file', file])]),
  ], { cwd: trustedRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
}

export function applyAgentChoice(plan, advice, readPlan = readExistingPlan) {
  const metadata = { classifierPack: plan.pack, agentAdvice: advice }
  if (plan.pack === 'all') return { ...plan, ...metadata }
  try {
    if (advice.status !== 'valid') {
      const selected = readPlan(null, 'all')
      return { ...plan, ...metadata, pack: 'all', scripts: selected.scripts,
        reason: `agent-advice-${advice.status}` }
    }
    const selected = readPlan(null, advice.pack)
    // Advice may only broaden coverage: accept it only when its pack's script
    // set contains every script the classifier already selected.
    if (!Array.isArray(plan.scripts)
      || !plan.scripts.every((script) => selected.scripts.includes(script))) {
      return { ...plan, ...metadata, reason: 'agent-advice-below-classifier' }
    }
    return { ...plan, ...metadata, pack: advice.pack, scripts: selected.scripts, reason: 'agent-selected' }
  } catch {
    return { ...plan, ...metadata, pack: 'all', scripts: readPlan(null, 'all').scripts, reason: 'agent-selection-failed' }
  }
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

export function planPullRequest({ repository, base, head, tested, eventPath }) {
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
  const plan = { ...selected, base, head, tested, policySource: base }
  return applyAgentChoice(plan, eventPath ? adviceFromEvent(eventPath, plan) : { status: 'missing' })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repository, base, head, tested, eventPath] = process.argv.slice(2)
  console.log(JSON.stringify(planPullRequest({ repository, base, head, tested, eventPath }), null, 2))
}
