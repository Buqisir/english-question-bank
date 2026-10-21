import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Review verifiers share this setup, including when they import another verifier
// for fixtures. Children/threads inherit the root; only its creator cleans it up.
const key = 'EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT'
const marker = '.review-test-lock-root'
const inherited = process.env[key]
let owned = false
export const reviewTestLockRoot = inherited === undefined
  ? mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-test-locks-'))
  : inherited
if (!path.isAbsolute(reviewTestLockRoot)
  || path.resolve(reviewTestLockRoot) === path.join(realpathSync('/tmp'), 'eqb-review-content-v1')) {
  throw new Error('Verifier requires an isolated Review test lock root')
}
if (inherited === undefined) {
  owned = true
  writeFileSync(path.join(reviewTestLockRoot, marker), JSON.stringify({ uid: process.getuid(), pid: process.pid }),
    { flag: 'wx', mode: 0o600 })
} else {
  const stat = lstatSync(reviewTestLockRoot)
  const owner = JSON.parse(readFileSync(path.join(reviewTestLockRoot, marker), 'utf8'))
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || owner.uid !== process.getuid() || (stat.mode & 0o077)) {
    throw new Error('Inherited Review test lock root has ambiguous ownership')
  }
}
process.env[key] = reviewTestLockRoot
process.once('exit', () => {
  if (owned) rmSync(reviewTestLockRoot, { recursive: true, force: true })
})
