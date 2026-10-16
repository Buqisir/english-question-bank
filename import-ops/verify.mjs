#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createImportReviewStore,
  reviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import { preflightPaper } from './lib/probe.mjs'
import {
  evaluateShip,
  writeShippedReceipt,
} from '../scripts/import-pipeline/ship-checklist.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function fixtureProjection(rootDir) {
  const identity = JSON.parse(readFileSync(path.join(rootDir, 'projection.json'), 'utf8'))
  if (identity.externalListening) {
    const audioBytes = new Uint8Array(Buffer.from(identity.externalListening.audioBase64, 'base64'))
    return {
      ...identity,
      sourceProvenance: { kind: 'external_analyzed_package' },
      materialization: {
        listening: {
          state: 'captured',
          transcript: Array.from({ length: 10 }, (_, index) => ({ segmentId: `segment:${index + 1}` })),
          questions: Array.from({ length: 20 }, (_, index) => ({ canonicalNumber: index + 1 })),
          answers: Array.from({ length: 20 }, (_, index) => ({ canonicalNumber: index + 1, value: 'A' })),
        },
      },
      listeningAudioBytes: audioBytes,
      listeningReview: { audio: {
        state: 'included_in_candidate_review',
        playbackAudioSha256: sha256(audioBytes),
        mediaType: 'audio/mpeg',
        durationSeconds: 42.5,
      } },
    }
  }
  return {
    ...identity,
    consumption: {
      visibleStructure: [{
        kind: 'group',
        slotId: 'reading.a',
        groupId: identity.groupId,
        familyContractId: 'reading',
      }],
    },
    sourceVisuals: [{
      visualId: 'visual:reading-a',
      documentId: 'paper',
      path: 'source/questions.pdf',
      sourceDigest: identity.sourceDigest,
      mediaType: 'application/pdf',
      page: 1,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      disposition: 'semantic_table',
      targetId: identity.groupId,
      state: 'paired',
    }],
  }
}

function manifest({
  paperId = 'paper-mock-review-2026-m1',
  candidate = 'a',
  groupId = 'group:reading-a',
  resolvesIssueIds = [],
} = {}) {
  const identity = {
    paperId,
    paperName: '网页审核测试卷',
    sourceDigest: `sha256:${'1'.repeat(64)}`,
    candidateDigest: `sha256:${candidate.repeat(64)}`,
    visibleStructureDigest: `sha256:${(
      candidate === 'a' ? '2' : candidate === 'b' ? '3' : candidate === 'c' ? '4' : '5'
    ).repeat(64)}`,
    analysisDigest: `sha256:${(
      candidate === 'a' ? '6' : candidate === 'b' ? '7' : candidate === 'c' ? '8' : '9'
    ).repeat(64)}`,
    groupId,
  }
  const bytes = Buffer.from(`${JSON.stringify(identity)}\n`)
  const input = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId,
    paperName: identity.paperName,
    sourceDigest: identity.sourceDigest,
    candidateDigest: identity.candidateDigest,
    visibleStructureDigest: identity.visibleStructureDigest,
    analysisDigest: identity.analysisDigest,
    producerBuildId: `producer-${candidate}`,
    files: [{
      path: 'projection.json',
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      mediaType: 'application/json',
      role: 'materialization',
    }],
    resolvesIssueIds,
  }
  return { bytes, input: { ...input, bundleDigest: reviewBundleDigest(input) } }
}

function externalListeningManifest() {
  const paperId = 'paper-mock-external-listening'
  const audioBytes = Buffer.from('measured external mp3 fixture bytes')
  const identity = {
    paperId,
    paperName: '外部听力审核测试卷',
    sourceDigest: `sha256:${'a'.repeat(64)}`,
    candidateDigest: `sha256:${'b'.repeat(64)}`,
    visibleStructureDigest: `sha256:${'c'.repeat(64)}`,
    analysisDigest: `sha256:${'d'.repeat(64)}`,
    externalListening: { audioBase64: audioBytes.toString('base64') },
  }
  const bytes = Buffer.from(`${JSON.stringify(identity)}\n`)
  const input = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId,
    paperName: identity.paperName,
    sourceDigest: identity.sourceDigest,
    candidateDigest: identity.candidateDigest,
    visibleStructureDigest: identity.visibleStructureDigest,
    analysisDigest: identity.analysisDigest,
    producerBuildId: 'producer-external-listening',
    files: [{
      path: 'projection.json',
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      mediaType: 'application/json',
      role: 'materialization',
    }],
  }
  return { bytes, audioDigest: sha256(audioBytes), input: { ...input, bundleDigest: reviewBundleDigest(input) } }
}

function upload(store, created, bytes) {
  const target = store.fileForUpload(created.revision.id, 'projection.json')
  writeFileSync(target.destination, bytes)
  store.completeFileUpload(created.revision.id, 'projection.json', {
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  })
}

function makeStore(root) {
  return createImportReviewStore({
    dbPath: path.join(root, 'review.sqlite'),
    filesRoot: path.join(root, 'files'),
    rendererBuildId: 'renderer-test',
    projectRevision: fixtureProjection,
  })
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-import-review-'))
try {
  const store = makeStore(tempRoot)
  const first = manifest()
  const traversal = structuredClone(first.input)
  traversal.files[0].path = '../projection.json'
  assert.throws(
    () => store.createRevision(traversal),
    (error) => error.code === 'IMPORT_REVIEW_PATH_INVALID',
    'manifest path traversal fails closed',
  )

  const createdFirst = store.createRevision(first.input)
  assert.equal(createdFirst.created, true)
  assert.deepEqual(createdFirst.missingFiles, ['projection.json'])
  assert.throws(
    () => store.finalizeRevision(createdFirst.revision.id),
    (error) => error.code === 'IMPORT_REVIEW_UPLOAD_INCOMPLETE',
    'incomplete upload cannot finalize',
  )
  const idempotent = store.createRevision(first.input)
  assert.equal(idempotent.created, false)
  assert.equal(idempotent.revision.id, createdFirst.revision.id)

  const firstTarget = store.fileForUpload(createdFirst.revision.id, 'projection.json')
  writeFileSync(firstTarget.destination, first.bytes)
  assert.throws(
    () => store.completeFileUpload(createdFirst.revision.id, 'projection.json', {
      sha256: `sha256:${'f'.repeat(64)}`,
      byteLength: first.bytes.byteLength,
    }),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'wrong upload digest is rejected',
  )
  store.completeFileUpload(createdFirst.revision.id, 'projection.json', {
    sha256: sha256(first.bytes),
    byteLength: first.bytes.byteLength,
  })
  const finalizedFirst = store.finalizeRevision(createdFirst.revision.id)
  assert.equal(finalizedFirst.state, 'awaiting_review')
  assert.equal(finalizedFirst.rendererBuildId, 'renderer-test')
  assert.throws(
    () => store.fileForUpload(createdFirst.revision.id, 'projection.json'),
    (error) => error.code === 'IMPORT_REVIEW_REVISION_IMMUTABLE',
    'finalized revision is immutable',
  )
  const firstDetail = store.paperDetail(first.input.paperId)
  assert.equal(firstDetail.visibleStructure[0].groupId, 'group:reading-a')
  assert.equal(firstDetail.sourceVisuals[0].targetId, 'group:reading-a')
  assert.equal(
    store.agentPaperStatus(first.input.paperId).sourceVisuals[0].visualId,
    'visual:reading-a',
  )

  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedFirst.id,
      surface: 'screen',
      message: '没有定位',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_TARGET_REQUIRED',
    'an issue requires a semantic target or page',
  )
  let detail = store.createIssue(first.input.paperId, {
    revisionId: finalizedFirst.id,
    surface: 'pdf',
    edition: 'friendly8',
    groupId: 'group:reading-a',
    pageNumber: 1,
    rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    message: '第 1 段漏了一句',
  }, 'owner')
  const issueId = detail.issues[0].id
  assert.equal(detail.issues[0].edition, 'friendly8')
  assert.deepEqual(detail.issues[0].rect, {
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
  })
  assert.equal(detail.latest.state, 'changes_requested')
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedFirst.id,
      { bundleDigest: finalizedFirst.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_ISSUES_UNRESOLVED',
    'open issues block approval',
  )
  detail = store.addIssueMessage(
    first.input.paperId,
    issueId,
    { message: '我会按原文补回。' },
    'import-agent',
    'agent',
  )
  assert.equal(detail.issueMessages[0].authorKind, 'agent')

  const second = manifest({ candidate: 'b', resolvesIssueIds: [issueId] })
  const createdSecond = store.createRevision(second.input)
  upload(store, createdSecond, second.bytes)
  const finalizedSecond = store.finalizeRevision(createdSecond.revision.id)
  detail = store.paperDetail(first.input.paperId)
  assert.equal(detail.revisions.find((revision) => revision.id === finalizedFirst.id).state, 'superseded')
  assert.equal(detail.issues[0].state, 'fixed_pending_review')
  assert.equal(detail.issues[0].resolutionRevisionId, finalizedSecond.id)
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedSecond.id,
      { bundleDigest: finalizedSecond.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_ISSUES_UNRESOLVED',
    'Agent-marked fixes still require Owner verification',
  )
  store.updateIssue(first.input.paperId, issueId, { action: 'close' })
  assert.throws(
    () => store.approveRevision(
      first.input.paperId,
      finalizedSecond.id,
      { bundleDigest: first.input.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_STALE_REVISION',
    'approval must carry the browser-visible current digest',
  )
  const approval = store.approveRevision(
    first.input.paperId,
    finalizedSecond.id,
    { bundleDigest: finalizedSecond.bundleDigest },
    'owner',
  )
  assert.equal(approval.candidateDigest, second.input.candidateDigest)
  assert.equal(store.agentPaperStatus(first.input.paperId).approval.approvalId, approval.approvalId)

  detail = store.createIssue(first.input.paperId, {
    revisionId: finalizedSecond.id,
    surface: 'teacher_print',
    pageNumber: 2,
    message: '教师版页尾需要再核对',
  }, 'owner')
  const secondIssueId = detail.issues.find((issue) => issue.id !== issueId).id
  assert.equal(detail.latest.approval, null, 'a new issue invalidates approval')
  store.updateIssue(first.input.paperId, secondIssueId, { action: 'dismiss' })
  const renewed = store.approveRevision(
    first.input.paperId,
    finalizedSecond.id,
    { bundleDigest: finalizedSecond.bundleDigest },
    'owner',
  )
  assert.notEqual(renewed.approvalId, approval.approvalId)

  const third = manifest({ candidate: 'c', groupId: 'group:reading-b' })
  const shippingGuard = store.acquireShippingGuard(
    first.input.paperId,
    renewed,
    'import-agent-token',
  )
  assert.equal(shippingGuard.revisionId, finalizedSecond.id)
  assert.throws(
    () => store.createRevision(third.input),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks a new revision after the deployment check',
  )
  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedSecond.id,
      surface: 'screen',
      questionId: 'question:22',
      message: '上线锁持有期间不能撤销认可',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks issue creation that would revoke approval',
  )
  assert.throws(
    () => store.updateIssue(first.input.paperId, secondIssueId, { action: 'reopen' }),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'a shipping guard blocks issue-state changes that would revoke approval',
  )
  assert.throws(
    () => store.releaseShippingGuard(
      first.input.paperId,
      shippingGuard.id,
      'another-agent',
    ),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_GUARD_MISMATCH',
    'only the acquiring Agent can release a shipping guard',
  )
  assert.deepEqual(
    store.releaseShippingGuard(first.input.paperId, shippingGuard.id, 'import-agent-token'),
    { released: true },
  )
  const createdThird = store.createRevision(third.input)
  upload(store, createdThird, third.bytes)
  store.finalizeRevision(createdThird.revision.id)
  assert.equal(store.agentPaperStatus(first.input.paperId).approval, null)
  assert.equal(store.paperDetail(first.input.paperId).latest.id, createdThird.revision.id)
  assert.throws(
    () => store.createIssue(first.input.paperId, {
      revisionId: finalizedSecond.id,
      surface: 'screen',
      questionId: 'question:21',
      message: '不能补记到旧 revision',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_STALE_REVISION',
    'issue creation rechecks the latest revision inside its write transaction',
  )

  const concurrentPaperId = 'paper-mock-review-concurrent'
  const slowerEarlier = manifest({ paperId: concurrentPaperId, candidate: 'b' })
  const fasterLater = manifest({ paperId: concurrentPaperId, candidate: 'c' })
  const createdEarlier = store.createRevision(slowerEarlier.input)
  const createdLater = store.createRevision(fasterLater.input)
  upload(store, createdEarlier, slowerEarlier.bytes)
  upload(store, createdLater, fasterLater.bytes)
  const finalizedLater = store.finalizeRevision(createdLater.revision.id)
  const finalizedEarlier = store.finalizeRevision(createdEarlier.revision.id)
  assert.equal(finalizedLater.revisionNumber, 2)
  assert.equal(finalizedEarlier.state, 'superseded')
  assert.equal(
    store.paperDetail(concurrentPaperId).latest.id,
    finalizedLater.id,
    'an earlier upload finalized late cannot replace a higher finalized revision',
  )

  const tampered = manifest({ candidate: 'd', groupId: 'group:reading-c' })
  const createdTampered = store.createRevision(tampered.input)
  upload(store, createdTampered, tampered.bytes)
  writeFileSync(
    path.join(store.revisionDirectory(createdTampered.revision.id), 'projection.json'),
    Buffer.from('tampered'),
  )
  assert.throws(
    () => store.finalizeRevision(createdTampered.revision.id),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'finalize rechecks bytes after the upload handshake',
  )

  writeFileSync(
    path.join(store.revisionDirectory(finalizedFirst.id), 'projection.json'),
    Buffer.from('tampered after finalize'),
  )
  assert.throws(
    () => store.projectionForRevision(finalizedFirst.id),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'every preview read rechecks immutable file bytes even when projection is cached',
  )

  let activeRendererBuildId = 'renderer-test'
  const dynamicRendererStore = createImportReviewStore({
    dbPath: path.join(tempRoot, 'review.sqlite'),
    filesRoot: path.join(tempRoot, 'files'),
    rendererBuildId: () => activeRendererBuildId,
    projectRevision: fixtureProjection,
  })
  dynamicRendererStore.approveRevision(
    first.input.paperId,
    createdThird.revision.id,
    { bundleDigest: third.input.bundleDigest },
    'owner',
  )
  activeRendererBuildId = 'renderer-test-2'
  const rendererStaleStatus = dynamicRendererStore.agentPaperStatus(first.input.paperId)
  assert.equal(rendererStaleStatus.rendererStale, true)
  assert.equal(rendererStaleStatus.approval, null, 'renderer changes invalidate current Agent acceptance')
  assert.throws(
    () => dynamicRendererStore.approveRevision(
      first.input.paperId,
      createdThird.revision.id,
      { bundleDigest: third.input.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_RENDERER_STALE',
    'a renderer deployment invalidates approval of an older review revision',
  )
  const refreshedForRenderer = dynamicRendererStore.createRevision(third.input)
  assert.equal(
    refreshedForRenderer.created,
    true,
    'the same content bundle can become a fresh revision after the renderer changes',
  )

  const external = externalListeningManifest()
  const externalStore = makeStore(tempRoot)
  const createdExternal = externalStore.createRevision(external.input)
  upload(externalStore, createdExternal, external.bytes)
  const finalizedExternal = externalStore.finalizeRevision(createdExternal.revision.id)
  const listeningConfirmation = {
    audioSha256: external.audioDigest,
    playbackMatchesSuppliedTranscript: true,
    allSegmentsQuestionsAnswersBelongTogether: true,
    actualAudioContentSuitableAndSafe: true,
  }
  assert.throws(() => externalStore.approveRevision(
    external.input.paperId,
    finalizedExternal.id,
    {
      bundleDigest: finalizedExternal.bundleDigest,
      externalListeningReview: {
        ...listeningConfirmation,
        actualAudioContentSuitableAndSafe: false,
      },
    },
    'owner',
  ), (error) => error.code === 'IMPORT_REVIEW_EXTERNAL_LISTENING_NOT_APPLICABLE',
  'ordinary approval must not accept obsolete playback attestations')
  assert.throws(() => externalStore.approveRevision(
    external.input.paperId,
    finalizedExternal.id,
    {
      bundleDigest: finalizedExternal.bundleDigest,
      externalListeningReview: { ...listeningConfirmation, audioSha256: `sha256:${'f'.repeat(64)}` },
    },
    'owner',
  ), (error) => error.code === 'IMPORT_REVIEW_EXTERNAL_LISTENING_NOT_APPLICABLE',
  'browser cannot supply an audio identity in place of verified Candidate bytes')
  const externalApproval = externalStore.approveRevision(
    external.input.paperId,
    finalizedExternal.id,
    {
      bundleDigest: finalizedExternal.bundleDigest,
    },
    'owner',
  )
  assert.deepEqual(externalApproval.externalListeningReview.scope, {
    transcriptSegmentCount: 10,
    questionCount: 20,
    answerCount: 20,
  })
  assert.equal(Object.hasOwn(externalApproval.externalListeningReview, 'engine'), false)
  assert.equal(externalApproval.externalListeningReview.schemaVersion, 'external-listening-owner-review-v2')
  assert.equal(Object.hasOwn(externalApproval.externalListeningReview, 'playbackMatchesSuppliedTranscript'), false)
  assert.equal(Object.hasOwn(externalApproval.externalListeningReview, 'comparison'), false)
  const restartedExternalStore = makeStore(tempRoot)
  assert.doesNotThrow(() => restartedExternalStore.mintExternalListeningPublicationProof(
    external.input.paperId,
    externalApproval,
  ), 'restart readback revalidates stored revision, approval, renderer, and audio before minting')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const html = readFileSync(path.join(repoRoot, 'import-ops/public/index.html'), 'utf8')
const client = readFileSync(path.join(repoRoot, 'import-ops/public/app.js'), 'utf8')
const screen = readFileSync(
  path.join(repoRoot, 'app/src/features/paper-browse/PaperBrowsePage.tsx'),
  'utf8',
)
const importSkill = readFileSync(
  path.join(repoRoot, '.agents/skills/importing-nck1-papers/SKILL.md'),
  'utf8',
)
const reviewCli = readFileSync(
  path.join(repoRoot, 'scripts/import-pipeline/review.mjs'),
  'utf8',
)
const reviewRoutes = readFileSync(
  path.join(repoRoot, 'server/import-review/importReviewRoutes.mjs'),
  'utf8',
)
assert.match(html, /<body>\s*<!--[\s\S]*THESIS:/, 'direction contract is the first body child')
assert.match(client, /accountKind === 'import_agent'/, 'real import_agent account gets its own inbox mode')
// The compact Owner list and its exact links are exercised through the browser
// in verify-import-pagination-ui; legacy Agent workbench source is not evidence
// of the Owner's current interface.
assert.match(reviewRoutes, /\/approve[\s\S]{0,500}requireOwner\(response, context\)/,
  'the approval route rejects import_agent authority before store approval')
assert.match(screen, /import-review-preview\/revisions/, 'PaperBrowsePage switches only its review data source')
assert.match(
  importSkill,
  /^name: importing-nck1-papers$/m,
  'project skill name matches its directory',
)
assert.match(
  importSkill,
  /^description: .*导题.*继续某套卷.*审核反馈.*上线某卷/m,
  'skill description carries automatic discovery terms for import/resume/review/publication',
)
assert.match(
  importSkill,
  /review\.mjs preflight <paperId>/,
  'skill starts every resumed import from machine-readable preflight',
)
for (const state of [
  'materializing',
  'awaiting_review',
  'changes_requested',
  'approved',
  'failed',
]) assert.match(importSkill, new RegExp(`\\| \`${state}\``), `skill handles ${state}`)
for (const state of ['publishing', 'failed', 'published']) {
  assert.match(
    importSkill,
    new RegExp('\\| promotion `' + state + '`'),
    `skill handles promotion ${state}`,
  )
}
assert.match(
  importSkill,
  /source-intake\.mjs[\s\S]*AMP_THREAD_ID/,
  'skill starts source-ledger work in the bound Amp thread',
)
assert.match(
  importSkill,
  /use `executor: runner`[\s\S]*omit `project` and `orb_size`/,
  'skill routes independent import workers to the local runner without an Import Orb default',
)
assert.match(
  importSkill,
  /Never fall back to Orb[\s\S]*availableParallelism/,
  'skill fails closed when local execution is unavailable and verifies actual CPU capacity',
)
assert.match(
  importSkill,
  /bounded parallelism[\s\S]*remain serial under the one paper writer/,
  'skill limits parallel work without weakening the single-writer state machine',
)
assert.match(
  importSkill,
  /Never overwrite a finalized revision/,
  'skill requires corrective work to create a new immutable revision',
)
assert.match(
  importSkill,
  /Only when the Owner's current\s+message explicitly says `上线 <paperId>`/,
  'skill cannot infer production authorization from approval or an old message',
)
assert.match(
  importSkill,
  /never install it as the routine Project Orb secret/,
  'skill keeps the shipping credential out of routine import workers',
)
assert.match(
  importSkill,
  /Never run Review-backed local `accept` \/ `publish` as a production step/,
  'skill retires local publication for Review-backed papers',
)
assert.match(
  reviewCli,
  /command === 'preflight'/,
  'review CLI exposes the preflight command used by the skill',
)

const shipRoot = mkdtempSync(path.join(tmpdir(), 'eqb-web-review-ship-'))
let shipDb = null
try {
  const paperId = 'paper-mock-web-review-ship'
  const paperDir = path.join(shipRoot, 'scripts/import-pipeline/papers', paperId)
  const evidenceDir = path.join(paperDir, 'canonical-evidence')
  const materializationDir = path.join(paperDir, 'materialization')
  const sourceDir = path.join(paperDir, 'source')
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(evidenceDir, { recursive: true })
  mkdirSync(materializationDir, { recursive: true })
  mkdirSync(sourceDir, { recursive: true })
  mkdirSync(signalsDir, { recursive: true })
  mkdirSync(path.join(shipRoot, 'app/public/paper-assets', paperId, 'latest'), { recursive: true })
  const sourceDigest = `sha256:${'4'.repeat(64)}`
  const candidateDigest = `sha256:${'5'.repeat(64)}`
  const visibleStructureDigest = `sha256:${'8'.repeat(64)}`
  const analysisDigest = `sha256:${'7'.repeat(64)}`
  const bundleDigest = `sha256:${'6'.repeat(64)}`
  const approvalId = 'approval-mock-current'
  const revisionId = 'rev-mock-current'
  writeFileSync(path.join(sourceDir, 'question-source-1.pdf'), 'question source')
  writeFileSync(path.join(sourceDir, 'official-answers-1.pdf'), 'official answers')
  writeFileSync(path.join(paperDir, 'universal-source-manifest.json'), JSON.stringify({
    documents: [
      { path: 'source/question-source-1.pdf' },
      { path: 'source/official-answers-1.pdf' },
    ],
  }))
  writeFileSync(
    path.join(materializationDir, 'nck1-source-materialization-v1.json'),
    JSON.stringify({ schemaVersion: 'nck1-source-materialization-v1' }),
  )
  writeFileSync(path.join(paperDir, 'config.json'), JSON.stringify({
    paperId,
    format: 'universal-nck1',
    provenance: { paperName: '待上线审核卷' },
  }))
  writeFileSync(path.join(signalsDir, 'ai-answer-check.json'), JSON.stringify({ ok: true }))
  writeFileSync(path.join(evidenceDir, 'candidate-summary.json'), JSON.stringify({
    paperId,
    sourceDigest,
    candidateDigest,
  }))
  writeFileSync(path.join(evidenceDir, 'teacher-confirmation-v1.json'), JSON.stringify({
    schemaVersion: 'teacher-confirmation-v1',
    sourceDigest,
    candidateDigest,
    confirmed: true,
  }))
  const webApproval = {
    schemaVersion: 'web-import-review-approval-v1',
    approvalId,
    paperId,
    revisionId,
    sourceDigest,
    candidateDigest,
    visibleStructureDigest,
    analysisDigest,
    bundleDigest,
  }
  const qaReceipt = {
    schemaVersion: 'web-import-review-qa-accepted-v1',
    approvalId,
    revisionId,
    sourceDigest,
    candidateDigest,
    visibleStructureDigest,
    analysisDigest,
    bundleDigest,
  }
  const localPublication = {
    schemaVersion: 'universal-nck1-local-publication-v1',
    publishedAt: '2026-08-28T00:00:00.000Z',
    approvalId,
    revisionId,
    sourceDigest,
    candidateDigest,
    visibleStructureDigest,
    analysisDigest,
    bundleDigest,
    assetVersion: 1,
    versionName: 'v1',
    canonicalPublicationDigest: `sha256:${'9'.repeat(64)}`,
  }
  const dbPath = path.join(shipRoot, 'data/question-bank.sqlite')
  mkdirSync(path.dirname(dbPath), { recursive: true })
  shipDb = new DatabaseSync(dbPath)
  shipDb.exec(`
    CREATE TABLE paper_asset_versions (
      paper_id TEXT NOT NULL,
      asset_version INTEGER NOT NULL,
      version_name TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE canonical_paper_publications (
      paper_id TEXT NOT NULL,
      version_name TEXT NOT NULL,
      source_asset_version INTEGER NOT NULL,
      publication_digest TEXT NOT NULL,
      is_current INTEGER NOT NULL
    );
  `)
  shipDb.prepare(
    `
    INSERT INTO paper_asset_versions (paper_id, asset_version, version_name, status)
    VALUES (?, ?, ?, 'published')
    `,
  ).run(paperId, localPublication.assetVersion, localPublication.versionName)
  shipDb.prepare(
    `
    INSERT INTO canonical_paper_publications
      (paper_id, version_name, source_asset_version, publication_digest, is_current)
    VALUES (?, ?, ?, ?, 1)
    `,
  ).run(
    paperId,
    localPublication.versionName,
    localPublication.assetVersion,
    localPublication.canonicalPublicationDigest,
  )
  const webReviewStatus = {
    paperId,
    latestRevisionId: revisionId,
    latest: { id: revisionId, state: 'approved', bundleDigest },
    approval: webApproval,
  }
  const materializing = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: null,
    reviewChecked: true,
  })
  assert.equal(materializing.state, 'materializing')
  assert.equal(materializing.next.action, 'push_revision')
  assert.equal(materializing.local.source, true, 'universal manifest documents count as source')
  assert.equal(materializing.local.materialization, true)
  assert.equal(materializing.production.pushAllowed, false)

  rmSync(path.join(materializationDir, 'nck1-source-materialization-v1.json'))
  const missingMaterialization = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(missingMaterialization.state, 'failed')
  assert(missingMaterialization.blockers.some(
    (item) => item.code === 'local_materialization_missing',
  ))
  writeFileSync(
    path.join(materializationDir, 'nck1-source-materialization-v1.json'),
    JSON.stringify({ schemaVersion: 'nck1-source-materialization-v1' }),
  )

  const reviewAccessMissing = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: null,
    reviewChecked: false,
  })
  assert.equal(reviewAccessMissing.state, 'failed')
  assert(reviewAccessMissing.blockers.some((item) => item.code === 'review_access_required'))
  assert.equal(reviewAccessMissing.next.command, null)

  const awaitingReviewStatus = {
    ...webReviewStatus,
    latest: { ...webReviewStatus.latest, state: 'awaiting_review' },
    approval: null,
  }
  const awaitingReview = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: awaitingReviewStatus,
    reviewChecked: true,
  })
  assert.equal(awaitingReview.state, 'awaiting_review')
  assert.equal(awaitingReview.next.action, 'wait_for_owner_review')

  const changesRequested = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: {
      ...awaitingReviewStatus,
      latest: { ...awaitingReviewStatus.latest, state: 'changes_requested' },
      unresolvedCount: 1,
    },
    reviewChecked: true,
  })
  assert.equal(changesRequested.state, 'changes_requested')
  assert.equal(changesRequested.next.action, 'revise_and_resubmit')

  const rendererStale = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: { ...webReviewStatus, approval: null, rendererStale: true },
    reviewChecked: true,
  })
  assert.equal(rendererStale.state, 'changes_requested')
  assert.equal(rendererStale.next.action, 'resubmit_for_current_renderer')

  const approvedBeforeAccept = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(approvedBeforeAccept.state, 'approved')
  assert.equal(approvedBeforeAccept.next.action, 'accept_approval')

  const ocrConfirmed = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: {
      ...webReviewStatus,
      latest: { ...webReviewStatus.latest, reviewKind: 'ocr' },
      approval: null,
    },
    reviewChecked: true,
  })
  assert.equal(ocrConfirmed.state, 'materializing', 'OCR confirmation is not Candidate approval')
  assert.equal(ocrConfirmed.next.action, 'push_revision')
  assert.equal(ocrConfirmed.review.latestReviewKind, 'ocr')

  writeFileSync(
    path.join(evidenceDir, 'web-review-approval-v1.json'),
    JSON.stringify(webApproval),
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify(qaReceipt))
  const approvedAfterAccept = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(approvedAfterAccept.state, 'approved')
  assert.equal(approvedAfterAccept.next.action, 'publish_local')
  const approvedOnly = evaluateShip({
    repoRoot: shipRoot,
    paperId,
    ownerSaid: 'ship',
    webReviewStatus,
  })
  assert.equal(approvedOnly.paper.status, 'approved')
  assert.equal(
    approvedOnly.code,
    'not_ready_to_ship',
    'web approval without a local publication receipt cannot ship',
  )
  writeFileSync(
    path.join(signalsDir, 'locally-published.json'),
    JSON.stringify(localPublication),
  )
  const locallyPublished = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(locallyPublished.state, 'locally_published')
  assert.equal(locallyPublished.next.action, 'inspect_local_publication')
  writeFileSync(
    path.join(
      shipRoot,
      'app/public/paper-assets',
      paperId,
      'latest',
      'paper-asset.json',
    ),
    JSON.stringify({ paper: { paperId, assetVersion: 1 } }),
  )
  const readyToShip = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(readyToShip.state, 'ready_to_ship')
  assert.equal(readyToShip.next.action, 'stop_ready_to_ship')
  assert.equal(readyToShip.next.command, null)
  assert.equal(readyToShip.production.pushAllowed, false)
  assert.equal(readyToShip.receipts.publicationCommitted, true)

  shipDb.prepare(
    'UPDATE paper_asset_versions SET status = ? WHERE paper_id = ? AND asset_version = ?',
  ).run('failed', paperId, localPublication.assetVersion)
  const unpublishedAsset = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(unpublishedAsset.state, 'locally_published')
  assert(unpublishedAsset.blockers.some(
    (item) => item.code === 'publication_asset_not_published',
  ))
  assert.equal(
    evaluateShip({ repoRoot: shipRoot, paperId, ownerSaid: 'ship', webReviewStatus }).ok,
    false,
    'an unpublished database asset cannot ship',
  )
  shipDb.prepare(
    'UPDATE paper_asset_versions SET status = ? WHERE paper_id = ? AND asset_version = ?',
  ).run('published', paperId, localPublication.assetVersion)

  shipDb.prepare(
    'UPDATE canonical_paper_publications SET publication_digest = ? WHERE paper_id = ?',
  ).run(`sha256:${'0'.repeat(64)}`, paperId)
  const staleCanonicalPublication = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(staleCanonicalPublication.state, 'locally_published')
  assert(staleCanonicalPublication.blockers.some(
    (item) => item.code === 'canonical_publication_not_current',
  ))
  shipDb.prepare(
    'UPDATE canonical_paper_publications SET publication_digest = ? WHERE paper_id = ?',
  ).run(localPublication.canonicalPublicationDigest, paperId)

  assert.equal(
    evaluateShip({ repoRoot: shipRoot, paperId, ownerSaid: 'ship', webReviewStatus }).ok,
    true,
    'exact current universal web review receipt permits the existing verbal ship checklist',
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify({
    ...qaReceipt,
    candidateDigest: `sha256:${'7'.repeat(64)}`,
  }))
  assert.equal(
    evaluateShip({ repoRoot: shipRoot, paperId, ownerSaid: 'ship', webReviewStatus }).code,
    'review_receipt_stale',
    'ship checklist rejects a stale universal review receipt',
  )
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify(qaReceipt))
  const staleLocalApproval = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: {
      ...awaitingReviewStatus,
      latestRevisionId: 'rev-mock-newer',
      latest: { id: 'rev-mock-newer', state: 'awaiting_review', bundleDigest },
    },
    reviewChecked: true,
  })
  assert.equal(staleLocalApproval.state, 'awaiting_review')
  assert.equal(staleLocalApproval.next.action, 'wait_for_owner_review')
  assert(staleLocalApproval.blockers.some((item) => item.code === 'stale_qa_receipt_ignored'))
  assert.notEqual(staleLocalApproval.next.action, 'publish_local')

  assert.equal(
    evaluateShip({
      repoRoot: shipRoot,
      paperId,
      ownerSaid: 'ship',
      webReviewStatus: {
        paperId,
        latestRevisionId: 'rev-mock-newer',
        latest: { id: 'rev-mock-newer', state: 'awaiting_review', bundleDigest },
        approval: null,
      },
    }).code,
    'review_receipt_stale',
    'a newer Review service revision invalidates a retained local QA receipt',
  )

  writeFileSync(path.join(signalsDir, 'shipped.json'), JSON.stringify({}))
  const emptyShippedReceipt = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(emptyShippedReceipt.state, 'failed')
  assert(emptyShippedReceipt.blockers.some(
    (item) => item.code === 'shipped_receipt_invalid',
  ))
  writeFileSync(path.join(signalsDir, 'shipped.json'), JSON.stringify({
    schemaVersion: 'nck1-import-shipped-v1',
    paperId,
    shippedAt: 'not-a-time',
    command: 'node scripts/pull-run-push.mjs push wrong-paper --owner-said-ship',
  }))
  const malformedShippedReceipt = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(malformedShippedReceipt.state, 'failed')
  assert(malformedShippedReceipt.blockers.some(
    (item) => item.code === 'shipped_receipt_invalid',
  ))

  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify({
    schemaVersion: 'web-import-review-qa-accepted-v1',
  }))
  writeFileSync(path.join(signalsDir, 'locally-published.json'), JSON.stringify({
    schemaVersion: 'universal-nck1-local-publication-v1',
    assetVersion: localPublication.assetVersion,
    versionName: localPublication.versionName,
    canonicalPublicationDigest: localPublication.canonicalPublicationDigest,
  }))
  writeFileSync(path.join(signalsDir, 'shipped.json'), JSON.stringify({
    schemaVersion: 'nck1-import-shipped-v1',
    paperId,
    shippedAt: '2026-08-28T00:00:00.000Z',
    command: `node scripts/pull-run-push.mjs push ${paperId} --owner-said-ship`,
    assetVersion: localPublication.assetVersion,
    versionName: localPublication.versionName,
    canonicalPublicationDigest: localPublication.canonicalPublicationDigest,
  }))
  const missingShippedBinding = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(missingShippedBinding.state, 'failed')
  assert(missingShippedBinding.blockers.some(
    (item) => item.code === 'shipped_receipt_invalid',
  ))
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), JSON.stringify(qaReceipt))
  writeFileSync(
    path.join(signalsDir, 'locally-published.json'),
    JSON.stringify(localPublication),
  )
  rmSync(path.join(signalsDir, 'shipped.json'))

  const writtenShippedReceipt = writeShippedReceipt({
    repoRoot: shipRoot,
    paperId,
    shippedAt: '2026-08-28T00:00:00.000Z',
  })
  assert.equal(writtenShippedReceipt.ok, true)
  const shippedReceipt = JSON.parse(readFileSync(
    path.join(signalsDir, 'shipped.json'),
    'utf8',
  ))
  assert.equal(shippedReceipt.schemaVersion, 'nck1-import-shipped-v1')
  assert.equal(shippedReceipt.paperId, paperId)
  assert.equal(shippedReceipt.revisionId, revisionId)
  assert.equal(
    shippedReceipt.canonicalPublicationDigest,
    localPublication.canonicalPublicationDigest,
  )
  const shipped = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(shipped.state, 'shipped')
  assert.equal(shipped.next.action, 'done')

  const supersededShipped = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: {
      ...awaitingReviewStatus,
      latestRevisionId: 'rev-after-ship',
      latest: { id: 'rev-after-ship', state: 'awaiting_review', bundleDigest },
    },
    reviewChecked: true,
  })
  assert.equal(supersededShipped.state, 'awaiting_review')
  assert(supersededShipped.blockers.some(
    (item) => item.code === 'stale_shipped_receipt_ignored',
  ))
  rmSync(path.join(signalsDir, 'shipped.json'))

  writeFileSync(path.join(signalsDir, 'blocked.json'), JSON.stringify({
    code: 'gate_failed',
    note: 'fixture blocker',
  }))
  const failed = preflightPaper({
    repoRoot: shipRoot,
    paperId,
    reviewStatus: webReviewStatus,
    reviewChecked: true,
  })
  assert.equal(failed.state, 'failed')
  assert.equal(failed.next.action, 'resolve_blocker')
  assert.equal(failed.next.command, null)
} finally {
  shipDb?.close()
  rmSync(shipRoot, { recursive: true, force: true })
}

console.log('PASS import review immutable revisions, issue workflow, account UI, and digest-bound ship gate')
