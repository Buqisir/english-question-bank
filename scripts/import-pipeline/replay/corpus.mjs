import { createHash } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export const digest = (value) => sha256(stable(value))
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const hashBuffer = Buffer.allocUnsafe(1024 * 1024)

function fingerprint(file) {
  const descriptor = openSync(file, 'r')
  const hash = createHash('sha256')
  let bytes = 0
  try {
    let count
    while ((count = readSync(descriptor, hashBuffer, 0, hashBuffer.length, null)) > 0) {
      bytes += count
      hash.update(hashBuffer.subarray(0, count))
    }
  } finally {
    closeSync(descriptor)
  }
  return { bytes, sha256: hash.digest('hex') }
}

export function frozenPath(directory, file) {
  if (!file.frozenPath || path.isAbsolute(file.frozenPath)) throw new Error('Invalid frozen path')
  const resolved = path.resolve(directory, file.frozenPath)
  if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Frozen path escapes corpus')
  return resolved
}

export function verifyCorpus(directory) {
  const manifest = readJson(path.join(directory, 'manifest.json'))
  const { corpusDigest, ...body } = manifest
  if (manifest.schemaVersion !== 'eqb-replay-corpus-v1' || digest(body) !== corpusDigest) {
    throw new Error('Corpus manifest digest changed')
  }
  for (const paper of manifest.papers) {
    for (const file of Object.values(paper.inputs)) {
      if (file.missingReason) continue
      const actual = fingerprint(frozenPath(directory, file))
      if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
        throw new Error(`Corpus input digest changed: ${paper.paperId} ${file.type} ${file.sourcePath}`)
      }
    }
  }
  return manifest
}

export function freezeCorpus(sourceRoot, destinationRoot = path.join(os.homedir(), 'Projects/eqb-replay-corpus')) {
  const paperRoot = path.join(sourceRoot, 'scripts/import-pipeline/papers')
  const papers = []
  const copies = new Map()
  for (const paperId of readdirSync(paperRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('paper-')).map((entry) => entry.name).sort()) {
    const paperDir = path.join(paperRoot, paperId)
    const work = path.join(sourceRoot, 'imports/ocr-proofread', paperId)
    const inputs = {}
    const add = (type, sourcePath) => {
      if (!existsSync(sourcePath)) {
        inputs[type] = { type, sourcePath, missingReason: 'file_missing' }
        return null
      }
      const bytes = readFileSync(sourcePath)
      const sha = sha256(bytes)
      inputs[type] = { type, sourcePath, bytes: bytes.length, sha256: sha, frozenPath: `inputs/${sha}.json` }
      copies.set(sha, sourcePath)
      return JSON.parse(bytes.toString('utf8'))
    }
    add('materialization', path.join(paperDir, 'materialization/nck1-source-materialization-v1.json'))
    add('evidence', path.join(paperDir, 'materialization/nck1-ocr-source-evidence-v1.json'))
    add('confirmation', path.join(paperDir, 'materialization/nck1-ocr-source-confirmation-v1.json'))
    add('manifest', path.join(paperDir, 'universal-source-manifest.json'))
    const trace = add('trace', path.join(work, 'trace.json'))
    for (const page of trace?.pages || []) {
      if (!/^[a-zA-Z0-9_-]+$/u.test(page.key)) throw new Error(`Unsafe trace page key: ${page.key}`)
      add(`draft:${page.key}`, path.join(work, 'drafts', `${page.key}.json`))
    }
    const missing = (types) => types.filter((type) => inputs[type]?.missingReason)
    const rMissing = missing(['materialization', 'evidence', 'confirmation'])
    const tMissing = missing(['manifest', 'trace', ...Object.keys(inputs).filter((key) => key.startsWith('draft:'))])
    if (trace && !trace.pages?.length) tMissing.push('trace.pages(empty)')
    papers.push({ paperId, inputs, channels: {
      R: { available: !rMissing.length, missing: rMissing },
      T: { available: !tMissing.length, missing: tMissing },
    } })
  }
  const body = { schemaVersion: 'eqb-replay-corpus-v1', sourceRoot: path.resolve(sourceRoot), papers }
  const corpusDigest = digest(body)
  const directory = path.join(destinationRoot, corpusDigest)
  if (!existsSync(directory)) {
    mkdirSync(path.join(directory, 'inputs'), { recursive: true })
    for (const [sha, source] of copies) {
      const bytes = readFileSync(source)
      if (sha256(bytes) !== sha) throw new Error(`Source changed while freezing: ${source}`)
      const target = path.join(directory, 'inputs', `${sha}.json`)
      writeFileSync(target, bytes, { flag: 'wx', mode: 0o444 })
    }
    writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify({ ...body, corpusDigest }, null, 2)}\n`, {
      flag: 'wx', mode: 0o444,
    })
    chmodSync(path.join(directory, 'inputs'), 0o555)
    chmodSync(directory, 0o555)
  }
  verifyCorpus(directory)
  return { directory, corpusDigest, coverage: coverage(body) }
}

export function coverage(manifest) {
  return {
    papers: manifest.papers.length,
    R: manifest.papers.filter((paper) => paper.channels.R.available).length,
    T: manifest.papers.filter((paper) => paper.channels.T.available).length,
    both: manifest.papers.filter((paper) => paper.channels.R.available && paper.channels.T.available).length,
    neither: manifest.papers.filter((paper) => !paper.channels.R.available && !paper.channels.T.available).length,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: corpus.mjs <source-worktree> [corpus-parent]')
    console.log(JSON.stringify(freezeCorpus(path.resolve(process.argv[2]), process.argv[3]), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
