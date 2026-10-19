#!/usr/bin/env node

// Offline wrapper integration: gh, security, node and sleep are fixtures; no SSH runs.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const fixture = mkdtempSync(path.join(tmpdir(), 'eqb-local-deploy-test-'))
const checkout = path.join(fixture, "checkout with 'quote")
const bin = path.join(fixture, 'bin')
const callsPath = path.join(fixture, 'calls.jsonl')
const config = path.join(fixture, 'config')
const wrapper = path.join(checkout, 'scripts/local-deploy.sh')
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim()
const executable = (name, body) => writeFileSync(path.join(bin, name), body, { mode: 0o700 })
const calls = () => readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
let checks = 0

function run({ args = ['api', 'repos/example/repository'], failures = 0, branch = 'main', dirty = false, stale = false } = {}) {
  git('checkout', '--quiet', branch)
  git('update-ref', 'refs/remotes/origin/main', stale ? previousSha : mainSha)
  if (dirty) writeFileSync(path.join(checkout, 'untracked.txt'), 'preserve me\n')
  writeFileSync(callsPath, '')
  const result = spawnSync('/bin/sh', [wrapper, 'plan'], {
    encoding: 'utf8',
    env: {
      HOME: fixture,
      PATH: `${bin}:/usr/bin:/bin`,
      EQB_DEPLOY_CONFIG: config,
      EQB_DEPLOY_DIRECT_INTERFACE: 'none',
      FIXTURE_ARGS: JSON.stringify(args),
      FIXTURE_FAILURES: String(failures),
      FIXTURE_CALLS: callsPath,
    },
  })
  if (dirty) rmSync(path.join(checkout, 'untracked.txt'))
  return { ...result, calls: calls() }
}

function check(label, callback) {
  callback()
  checks += 1
  console.log(`PASS ${label}`)
}

let previousSha
let mainSha
try {
  mkdirSync(path.dirname(wrapper), { recursive: true })
  mkdirSync(bin)
  mkdirSync(config)
  copyFileSync(path.join(repositoryRoot, 'scripts/local-deploy.sh'), wrapper)
  writeFileSync(path.join(config, 'env'), 'QUESTION_BANK_DEPLOY_SSH_HOST=fixture.invalid\n')
  writeFileSync(path.join(config, 'known_hosts'), 'fixture.invalid ssh-ed25519 fixture-only\n')
  git('init', '--quiet', '--initial-branch=main')
  git('add', 'scripts/local-deploy.sh')
  const tree = git('write-tree')
  // Raw fixture objects avoid relying on or changing the runner's Git identity.
  const commitObject = parent => execFileSync('git', ['-C', checkout, 'hash-object', '-t', 'commit', '-w', '--stdin'], {
    encoding: 'utf8',
    input: `tree ${tree}\n${parent ? `parent ${parent}\n` : ''}author Offline Fixture <fixture@example.invalid> 1 +0000\ncommitter Offline Fixture <fixture@example.invalid> 1 +0000\n\nOffline wrapper fixture\n`,
  }).trim()
  previousSha = commitObject()
  mainSha = commitObject(previousSha)
  git('update-ref', 'refs/heads/main', mainSha)
  git('branch', 'topic')

  const logCall = `const log = (kind, args) => fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ kind, args }) + '\\n')`
  executable('gh', `#!${process.execPath}
const fs = require('node:fs')
${logCall}
const args = process.argv.slice(2)
log('gh', args)
const attempts = fs.readFileSync(process.env.FIXTURE_CALLS, 'utf8').trim().split('\\n').map(JSON.parse).filter(call => call.kind === 'gh').length
if (attempts <= Number(process.env.FIXTURE_FAILURES)) {
  process.stdout.write('partial JSON')
  process.stderr.write('fixture: unexpected EOF\\n')
  process.exit(17)
}
process.stdout.write('{"ok":true}\\n')
`)
  executable('security', `#!${process.execPath}
const fs = require('node:fs')
${logCall}
log('security', process.argv.slice(2))
process.stdout.write('OFFLINE_FIXTURE_NOT_A_PRIVATE_KEY\\n')
`)
  executable('sleep', '#!/bin/sh\nexit 0\n')
  executable('node', `#!${process.execPath}
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
${logCall}
log('node', process.argv.slice(2))
const result = spawnSync('gh', JSON.parse(process.env.FIXTURE_ARGS), { stdio: 'inherit' })
process.exit(result.status ?? 1)
`)

  for (const args of [
    ['api', '--hostname', 'github.com', 'repos/Buqisir/english-question-bank/git/ref/heads/main'],
    ['api', 'repos/example/repository/actions/workflows/verify.yml/runs?page=2'],
    ['api', 'repos/example/repository/actions/runs/40/attempts/1'],
    ['api', 'repos/example/repository/check-suites/50'],
    ['api', 'repos/example/repository/actions/runs/40/attempts/1/jobs?page=2'],
    ['api', '--method', 'GET', 'repos/example/repository'],
    ['api', '-X', 'GET', 'repos/example/repository'],
    ['api', '-XGET', 'repos/example/repository'],
    ['api', '--method=GET', 'repos/example/repository'],
  ]) {
    check(`read-only EOF retries without exposing failed output: ${args.join(' ')}`, () => {
      const result = run({ args, failures: 2 })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, '{"ok":true}\n')
      assert.equal(result.stderr, '')
      assert.equal(result.calls.filter(call => call.kind === 'gh').length, 3)
    })
  }
  check('exhausted reads fail after four attempts with only final stderr', () => {
    const result = run({ failures: 8 })
    assert.equal(result.status, 17)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, 'fixture: unexpected EOF\n')
    assert.equal(result.calls.filter(call => call.kind === 'gh').length, 4)
  })
  for (const args of [
    ['api', 'graphql'],
    ['api', '/graphql'],
    ['api', 'https://api.github.com/graphql'],
    ['api', 'repos/example/repository', '-X', 'POST'],
    ['api', 'repos/example/repository', '--method=PATCH'],
    ['api', 'repos/example/repository', '-f', 'name=test'],
    ['api', 'repos/example/repository', '-Fname=test'],
    ['api', 'repos/example/repository', '--field=name=test'],
    ['api', 'repos/example/repository', '--raw-field', 'name=test'],
    ['api', 'repos/example/repository', '--input=-'],
    ['api', '-X', 'GET', '-XPOST', 'repos/example/repository'],
    ['api', '-X', 'GET', '--field', 'name=test', 'repos/example/repository'],
    ['repo', 'edit', '--description', 'fixture'],
  ]) {
    check(`potential writes execute once: ${args.join(' ')}`, () => {
      const result = run({ args, failures: 8 })
      assert.equal(result.status, 17)
      assert.equal(result.calls.filter(call => call.kind === 'gh').length, 1)
      assert.equal(result.calls.filter(call => call.kind === 'node').length, 1)
    })
  }
  for (const [label, options, diagnostic] of [
    ['detached HEAD', { branch: mainSha }, /detached HEAD/u],
    ['non-main branch', { branch: 'topic' }, /topic/u],
    ['dirty workspace', { dirty: true }, /工作区必须干净/u],
    ['HEAD differs from origin/main', { stale: true }, /HEAD.*origin\/main/u],
  ]) {
    check(`${label} fails before credentials and external reads with copyable repair commands`, () => {
      const result = run(options)
      assert.equal(result.status, 1)
      assert.match(result.stderr, diagnostic)
      assert.match(result.stderr, /git -C '.+' (?:status|switch|fetch)/u)
      assert.equal(result.calls.length, 0)
      if (options.dirty) {
        const command = result.stderr.split('\n').find(line => line.startsWith('git -C '))
        assert.equal(spawnSync('/bin/sh', ['-c', command]).status, 0, 'quoted repair path must execute')
      }
    })
  }
  check('untracked files fail even when Git config hides them from status', () => {
    git('config', 'status.showUntrackedFiles', 'no')
    try {
      const result = run({ dirty: true })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /工作区必须干净/u)
      assert.equal(result.calls.length, 0)
    } finally {
      git('config', '--unset', 'status.showUntrackedFiles')
    }
  })
  check('behind origin/main gives fetch and fast-forward instructions without moving HEAD', () => {
    git('checkout', '--quiet', 'main')
    git('update-ref', 'refs/heads/main', previousSha)
    const result = run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /HEAD.*origin\/main/u)
    assert.match(result.stderr, /fetch origin/u)
    assert.match(result.stderr, /merge --ff-only origin\/main/u)
    assert.equal(git('rev-parse', 'HEAD'), previousSha)
    assert.equal(result.calls.length, 0)
  })
  console.log(`\n${checks} offline local-deploy checks passed`)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
