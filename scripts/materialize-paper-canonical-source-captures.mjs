import { readFile, readdir, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const manifestRelativePath = 'docs/cuts/paper-canonical-unification/migration/manifest-v1.json'
const ledgerRelativePath = 'docs/cuts/paper-canonical-unification/migration/ledger-v1.json'
const materializerVersion = 'ticket-26-source-materialization-v1'
const requiredEvidenceKinds = ['asset-projection', 'source-provenance', 'official-answer-lead']
const figureInventoryRole = 'figure-inventory'
const figureMediaRole = 'figure-media'
const captureBatches = {
  v1: {
    outputRelativePath: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1',
    excludedPaperIds: ['paper-2025-i', 'paper-2026-i'],
    expectedMaterializedPaperCount: 31,
  },
  v2: {
    outputRelativePath: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2',
    excludedPaperIds: ['paper-2025-i'],
    expectedMaterializedPaperCount: 32,
  },
}

function fail(message) {
  throw new Error(`[ticket-26] ${message}`)
}

function asSha256(value) {
  if (typeof value !== 'string' || value.length === 0) fail(`invalid SHA-256 value: ${String(value)}`)
  return value.startsWith('sha256:') ? value : `sha256:${value}`
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function relativePathFromArgument(value, batch) {
  const requested = value || batch.outputRelativePath
  const absolute = path.resolve(rootDir, requested)
  const relative = path.relative(rootDir, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`output directory must stay inside the repository: ${requested}`)
  }
  const normalizedRelative = relative.split(path.sep).join('/')
  if (normalizedRelative !== batch.outputRelativePath) {
    fail(`batch ${batch.version} output must be ${batch.outputRelativePath}`)
  }
  return { absolute, relative: normalizedRelative }
}

function parseArgs(argv) {
  const options = { mode: null, output: null, batchVersion: 'v2' }
  for (const argument of argv) {
    if (argument === '--write' || argument === '--check') {
      if (options.mode && options.mode !== argument.slice(2)) fail('choose exactly one of --write or --check')
      options.mode = argument.slice(2)
      continue
    }
    if (argument.startsWith('--output=')) {
      options.output = argument.slice('--output='.length)
      continue
    }
    if (argument.startsWith('--batch=')) {
      options.batchVersion = argument.slice('--batch='.length)
      continue
    }
    if (argument === '--help') {
      console.log('Usage: node scripts/materialize-paper-canonical-source-captures.mjs --write|--check [--batch=v1|v2] [--output=<exact-batch-dir>]')
      process.exit(0)
    }
    fail(`unknown argument: ${argument}`)
  }
  if (!options.mode) fail('one of --write or --check is required')
  return options
}

function captureBatch(batchVersion) {
  const definition = captureBatches[batchVersion]
  if (!definition) fail(`unknown capture batch: ${batchVersion}`)
  return { version: batchVersion, ...definition }
}

async function readJson(relativePath) {
  const bytes = await readFile(path.join(rootDir, relativePath))
  try {
    return { value: JSON.parse(bytes.toString('utf8')), bytes }
  } catch (error) {
    fail(`cannot parse ${relativePath}: ${error.message}`)
  }
}

async function pathExists(absolutePath) {
  try {
    await readFile(absolutePath)
    return true
  } catch (error) {
    if (error.code === 'EISDIR') return true
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function validateUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`)
}

function normalizePaperList(manifest, ledger, batch) {
  if (manifest?.schemaVersion !== 'paper-canonical-migration-manifest-v1') {
    fail('manifest schema version is not paper-canonical-migration-manifest-v1')
  }
  if (ledger?.schemaVersion !== 'paper-canonical-migration-ledger-v1') {
    fail('ledger schema version is not paper-canonical-migration-ledger-v1')
  }
  if (manifest?.binding?.corpusRoot !== 'app/public/paper-assets') {
    fail('manifest corpus root is not app/public/paper-assets')
  }
  if (manifest?.binding?.corpusSelector !== '*/latest') {
    fail('manifest corpus selector is not */latest')
  }
  if (manifest?.binding?.sourceAuthority !== 'checked-in latest bytes, not import config or DB version paths') {
    fail('manifest source authority changed')
  }

  const manifestPapers = [...(manifest.papers || [])].sort((left, right) => left.paperId.localeCompare(right.paperId))
  const manifestPaperIds = manifestPapers.map((paper) => paper.paperId)
  validateUnique(manifestPaperIds, 'manifest paper ids')
  if (manifestPaperIds.length !== 33) fail(`expected frozen denominator 33, found ${manifestPaperIds.length}`)
  for (const paperId of batch.excludedPaperIds) {
    if (!manifestPaperIds.includes(paperId)) fail(`excluded seam paper is absent from manifest: ${paperId}`)
  }

  const queueEntries = (ledger?.queue?.entries || []).filter((entry) => entry.paperId !== null)
  const queueByPaperId = new Map(queueEntries.map((entry) => [entry.paperId, entry]))
  validateUnique(queueEntries.map((entry) => entry.paperId), 'ledger paper ids')
  if (queueEntries.length !== 33) fail(`expected 33 paper queue entries, found ${queueEntries.length}`)

  const excludedPaperIds = new Set(batch.excludedPaperIds)
  const materializedPapers = manifestPapers.filter((paper) => !excludedPaperIds.has(paper.paperId))
  if (materializedPapers.length !== batch.expectedMaterializedPaperCount) {
    fail(`batch ${batch.version} expected ${batch.expectedMaterializedPaperCount} remaining papers, found ${materializedPapers.length}`)
  }
  if (materializedPapers.length + excludedPaperIds.size !== manifestPaperIds.length) {
    fail(`batch ${batch.version} membership does not partition the frozen denominator`)
  }

  return materializedPapers.map((manifestPaper) => {
    const queueEntry = queueByPaperId.get(manifestPaper.paperId)
    if (!queueEntry) fail(`ledger entry missing for ${manifestPaper.paperId}`)
    if (queueEntry.status !== 'queued' || queueEntry.primaryDisposition !== 'queued') {
      fail(`${manifestPaper.paperId} is not still queued in the frozen ledger`)
    }
    const latestFiles = new Map((manifestPaper.latestTree?.files || []).map((file) => [file.path, file]))
    const refs = queueEntry.immutableEvidenceRefs || []
    if (refs.length !== requiredEvidenceKinds.length) {
      fail(`${manifestPaper.paperId} has ${refs.length} evidence refs; expected ${requiredEvidenceKinds.length}`)
    }
    const refKinds = refs.map((ref) => ref.kind)
    if (refKinds.join('\u0000') !== requiredEvidenceKinds.join('\u0000')) {
      fail(`${manifestPaper.paperId} evidence role order changed: ${refKinds.join(', ')}`)
    }

    const sourceRefs = refs.map((ref) => {
      const latestFile = latestFiles.get(ref.path)
      if (!latestFile) fail(`${manifestPaper.paperId} evidence ref is absent from its frozen latest tree: ${ref.path}`)
      if (latestFile.role !== ref.kind) {
        fail(`${manifestPaper.paperId} role mismatch for ${ref.path}: ${latestFile.role} != ${ref.kind}`)
      }
      if (latestFile.byteLength !== ref.byteLength) {
        fail(`${manifestPaper.paperId} byte length mismatch for ${ref.path}`)
      }
      if (asSha256(latestFile.sha256) !== asSha256(ref.sha256)) {
        fail(`${manifestPaper.paperId} frozen digest mismatch for ${ref.path}`)
      }
      return { ...ref, expectedDigest: asSha256(ref.sha256) }
    })

    return {
      paperId: manifestPaper.paperId,
      orderKey: manifestPaper.paperId,
      latestTree: {
        path: manifestPaper.latestTree.path,
        fileCount: manifestPaper.latestTree.fileCount,
        byteLength: manifestPaper.latestTree.byteLength,
        treeDigest: asSha256(manifestPaper.latestTree.treeDigest),
      },
      sourceRefs,
      figureInventory: (() => {
        const inventories = [...latestFiles.values()].filter((file) => file.role === figureInventoryRole)
        if (inventories.length > 1) fail(`${manifestPaper.paperId} has more than one frozen figure inventory`)
        return inventories[0] || null
      })(),
      latestFiles,
    }
  })
}

function mediaTypeFor(relativePath) {
  if (relativePath.endsWith('.json')) return 'application/json'
  if (relativePath.endsWith('.pdf')) return 'application/pdf'
  if (relativePath.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (relativePath.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

function roleToken(role) {
  return role.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
}

function parseRootShape(bytes, relativePath) {
  if (mediaTypeFor(relativePath) !== 'application/json') {
    return { format: 'binary', byteLength: bytes.byteLength }
  }
  let value
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`frozen JSON source is unreadable: ${relativePath}: ${error.message}`)
  }
  if (value === null) return { format: 'json', rootType: 'null', entryCount: 0 }
  if (Array.isArray(value)) return { format: 'json', rootType: 'array', entryCount: value.length }
  if (typeof value !== 'object') return { format: 'json', rootType: typeof value, entryCount: 0 }
  return { format: 'json', rootType: 'object', entryCount: Object.keys(value).length }
}

function makeSourceDocument(paperId, sourceRef, bytes) {
  const digest = sha256(bytes)
  if (digest !== sourceRef.expectedDigest) {
    fail(`${paperId} source digest drift for ${sourceRef.path}: ${digest} != ${sourceRef.expectedDigest}`)
  }
  if (bytes.byteLength !== sourceRef.byteLength) {
    fail(`${paperId} source byte length drift for ${sourceRef.path}`)
  }

  const roles = [sourceRef.kind]
  const inputKey = sourceRef.inputKey || `latest_${roleToken(sourceRef.kind)}`
  const artifactId = stableId('source-document', { sha256: digest })
  const documentId = stableId('document', { digest, roles, inputKey })
  const artifactFile = `source-evidence/${artifactId.slice('source-document:'.length)}.bin`
  const document = {
    byteLength: bytes.byteLength,
    documentId,
    encodedBytes: bytes.toString('base64'),
    immutableArtifactRef: {
      artifactId,
      byteLength: bytes.byteLength,
      relativePath: artifactFile,
      sha256: digest,
    },
    inputKey,
    mediaType: mediaTypeFor(sourceRef.path),
    originalName: path.posix.basename(sourceRef.path),
    roles,
    sha256: digest,
  }
  return { document, artifactFile, bytes, inputKey, digest }
}

function sourceRefFromInventoryFile(file, kind, inputKey) {
  if (
    !file
    || typeof file.path !== 'string'
    || !Number.isInteger(file.byteLength)
    || file.byteLength < 1
    || typeof file.sha256 !== 'string'
  ) fail(`frozen ${kind} inventory entry is incomplete`)
  return {
    kind,
    inputKey,
    path: file.path,
    byteLength: file.byteLength,
    expectedDigest: asSha256(file.sha256),
  }
}

function parsedFigureInventory(bytes, paper) {
  let inventory
  try {
    inventory = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`${paper.paperId} frozen figure inventory is unreadable JSON: ${error.message}`)
  }
  if (
    !inventory
    || typeof inventory !== 'object'
    || Array.isArray(inventory)
    || inventory.schemaVersion !== 'paper-figures-manifest-v1'
    || inventory.paperId !== paper.paperId
    || !Array.isArray(inventory.figures)
    || inventory.figures.length === 0
  ) fail(`${paper.paperId} frozen figure inventory is not a closed paper-figures-manifest-v1`)
  const figureIds = new Set()
  const markers = new Set()
  return inventory.figures.map((figure, index) => {
    const expectedMarker = `[${figure?.kind === 'table' ? '表' : figure?.kind === 'figure' ? '图' : ''}: ${figure?.figureId}]`
    if (
      !figure
      || typeof figure !== 'object'
      || Array.isArray(figure)
      || Object.keys(figure).sort().join('\u0000') !== [
        'caption',
        'figureId',
        'file',
        'groupId',
        'kind',
        'note',
        'placeholderMarker',
        'sourceDocument',
        'sourcePage',
      ].join('\u0000')
      || typeof figure.figureId !== 'string'
      || figure.figureId.length === 0
      || typeof figure.groupId !== 'string'
      || figure.groupId.length === 0
      || !['figure', 'table'].includes(figure.kind)
      || typeof figure.file !== 'string'
      || figure.file.length === 0
      || figure.file !== path.posix.basename(figure.file)
      || typeof figure.caption !== 'string'
      || figure.caption.length === 0
      || typeof figure.sourceDocument !== 'string'
      || figure.sourceDocument.length === 0
      || !Number.isInteger(figure.sourcePage)
      || figure.sourcePage < 1
      || typeof figure.note !== 'string'
      || figure.placeholderMarker !== expectedMarker
      || figureIds.has(figure.figureId)
      || markers.has(figure.placeholderMarker)
    ) fail(`${paper.paperId} figure inventory entry ${index} is not an exact declared source bridge`)
    figureIds.add(figure.figureId)
    markers.add(figure.placeholderMarker)
    return figure
  })
}

async function figureSourceRefsForPaper(paper) {
  if (!paper.figureInventory) return []
  const inventoryRef = sourceRefFromInventoryFile(
    paper.figureInventory,
    figureInventoryRole,
    `latest_${roleToken(figureInventoryRole)}`,
  )
  const inventoryBytes = await readFile(path.join(rootDir, inventoryRef.path))
  if (inventoryBytes.byteLength !== inventoryRef.byteLength || sha256(inventoryBytes) !== inventoryRef.expectedDigest) {
    fail(`${paper.paperId} frozen figure inventory bytes drift from the manifest`)
  }
  const figures = parsedFigureInventory(inventoryBytes, paper)
  const inventoryDirectory = path.posix.dirname(inventoryRef.path)
  const mediaInputKeys = new Set()
  const mediaRefs = figures.map((figure) => {
    const figurePath = path.posix.join(inventoryDirectory, figure.file)
    const file = paper.latestFiles.get(figurePath)
    const inputKey = `latest_${roleToken(figureMediaRole)}_${roleToken(figure.figureId)}`
    if (
      !file
      || file.role !== 'corpus-extra'
      || mediaTypeFor(file.path) !== 'image/png'
      || mediaInputKeys.has(inputKey)
    ) fail(`${paper.paperId} figure ${figure.figureId} is not bound to one frozen PNG corpus extra`)
    mediaInputKeys.add(inputKey)
    return sourceRefFromInventoryFile(file, figureMediaRole, inputKey)
  })
  return [inventoryRef, ...mediaRefs]
}

async function sourceRefsForPaper(paper) {
  const sourceRefs = [...paper.sourceRefs, ...await figureSourceRefsForPaper(paper)]
  if (
    new Set(sourceRefs.map((sourceRef) => sourceRef.path)).size !== sourceRefs.length
    || new Set(sourceRefs.map((sourceRef) => sourceRef.inputKey || `latest_${roleToken(sourceRef.kind)}`)).size !== sourceRefs.length
  ) fail(`${paper.paperId} source capture document identities are not unique`)
  return sourceRefs
}

function makeCapture(paper, materializedDocuments) {
  const observations = []
  const sourceSpans = []
  let order = 0
  for (const source of materializedDocuments) {
    const token = roleToken(source.sourceRef.kind)
    const documentObservationId = `observation:ticket-26:${paper.paperId}:${token}:document`
    const parseObservationId = `observation:ticket-26:${paper.paperId}:${token}:json-root`
    const documentSpanId = `source-span:${documentObservationId}`
    const parseSpanId = `source-span:${parseObservationId}`
    const coordinate = { kind: 'byte_range', start: 0, end: source.bytes.byteLength }
    const spanBase = {
      documentDigest: source.digest,
      documentId: source.document.documentId,
    }
    observations.push({
      observationId: documentObservationId,
      kind: 'immutable_source_document',
      documentId: source.document.documentId,
      order: order++,
      sourceSpanId: documentSpanId,
      value: {
        byteLength: source.bytes.byteLength,
        path: source.sourceRef.path,
        role: source.sourceRef.kind,
        sha256: source.digest,
      },
      extraction: { adapterId: materializerVersion, version: '1' },
    })
    sourceSpans.push({ ...spanBase, sourceSpanId: documentSpanId, coordinate })
    observations.push({
      observationId: parseObservationId,
      kind: 'ordered_json_parse_observation',
      documentId: source.document.documentId,
      order: order++,
      sourceSpanId: parseSpanId,
      value: parseRootShape(source.bytes, source.sourceRef.path),
      extraction: { adapterId: materializerVersion, version: '1' },
    })
    sourceSpans.push({ ...spanBase, sourceSpanId: parseSpanId, coordinate })
  }

  const captureBase = {
    schemaVersion: 'source-capture-v1',
    documents: materializedDocuments.map(({ document }) => document),
    observations,
    sourceSpans,
    assertions: [],
  }
  return {
    ...captureBase,
    captureId: stableId('source-capture', captureBase),
    digest: digestJson(captureBase),
  }
}

async function buildMaterialization(batch) {
  const [{ value: manifest, bytes: manifestBytes }, { value: ledger, bytes: ledgerBytes }] = await Promise.all([
    readJson(manifestRelativePath),
    readJson(ledgerRelativePath),
  ])
  const papers = normalizePaperList(manifest, ledger, batch)
  const materialized = []

  for (const paper of papers) {
    const documents = []
    const sourceRefs = await sourceRefsForPaper(paper)
    for (const sourceRef of sourceRefs) {
      const bytes = await readFile(path.join(rootDir, sourceRef.path))
      documents.push({ sourceRef, ...makeSourceDocument(paper.paperId, sourceRef, bytes) })
    }
    const capture = makeCapture(paper, documents)
    materialized.push({ paper, sourceRefs, documents, capture })
  }

  const outputRelativePath = batch.outputRelativePath
  const batchBody = {
    schemaVersion: 'ticket-26-source-materialization-v1',
    materializerVersion,
    sourceAuthority: {
      manifest: {
        declaredDigest: asSha256(manifest.manifestDigest),
        fileSha256: sha256(manifestBytes),
        path: manifestRelativePath,
      },
      ledger: {
        declaredDigest: asSha256(ledger.ledgerDigest),
        fileSha256: sha256(ledgerBytes),
        path: ledgerRelativePath,
      },
      corpusRoot: manifest.binding.corpusRoot,
      corpusSelector: manifest.binding.corpusSelector,
      inputFixedPoint: manifest.binding.inputFixedPoint,
    },
    membership: {
      frozenPaperCount: 33,
      excludedPaperIds: [...batch.excludedPaperIds].sort(),
      materializedPaperCount: materialized.length,
      paperIds: materialized.map(({ paper }) => paper.paperId),
    },
    atomicBatch: {
      mode: 'all_or_none',
      outputRelativePath,
      preservesExistingBytes: true,
    },
    semanticBoundary: {
      sourceOnly: true,
      records: ['exact_source_bytes', 'whole_file_digests', 'roles', 'ordered_parse_observations'],
      excludes: [
        'profile',
        'answer_assertions',
        'question_groups',
        'teacher_confirmation',
        'canonical_paper',
        'readiness',
        'publication',
      ],
    },
    papers: materialized.map(({ paper, documents, capture }) => ({
      paperId: paper.paperId,
      orderKey: paper.orderKey,
      latestTree: paper.latestTree,
      sourceDocuments: documents.map((source) => ({
        artifactId: source.document.immutableArtifactRef.artifactId,
        byteLength: source.document.byteLength,
        inputKey: source.inputKey,
        path: source.sourceRef.path,
        role: source.sourceRef.kind,
        sha256: source.digest,
      })),
      capture: {
        assertionCount: capture.assertions.length,
        captureId: capture.captureId,
        digest: capture.digest,
        observationCount: capture.observations.length,
        path: `${outputRelativePath}/${paper.paperId}/source-capture-v1.json`,
      },
    })),
  }
  return {
    batch: { ...batchBody, batchDigest: digestJson(batchBody) },
    materialized,
  }
}

function expectedFiles(materialization) {
  const files = new Map()
  files.set('batch-evidence.json', jsonBytes(materialization.batch))
  for (const { paper, documents, capture } of materialization.materialized) {
    const paperPrefix = `${paper.paperId}/`
    for (const document of documents) {
      files.set(`${paperPrefix}${document.artifactFile}`, document.bytes)
    }
    files.set(`${paperPrefix}source-capture-v1.json`, jsonBytes(capture))
  }
  return files
}

async function listRelativeFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listRelativeFiles(absolute, relative))
    else if (entry.isFile()) files.push(relative)
    else fail(`output contains unsupported filesystem entry: ${relative}`)
  }
  return files
}

async function assertExactOutput(outputDirectory, expected) {
  if (!(await pathExists(outputDirectory))) return false
  const actualFiles = await listRelativeFiles(outputDirectory)
  const expectedFilesList = [...expected.keys()].sort()
  if (actualFiles.join('\n') !== expectedFilesList.join('\n')) {
    fail(`existing output is not the complete expected batch (actual ${actualFiles.length} files, expected ${expectedFilesList.length})`)
  }
  for (const relativePath of expectedFilesList) {
    const actual = await readFile(path.join(outputDirectory, relativePath))
    const wanted = expected.get(relativePath)
    if (!actual.equals(wanted)) fail(`existing output byte drift at ${relativePath}`)
  }
  return true
}

async function writeAtomically(outputDirectory, expected) {
  const parentDirectory = path.dirname(outputDirectory)
  await mkdir(parentDirectory, { recursive: true })
  if (await assertExactOutput(outputDirectory, expected)) return 'already_present'

  const stagingDirectory = await mkdtemp(path.join(parentDirectory, `.${path.basename(outputDirectory)}.staging-`))
  try {
    for (const [relativePath, bytes] of expected.entries()) {
      const target = path.join(stagingDirectory, relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes, { flag: 'wx' })
    }
    await rename(stagingDirectory, outputDirectory)
    return 'materialized'
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
}

function printEvidence(materialization, mode, outputRelativePath, captureBatchDefinition) {
  const { batch, materialized } = materialization
  const fileCount = 1 + materialized.reduce((count, item) => count + item.documents.length + 1, 0)
  console.log(`[ticket-26] PASS batch=${captureBatchDefinition.version} mode=${mode} papers=${materialized.length}/${captureBatchDefinition.expectedMaterializedPaperCount} files=${fileCount} batchDigest=${batch.batchDigest}`)
  for (const { paper, documents, capture } of materialized) {
    const sourceDigests = documents.map((document) => `${document.sourceRef.kind}=${document.digest}`).join(',')
    console.log(`[ticket-26] ${paper.paperId} capture=${capture.digest} sources=${sourceDigests}`)
  }
  console.log(`[ticket-26] evidence=${outputRelativePath}/batch-evidence.json`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const batch = captureBatch(options.batchVersion)
  const output = relativePathFromArgument(options.output, batch)
  const materialization = await buildMaterialization(batch)
  const expected = expectedFiles(materialization)
  if (options.mode === 'check') {
    if (!(await assertExactOutput(output.absolute, expected))) fail(`expected materialization is absent at ${output.relative}`)
    printEvidence(materialization, 'check', output.relative, batch)
    return
  }
  const status = await writeAtomically(output.absolute, expected)
  printEvidence(materialization, status, output.relative, batch)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
