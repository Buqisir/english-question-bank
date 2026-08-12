/**
 * topic-driver.mjs — topic-label backfill for 12 新课标 真题 (108 groups).
 *
 * Modes:
 *   node topic-driver.mjs list
 *     Print each group's id, paperName, groupType (total must be 108 rows).
 *     Scoped SQL: source_type='real_exam' AND year BETWEEN 2020 AND 2025.
 *     Read-only DB.
 *
 *   node topic-driver.mjs list-unlabeled
 *     Print each group WITHOUT any topic label (id, paperName, groupType).
 *     Backfill scope for papers imported after the original 108-group run.
 *     Read-only DB.
 *
 *   node topic-driver.mjs build <groupId>
 *     Print JSON.stringify(buildTopicLabelMessages(detail), null, 2).
 *     This is the prompt the operator feeds to the analysis session.
 *
 *   node topic-driver.mjs persist <groupId> <rawLabelsJsonPath>
 *     Read raw label JSON from file, normalizeTopicLabelPayload, bindTopicLabelsToQuestionGroup.
 *     IMPORTANT: stop the API before running persist (SQLite write lock).
 *
 * Usage notes:
 *   - list / build are read-only and safe to run while the API is up.
 *   - persist requires the API to be stopped first:
 *       lsof -ti :8787 | xargs kill
 *     Then after persist, restart the API to refresh caches.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const DB_PATH = path.join(projectRoot, 'data/question-bank.sqlite')

// Defensive arg parsing — parse argv[2] and argv[3] as strings (not objects)
const mode = String(process.argv[2] || '').trim()
const arg3 = String(process.argv[3] || '').trim()
const arg4 = String(process.argv[4] || '').trim()

const SCOPED_SQL = `
  SELECT qg.id, s.paper_name, qg.group_type
  FROM question_groups qg
  JOIN passages p ON qg.passage_id = p.id
  JOIN sources s ON p.source_id = s.id
  WHERE s.source_type = 'real_exam'
    AND s.year BETWEEN 2020 AND 2025
  ORDER BY s.year, s.paper_name, qg.id
`

const UNLABELED_SQL = `
  SELECT qg.id, s.paper_name, qg.group_type
  FROM question_groups qg
  JOIN passages p ON qg.passage_id = p.id
  JOIN sources s ON p.source_id = s.id
  LEFT JOIN question_group_topic_labels l ON l.question_group_id = qg.id
  WHERE l.question_group_id IS NULL
  ORDER BY s.year, s.paper_name, qg.id
`

if (mode === 'list') {
  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  try {
    const rows = db.prepare(SCOPED_SQL).all()
    for (const row of rows) {
      console.log(`${row.id}\t${row.paper_name}\t${row.group_type}`)
    }
    if (rows.length !== 108) {
      console.error(`WARNING: expected 108 rows, got ${rows.length}`)
    }
  } finally {
    db.close()
  }
} else if (mode === 'list-unlabeled') {
  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  try {
    const rows = db.prepare(UNLABELED_SQL).all()
    for (const row of rows) {
      console.log(`${row.id}\t${row.paper_name}\t${row.group_type}`)
    }
    console.error(`${rows.length} unlabeled groups`)
  } finally {
    db.close()
  }
} else if (mode === 'build') {
  if (!arg3) {
    console.error('usage: topic-driver.mjs build <groupId>')
    process.exit(2)
  }
  const groupId = arg3
  const { getQuestionGroupDetail, buildTopicLabelMessages } = await import('../../server/api.mjs')
  const detail = getQuestionGroupDetail(groupId)
  if (!detail) {
    console.error(`ERROR: group not found: ${groupId}`)
    process.exit(1)
  }
  const messages = buildTopicLabelMessages(detail)
  console.log(JSON.stringify(messages, null, 2))
} else if (mode === 'persist') {
  if (!arg3 || !arg4) {
    console.error('usage: topic-driver.mjs persist <groupId> <rawLabelsJsonPath>')
    process.exit(2)
  }
  const groupId = arg3
  const rawPath = path.resolve(arg4)
  let raw
  try {
    raw = JSON.parse(readFileSync(rawPath, 'utf8'))
  } catch (e) {
    console.error(`ERROR: could not read/parse ${rawPath}: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
  const { normalizeTopicLabelPayload, bindTopicLabelsToQuestionGroup } = await import('../../server/api.mjs')
  const normalized = normalizeTopicLabelPayload(raw)
  if (!normalized || normalized.length === 0) {
    console.error(`ERROR: normalizeTopicLabelPayload returned empty — no valid labels in ${rawPath}`)
    process.exit(1)
  }
  const result = bindTopicLabelsToQuestionGroup(groupId, normalized)
  console.log(JSON.stringify(result, null, 2))
} else {
  console.error('usage: topic-driver.mjs list|build <groupId>|persist <groupId> <rawLabelsJsonPath>')
  process.exit(2)
}
