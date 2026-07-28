#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  slotsForProfile,
} from '../shared/paper-canonical/authority.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import {
  makeListeningInactiveReferenceFixture,
} from '../test-fixtures/paper-canonical/listeningInactiveReferenceFixture.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

assert.match(
  readFileSync(
    new URL(
      '../shared/paper-canonical/listeningInactive.d.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  /export function appendListeningInactiveClosures/,
)

const fixture = makeListeningInactiveReferenceFixture()
const nck1Profile =
  resolveCanonicalAuthority(canonicalAuthorityRef).closure.profiles.get('nck1')
const listeningSlots = slotsForProfile(nck1Profile).filter(
  (slot) => slot.slotId.startsWith('listening.'),
)
assert.deepEqual(
  listeningSlots.map((slot) => ({
    slotId: slot.slotId,
    activation: slot.activation,
    renderPolicy: slot.renderPolicy,
  })),
  [
    {
      slotId: 'listening.short-dialogue',
      activation: 'inactive_source',
      renderPolicy: 'suppress',
    },
    {
      slotId: 'listening.long-form',
      activation: 'inactive_source',
      renderPolicy: 'suppress',
    },
  ],
)
const compiled = compileCanonicalPaper(fixture.request)

assert.equal(compiled.disposition, 'ready')
assert.equal(
  compiled.artifacts.normalizationReport.inactiveSourceClosures.length,
  2,
)
assert.deepEqual(
  compiled.artifacts.normalizationReport.inactiveSourceClosures.map(
    (closure) => closure.slotId,
  ),
  ['listening.short-dialogue', 'listening.long-form'],
)
assert.deepEqual(
  compiled.artifacts.normalizationReport.inactiveSourceClosures.map(
    (closure) => ({
      questionCount: closure.questionCount,
      officialAnswerCount: closure.officialAnswerCount,
      transcriptSegmentCount: closure.transcriptSegmentCount,
      transcriptCoverage: closure.transcriptCoverage,
      timing: closure.timing.disposition,
      audio: closure.audio.disposition,
      status: closure.status,
    }),
  ),
  [
    {
      questionCount: 5,
      officialAnswerCount: 5,
      transcriptSegmentCount: 5,
      transcriptCoverage: 'exactly_once',
      timing: 'supplied',
      audio: 'not_supplied',
      status: 'closed',
    },
    {
      questionCount: 15,
      officialAnswerCount: 15,
      transcriptSegmentCount: 5,
      transcriptCoverage: 'exactly_once',
      timing: 'supplied',
      audio: 'not_supplied',
      status: 'closed',
    },
  ],
)
const inactiveSourceMapEntries =
  compiled.artifacts.normalizationReport.inactiveSourceClosures.flatMap(
    (closure) => closure.sourceMap.entries,
  )
const targetCount = (kind) =>
  inactiveSourceMapEntries.filter((entry) => entry.target.kind === kind).length
assert.equal(targetCount('inactive_question'), 20)
assert.equal(targetCount('inactive_option'), 60)
assert.equal(targetCount('inactive_official_answer'), 20)
assert.equal(targetCount('inactive_transcript_segment'), 10)
assert.equal(targetCount('inactive_timing'), 10)
assert.equal(targetCount('inactive_answer_join'), 20)
assert.equal(targetCount('inactive_transcript_join'), 20)
assert.deepEqual(
  compiled.artifacts.normalizationReport.directSourceMap.slice(
    -inactiveSourceMapEntries.length,
  ),
  inactiveSourceMapEntries,
)
const sourceSpanIds = new Set(
  compiled.artifacts.sourceCapture.sourceSpans.map(
    (span) => span.sourceSpanId,
  ),
)
const transformationRecordIds = new Set(
  compiled.artifacts.normalizationReport.transformationRecords.map(
    (record) => record.recordId,
  ),
)
for (
  const closure
  of compiled.artifacts.normalizationReport.inactiveSourceClosures
) {
  assert.ok(closure.transformationRecordIds.length > 0)
  assert.equal(
    closure.sourceMap.entries.every((entry) =>
      entry.sourceSpanRefs.every((sourceSpanId) =>
        sourceSpanIds.has(sourceSpanId))
      && entry.transformationRecordIds.every((recordId) =>
        transformationRecordIds.has(recordId))),
    true,
  )
}

const listeningGroups =
  compiled.artifacts.canonicalPaper.questionGroups.filter(
    (group) => group.contractRef.familyContractId === 'listening',
  )
assert.deepEqual(listeningGroups, [])

const inactiveBindings =
  compiled.artifacts.canonicalPaper.paperPlan.slotBindings.filter(
    (binding) => binding.state === 'inactive',
  )
assert.equal(inactiveBindings.length, 2)
for (const binding of inactiveBindings) {
  assert.equal(Object.hasOwn(binding, 'groupRef'), false)
  assert.equal(binding.sourceClosureRef.contractId, 'listening-raw-closure')
  assert.equal(binding.sourceClosureRef.contractVersion, 'nck1-v1')
  assert.match(binding.sourceClosureRef.closureDigest, /^sha256:[a-f0-9]{64}$/)
}

const projected = projectCanonicalPaper({
  plan: compiled.artifacts.canonicalPaper.paperPlan,
  groups: compiled.artifacts.canonicalPaper.questionGroups,
  sourceCapture: compiled.artifacts.sourceCapture,
})
assert.equal(
  projected.nodes.some(
    (node) =>
      node.kind === 'group' && node.familyContractId === 'listening',
  ),
  false,
)
const groupRefPoisonedPlan =
  structuredClone(compiled.artifacts.canonicalPaper.paperPlan)
groupRefPoisonedPlan.slotBindings.find(
  (binding) => binding.slotId === 'listening.short-dialogue',
).groupRef = { groupId: 'group:listening:forbidden' }
assert.throws(
  () => projectCanonicalPaper({
    plan: groupRefPoisonedPlan,
    groups: compiled.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compiled.artifacts.sourceCapture,
  }),
  (error) =>
    error.code === 'CANONICAL_PROJECTION_REJECTED'
    && error.message.includes('inactive binding'),
)

function requestWithListeningEvidence(mutator) {
  const request = structuredClone(fixture.request)
  const byInputKey = new Map(
    request.evidence.documents.map((document) => [document.inputKey, document]),
  )
  const values = Object.fromEntries(
    ['listening_questions', 'listening_answers', 'listening_transcript', 'listening_inventory']
      .map((inputKey) => [
        inputKey,
        JSON.parse(
          new TextDecoder().decode(byInputKey.get(inputKey).bytes),
        ),
      ]),
  )
  mutator(values, request)
  for (const inputKey of [
    'listening_questions',
    'listening_answers',
    'listening_transcript',
  ]) {
    const document = byInputKey.get(inputKey)
    if (!request.evidence.documents.includes(document)) continue
    document.bytes = new TextEncoder().encode(JSON.stringify(values[inputKey]))
  }
  const inventory = values.listening_inventory
  inventory.sourceBindings.questions.extractedDocumentDigest = sha256(
    byInputKey.get('listening_questions').bytes,
  )
  inventory.sourceBindings.answers.extractedDocumentDigest = sha256(
    byInputKey.get('listening_answers').bytes,
  )
  inventory.sourceBindings.transcript.extractedDocumentDigest = sha256(
    byInputKey.get('listening_transcript').bytes,
  )
  byInputKey.get('listening_inventory').bytes =
    new TextEncoder().encode(JSON.stringify(inventory))
  return request
}

function assertDisposition(label, expected, mutator) {
  const result = compileCanonicalPaper(
    requestWithListeningEvidence(mutator),
  )
  assert.equal(result.disposition, expected, label)
  assert.equal(
    Object.hasOwn(result.artifacts, 'canonicalPaper'),
    false,
    `${label} must expose no partial canonical package`,
  )
}

assertDisposition(
  'missing one source Option fails incomplete',
  'incomplete_source',
  ({ listening_questions: questions }) => {
    delete questions.section1.questions[0].options.B
  },
)
assertDisposition(
  'complete A-D source shape is unsupported under nck1-v1',
  'unsupported',
  ({ listening_questions: questions }) => {
    for (const question of [
      ...questions.section1.questions,
      ...questions.section2.questions,
    ]) question.options.D = 'Unsupported fourth Option.'
  },
)
assertDisposition(
  'official answer outside the Question Options conflicts',
  'answer_conflict',
  ({ listening_answers: answers }) => {
    answers.answers['1'] = 'D'
  },
)
assertDisposition(
  'competing official-answer documents conflict',
  'answer_conflict',
  (_values, request) => {
    const original = request.evidence.documents.find(
      (document) => document.inputKey === 'listening_answers',
    )
    const conflicting = JSON.parse(
      new TextDecoder().decode(original.bytes),
    )
    conflicting.answers['1'] = conflicting.answers['1'] === 'A' ? 'B' : 'A'
    request.evidence.documents.push({
      ...structuredClone(original),
      inputKey: 'listening_answers_competing',
      bytes: new TextEncoder().encode(JSON.stringify(conflicting)),
    })
  },
)
assertDisposition(
  'a source binding cannot point at a document with the wrong role',
  'incomplete_source',
  ({ listening_inventory: inventory }, request) => {
    const answerDocument = request.evidence.documents.find(
      (document) => document.inputKey === 'listening_answers',
    )
    inventory.sourceBindings.questions.sourceDocumentDigest =
      sha256(answerDocument.bytes)
  },
)
assertDisposition(
  'overlapping short-dialogue transcript joins need review',
  'needs_review',
  ({ listening_inventory: inventory }) => {
    inventory.shortDialogueJoins[1].textId = 'Text 1'
  },
)
assertDisposition(
  'reordered transcript and timing evidence needs review',
  'needs_review',
  ({ listening_transcript: transcript }) => {
    transcript.texts.reverse()
    transcript.timingTable.reverse()
  },
)
assertDisposition(
  'reordered long-form transcript joins need review',
  'needs_review',
  ({ listening_transcript: transcript }) => {
    transcript.texts.find((text) => text.textId === 'Text 6').coversQuestions.reverse()
  },
)
assertDisposition(
  'jointly reordered long-form Questions and transcript joins need review',
  'needs_review',
  ({ listening_questions: questions, listening_transcript: transcript }) => {
    const question6 = questions.section2.questions[0]
    questions.section2.questions[0] = questions.section2.questions[1]
    questions.section2.questions[1] = question6
    transcript.texts.find((text) => text.textId === 'Text 6').coversQuestions.reverse()
  },
)
assertDisposition(
  'a missing supplied timing row fails incomplete',
  'incomplete_source',
  ({ listening_transcript: transcript }) => {
    transcript.timingTable.pop()
  },
)
assertDisposition(
  'referenced-but-absent audio fails incomplete',
  'incomplete_source',
  ({ listening_inventory: inventory }) => {
    inventory.audio = {
      disposition: 'captured_uninterpreted',
      inputKey: 'listening_audio',
      mediaType: 'audio/mpeg',
      sha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    }
  },
)
assertDisposition(
  'an unclosed Question audio reference is unsupported',
  'unsupported',
  ({ listening_questions: questions }) => {
    questions.section1.questions[0].audioRef = 'missing-audio.mp3'
  },
)
assertDisposition(
  'a missing listening source document fails incomplete',
  'incomplete_source',
  (_values, request) => {
    request.evidence.documents = request.evidence.documents.filter(
      (document) => document.inputKey !== 'listening_answers',
    )
  },
)

const noTiming = compileCanonicalPaper(requestWithListeningEvidence(
  ({ listening_transcript: transcript, listening_inventory: inventory }) => {
    delete transcript.timingTable
    for (const text of transcript.texts) delete text.timeRange
    inventory.timing = { disposition: 'not_supplied' }
  },
))
assert.equal(noTiming.disposition, 'ready')
assert.deepEqual(
  noTiming.artifacts.normalizationReport.inactiveSourceClosures.map(
    (closure) => closure.timing,
  ),
  [
    { disposition: 'not_supplied' },
    { disposition: 'not_supplied' },
  ],
)

const sealed = sealCanonicalPublication({
  compilation: compiled,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
})
const reopened = validateCanonicalPublicationBundle({
  manifest: sealed.manifest,
  sourceAsset: sealed.sourceAsset,
  readArtifact: (relativePath) =>
    sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
})
assert.deepEqual(
  reopened.normalizationReport.inactiveSourceClosures,
  compiled.artifacts.normalizationReport.inactiveSourceClosures,
)
assert.equal(
  reopened.groups.some(
    (group) => group.contractRef.familyContractId === 'listening',
  ),
  false,
)

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-listening-publication-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
try {
  assert.equal(
    publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation: compiled,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    }).status,
    'published',
  )
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  for (const consumerContract of [
    consumerContractRefs.screen,
    consumerContractRefs.print_pdf,
    consumerContractRefs.docx,
  ]) {
    const loaded = await loadPaperForConsumption(
      {
        paperId: fixture.paperId,
        consumerContract,
      },
      store,
    )
    assert.equal(loaded.disposition, 'ready')
    assert.equal(
      loaded.selections.some(
        (selection) => selection.familyContractId === 'listening',
      ),
      false,
    )
  }
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log(
  'PASS: paper-2026-i compiles, publishes, reopens, and loads two closed inactive listening slots with zero listening Groups',
)
