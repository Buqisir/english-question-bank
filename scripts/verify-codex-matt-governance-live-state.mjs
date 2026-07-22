#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entrypointPath = path.join(root, 'docs/cuts/codex-matt-governance/agent-entrypoint.md')
const text = readFileSync(entrypointPath, 'utf8')

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function section(name, required = true) {
  const match = text.match(new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))
  if (!match && required) fail(`missing ${name} section`)
  return match?.[1] ?? ''
}

function field(source, label) {
  const matches = [...source.matchAll(new RegExp('^- ' + label + ': `([^`]+)`$', 'gm'))]
  if (matches.length !== 1) fail(`${label} must appear exactly once`)
  return matches[0][1]
}

const identity = section('Identity')
const lifecycle = field(identity, 'Lifecycle state')
const activeRole = field(identity, 'Active role')
const sourceBranch = field(identity, 'Source branch')
const currentWorktree = field(identity, 'Current worktree')
const releasedInputHead = field(identity, 'Released input head')
const authorization = section('Direct successor authorization', false)
const authorizedRole = authorization ? field(authorization, 'Authorized role') : ''
const topology = authorization ? field(authorization, 'Topology') : ''
const model = authorization ? field(authorization, 'Configured model') : ''
const thinking = authorization ? field(authorization, 'Thinking') : ''
const scope = authorization ? field(authorization, 'Scope') : ''
const nextAction = section('Next Action')

const states = new Set(['active', 'handoff-ready', 'human-QA', 'blocked', 'closed'])
if (!states.has(lifecycle)) fail(`unsupported lifecycle state: ${lifecycle}`)
if (!sourceBranch || !currentWorktree) fail('source branch and current worktree are required')
if (!/^([0-9a-f]{40})$/.test(releasedInputHead)) fail('released input head must be a full commit hash')
if (!/^1\. /.test(nextAction.trim()) || /^\d+\. /gm.test(nextAction.trim().replace(/^1\. .*$/m, ''))) {
  fail('Next Action must contain exactly one numbered action')
}

const successorPresent = authorization.length > 0
if (lifecycle === 'handoff-ready') {
  if (activeRole !== 'none') fail('handoff-ready requires Active role: none')
  if (!successorPresent || authorizedRole !== 'fresh verification') fail('handoff-ready requires one fresh verification successor')
  if (topology !== 'exactly one top-level create_thread successor') fail('handoff-ready successor must be top-level create_thread')
  if (model !== 'gpt-5.6-terra' || thinking !== 'medium') fail('verification route must be gpt-5.6-terra/medium')
  if (!scope.startsWith('verification only;')) fail('successor scope must be verification only')
} else if (lifecycle === 'active') {
  if (activeRole === 'none') fail('active requires exactly one active role')
  if (successorPresent) fail('active cannot retain successor authorization')
} else if (lifecycle === 'human-QA') {
  if (activeRole !== 'owner-QA' || successorPresent) fail('human-QA requires owner-QA and no successor')
} else if (lifecycle === 'blocked' || lifecycle === 'closed') {
  if (activeRole !== 'none' || successorPresent) fail(`${lifecycle} requires no active role or successor`)
}

try {
  execFileSync('git', ['cat-file', '-e', `${releasedInputHead}^{commit}`], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['merge-base', '--is-ancestor', releasedInputHead, 'HEAD'], { cwd: root, stdio: 'ignore' })
} catch {
  fail('released input head must exist and be an ancestor of HEAD')
}

console.log('PASS: codex-matt-governance live state is structurally valid')
