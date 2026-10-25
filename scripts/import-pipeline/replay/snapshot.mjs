import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
  const read = (relative) => worktree ? readFileSync(path.join(worktree, relative), 'utf8') : git(repo, ['show', `${sha}:${relative}`])
  const write = (relative, bytes) => {
    files.set(relative, sha256(bytes))
    const target = path.join(directory, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  // Explicitly supported package subpath; copy its installed dependency graph so
  // workers cannot resolve arbitrary packages from the surrounding worktree.
  let externalReady = false
  const supportAjv = () => {
    if (externalReady) return
    externalReady = true
    const lockPath = 'server/package-lock.json'
    const lock = read(lockPath)
    const installedRoot = worktree || repo
    if (lock !== readFileSync(path.join(installedRoot, lockPath), 'utf8')) {
      throw new Error('Replay external dependencies require the matching server lockfile')
    }
    write(lockPath, lock)
    const lockedPackages = JSON.parse(lock).packages
    const copyPackage = (name, parent, target) => {
      const manifestPath = createRequire(parent).resolve(`${name}/package.json`)
      const sourceRoot = path.dirname(manifestPath)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const installedPath = path.relative(path.join(installedRoot, 'server'), sourceRoot).split(path.sep).join('/')
      if (lockedPackages[installedPath]?.version !== manifest.version) {
        throw new Error(`Replay installed dependency differs from lockfile: ${name}`)
      }
      const copy = (from, to) => {
        for (const entry of readdirSync(from, { withFileTypes: true })) {
          if (entry.name === 'node_modules') continue
          const source = path.join(from, entry.name)
          const relative = path.posix.join(to, entry.name)
          if (entry.isDirectory()) copy(source, relative)
          else if (entry.isFile()) write(relative, readFileSync(source))
          else throw new Error(`Unsupported replay dependency file: ${source}`)
        }
      }
      copy(sourceRoot, target)
      for (const dependency of Object.keys(manifest.dependencies || {})) {
        copyPackage(dependency, manifestPath, `${target}/node_modules/${dependency}`)
      }
    }
    copyPackage('ajv', path.join(installedRoot, 'server/package.json'), 'node_modules/ajv')
  }
  let supportedChannels = []
  const visit = (relative) => {
    if (files.has(relative)) return
    if (relative.startsWith('../') || path.isAbsolute(relative) || !/\.(?:mjs|json)$/u.test(relative)) {
      throw new Error(`Unsupported replay module: ${relative}`)
    }
    const source = read(relative)
    if (relative.endsWith('.json')) {
      JSON.parse(source)
      write(relative, source)
      return
    }
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
      else if (specifier === 'ajv/dist/2020.js') supportAjv()
      else if (!specifier.startsWith('node:')) throw new Error(`External replay dependency needs explicit support: ${specifier}`)
    }
    // These source-reference schemas are loaded eagerly through import.meta.url.
    // Freeze their exact ref bytes alongside modules, rather than reading live assets.
    if (relative === 'server/paper-import/sourceReferences.mjs') {
      for (const match of source.matchAll(/new URL\(\s*'(\.\.\/\.\.\/schemas\/paper-import\/source-references-v[1-4]\.schema\.json)',\s*import\.meta\.url\s*\)/gu)) {
        const resource = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]))
        write(resource, read(resource))
      }
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
