import { exactKeys, isRecordValue } from './stable.mjs'

/**
 * Resolve the source-proven title/subtitle role map shared by passage
 * families. Roles may bind only top-level paragraph blocks, serialize by
 * node identity, and admit at most one title.
 */
export function resolvePassageBlockRoles(blocks, roles) {
  if (!Array.isArray(blocks) || !Array.isArray(roles)) {
    return { ok: false, rolesByNodeId: new Map() }
  }
  const paragraphIds = new Set(
    blocks
      .filter((block) => block?.kind === 'paragraph')
      .map((block) => block.nodeId),
  )
  const roleIds = roles.map((entry) => entry?.nodeId)
  const valid = (
    roles.every(
      (entry) =>
        isRecordValue(entry)
        && exactKeys(entry, ['nodeId', 'role'])
        && paragraphIds.has(entry.nodeId)
        && ['title', 'subtitle'].includes(entry.role),
    )
    && new Set(roleIds).size === roleIds.length
    && roleIds.every(
      (nodeId, index) =>
        index === 0 || nodeId.localeCompare(roleIds[index - 1]) >= 0,
    )
    && roles.filter((entry) => entry.role === 'title').length <= 1
  )
  return {
    ok: valid,
    rolesByNodeId: valid
      ? new Map(roles.map((entry) => [entry.nodeId, entry.role]))
      : new Map(),
  }
}
