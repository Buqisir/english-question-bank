/**
 * Batch backfill orchestrator for topic labels.
 *
 * Pure orchestration — all dependencies are injected so the function
 * can be tested without a real DB or real DeepSeek calls.
 *
 * @param {Object} options
 * @param {() => string[] | { unlabeled: string[], skipped: number }} options.listUnlabeledGroupIds
 *   Returns either an array of unlabeled group IDs, or an object { unlabeled, skipped }
 *   where skipped is the count of already-labeled groups that were excluded.
 * @param {(id: string, apiKey: string, model: string) => Promise<{ topicLabels: any[] }>} options.classify
 *   Classify-only fn (generate labels, no persist). Injected; in production =
 *   generateTopicLabelsByQuestionGroup.
 * @param {(id: string, topicLabels: any[]) => any} options.bind
 *   Persist-only fn. Injected; in production = bindTopicLabelsToQuestionGroup.
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {number} [options.limit] Optional max number of groups to process.
 * @returns {Promise<{ processed: number, labeled: number, skipped: number, failed: Array<{ id: string, error: string }> }>}
 */
export async function backfillTopicLabels({ listUnlabeledGroupIds, classify, bind, apiKey, model, limit }) {
  const raw = await listUnlabeledGroupIds()

  let unlabeledIds
  let skipped

  if (Array.isArray(raw)) {
    unlabeledIds = raw
    skipped = 0
  } else {
    unlabeledIds = raw.unlabeled
    skipped = raw.skipped || 0
  }

  const ids = limit != null ? unlabeledIds.slice(0, limit) : unlabeledIds

  let labeled = 0
  const failedList = []

  for (const id of ids) {
    try {
      const result = await classify(id, apiKey, model)
      await bind(id, result.topicLabels)
      labeled++
    } catch (err) {
      failedList.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    processed: ids.length,
    labeled,
    skipped,
    failed: failedList,
  }
}
