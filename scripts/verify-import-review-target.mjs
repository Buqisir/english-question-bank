import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const sandbox = mkdtempSync(path.join(tmpdir(), 'eqb-review-target-'))
try {
  mkdirSync(path.join(sandbox, 'scripts/import-pipeline'), { recursive: true })
  mkdirSync(path.join(sandbox, '.amp'))
  for (const dir of ['server', 'shared', 'import-ops']) symlinkSync(path.join(root, dir), path.join(sandbox, dir))
  for (const entry of readdirSync(path.join(root, 'scripts/import-pipeline'))) {
    const from = path.join(root, 'scripts/import-pipeline', entry)
    const to = path.join(sandbox, 'scripts/import-pipeline', entry)
    if (entry === 'review.mjs') copyFileSync(from, to)
    else symlinkSync(from, to)
  }
  const profile = path.join(sandbox, '.amp/orb-profile')
  const binding = path.join(sandbox, '.amp/import-review-origin')
  const spy = path.join(sandbox, 'fetch-called')
  const preload = `import {writeFileSync} from 'node:fs'; globalThis.fetch=async (url,init)=>{writeFileSync(${JSON.stringify(spy)},String(url)); if(init.redirect!=='error')throw Error('redirects permitted');return new Response('{}',{headers:{'content-type':'application/json'}})}`
  function run(actual) {
    rmSync(spy, { force: true })
    return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
      path.join(sandbox, 'scripts/import-pipeline/review.mjs'), 'status', 'paper-target-test'], {
      encoding: 'utf8', env: { ...process.env, QUESTION_BANK_IMPORT_OPS_ORIGIN: actual,
        QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'test-only-not-a-real-token' },
    })
  }
  writeFileSync(profile, 'import\n')
  let result = run('https://production.invalid')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /IMPORT_REVIEW_TARGET_UNBOUND/)
  assert.equal(existsSync(spy), false, 'unbound import must not send a request')
  writeFileSync(binding, 'http://127.0.0.1:18887\n')
  for (const actual of ['https://production.invalid', 'http://127.0.0.1:18888']) {
    result = run(actual)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /IMPORT_REVIEW_TARGET_MISMATCH/)
    assert.equal(existsSync(spy), false, 'environment overwrite must stop before fetch')
  }
  result = run('http://127.0.0.1:18887/')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(spy), true)
  writeFileSync(binding, 'https://production.invalid/unexpected-path')
  result = run('https://production.invalid')
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(spy), false, 'malformed binding cannot fall back to environment')
  console.log('PASS Review CLI disk-bound target: missing/mismatched binding sends zero requests; exact origin works without redirects')
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
