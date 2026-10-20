import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../', import.meta.url))

// Copy real runtime sources, including the current uncommitted fixes. Tests
// import/execute modules from this release; it is not an arbitrary build label.
export function makeReviewRelease(destination) {
  const files = execFileSync('git', ['-C', repository, 'ls-files', '--cached', '--others',
    '--exclude-standard', '-z', '--', 'server', 'shared', 'scripts', 'schemas', 'prompts', 'standards'],
  { encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const relative of files) {
    const output = path.join(destination, relative)
    mkdirSync(path.dirname(output), { recursive: true })
    copyFileSync(path.join(repository, relative), output)
  }
  symlinkSync(path.join(repository, 'server/node_modules'), path.join(destination, 'server/node_modules'), 'dir')
  mkdirSync(path.join(destination, 'app/src'), { recursive: true })
  return destination
}
