import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'

const ROOT_SEGMENT = '.scratch/paper-canonical-ticket-20-qa'
const LEGACY_EVIDENCE_HEAD = 'eee654684f6609c4fd1486c7eec470b56c9576d2'
const SEAL_FILE = 'seal.json'
const EVIDENCE_FILE = 'evidence.json'
const LEDGER_FILE = 'continuation-public-seam-ledger.json'
const HEAD_FILE = 'HEAD.txt'

const legacyCanonicalImportPilotTamperRejectionMatrix = Object.freeze([
  Object.freeze({ caseId: 'partial_or_unsealed_root', rejection: 'OFFICIAL_EVIDENCE_ROOT_UNSEALED' }),
  Object.freeze({ caseId: 'stale_or_wrong_head', rejection: 'OFFICIAL_EVIDENCE_HEAD_INVALID' }),
  Object.freeze({ caseId: 'wrong_evidence_ledger_reference', rejection: 'OFFICIAL_EVIDENCE_LEDGER_REF_INVALID' }),
  Object.freeze({ caseId: 'artifact_digest_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'missing_or_extra_artifact', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'wrong_or_missing_ledger_observation', rejection: 'CONTINUATION_PUBLIC_SEAM_LEDGER_INVALID' }),
  Object.freeze({ caseId: 'attempted_official_overwrite', rejection: 'OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED' }),
])

export const canonicalImportPilotTamperRejectionMatrix = Object.freeze([
  Object.freeze({ caseId: 'partial_or_unsealed_root', rejection: 'OFFICIAL_EVIDENCE_ROOT_UNSEALED' }),
  Object.freeze({ caseId: 'stale_or_wrong_head', rejection: 'OFFICIAL_EVIDENCE_HEAD_INVALID' }),
  Object.freeze({ caseId: 'wrong_evidence_ledger_reference', rejection: 'OFFICIAL_EVIDENCE_LEDGER_REF_INVALID' }),
  Object.freeze({ caseId: 'artifact_digest_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'missing_or_extra_artifact', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'wrong_or_missing_ledger_observation', rejection: 'CONTINUATION_PUBLIC_SEAM_LEDGER_INVALID' }),
  Object.freeze({ caseId: 'semantic_passage_geometry_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_seven_choices_coverage_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_cloze_coverage_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_grammar_fill_coverage_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_application_writing_coverage_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_typography_observation_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_forbidden_artifact_state_drift', rejection: 'OFFICIAL_EVIDENCE_SEAL_INVALID' }),
  Object.freeze({ caseId: 'semantic_artifact_path_identity_drift', rejection: 'OFFICIAL_EVIDENCE_ARTIFACT_DIGEST_INVALID' }),
  Object.freeze({ caseId: 'semantic_non_pdf_artifact_digest_drift', rejection: 'OFFICIAL_EVIDENCE_ARTIFACT_DIGEST_INVALID' }),
  Object.freeze({ caseId: 'attempted_official_overwrite', rejection: 'OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED' }),
])

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function fail(code, message) {
  const error = new Error(`Canonical import pilot official evidence rejected: ${message}`)
  error.code = code
  throw error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertHead(head) {
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/u.test(head)) {
    fail('OFFICIAL_EVIDENCE_HEAD_INVALID', 'Expected HEAD must be a full lowercase Git SHA')
  }
}

function rootBase(repositoryRoot) {
  return path.resolve(repositoryRoot, ROOT_SEGMENT)
}

function safeRelative(rootDir, candidate) {
  const absolute = path.resolve(rootDir, candidate)
  const relative = path.relative(rootDir, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('OFFICIAL_EVIDENCE_PATH_INVALID', `Artifact path escapes its evidence root: ${candidate}`)
  }
  return relative.split(path.sep).join('/')
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    fail('OFFICIAL_EVIDENCE_ROOT_UNSEALED', `${label} is missing`)
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail('OFFICIAL_EVIDENCE_JSON_INVALID', `${label} is not readable JSON: ${error.message}`)
  }
}

function assertDirectory(rootDir, label) {
  if (!existsSync(rootDir)) {
    fail('OFFICIAL_EVIDENCE_ROOT_MISSING', `${label} is missing`)
  }
  if (!lstatSync(rootDir).isDirectory() || lstatSync(rootDir).isSymbolicLink()) {
    fail('OFFICIAL_EVIDENCE_ROOT_INVALID', `${label} is not a real directory`)
  }
}

function listEvidenceFiles(rootDir, prefix = '') {
  const absoluteDir = path.join(rootDir, prefix)
  const entries = readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
  const files = []
  for (const entry of entries) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name
    const absolute = path.join(rootDir, relative)
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      fail('OFFICIAL_EVIDENCE_PATH_INVALID', `Evidence root contains a symbolic link: ${relative}`)
    }
    if (stat.isDirectory()) {
      files.push(...listEvidenceFiles(rootDir, relative))
      continue
    }
    if (!stat.isFile()) {
      fail('OFFICIAL_EVIDENCE_PATH_INVALID', `Evidence root contains a non-file entry: ${relative}`)
    }
    files.push(relative.split(path.sep).join('/'))
  }
  return files
}

function fileSnapshot(rootDir, { omitSeal = false } = {}) {
  return listEvidenceFiles(rootDir)
    .filter((relativePath) => !omitSeal || relativePath !== SEAL_FILE)
    .map((relativePath) => ({
      path: relativePath,
      sha256: sha256(readFileSync(path.join(rootDir, relativePath))),
    }))
}

function byteSnapshot(rootDir) {
  return listEvidenceFiles(rootDir).map((relativePath) => ({
    path: relativePath,
    bytes: readFileSync(path.join(rootDir, relativePath)).toString('base64'),
  }))
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertEvidenceIndex({ rootDir, expectedHead, evidence }) {
  if (!isRecord(evidence) || evidence.schemaVersion !== 'canonical-import-pilot-evidence-v2') {
    fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'Evidence index has an unsupported schema version')
  }
  if (evidence.head !== expectedHead) {
    fail('OFFICIAL_EVIDENCE_HEAD_INVALID', 'Evidence index HEAD is stale or wrong')
  }
  if (readFileSync(path.join(rootDir, HEAD_FILE), 'utf8').trim() !== expectedHead) {
    fail('OFFICIAL_EVIDENCE_HEAD_INVALID', 'HEAD.txt does not bind this root to the expected HEAD')
  }
  if (!isRecord(evidence.continuationPublicSeamLedger)
    || evidence.continuationPublicSeamLedger.path !== LEDGER_FILE
    || evidence.continuationPublicSeamLedger.expectedHead !== expectedHead
    || typeof evidence.continuationPublicSeamLedger.sha256 !== 'string'
    || evidence.continuationPublicSeamLedger.schemaVersion !== 'continuation-public-seam-ledger-v1') {
    fail('OFFICIAL_EVIDENCE_LEDGER_REF_INVALID', 'Evidence index does not bind the current Continuation ledger')
  }
  const ledgerPath = path.join(rootDir, LEDGER_FILE)
  if (!existsSync(ledgerPath)
    || evidence.continuationPublicSeamLedger.sha256 !== sha256(readFileSync(ledgerPath))) {
    fail('OFFICIAL_EVIDENCE_LEDGER_REF_INVALID', 'Evidence index ledger digest does not match its bytes')
  }
  if (typeof evidence.semanticObservationDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(evidence.semanticObservationDigest)) {
    fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'Evidence index lacks a semantic-observation digest')
  }
  if (
    !sameJson(evidence.tamperRejectionMatrix, canonicalImportPilotTamperRejectionMatrix)
    && !(expectedHead === LEGACY_EVIDENCE_HEAD
      && sameJson(evidence.tamperRejectionMatrix, legacyCanonicalImportPilotTamperRejectionMatrix))
  ) {
    fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'Evidence index tamper-rejection matrix is missing or stale')
  }
  if (!isRecord(evidence.renderedArtifactDigests)
    || Object.keys(evidence.renderedArtifactDigests).length === 0) {
    fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'Evidence index lacks rendered artifact identities')
  }
  for (const [relativePath, digest] of Object.entries(evidence.renderedArtifactDigests)) {
    const safePath = safeRelative(rootDir, relativePath)
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/u.test(digest)) {
      fail('OFFICIAL_EVIDENCE_INDEX_INVALID', `Rendered artifact digest is invalid: ${relativePath}`)
    }
    const filePath = path.join(rootDir, safePath)
    if (!existsSync(filePath) || sha256(readFileSync(filePath)).slice('sha256:'.length) !== digest) {
      fail('OFFICIAL_EVIDENCE_ARTIFACT_DIGEST_INVALID', `Rendered artifact digest drifted: ${relativePath}`)
    }
  }
}

function assertSeal({ rootDir, expectedHead, evidence, seal }) {
  if (!isRecord(seal) || seal.schemaVersion !== 'canonical-import-pilot-evidence-seal-v1') {
    fail('OFFICIAL_EVIDENCE_ROOT_UNSEALED', 'Official evidence root lacks a supported seal')
  }
  if (seal.head !== expectedHead) {
    fail('OFFICIAL_EVIDENCE_HEAD_INVALID', 'Seal HEAD is stale or wrong')
  }
  const evidencePath = path.join(rootDir, EVIDENCE_FILE)
  const ledgerPath = path.join(rootDir, LEDGER_FILE)
  const expectedEvidenceRef = { path: EVIDENCE_FILE, sha256: sha256(readFileSync(evidencePath)) }
  const expectedLedgerRef = { path: LEDGER_FILE, sha256: sha256(readFileSync(ledgerPath)) }
  if (!sameJson(seal.evidence, expectedEvidenceRef) || !sameJson(seal.ledger, expectedLedgerRef)) {
    fail('OFFICIAL_EVIDENCE_SEAL_INVALID', 'Seal does not bind the evidence index and ledger bytes')
  }
  if (!Array.isArray(seal.files) || !sameJson(seal.files, fileSnapshot(rootDir, { omitSeal: true }))) {
    fail('OFFICIAL_EVIDENCE_SEAL_INVALID', 'Seal does not bind every official artifact byte')
  }
  if (evidence.continuationPublicSeamLedger.sha256 !== seal.ledger.sha256) {
    fail('OFFICIAL_EVIDENCE_LEDGER_REF_INVALID', 'Evidence and seal disagree about the ledger bytes')
  }
}

export function officialCanonicalImportPilotEvidenceRoot({ repositoryRoot, expectedHead }) {
  assertHead(expectedHead)
  return path.join(rootBase(repositoryRoot), expectedHead)
}

export function createCanonicalImportPilotTransientEvidenceRun({
  repositoryRoot,
  expectedHead,
}) {
  assertHead(expectedHead)
  const transientParent = path.join(rootBase(repositoryRoot), 'runs', expectedHead)
  mkdirSync(transientParent, { recursive: true })
  return mkdtempSync(path.join(transientParent, 'run-'))
}

export function isCanonicalImportPilotTransientEvidenceRun({
  repositoryRoot,
  expectedHead,
  rootDir,
}) {
  assertHead(expectedHead)
  const transientParent = path.join(rootBase(repositoryRoot), 'runs', expectedHead)
  const relative = path.relative(transientParent, path.resolve(rootDir))
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function assertCanonicalImportPilotTransientEvidenceRunsClean({
  repositoryRoot,
  expectedHead,
}) {
  assertHead(expectedHead)
  const transientParent = path.join(rootBase(repositoryRoot), 'runs', expectedHead)
  if (!existsSync(transientParent)) return
  assertDirectory(transientParent, 'Transient evidence parent')
  const entries = readdirSync(transientParent)
  if (entries.length > 0) {
    fail(
      'OFFICIAL_EVIDENCE_TRANSIENT_OUTPUT_RETAINED',
      `Transient evidence outputs remain for ${expectedHead}: ${entries.join(', ')}`,
    )
  }
}

export function cleanupCanonicalImportPilotTransientEvidenceRun({
  repositoryRoot,
  expectedHead,
  rootDir,
}) {
  if (!isCanonicalImportPilotTransientEvidenceRun({
    repositoryRoot,
    expectedHead,
    rootDir,
  })) {
    fail('OFFICIAL_EVIDENCE_PATH_INVALID', 'Transient cleanup target is not inside the exact HEAD run directory')
  }
  rmSync(rootDir, { recursive: true, force: true })
  const transientParent = path.dirname(path.resolve(rootDir))
  if (existsSync(transientParent) && readdirSync(transientParent).length === 0) {
    rmdirSync(transientParent)
  }
  assertCanonicalImportPilotTransientEvidenceRunsClean({
    repositoryRoot,
    expectedHead,
  })
}

export function sealCanonicalImportPilotEvidenceStaging({
  rootDir,
  expectedHead,
}) {
  assertHead(expectedHead)
  assertDirectory(rootDir, 'Evidence staging root')
  const sealPath = path.join(rootDir, SEAL_FILE)
  if (existsSync(sealPath)) {
    fail('OFFICIAL_EVIDENCE_STAGING_ALREADY_SEALED', 'Evidence staging root already contains a seal')
  }
  const evidence = readJson(path.join(rootDir, EVIDENCE_FILE), 'Evidence index')
  assertEvidenceIndex({ rootDir, expectedHead, evidence })
  const seal = {
    schemaVersion: 'canonical-import-pilot-evidence-seal-v1',
    head: expectedHead,
    evidence: {
      path: EVIDENCE_FILE,
      sha256: sha256(readFileSync(path.join(rootDir, EVIDENCE_FILE))),
    },
    ledger: {
      path: LEDGER_FILE,
      sha256: sha256(readFileSync(path.join(rootDir, LEDGER_FILE))),
    },
    files: fileSnapshot(rootDir),
  }
  writeFileSync(sealPath, `${JSON.stringify(seal, null, 2)}\n`)
  return assertCanonicalImportPilotEvidenceRoot({
    rootDir,
    expectedHead,
    requireOfficialPath: false,
  })
}

export function assertCanonicalImportPilotEvidenceRoot({
  repositoryRoot = null,
  rootDir,
  expectedHead,
  requireOfficialPath = true,
}) {
  assertHead(expectedHead)
  if (requireOfficialPath) {
    const expectedRoot = officialCanonicalImportPilotEvidenceRoot({
      repositoryRoot,
      expectedHead,
    })
    if (path.resolve(rootDir) !== expectedRoot) {
      fail('OFFICIAL_EVIDENCE_ROOT_INVALID', 'Evidence root is not the exact-final-HEAD official directory')
    }
  }
  assertDirectory(rootDir, 'Evidence root')
  const evidence = readJson(path.join(rootDir, EVIDENCE_FILE), 'Evidence index')
  assertEvidenceIndex({ rootDir, expectedHead, evidence })
  const seal = readJson(path.join(rootDir, SEAL_FILE), 'Evidence seal')
  assertSeal({ rootDir, expectedHead, evidence, seal })
  return Object.freeze({
    rootDir: path.resolve(rootDir),
    evidence: Object.freeze(evidence),
    seal: Object.freeze(seal),
    snapshot: Object.freeze(byteSnapshot(rootDir)),
  })
}

export function inspectOfficialCanonicalImportPilotEvidenceRoot({
  repositoryRoot,
  expectedHead,
}) {
  const rootDir = officialCanonicalImportPilotEvidenceRoot({ repositoryRoot, expectedHead })
  if (!existsSync(rootDir)) return null
  return assertCanonicalImportPilotEvidenceRoot({
    repositoryRoot,
    rootDir,
    expectedHead,
  })
}

export function finalizeCanonicalImportPilotEvidenceRoot({
  repositoryRoot,
  expectedHead,
  stagingRoot,
}) {
  if (!isCanonicalImportPilotTransientEvidenceRun({
    repositoryRoot,
    expectedHead,
    rootDir: stagingRoot,
  })) {
    fail('OFFICIAL_EVIDENCE_STAGING_INVALID', 'Finalization may only rename a transient evidence run')
  }
  assertCanonicalImportPilotEvidenceRoot({
    rootDir: stagingRoot,
    expectedHead,
    requireOfficialPath: false,
  })
  const base = rootBase(repositoryRoot)
  const officialRoot = officialCanonicalImportPilotEvidenceRoot({ repositoryRoot, expectedHead })
  mkdirSync(base, { recursive: true })
  if (existsSync(officialRoot)) {
    try {
      assertCanonicalImportPilotEvidenceRoot({
        repositoryRoot,
        rootDir: officialRoot,
        expectedHead,
      })
      fail('OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED', 'A sealed official root already exists and cannot be replaced')
    } catch (error) {
      if (error?.code === 'OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED') throw error
      fail('OFFICIAL_EVIDENCE_ROOT_UNSEALED', 'An existing official root is partial or unsealed')
    }
  }
  const lockDir = path.join(base, `.finalize-${expectedHead}.lock`)
  try {
    mkdirSync(lockDir)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail('OFFICIAL_EVIDENCE_FINALIZATION_LOCKED', 'Another finalization owns this exact HEAD')
    }
    throw error
  }
  try {
    if (existsSync(officialRoot)) {
      try {
        assertCanonicalImportPilotEvidenceRoot({
          repositoryRoot,
          rootDir: officialRoot,
          expectedHead,
        })
        fail('OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED', 'A concurrent finalization sealed this exact HEAD')
      } catch (error) {
        if (error?.code === 'OFFICIAL_EVIDENCE_ROOT_ALREADY_SEALED') throw error
        fail('OFFICIAL_EVIDENCE_ROOT_UNSEALED', 'A concurrent finalization left a partial official root')
      }
    }
    renameSync(stagingRoot, officialRoot)
    return assertCanonicalImportPilotEvidenceRoot({
      repositoryRoot,
      rootDir: officialRoot,
      expectedHead,
    })
  } finally {
    rmdirSync(lockDir)
  }
}

export function assertCanonicalImportPilotEvidenceMutationRejections({
  rootDir,
  expectedHead,
  scratchRoot,
}) {
  const rejected = (caseId, mutate) => {
    const candidate = path.join(scratchRoot, caseId)
    cpSync(rootDir, candidate, { recursive: true })
    try {
      mutate(candidate)
      let didReject = false
      try {
        assertCanonicalImportPilotEvidenceRoot({
          rootDir: candidate,
          expectedHead,
          requireOfficialPath: false,
        })
      } catch (error) {
        didReject = typeof error?.code === 'string'
          && error.code.startsWith('OFFICIAL_EVIDENCE_')
      }
      if (!didReject) {
        fail('OFFICIAL_EVIDENCE_MUTATION_ACCEPTED', `Mutation probe unexpectedly passed: ${caseId}`)
      }
    } finally {
      rmSync(candidate, { recursive: true, force: true })
    }
  }
  rejected('missing-artifact', (candidate) => {
    const seal = readJson(path.join(candidate, SEAL_FILE), 'Evidence seal')
    const artifact = seal.files.find((entry) => ![HEAD_FILE, EVIDENCE_FILE, LEDGER_FILE].includes(entry.path))
    if (!artifact) fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'No artifact exists for the missing-artifact mutation')
    rmSync(path.join(candidate, artifact.path), { force: true })
  })
  rejected('extra-artifact', (candidate) => {
    writeFileSync(path.join(candidate, 'unexpected-artifact.txt'), 'unexpected\n')
  })
  rejected('artifact-digest-drift', (candidate) => {
    const seal = readJson(path.join(candidate, SEAL_FILE), 'Evidence seal')
    const artifact = seal.files.find((entry) => ![HEAD_FILE, EVIDENCE_FILE, LEDGER_FILE].includes(entry.path))
    if (!artifact) fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'No artifact exists for the drift mutation')
    writeFileSync(path.join(candidate, artifact.path), Buffer.from('drift\n'))
  })
  rejected('wrong-evidence-ledger-reference', (candidate) => {
    const evidencePath = path.join(candidate, EVIDENCE_FILE)
    const evidence = readJson(evidencePath, 'Evidence index')
    evidence.continuationPublicSeamLedger.path = 'wrong-ledger.json'
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  })
  rejected('stale-head', (candidate) => {
    writeFileSync(path.join(candidate, HEAD_FILE), `${'0'.repeat(40)}\n`)
  })
  const mutateEvidence = (candidate, mutate) => {
    const evidencePath = path.join(candidate, EVIDENCE_FILE)
    const evidence = readJson(evidencePath, 'Evidence index')
    mutate(evidence)
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  }
  const mutateFirstLeaf = (value) => {
    if (typeof value === 'string') return `${value}:semantic-drift`
    if (typeof value === 'number') return value + 1
    if (typeof value === 'boolean') return !value
    if (Array.isArray(value)) {
      if (value.length === 0) return ['semantic-drift']
      const next = structuredClone(value)
      next[0] = mutateFirstLeaf(next[0])
      return next
    }
    if (isRecord(value)) {
      const next = structuredClone(value)
      const key = Object.keys(next)[0]
      if (!key) return { semanticDrift: true }
      next[key] = mutateFirstLeaf(next[key])
      return next
    }
    return 'semantic-drift'
  }
  for (const [caseId, field] of [
    ['semantic_passage_geometry_drift', 'renderedPassageLetterGeometry'],
    ['semantic_seven_choices_coverage_drift', 'sevenChoicesPublicSeamCoverage'],
    ['semantic_cloze_coverage_drift', 'clozePublicSeamCoverage'],
    ['semantic_grammar_fill_coverage_drift', 'grammarFillPublicSeamCoverage'],
    ['semantic_application_writing_coverage_drift', 'applicationWritingPublicSeamCoverage'],
    ['semantic_typography_observation_drift', 'paperTypographyInstructionWeightCoverage'],
  ]) {
    rejected(caseId, (candidate) => {
      mutateEvidence(candidate, (evidence) => {
        evidence[field] = mutateFirstLeaf(evidence[field])
      })
    })
  }
  rejected('semantic_forbidden_artifact_state_drift', (candidate) => {
    mutateEvidence(candidate, (evidence) => {
      evidence.forbiddenOutputArtifacts = [
        ...evidence.forbiddenOutputArtifacts,
        'forbidden-generated.docx',
      ]
    })
  })
  rejected('semantic_artifact_path_identity_drift', (candidate) => {
    mutateEvidence(candidate, (evidence) => {
      const [relativePath, digest] = Object.entries(evidence.renderedArtifactDigests)[0]
      delete evidence.renderedArtifactDigests[relativePath]
      evidence.renderedArtifactDigests[`${relativePath}.renamed`] = digest
    })
  })
  rejected('semantic_non_pdf_artifact_digest_drift', (candidate) => {
    mutateEvidence(candidate, (evidence) => {
      const relativePath = Object.keys(evidence.renderedArtifactDigests)
        .find((candidatePath) => !/\.pdf$/iu.test(candidatePath))
      if (!relativePath) fail('OFFICIAL_EVIDENCE_INDEX_INVALID', 'No non-PDF artifact exists for the semantic digest mutation')
      evidence.renderedArtifactDigests[relativePath] = '0'.repeat(64)
    })
  })
}
