import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function fail(message) {
  const error = new Error(`Continuation public-seam ledger rejected: ${message}`)
  error.code = 'CONTINUATION_PUBLIC_SEAM_LEDGER_INVALID'
  throw error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing at ${filePath}`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`${label} is unreadable JSON: ${error.message}`)
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function supportedRoot(repositoryRoot, expectedHead) {
  return path.resolve(
    repositoryRoot,
    '.scratch/paper-canonical-ticket-20-qa',
    expectedHead,
  )
}

function safeArtifactPath(outputDir, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    fail('an observation lacks a relative artifact path')
  }
  const absolute = path.resolve(outputDir, relativePath)
  const relative = path.relative(outputDir, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`artifact path escapes the evidence root: ${relativePath}`)
  }
  return absolute
}

function expectedBaseline(bundle, continuationRhythm) {
  return bundle.surface === 'screen'
    ? {
        unit: 'px',
        baselineStep: continuationRhythm.targets.screen.baselineStepPx,
      }
    : {
        unit: 'pt',
        baselineStep: continuationRhythm.targets.printPdf.baselineStepPt,
      }
}

function expectedAuthority(authorityRef, continuationRhythm, oracleRef) {
  return {
    manifest: {
      manifestId: authorityRef.manifestId,
      manifestVersion: authorityRef.manifestVersion,
      manifestDigest: authorityRef.manifestDigest,
    },
    continuationRhythm: {
      schemaVersion: continuationRhythm.schemaVersion,
      id: continuationRhythm.id,
      version: continuationRhythm.version,
    },
    fixture: oracleRef,
  }
}

export function loadContinuationPublicSeamLedgerOracle({
  repositoryRoot,
  continuationRhythm,
}) {
  const ref = continuationRhythm?.actualArtifactLedgerOracle
  if (!isRecord(ref) || typeof ref.path !== 'string' || typeof ref.sha256 !== 'string') {
    fail('Continuation authority lacks its persisted-artifact ledger fixture ref')
  }
  const oraclePath = path.resolve(repositoryRoot, ref.path)
  const oracleBytes = readFileSync(oraclePath)
  if (`sha256:${createHash('sha256').update(oracleBytes).digest('hex')}` !== ref.sha256) {
    fail('Continuation ledger fixture digest does not match the current authority')
  }
  const oracle = JSON.parse(oracleBytes)
  if (oracle.schemaVersion !== 'continuation-public-seam-ledger-oracle-v1') {
    fail('Continuation ledger fixture has an unsupported schema version')
  }
  if (!Array.isArray(oracle.bundles) || !Array.isArray(oracle.relations)) {
    fail('Continuation ledger fixture lacks bundle or relation definitions')
  }
  if (oracle.bundles.length !== 6 || oracle.relations.length !== 2) {
    fail('Continuation ledger fixture must define exactly six bundles and two relations')
  }
  const bundleIds = oracle.bundles.map((bundle) => bundle.bundleId)
  const relationIds = oracle.relations.map((relation) => relation.relationId)
  if (new Set(bundleIds).size !== 6 || new Set(relationIds).size !== 2) {
    fail('Continuation ledger fixture duplicates a bundle or relation identity')
  }
  if (!sameJson(
    [...bundleIds].sort(),
    [
      'screen_plain',
      'screen_lecture',
      'student_print_html',
      'teacher_print_html',
      'student_direct_pdf',
      'teacher_direct_pdf',
    ].sort(),
  )) fail('Continuation ledger fixture defines an unsupported bundle set')
  if (!sameJson(
    [...relationIds].sort(),
    ['section_to_instruction', 'instruction_to_material'].sort(),
  )) fail('Continuation ledger fixture defines an unsupported relation set')
  return Object.freeze({
    oracle: Object.freeze(oracle),
    ref: Object.freeze({
      path: ref.path,
      sha256: ref.sha256,
      schemaVersion: oracle.schemaVersion,
    }),
  })
}

function validateLedger({
  repositoryRoot,
  outputDir,
  expectedHead,
  authorityRef,
  continuationRhythm,
  oracleBundle,
  ledger,
  requireOfficialRoot,
}) {
  if (requireOfficialRoot && path.resolve(outputDir) !== supportedRoot(repositoryRoot, expectedHead)) {
    fail('evidence root is not the exact-final-HEAD official scratch directory')
  }
  if (!isRecord(ledger) || ledger.schemaVersion !== 'continuation-public-seam-ledger-v1') {
    fail('ledger schema version is missing or unsupported')
  }
  if (ledger.expectedHead !== expectedHead) fail('ledger Expected HEAD is stale')
  const expectedLedgerAuthority = expectedAuthority(
    authorityRef,
    continuationRhythm,
    oracleBundle.ref,
  )
  if (!sameJson(ledger.authority, expectedLedgerAuthority)) {
    fail('ledger authority, fixture, version, source, or producer closure is wrong')
  }
  if (!sameJson(ledger.oracle, oracleBundle.ref)) {
    fail('ledger oracle ref is wrong or stale')
  }
  if (!Array.isArray(ledger.observations)) fail('ledger observations are missing')
  if (ledger.observations.length !== oracleBundle.oracle.bundles.length * oracleBundle.oracle.relations.length) {
    fail('ledger does not contain exactly one observation for every public bundle/relation pair')
  }
  const bundles = new Map(oracleBundle.oracle.bundles.map((bundle) => [
    bundle.bundleId,
    bundle,
  ]))
  const relations = new Map(oracleBundle.oracle.relations.map((relation) => [
    relation.relationId,
    relation,
  ]))
  const seen = new Set()
  for (const observation of ledger.observations) {
    if (!isRecord(observation)) fail('ledger contains a non-object observation')
    const bundle = bundles.get(observation.bundleId)
    const relation = relations.get(observation.relation?.id)
    if (!bundle) fail(`ledger has an extra or wrong bundle: ${observation.bundleId}`)
    if (!relation) fail(`ledger has an extra or wrong relation: ${observation.relation?.id}`)
    const identity = `${bundle.bundleId}\u0000${relation.relationId}`
    if (seen.has(identity)) fail(`ledger duplicates ${bundle.bundleId}/${relation.relationId}`)
    seen.add(identity)
    if (observation.expectedHead !== expectedHead) {
      fail(`${identity} has a stale Expected HEAD`)
    }
    if (!sameJson(observation.authority, expectedLedgerAuthority)) {
      fail(`${identity} has wrong authority, fixture, version, source, or producer provenance`)
    }
    if (!isRecord(observation.artifact)
      || observation.artifact.role !== bundle.artifactRole
      || observation.artifact.path !== bundle.artifactPath
      || typeof observation.artifact.sha256 !== 'string') {
      fail(`${identity} has wrong artifact role, path, or digest`)
    }
    const artifactPath = safeArtifactPath(outputDir, observation.artifact.path)
    if (!existsSync(artifactPath)) fail(`${identity} artifact is missing`)
    if (observation.artifact.sha256 !== sha256(readFileSync(artifactPath))) {
      fail(`${identity} artifact digest does not match actual bytes`)
    }
    if (!isRecord(observation.relation)
      || observation.relation.fromRole !== relation.fromRole
      || observation.relation.toRole !== relation.toRole
      || observation.relation.fromAnchor !== relation.fromAnchor
      || observation.relation.toAnchor !== relation.toAnchor) {
      fail(`${identity} has a wrong role or coordinate anchor`)
    }
    const baseline = expectedBaseline(bundle, continuationRhythm)
    const observed = observation.observed
    if (!isRecord(observed)
      || observed.unit !== baseline.unit
      || !Number.isFinite(observed.distance)
      || !Number.isFinite(observed.baselineStep)
      || !Number.isFinite(observed.dimensionlessRatio)
      || Math.abs(observed.baselineStep - baseline.baselineStep) > 0.000001) {
      fail(`${identity} has an invalid observed coordinate or baseline`)
    }
    const recomputedRatio = observed.distance / observed.baselineStep
    if (Math.abs(recomputedRatio - observed.dimensionlessRatio) > 0.000001) {
      fail(`${identity} has a wrong dimensionless value`)
    }
    if (Math.abs(observed.dimensionlessRatio - relation.expectedDimensionlessRatio) > relation.ratioTolerance) {
      fail(`${identity} falls outside the authoritative dimensionless geometry`)
    }
  }
  if (seen.size !== 12) fail('ledger is missing a required bundle/relation observation')
}

export function persistContinuationPublicSeamLedger({
  repositoryRoot,
  outputDir,
  expectedHead,
  authorityRef,
  continuationRhythm,
  oracleBundle,
  measurementsByBundle,
}) {
  const authority = expectedAuthority(
    authorityRef,
    continuationRhythm,
    oracleBundle.ref,
  )
  const observations = []
  for (const bundle of oracleBundle.oracle.bundles) {
    const measurements = measurementsByBundle?.[bundle.bundleId]
    if (!Array.isArray(measurements)) fail(`no actual measurements for ${bundle.bundleId}`)
    for (const relation of oracleBundle.oracle.relations) {
      const measurement = measurements.find(
        (candidate) => candidate?.relationId === relation.relationId,
      )
      if (!measurement) fail(`no actual ${relation.relationId} measurement for ${bundle.bundleId}`)
      const baseline = expectedBaseline(bundle, continuationRhythm)
      if (!Number.isFinite(measurement.distance)) {
        fail(`${bundle.bundleId}/${relation.relationId} measurement has no actual distance`)
      }
      observations.push({
        bundleId: bundle.bundleId,
        artifact: {
          role: bundle.artifactRole,
          path: bundle.artifactPath,
          sha256: sha256(readFileSync(safeArtifactPath(outputDir, bundle.artifactPath))),
        },
        relation: {
          id: relation.relationId,
          fromRole: relation.fromRole,
          toRole: relation.toRole,
          fromAnchor: relation.fromAnchor,
          toAnchor: relation.toAnchor,
        },
        observed: {
          unit: baseline.unit,
          distance: measurement.distance,
          baselineStep: baseline.baselineStep,
          dimensionlessRatio: measurement.distance / baseline.baselineStep,
        },
        authority,
        expectedHead,
      })
    }
  }
  const ledger = {
    schemaVersion: 'continuation-public-seam-ledger-v1',
    expectedHead,
    authority,
    oracle: oracleBundle.ref,
    observations,
  }
  validateLedger({
    repositoryRoot,
    outputDir,
    expectedHead,
    authorityRef,
    continuationRhythm,
    oracleBundle,
    ledger,
    requireOfficialRoot: false,
  })
  const ledgerPath = path.join(outputDir, 'continuation-public-seam-ledger.json')
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`)
  return Object.freeze({
    path: 'continuation-public-seam-ledger.json',
    sha256: sha256(readFileSync(ledgerPath)),
    schemaVersion: ledger.schemaVersion,
    expectedHead,
  })
}

export function assertPersistedContinuationPublicSeamLedger({
  repositoryRoot,
  outputDir,
  expectedHead,
  authorityRef,
  continuationRhythm,
  oracleBundle,
  requireOfficialRoot = false,
  ledger: injectedLedger,
  evidence: injectedEvidence,
}) {
  const ledgerPath = path.join(outputDir, 'continuation-public-seam-ledger.json')
  const ledger = injectedLedger || readJson(ledgerPath, 'persisted ledger')
  validateLedger({
    repositoryRoot,
    outputDir,
    expectedHead,
    authorityRef,
    continuationRhythm,
    oracleBundle,
    ledger,
    requireOfficialRoot,
  })
  if (injectedEvidence !== undefined) return
  const headPath = path.join(outputDir, 'HEAD.txt')
  if (!existsSync(headPath) || readFileSync(headPath, 'utf8').trim() !== expectedHead) {
    fail('persisted HEAD.txt does not bind this evidence root to the exact final HEAD')
  }
  const evidence = readJson(
    path.join(outputDir, 'evidence.json'),
    'persisted evidence index',
  )
  const ledgerRef = evidence.continuationPublicSeamLedger
  if (!isRecord(ledgerRef)
    || ledgerRef.path !== 'continuation-public-seam-ledger.json'
    || ledgerRef.sha256 !== sha256(readFileSync(ledgerPath))
    || ledgerRef.expectedHead !== expectedHead
    || ledgerRef.schemaVersion !== ledger.schemaVersion
    || evidence.head !== expectedHead) {
    fail('evidence index does not bind the persisted ledger to its exact final HEAD')
  }
}

export function assertContinuationPublicSeamLedgerMutationRejections(context) {
  const ledgerPath = path.join(context.outputDir, 'continuation-public-seam-ledger.json')
  const base = readJson(ledgerPath, 'persisted ledger')
  const reject = (caseId, mutate, overrides = {}) => {
    const candidate = structuredClone(base)
    mutate(candidate)
    let rejected = false
    try {
      assertPersistedContinuationPublicSeamLedger({
        ...context,
        ...overrides,
        ledger: candidate,
        evidence: null,
      })
    } catch (error) {
      rejected = error?.code === 'CONTINUATION_PUBLIC_SEAM_LEDGER_INVALID'
    }
    if (!rejected) fail(`mutation probe unexpectedly accepted: ${caseId}`)
  }
  reject('missing', (ledger) => ledger.observations.pop())
  reject('extra', (ledger) => {
    const extra = structuredClone(ledger.observations[0])
    extra.bundleId = 'unsupported_bundle'
    ledger.observations.push(extra)
  })
  reject('duplicate', (ledger) => ledger.observations.push(
    structuredClone(ledger.observations[0]),
  ))
  reject('wrong-role', (ledger) => { ledger.observations[0].artifact.role = 'wrong_role' })
  reject('wrong-relation', (ledger) => { ledger.observations[0].relation.id = 'wrong_relation' })
  reject('wrong-coordinate', (ledger) => { ledger.observations[0].relation.fromAnchor = 'wrong_anchor' })
  reject('wrong-value', (ledger) => { ledger.observations[0].observed.dimensionlessRatio += 0.5 })
  reject('wrong-artifact-digest', (ledger) => { ledger.observations[0].artifact.sha256 = 'sha256:poisoned' })
  reject('stale-head', (ledger) => {
    ledger.expectedHead = '0000000000000000000000000000000000000000'
    ledger.observations.forEach((observation) => { observation.expectedHead = ledger.expectedHead })
  })
  reject('older-scratch-evidence', () => {}, {
    outputDir: path.join(
      context.repositoryRoot,
      '.scratch/paper-canonical-ticket-20-qa',
      '0000000000000000000000000000000000000000',
    ),
    requireOfficialRoot: true,
  })
}
