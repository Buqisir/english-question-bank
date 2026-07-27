import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const references = Object.freeze({
  'paper-2020-i': Object.freeze({
    paperAsset: 'sha256:598fdfd3e57f39d6244238c7d0a28383ff2fd2e522acb03f4ea9a1bd414c2cd7',
    answerKey: 'sha256:ed825d83c0e97ed0a5586130dc7e2b76b7f316ca41e8c89cdf3ad6eeca506b97',
    importMeta: 'sha256:340ee05a411f687fd7c766506a1034e875efd9e536e3d8ddaf387397dc100cf7',
    source: 'sha256:96ed0fd208ee95f4989cbf2b651a70ba57baf09d917af7a94e793191f63ef7d2',
    given: Object.freeze({ presence: 'none' }),
  }),
  'paper-2026-i': Object.freeze({
    paperAsset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
    answerKey: 'sha256:17502bb7685b83afc8847f3a44f8ac3c68defcb941ae75ba1ff14945c07daaf0',
    importMeta: 'sha256:dda79f448a049d9ce6293049b4e1dec51fba35cb683e4e7860f5390ab3d3e900',
    source: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    given: Object.freeze({ presence: 'provided', role: 'title', placement: 'answer_region_top' }),
  }),
})

function readHashBoundBytes(url, expectedDigest) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Application Writing reference drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

function paragraph(blockId, value) {
  return {
    kind: 'paragraph',
    nodeId: blockId,
    inlines: [{ kind: 'text', nodeId: `text:${blockId}`, text: value }],
  }
}

function removeFoundationApplication(source) {
  const removed = source.groups.find((group) => group.slotId === 'writing.application')
  source.groups = source.groups.filter((group) => group !== removed)
  const removedObservationIds = new Set([
    'observation:writing.application',
    'observation:group:writing.application:answer-region-empty',
  ])
  source.observations = source.observations.filter((observation) => !removedObservationIds.has(observation.observationId))
}

function applicationGroupFromPaper(paper, givenSpec, paperAssetLength) {
  const legacyGroup = Object.values(paper.content.groups)
    .find((group) => group.groupType === 'writing' && paper.content.writingTasks[group.writingTaskId]?.taskType === 'application')
  const writingTask = paper.content.writingTasks[legacyGroup.writingTaskId]
  const promptBlocks = legacyGroup.passage.paragraphs.map((item) => paragraph(item.paragraphId, item.text))
  const contentBlocks = [...promptBlocks]
  const observations = [{
    observationId: `observation:application:${legacyGroup.groupId}`,
    kind: 'application_source_group',
    documentInputKey: 'paper_asset',
    value: { groupId: legacyGroup.groupId, writingTaskId: writingTask.writingTaskId },
    span: { start: 0, end: paperAssetLength },
  }]
  let givenSkeleton
  if (givenSpec.presence === 'none') {
    const observationId = `observation:application:${legacyGroup.groupId}:answer-region-empty`
    observations.push({
      observationId,
      kind: 'application_answer_region_absence',
      documentInputKey: 'paper_asset',
      value: { groupId: legacyGroup.groupId, answerRegionRef: 'writing.application-box' },
      span: { start: 0, end: paperAssetLength },
    })
    givenSkeleton = { presence: 'none', answerRegionAbsenceAssertionRef: observationId }
  } else {
    const blockId = `paragraph:${legacyGroup.groupId}:given:title`
    const givenPartId = `given-part:${legacyGroup.groupId}:title`
    const observationId = `observation:application:${legacyGroup.groupId}:given:title`
    contentBlocks.push(paragraph(blockId, writingTask.applicationGiven))
    observations.push({
      observationId,
      kind: 'application_given_part',
      documentInputKey: 'paper_asset',
      value: {
        groupId: legacyGroup.groupId,
        givenPartId,
        role: givenSpec.role,
        placement: givenSpec.placement,
        blockRef: blockId,
      },
      span: { start: 0, end: paperAssetLength },
    })
    givenSkeleton = {
      presence: 'provided',
      parts: [{
        givenPartId,
        role: givenSpec.role,
        placement: givenSpec.placement,
        blockRef: blockId,
        authorityAssertionRef: observationId,
      }],
    }
  }
  const firstPrompt = promptBlocks[0]
  const firstRef = { blockId: firstPrompt.nodeId, inlineNodeIds: [firstPrompt.inlines[0].nodeId] }
  const requirementBlocks = promptBlocks.length > 1 ? promptBlocks.slice(1) : promptBlocks
  return {
    observations,
    group: {
      groupId: legacyGroup.groupId,
      slotId: 'writing.application',
      family: 'application-writing',
      questionIds: [],
      blankIds: [],
      sourceSpanId: `source-span:observation:application:${legacyGroup.groupId}`,
      content: { blocks: contentBlocks },
      media: [],
      variant: {
        family: 'application-writing',
        writingTaskId: writingTask.writingTaskId,
        promptBlockRefs: promptBlocks.map((block) => block.nodeId),
        situation: {
          writerRole: firstRef,
          audienceOrDestination: firstRef,
          deliverable: firstRef,
          communicativePurpose: firstRef,
        },
        contentRequirements: requirementBlocks.map((block, index) => ({
          requirementId: `requirement:${legacyGroup.groupId}:${index + 1}`,
          contentRef: { blockId: block.nodeId, inlineNodeIds: [block.inlines[0].nodeId] },
        })),
        wordCountRuling: {
          kind: 'approximate_target',
          target: writingTask.wordCountTarget,
          countScope: 'student_authored_only',
          sourceRef: firstRef,
        },
        givenSkeleton,
        choiceOwnership: { ownership: 'none' },
        response: {
          kind: 'group_level_written_response',
          answerRegionRef: 'writing.application-box',
        },
      },
    },
  }
}

export const applicationWritingReferenceHashes = references

export function makeApplicationWritingReferenceFixture(paperId) {
  const hashes = references[paperId]
  if (!hashes) throw new Error(`Unknown Application Writing reference paper ${paperId}`)
  const baseUrl = new URL(`../../app/public/paper-assets/${paperId}/latest/`, import.meta.url)
  const paperAsset = readHashBoundBytes(new URL('paper-asset.json', baseUrl), hashes.paperAsset)
  const answerKey = readHashBoundBytes(new URL('answer-key.json', baseUrl), hashes.answerKey)
  const importMeta = readHashBoundBytes(new URL('import-meta.json', baseUrl), hashes.importMeta)
  const meta = JSON.parse(new TextDecoder().decode(importMeta))
  if (`sha256:${meta.sourceFileSha256}` !== hashes.source) throw new Error(`Application source provenance drifted for ${paperId}`)
  const paper = JSON.parse(new TextDecoder().decode(paperAsset))
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  source.paperId = paperId
  source.sourceAssetVersion = 1
  removeFoundationApplication(source)
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'
  const application = applicationGroupFromPaper(paper, hashes.given, paperAsset.byteLength)
  source.groups.push(application.group)
  source.observations.push(...application.observations)
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.documentInputKey === 'canonical_mapping') observation.span.end = mappingLength
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    paperId,
    source,
    sourceAsset: paperAsset,
    hashes,
    request: {
      authority: fixture.request.authority,
      evidence: {
        documents: [
          {
            inputKey: 'canonical_mapping',
            roles: ['operator_assertions'],
            bytes: mappingBytes,
            declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json' },
          },
          {
            inputKey: 'paper_asset',
            roles: ['question_source'],
            bytes: paperAsset,
            declared: { mediaType: 'application/json', originalName: 'paper-asset.json' },
          },
          {
            inputKey: 'official_answers',
            roles: ['official_answer_source'],
            bytes: answerKey,
            declared: { mediaType: 'application/json', originalName: 'answer-key.json' },
          },
          {
            inputKey: 'source_provenance',
            roles: ['source_provenance'],
            bytes: importMeta,
            declared: { mediaType: 'application/json', originalName: 'import-meta.json' },
          },
        ],
      },
    },
  }
}
