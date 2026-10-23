import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { digest, sha256 } from './corpus.mjs'

export const entryPath = 'scripts/import-pipeline/ocr-proofread.mjs'
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
export const resolveRef = (repo, ref) => git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]).trim()

// Export only the static relative module closure, without checking out paper/PDF/image assets.
// The appended exports expose existing helpers; no parser implementation is rewritten.
export function snapshot(repo, sha, directory, worktree = null) {
  if (worktree && resolveRef(worktree, 'HEAD') !== sha) throw new Error('Candidate worktree HEAD does not match candidate ref')
  const files = new Map()
  let supportedChannels = []
  const visit = (relative) => {
    if (files.has(relative)) return
    if (relative.startsWith('../') || path.isAbsolute(relative) || !relative.endsWith('.mjs')) {
      throw new Error(`Unsupported replay module: ${relative}`)
    }
    const source = worktree ? readFileSync(path.join(worktree, relative), 'utf8') : git(repo, ['show', `${sha}:${relative}`])
    if (/\bimport\s*\(/u.test(source)) throw new Error(`Unsupported dynamic import in replay module: ${relative}`)
    if (relative === entryPath) {
      supportedChannels = [
        ['R', 'buildSourceReferences'],
        ['T', 'buildTranscriptJoinDocuments'],
      ].filter(([, name]) => new RegExp(`export\\s+function\\s*\\*?\\s+${name}\\b`, 'u').test(source)).map(([channel]) => channel)
    }
    files.set(relative, sha256(source))
    const imports = /(?:^|\n)(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/gu
    for (const match of source.matchAll(imports)) {
      const specifier = match[1]
      if (specifier.startsWith('.')) visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier)))
      else if (!specifier.startsWith('node:')) throw new Error(`External replay dependency needs explicit support: ${specifier}`)
    }
    const target = path.join(directory, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, relative === entryPath
      ? `${source}\nexport { pageLines as replayPageLines, expand as replayExpand };\n` : source)
  }
  visit(entryPath)
  const modules = Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b)))
  return { sha, moduleDigest: digest(modules), modules, supportedChannels, workingTree: worktree ? path.resolve(worktree) : null }
}
