import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  resolveCanonicalAuthority,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
  withoutKey,
} from '../shared/paper-canonical/stable.mjs'
import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const ticketPath = 'docs/cuts/paper-canonical-unification/tickets/29-zhejiang-legacy-confirmation-lane.md'
const ticket26BaseCommit = '3e707415a10e606f8ace5d0aea84267ddefbe7a9'
const sourceRoot = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1'
const sourceBatchPath = `${sourceRoot}/batch-evidence.json`
const outputRoot = 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-29-zhejiang-legacy-v1'
const manifestPath = 'standards/paper-canonical/manifest-v41.json'
const adapterPath = 'standards/paper-canonical/adapters/source-adapters-v13.json'
const paperIds = Object.freeze([
  'paper-zj-2020-jan',
  'paper-zj-2020-jul',
  'paper-zj-2021-jan',
  'paper-zj-2021-jun',
  'paper-zj-2022-jan',
  'paper-zj-2022-jun',
])
const expectedLayoutAccounting = Object.freeze({
  '3/3/4': 4,
  '3/4/3': 1,
  '4/3/3': 1,
})
const expectedQuestionNumbers = Object.freeze([21, 22, 23, 24, 25, 26, 27, 28, 29, 30])

function absolutePath(relativePath) {
  return resolve(repositoryRoot, relativePath)
}

function canonicalJson(value) {
  return `${stableStringify(value)}\n`
}

function jsonValue(value) {
  return JSON.parse(stableStringify(value))
}

function candidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function storedCandidate(candidate) {
  const { sourceBytes: _sourceBytes, ...stored } = candidate
  return jsonValue(stored)
}

function cartesianLayouts(cardinalities) {
  return cardinalities.reduce(
    (layouts, choices) => layouts.flatMap((layout) => choices.map((choice) => [...layout, choice])),
    [[]],
  )
}

function cardinalityChoices(cardinality) {
  if (cardinality?.kind === 'exact') return [cardinality.count]
  if (cardinality?.kind === 'one_of') return [...cardinality.counts]
  throw new Error(`Ticket 29 requires an exact or one_of reading cardinality, received ${JSON.stringify(cardinality)}`)
}

function layoutKey(layout) {
  return layout.join('/')
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)))
}

function assertZhejiangAuthority() {
  const resolved = resolveCanonicalAuthority(trustedLegacyCaptureCandidateAuthorityRef)
  assert.equal(resolved.ok, true, 'the reviewed private legacy authority must resolve')
  const profile = resolved.closure.profiles.get('zhejiang-legacy')
  assert.ok(profile, 'v41 must retain the Zhejiang legacy profile')
  assert.equal(profile.version, '10', 'Ticket 29 must consume the reviewed Zhejiang profile unchanged')

  const readingSection = profile.parts
    .flatMap((part) => part.sections)
    .find((section) => section.sectionId === 'reading.choice')
  assert.ok(readingSection, 'the Zhejiang profile must expose its reading choice section')
  const slots = readingSection.slots
  assert.deepEqual(
    slots.map((slot) => slot.slotId),
    ['reading.a', 'reading.b', 'reading.c'],
    'Ticket 29 must use the single shared Zhejiang reading-slot authority',
  )
  assert.ok(slots.every((slot) => slot.scoringRule?.kind === 'per_question' && slot.scoringRule.points === 2.5))
  assert.equal(readingSection.score, 25, 'the shared Zhejiang reading section is worth exactly 25 points')

  const permittedLayouts = cartesianLayouts(slots.map((slot) => cardinalityChoices(slot.questionCardinality)))
    .filter((layout) => slots[0].numberingRule.start + layout.reduce((total, count) => total + count, 0) - 1 === slots.at(-1).numberingRule.end)
    .sort((left, right) => layoutKey(left).localeCompare(layoutKey(right)))
  assert.deepEqual(
    permittedLayouts,
    [[3, 3, 4], [3, 4, 3], [4, 3, 3]],
    'the immutable Zhejiang authority permits only the three contiguous 21-30 layouts',
  )

  return {
    authorityRef: jsonValue(trustedLegacyCaptureCandidateAuthorityRef),
    profileVersion: profile.version,
    permittedLayouts,
    questionStart: slots[0].numberingRule.start,
    questionEnd: slots.at(-1).numberingRule.end,
    pointsPerQuestion: slots[0].scoringRule.points,
    sectionPoints: readingSection.score,
  }
}

async function readAuthorityInputs() {
  const [manifestBytes, adapterBytes] = await Promise.all([
    readFile(absolutePath(manifestPath)),
    readFile(absolutePath(adapterPath)),
  ])
  const manifest = JSON.parse(manifestBytes)
  const adapters = JSON.parse(adapterBytes)
  assert.equal(manifest.version, '41')
  assert.equal(digestJson(manifest), trustedLegacyCaptureCandidateAuthorityRef.manifestDigest)
  assert.equal(adapters.version, '13')
  assert.equal(adapters.id, 'source-adapters')
  assert.deepEqual(
    adapters.adapters.find((adapter) => adapter.adapterId === 'ticket-26-legacy-source-capture'),
    {
      adapterId: 'ticket-26-legacy-source-capture',
      mediaType: 'application/vnd.eqb.ticket-26-source-capture+json',
      version: '3',
    },
    'Ticket 29 must retain the reviewed legacy capture adapter v13/v3 unchanged',
  )
  return {
    manifest: {
      path: manifestPath,
      fileSha256: sha256(manifestBytes),
      manifestDigest: digestJson(manifest),
      version: manifest.version,
    },
    adapters: {
      path: adapterPath,
      fileSha256: sha256(adapterBytes),
      adapterDigest: digestJson(adapters),
      version: adapters.version,
      legacyCaptureAdapterVersion: '3',
    },
  }
}

async function readFrozenBatch() {
  const bytes = await readFile(absolutePath(sourceBatchPath))
  const batch = JSON.parse(bytes)
  assert.equal(batch.schemaVersion, 'ticket-26-source-materialization-v1')
  assert.equal(batch.batchDigest, digestJson(withoutKey(batch, 'batchDigest')))
  assert.equal(batch.membership?.frozenPaperCount, 33)
  assert.equal(batch.membership?.materializedPaperCount, 31)
  assert.ok(Array.isArray(batch.papers))
  const byPaperId = new Map(batch.papers.map((paper) => [paper.paperId, paper]))
  assert.equal(byPaperId.size, batch.papers.length, 'Ticket 26 batch membership must remain unique')
  for (const paperId of paperIds) assert.ok(byPaperId.has(paperId), `${paperId} must remain in the frozen Ticket 26 batch`)
  return {
    batch,
    byPaperId,
    evidence: {
      path: sourceBatchPath,
      fileSha256: sha256(bytes),
      batchDigest: batch.batchDigest,
      materializedPaperCount: batch.membership.materializedPaperCount,
    },
  }
}

function assertReadingInvariants(interpretation, authority, paperId) {
  assert.equal(interpretation.paperId, paperId)
  assert.equal(interpretation.profileId, 'zhejiang-legacy')
  const reading = interpretation.groups.filter((group) => group.family === 'reading')
  assert.deepEqual(
    reading.map((group) => group.slotId),
    ['reading.a', 'reading.b', 'reading.c'],
    `${paperId} must use the profile-owned Zhejiang reading slots without a year exception`,
  )
  const layout = reading.map((group) => group.questionIds.length)
  assert.ok(
    authority.permittedLayouts.some((permitted) => layoutKey(permitted) === layoutKey(layout)),
    `${paperId} has an arbitrary Zhejiang reading layout ${layoutKey(layout)}`,
  )
  const questionNumbers = reading.flatMap((group) => group.questions.map((question) => question.questionNo))
  assert.deepEqual(
    questionNumbers,
    expectedQuestionNumbers,
    `${paperId} must retain a contiguous immutable-source 21-30 reading sequence`,
  )
  const points = reading.reduce((total, group) => total + group.questionIds.length * authority.pointsPerQuestion, 0)
  assert.equal(points, authority.sectionPoints, `${paperId} must close the Zhejiang reading section at 25 points`)
  return { layout, questionNumbers, points }
}

function assertCallerSemanticsRejected(candidate, confirmation, paperId) {
  const forged = structuredClone(candidate)
  forged.interpretation = structuredClone(candidate.interpretation)
  forged.interpretation.profileId = `forged-${paperId}`
  forged.candidateDigest = digestJson(candidateBody(forged))
  const result = confirmCanonicalCandidate(forged, {
    ...confirmation,
    candidateDigest: forged.candidateDigest,
  })
  assert.deepEqual(
    result.unresolvedIssues?.map((issue) => issue.code),
    ['CANDIDATE_BINDING_MISMATCH'],
    `${paperId} must reject caller-authored candidate semantics before confirmation`,
  )
}

async function derivePaperArtifacts({ paperId, batchPaper, authority }) {
  const sourceCapturePath = `${sourceRoot}/${paperId}/source-capture-v1.json`
  assert.equal(batchPaper.capture?.path, sourceCapturePath, `${paperId} capture path must remain frozen`)
  const sourceCaptureBytes = new Uint8Array(await readFile(absolutePath(sourceCapturePath)))
  const sourceCapture = JSON.parse(new TextDecoder().decode(sourceCaptureBytes))
  assert.equal(sourceCapture.captureId, batchPaper.capture.captureId)
  assert.equal(sourceCapture.digest, batchPaper.capture.digest)
  assert.equal(sourceCapture.digest, digestJson(withoutKey(withoutKey(sourceCapture, 'captureId'), 'digest')))

  const imported = importCanonicalCandidate({
    kind: 'ticket-26-source-capture-v1',
    sourceCaptureBytes,
  })
  assert.ok(imported.candidate, `${paperId} must yield one Import Candidate`)
  assert.deepEqual(imported.issues, [], `${paperId} must not have unresolved deterministic import issues`)
  const candidate = imported.candidate
  assert.equal(candidate.schemaVersion, 'trusted-ticket-26-legacy-import-candidate-v1')
  assert.deepEqual(candidate.authority, authority.authorityRef)
  assert.equal(candidate.source.paperId, paperId)
  assert.equal(candidate.source.sha256, sha256(sourceCaptureBytes))
  assert.equal(candidate.source.byteLength, sourceCaptureBytes.byteLength)
  assert.equal(candidate.source.captureId, batchPaper.capture.captureId)
  assert.equal(candidate.source.captureDigest, batchPaper.capture.digest)
  assert.deepEqual(
    candidate.source.documents,
    batchPaper.sourceDocuments.map(({ role, sha256: documentSha256, byteLength }) => ({
      role,
      sha256: documentSha256,
      byteLength,
    })),
    `${paperId} candidate must bind all three frozen source-document digests`,
  )
  assert.deepEqual(candidate.issues, [])
  assert.equal(candidate.candidateDigest, digestJson(candidateBody(candidate)))

  const reading = assertReadingInvariants(candidate.interpretation, authority, paperId)
  const teacherConfirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
  assertCallerSemanticsRejected(candidate, teacherConfirmation, paperId)

  const confirmed = confirmCanonicalCandidate(candidate, teacherConfirmation)
  assert.ok(confirmed.canonicalPaper, `${paperId} must produce one complete Canonical Paper after Teacher Confirmation`)
  assert.equal('unresolvedIssues' in confirmed, false, `${paperId} cannot retain partial unresolved output after confirmation`)
  assert.equal('publication' in confirmed, false, `${paperId} confirmation must remain unpublished`)
  assert.deepEqual(confirmed.confirmation, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
  })
  assert.equal(confirmed.canonicalPaper.paperPlan?.completeness?.status, 'complete')

  const storedCanonicalPaper = jsonValue(confirmed.canonicalPaper)
  const canonicalArtifact = {
    schemaVersion: 'ticket-29-zhejiang-legacy-canonical-paper-v1',
    paperId,
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmation: jsonValue(confirmed.confirmation),
    canonicalPaper: storedCanonicalPaper,
  }
  const candidatePath = `${paperId}/import-candidate-v1.json`
  const confirmationPath = `${paperId}/teacher-confirmation-v1.json`
  const canonicalPath = `${paperId}/canonical-paper-v1.json`
  const candidateText = canonicalJson(storedCandidate(candidate))
  const confirmationText = canonicalJson(teacherConfirmation)
  const canonicalText = canonicalJson(canonicalArtifact)

  return {
    files: new Map([
      [candidatePath, candidateText],
      [confirmationPath, confirmationText],
      [canonicalPath, canonicalText],
    ]),
    evidence: {
      paperId,
      sourceCapture: {
        path: sourceCapturePath,
        fileSha256: sha256(sourceCaptureBytes),
        byteLength: sourceCaptureBytes.byteLength,
        captureId: sourceCapture.captureId,
        captureDigest: sourceCapture.digest,
      },
      candidate: {
        path: candidatePath,
        fileSha256: sha256(candidateText),
        candidateDigest: candidate.candidateDigest,
      },
      confirmation: {
        path: confirmationPath,
        fileSha256: sha256(confirmationText),
        confirmationDigest: digestJson(teacherConfirmation),
      },
      canonicalPaper: {
        path: canonicalPath,
        fileSha256: sha256(canonicalText),
        canonicalArtifactDigest: digestJson(canonicalArtifact),
        canonicalPaperDigest: digestJson(storedCanonicalPaper),
        completeness: 'complete',
        publication: 'unpublished',
      },
      reading,
    },
  }
}

async function deriveLaneArtifacts() {
  const [authorityInputs, frozenBatch] = await Promise.all([
    readAuthorityInputs(),
    readFrozenBatch(),
  ])
  const authority = assertZhejiangAuthority()
  const records = []
  const files = new Map()
  for (const paperId of paperIds) {
    const derived = await derivePaperArtifacts({
      paperId,
      batchPaper: frozenBatch.byPaperId.get(paperId),
      authority,
    })
    records.push(derived.evidence)
    for (const [relativePath, text] of derived.files) {
      assert.equal(files.has(relativePath), false, `duplicate Ticket 29 artifact path ${relativePath}`)
      files.set(relativePath, text)
    }
  }

  assert.deepEqual(records.map((record) => record.paperId), paperIds)
  const layoutAccounting = sortedObject(records.reduce((counts, record) => {
    const key = layoutKey(record.reading.layout)
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {}))
  assert.deepEqual(
    layoutAccounting,
    expectedLayoutAccounting,
    'Ticket 29 must prove the observed immutable-source layout distribution without a paper/year exception',
  )

  const evidenceBody = {
    schemaVersion: 'ticket-29-zhejiang-legacy-confirmation-lane-evidence-v1',
    ticket: {
      path: ticketPath,
      sourceBaseCommit: ticket26BaseCommit,
    },
    authority: authority.authorityRef,
    authorityInputs,
    frozenSourceBatch: frozenBatch.evidence,
    membership: {
      paperIds: [...paperIds],
      expectedPaperCount: 6,
    },
    zhejiangReadingAuthority: {
      profileId: 'zhejiang-legacy',
      profileVersion: authority.profileVersion,
      permittedLayouts: authority.permittedLayouts.map((layout) => [...layout]),
      questionRange: [authority.questionStart, authority.questionEnd],
      pointsPerQuestion: authority.pointsPerQuestion,
      sectionPoints: authority.sectionPoints,
    },
    layoutAccounting,
    accounting: {
      sourceCaptures: records.length,
      importCandidates: records.length,
      teacherConfirmations: records.length,
      completeUnpublishedCanonicalPapers: records.length,
      unresolvedPapers: 0,
      publishedPapers: 0,
    },
    papers: records,
  }
  const evidence = {
    ...evidenceBody,
    evidenceDigest: digestJson(evidenceBody),
  }
  assert.equal(evidence.evidenceDigest, digestJson(withoutKey(evidence, 'evidenceDigest')))
  files.set('lane-evidence-v1.json', canonicalJson(evidence))

  return {
    files,
    summary: {
      paperCount: records.length,
      layoutAccounting,
      authority: authority.authorityRef,
      adapterVersion: authorityInputs.adapters.version,
      sourceBatchDigest: frozenBatch.evidence.batchDigest,
    },
  }
}

async function listRelativeFiles(rootPath, prefix = '') {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const entryPath = join(rootPath, entry.name)
    if (entry.isDirectory()) return listRelativeFiles(entryPath, relativePath)
    assert.equal(entry.isFile(), true, `Ticket 29 output contains a non-file artifact: ${relativePath}`)
    return [relativePath]
  }))
  return nested.flat().sort((left, right) => left.localeCompare(right))
}

async function verifyWrittenArtifacts(derived) {
  const destination = absolutePath(outputRoot)
  assert.equal(existsSync(destination), true, `Ticket 29 output is missing: ${outputRoot}`)
  const expectedPaths = [...derived.files.keys()].sort((left, right) => left.localeCompare(right))
  assert.deepEqual(
    await listRelativeFiles(destination),
    expectedPaths,
    'Ticket 29 output must contain exactly the approved six-paper artifact set and lane evidence',
  )
  for (const relativePath of expectedPaths) {
    const actual = await readFile(join(destination, relativePath), 'utf8')
    assert.equal(
      actual,
      derived.files.get(relativePath),
      `${relativePath} must exactly replay from immutable Ticket 26 source bytes`,
    )
  }
}

async function writeArtifactsAtomically(derived) {
  const destination = absolutePath(outputRoot)
  assert.equal(existsSync(destination), false, `refusing to overwrite existing Ticket 29 artifacts at ${outputRoot}`)
  const parent = dirname(destination)
  await mkdir(parent, { recursive: true })
  const temporaryRoot = await mkdtemp(join(parent, '.ticket-29-zhejiang-'))
  const stagedOutput = join(temporaryRoot, basename(destination))
  try {
    for (const [relativePath, text] of derived.files) {
      const target = join(stagedOutput, relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, text, 'utf8')
    }
    await rename(stagedOutput, destination)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === '--write'),
    'usage: node scripts/verify-paper-canonical-ticket-29-zhejiang-legacy-lane.mjs [--write]',
  )
  const write = args[0] === '--write'
  const derived = await deriveLaneArtifacts()
  if (write) await writeArtifactsAtomically(derived)

  // A second independent derivation is the deterministic replay oracle; it
  // never consumes candidate, confirmation, or canonical artifact semantics.
  const replay = await deriveLaneArtifacts()
  await verifyWrittenArtifacts(replay)
  console.log(JSON.stringify({
    status: 'PASS',
    ticket: 29,
    sourceBaseCommit: ticket26BaseCommit,
    artifactRoot: outputRoot,
    ...replay.summary,
  }))
}

await main()
