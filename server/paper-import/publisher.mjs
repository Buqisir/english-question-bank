import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  computeNextPaperAssetVersion,
  cleanupPaperImportTempArtifacts,
  removePaperImportVersion,
  swapPaperImportLatest,
  writePaperImportVersion,
} from './storage.mjs'
import {
  getReadingChoiceGroups,
  makePublicValidationReport,
  validatePaperImportPackage,
} from './validator.mjs'

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
      readingAnalysis.groups?.[group.groupId]?.overview ||
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
        discourse_type = excluded.discourse_type,
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
      group.groupType,
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
    packageData.sourceDocx.sha256,
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

function buildQaLinks(paperId, version, readingGroups, scGroups) {
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

  return [...readingLinks, ...scLinks]
}

export function publishPaperImportPackage({ files, db, paperAssetsDir, forceDbFailure = false }) {
  const validation = validatePaperImportPackage(files)
  const publicValidation = makePublicValidationReport(validation)
  if (!validation.ok) {
    return {
      ok: false,
      status: 'validation_failed',
      validation: publicValidation,
      publish: null,
    }
  }

  const paperId = validation.packageData.paperAsset.paper.paperId
  cleanupPaperImportTempArtifacts(paperAssetsDir)
  const version = computeNextPublishVersion({ db, paperAssetsDir, paperId })
  const readingGroups = getReadingChoiceGroups(validation.packageData.paperAsset).map((group) => ({
    groupId: group.groupId,
    title: group.title,
    defaultQuestionId: group.questionIds?.[0] || null,
  }))
  const scGroups = getSevenChoicesGroups(validation.packageData.paperAsset)
  const publishReport = {
    ok: true,
    paperId,
    assetVersion: version,
    versionName: `v${version}`,
    qaLinks: buildQaLinks(paperId, version, readingGroups, scGroups),
    searchHref: '/?q=2024%20九省联考',
    generatedAt: new Date().toISOString(),
  }

  let writtenVersion = null
  try {
    writtenVersion = writePaperImportVersion({
      paperAssetsDir,
      packageData: validation.packageData,
      validationReport: publicValidation,
      publishReport,
      version,
    })

    db.exec('BEGIN')
    ensurePaperImportDatabaseShape(db)
    if (forceDbFailure) {
      throw new Error('Forced C7 DB failure for rollback proof')
    }
    upsertPaperAssetToDb(db, {
      ...validation.packageData,
      paperAsset: writtenVersion.artifacts.paperAsset,
      answerKey: writtenVersion.artifacts.answerKey,
      readingAnalysis: writtenVersion.artifacts.readingAnalysis,
    }, version)
    db.prepare(
      `
      INSERT INTO paper_import_runs (id, paper_id, asset_version, status, validation_report_json, publish_report_json)
      VALUES (?, ?, ?, 'published', ?, ?)
      `,
    ).run(`pir-${randomUUID()}`, paperId, version, JSON.stringify(publicValidation), JSON.stringify(publishReport))
    db.exec('COMMIT')

    const latestDir = swapPaperImportLatest({
      paperAssetsDir,
      paperId,
      versionDir: writtenVersion.versionDir,
    })

    return {
      ok: true,
      status: 'published',
      validation: publicValidation,
      publish: {
        ...publishReport,
        latestDir,
        versionDir: writtenVersion.versionDir,
      },
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The transaction may not have started or may already be rolled back.
    }
    if (writtenVersion) {
      removePaperImportVersion({ paperAssetsDir, paperId, versionName: writtenVersion.versionName })
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
