import { canonicalAuthorityRef } from '../../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority, slotsForProfile } from '../../shared/paper-canonical/authority.mjs'

function option(label) {
  return { optionId: `option:${label}`, label, content: [{ kind: 'text', nodeId: `text:${label}`, text: label }] }
}

function choiceOwnership(family, questionIds) {
  if (family === 'seven-choices') return { ownership: 'shared_bank', bankId: 'bank:fixture', options: 'ABCDEFG'.split('').map(option) }
  if (family === 'reading' || family === 'cloze') return { ownership: 'per_question', sets: questionIds.map((questionId) => ({ questionId, options: 'ABCD'.split('').map(option) })) }
  return { ownership: 'none' }
}

function referenceBlankContent(family, blankIds) {
  if (!['cloze', 'grammar-fill'].includes(family)) return { blocks: [] }
  return {
    blocks: [{
      kind: 'paragraph',
      nodeId: `paragraph:${family}:fixture`,
      inlines: blankIds.map((blankId, index) => ({
        kind: 'blank_ref',
        nodeId: `blank-ref:${family}:${index + 1}`,
        blankId,
      })),
    }],
  }
}

export function makeReadyCanonicalFixture() {
  const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const profile = closure.profiles.get('nck1')
  const observations = []
  const groups = []
  const assertions = []
  const inactiveSlots = {}
  for (const slot of slotsForProfile(profile)) {
    const observationId = `observation:${slot.slotId}`
    observations.push({ observationId, kind: 'fixture_section', documentInputKey: 'questions', value: slot.slotId, span: { start: 0, end: 1 } })
    const sourceSpanId = `source-span:${observationId}`
    if (slot.activation === 'inactive_source') {
      inactiveSlots[slot.slotId] = [sourceSpanId]
      continue
    }
    const questionIds = Array.from({ length: slot.questionCardinality.count }, (_, index) => `question:${slot.slotId}:${index + 1}`)
    const blankIds = ['grammar-fill', 'cloze', 'seven-choices'].includes(slot.familyContractRef.id)
      ? questionIds.map((_, index) => `blank:${slot.slotId}:${index + 1}`)
      : []
    groups.push({
      groupId: `group:${slot.slotId}`,
      slotId: slot.slotId,
      family: slot.familyContractRef.id,
      questionIds,
      blankIds,
      sourceSpanId,
      content: referenceBlankContent(slot.familyContractRef.id, blankIds),
      media: [],
      variant: { family: slot.familyContractRef.id, choiceOwnership: choiceOwnership(slot.familyContractRef.id, questionIds) },
    })
    for (const questionId of questionIds) assertions.push({ assertionId: `answer:${questionId}`, questionId, answer: 'A', authority: 'official', sourceSpanId })
  }
  const source = { paperId: 'paper-canonical-fixture', profileId: 'nck1', sourceAssetVersion: 1, observations, assertions, groups, inactiveSlots }
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of observations) observation.span.end = byteLength
  }
  const bytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    source,
    request: {
      authority: canonicalAuthorityRef,
      evidence: {
        documents: [{
          inputKey: 'questions',
          roles: ['question_source', 'official_answer_source'],
          bytes,
          declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json' },
        }],
      },
    },
    sourceAsset: bytes,
  }
}
