/**
 * I16·C — batch backfill orchestrator for grammar-fill verb profiles.
 *
 * Pure orchestration — all dependencies injected, so it tests without a real
 * filesystem or DeepSeek. Mirrors backfillTopicLabels.mjs (#181).
 *
 * @param {object} options
 * @param {() => Promise<{ groups: Array<{ paperId, groupId, blanks }>, skipped?: number }> | Array}
 *   options.listGroups
 *   Returns grammar-fill groups that have ≥1 UNPROFILED finite-verb blank
 *   (idempotency is the lister's job: already-profiled blanks are excluded).
 *   May return a bare array (skipped defaults to 0) or { groups, skipped }.
 * @param {(group) => Promise<Record<string, object>>} options.classify
 *   Classify-only: returns { questionId: {tense,voice,agreement,method} } for the
 *   group's unprofiled finite blanks. No persistence.
 * @param {(group, profiles) => any} options.persist
 *   Persist-only: writes the sidecar for the group.
 * @param {number} [options.limit]
 * @returns {Promise<{ processed, profiledGroups, profiledBlanks, skipped, failed }>}
 */
export async function backfillVerbProfiles({ listGroups, classify, persist, limit }) {
  const raw = await listGroups()

  let groups
  let skipped
  if (Array.isArray(raw)) {
    groups = raw
    skipped = 0
  } else {
    groups = raw.groups || []
    skipped = raw.skipped || 0
  }

  const work = limit != null ? groups.slice(0, limit) : groups

  let profiledGroups = 0
  let profiledBlanks = 0
  const failed = []

  for (const group of work) {
    try {
      const profiles = await classify(group)
      await persist(group, profiles)
      profiledGroups += 1
      profiledBlanks += Object.keys(profiles || {}).length
    } catch (err) {
      failed.push({
        groupId: group?.groupId,
        paperId: group?.paperId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    processed: work.length,
    profiledGroups,
    profiledBlanks,
    skipped,
    failed,
  }
}
