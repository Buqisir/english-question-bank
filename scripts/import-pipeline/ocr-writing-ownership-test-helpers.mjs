import assert from 'node:assert/strict'
import { buildSourceReferences as produce } from './ocr-proofread.mjs'
import { sourceReferenceEssayTaskStates } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import { SOURCE_REFERENCE_ANSWER_ROLES } from '../../server/paper-import/sourceReferenceWritingRules.mjs'

export const writingOwnershipChecks = { fixtures: 0, essayItems: 0 }

// Observe actual paragraph assembly, independently of the planner's proposed
// actions. Compare the full body-item set as well as each task assignment.
export function checkedSourceReferences(materialization, evidence, confirmation, options = {}) {
  let states
  const actual = new Map()
  const admission = () => states ??= sourceReferenceEssayTaskStates(confirmation,
    new Set(materialization.documents.filter(document =>
      SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role)).map(document => document.documentId)),
    materialization, evidence, options)
  const result = produce(materialization, evidence, confirmation, {
    ...options,
    onWritingCapture(item) {
      if (item.kind === 'essays') {
        const state = admission().get(item.itemId)
        assert.equal(state?.capturing, true, `admission excluded captured essay item ${item.itemId}`)
        assert.equal(state?.task, item.task, `essay task mismatch at ${item.itemId}`)
        actual.set(item.itemId, item.task)
      }
      options.onWritingCapture?.(item)
    },
  })
  const expected = new Map([...admission()].filter(([, state]) =>
    state.capturing && state.action === 'body').map(([itemId, state]) => [itemId, state.task]))
  assert.deepEqual([...actual].sort(), [...expected].sort(), 'admission essay body ownership differs from actual producer capture')
  writingOwnershipChecks.fixtures++
  writingOwnershipChecks.essayItems += actual.size
  return result
}

export function checkWritingRoleFixture(texts, sourceLine = {}) {
  const lines = ['第一节 应用文', '参考范文', 'An official application sample.',
    '第二节 读后续写', '参考范文', 'An official continuation sample.', ...texts,
    '参考范文', 'A sample after the role fixture.']
  const observations = lines.map((text, index) => ({ observationId: `o${index}`,
    region: { x: .1, y: .15 + index * .025, width: .8, height: .02 } }))
  const target = 6
  const boxes = sourceLine.boxes?.length ? sourceLine.boxes
    : sourceLine.region ? [{ region: sourceLine.region }] : null
  if (boxes && texts.length === 1) {
    observations.splice(target, 1, ...boxes.map((box, index) => ({ ...box, observationId: `fixture-${index}` })))
  }
  const materialization = {
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: 'role-fixture' }],
    groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
  }
  const evidence = { documents: [{ documentId: 'answers', pages: [{ observations }] }] }
  const confirmation = { documents: [{ documentId: 'answers', pages: [{ page: 1, visualClassifications: [],
    orderedItems: lines.map((text, index) => ({ itemId: `role-${index}`, text,
      observationIds: boxes && texts.length === 1 && index === target
        ? boxes.map((_, index) => `fixture-${index}`) : [`o${index}`] })),
  }] }] }
  try {
    sourceReferenceEssayTaskStates(confirmation, new Set(['answers']), materialization, evidence)
  } catch (error) {
    if (error.code !== 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID'
      || !/^(Repeated writing section|Unresolved writing overview before repeated task)/u.test(error.message)) {
      return checkedSourceReferences(materialization, evidence, confirmation)
    }
    assert.throws(() => assertSourceReferenceAdmission({ sidecar: null, materialization, sourceInput: {
      ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)),
        confirmationBytes: Buffer.from(JSON.stringify(confirmation)) },
    } }))
    return
  }
  return checkedSourceReferences(materialization, evidence, confirmation)
}
