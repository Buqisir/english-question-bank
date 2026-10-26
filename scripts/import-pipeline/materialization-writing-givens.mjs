import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'

// An explicit Agent edit, like the existing source-presentation edits. It does
// not rewrite producer receipts, resolve other review issues or confirm a Candidate.
export function confirmMaterializationWritingGivens(materialization, { groupId, givenBlockRefs, confirmed }) {
  if (confirmed !== true) throw new Error('Writing givens require explicit Agent confirmation')
  if (!/^nck1-source-materialization-v[1-8]$/u.test(materialization?.schemaVersion)) {
    throw new Error(`Unsupported materialization schema: ${materialization?.schemaVersion}`)
  }
  const result = structuredClone(materialization)
  const groups = result.groups?.filter(group => group.groupId === groupId) || []
  if (groups.length !== 1 || groups[0].family !== 'application-writing' || !groups[0].writingTask) {
    throw new Error('Writing givens require exactly one application-writing group')
  }
  if (!Array.isArray(givenBlockRefs) || !givenBlockRefs.length) {
    throw new Error('Writing givens require the complete ordered source block IDs')
  }
  if (result.schemaVersion !== 'nck1-source-materialization-v8') result.schemaVersion = 'nck1-source-materialization-v7'
  groups[0].writingTask.givenBlockRefs = [...givenBlockRefs]
  const issues = validateNck1SourceMaterialization(result)
  if (issues.length) throw new Error(`Confirmed writing givens are invalid: ${JSON.stringify(issues)}`)
  return result
}
