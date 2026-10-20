import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import { lstatSync, readdirSync, readFileSync, realpathSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'acorn'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

export const REVIEW_TARGET_BUILD_VERSION = 'review-target-build-v1'
const workerUrl = new URL('./reviewCompatibilityWorker.mjs', import.meta.url)
const releaseRoot = realpathSync(fileURLToPath(new URL('../../', workerUrl)))
// Temp directories and Secrets do not affect content. These non-secret values
// select execution behavior, public URLs or source conversion tools.
const runtimeKeys = ['NODE_ENV', 'EQB_ANALYZED_PACKAGE_FIXTURE_ONLY',
  'QUESTION_BANK_PUBLIC_ORIGIN', 'SOFFICE_PATH', 'PDFTOCAIRO_PATH']
const dataDirectories = ['standards', 'schemas', 'prompts']
const relative = absolute => path.relative(releaseRoot, absolute).split(path.sep).join('/')
const inside = absolute => {
  const value = relative(absolute)
  return value !== '..' && !value.startsWith('../') && !path.isAbsolute(value)
}
function invalid(message) {
  return Object.assign(new Error(message), { code: 'REVIEW_TARGET_IDENTITY_INVALID' })
}

function assertExecutionRoot({ repoRoot, workerModuleUrl } = {}) {
  if (repoRoot !== undefined && realpathSync(repoRoot) !== releaseRoot) {
    throw Object.assign(new Error('Target root differs from the executing worker release'), { code: 'REVIEW_TARGET_ROOT_MISMATCH' })
  }
  if (workerModuleUrl !== undefined && new URL(workerModuleUrl).href !== workerUrl.href) {
    throw Object.assign(new Error('Target worker URL differs from the executing worker module'), { code: 'REVIEW_TARGET_ROOT_MISMATCH' })
  }
}

function moduleSpecifiers(source, file) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
  const specifiers = []
  const pending = [ast]
  while (pending.length) {
    const node = pending.pop()
    if (!node || typeof node !== 'object') continue
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
      specifiers.push(node.source.value)
    } else if (node.type === 'ImportExpression') {
      const value = node.source.type === 'Literal' && typeof node.source.value === 'string'
        ? node.source.value
        : node.source.type === 'TemplateLiteral' && node.source.expressions.length === 0
          ? node.source.quasis[0].value.cooked : null
      if (value === null) throw invalid(`Non-literal dynamic import in ${file}`)
      specifiers.push(value)
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value)
      else if (value && typeof value === 'object') pending.push(value)
    }
  }
  return specifiers
}

// No caller-supplied root can label a different release. The worker also calls
// this using its own import.meta.url, independently of the supervising process.
export function computeReviewBuildIdentity(options = {}) {
  assertExecutionRoot(options)
  try {
    const files = new Map()
    const installedPackages = new Map()
    const importedPackages = new Map()
    function addFile(absolute) {
      if (!inside(absolute) || !inside(realpathSync(absolute))) throw invalid('Module escaped the executing release')
      const name = relative(absolute)
      if (files.has(name)) return false
      if (lstatSync(absolute).isSymbolicLink()) throw invalid(`Symlink in target build: ${name}`)
      const bytes = readFileSync(absolute)
      files.set(name, { repoRelativePosixPath: name,
        sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, byteLength: bytes.length })
      return bytes
    }
    function packageFor(absolute) {
      let directory = path.dirname(absolute)
      while (directory !== path.dirname(directory)) {
        const manifest = path.join(directory, 'package.json')
        if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, 'utf8'))
        directory = path.dirname(directory)
      }
      throw invalid('Imported package has no installed manifest')
    }
    function follow(specifier, importer) {
      if (isBuiltin(specifier)) return
      let absolute
      if (specifier.startsWith('.') || specifier.startsWith('file:')) {
        absolute = fileURLToPath(new URL(specifier, pathToFileURL(importer)))
      } else if (path.isAbsolute(specifier)) absolute = specifier
      else {
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
        let directory = path.dirname(importer)
        while (directory !== path.dirname(directory)) {
          const manifest = path.join(directory, 'node_modules', name, 'package.json')
          if (existsSync(manifest)) {
            const installed = JSON.parse(readFileSync(manifest, 'utf8'))
            importedPackages.set(installed.name, installed.version)
            return
          }
          directory = path.dirname(directory)
        }
        throw invalid(`Unresolved module ${specifier} from ${relative(importer)}`)
      }
      absolute = path.resolve(absolute)
      if (absolute.split(path.sep).includes('node_modules')) {
        const installed = packageFor(absolute)
        importedPackages.set(installed.name, installed.version)
        return
      }
      const name = relative(absolute)
      if (/^app\/(?:src|dist)\//.test(name)) {
        // Frontend code is not implicitly content authority. If a future
        // comparator imports it, require an explicit reviewed content reason.
        throw invalid(`Undeclared frontend content dependency: ${relative(importer)} -> ${name}`)
      }
      visit(absolute)
    }
    function visit(absolute) {
      const bytes = addFile(absolute)
      if (/\.(?:[cm]?ts|tsx|jsx)$/.test(absolute)) throw invalid(`Unsupported module grammar: ${relative(absolute)}`)
      if (bytes === false || !/\.(?:mjs|js|cjs)$/.test(absolute)) return
      for (const specifier of moduleSpecifiers(bytes.toString('utf8'), relative(absolute))) follow(specifier, absolute)
    }
    // This one execution entry reaches projection, Canonical, consumers and
    // the DOCX pipeline through actual imports, including literal import().
    visit(fileURLToPath(workerUrl))
    function data(directory) {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, item.name)
        if (item.isSymbolicLink()) throw invalid(`Symlink in runtime data: ${relative(absolute)}`)
        if (item.isDirectory()) data(absolute)
        else if (item.isFile()) addFile(absolute)
      }
    }
    for (const directory of dataDirectories) data(path.join(releaseRoot, directory))
    // Packages are represented by the runtime lock plus every installed locked
    // version (including transitive dependencies); dependency bytes remain
    // under the trusted lockfile/install/deployment boundary.
    const lockPath = path.join(releaseRoot, 'server/package-lock.json')
    addFile(path.join(releaseRoot, 'server/package.json'))
    addFile(lockPath)
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    for (const [packagePath, entry] of Object.entries(lock.packages)) {
      if (!packagePath.includes('node_modules/') || !entry.version) continue
      const manifest = path.join(path.dirname(lockPath), packagePath, 'package.json')
      if (!existsSync(manifest)) continue // Optional/platform-specific installs.
      const installed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (installed.version !== entry.version) throw invalid(`Installed package differs from lock: ${installed.name}`)
      installedPackages.set(`${installed.name}@${installed.version}`, {
        packagePath: `server/${packagePath}`, name: installed.name, version: installed.version,
      })
    }
    for (const [name, version] of importedPackages) {
      if (!installedPackages.has(`${name}@${version}`)) throw invalid(`Imported package is not locked: ${name}`)
    }
    const descriptor = { schemaVersion: REVIEW_TARGET_BUILD_VERSION, moduleGraphVersion: 'review-target-import-graph-v1',
      files: [...files.values()].sort((a, b) => a.repoRelativePosixPath < b.repoRelativePosixPath ? -1 : a.repoRelativePosixPath > b.repoRelativePosixPath ? 1 : 0),
      installedPackages: [...installedPackages.values()].sort((a, b) => a.packagePath < b.packagePath ? -1 : a.packagePath > b.packagePath ? 1 : 0),
      nodeVersion: process.version, runtimeConfig: Object.fromEntries(runtimeKeys.map(key => [key, process.env[key] ?? null])) }
    return Object.freeze({ ...descriptor, targetBuildId: digestJson(descriptor), releaseRoot })
  } catch (error) {
    if (error.code === 'REVIEW_TARGET_IDENTITY_INVALID') throw error
    throw invalid(`Unable to fingerprint executing release: ${error.message}`)
  }
}

export function reviewBuildIdentityProvider(options = {}) {
  assertExecutionRoot(options)
  const production = options.production ?? process.env.NODE_ENV === 'production'
  let cached
  const fresh = () => computeReviewBuildIdentity()
  const provider = () => production ? (cached ??= fresh()) : fresh()
  provider.fresh = fresh
  return provider
}
