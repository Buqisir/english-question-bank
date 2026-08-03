import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  ensureCanonicalPublicationDatabaseShape,
} from '../../server/paper-canonical/publication.mjs'
import {
  loadCanonicalSourceAssetRepresentation,
} from '../../server/paper-canonical/sourceAssetRepresentation.mjs'

const DEFAULT_PAPER_ID = 'paper-2026-i'
const DEFAULT_STORE = path.join(
  'test-fixtures',
  'paper-canonical',
  'publications',
  'ticket-32-remaining-v1',
  'store',
)

function dbGroupType(asset, group) {
  if (group.groupType === 'sevenChoices') return 'seven_choices'
  if (group.groupType === 'grammarFill') return 'grammar_cloze'
  if (group.groupType !== 'writing') return group.groupType
  const taskType = asset.content?.writingTasks?.[group.writingTaskId]?.taskType
  return taskType === 'continuation' ? 'continuation' : 'writing'
}

function passageText(asset, group) {
  const paragraphs = Array.isArray(group.passage?.paragraphs)
    ? group.passage.paragraphs
    : []
  const text = paragraphs
    .map((paragraph) => String(paragraph?.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
  if (text) return text
  const task = asset.content?.writingTasks?.[group.writingTaskId]
  return String(task?.materialText || task?.instruction || group.title || '').trim()
}

/**
 * Seeds a throwaway question-bank DB and paper-assets root from one already
 * confirmed, immutable Canonical Publication. Browser E2E tests use this
 * instead of inventing raw printable groups that the public draft seam must
 * now reject.
 */
export function seedConfirmedCanonicalDraftFixture({
  repositoryRoot,
  bankDbPath,
  paperAssetsDir,
  paperId = DEFAULT_PAPER_ID,
  groupIds: requestedGroupIds = null,
  titlesByGroupId = {},
}) {
  const sourceStore = path.join(repositoryRoot, DEFAULT_STORE)
  const sourceIndex = new DatabaseSync(
    path.join(sourceStore, 'publication.sqlite'),
    { readOnly: true },
  )
  const publicationRows = sourceIndex
    .prepare(`
      SELECT paper_id, version_name, source_asset_version,
             publication_digest, is_current, created_at
      FROM canonical_paper_publications
      WHERE paper_id = ?
      ORDER BY source_asset_version
    `)
    .all(paperId)
  sourceIndex.close()
  const current = publicationRows.find((row) => row.is_current === 1)
  if (!current) throw new Error(`Confirmed Canonical fixture is missing ${paperId}`)

  mkdirSync(paperAssetsDir, { recursive: true })
  cpSync(
    path.join(sourceStore, paperId),
    path.join(paperAssetsDir, paperId),
    { recursive: true },
  )

  const versionDir = path.join(
    paperAssetsDir,
    paperId,
    'versions',
    current.version_name,
  )
  const sourceAsset = JSON.parse(
    readFileSync(path.join(versionDir, 'paper-asset.json'), 'utf8'),
  )
  const { asset } = loadCanonicalSourceAssetRepresentation({
    sourceAsset,
    versionDir,
    label: `${paperId} confirmed E2E source`,
    reject(message) {
      throw new Error(message)
    },
  })

  const availableGroups = Object.values(asset.content?.groups || {})
  const availableById = new Map(
    availableGroups.map((group) => [group.groupId, group]),
  )
  const groupIds = requestedGroupIds || availableGroups.map((group) => group.groupId)
  if (
    groupIds.length === 0
    || new Set(groupIds).size !== groupIds.length
    || groupIds.some((groupId) => !availableById.has(groupId))
  ) throw new Error('Confirmed Canonical E2E group selection is invalid')

  const db = new DatabaseSync(bankDbPath)
  db.exec(readFileSync(path.join(repositoryRoot, 'data/sql/schema.sql'), 'utf8'))
  ensureCanonicalPublicationDatabaseShape(db)
  const insertPublication = db.prepare(`
    INSERT INTO canonical_paper_publications (
      paper_id, version_name, source_asset_version,
      publication_digest, is_current, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const row of publicationRows) {
    insertPublication.run(
      row.paper_id,
      row.version_name,
      row.source_asset_version,
      row.publication_digest,
      row.is_current,
      row.created_at,
    )
  }

  const sourceId = `source-e2e-${paperId}`
  db.prepare(`
    INSERT INTO sources (
      id, source_type, year, region, paper_name, section, file_ref, note
    ) VALUES (?, 'self_made', 2026, 'E2E', ?, '整卷', ?, ?)
  `).run(
    sourceId,
    asset.paper?.title || paperId,
    `paper-assets/${paperId}/versions/${current.version_name}/paper-asset.json`,
    'confirmed Canonical browser fixture',
  )
  const insertPassage = db.prepare(`
    INSERT INTO passages (
      id, source_id, title, material_text, summary,
      theme, discourse_type, difficulty
    ) VALUES (?, ?, ?, ?, ?, '人与社会', NULL, 'medium')
  `)
  const insertGroup = db.prepare(`
    INSERT INTO question_groups (
      id, passage_id, group_type, title, instruction,
      display_order, default_score, difficulty, note
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 'medium', 'confirmed Canonical browser fixture')
  `)
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id, group_id, question_no, question_type, stem, answer,
      explanation, difficulty, score, display_order, note
    ) VALUES (?, ?, ?, 'Canonical E2E', ?, ?, '', 'medium', 1, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const [groupIndex, groupId] of groupIds.entries()) {
    const group = availableById.get(groupId)
    const passageId = `passage-e2e-${groupId}`
    const title = titlesByGroupId[groupId] || group.title || groupId
    const material = passageText(asset, group) || title
    insertPassage.run(passageId, sourceId, title, material, title)
    insertGroup.run(
      groupId,
      passageId,
      dbGroupType(asset, group),
      title,
      title,
      groupIndex + 1,
    )
    for (const [questionIndex, questionId] of (group.questionIds || []).entries()) {
      const question = asset.content.questions?.[questionId]
      if (!question) throw new Error(`Confirmed Canonical fixture is missing ${questionId}`)
      const answer = asset.answerKey?.answers?.[questionId]?.answer || ''
      insertQuestion.run(
        questionId,
        groupId,
        String(question.questionNo ?? questionIndex + 1),
        String(question.stem ?? question.blankId ?? question.questionNo ?? questionId),
        String(answer),
        questionIndex + 1,
      )
      for (const [optionIndex, option] of (question.options || []).entries()) {
        insertOption.run(
          `${questionId}-${option.label}`,
          questionId,
          option.label,
          option.text,
          optionIndex + 1,
        )
      }
    }
  }
  db.close()

  return Object.freeze({ paperId, groupIds: Object.freeze([...groupIds]) })
}
