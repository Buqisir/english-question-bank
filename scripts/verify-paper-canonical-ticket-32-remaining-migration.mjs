#!/usr/bin/env node

/**
 * Ticket 32's sole producer and verifier. It admits only the three committed
 * lane allowlists through the registered-confirmation bridge, writes one
 * isolated publication store, and then verifies that exact store without
 * restoring, restamping, or changing any shared canonical behavior.
 */

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  latestRefFileName,
  loadPaperForConsumptionSync,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { resolveRegisteredConfirmedCanonicalAdmission } from '../server/paper-canonical/registeredConfirmedCanonicalAdmission.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
  withoutKey,
} from '../shared/paper-canonical/stable.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const baseHead = 'a374dab8bf78efb99181bcb5bace06100d85c1ce'
const manifestPath = 'docs/cuts/paper-canonical-unification/migration/manifest-v2.json'
const accountingPath = 'docs/cuts/paper-canonical-unification/migration/ticket-32-final-migration-accounting-v1.json'
const publicationRoot = 'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store'
const ticket31CanaryRoot = 'test-fixtures/paper-canonical/publications/ticket-31-canary-v1/store'
const trustedDocxSourcePath = 'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const canaryPaperIds = Object.freeze([
  'paper-960d0f8d',
  'paper-2025-ii',
  'paper-2023-yi',
  'paper-zj-2022-jun',
])
const representativePaperIds = Object.freeze([
  'paper-2025-i',
  'paper-2022-ii',
  'paper-zj-2021-jun',
])
const expectedCounts = Object.freeze({
  remaining: { papers: 29, groups: 240, questions: 1345, questionOwnedOptions: 3640 },
  canaries: { papers: 4, groups: 33, questions: 185, questionOwnedOptions: 500 },
  frozenCombined: { papers: 33, groups: 273, questions: 1530, questionOwnedOptions: 4140 },
})
const laneConfigs = Object.freeze([
  Object.freeze({
    id: 'A',
    route: 'terra-xhigh',
    commit: '622feccf11fcf4e7d56604b6426892506ec6e45f',
    path: 'docs/cuts/paper-canonical-unification/migration/ticket-32-lane-terra-xhigh-admission-v1.json',
    schemaVersion: 'ticket-32-lane-terra-xhigh-admission-v1',
    membership: (lane) => lane.membership?.paperIds,
  }),
  Object.freeze({
    id: 'B',
    route: 'luna-max',
    commit: 'c43644a3b770a45adedbfe73ad12d469769c707b',
    path: 'docs/cuts/paper-canonical-unification/migration/ticket-32-lane-luna-max-admission-v1.json',
    schemaVersion: 'ticket-32-lane-admission-v1',
    membership: (lane) => lane.paperIds,
  }),
  Object.freeze({
    id: 'C',
    route: 'luna-xhigh',
    commit: 'd5c6902c2439e5d506efd6842610032d9416c061',
    path: 'docs/cuts/paper-canonical-unification/migration/ticket-32-lane-luna-xhigh-admission-v1.json',
    schemaVersion: 'ticket-32-lane-admission-v1',
    membership: (lane) => lane.membership?.paperIds,
  }),
])

function absolutePath(relativePath) {
  assert.equal(typeof relativePath, 'string', 'repository path must be a string')
  assert.equal(relativePath.startsWith('/'), false, `${relativePath} must be repository-relative`)
  assert.equal(relativePath.includes('..'), false, `${relativePath} must not escape the repository`)
  const absolute = resolve(repositoryRoot, relativePath)
  assert.equal(absolute.startsWith(`${repositoryRoot}${sep}`), true, `${relativePath} must remain inside the repository`)
  return absolute
}

function bytes(relativePath) {
  return new Uint8Array(readFileSync(absolutePath(relativePath)))
}

function json(relativePath) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes(relativePath)))
  } catch (error) {
    throw new Error(`${relativePath} is not readable JSON: ${error.message}`)
  }
}

function canonicalJson(value) {
  return `${stableStringify(value)}\n`
}

function candidateFromArtifact(artifact) {
  return artifact?.candidate?.candidateDigest ? artifact.candidate : artifact
}

function confirmationFromArtifact(artifact) {
  return artifact?.teacherConfirmation || artifact?.confirmation || artifact
}

function canonicalFromArtifact(artifact) {
  return artifact?.canonicalPaper || artifact
}

function candidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function sameAuthority(left, right) {
  return left?.manifestId === right?.manifestId
    && left?.manifestVersion === right?.manifestVersion
    && left?.manifestDigest === right?.manifestDigest
}

function artifactBytes(descriptor, label) {
  assert.ok(descriptor?.path, `${label} descriptor path is required`)
  const value = bytes(descriptor.path)
  assert.equal(value.byteLength, descriptor.byteLength, `${label} byte length must remain pinned`)
  assert.equal(sha256(value), descriptor.fileSha256, `${label} bytes must remain pinned`)
  return value
}

function sourceAssetBytes(record) {
  return record.sourceType === 'trusted-docx'
    ? bytes(trustedDocxSourcePath)
    : artifactBytes(record.sourceCapture, `${record.paperId} Source Capture`)
}

function inspectCanonical(record) {
  const canonical = canonicalFromArtifact(JSON.parse(new TextDecoder().decode(
    artifactBytes(record.canonicalPaper, `${record.paperId} Canonical Paper`),
  )))
  assert.equal(canonical.paperPlan?.paperId, record.paperId, `${record.paperId} Canonical Paper id must close`)
  assert.equal(canonical.paperPlan?.completeness?.status, 'complete', `${record.paperId} Canonical Paper must be complete`)
  assert.equal(digestJson(canonical), record.canonicalPaper.canonicalPaperDigest, `${record.paperId} Canonical Paper digest must close`)
  assert.equal(Array.isArray(canonical.questionGroups), true, `${record.paperId} Canonical Paper groups must be an array`)
  return canonical
}

function countCanonical(canonical) {
  const totals = { papers: 1, groups: canonical.questionGroups.length, questions: 0, questionOwnedOptions: 0 }
  for (const group of canonical.questionGroups) {
    assert.equal(Array.isArray(group.questionRefs), true, `${canonical.paperPlan.paperId} group question refs must be an array`)
    totals.questions += group.questionRefs.length
    const ownership = group.variant?.choiceOwnership
    if (ownership?.ownership === 'per_question') {
      assert.equal(Array.isArray(ownership.sets), true, `${canonical.paperPlan.paperId} question-owned option sets must be an array`)
      for (const optionSet of ownership.sets) {
        assert.equal(Array.isArray(optionSet.options), true, `${canonical.paperPlan.paperId} question-owned options must be an array`)
        totals.questionOwnedOptions += optionSet.options.length
      }
    }
  }
  return totals
}

function sumCounts(records) {
  return records.reduce((total, record) => {
    const counts = countCanonical(record.canonical)
    total.papers += counts.papers
    total.groups += counts.groups
    total.questions += counts.questions
    total.questionOwnedOptions += counts.questionOwnedOptions
    return total
  }, { papers: 0, groups: 0, questions: 0, questionOwnedOptions: 0 })
}

function assertCounts(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} counts must close exactly`)
}

function assertTrueBooleans(value, label) {
  if (typeof value === 'boolean') {
    assert.equal(value, true, `${label} cannot be false`)
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => assertTrueBooleans(entry, `${label}[${index}]`))
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertTrueBooleans(entry, `${label}.${key}`)
  }
}

function laneCandidate(paper) {
  return paper.candidate || paper.importCandidate
}

function laneConfirmation(paper) {
  return paper.confirmation || paper.teacherConfirmation
}

function descriptorDigest(descriptor, ...keys) {
  for (const key of keys) if (typeof descriptor?.[key] === 'string') return descriptor[key]
  return undefined
}

function assertLaneDescriptor(lanePaper, record, laneId) {
  const candidate = laneCandidate(lanePaper)
  const confirmation = laneConfirmation(lanePaper)
  assert.equal(lanePaper.paperId, record.paperId, `Lane ${laneId} paper id must close`)
  assert.equal(lanePaper.sourceCapture?.fileSha256, record.sourceCapture.fileSha256, `${record.paperId} lane Source Capture must match registry`)
  assert.equal(descriptorDigest(lanePaper.sourceCapture, 'sourceCaptureDigest', 'captureDigest', 'semanticDigest'), record.sourceCapture.sourceCaptureDigest, `${record.paperId} lane Source Capture digest must match registry`)
  assert.equal(candidate?.fileSha256, record.candidate.fileSha256, `${record.paperId} lane Candidate bytes must match registry`)
  assert.equal(descriptorDigest(candidate, 'candidateDigest', 'semanticDigest'), record.candidate.candidateDigest, `${record.paperId} lane Candidate digest must match registry`)
  assert.equal(confirmation?.fileSha256, record.confirmation.fileSha256, `${record.paperId} lane Confirmation bytes must match registry`)
  assert.equal(descriptorDigest(confirmation, 'confirmationDigest', 'semanticDigest'), record.confirmation.confirmationDigest, `${record.paperId} lane Confirmation digest must match registry`)
  assert.equal(lanePaper.canonicalPaper?.fileSha256, record.canonicalPaper.fileSha256, `${record.paperId} lane Canonical Paper bytes must match registry`)
  assert.equal(descriptorDigest(lanePaper.canonicalPaper, 'canonicalPaperDigest', 'canonicalArtifactDigest', 'semanticDigest'), record.canonicalPaper.canonicalPaperDigest, `${record.paperId} lane Canonical Paper digest must match registry`)
}

function inspectExactRecord(record) {
  const captureBytes = artifactBytes(record.sourceCapture, `${record.paperId} Source Capture`)
  const sourceCapture = JSON.parse(new TextDecoder().decode(captureBytes))
  const candidate = candidateFromArtifact(JSON.parse(new TextDecoder().decode(
    artifactBytes(record.candidate, `${record.paperId} Candidate`),
  )))
  const confirmation = confirmationFromArtifact(JSON.parse(new TextDecoder().decode(
    artifactBytes(record.confirmation, `${record.paperId} Teacher Confirmation`),
  )))
  const canonical = inspectCanonical(record)
  const sourceBytes = sourceAssetBytes(record)

  assert.equal(sourceCapture.captureId, record.sourceCapture.sourceCaptureId, `${record.paperId} Source Capture id must close`)
  assert.equal(sourceCapture.digest, record.sourceCapture.sourceCaptureDigest, `${record.paperId} Source Capture digest must close`)
  assert.equal(candidate.candidateDigest, record.candidate.candidateDigest, `${record.paperId} Candidate registry digest must close`)
  assert.equal(candidate.candidateDigest, digestJson(candidateBody(candidate)), `${record.paperId} Candidate semantic digest must close`)
  assert.equal(candidate.interpretation?.paperId, record.paperId, `${record.paperId} Candidate must retain paper identity`)
  assert.equal(sameAuthority(candidate.authority, record.authority), true, `${record.paperId} Candidate authority must close`)
  assert.equal(candidate.source?.sha256, sha256(sourceBytes), `${record.paperId} Candidate source digest must close`)
  assert.equal(candidate.source?.byteLength, sourceBytes.byteLength, `${record.paperId} Candidate source length must close`)
  assert.equal(confirmation.candidateDigest, candidate.candidateDigest, `${record.paperId} Confirmation must bind Candidate`)
  assert.equal(confirmation.sourceDigest, candidate.source.sha256, `${record.paperId} Confirmation must bind source`)
  assert.equal(confirmation.confirmed, true, `${record.paperId} Confirmation must remain confirmed`)
  assert.equal(digestJson(confirmation), record.confirmation.confirmationDigest, `${record.paperId} Confirmation digest must close`)
  assert.equal(sameAuthority(canonical.paperPlan.authorityRef, candidate.authority), true, `${record.paperId} Canonical Paper authority must bind Candidate`)

  return {
    record,
    canonical,
    envelope: {
      schemaVersion: 'registered-confirmed-canonical-admission-v1',
      paperId: record.paperId,
      sourceBytes,
      candidateBytes: artifactBytes(record.candidate, `${record.paperId} Candidate`),
      confirmationBytes: artifactBytes(record.confirmation, `${record.paperId} Teacher Confirmation`),
      canonicalPaperBytes: artifactBytes(record.canonicalPaper, `${record.paperId} Canonical Paper`),
    },
  }
}

function inspectInput() {
  const manifest = json(manifestPath)
  assert.equal(manifest.schemaVersion, 'paper-canonical-migration-manifest-v2')
  assert.equal(manifest.manifestDigest, digestJson(withoutKey(manifest, 'manifestDigest')), 'Migration manifest digest must close')
  assert.equal(manifest.publication?.publications, 0, 'Migration manifest must remain the pre-publication registry')
  assert.equal(manifest.publication?.currentRefs, 0, 'Migration manifest must have no current refs')
  assert.equal(manifest.membership?.completeUnpublishedCanonicalPapers, 33, 'Migration manifest must retain 33 complete unpublished papers')
  assert.equal(Array.isArray(manifest.papers), true, 'Migration manifest papers must be an array')
  assert.equal(manifest.papers.length, 33, 'Migration manifest must contain 33 records')

  const byPaperId = new Map(manifest.papers.map((record) => [record.paperId, record]))
  assert.equal(byPaperId.size, 33, 'Migration manifest must not duplicate paper identities')
  const canaries = new Set(canaryPaperIds)
  const laneInputs = laneConfigs.map((config) => {
    const lane = json(config.path)
    assert.equal(lane.schemaVersion, config.schemaVersion, `Lane ${config.id} schema must match its accepted artifact`)
    assertTrueBooleans(lane.invariants, `Lane ${config.id} invariants`)
    const paperIds = config.membership(lane)
    assert.equal(Array.isArray(paperIds), true, `Lane ${config.id} membership must be an array`)
    assert.equal(Array.isArray(lane.papers), true, `Lane ${config.id} paper records must be an array`)
    assert.deepEqual(lane.papers.map((paper) => paper.paperId), paperIds, `Lane ${config.id} records must remain in declared allowlist order`)
    assert.equal(new Set(paperIds).size, paperIds.length, `Lane ${config.id} membership must be unique`)
    assert.equal(paperIds.some((paperId) => canaries.has(paperId)), false, `Lane ${config.id} must not contain a Ticket 31 canary`)
    const records = paperIds.map((paperId) => {
      const record = byPaperId.get(paperId)
      assert.ok(record, `Lane ${config.id} paper ${paperId} must be registered`)
      assertLaneDescriptor(lane.papers.find((paper) => paper.paperId === paperId), record, config.id)
      return record
    })
    const counts = records.map((record) => ({ canonical: inspectCanonical(record) }))
    const aggregate = sumCounts(counts)
    assert.equal(lane.aggregate?.paperCount ?? lane.aggregate?.completeUnpublishedCanonicalPaperCount, paperIds.length, `Lane ${config.id} declared paper count must close`)
    assert.equal(lane.aggregate?.groupCount, aggregate.groups, `Lane ${config.id} declared group count must close`)
    assert.equal(lane.aggregate?.questionCount, aggregate.questions, `Lane ${config.id} declared question count must close`)
    assert.equal(lane.aggregate?.optionCount, aggregate.questionOwnedOptions, `Lane ${config.id} declared question-owned option count must close`)
    return { config, lane, paperIds, records, aggregate }
  })

  const lanePaperIds = laneInputs.flatMap((lane) => lane.paperIds)
  assert.equal(lanePaperIds.length, 29, 'The three Ticket 32 lanes must contain 29 papers')
  assert.equal(new Set(lanePaperIds).size, 29, 'The three Ticket 32 lanes must not overlap')
  const expectedRemaining = manifest.membership.paperIds.filter((paperId) => !canaries.has(paperId))
  assert.deepEqual([...lanePaperIds].sort(), [...expectedRemaining].sort(), 'Lane union must equal the exact non-canary registry membership')

  const remaining = laneInputs.flatMap((lane) => lane.records.map((record) => inspectExactRecord(record)))
  const all = manifest.papers.map((record) => ({ canonical: inspectCanonical(record), record }))
  const canaryRecords = all.filter(({ record }) => canaries.has(record.paperId))
  assert.equal(canaryRecords.length, 4, 'The frozen registry must contain all four Ticket 31 canaries')
  assertCounts(sumCounts(remaining), expectedCounts.remaining, 'Remaining corpus')
  assertCounts(sumCounts(canaryRecords), expectedCounts.canaries, 'Canary corpus')
  assertCounts(sumCounts(all), expectedCounts.frozenCombined, 'Frozen combined corpus')

  return { manifest, laneInputs, remaining, canaryRecords }
}

function snapshotTree(relativeRoot) {
  const root = absolutePath(relativeRoot)
  assert.equal(existsSync(root), true, `${relativeRoot} must exist`)
  const files = []
  function visit(current, prefix = '') {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const next = join(current, entry.name)
      const nextPath = prefix ? `${prefix}/${entry.name}` : entry.name
      assert.equal(entry.isSymbolicLink(), false, `${relativeRoot}/${nextPath} cannot be a symlink`)
      if (entry.isDirectory()) visit(next, nextPath)
      else {
        assert.equal(entry.isFile(), true, `${relativeRoot}/${nextPath} must be a regular file`)
        const value = new Uint8Array(readFileSync(next))
        files.push({ path: nextPath, byteLength: value.byteLength, sha256: sha256(value) })
      }
    }
  }
  visit(root)
  return { root: relativeRoot, fileCount: files.length, treeDigest: digestJson(files), files }
}

function compactSnapshot(snapshot) {
  return { root: snapshot.root, fileCount: snapshot.fileCount, treeDigest: snapshot.treeDigest }
}

function findRecoveryJournals(relativeRoot) {
  return snapshotTree(relativeRoot).files
    .filter((entry) => entry.path.split('/').at(-1) === '.canonical-latest-swap-v1.json')
    .map((entry) => entry.path)
}

function refForDatabaseRow(row) {
  return {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: row.source_asset_version,
    publicationDigest: row.publication_digest,
  }
}

function assertReadyReload({ rootDir, db, paperId, expectedRef }) {
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const refs = store.readPublishedRefs(paperId)
  assert.deepEqual(refs.current, expectedRef, `${paperId} SQLite current identity must close`)
  assert.deepEqual(refs.latest, expectedRef, `${paperId} latest ref identity must close`)
  const latest = JSON.parse(readFileSync(join(rootDir, paperId, 'latest', latestRefFileName)))
  assert.equal(latest.paperId, expectedRef.paperId, `${paperId} latest JSON paper id must close`)
  assert.equal(latest.versionName, expectedRef.versionName, `${paperId} latest JSON version must close`)
  assert.equal(latest.publicationDigest, expectedRef.publicationDigest, `${paperId} latest JSON digest must close`)
  for (const consumerContract of Object.values(consumerContractRefs)) {
    const consumption = loadPaperForConsumptionSync({ paperId, consumerContract }, store)
    assert.equal(consumption.disposition, 'ready', `${paperId} must reopen through ${consumerContract.id}`)
    assert.equal(consumption.paperId, paperId, `${paperId} reopen must retain identity`)
    assert.equal(consumption.selections.length > 0, true, `${paperId} reopen must select canonical families`)
    assert.equal(consumption.selections.every((selection) => selection.mode === 'canonical'), true, `${paperId} reopen must not fall back to legacy`)
  }
  const rows = db.prepare('SELECT paper_id, version_name, source_asset_version, publication_digest FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1').all(paperId)
  assert.equal(rows.length, 1, `${paperId} must have one current database row`)
  assert.deepEqual(refForDatabaseRow(rows[0]), expectedRef, `${paperId} current database row must match latest ref`)
  assert.equal(recoverCanonicalPaperPublication({ rootDir, db, paperId }).status, 'clean', `${paperId} must leave no recovery work`)
  assert.equal(existsSync(join(rootDir, paperId, '.canonical-latest-swap-v1.json')), false, `${paperId} must leave no recovery journal`)
}

function assertStoreMembership({ rootDir, db, expectedRecords }) {
  const expectedIds = expectedRecords.map(({ record }) => record.paperId)
  const rows = db.prepare('SELECT paper_id, version_name, source_asset_version, publication_digest, is_current FROM canonical_paper_publications ORDER BY paper_id, version_name').all()
  const currentRows = rows.filter((row) => row.is_current === 1)
  assert.equal(rows.length, expectedIds.length, 'One immutable Publication must exist for every remaining paper')
  assert.equal(currentRows.length, expectedIds.length, 'One current ref must exist for every remaining paper')
  assert.deepEqual(currentRows.map((row) => row.paper_id), [...expectedIds].sort(), 'Current identities must have no missing, duplicate, or extra paper')
  assert.equal(currentRows.some((row) => canaryPaperIds.includes(row.paper_id)), false, 'Ticket 32 store must never publish Ticket 31 canaries')
  assert.deepEqual(findRecoveryJournals(publicationRoot), [], 'Publication store must have zero residual recovery journals')
  return currentRows.map(refForDatabaseRow)
}

function assertRegisteredAdmission(entry) {
  const admission = resolveRegisteredConfirmedCanonicalAdmission(entry.envelope)
  assert.equal(admission.identity.paperId, entry.record.paperId, `${entry.record.paperId} registered admission must retain paper identity`)
  assert.equal(admission.identity.candidateDigest, entry.record.candidate.candidateDigest, `${entry.record.paperId} registered admission must retain Candidate identity`)
  assert.equal(admission.identity.sourceDigest, entry.record.confirmation.sourceDigest, `${entry.record.paperId} registered admission must retain source identity`)
  assert.equal(sameAuthority(admission.identity.authority, entry.record.authority), true, `${entry.record.paperId} registered admission must retain authority identity`)
}

function runRepresentativePublicReload({ rootDir, db }) {
  const runtime = createCanonicalConsumerRuntime({ rootDir, db })
  const observations = []
  for (const paperId of representativePaperIds) {
    for (const consumerId of Object.keys(consumerContractRefs)) {
      const consumption = runtime.load({ paperId, consumerId })
      assert.equal(consumption.disposition, 'ready', `${paperId} ${consumerId} public consumer reload must be ready`)
      assert.equal(consumption.selections.every((selection) => selection.mode === 'canonical'), true, `${paperId} ${consumerId} public consumer must use canonical selections`)
      observations.push({ paperId, consumerId, selections: consumption.selections.length, disposition: consumption.disposition })
    }
  }
  return observations
}

function publicationEvidence(entry, published) {
  return {
    paperId: entry.record.paperId,
    lane: entry.lane.config.id,
    sourceCapture: {
      path: entry.record.sourceCapture.path,
      sourceCaptureId: entry.record.sourceCapture.sourceCaptureId,
      sourceCaptureDigest: entry.record.sourceCapture.sourceCaptureDigest,
      fileSha256: entry.record.sourceCapture.fileSha256,
    },
    candidate: {
      path: entry.record.candidate.path,
      candidateDigest: entry.record.candidate.candidateDigest,
      fileSha256: entry.record.candidate.fileSha256,
    },
    confirmation: {
      path: entry.record.confirmation.path,
      confirmationDigest: entry.record.confirmation.confirmationDigest,
      candidateDigest: entry.record.confirmation.candidateDigest,
      sourceDigest: entry.record.confirmation.sourceDigest,
      fileSha256: entry.record.confirmation.fileSha256,
    },
    canonicalPaper: {
      path: entry.record.canonicalPaper.path,
      canonicalPaperDigest: entry.record.canonicalPaper.canonicalPaperDigest,
      fileSha256: entry.record.canonicalPaper.fileSha256,
    },
    publication: {
      versionName: published.versionName,
      sourceAssetVersion: 1,
      publicationDigest: published.publicationDigest,
      atomicPublish: 'published',
      exactReopen: true,
      identicalRetry: 'idempotent',
      databaseAndCurrentIdentity: 'exact',
      residualRecoveryJournal: 'none',
    },
    rollback: { disposition: 'no_prior_rollback_target' },
  }
}

function createAccounting({ input, publicationEntries, canaryBefore, canaryAfter, finalStore, representativeReload }) {
  const body = {
    schemaVersion: 'ticket-32-final-migration-accounting-v1',
    status: 'PASS',
    ticket: {
      number: 32,
      baseHead,
      nextOnPass: 'docs/cuts/paper-canonical-unification/tickets/33-shared-screen-print-pdf-proof.md',
    },
    admissionLanes: input.laneInputs.map(({ config, paperIds, aggregate }) => ({
      id: config.id,
      route: config.route,
      commit: config.commit,
      path: config.path,
      paperIds,
      aggregate,
    })),
    accounting: {
      remaining: expectedCounts.remaining,
      canaries: expectedCounts.canaries,
      frozenCombined: expectedCounts.frozenCombined,
      currentIdentity: {
        expected: 29,
        observed: 29,
        missing: [],
        duplicate: [],
        extra: [],
      },
      rollbackTargets: {
        priorVersionedPapers: 0,
        disposition: 'no_prior_rollback_target',
      },
    },
    publication: {
      root: publicationRoot,
      sqlite: 'publication.sqlite',
      writer: 'single',
      order: laneConfigs.map((lane) => `${lane.id}:${lane.route}`),
      immutablePublications: 29,
      currentRefs: 29,
      canonicalSelections: 29,
      residualRecoveryJournals: 0,
      papers: publicationEntries,
    },
    immutableTicket31CanaryStore: {
      before: compactSnapshot(canaryBefore),
      after: compactSnapshot(canaryAfter),
      unchanged: true,
    },
    finalStore: compactSnapshot(finalStore),
    publicConsumerReload: {
      representatives: representativeReload,
      scope: 'selection-and-reload only; Ticket 33 owns corpus Screen/Print/PDF proof',
    },
    invariants: {
      exactRegisteredConfirmationChainsOnly: true,
      noCanaryRepublish: true,
      noMissingDuplicateOrExtraCurrentIdentity: true,
      exactReopenAndIdenticalRetryPerPaper: true,
      zeroResidualRecoveryJournal: true,
      noPriorRollbackTargetFabricated: true,
      ticket31CanaryStoreBytesUnchanged: true,
      noSharedAdapterSchemaPublisherRendererAuthorityChange: true,
    },
  }
  return { ...body, evidenceDigest: digestJson(body) }
}

function writeNewJson(relativePath, value) {
  const target = absolutePath(relativePath)
  assert.equal(existsSync(target), false, `${relativePath} already exists; produce mode never overwrites evidence`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, canonicalJson(value))
}

function produce(input) {
  const outputRoot = absolutePath(publicationRoot)
  assert.equal(existsSync(outputRoot), false, 'Ticket 32 publication store already exists; refusing to overwrite prior publication or recovery evidence')
  assert.equal(existsSync(absolutePath(accountingPath)), false, 'Ticket 32 accounting already exists; refusing to overwrite prior evidence')
  const canaryBefore = snapshotTree(ticket31CanaryRoot)
  mkdirSync(outputRoot, { recursive: true })
  const db = new DatabaseSync(join(outputRoot, 'publication.sqlite'))
  const publishedEntries = []
  try {
    for (const lane of input.laneInputs) {
      for (const record of lane.records) {
        const exact = input.remaining.find((entry) => entry.record.paperId === record.paperId)
        assert.ok(exact, `${record.paperId} must have one exact registered chain`)
        const published = publishCanonicalPaperPublication({
          rootDir: outputRoot,
          db,
          sourceAssetVersion: 1,
          registeredConfirmation: exact.envelope,
        })
        assert.equal(published.status, 'published', `${record.paperId} must atomically publish once`)
        const expectedRef = {
          paperId: record.paperId,
          versionName: published.versionName,
          sourceAssetVersion: 1,
          publicationDigest: published.publicationDigest,
        }
        assertReadyReload({ rootDir: outputRoot, db, paperId: record.paperId, expectedRef })
        const retried = publishCanonicalPaperPublication({
          rootDir: outputRoot,
          db,
          sourceAssetVersion: 1,
          registeredConfirmation: exact.envelope,
        })
        assert.equal(retried.status, 'idempotent', `${record.paperId} identical retry must be idempotent`)
        assert.equal(retried.publicationDigest, published.publicationDigest, `${record.paperId} retry digest must remain exact`)
        assert.equal(retried.versionName, published.versionName, `${record.paperId} retry version must remain exact`)
        assertReadyReload({ rootDir: outputRoot, db, paperId: record.paperId, expectedRef })
        publishedEntries.push(publicationEvidence({ ...exact, lane }, published))
      }
    }
    assertStoreMembership({ rootDir: outputRoot, db, expectedRecords: input.remaining })
  } finally {
    db.close()
  }

  const reopenedDb = new DatabaseSync(join(outputRoot, 'publication.sqlite'))
  let representativeReload
  try {
    assertStoreMembership({ rootDir: outputRoot, db: reopenedDb, expectedRecords: input.remaining })
    representativeReload = runRepresentativePublicReload({ rootDir: outputRoot, db: reopenedDb })
  } finally {
    reopenedDb.close()
  }
  const finalStore = snapshotTree(publicationRoot)
  const canaryAfter = snapshotTree(ticket31CanaryRoot)
  assert.deepEqual(canaryAfter.files, canaryBefore.files, 'Ticket 31 canary store bytes must remain unchanged')
  const accounting = createAccounting({
    input,
    publicationEntries: publishedEntries,
    canaryBefore,
    canaryAfter,
    finalStore,
    representativeReload,
  })
  writeNewJson(accountingPath, accounting)
  return {
    status: 'PASS',
    mode: 'produce',
    papers: publishedEntries.length,
    counts: expectedCounts.remaining,
    finalStore: compactSnapshot(finalStore),
  }
}

function check(input, { exactReload }) {
  assert.equal(existsSync(absolutePath(publicationRoot)), true, 'Ticket 32 publication store must exist for check mode')
  const accounting = json(accountingPath)
  assert.equal(accounting.schemaVersion, 'ticket-32-final-migration-accounting-v1')
  assert.equal(accounting.status, 'PASS')
  assert.equal(accounting.evidenceDigest, digestJson(withoutKey(accounting, 'evidenceDigest')), 'Ticket 32 accounting digest must close')
  assert.deepEqual(accounting.accounting.remaining, expectedCounts.remaining)
  assert.deepEqual(accounting.accounting.canaries, expectedCounts.canaries)
  assert.deepEqual(accounting.accounting.frozenCombined, expectedCounts.frozenCombined)
  assert.deepEqual(accounting.publication.order, laneConfigs.map((lane) => `${lane.id}:${lane.route}`))
  assert.equal(accounting.publication.papers.length, 29)
  assert.equal(accounting.publication.papers.every((paper) => paper.rollback?.disposition === 'no_prior_rollback_target'), true, 'Every Ticket 32 paper must record the absent prior rollback target')
  const before = snapshotTree(publicationRoot)
  const db = new DatabaseSync(join(absolutePath(publicationRoot), 'publication.sqlite'))
  let representativeReload = []
  try {
    for (const entry of input.remaining) {
      assertRegisteredAdmission(entry)
      const expectedEvidence = accounting.publication.papers.find((paper) => paper.paperId === entry.record.paperId)
      assert.ok(expectedEvidence, `${entry.record.paperId} must have persisted accounting`)
      const expectedRef = {
        paperId: entry.record.paperId,
        versionName: expectedEvidence.publication.versionName,
        sourceAssetVersion: expectedEvidence.publication.sourceAssetVersion,
        publicationDigest: expectedEvidence.publication.publicationDigest,
      }
      assertReadyReload({ rootDir: absolutePath(publicationRoot), db, paperId: entry.record.paperId, expectedRef })
    }
    assertStoreMembership({ rootDir: absolutePath(publicationRoot), db, expectedRecords: input.remaining })
    if (exactReload) representativeReload = runRepresentativePublicReload({ rootDir: absolutePath(publicationRoot), db })
  } finally {
    db.close()
  }
  const after = snapshotTree(publicationRoot)
  assert.deepEqual(after.files, before.files, 'Check mode must not mutate the publication store')
  const canary = snapshotTree(ticket31CanaryRoot)
  assert.deepEqual(compactSnapshot(canary), accounting.immutableTicket31CanaryStore.after, 'Ticket 31 canary store must remain byte-identical to produce evidence')
  assert.deepEqual(compactSnapshot(after), accounting.finalStore, 'Ticket 32 final store must exactly match produce evidence')
  return {
    status: 'PASS',
    mode: 'check',
    exactReload,
    papers: input.remaining.length,
    counts: expectedCounts.remaining,
    representativeReloads: representativeReload.length,
  }
}

function parseMode(argv) {
  const args = new Set(argv)
  for (const arg of args) assert.equal(['--produce', '--check', '--exact-reload'].includes(arg), true, `Unknown argument: ${arg}`)
  assert.equal(args.has('--produce') === args.has('--check'), false, 'Choose exactly one of --produce or --check')
  assert.equal(args.has('--exact-reload') && !args.has('--check'), false, '--exact-reload is only valid with --check')
  return { produce: args.has('--produce'), exactReload: args.has('--exact-reload') }
}

const mode = parseMode(process.argv.slice(2))
const input = inspectInput()
const result = mode.produce ? produce(input) : check(input, mode)
console.log(JSON.stringify(result))
