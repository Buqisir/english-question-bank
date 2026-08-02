import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  resolveCanonicalAuthority,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  TICKET_26_LEGACY_CAPTURE_INPUT_KIND,
  resolveTicket26LegacySourceCapture,
} from '../server/paper-canonical/legacyTicket26SourceAdapter.mjs'
import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

export const ticket27PaperIds = [
  'paper-2020-i',
  'paper-2020-ii',
  'paper-2021-i',
  'paper-2021-ii',
  'paper-2022-i',
  'paper-2022-ii',
  'paper-2023-i',
  'paper-2023-ii',
  'paper-2024-i',
  'paper-2024-ii',
  'paper-2025-ii',
  'paper-960d0f8d',
  'paper-zj-2023-jan',
  'paper-zj-2024-jan',
  'paper-zj-2025-jan',
  'paper-zj-2026-jan',
]

export const ticket26CaptureRoot = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1'
export const ticket27OutputRoot = 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1'

const expectedCaptureRoles = ['asset-projection', 'source-provenance', 'official-answer-lead']

function fail(message) {
  throw new Error(`[ticket-27] ${message}`)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function jsonEqual(left, right) {
  return digestJson(left) === digestJson(right)
}

function relativeCapturePath(paperId) {
  return `${ticket26CaptureRoot}/${paperId}/source-capture-v1.json`
}

function relativeArtifactPath(paperId, filename) {
  return `${paperId}/${filename}`
}

function serializableCandidate(candidate) {
  const { sourceBytes, ...artifact } = candidate
  assert(sourceBytes instanceof Uint8Array, 'trusted candidate must retain immutable runtime source bytes')
  const { candidateDigest, ...body } = artifact
  assert(candidateDigest === digestJson(body), 'candidate digest must bind the persisted candidate body')
  return artifact
}

function laneAuthority() {
  const resolved = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
  assert(resolved.ok, 'Ticket 27 authority v41 must resolve')
  const registry = resolved.closure.artifacts.adapter
  assert(registry?.id === 'source-adapters' && registry.version === '13', 'Ticket 27 must retain reviewed source-adapters v13')
  const adapter = registry.adapters.find((entry) => entry.adapterId === 'ticket-26-legacy-source-capture')
  assert(adapter?.version === '3', 'Ticket 27 must retain adapter v13 ticket-26 source-capture adapter v3')
  return {
    authorityRef: resolved.closure.authorityRef,
    adapter: {
      registryId: registry.id,
      registryVersion: registry.version,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      mediaType: adapter.mediaType,
    },
  }
}

async function readCapture(paperId) {
  const capturePath = relativeCapturePath(paperId)
  const bytes = new Uint8Array(await readFile(path.join(rootDir, capturePath)))
  const record = resolveTicket26LegacySourceCapture(bytes)
  assert(record, `${paperId} must resolve through the exact committed Ticket 26 registry`)
  assert(record.paperId === paperId, `${paperId} source capture must not resolve to another paper`)
  assert(record.capture.path === capturePath, `${paperId} must retain its frozen source-capture path`)
  assert(record.documents.map((document) => document.role).join('\u0000') === expectedCaptureRoles.join('\u0000'), `${paperId} source roles changed`)
  assert(record.documents.every((document) => document.mediaType === 'application/json'), `${paperId} legacy JSON lane must not absorb DOCX or PDF source bytes`)
  return { capturePath, bytes, record }
}

function failureRecord({ paperId, capturePath, candidate, result }) {
  return {
    paperId,
    capturePath,
    sourceDigest: candidate?.source?.sha256 || null,
    candidateDigest: candidate?.candidateDigest || null,
    codes: [...new Set((result?.unresolvedIssues || result?.issues || []).map((issue) => issue.code))].sort(),
  }
}

export async function buildTicket27LaneArtifacts() {
  assert(ticket27PaperIds.length === 16, 'Ticket 27 membership must remain exactly 16 papers')
  assert(new Set(ticket27PaperIds).size === ticket27PaperIds.length, 'Ticket 27 membership must not contain duplicates')

  const authority = laneAuthority()
  const artifacts = []
  const papers = []
  const unresolved = []

  for (const paperId of ticket27PaperIds) {
    const { capturePath, bytes, record } = await readCapture(paperId)
    const imported = importCanonicalCandidate({
      kind: TICKET_26_LEGACY_CAPTURE_INPUT_KIND,
      sourceCaptureBytes: bytes,
    })
    const candidate = imported.candidate
    if (!candidate) {
      unresolved.push(failureRecord({ paperId, capturePath, candidate, result: imported }))
      continue
    }
    assert(candidate.schemaVersion === 'trusted-ticket-26-legacy-import-candidate-v1', `${paperId} must remain on the legacy JSON candidate seam`)
    assert(jsonEqual(candidate.authority, authority.authorityRef), `${paperId} candidate authority must remain v41`)
    assert(candidate.source.paperId === paperId, `${paperId} candidate identity must derive from its capture`)
    assert(candidate.source.sha256 === sha256(bytes), `${paperId} candidate source digest must bind exact capture bytes`)
    assert(candidate.issues.length === 0 && imported.issues.length === 0, `${paperId} candidate must not retain unresolved import issues`)
    assert(Object.keys(candidate.operatorChoices).length === 0, `${paperId} legacy import must not accept caller-authored semantic choices`)
    assert(candidate.interpretation.profileId === 'nck1', `${paperId} must remain inside the NCK1 lane profile`)

    const candidateArtifact = serializableCandidate(candidate)
    const confirmation = {
      schemaVersion: 'teacher-confirmation-v1',
      candidateDigest: candidate.candidateDigest,
      sourceDigest: candidate.source.sha256,
      confirmed: true,
    }
    const result = confirmCanonicalCandidate(candidate, confirmation)
    if (!result.canonicalPaper) {
      unresolved.push(failureRecord({ paperId, capturePath, candidate, result }))
      continue
    }
    assert(!Object.hasOwn(result, 'publication'), `${paperId} Teacher Confirmation must not publish`)
    assert(result.confirmation.candidateDigest === confirmation.candidateDigest, `${paperId} result must preserve its confirmation candidate binding`)
    assert(result.confirmation.sourceDigest === confirmation.sourceDigest, `${paperId} result must preserve its confirmation source binding`)
    const canonicalPaper = result.canonicalPaper
    assert(canonicalPaper.paperPlan?.paperId === paperId, `${paperId} canonical paper plan identity must remain source-derived`)
    assert(canonicalPaper.paperPlan?.completeness?.status === 'complete', `${paperId} must produce one complete Canonical Paper`)
    assert(Array.isArray(canonicalPaper.questionGroups) && canonicalPaper.questionGroups.length > 0, `${paperId} canonical paper must retain all active groups`)

    const candidatePath = relativeArtifactPath(paperId, 'import-candidate-v1.json')
    const confirmationPath = relativeArtifactPath(paperId, 'teacher-confirmation-v1.json')
    const canonicalPath = relativeArtifactPath(paperId, 'canonical-paper-v1.json')
    const candidateFile = jsonBytes(candidateArtifact)
    const confirmationFile = jsonBytes(confirmation)
    const canonicalFile = jsonBytes(canonicalPaper)
    artifacts.push(
      { relativePath: candidatePath, bytes: candidateFile },
      { relativePath: confirmationPath, bytes: confirmationFile },
      { relativePath: canonicalPath, bytes: canonicalFile },
    )
    papers.push({
      paperId,
      sourceCapture: {
        relativePath: capturePath,
        sha256: candidate.source.sha256,
        byteLength: candidate.source.byteLength,
        captureId: candidate.source.captureId,
        captureDigest: candidate.source.captureDigest,
        documents: record.documents.map(({ role, inputKey, mediaType, originalName, sha256: documentSha256, byteLength }) => ({
          role,
          inputKey,
          mediaType,
          originalName,
          sha256: documentSha256,
          byteLength,
        })),
      },
      candidate: {
        relativePath: candidatePath,
        fileSha256: sha256(candidateFile),
        candidateDigest: candidate.candidateDigest,
      },
      confirmation: {
        relativePath: confirmationPath,
        fileSha256: sha256(confirmationFile),
        candidateDigest: confirmation.candidateDigest,
        sourceDigest: confirmation.sourceDigest,
      },
      canonicalPaper: {
        relativePath: canonicalPath,
        fileSha256: sha256(canonicalFile),
        canonicalPaperDigest: digestJson(canonicalPaper),
        planId: canonicalPaper.paperPlan.planId,
        groupCount: canonicalPaper.questionGroups.length,
        completeness: canonicalPaper.paperPlan.completeness.status,
      },
    })
  }

  if (unresolved.length > 0) {
    fail(`refusing to write a partial lane; unresolved papers: ${JSON.stringify(unresolved)}`)
  }
  assert(papers.length === ticket27PaperIds.length, 'all approved papers must close before lane artifacts are written')

  const laneEvidence = {
    schemaVersion: 'ticket-27-nck1-confirmation-lane-evidence-v1',
    ticket: '27',
    lane: 'nck1',
    sourceCaptureRoot: ticket26CaptureRoot,
    authority: authority.authorityRef,
    adapter: authority.adapter,
    membership: {
      paperIds: ticket27PaperIds,
      count: ticket27PaperIds.length,
    },
    accounting: {
      candidates: papers.length,
      confirmations: papers.length,
      canonicalPapers: papers.length,
      unresolved: 0,
      publications: 0,
    },
    papers,
  }
  artifacts.push({ relativePath: 'lane-evidence-v1.json', bytes: jsonBytes(laneEvidence) })
  return { artifacts, laneEvidence }
}

async function exists(absolutePath) {
  try {
    await access(absolutePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function writeArtifacts(artifacts) {
  const outputPath = path.join(rootDir, ticket27OutputRoot)
  assert(!await exists(outputPath), `refusing to overwrite existing lane output: ${ticket27OutputRoot}`)
  await mkdir(path.dirname(outputPath), { recursive: true })
  let temporaryPath = await mkdtemp(`${outputPath}.tmp-`)
  try {
    for (const artifact of artifacts) {
      const target = path.join(temporaryPath, artifact.relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, artifact.bytes)
    }
    await rename(temporaryPath, outputPath)
    temporaryPath = null
  } finally {
    if (temporaryPath) await rm(temporaryPath, { recursive: true, force: true })
  }
}

async function checkArtifacts(artifacts) {
  const mismatches = []
  for (const artifact of artifacts) {
    const target = path.join(rootDir, ticket27OutputRoot, artifact.relativePath)
    try {
      const actual = await readFile(target)
      if (!actual.equals(artifact.bytes)) mismatches.push(artifact.relativePath)
    } catch (error) {
      if (error.code === 'ENOENT') mismatches.push(artifact.relativePath)
      else throw error
    }
  }
  if (mismatches.length > 0) fail(`deterministic replay mismatch: ${mismatches.join(', ')}`)
}

async function main() {
  const [mode] = process.argv.slice(2)
  if (!['--write', '--check'].includes(mode) || process.argv.length !== 3) {
    fail('Usage: node scripts/materialize-paper-canonical-nck1-confirmation-lane.mjs --write|--check')
  }
  const { artifacts, laneEvidence } = await buildTicket27LaneArtifacts()
  if (mode === '--write') await writeArtifacts(artifacts)
  else await checkArtifacts(artifacts)
  console.log(JSON.stringify({
    status: 'PASS',
    mode: mode.slice(2),
    candidates: laneEvidence.accounting.candidates,
    confirmations: laneEvidence.accounting.confirmations,
    canonicalPapers: laneEvidence.accounting.canonicalPapers,
    unresolved: laneEvidence.accounting.unresolved,
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}
