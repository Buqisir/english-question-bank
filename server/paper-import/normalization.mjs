import Ajv from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  buildExactPaperGroupSourceSlice,
} from '../../shared/paper-normalization/exactPaperGroupSourceSlice.mjs'
import {
  normalizePaperGroup,
} from '../../shared/paper-normalization/normalizePaperGroup.mjs'

export const PAPER_NORMALIZED_GROUPS_SCHEMA_VERSION =
  'paper-normalized-groups-v1'
export const PAPER_NORMALIZER_VERSION = 'canonical-paper-group-v1'
export const PAPER_NORMALIZED_GROUPS_FILE_NAME =
  'paper-normalized-groups-v1.json'

const supportedGroupTypes = new Set(['cloze', 'grammarFill'])
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const schema = JSON.parse(
  readFileSync(
    path.join(
      rootDir,
      'schemas/paper-import/paper-normalized-groups-v1.schema.json',
    ),
    'utf8',
  ),
)
const validateSchema = new Ajv({
  allErrors: true,
  strict: false,
}).compile(schema)

function schemaIssues() {
  return (validateSchema.errors || []).map((error) => ({
    code: 'SIDECAR_SCHEMA_INVALID',
    path: error.instancePath || '/',
    message: error.message || 'invalid sidecar',
  }))
}

function supportedGroups(paperAsset) {
  return Object.values(paperAsset?.content?.groups || {})
    .filter((group) => supportedGroupTypes.has(group?.groupType))
    .sort((left, right) => left.groupId.localeCompare(right.groupId))
}

export function buildPaperNormalizedGroupsSidecar(paperAsset) {
  const groups = {}
  const entries = []
  const issues = []

  for (const group of supportedGroups(paperAsset)) {
    const normalized = normalizePaperGroup(
      buildExactPaperGroupSourceSlice(paperAsset, group.groupId),
    )
    if (normalized.status === 'needs_review') {
      entries.push({
        groupId: group.groupId,
        groupType: group.groupType,
        status: 'needs_review',
        issues: normalized.issues,
      })
      issues.push(
        ...normalized.issues.map((normalizationIssue) => ({
          groupId: group.groupId,
          ...normalizationIssue,
        })),
      )
      continue
    }

    groups[group.groupId] = {
      sourceFingerprint: normalized.sourceFingerprint,
      semanticDigest: normalized.semanticDigest,
      canonicalGroup: normalized.group,
    }
    entries.push({
      groupId: group.groupId,
      groupType: group.groupType,
      status: 'ready',
      sourceFingerprint: normalized.sourceFingerprint,
      semanticDigest: normalized.semanticDigest,
    })
  }

  if (issues.length > 0) {
    return { status: 'needs_review', entries, issues }
  }

  const sidecar = {
    schemaVersion: PAPER_NORMALIZED_GROUPS_SCHEMA_VERSION,
    paperId: paperAsset?.paper?.paperId,
    sourceAssetVersion: paperAsset?.paper?.assetVersion,
    normalizerVersion: PAPER_NORMALIZER_VERSION,
    groups,
  }
  if (!validateSchema(sidecar)) {
    return {
      status: 'needs_review',
      entries,
      issues: schemaIssues(),
    }
  }

  return { status: 'ready', entries, sidecar }
}

export function validatePaperNormalizedGroupsSidecar({
  paperAsset,
  sidecar,
}) {
  const issues = []
  if (!validateSchema(sidecar)) {
    return { ok: false, issues: schemaIssues() }
  }
  if (sidecar.paperId !== paperAsset?.paper?.paperId) {
    issues.push({
      code: 'SIDECAR_PAPER_ID_MISMATCH',
      path: '/paperId',
      message: 'sidecar paperId does not match paper asset',
    })
  }
  if (sidecar.sourceAssetVersion !== paperAsset?.paper?.assetVersion) {
    issues.push({
      code: 'SIDECAR_ASSET_VERSION_MISMATCH',
      path: '/sourceAssetVersion',
      message: 'sidecar sourceAssetVersion does not match paper asset',
    })
  }

  const expectedGroupIds = supportedGroups(paperAsset).map(
    ({ groupId }) => groupId,
  )
  const actualGroupIds = Object.keys(sidecar.groups).sort()
  if (!isDeepStrictEqual(actualGroupIds, expectedGroupIds)) {
    issues.push({
      code: 'SIDECAR_GROUP_SET_MISMATCH',
      path: '/groups',
      message: 'sidecar must contain every and only supported group',
    })
  }

  for (const groupId of expectedGroupIds) {
    const entry = sidecar.groups[groupId]
    if (!entry) continue
    const normalized = normalizePaperGroup(
      buildExactPaperGroupSourceSlice(paperAsset, groupId),
    )
    if (normalized.status !== 'ready') {
      issues.push({
        code: 'SIDECAR_SOURCE_NEEDS_REVIEW',
        path: `/groups/${groupId}`,
        message: 'paper asset source no longer normalizes to ready',
      })
      continue
    }
    if (entry.sourceFingerprint !== normalized.sourceFingerprint) {
      issues.push({
        code: 'SIDECAR_SOURCE_FINGERPRINT_MISMATCH',
        path: `/groups/${groupId}/sourceFingerprint`,
        message: 'sidecar sourceFingerprint is stale',
      })
    }
    if (entry.semanticDigest !== normalized.semanticDigest) {
      issues.push({
        code: 'SIDECAR_SEMANTIC_DIGEST_MISMATCH',
        path: `/groups/${groupId}/semanticDigest`,
        message: 'sidecar semanticDigest is stale',
      })
    }
    if (!isDeepStrictEqual(entry.canonicalGroup, normalized.group)) {
      issues.push({
        code: 'SIDECAR_CANONICAL_GROUP_MISMATCH',
        path: `/groups/${groupId}/canonicalGroup`,
        message: 'sidecar canonical group does not match source',
      })
    }
  }

  return { ok: issues.length === 0, issues }
}
