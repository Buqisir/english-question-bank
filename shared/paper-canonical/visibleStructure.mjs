function reject(message) {
  const error = new Error(`Canonical visible structure is invalid: ${message}`)
  error.name = 'CanonicalVisibleStructureError'
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  throw error
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
export function assertCanonicalVisibleStructure(value) {
  if (!Array.isArray(value) || value.length === 0) {
    reject('one non-empty node array is required')
  }

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
      slotIds.add(node.slotId)
      groupIds.add(node.groupId)
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
  ) reject('the final part, section, heading, or Group instruction is open')

  return value
}
