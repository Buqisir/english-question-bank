import manifestV31 from '../../standards/paper-canonical/manifest-v31.json' with { type: 'json' }
import manifestV32 from '../../standards/paper-canonical/manifest-v32.json' with { type: 'json' }
import manifestV33 from '../../standards/paper-canonical/manifest-v33.json' with { type: 'json' }
import manifestV34 from '../../standards/paper-canonical/manifest-v34.json' with { type: 'json' }
import manifestV35 from '../../standards/paper-canonical/manifest-v35.json' with { type: 'json' }
import manifestV36 from '../../standards/paper-canonical/manifest-v36.json' with { type: 'json' }
import manifestV37 from '../../standards/paper-canonical/manifest-v37.json' with { type: 'json' }
import manifestV41 from '../../standards/paper-canonical/manifest-v41.json' with { type: 'json' }
import manifestV42 from '../../standards/paper-canonical/manifest-v42.json' with { type: 'json' }
import manifestV43 from '../../standards/paper-canonical/manifest-v43.json' with { type: 'json' }
import manifestV44 from '../../standards/paper-canonical/manifest-v44.json' with { type: 'json' }
import manifestV45 from '../../standards/paper-canonical/manifest-v45.json' with { type: 'json' }
import manifestV46 from '../../standards/paper-canonical/manifest-v46.json' with { type: 'json' }
import manifestV49 from '../../standards/paper-canonical/manifest-v49.json' with { type: 'json' }
import nck1V9 from '../../standards/paper-canonical/profiles/nck1-v9.json' with { type: 'json' }
import nck1V10 from '../../standards/paper-canonical/profiles/nck1-v10.json' with { type: 'json' }
import nck1V11 from '../../standards/paper-canonical/profiles/nck1-v11.json' with { type: 'json' }
import nck1V12 from '../../standards/paper-canonical/profiles/nck1-v12.json' with { type: 'json' }
import nck1V13 from '../../standards/paper-canonical/profiles/nck1-v13.json' with { type: 'json' }
import nck1V14 from '../../standards/paper-canonical/profiles/nck1-v14.json' with { type: 'json' }
import nck1V15 from '../../standards/paper-canonical/profiles/nck1-v15.json' with { type: 'json' }
import nationalLegacyV3 from '../../standards/paper-canonical/profiles/national-legacy-v3.json' with { type: 'json' }
import nationalLegacyV4 from '../../standards/paper-canonical/profiles/national-legacy-v4.json' with { type: 'json' }
import zhejiangLegacyV7 from '../../standards/paper-canonical/profiles/zhejiang-legacy-v7.json' with { type: 'json' }
import zhejiangLegacyV10 from '../../standards/paper-canonical/profiles/zhejiang-legacy-v10.json' with { type: 'json' }
import zhejiangLegacyV11 from '../../standards/paper-canonical/profiles/zhejiang-legacy-v11.json' with { type: 'json' }
import zhejiangLegacyV12 from '../../standards/paper-canonical/profiles/zhejiang-legacy-v12.json' with { type: 'json' }
import zhejiangLegacyV13 from '../../standards/paper-canonical/profiles/zhejiang-legacy-v13.json' with { type: 'json' }

import { digestJson } from './stable.mjs'

const registeredProfiles = new Map([
  [`${nck1V9.profileId}@${nck1V9.version}`, nck1V9],
  [`${nck1V10.profileId}@${nck1V10.version}`, nck1V10],
  [`${nck1V11.profileId}@${nck1V11.version}`, nck1V11],
  [`${nck1V12.profileId}@${nck1V12.version}`, nck1V12],
  [`${nck1V13.profileId}@${nck1V13.version}`, nck1V13],
  [`${nck1V14.profileId}@${nck1V14.version}`, nck1V14],
  [`${nck1V15.profileId}@${nck1V15.version}`, nck1V15],
  [
    `${nationalLegacyV3.profileId}@${nationalLegacyV3.version}`,
    nationalLegacyV3,
  ],
  [
    `${nationalLegacyV4.profileId}@${nationalLegacyV4.version}`,
    nationalLegacyV4,
  ],
  [
    `${zhejiangLegacyV7.profileId}@${zhejiangLegacyV7.version}`,
    zhejiangLegacyV7,
  ],
  [
    `${zhejiangLegacyV10.profileId}@${zhejiangLegacyV10.version}`,
    zhejiangLegacyV10,
  ],
  [
    `${zhejiangLegacyV11.profileId}@${zhejiangLegacyV11.version}`,
    zhejiangLegacyV11,
  ],
  [
    `${zhejiangLegacyV12.profileId}@${zhejiangLegacyV12.version}`,
    zhejiangLegacyV12,
  ],
  [
    `${zhejiangLegacyV13.profileId}@${zhejiangLegacyV13.version}`,
    zhejiangLegacyV13,
  ],
])
const manifestV31Profiles = new Map(
  [nck1V10, nationalLegacyV3, zhejiangLegacyV7].map((profile) => [
    profile.profileId,
    {
      profileId: profile.profileId,
      profileVersion: profile.version,
      profileDigest: digestJson(profile),
    },
  ]),
)
const manifestV32Profiles = new Map(manifestV31Profiles)
const manifestV33Profiles = new Map(manifestV32Profiles)
const manifestV34Profiles = new Map(manifestV33Profiles)
const manifestV35Profiles = new Map(manifestV34Profiles)
const manifestV36Profiles = new Map(manifestV35Profiles)
const manifestV37Profiles = new Map([
  nck1V11,
  nationalLegacyV3,
  zhejiangLegacyV7,
].map((profile) => [
  profile.profileId,
  {
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileDigest: digestJson(profile),
  },
]))
const manifestV41Profiles = new Map([
  nck1V12,
  nationalLegacyV3,
  zhejiangLegacyV10,
].map((profile) => [
  profile.profileId,
  {
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileDigest: digestJson(profile),
  },
]))
const manifestV42Profiles = new Map(manifestV41Profiles)
const manifestV43Profiles = new Map(manifestV42Profiles)
const manifestV44Profiles = new Map(manifestV43Profiles)
const manifestV45Profiles = new Map([
  nck1V13,
  nationalLegacyV3,
  zhejiangLegacyV11,
].map((profile) => [
  profile.profileId,
  {
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileDigest: digestJson(profile),
  },
]))
const manifestV46Profiles = new Map([
  nck1V14,
  nationalLegacyV4,
  zhejiangLegacyV12,
].map((profile) => [
  profile.profileId,
  {
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileDigest: digestJson(profile),
  },
]))
const manifestV49Profiles = new Map([
  nck1V15,
  nationalLegacyV4,
  zhejiangLegacyV13,
].map((profile) => [
  profile.profileId,
  {
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileDigest: digestJson(profile),
  },
]))
const registeredManifestProfiles = new Map([
  [
    `${manifestV31.manifestId}@${manifestV31.version}@${digestJson(manifestV31)}`,
    manifestV31Profiles,
  ],
  [
    `${manifestV32.manifestId}@${manifestV32.version}@${digestJson(manifestV32)}`,
    manifestV32Profiles,
  ],
  [
    `${manifestV33.manifestId}@${manifestV33.version}@${digestJson(manifestV33)}`,
    manifestV33Profiles,
  ],
  [
    `${manifestV34.manifestId}@${manifestV34.version}@${digestJson(manifestV34)}`,
    manifestV34Profiles,
  ],
  [
    `${manifestV35.manifestId}@${manifestV35.version}@${digestJson(manifestV35)}`,
    manifestV35Profiles,
  ],
  [
    `${manifestV36.manifestId}@${manifestV36.version}@${digestJson(manifestV36)}`,
    manifestV36Profiles,
  ],
  [
    `${manifestV37.manifestId}@${manifestV37.version}@${digestJson(manifestV37)}`,
    manifestV37Profiles,
  ],
  [
    `${manifestV41.manifestId}@${manifestV41.version}@${digestJson(manifestV41)}`,
    manifestV41Profiles,
  ],
  [
    `${manifestV42.manifestId}@${manifestV42.version}@${digestJson(manifestV42)}`,
    manifestV42Profiles,
  ],
  [
    `${manifestV43.manifestId}@${manifestV43.version}@${digestJson(manifestV43)}`,
    manifestV43Profiles,
  ],
  [
    `${manifestV44.manifestId}@${manifestV44.version}@${digestJson(manifestV44)}`,
    manifestV44Profiles,
  ],
  [
    `${manifestV45.manifestId}@${manifestV45.version}@${digestJson(manifestV45)}`,
    manifestV45Profiles,
  ],
  [
    `${manifestV46.manifestId}@${manifestV46.version}@${digestJson(manifestV46)}`,
    manifestV46Profiles,
  ],
  [
    `${manifestV49.manifestId}@${manifestV49.version}@${digestJson(manifestV49)}`,
    manifestV49Profiles,
  ],
])

function reject(message) {
  const error = new Error(`Canonical visible structure is invalid: ${message}`)
  error.name = 'CanonicalVisibleStructureError'
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  throw error
}

function profileVisibleStructure(profile, expectedGroups) {
  const groupBySlotId = new Map(
    expectedGroups.map((group) => [group.slotId, group]),
  )
  if (groupBySlotId.size !== expectedGroups.length) {
    reject('the expected Profile Group ownership is duplicated')
  }
  const nodes = []
  for (const part of profile.parts) {
    const visibleSections = part.sections.filter((section) =>
      section.slots.some((slot) => slot.activation === 'canonical_group'))
    if (visibleSections.length === 0) continue
    const partInstruction = profile.instructions[part.titleInstructionRef]
    nodes.push({
      kind: 'part',
      partId: part.partId,
      instructionId: part.titleInstructionRef,
    })
    nodes.push({
      kind: 'instruction',
      instructionId: partInstruction.instructionId,
      placement: partInstruction.placement,
      text: partInstruction.text,
      renderPolicy: partInstruction.renderPolicy ?? 'render',
    })
    for (const section of visibleSections) {
      const sectionInstruction =
        profile.instructions[section.titleInstructionRef]
      nodes.push({
        kind: 'section',
        sectionId: section.sectionId,
        instructionId: section.titleInstructionRef,
      })
      nodes.push({
        kind: 'instruction',
        instructionId: sectionInstruction.instructionId,
        placement: sectionInstruction.placement,
        text: sectionInstruction.text,
        renderPolicy: sectionInstruction.renderPolicy ?? 'render',
      })
      for (const slot of section.slots) {
        if (slot.activation !== 'canonical_group') continue
        for (const instructionId of slot.instructionRefs) {
          const instruction = profile.instructions[instructionId]
          nodes.push({
            kind: 'instruction',
            instructionId: instruction.instructionId,
            placement: instruction.placement,
            text: instruction.text,
            renderPolicy: instruction.renderPolicy ?? 'render',
          })
        }
        const group = groupBySlotId.get(slot.slotId)
        if (
          !group
          || group.familyContractId !== slot.familyContractRef.id
        ) {
          reject(
            `Profile slot ${slot.slotId} lacks its exact family-owned Group`,
          )
        }
        nodes.push({
          kind: 'group',
          slotId: slot.slotId,
          groupId: group.groupId,
          familyContractId: group.familyContractId,
        })
        groupBySlotId.delete(slot.slotId)
      }
    }
  }
  if (groupBySlotId.size > 0) {
    reject('Consumption Plan carries Groups outside the registered Profile')
  }
  return nodes
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  return (
    isRecord(value)
    && Object.keys(value).sort().join('\0')
      === [...expected].sort().join('\0')
  )
}

function isIdentity(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * Strict shared Screen/Print boundary for the renderer-neutral public
 * structure. It validates both exact node shapes and the projected
 * part -> heading -> section -> heading -> instruction* -> Group order.
 */
export function assertCanonicalVisibleStructure(value, expectedGroups = null) {
  if (!Array.isArray(value) || value.length === 0) {
    reject('one non-empty node array is required')
  }
  if (
    expectedGroups !== null
    && (
      !Array.isArray(expectedGroups)
      || expectedGroups.length === 0
      || expectedGroups.some((group) =>
        !hasExactKeys(group, [
          'slotId',
          'groupId',
          'familyContractId',
        ])
        || !isIdentity(group.slotId)
        || !isIdentity(group.groupId)
        || !isIdentity(group.familyContractId))
    )
  ) reject('the expected Group order is invalid')

  const partIds = new Set()
  const sectionIds = new Set()
  const instructionIds = new Set()
  const slotIds = new Set()
  const groupIds = new Set()
  let activePart = false
  let partHasSection = false
  let activeSection = false
  let sectionHasGroup = false
  let pendingHeading = null
  let pendingGroupInstruction = false
  let groupIndex = 0

  for (const [index, node] of value.entries()) {
    if (!isRecord(node) || typeof node.kind !== 'string') {
      reject(`node ${index} is not one registered object`)
    }

    if (node.kind === 'part') {
      if (
        !hasExactKeys(node, ['kind', 'partId', 'instructionId'])
        || !isIdentity(node.partId)
        || !isIdentity(node.instructionId)
        || partIds.has(node.partId)
      ) reject(`node ${index} has an invalid or duplicate part identity`)
      if (
        pendingHeading
        || pendingGroupInstruction
        || (activePart && !partHasSection)
        || (activeSection && !sectionHasGroup)
      ) reject(`node ${index} starts a part before the prior structure closes`)
      partIds.add(node.partId)
      activePart = true
      partHasSection = false
      activeSection = false
      sectionHasGroup = false
      pendingHeading = {
        instructionId: node.instructionId,
        placement: 'part_heading',
      }
      continue
    }

    if (node.kind === 'section') {
      if (
        !hasExactKeys(node, ['kind', 'sectionId', 'instructionId'])
        || !isIdentity(node.sectionId)
        || !isIdentity(node.instructionId)
        || sectionIds.has(node.sectionId)
      ) reject(`node ${index} has an invalid or duplicate section identity`)
      if (
        !activePart
        || pendingHeading
        || pendingGroupInstruction
        || (activeSection && !sectionHasGroup)
      ) reject(`node ${index} starts a section outside one closed part`)
      sectionIds.add(node.sectionId)
      partHasSection = true
      activeSection = true
      sectionHasGroup = false
      pendingHeading = {
        instructionId: node.instructionId,
        placement: 'section_heading',
      }
      continue
    }

    if (node.kind === 'instruction') {
      if (
        !hasExactKeys(node, [
          'kind',
          'instructionId',
          'placement',
          'renderPolicy',
          'text',
        ])
        || !isIdentity(node.instructionId)
        || typeof node.text !== 'string'
        || node.text.length === 0
        || node.renderPolicy !== 'render'
        || ![
          'part_heading',
          'section_heading',
          'group_instruction',
        ].includes(node.placement)
        || instructionIds.has(node.instructionId)
      ) reject(`node ${index} has an invalid or duplicate instruction`)
      if (node.placement === 'group_instruction') {
        if (!activeSection || pendingHeading) {
          reject(`node ${index} has an orphaned Group instruction`)
        }
        pendingGroupInstruction = true
      } else if (
        pendingHeading?.instructionId !== node.instructionId
        || pendingHeading?.placement !== node.placement
      ) {
        reject(`node ${index} does not close its declared heading`)
      } else {
        pendingHeading = null
      }
      instructionIds.add(node.instructionId)
      continue
    }

    if (node.kind === 'group') {
      if (
        !hasExactKeys(node, [
          'kind',
          'slotId',
          'groupId',
          'familyContractId',
        ])
        || !isIdentity(node.slotId)
        || !isIdentity(node.groupId)
        || !isIdentity(node.familyContractId)
        || slotIds.has(node.slotId)
        || groupIds.has(node.groupId)
      ) reject(`node ${index} has an invalid or duplicate Group identity`)
      if (!activeSection || pendingHeading) {
        reject(`node ${index} places a Group outside one closed section`)
      }
      const expectedGroup = expectedGroups?.[groupIndex]
      if (
        expectedGroups !== null
        && (
          !expectedGroup
          || expectedGroup.slotId !== node.slotId
          || expectedGroup.groupId !== node.groupId
          || expectedGroup.familyContractId !== node.familyContractId
        )
      ) reject(`node ${index} disagrees with ordered Consumption Plan Groups`)
      slotIds.add(node.slotId)
      groupIds.add(node.groupId)
      groupIndex += 1
      sectionHasGroup = true
      pendingGroupInstruction = false
      continue
    }

    reject(`node ${index} uses unknown kind ${node.kind}`)
  }

  if (
    pendingHeading
    || pendingGroupInstruction
    || !activePart
    || !partHasSection
    || !activeSection
    || !sectionHasGroup
    || (
      expectedGroups !== null
      && groupIndex !== expectedGroups.length
    )
  ) reject('the final part, section, heading, or Group instruction is open')

  return value
}

export function assertCanonicalConsumptionVisibleStructure(consumption) {
  if (!isRecord(consumption) || !Array.isArray(consumption.selections)) {
    reject('Consumption Plan selections are unavailable')
  }
  const expectedGroups = []
  const seenGroupIds = new Set()
  for (const [selectionIndex, selection] of consumption.selections.entries()) {
    if (!isRecord(selection) || selection.mode !== 'canonical') continue
    if (
      !isIdentity(selection.familyContractId)
      || !Array.isArray(selection.groupIds)
      || !Array.isArray(selection.projectedOccurrences)
      || selection.groupIds.length !== selection.projectedOccurrences.length
    ) reject(`canonical selection ${selectionIndex} is incomplete`)
    for (const [groupIndex, groupId] of selection.groupIds.entries()) {
      const occurrence = selection.projectedOccurrences[groupIndex]
      if (
        !isIdentity(groupId)
        || seenGroupIds.has(groupId)
        || !isRecord(occurrence)
        || occurrence.kind !== 'group'
        || occurrence.groupId !== groupId
        || occurrence.familyContractId !== selection.familyContractId
        || !isIdentity(occurrence.slotId)
      ) reject(`canonical selection ${selectionIndex} Group order is invalid`)
      seenGroupIds.add(groupId)
      expectedGroups.push({
        slotId: occurrence.slotId,
        groupId,
        familyContractId: selection.familyContractId,
      })
    }
  }
  const visibleStructure = assertCanonicalVisibleStructure(
    consumption.visibleStructure,
    expectedGroups,
  )
  const profileRef = consumption.profileRef
  if (Number(consumption.authorityRef?.manifestVersion) >= 31) {
    if (
      !hasExactKeys(profileRef, [
        'profileId',
        'profileVersion',
        'profileDigest',
      ])
    ) reject('the registered Profile reference is unavailable')
    const authorityProfiles = registeredManifestProfiles.get(
      `${consumption.authorityRef?.manifestId}@${consumption.authorityRef?.manifestVersion}@${consumption.authorityRef?.manifestDigest}`,
    )
    const authorityProfileRef = authorityProfiles?.get(profileRef.profileId)
    if (
      !authorityProfileRef
      || digestJson(profileRef) !== digestJson(authorityProfileRef)
    ) {
      reject(
        'the registered Profile reference is outside the declared Manifest closure',
      )
    }
    const profile = registeredProfiles.get(
      `${profileRef.profileId}@${profileRef.profileVersion}`,
    )
    if (
      !profile
      || profileRef.profileDigest !== digestJson(profile)
    ) reject('the registered Profile reference is stale or unknown')
    const expectedStructure = profileVisibleStructure(profile, expectedGroups)
    if (
      consumption.visibleStructureDigest !== digestJson(visibleStructure)
      || digestJson(visibleStructure) !== digestJson(expectedStructure)
    ) {
      reject(
        'visible nodes, text, placement, ownership, or order disagree with the registered Profile',
      )
    }
  }
  return visibleStructure
}
