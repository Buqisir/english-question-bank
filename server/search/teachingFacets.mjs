import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineRoute } from '../router/index.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'
import {
  VERB_PROFILE_SCHEMA_VERSION,
  VERB_PROFILE_SIDECAR_FILENAME,
} from '../grammar-verb-profile/verbProfileSidecar.mjs'

/**
 * Teaching-dimension retrieval layer (I16·A).
 *
 * Indexes structured teaching facets from on-disk analysis JSON files and
 * exposes a query interface for "find question groups by teaching dimension."
 *
 * Coverage = analyzed groups only (MF-2: unanalyzed groups are absent, never
 * present-with-empty).
 *
 * Per-type facet containers mirror the entryMapKey convention from
 * paperSurfaceAvailability.mjs:
 *   - grammarFill / cloze → analysis.blanks[questionId]
 *   - sevenChoices / reading → analysis.questions[questionId]
 */

// ─── Analysis configs (mirrors paperSurfaceAvailability.mjs) ─────────────────
const analysisConfigs = [
  {
    schemaVersion: 'reading-choice-analysis-v1',
    fileName: 'reading-choice-analysis-v1.json',
    groupType: 'reading',
    entryMapKey: 'questions',
  },
  {
    schemaVersion: 'seven-choices-analysis-v1',
    fileName: 'seven-choices-analysis-v1.json',
    groupType: 'sevenChoices',
    entryMapKey: 'questions',
  },
  {
    schemaVersion: 'cloze-analysis-v1',
    fileName: 'cloze-analysis-v1.json',
    groupType: 'cloze',
    // Cloze analysis keys per-blank entries under 'blanks', not 'questions' (PA MF-1).
    entryMapKey: 'blanks',
  },
  {
    schemaVersion: 'grammar-fill-analysis-v1',
    fileName: 'grammar-fill-analysis-v1.json',
    groupType: 'grammarFill',
    // Grammar-fill analysis keys per-blank entries under 'blanks' (I14).
    entryMapKey: 'blanks',
  },
]

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

// ─── Step 1: Per-type facet extractor ────────────────────────────────────────

/**
 * Extract teaching facets from one analysis file.
 *
 * @param {string} analysisType - groupType: 'grammarFill' | 'sevenChoices' | 'cloze' | 'reading'
 * @param {object} analysisJson - parsed analysis JSON
 * @param {Map<string, {groupId: string, groupType: string}>} questionToGroup
 *   Maps questionId → { groupId, groupType } built from paper-asset content.groups[].questionIds
 * @returns {Map<string, GroupTeachingFacets>} - keyed by groupId
 *
 * Contract:
 * - questionId not in questionToGroup → skip (no crash)
 * - signatureFacet absent on cloze blank → skip that field (MF-1)
 * - reading skill is object {primary, secondary}; non-object/array form → skip (SW-3)
 * - groupType guard: only bind to groups whose groupType matches analysisType (SW-1)
 */
export function extractGroupFacets(analysisType, analysisJson, questionToGroup) {
  const result = new Map()

  const config = analysisConfigs.find((c) => c.groupType === analysisType)
  if (!config) return result

  const entryMap = analysisJson?.[config.entryMapKey]
  if (!entryMap || typeof entryMap !== 'object') return result

  for (const [questionId, entry] of Object.entries(entryMap)) {
    const qidStr = String(questionId)
    const groupEntry = questionToGroup.get(qidStr)

    // Skip if questionId not found in map (no crash)
    if (!groupEntry) continue
    // groupType guard: prevent cross-type mis-binding (SW-1)
    if (groupEntry.groupType !== analysisType) continue

    const { groupId } = groupEntry

    if (!result.has(groupId)) {
      result.set(groupId, createEmptyFacetBucket())
    }
    const bucket = result.get(groupId)

    // Dispatch per type — only fill fields relevant to that type (SW-1)
    if (analysisType === 'grammarFill') {
      extractGrammarFillFacets(bucket, entry)
    } else if (analysisType === 'sevenChoices') {
      extractSevenChoicesFacets(bucket, entry)
    } else if (analysisType === 'cloze') {
      extractClozeFacets(bucket, entry)
    } else if (analysisType === 'reading') {
      extractReadingFacets(bucket, entry)
    }
  }

  return result
}

function createEmptyFacetBucket() {
  return {
    // grammarFill
    facetKeys: new Set(),
    blankTypes: new Set(),
    roles: new Set(),
    // sevenChoices
    roleFacets: new Set(),
    positionFacets: new Set(),
    mechanismFacets: new Set(),
    // cloze
    pos: new Set(),
    signatureFacets: new Set(),
    // reading
    skills: new Set(),
    secondarySkills: new Set(),
    // grammarFill verb axes (I16·C) — merged in from the verb-profile sidecar
    tenses: new Set(),
    voices: new Set(),
    agreements: new Set(),
  }
}

function extractGrammarFillFacets(bucket, entry) {
  const facetKey = entry?.facetKey
  if (facetKey && typeof facetKey === 'string') bucket.facetKeys.add(facetKey)

  const blankType = entry?.blankType
  if (blankType && typeof blankType === 'string') bucket.blankTypes.add(blankType)

  const role = entry?.role
  // role is null for most blanks — only add if truthy string
  if (role && typeof role === 'string') bucket.roles.add(role)
}

function extractSevenChoicesFacets(bucket, entry) {
  const roleFacet = entry?.roleFacet
  if (roleFacet && typeof roleFacet === 'string') bucket.roleFacets.add(roleFacet)

  const positionFacet = entry?.positionFacet
  if (positionFacet && typeof positionFacet === 'string') bucket.positionFacets.add(positionFacet)

  const primaryMechanismFacet = entry?.primaryMechanismFacet
  if (primaryMechanismFacet && typeof primaryMechanismFacet === 'string') {
    bucket.mechanismFacets.add(primaryMechanismFacet)
  }
}

function extractClozeFacets(bucket, entry) {
  const pos = entry?.pos
  if (pos && typeof pos === 'string') bucket.pos.add(pos)

  // signatureFacet is optional/sparse (MF-1): 13/15 blanks lack it; skip when absent.
  // Also: pos==='other' contractually never carries signatureFacet (analyzeCloze.mjs:209).
  const signatureFacet = entry?.signatureFacet
  if (signatureFacet && typeof signatureFacet === 'string') {
    bucket.signatureFacets.add(signatureFacet)
  }
}

function extractReadingFacets(bucket, entry) {
  const skill = entry?.skill
  // Only accept object form {primary, secondary}; ignore legacy array form (SW-3)
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return

  const primary = skill.primary
  if (primary && typeof primary === 'string') bucket.skills.add(primary)

  const secondary = skill.secondary
  if (secondary && typeof secondary === 'string') bucket.secondarySkills.add(secondary)
}

/**
 * I16·C — merge verb-profile sidecar axes into EXISTING grammarFill buckets.
 *
 * Deliberately NOT a parallel analysisConfig: a second config for the same
 * groupId would clobber the grammarFill bucket via the per-config index.set
 * below. Instead this augments the bucket the grammar-fill-analysis config
 * already built — so existing facetKeys/blankTypes/roles/groupType are preserved
 * by construction (MF-2), and only the 3 axes are added.
 *
 * @param {Map<string, object>} index - groupId → bucket (already populated)
 * @param {object} sidecarJson - parsed grammar-fill-verb-profile-v1.json
 * @param {Map<string, {groupId, groupType}>} questionToGroup
 */
function mergeVerbProfileAxes(index, sidecarJson, questionToGroup) {
  const blanks = sidecarJson?.blanks
  if (!blanks || typeof blanks !== 'object') return

  for (const [questionId, profile] of Object.entries(blanks)) {
    const groupEntry = questionToGroup.get(String(questionId))
    if (!groupEntry) continue
    // verb profiles only belong to grammarFill groups
    if (groupEntry.groupType !== 'grammarFill') continue

    // Augment ONLY an existing bucket (built from the main grammar-fill analysis).
    // A sidecar without its main analysis is an orphan — skip, never create a
    // bucket that would lack groupType/facetKeys.
    const bucket = index.get(groupEntry.groupId)
    if (!bucket) continue

    if (profile?.tense && typeof profile.tense === 'string') bucket.tenses.add(profile.tense)
    if (profile?.voice && typeof profile.voice === 'string') bucket.voices.add(profile.voice)
    if (profile?.agreement && typeof profile.agreement === 'string') bucket.agreements.add(profile.agreement)
  }
}

// ─── Step 2: Full index over paper-assets ─────────────────────────────────────

/**
 * Build and cache the teaching facet index by walking all paper-asset dirs.
 *
 * @returns {{ getIndex, invalidate }}
 *   getIndex() → Map<groupId, GroupTeachingFacets & { groupType: string }>
 *   invalidate() → clears the cache so next getIndex() rebuilds
 *
 * Only analyzed groups appear in the index (MF-2). Groups in content.groups
 * with no analysis file on disk are absent.
 */
export function createTeachingFacetIndex({ paperAssetsDir, warn = console.warn }) {
  let cache = null

  function buildIndex() {
    const index = new Map()

    if (!existsSync(paperAssetsDir)) {
      return index
    }

    for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const { assetPath, baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
      if (!existsSync(assetPath)) continue

      try {
        const asset = readJsonFile(assetPath)
        // Use asset.paper.paperId, not the dir name (SW-5)
        const paperId = String(asset?.paper?.paperId || entry.name)

        // Build questionId → { groupId, groupType } from this paper's groups
        const questionToGroup = new Map()
        const groups = asset?.content?.groups
        if (groups && typeof groups === 'object') {
          for (const [groupId, group] of Object.entries(groups)) {
            const gid = String(groupId)
            const questionIds = Array.isArray(group?.questionIds) ? group.questionIds : []
            for (const qid of questionIds) {
              questionToGroup.set(String(qid), { groupId: gid, groupType: group.groupType })
            }
          }
        }

        // Walk each analysis config
        for (const config of analysisConfigs) {
          const analysisPath = path.join(baseDir, 'analyses', config.fileName)
          if (!existsSync(analysisPath)) continue

          const analysis = readJsonFile(analysisPath)

          // Match analysis to this paper by paperId (SW-5), not dir name
          if (analysis?.paperId !== paperId) continue
          if (analysis?.schemaVersion !== config.schemaVersion) continue

          const groupFacets = extractGroupFacets(config.groupType, analysis, questionToGroup)

          for (const [groupId, facets] of groupFacets) {
            // Tag with groupType for query filtering
            index.set(groupId, { ...facets, groupType: config.groupType })
          }
        }

        // I16·C: merge verb-profile axes into the grammarFill buckets built above.
        // Not a parallel config (would clobber); augments the existing bucket.
        const verbProfilePath = path.join(baseDir, 'analyses', VERB_PROFILE_SIDECAR_FILENAME)
        if (existsSync(verbProfilePath)) {
          const sidecar = readJsonFile(verbProfilePath)
          if (sidecar?.schemaVersion === VERB_PROFILE_SCHEMA_VERSION && sidecar?.paperId === paperId) {
            mergeVerbProfileAxes(index, sidecar, questionToGroup)
          }
        }
      } catch (error) {
        warn(`[teaching-facets] ignored invalid paper asset in ${entry.name}:`, error)
      }
    }

    return index
  }

  function getIndex() {
    if (cache === null) {
      cache = buildIndex()
    }
    return cache
  }

  function invalidate() {
    cache = null
  }

  return { getIndex, invalidate }
}

// ─── Step 3: Query function ───────────────────────────────────────────────────

/**
 * Query the teaching facet index.
 *
 * @param {Map<string, object>} index - from createTeachingFacetIndex().getIndex()
 * @param {object} filters - per-type-domain filters (all optional):
 *   {
 *     groupType?,       // filter by groupType
 *     facetKey?,        // grammarFill: matches if facetKeys contains this value
 *     blankType?,       // grammarFill
 *     role?,            // grammarFill
 *     roleFacet?,       // sevenChoices
 *     positionFacet?,   // sevenChoices
 *     mechanismFacet?,  // sevenChoices
 *     pos?,             // cloze
 *     signatureFacet?,  // cloze
 *     skill?,           // reading (skill.primary)
 *     secondarySkill?,  // reading (skill.secondary)
 *   }
 * @returns {Array<{groupId, groupType, facets}>}
 *   Empty filter returns all analyzed groups. Filters AND together.
 */
export function queryGroupsByTeaching(index, filters = {}) {
  const results = []

  for (const [groupId, facets] of index) {
    if (!matchesFacetFilters(facets, filters)) continue
    results.push({ groupId, groupType: facets.groupType, facets })
  }

  return results
}

function matchesFacetFilters(facets, filters) {
  if (filters.groupType != null && facets.groupType !== filters.groupType) return false

  // grammarFill
  if (filters.facetKey != null && !facets.facetKeys?.has(filters.facetKey)) return false
  if (filters.blankType != null && !facets.blankTypes?.has(filters.blankType)) return false
  if (filters.role != null && !facets.roles?.has(filters.role)) return false

  // sevenChoices
  if (filters.roleFacet != null && !facets.roleFacets?.has(filters.roleFacet)) return false
  if (filters.positionFacet != null && !facets.positionFacets?.has(filters.positionFacet)) return false
  if (filters.mechanismFacet != null && !facets.mechanismFacets?.has(filters.mechanismFacet)) return false

  // cloze
  if (filters.pos != null && !facets.pos?.has(filters.pos)) return false
  if (filters.signatureFacet != null && !facets.signatureFacets?.has(filters.signatureFacet)) return false

  // reading
  if (filters.skill != null && !facets.skills?.has(filters.skill)) return false
  if (filters.secondarySkill != null && !facets.secondarySkills?.has(filters.secondarySkill)) return false

  // grammarFill verb axes (I16·C)
  if (filters.tense != null && !facets.tenses?.has(filters.tense)) return false
  if (filters.voice != null && !facets.voices?.has(filters.voice)) return false
  if (filters.agreement != null && !facets.agreements?.has(filters.agreement)) return false

  return true
}

// ─── Step 3: Route factory ────────────────────────────────────────────────────

/**
 * Route factory for the teaching facet endpoint.
 *
 * Requires context to expose:
 *   - context.getTeachingFacetIndex() → Map<groupId, GroupTeachingFacets>
 *   - context.sendJson(response, status, body)
 *
 * Endpoint: GET /api/teaching-facets
 * Response: { coverage: 'analyzed-only', groups: { [groupId]: GroupTeachingFacets } }
 */
// Query params the endpoint understands (I16·C wires these into the existing
// queryGroupsByTeaching; no params → all analyzed groups, unchanged from #180).
const FILTER_PARAM_KEYS = [
  'groupType',
  'facetKey',
  'blankType',
  'role',
  'roleFacet',
  'positionFacet',
  'mechanismFacet',
  'pos',
  'signatureFacet',
  'skill',
  'secondarySkill',
  'tense',
  'voice',
  'agreement',
]

function parseTeachingFacetFilters(searchParams) {
  const filters = {}
  if (!searchParams) return filters
  for (const key of FILTER_PARAM_KEYS) {
    const value = searchParams.get(key)
    if (value != null && value !== '') filters[key] = value
  }
  return filters
}

export function createTeachingFacetRoutes() {
  return [
    defineRoute('GET', /^\/api\/teaching-facets$/, ({ response, url, context }) => {
      const indexMap = context.getTeachingFacetIndex()
      const filters = parseTeachingFacetFilters(url?.searchParams)
      const matched = queryGroupsByTeaching(indexMap, filters)

      const groups = {}
      for (const { groupId, facets } of matched) {
        groups[groupId] = serializeFacets(facets)
      }
      context.sendJson(response, 200, {
        coverage: 'analyzed-only',
        groups,
      })
    }),
  ]
}

function serializeFacets(facets) {
  const out = { groupType: facets.groupType }

  // grammarFill
  if (facets.facetKeys?.size) out.facetKeys = [...facets.facetKeys]
  if (facets.blankTypes?.size) out.blankTypes = [...facets.blankTypes]
  if (facets.roles?.size) out.roles = [...facets.roles]

  // sevenChoices
  if (facets.roleFacets?.size) out.roleFacets = [...facets.roleFacets]
  if (facets.positionFacets?.size) out.positionFacets = [...facets.positionFacets]
  if (facets.mechanismFacets?.size) out.mechanismFacets = [...facets.mechanismFacets]

  // cloze
  if (facets.pos?.size) out.pos = [...facets.pos]
  if (facets.signatureFacets?.size) out.signatureFacets = [...facets.signatureFacets]

  // reading
  if (facets.skills?.size) out.skills = [...facets.skills]
  if (facets.secondarySkills?.size) out.secondarySkills = [...facets.secondarySkills]

  // grammarFill verb axes (I16·C) — only present on grammar-fill groups with a sidecar
  if (facets.tenses?.size) out.tenses = [...facets.tenses]
  if (facets.voices?.size) out.voices = [...facets.voices]
  if (facets.agreements?.size) out.agreements = [...facets.agreements]

  return out
}
