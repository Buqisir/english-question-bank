import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  assertPaperImportAnalysisSidecars,
  beginPaperImportPublish,
  computeNextPaperAssetVersion,
  cleanupPaperImportTempArtifacts,
  commitPaperImportLatestSwap,
  removePaperImportVersion,
  recoverPaperImportLatestSwap,
  rollbackPaperImportLatestSwap,
  swapPaperImportLatest,
  writePaperImportVersion,
} from './storage.mjs'
import {
  getReadingChoiceGroups,
  makePaperImportIssue,
  makePublicValidationReport,
  validatePaperImportPackage,
} from './validator.mjs'
import { captureDocxSourceMedia } from './docxSourceMedia.mjs'
import {
  admitCanonicalPaperImport,
  createFileSystemCanonicalPublicationStore,
  loadCanonicalOnlyConsumers,
  recordCanonicalPublicationCurrent,
  selectCanonicalPublicationCurrent,
} from '../paper-canonical/publication.mjs'
import {
  isTrustedDocxCanonicalImportRequest,
  trustedDocxPublicationSourceAsset,
} from '../paper-canonical/trustedDocxCanonicalRequest.mjs'
import {
  docxPairPublicationSourceAsset,
  isDocxPairCanonicalImportRequest,
} from '../paper-canonical/docxPairCanonicalRequest.mjs'
import {
  isNck1MaterializationCanonicalImportRequest,
  nck1MaterializationPublicationSourceAsset,
} from '../paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  buildNck1CompatibilityPackage,
  buildNck1ReviewProjection,
} from '../import-review/revisionProjection.mjs'
import {
  canonicalizeVisibleEnglishTypography,
} from '../../shared/paper-canonical/visibleTypography.mjs'

const groupTypeMap = {
  reading: 'reading',
  cloze: 'cloze',
  sevenChoices: 'seven_choices',
  grammarFill: 'grammar_cloze',
  listening: 'listening',
  writing: 'writing',
}

const sourceTypeMap = {
  真题: 'real_exam',
  模拟题: 'mock_exam',
  自编题: 'self_made',
  校本题: 'other',
}

const difficultyMap = {
  低: 'low',
  中: 'medium',
  高: 'high',
}

function stableTail(id) {
  return String(id || '').replace(/^group-/, '').replace(/[^a-zA-Z0-9-]/g, '-')
}

function findSectionTitleForGroup(asset, groupId) {
  for (const part of asset.layoutTree?.parts || []) {
    for (const section of part.sections || []) {
      if ((section.groups || []).some((group) => group.groupId === groupId)) {
        return `${part.title} / ${section.title}`
      }
    }
  }
  return ''
}

function getGroupMaterialText(group) {
  if (group.passage?.paragraphs?.length) {
    return group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n\n')
  }
  if (group.clozeText) return group.clozeText
  if (group.grammarText) return group.grammarText
  return ''
}

function getQuestionType(groupType) {
  if (groupType === 'reading') return '阅读理解'
  if (groupType === 'cloze') return '完形填空'
  if (groupType === 'sevenChoices') return '七选五'
  if (groupType === 'grammarFill') return '语法填空'
  if (groupType === 'listening') return '听力'
  if (groupType === 'writing') return '写作'
  return '其他'
}

function getDefaultScore(group, answers) {
  const scores = (group.questionIds || [])
    .map((questionId) => Number(answers?.[questionId]?.score))
    .filter((score) => Number.isFinite(score) && score > 0)
  return scores.length > 0 ? scores[0] : 0
}

function upsertQuestionGroupTags(db, groupId, tags) {
  db.prepare("DELETE FROM tag_links WHERE target_type = 'question_group' AND target_id = ?").run(groupId)
  for (const tagName of tags.filter(Boolean)) {
    const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)
    const tagId = existing?.id || `tag-${randomUUID()}`
    if (existing?.id) {
      db.prepare("UPDATE tags SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(tagId)
    } else {
      db.prepare(
        `
        INSERT INTO tags (id, name, category, description, is_active, updated_at)
        VALUES (?, ?, '导入标签', '', 1, datetime('now'))
        `,
      ).run(tagId, tagName)
    }
    db.prepare(
      `
      INSERT OR IGNORE INTO tag_links (id, tag_id, target_type, target_id)
      VALUES (?, ?, 'question_group', ?)
      `,
    ).run(`tl-${randomUUID()}`, tagId, groupId)
  }
}

function getLatestDbAssetVersion(db, paperId) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper_asset_versions'").get()
  if (!table) return 0
  const row = db.prepare('SELECT MAX(asset_version) AS version FROM paper_asset_versions WHERE paper_id = ?').get(paperId)
  const version = Number(row?.version)
  return Number.isInteger(version) && version > 0 ? version : 0
}

function getPublishedDbAssetVersions(db, paperId) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper_asset_versions'",
  ).get()
  if (!table) return []
  return db.prepare(
    `
    SELECT asset_version
    FROM paper_asset_versions
    WHERE paper_id = ? AND status = 'published'
    ORDER BY asset_version
    `,
  ).all(paperId).map(({ asset_version: version }) => Number(version))
}

function getCurrentCanonicalPublication(db, paperId) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'canonical_paper_publications'",
  ).get()
  if (!table) return null
  const row = db.prepare(
    `
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)
  if (!row) return null
  return {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: Number(row.source_asset_version),
    publicationDigest: row.publication_digest,
  }
}

export function recoverInterruptedPaperImportPublish({
  db,
  paperAssetsDir,
  paperId,
  validateCommittedAssets = null,
}) {
  const current = getCurrentCanonicalPublication(db, paperId)
  return recoverPaperImportLatestSwap({
    paperAssetsDir,
    paperId,
    publishedVersions: getPublishedDbAssetVersions(db, paperId),
    currentCanonicalVersion: current?.sourceAssetVersion ?? null,
    validateCommitted(targetVersion) {
      if (!current || current.sourceAssetVersion !== targetVersion) {
        throw new Error(`Committed canonical Publication is missing for ${paperId} v${targetVersion}`)
      }
      loadCanonicalOnlyConsumers({
        ref: current,
        store: createFileSystemCanonicalPublicationStore({
          rootDir: paperAssetsDir,
          db,
        }),
      })
      if (validateCommittedAssets) validateCommittedAssets(targetVersion)
    },
  })
}

function computeNextPublishVersion({ db, paperAssetsDir, paperId }) {
  const diskNext = computeNextPaperAssetVersion(paperAssetsDir, paperId)
  const dbNext = getLatestDbAssetVersion(db, paperId) + 1
  return Math.max(diskNext, dbNext)
}

export function ensurePaperImportDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_asset_versions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      asset_version INTEGER NOT NULL,
      version_name TEXT NOT NULL,
      version_dir TEXT NOT NULL,
      source_file_sha256 TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(paper_id, asset_version)
    );

    CREATE TABLE IF NOT EXISTS paper_import_runs (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      asset_version INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('validated', 'published', 'failed')),
      validation_report_json TEXT NOT NULL DEFAULT '{}',
      publish_report_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_paper_asset_versions_paper
      ON paper_asset_versions(paper_id, asset_version);
    CREATE INDEX IF NOT EXISTS idx_paper_import_runs_paper
      ON paper_import_runs(paper_id, asset_version);
  `)
}

function upsertPaperAssetToDb(db, packageData, version, options = {}) {
  const { paperAsset, answerKey, importMeta, readingAnalysis } = packageData
  const paper = paperAsset.paper
  const answers = answerKey.answers || {}
  const sourceType = sourceTypeMap[importMeta.paper.sourceType] || 'other'
  const defaultTags = Array.isArray(importMeta.paper.defaultTags) ? importMeta.paper.defaultTags : []

  ensurePaperImportDatabaseShape(db)

  for (const [index, group] of Object.values(paperAsset.content.groups).entries()) {
    const groupMeta = importMeta.groups?.[group.groupId] || {}
    const tail = stableTail(group.groupId)
    const sourceId = `src-${tail}`
    const passageId = `passage-${tail}`
    const dbGroupType = groupTypeMap[group.groupType] || 'other'
    const difficulty = difficultyMap[groupMeta.difficulty] || 'medium'
    const sectionTitle = findSectionTitleForGroup(paperAsset, group.groupId)
    const materialText = getGroupMaterialText(group)
    const summary =
      groupMeta.summary ||
      readingAnalysis?.groups?.[group.groupId]?.overview ||
      group.title ||
      paper.title
    const groupTitle = groupMeta.displayTitleOverride || group.title
    const defaultScore = getDefaultScore(group, answers)

    db.prepare(
      `
      INSERT INTO sources (id, source_type, year, region, paper_name, section, file_ref, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        source_type = excluded.source_type,
        year = excluded.year,
        region = excluded.region,
        paper_name = excluded.paper_name,
        section = excluded.section,
        file_ref = excluded.file_ref,
        note = excluded.note,
        updated_at = datetime('now')
      `,
    ).run(
      sourceId,
      sourceType,
      importMeta.paper.year,
      importMeta.paper.region,
      importMeta.paper.paperName,
      sectionTitle,
      `paper-assets/${paper.paperId}/latest/paper-asset.json`,
      `C7 whole-paper import v${version}`,
    )

    db.prepare(
      `
      INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, word_count, difficulty, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        source_id = excluded.source_id,
        title = excluded.title,
        material_text = excluded.material_text,
        summary = excluded.summary,
        theme = excluded.theme,
        word_count = excluded.word_count,
        difficulty = excluded.difficulty,
        note = excluded.note,
        updated_at = datetime('now')
      `,
    ).run(
      passageId,
      sourceId,
      groupTitle,
      materialText,
      summary,
      '',
      // r1-genre-truth: discourse_type is real five-class genre truth (记叙/说明/
      // 议论/应用/新闻), not the group's question-type name. New passages get NULL
      // here (never group.groupType — that was the bug: it collided with the
      // group_type column and got overwritten as fake genre data); the ON CONFLICT
      // branch above no longer touches discourse_type at all, so re-publishing an
      // existing passage never stomps its real genre classification. New passages
      // need a genre-truth backfill pass (see docs/import/agent-runbook.md).
      null,
      materialText.split(/\s+/).filter(Boolean).length,
      difficulty,
      `paperId=${paper.paperId}; groupId=${group.groupId}; assetVersion=${version}`,
    )

    db.prepare(
      `
      INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        passage_id = excluded.passage_id,
        group_type = excluded.group_type,
        title = excluded.title,
        instruction = excluded.instruction,
        display_order = excluded.display_order,
        default_score = excluded.default_score,
        difficulty = excluded.difficulty,
        note = excluded.note,
        updated_at = datetime('now')
      `,
    ).run(
      group.groupId,
      passageId,
      dbGroupType,
      groupTitle,
      sectionTitle,
      index + 1,
      defaultScore,
      difficulty,
      `C7 imported from ${paper.paperId} v${version}`,
    )

    db.prepare('DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE group_id = ?)').run(group.groupId)
    db.prepare('DELETE FROM questions WHERE group_id = ?').run(group.groupId)

    for (const [questionIndex, questionId] of (group.questionIds || []).entries()) {
      const question = paperAsset.content.questions[questionId]
      if (!question) continue
      const answer = answers[questionId]?.answer || paperAsset.answerKey?.answers?.[questionId]?.answer || ''
      const score = Number(answers[questionId]?.score || defaultScore || 0)
      db.prepare(
        `
        INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        question.questionId,
        group.groupId,
        String(question.questionNo),
        getQuestionType(group.groupType),
        question.stem || '',
        answer,
        '',
        difficulty,
        score,
        questionIndex + 1,
        `paperId=${paper.paperId}; assetVersion=${version}`,
      )
      for (const [optionIndex, option] of (question.options || []).entries()) {
        db.prepare(
          `
          INSERT INTO options (id, question_id, label, content, display_order)
          VALUES (?, ?, ?, ?, ?)
          `,
        ).run(`${question.questionId}-${option.label}`, question.questionId, option.label, option.text || '', optionIndex + 1)
      }
    }

    upsertQuestionGroupTags(db, group.groupId, [
      ...defaultTags,
      ...(Array.isArray(groupMeta.tags) ? groupMeta.tags : []),
    ])
  }

  db.prepare(
    `
    INSERT INTO paper_asset_versions (id, paper_id, asset_version, version_name, version_dir, source_file_sha256, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')
    `,
  ).run(
    `pav-${paper.paperId}-v${version}`,
    paper.paperId,
    version,
    `v${version}`,
    path.join('app/public/paper-assets', paper.paperId, 'versions', `v${version}`),
    packageData.sourceDocx?.sha256 || packageData.sourceAssetDigest,
  )
}

function getSevenChoicesGroups(asset) {
  const groups = asset?.content?.groups || {}
  return Object.values(groups)
    .filter((group) => group?.groupType === 'sevenChoices')
    .map((group) => ({
      groupId: group.groupId,
      title: group.title || '七选五',
      defaultQuestionId: group.questionIds?.[0] || null,
    }))
}

function getClozeGroups(asset) {
  const groups = asset?.content?.groups || {}
  return Object.values(groups)
    .filter((group) => group?.groupType === 'cloze')
    .map((group) => ({
      groupId: group.groupId,
      title: group.title || '完形填空',
      defaultQuestionId: group.questionIds?.[0] || null,
    }))
}

function getGrammarFillGroups(asset) {
  const groups = asset?.content?.groups || {}
  return Object.values(groups)
    .filter((group) => group?.groupType === 'grammarFill')
    .map((group) => ({
      groupId: group.groupId,
      title: group.title || '语法填空',
      defaultQuestionId: group.questionIds?.[0] || null,
    }))
}

function getWritingGroups(asset) {
  const groups = asset?.content?.groups || {}
  return Object.values(groups)
    .filter((group) => group?.groupType === 'writing')
    .map((group) => ({
      groupId: group.groupId,
      title: group.title || '写作',
      defaultQuestionId: group.questionIds?.[0] || null,
    }))
}

function buildQaLinks(paperId, version, readingGroups, scGroups, clozeGroups, grammarFillGroups, writingGroups) {
  const readingLinks = readingGroups.map((group) => {
    const latestParams = new URLSearchParams()
    latestParams.set('view', 'paper-intelligence')
    latestParams.set('source', 'paper-asset')
    latestParams.set('paperId', paperId)
    latestParams.set('surface', 'paper')
    latestParams.set('groupId', group.groupId)
    latestParams.set('questionId', group.defaultQuestionId)

    const versionParams = new URLSearchParams(latestParams)
    versionParams.set('version', `v${version}`)

    return {
      groupId: group.groupId,
      title: group.title,
      latestHref: `?${latestParams.toString()}`,
      versionHref: `?${versionParams.toString()}`,
    }
  })

  const scLinks = (scGroups || []).map((group) => {
    const latestParams = new URLSearchParams()
    latestParams.set('view', 'paper-intelligence')
    latestParams.set('source', 'paper-asset')
    latestParams.set('paperId', paperId)
    latestParams.set('surface', 'paper')
    latestParams.set('groupId', group.groupId)
    latestParams.set('questionId', group.defaultQuestionId)

    const versionParams = new URLSearchParams(latestParams)
    versionParams.set('version', `v${version}`)

    return {
      groupId: group.groupId,
      title: group.title,
      latestHref: `?${latestParams.toString()}`,
      versionHref: `?${versionParams.toString()}`,
    }
  })

  const clozeLinks = (clozeGroups || []).map((group) => {
    const latestParams = new URLSearchParams()
    latestParams.set('view', 'paper-intelligence')
    latestParams.set('source', 'paper-asset')
    latestParams.set('paperId', paperId)
    latestParams.set('surface', 'paper')
    latestParams.set('groupId', group.groupId)
    latestParams.set('questionId', group.defaultQuestionId)

    const versionParams = new URLSearchParams(latestParams)
    versionParams.set('version', `v${version}`)

    return {
      groupId: group.groupId,
      title: group.title,
      latestHref: `?${latestParams.toString()}`,
      versionHref: `?${versionParams.toString()}`,
    }
  })

  const gfLinks = (grammarFillGroups || []).map((group) => {
    const latestParams = new URLSearchParams()
    latestParams.set('view', 'paper-intelligence')
    latestParams.set('source', 'paper-asset')
    latestParams.set('paperId', paperId)
    latestParams.set('surface', 'paper')
    latestParams.set('groupId', group.groupId)
    latestParams.set('questionId', group.defaultQuestionId)

    const versionParams = new URLSearchParams(latestParams)
    versionParams.set('version', `v${version}`)

    return {
      groupId: group.groupId,
      title: group.title,
      latestHref: `?${latestParams.toString()}`,
      versionHref: `?${versionParams.toString()}`,
    }
  })

  const wLinks = (writingGroups || []).map((group) => {
    const latestParams = new URLSearchParams()
    latestParams.set('view', 'paper-intelligence')
    latestParams.set('source', 'paper-asset')
    latestParams.set('paperId', paperId)
    latestParams.set('surface', 'paper')
    latestParams.set('groupId', group.groupId)

    const versionParams = new URLSearchParams(latestParams)
    versionParams.set('version', `v${version}`)

    return {
      groupId: group.groupId,
      title: group.title,
      latestHref: `?${latestParams.toString()}`,
      versionHref: `?${versionParams.toString()}`,
    }
  })

  return [...readingLinks, ...scLinks, ...clozeLinks, ...gfLinks, ...wLinks]
}

function canonicalAdmissionFailure(admission) {
  return {
    ok: false,
    status: 'canonical_admission_failed',
    validation: null,
    publish: null,
    canonicalAdmission: {
      disposition: admission.disposition,
      diagnostics: admission.diagnostics,
      artifacts: admission.artifacts,
    },
  }
}

function bytesSha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function importedFamily(group, paperAsset) {
  if (group.groupType === 'reading') return 'reading'
  if (group.groupType === 'sevenChoices') return 'seven-choices'
  if (group.groupType === 'cloze') return 'cloze'
  if (group.groupType === 'grammarFill') return 'grammar-fill'
  if (group.groupType === 'listening') return 'inactive-listening'
  if (group.groupType !== 'writing') return null
  const task = paperAsset.content.writingTasks?.[group.writingTaskId]
  if (task?.taskType === 'application') return 'application-writing'
  if (task?.taskType === 'continuation') return 'continuation-writing'
  return null
}

function inlineText(inlines) {
  return (inlines || [])
    .filter((inline) => inline?.kind === 'text')
    .map((inline) => inline.text || '')
    .join('')
}

function importedContentSignature(group, paperAsset) {
  const associations = (paperAsset.sources?.docx?.shapeAssociations || [])
    .filter((association) => association.groupId === group.groupId)
  return (group.passage?.paragraphs || []).map((paragraph) => {
    const association = associations.find((candidate) =>
      paragraph.text.includes(candidate.placeholderMarker))
    return association
      ? {
          kind: 'figure',
          figureId: association.figureId,
          caption: canonicalizeVisibleEnglishTypography(
            association.caption || '',
          ),
        }
      : {
          kind: 'paragraph',
          nodeId: paragraph.paragraphId,
          text: canonicalizeVisibleEnglishTypography(paragraph.text),
        }
  })
}

function canonicalContentSignature(group, importedGroup, paperAsset) {
  const questionNumberByBlankId = new Map(
    (importedGroup.blankIds || []).map((blankId, index) => [
      blankId,
      paperAsset.content.questions[importedGroup.questionIds[index]]
        ?.questionNo,
    ]),
  )
  return (group.content?.blocks || []).map((block, blockIndex) => {
    if (block.kind === 'figure') {
      const media = group.media?.find(
        (candidate) => candidate.mediaId === block.mediaId,
      )
      return {
        kind: 'figure',
        figureId: String(media?.mediaId || block.mediaId || '')
          .replace(/^media:/, ''),
        caption: inlineText(block.caption),
      }
    }
    if (block.kind === 'table') {
      return {
        kind: 'table',
        rows: block.rows.map((row) =>
          row.cells.map((cell) => inlineText(cell.inlines))),
      }
    }
    const text = (block.inlines || []).map((inline) => {
      if (inline.kind === 'text') return inline.text || ''
      if (inline.kind !== 'blank_ref') return ''
      const number = questionNumberByBlankId.get(inline.blankId)
      const family = group.contractRef.familyContractId
      const usesWrappedMarker =
        ['cloze', 'grammar-fill'].includes(family)
        || (
          family === 'seven-choices'
          && importedGroup.passage?.paragraphs?.[blockIndex]?.text
            ?.includes(`__${number}__`)
        )
      return usesWrappedMarker
        ? `__${number}__`
        : String(number)
    }).join('')
    return { kind: block.kind, nodeId: block.nodeId, text }
  })
}

function importedOptions(options) {
  return (options || []).map((option) => ({
    label: option.label,
    text: canonicalizeVisibleEnglishTypography(option.text || ''),
  }))
}

function canonicalOptions(options) {
  return (options || []).map((option) => ({
    label: option.label,
    text: inlineText(option.content),
  }))
}

function semanticMismatchForGroup({
  canonicalGroup,
  importedGroup,
  paperAsset,
  sourceCapture,
}) {
  const sourceSpans = new Map(
    sourceCapture.sourceSpans.map((span) => [span.sourceSpanId, span]),
  )
  const documentInputKeys = new Map(
    sourceCapture.documents.map((document) => [
      document.documentId,
      document.inputKey,
    ]),
  )
  const groupInputKeys = new Set(
    canonicalGroup.sourceMap.entries
      .flatMap((entry) => entry.sourceSpanRefs)
      .map((sourceSpanId) => sourceSpans.get(sourceSpanId)?.documentId)
      .map((documentId) => documentInputKeys.get(documentId))
      .filter(Boolean),
  )
  const structuredSourceKey = {
    reading: 'reading_structure',
    'application-writing': 'application_writing_capture',
    'continuation-writing': 'continuation_writing_capture',
  }[canonicalGroup.contractRef.familyContractId]
  const usesReviewedStructuredSource =
    structuredSourceKey && groupInputKeys.has(structuredSourceKey)
  const family = canonicalGroup.contractRef.familyContractId
  if (
    !usesReviewedStructuredSource
    && !['application-writing', 'continuation-writing'].includes(family)
    &&
    JSON.stringify(canonicalContentSignature(
      canonicalGroup,
      importedGroup,
      paperAsset,
    ))
    !== JSON.stringify(importedContentSignature(importedGroup, paperAsset))
  ) {
    return 'content order or text'
  }
  if (family === 'reading') {
    const canonicalQuestions = new Map(
      canonicalGroup.variant.questions.map((question) => [
        question.questionId,
        question,
      ]),
    )
    const canonicalSets = new Map(
      canonicalGroup.variant.choiceOwnership.sets.map((set) => [
        set.questionId,
        set,
      ]),
    )
    for (const questionId of importedGroup.questionIds) {
      const importedQuestion = paperAsset.content.questions[questionId]
      const canonicalQuestion = canonicalQuestions.get(questionId)
      if (
        inlineText(canonicalQuestion?.stem)
          !== canonicalizeVisibleEnglishTypography(
            importedQuestion?.stem || '',
          )
        || JSON.stringify(canonicalOptions(
          canonicalSets.get(questionId)?.options,
        )) !== JSON.stringify(importedOptions(importedQuestion?.options))
      ) {
        return `stem or options for ${questionId}`
      }
    }
  }
  if (family === 'seven-choices') {
    if (
      JSON.stringify(canonicalOptions(
        canonicalGroup.variant.choiceOwnership.options,
      )) !== JSON.stringify(importedOptions(importedGroup.optionBank))
    ) {
      return 'shared A-G bank'
    }
  }
  if (family === 'cloze') {
    const canonicalSets = new Map(
      canonicalGroup.variant.choiceOwnership.sets.map((set) => [
        set.questionId,
        set,
      ]),
    )
    for (const questionId of importedGroup.questionIds) {
      if (
        JSON.stringify(canonicalOptions(
          canonicalSets.get(questionId)?.options,
        )) !== JSON.stringify(importedOptions(
          paperAsset.content.questions[questionId]?.options,
        ))
      ) {
        return `options for ${questionId}`
      }
    }
  }
  if (['application-writing', 'continuation-writing'].includes(family)) {
    const task = paperAsset.content.writingTasks?.[importedGroup.writingTaskId]
    if (
      !task
      || canonicalGroup.variant.writingTaskId !== task.writingTaskId
      || canonicalGroup.variant.wordCountRuling.target !== task.wordCountTarget
    ) {
      return 'writing task identity or word-count ruling'
    }
    if (usesReviewedStructuredSource) return null
    const blocks = canonicalGroup.content.blocks
    if (family === 'application-writing') {
      if (groupInputKeys.has('question_docx')) {
        const prompt = inlineText(
          blocks.find((block) => block.nodeId?.endsWith(':prompt'))?.inlines,
        )
        const notice = inlineText(
          blocks.find((block) => block.nodeId?.endsWith(':notice'))?.inlines,
        )
        const givenTitle = inlineText(
          blocks.find((block) => block.nodeId?.endsWith(':given:title'))?.inlines,
        )
        const expectedGiven = typeof task.applicationGiven === 'string'
          ? canonicalizeVisibleEnglishTypography(task.applicationGiven)
          : ''
        if (
          prompt !== canonicalizeVisibleEnglishTypography(task.instruction)
          || !notice.startsWith('注意')
          || !notice.includes(String(task.wordCountTarget))
          || givenTitle !== expectedGiven
        ) {
          return 'application-writing prompt'
        }
        return null
      }
      if (
        inlineText(blocks.flatMap((block) => block.inlines || []))
          !== canonicalizeVisibleEnglishTypography(
            `${task.instruction}（词数${task.wordCountTarget}左右。）`,
          )
      ) {
        return 'application-writing prompt'
      }
    }
    if (
      family === 'continuation-writing'
      && (
        inlineText(blocks[0]?.inlines)
          !== canonicalizeVisibleEnglishTypography(task.materialText)
        || JSON.stringify(blocks.slice(1).map((block) =>
          inlineText(block.inlines)))
          !== JSON.stringify(
            (task.continuationStarters || []).map(
              canonicalizeVisibleEnglishTypography,
            ),
          )
      )
    ) {
      return 'continuation material or ordered starters'
    }
  }
  return null
}

function validateCanonicalImportPackageBinding({
  admission,
  packageData,
  paperAssetBytes,
  answerKeyBytes,
  canonicalRequest,
}) {
  const captureDocuments = admission.compilation.artifacts.sourceCapture.documents
  if (isTrustedDocxCanonicalImportRequest(canonicalRequest)) {
    const packageSource = packageData.sourceDocx?.buffer
    const packageDigest = Buffer.isBuffer(packageSource)
      || packageSource instanceof Uint8Array
      ? bytesSha256(packageSource)
      : null
    const requestSource = trustedDocxPublicationSourceAsset(canonicalRequest)
    const requestDigest = requestSource ? bytesSha256(requestSource) : null
    if (
      !packageDigest
      || !requestDigest
      || packageDigest !== requestDigest
      || !captureDocuments.some(
        (document) =>
          document.inputKey === 'source_docx' && document.sha256 === packageDigest,
      )
    ) {
      return {
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_SOURCE_PACKAGE_UNBOUND',
          message: 'Canonical Source Capture does not bind the exact source_docx import file',
        }],
      }
    }
  } else if (isDocxPairCanonicalImportRequest(canonicalRequest)) {
    const packageSource = packageData.sourceDocx?.buffer
    const packageDigest = Buffer.isBuffer(packageSource)
      || packageSource instanceof Uint8Array
      ? bytesSha256(packageSource)
      : null
    const requestSource = docxPairPublicationSourceAsset(canonicalRequest)
    const requestDigest = requestSource ? bytesSha256(requestSource) : null
    if (
      !packageDigest
      || !requestDigest
      || packageDigest !== requestDigest
      || !captureDocuments.some(
        (document) =>
          document.inputKey === 'question_docx' && document.sha256 === packageDigest,
      )
    ) {
      return {
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_SOURCE_PACKAGE_UNBOUND',
          message: 'Canonical Source Capture does not bind the exact question_docx import file',
        }],
      }
    }
  } else {
    for (const [inputKey, bytes] of [
      ['paper_asset', paperAssetBytes],
      ['official_answers', answerKeyBytes],
    ]) {
      const digest = Buffer.isBuffer(bytes) ? bytesSha256(bytes) : null
      if (
        !digest
        || !captureDocuments.some(
          (document) =>
            document.inputKey === inputKey && document.sha256 === digest,
        )
      ) {
        return {
          disposition: 'unsupported',
          diagnostics: [{
            code: 'CANONICAL_IMPORT_SOURCE_PACKAGE_UNBOUND',
            message: `Canonical Source Capture does not bind the exact ${inputKey} import file`,
          }],
        }
      }
    }
  }

  const paperAsset = packageData.paperAsset
  const importedGroups = Object.values(paperAsset.content.groups)
  const activeImportedGroups = importedGroups.filter(
    (group) => group.groupType !== 'listening',
  )
  const canonicalGroups =
    admission.compilation.artifacts.canonicalPaper.questionGroups
  const canonicalById = new Map(
    canonicalGroups.map((group) => [group.identity.groupId, group]),
  )
  if (
    canonicalGroups.length !== activeImportedGroups.length
    || canonicalById.size !== activeImportedGroups.length
  ) {
    return {
      disposition: 'unsupported',
      diagnostics: [{
        code: 'CANONICAL_IMPORT_GROUP_SET_MISMATCH',
        message: 'Canonical and imported active Question Group sets differ',
      }],
    }
  }
  for (const importedGroup of activeImportedGroups) {
    const canonicalGroup = canonicalById.get(importedGroup.groupId)
    const family = importedFamily(importedGroup, paperAsset)
    const canonicalQuestionIds =
      canonicalGroup?.questionRefs?.map(({ questionId }) => questionId) || []
    if (
      !canonicalGroup
      || !family
      || canonicalGroup.contractRef.familyContractId !== family
      || JSON.stringify(canonicalQuestionIds)
        !== JSON.stringify(importedGroup.questionIds || [])
    ) {
      return {
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_GROUP_BINDING_MISMATCH',
          message: `Canonical Group does not close the imported identity and question order for ${importedGroup.groupId}`,
        }],
      }
    }
    const semanticMismatch = semanticMismatchForGroup({
      canonicalGroup,
      importedGroup,
      paperAsset,
      sourceCapture: admission.compilation.artifacts.sourceCapture,
    })
    if (semanticMismatch) {
      return {
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_SEMANTIC_MISMATCH',
          message: `Canonical Group differs from imported ${semanticMismatch}: ${importedGroup.groupId}`,
        }],
      }
    }
  }

  const activeQuestionIds = new Set(
    activeImportedGroups.flatMap((group) => group.questionIds || []),
  )
  const canonicalAssertions = new Map(
    admission.compilation.artifacts.sourceCapture.assertions.map(
      (assertion) => [assertion.questionId, assertion.answer],
    ),
  )
  for (const [questionId, answer] of Object.entries(
    packageData.answerKey.answers || {},
  )) {
    if (
      activeQuestionIds.has(questionId)
      && canonicalAssertions.get(questionId) !== answer.answer
    ) {
      return {
        disposition: 'answer_conflict',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_ANSWER_MISMATCH',
          message: `Canonical official answer differs from imported answer-key.json for ${questionId}`,
        }],
      }
    }
  }

  const importedListeningQuestionIds = new Set(
    importedGroups
      .filter((group) => group.groupType === 'listening')
      .flatMap((group) => group.questionIds || []),
  )
  const inactiveQuestionCount =
    admission.compilation.artifacts.normalizationReport
      .inactiveSourceClosures
      ?.reduce((total, closure) => total + closure.questionCount, 0) || 0
  if (
    importedListeningQuestionIds.size > 0
    && inactiveQuestionCount !== importedListeningQuestionIds.size
  ) {
    return {
      disposition: 'unsupported',
      diagnostics: [{
        code: 'CANONICAL_IMPORT_INACTIVE_BINDING_MISMATCH',
        message: 'Canonical inactive closures do not cover the imported listening question count',
      }],
    }
  }
  return null
}

function stagedCanonicalStore({ versionDir, ref }) {
  return {
    readPublishedRefs() {
      return { current: ref, latest: ref }
    },
    readVersionArtifact(_ref, relativePath) {
      const filePath = path.join(versionDir, relativePath)
      try {
        return readFileSync(filePath)
      } catch {
        return null
      }
    },
    readSourceAsset() {
      try {
        return readFileSync(path.join(versionDir, 'canonical/source-asset.bin'))
      } catch {
        return null
      }
    },
  }
}

function admitBoundCanonicalPackage({
  canonicalRequest,
  version,
  paperId,
  packageData,
  sourceAssetBytes,
  answerKeyBytes,
}) {
  const trustedDocxSource = trustedDocxPublicationSourceAsset(canonicalRequest)
  const docxPairSource = docxPairPublicationSourceAsset(canonicalRequest)
  const admission = admitCanonicalPaperImport({
    request: canonicalRequest,
    sourceAssetVersion: version,
    sourceAsset: trustedDocxSource ?? docxPairSource ?? sourceAssetBytes,
  })
  if (!admission.ok) return { failure: canonicalAdmissionFailure(admission) }
  if (admission.sealed.manifest.paperId !== paperId) {
    return {
      failure: canonicalAdmissionFailure({
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_PAPER_ID_MISMATCH',
          message: 'Canonical Publication paper identity differs from the validated import package',
        }],
      }),
    }
  }
  const bindingFailure = validateCanonicalImportPackageBinding({
    admission,
    packageData,
    paperAssetBytes: sourceAssetBytes,
    answerKeyBytes,
    canonicalRequest,
  })
  if (bindingFailure) {
    return { failure: canonicalAdmissionFailure(bindingFailure) }
  }
  return { admission }
}

function validateUniversalNck1Binding({
  admission,
  packageData,
  expectedVisibleStructureDigest,
}) {
  const canonicalPaper = admission.compilation.artifacts.canonicalPaper
  const sourceCapture = admission.compilation.artifacts.sourceCapture
  const importedGroups = Object.values(packageData.paperAsset.content.groups)
  const canonicalGroups = canonicalPaper.questionGroups
  if (importedGroups.length !== 9 || canonicalGroups.length !== 9) {
    return {
      code: 'CANONICAL_IMPORT_GROUP_SET_MISMATCH',
      message: 'Universal NCK1 publication requires exactly nine active Question Groups',
    }
  }
  const canonicalById = new Map(canonicalGroups.map((group) => [
    group.identity.groupId,
    group,
  ]))
  for (const importedGroup of importedGroups) {
    const canonicalGroup = canonicalById.get(importedGroup.groupId)
    if (
      !canonicalGroup
      || canonicalGroup.contractRef.familyContractId
        !== importedFamily(importedGroup, packageData.paperAsset)
      || JSON.stringify(canonicalGroup.questionRefs.map(({ questionId }) => questionId))
        !== JSON.stringify(importedGroup.questionIds)
    ) {
      return {
        code: 'CANONICAL_IMPORT_GROUP_BINDING_MISMATCH',
        message: `Universal NCK1 Group identity differs from Canonical Paper: ${importedGroup.groupId}`,
      }
    }
  }
  const answers = Object.entries(packageData.answerKey.answers || {})
  const assertions = new Map(sourceCapture.assertions.map((assertion) => [
    assertion.questionId,
    assertion.answer,
  ]))
  if (
    answers.length !== 45
    || answers.some(([questionId, answer]) =>
      assertions.get(questionId) !== answer.answer)
  ) {
    return {
      code: 'CANONICAL_IMPORT_ANSWER_MISMATCH',
      message: 'Universal NCK1 publication requires all 45 active authoritative answers',
    }
  }
  const listeningSlots = ['listening.short-dialogue', 'listening.long-form']
  const inactiveClosures = new Map((
    admission.compilation.artifacts.normalizationReport.inactiveSourceClosures || []
  ).map(
    (closure) => [closure.slotId, closure],
  ))
  if (listeningSlots.some((slotId) => {
    const binding = canonicalPaper.paperPlan.slotBindings.find(
      (candidate) => candidate.slotId === slotId,
    )
    const closure = inactiveClosures.get(slotId)
    return binding?.sourceState !== 'not_supplied' && closure?.status !== 'closed'
  })) {
    return {
      code: 'CANONICAL_IMPORT_INACTIVE_BINDING_MISMATCH',
      message: 'Universal NCK1 Listening must be explicitly not supplied or closed as inactive source',
    }
  }
  if (
    admission.consumers.screen.visibleStructureDigest
      !== expectedVisibleStructureDigest
  ) {
    return {
      code: 'CANONICAL_IMPORT_VISIBLE_STRUCTURE_MISMATCH',
      message: 'Canonical Publication visible structure differs from the Owner-approved revision',
    }
  }
  return null
}

function admitBoundUniversalNck1Package({
  canonicalRequest,
  version,
  paperId,
  packageData,
  expectedVisibleStructureDigest,
}) {
  if (!isNck1MaterializationCanonicalImportRequest(canonicalRequest)) {
    return {
      failure: canonicalAdmissionFailure({
        disposition: 'unsupported',
        diagnostics: [{
          code: 'NCK1_MATERIALIZATION_REQUEST_INVALID',
          message: 'Universal NCK1 publication requires one confirmed materialization request',
        }],
      }),
    }
  }
  const admission = admitCanonicalPaperImport({
    request: canonicalRequest,
    sourceAssetVersion: version,
    sourceAsset: nck1MaterializationPublicationSourceAsset(canonicalRequest),
  })
  if (!admission.ok) return { failure: canonicalAdmissionFailure(admission) }
  if (admission.sealed.manifest.paperId !== paperId) {
    return {
      failure: canonicalAdmissionFailure({
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_IMPORT_PAPER_ID_MISMATCH',
          message: 'Canonical Publication paper identity differs from the approved universal import',
        }],
      }),
    }
  }
  const bindingFailure = validateUniversalNck1Binding({
    admission,
    packageData,
    expectedVisibleStructureDigest,
  })
  if (bindingFailure) {
    return {
      failure: canonicalAdmissionFailure({
        disposition: 'unsupported',
        diagnostics: [bindingFailure],
      }),
    }
  }
  return { admission }
}

function universalValidationReport(projection) {
  return {
    ok: true,
    paperId: projection.paperId,
    assetVersion: projection.candidate.interpretation.sourceAssetVersion,
    acceptedFiles: [],
    rejectedFiles: [],
    warnings: [],
    blockingIssues: [],
    structurePreview: [],
    readingGroups: getReadingChoiceGroups(projection.paperAsset).map((group) => ({
      groupId: group.groupId,
      title: group.title,
      questionIds: group.questionIds,
      defaultQuestionId: group.questionIds?.[0] || null,
    })),
    normalizationGroups: [],
    limits: {},
    generatedAt: new Date().toISOString(),
  }
}

export function publishUniversalNck1Import({
  reviewRootDir,
  approvedIdentity,
  canonicalRequest,
  db,
  paperAssetsDir,
  forceDbFailure = false,
  failurePoint = null,
  onPrepared = null,
}) {
  const projection = buildNck1ReviewProjection(
    reviewRootDir,
    { requireAnalyses: true },
  )
  if (projection.manifest.schemaVersion === 'universal-nck1-source-manifest-v2') {
    return canonicalAdmissionFailure({
      disposition: 'unsupported',
      diagnostics: [{
        code: 'LISTENING_AUDIO_PUBLICATION_NOT_SUPPORTED',
        message: 'Listening audio evidence may enter Review but cannot publish before listening publication support is active',
      }],
    })
  }
  const expectedIdentity = {
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
  }
  if (
    !approvedIdentity
    || Object.entries(expectedIdentity).some(
      ([key, value]) => approvedIdentity[key] !== value,
    )
  ) {
    return canonicalAdmissionFailure({
      disposition: 'unsupported',
      diagnostics: [{
        code: 'IMPORT_REVIEW_APPROVAL_IDENTITY_MISMATCH',
        message: 'Local universal Candidate does not match the exact Owner-approved identity',
      }],
    })
  }
  const requestConfirmation = canonicalRequest?.nck1MaterializationConfirmation
  if (
    requestConfirmation?.sourceDigest !== projection.sourceDigest
    || requestConfirmation?.candidateDigest !== projection.candidateDigest
  ) {
    return canonicalAdmissionFailure({
      disposition: 'unsupported',
      diagnostics: [{
        code: 'NCK1_MATERIALIZATION_REQUEST_IDENTITY_MISMATCH',
        message: 'Canonical request does not bind the exact Owner-approved source and Candidate',
      }],
    })
  }
  const packageData = buildNck1CompatibilityPackage({
    config: projection.config,
    manifest: projection.manifest,
    materialization: projection.materialization,
    sourceAssetVersion: projection.candidate.interpretation.sourceAssetVersion,
    analysisSidecars: projection.analysisSidecars,
  })
  return publishPreparedPaperImport({
    db,
    paperAssetsDir,
    packageData,
    publicValidation: universalValidationReport(projection),
    forceDbFailure,
    failurePoint,
    onPrepared,
    requireCompleteAnalyses: true,
    admitPackage(version) {
      return admitBoundUniversalNck1Package({
        canonicalRequest,
        version,
        paperId: projection.paperId,
        packageData,
        expectedVisibleStructureDigest: projection.visibleStructureDigest,
      })
    },
  })
}

export function publishPaperImportPackage({
  files,
  db,
  paperAssetsDir,
  canonicalRequest,
  forceDbFailure = false,
  failurePoint = null,
  docxSourceMediaCaptureOptions = {},
  captureDocxSourceMediaImpl = captureDocxSourceMedia,
}) {
  const validation = validatePaperImportPackage(files)
  if (validation.ok && validation.packageData.sourceDocx.kind === 'docx') {
    try {
      validation.packageData.sourceDocx.mediaCapture = captureDocxSourceMediaImpl({
        fileName: validation.packageData.sourceDocx.fileName,
        buffer: validation.packageData.sourceDocx.buffer,
        paperAsset: validation.packageData.paperAsset,
        ...docxSourceMediaCaptureOptions,
      })
    } catch (error) {
      validation.ok = false
      validation.blockingIssues.push(makePaperImportIssue(
        'blocking',
        'docx.sourceMediaCaptureFailed',
        `${validation.packageData.sourceDocx.fileName} 的内嵌图像/形状原料提取失败。`,
        {
          fileName: validation.packageData.sourceDocx.fileName,
          suggestedFix: error instanceof Error ? error.message : String(error),
        },
      ))
    }
  }
  const publicValidation = makePublicValidationReport(validation)
  if (!validation.ok) {
    return {
      ok: false,
      status: 'validation_failed',
      validation: publicValidation,
      publish: null,
    }
  }

  const sourceAssetFile = files.find(
    (file) => file.fileName === 'paper-asset.json' && Buffer.isBuffer(file.buffer),
  )
  const answerKeyFile = files.find(
    (file) => file.fileName === 'answer-key.json' && Buffer.isBuffer(file.buffer),
  )
  return publishPreparedPaperImport({
    db,
    paperAssetsDir,
    packageData: validation.packageData,
    publicValidation,
    forceDbFailure,
    failurePoint,
    admitPackage(version) {
      return admitBoundCanonicalPackage({
        canonicalRequest,
        version,
        paperId: validation.packageData.paperAsset.paper.paperId,
        packageData: validation.packageData,
        sourceAssetBytes: sourceAssetFile?.buffer,
        answerKeyBytes: answerKeyFile?.buffer,
      })
    },
  })
}

function publishPreparedPaperImport({
  db,
  paperAssetsDir,
  packageData,
  publicValidation,
  admitPackage,
  forceDbFailure = false,
  failurePoint = null,
  onPrepared = null,
  requireCompleteAnalyses = false,
}) {
  const paperId = packageData.paperAsset.paper.paperId
  const preflightVersion = computeNextPublishVersion({
    db,
    paperAssetsDir,
    paperId,
  })
  const preflightAdmission = admitPackage(preflightVersion)
  if (preflightAdmission.failure) return preflightAdmission.failure
  const recovery = recoverInterruptedPaperImportPublish({
    db,
    paperAssetsDir,
    paperId,
    validateCommittedAssets: requireCompleteAnalyses
      ? (targetVersion) => {
          assertPaperImportAnalysisSidecars({
            baseDir: path.join(
              paperAssetsDir,
              paperId,
              'versions',
              `v${targetVersion}`,
            ),
            packageData,
            version: targetVersion,
          })
          assertPaperImportAnalysisSidecars({
            baseDir: path.join(paperAssetsDir, paperId, 'latest'),
            packageData,
            version: targetVersion,
          })
        }
      : null,
  })
  cleanupPaperImportTempArtifacts(paperAssetsDir)

  if (recovery.finalized) {
    const current = getCurrentCanonicalPublication(db, paperId)
    const retry = admitPackage(recovery.targetVersion)
    if (retry.failure) return retry.failure
    if (
      !current
      || current.sourceAssetVersion !== recovery.targetVersion
      || current.publicationDigest !== retry.admission.sealed.manifest.publicationDigest
    ) {
      return canonicalAdmissionFailure({
        disposition: 'unsupported',
        diagnostics: [{
          code: 'CANONICAL_PUBLICATION_IDENTITY_CONFLICT',
          message: 'Retry identity conflicts with the committed canonical Publication',
        }],
      })
    }
    const consumers = loadCanonicalOnlyConsumers({
      ref: current,
      store: createFileSystemCanonicalPublicationStore({
        rootDir: paperAssetsDir,
        db,
      }),
    })
    const versionName = `v${recovery.targetVersion}`
    if (onPrepared) {
      onPrepared({
        assetVersion: recovery.targetVersion,
        versionName,
        canonicalPublicationDigest: current.publicationDigest,
      })
    }
    const versionDir = path.join(paperAssetsDir, paperId, 'versions', versionName)
    const publishReport = JSON.parse(
      readFileSync(path.join(versionDir, 'publish-report.json'), 'utf8'),
    )
    return {
      ok: true,
      status: 'idempotent',
      validation: publicValidation,
      publish: {
        ...publishReport,
        latestDir: path.join(paperAssetsDir, paperId, 'latest'),
        versionDir,
        canonicalPublicationDigest: current.publicationDigest,
        consumers,
      },
    }
  }

  const version = computeNextPublishVersion({
    db,
    paperAssetsDir,
    paperId,
  })
  const admissionResult = version === preflightVersion
    ? preflightAdmission
    : admitPackage(version)
  if (admissionResult.failure) return admissionResult.failure
  const admission = admissionResult.admission
  const readingGroups = getReadingChoiceGroups(packageData.paperAsset).map((group) => ({
    groupId: group.groupId,
    title: group.title,
    defaultQuestionId: group.questionIds?.[0] || null,
  }))
  const scGroups = getSevenChoicesGroups(packageData.paperAsset)
  const clozeGroups = getClozeGroups(packageData.paperAsset)
  const gfGroups = getGrammarFillGroups(packageData.paperAsset)
  const writingGroups = getWritingGroups(packageData.paperAsset)
  const publishReport = {
    ok: true,
    paperId,
    assetVersion: version,
    versionName: `v${version}`,
    qaLinks: buildQaLinks(paperId, version, readingGroups, scGroups, clozeGroups, gfGroups, writingGroups),
    searchHref: '/?q=2024%20九省联考',
    generatedAt: new Date().toISOString(),
  }

  if (onPrepared) {
    onPrepared({
      assetVersion: version,
      versionName: publishReport.versionName,
      canonicalPublicationDigest: admission.sealed.manifest.publicationDigest,
    })
  }

  let writtenVersion = null
  let latestSwap = null
  let dbCommitted = false
  try {
    writtenVersion = writePaperImportVersion({
      paperAssetsDir,
      packageData,
      validationReport: publicValidation,
      publishReport,
      version,
      canonicalPublication: admission.sealed,
      forceFailureAt: failurePoint,
      beforeVersionCommit({ tempDir, versionName }) {
        beginPaperImportPublish({
          paperAssetsDir,
          paperId,
          versionName,
          tempVersionDir: tempDir,
        })
      },
    })
    if (failurePoint === 'process-exit-after-version-rename') {
      process.exit(87)
    }
    if (requireCompleteAnalyses) {
      assertPaperImportAnalysisSidecars({
        baseDir: writtenVersion.versionDir,
        packageData,
        version,
      })
    }

    const canonicalRef = {
      paperId,
      versionName: writtenVersion.versionName,
      sourceAssetVersion: version,
      publicationDigest: admission.sealed.manifest.publicationDigest,
    }
    loadCanonicalOnlyConsumers({
      ref: canonicalRef,
      store: stagedCanonicalStore({
        versionDir: writtenVersion.versionDir,
        ref: canonicalRef,
      }),
    })

    db.exec('BEGIN')
    ensurePaperImportDatabaseShape(db)
    upsertPaperAssetToDb(db, {
      ...packageData,
      paperAsset: writtenVersion.artifacts.paperAsset,
      answerKey: writtenVersion.artifacts.answerKey,
      readingAnalysis: writtenVersion.artifacts.readingAnalysis,
    }, version)
    if (forceDbFailure || failurePoint === 'db-write') {
      throw new Error(
        forceDbFailure
          ? 'Forced C7 DB failure for rollback proof'
          : 'Forced db-write failure',
      )
    }
    db.prepare(
      `
      INSERT INTO paper_import_runs (id, paper_id, asset_version, status, validation_report_json, publish_report_json)
      VALUES (?, ?, ?, 'published', ?, ?)
      `,
    ).run(`pir-${randomUUID()}`, paperId, version, JSON.stringify(publicValidation), JSON.stringify(publishReport))
    recordCanonicalPublicationCurrent(db, canonicalRef)
    latestSwap = swapPaperImportLatest({
      paperAssetsDir,
      paperId,
      versionDir: writtenVersion.versionDir,
      canonicalRef,
      deferCleanup: true,
      forceFailureAt: failurePoint,
    })
    if (requireCompleteAnalyses) {
      assertPaperImportAnalysisSidecars({
        baseDir: latestSwap.latestDir,
        packageData,
        version,
      })
    }
    if (failurePoint === 'process-exit-after-latest-swap') {
      process.exit(86)
    }
    db.exec('COMMIT')
    dbCommitted = true
    if (failurePoint === 'after-commit' || failurePoint === 'committed-reload') {
      const error = new Error('Forced committed canonical reload failure')
      error.code = 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE'
      throw error
    }
    const consumers = loadCanonicalOnlyConsumers({
      ref: canonicalRef,
      store: createFileSystemCanonicalPublicationStore({
        rootDir: paperAssetsDir,
        db,
      }),
    })
    commitPaperImportLatestSwap(latestSwap)

    return {
      ok: true,
      status: 'published',
      validation: publicValidation,
      publish: {
        ...publishReport,
        latestDir: latestSwap.latestDir,
        versionDir: writtenVersion.versionDir,
        canonicalPublicationDigest:
          admission.sealed.manifest.publicationDigest,
        consumers,
      },
    }
  } catch (error) {
    if (!dbCommitted) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // The transaction may not have started or may already be rolled back.
      }
      try {
        rollbackPaperImportLatestSwap(latestSwap)
      } catch {
        // Preserve the original publish failure.
      }
      try {
        recoverInterruptedPaperImportPublish({ db, paperAssetsDir, paperId })
      } catch {
        // Preserve the original publish failure.
      }
    }
    if (writtenVersion && !dbCommitted) {
      removePaperImportVersion({ paperAssetsDir, paperId, versionName: writtenVersion.versionName })
      if (error?.code?.startsWith('CANONICAL_')) {
        return canonicalAdmissionFailure({
          disposition: 'unsupported',
          diagnostics: error.diagnostics?.length
            ? error.diagnostics
            : [{ code: error.code, message: error.message }],
        })
      }
      try {
        ensurePaperImportDatabaseShape(db)
        db.prepare(
          `
          INSERT INTO paper_import_runs (id, paper_id, asset_version, status, validation_report_json, publish_report_json, error_message)
          VALUES (?, ?, ?, 'failed', ?, '{}', ?)
          `,
        ).run(
          `pir-${randomUUID()}`,
          paperId,
          version,
          JSON.stringify(publicValidation),
          error instanceof Error ? error.message : String(error),
        )
      } catch {
        // Failure recording must not hide the publish failure.
      }
    }
    throw error
  }
}

export function rollbackPaperImportPublication({
  db,
  paperAssetsDir,
  paperId,
  versionName,
  failurePoint = null,
}) {
  if (!/^v[1-9]\d*$/.test(versionName)) {
    throw new Error(`Invalid rollback version for ${paperId}`)
  }
  recoverInterruptedPaperImportPublish({ db, paperAssetsDir, paperId })
  const row = db.prepare(
    `
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND version_name = ?
    `,
  ).get(paperId, versionName)
  if (!row) {
    const error = new Error(`Canonical rollback target is not published: ${paperId} ${versionName}`)
    error.code = 'CANONICAL_PUBLICATION_ROLLBACK_TARGET_MISSING'
    throw error
  }
  const target = {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: Number(row.source_asset_version),
    publicationDigest: row.publication_digest,
  }
  const store = createFileSystemCanonicalPublicationStore({
    rootDir: paperAssetsDir,
    db,
  })
  const targetConsumers = loadCanonicalOnlyConsumers({ ref: target, store })
  const current = getCurrentCanonicalPublication(db, paperId)
  if (
    current
    && current.versionName === target.versionName
    && current.sourceAssetVersion === target.sourceAssetVersion
    && current.publicationDigest === target.publicationDigest
  ) {
    const latestDir = path.join(paperAssetsDir, paperId, 'latest')
    let latestRef = null
    try {
      latestRef = JSON.parse(
        readFileSync(
          path.join(latestDir, 'canonical-paper-publication-ref-v1.json'),
          'utf8',
        ),
      )
    } catch {
      // The mismatch below reports one stable fail-closed error.
    }
    if (
      !latestRef
      || latestRef.paperId !== target.paperId
      || latestRef.versionName !== target.versionName
      || latestRef.sourceAssetVersion !== target.sourceAssetVersion
      || latestRef.publicationDigest !== target.publicationDigest
    ) {
      const error = new Error('Canonical current and latest Publication references disagree')
      error.code = 'PUBLICATION_REF_DISAGREEMENT'
      throw error
    }
    let latestAssetVersion = null
    try {
      latestAssetVersion = Number(
        JSON.parse(readFileSync(path.join(latestDir, 'paper-asset.json'), 'utf8'))
          ?.paper?.assetVersion,
      )
    } catch {
      // The mismatch below reports one stable fail-closed error.
    }
    if (latestAssetVersion !== target.sourceAssetVersion) {
      const error = new Error('Canonical latest asset does not match the current Publication')
      error.code = 'PUBLICATION_REF_DISAGREEMENT'
      throw error
    }
    return {
      status: 'idempotent',
      paperId,
      versionName,
      publicationDigest: target.publicationDigest,
      consumers: targetConsumers,
    }
  }

  let latestSwap = null
  let dbCommitted = false
  try {
    db.exec('BEGIN')
    selectCanonicalPublicationCurrent(db, target)
    latestSwap = swapPaperImportLatest({
      paperAssetsDir,
      paperId,
      versionDir: path.join(paperAssetsDir, paperId, 'versions', versionName),
      canonicalRef: target,
      deferCleanup: true,
      forceFailureAt: failurePoint,
      operation: 'rollback',
    })
    if (failurePoint === 'process-exit-after-latest-swap') {
      process.exit(88)
    }
    if (failurePoint === 'after-latest-before-commit') {
      throw new Error('Forced rollback failure after latest swap')
    }
    db.exec('COMMIT')
    dbCommitted = true
    if (failurePoint === 'after-commit' || failurePoint === 'committed-reload') {
      const error = new Error('Forced committed rollback reload failure')
      error.code = 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE'
      throw error
    }
    const consumers = loadCanonicalOnlyConsumers({ ref: target, store })
    commitPaperImportLatestSwap(latestSwap)
    return {
      status: 'rolled_back',
      paperId,
      versionName,
      publicationDigest: target.publicationDigest,
      consumers,
    }
  } catch (error) {
    if (!dbCommitted) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // The transaction may not have started.
      }
      try {
        rollbackPaperImportLatestSwap(latestSwap)
      } catch {
        // Preserve the original rollback failure.
      }
    }
    throw error
  }
}
