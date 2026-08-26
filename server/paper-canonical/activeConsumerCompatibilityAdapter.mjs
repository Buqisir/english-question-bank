import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { projectCanonicalConsumerGroup } from '../../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaperBrowseDisplayAsset } from '../../shared/paper-canonical/paperBrowseDisplayAsset.mjs'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { createCanonicalConsumerRuntime } from './consumerRuntime.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const ANALYSIS_CONFIGS = Object.freeze([
  { schemaVersion: 'reading-choice-analysis-v1', fileName: 'reading-choice-analysis-v1.json', groupType: 'reading', entryMapKey: 'questions' },
  { schemaVersion: 'seven-choices-analysis-v1', fileName: 'seven-choices-analysis-v1.json', groupType: 'sevenChoices', entryMapKey: 'questions' },
  { schemaVersion: 'cloze-analysis-v1', fileName: 'cloze-analysis-v1.json', groupType: 'cloze', entryMapKey: 'blanks' },
  { schemaVersion: 'grammar-fill-analysis-v2', fileName: 'grammar-fill-analysis-v1.json', groupType: 'grammarFill', entryMapKey: 'blanks' },
])

function rejected(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function freezeTree(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeTree))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeTree(child)]),
    ))
  }
  return value
}

function safeVersionDir(rootDir, row) {
  if (
    typeof row.paper_id !== 'string'
    || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(row.paper_id)
    || !/^v\d+$/u.test(row.version_name)
  ) rejected('CANONICAL_COMPATIBILITY_REF_INVALID', 'Current Canonical publication identity is invalid')
  return path.join(rootDir, row.paper_id, 'versions', row.version_name)
}

function isFormat2CompatibilityPublication(versionDir) {
  return existsSync(path.join(
    versionDir,
    'canonical/canonical-paper-publication-v49.json',
  ))
}

function exactProvenance(versionDir, paperId) {
  const capturePath = path.join(versionDir, 'canonical/source-capture-v1.json')
  if (!existsSync(capturePath)) {
    rejected('CANONICAL_COMPATIBILITY_PROVENANCE_MISSING', 'Format 2 provenance Source Capture is missing')
  }
  let capture
  try {
    capture = JSON.parse(readFileSync(capturePath, 'utf8'))
  } catch {
    rejected('CANONICAL_COMPATIBILITY_PROVENANCE_INVALID', 'Format 2 Source Capture is invalid JSON')
  }
  const matches = (capture.documents || []).filter(
    (document) =>
      document.inputKey === 'format2_paper_provenance'
      && document.mediaType === 'application/vnd.eqb.format2-paper-provenance+json'
      && document.roles?.includes('source_provenance'),
  )
  if (matches.length !== 1) {
    rejected('CANONICAL_COMPATIBILITY_PROVENANCE_AMBIGUOUS', 'Format 2 provenance must resolve exactly once')
  }
  const document = matches[0]
  const relativePath = document.immutableArtifactRef?.relativePath
  if (
    typeof relativePath !== 'string'
    || !relativePath.startsWith('source-evidence/')
    || relativePath.includes('..')
    || path.isAbsolute(relativePath)
  ) rejected('CANONICAL_COMPATIBILITY_PROVENANCE_INVALID', 'Format 2 provenance evidence path is invalid')
  const evidencePath = path.join(versionDir, relativePath)
  if (!existsSync(evidencePath)) {
    rejected('CANONICAL_COMPATIBILITY_PROVENANCE_MISSING', 'Format 2 provenance evidence is missing')
  }
  const bytes = new Uint8Array(readFileSync(evidencePath))
  if (
    sha256(bytes) !== document.sha256
    || sha256(bytes) !== document.immutableArtifactRef.sha256
    || bytes.byteLength !== document.byteLength
    || bytes.byteLength !== document.immutableArtifactRef.byteLength
  ) rejected('CANONICAL_COMPATIBILITY_PROVENANCE_DIGEST_MISMATCH', 'Format 2 provenance evidence digest disagrees')
  let provenance
  try {
    provenance = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    rejected('CANONICAL_COMPATIBILITY_PROVENANCE_INVALID', 'Format 2 provenance evidence is invalid JSON')
  }
  const expectedKeys = [
    'defaultTags',
    'examCode',
    'paperName',
    'questionSource',
    'region',
    'schemaVersion',
    'sourceLabel',
    'sourceType',
    'subject',
    'year',
  ]
  const questionSources = (capture.documents || []).filter(
    (candidate) => candidate.inputKey === 'original_question_source'
      && candidate.roles?.includes('question_source'),
  )
  if (
    Object.keys(provenance || {}).sort().join(',') !== expectedKeys.sort().join(',')
    || provenance.schemaVersion !== 'format2-provenance-v2'
    || provenance.subject !== 'English'
    || !Number.isInteger(provenance.year)
    || provenance.year < 1
    || !Array.isArray(provenance.defaultTags)
    || provenance.defaultTags.length === 0
    || new Set(provenance.defaultTags).size !== provenance.defaultTags.length
    || provenance.defaultTags.some(
      (tag) => typeof tag !== 'string' || tag.length === 0,
    )
    || !['paperName', 'sourceLabel', 'region', 'examCode', 'sourceType'].every(
      (key) => typeof provenance[key] === 'string' && provenance[key].length > 0,
    )
    || Object.keys(provenance.questionSource || {}).sort().join(',')
      !== 'documentRole,originalName,sha256'
    || provenance.questionSource.documentRole !== 'question_pdf'
    || typeof provenance.questionSource.originalName !== 'string'
    || provenance.questionSource.originalName.length === 0
    || !/^sha256:[a-f0-9]{64}$/u.test(provenance.questionSource.sha256 || '')
    || questionSources.length !== 1
    || questionSources[0].sha256 !== provenance.questionSource.sha256
  ) rejected('CANONICAL_COMPATIBILITY_PROVENANCE_INVALID', 'Format 2 provenance-v2 shape is invalid')
  return freezeTree({ ...provenance, paperId })
}

function groupOrder(consumption) {
  return consumption.visibleStructure
    .filter((node) => node.kind === 'group')
    .map((node) => ({
      groupId: node.groupId,
      familyContractId: node.familyContractId,
    }))
}

function exactProjectedGroups(screen, printPdf) {
  const screenOrder = groupOrder(screen)
  const printOrder = groupOrder(printPdf)
  if (stableStringify(screenOrder) !== stableStringify(printOrder)) {
    rejected('CANONICAL_COMPATIBILITY_CONSUMER_ORDER_MISMATCH', 'Screen and Print/PDF Canonical Group order disagrees')
  }
  return screenOrder.map(({ groupId, familyContractId }) => {
    const screenGroup = projectCanonicalConsumerGroup({
      consumption: screen,
      familyContractId,
      groupId,
    })
    const printGroup = projectCanonicalConsumerGroup({
      consumption: printPdf,
      familyContractId,
      groupId,
    })
    const screenQuestionIds = (screenGroup.questions || []).map((question) => question.questionId)
    const printQuestionIds = (printGroup.questions || []).map((question) => question.questionId)
    if (stableStringify(screenQuestionIds) !== stableStringify(printQuestionIds)) {
      rejected('CANONICAL_COMPATIBILITY_CONSUMER_ORDER_MISMATCH', `Screen and Print/PDF Question order disagrees in ${groupId}`)
    }
    return { groupId, familyContractId, screenGroup, printGroup }
  })
}

function displayGroupType(groupType) {
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'continuation') return 'continuation'
  if (groupType === 'writing') return 'writing'
  return groupType
}

function answerForQuestion(question) {
  if (typeof question?.correctOptionId !== 'string') return ''
  return String(question.options?.find(
    (option) => option.optionId === question.correctOptionId,
  )?.label || '')
}

function paragraphText(group) {
  if (Array.isArray(group.paragraphs)) {
    return group.paragraphs.flatMap((paragraph) => paragraph.nodes || [])
      .filter((node) => node.type === 'text')
      .map((node) => node.text)
      .join(' ')
  }
  const blocks = Array.isArray(group.blocks)
    ? group.blocks
    : Array.isArray(group.promptBlocks)
      ? group.promptBlocks
      : Array.isArray(group.materialBlocks)
        ? group.materialBlocks
        : []
  const visit = (items) => items.flatMap((block) => {
    if (typeof block.text === 'string') return [block.text]
    if (block.kind === 'paragraph') return [(block.inlines || []).map((inline) => inline.text || '').join('')]
    if (block.kind === 'framed_columns') return block.columns.flatMap((column) => visit(column.blocks || []))
    return []
  })
  return visit(blocks).filter(Boolean).join(' ')
}

function sidecarSources(versionDir, paperId, groups) {
  const groupsByType = new Map(groups.map((group) => [group.screenGroup.groupType, group]))
  const questionOwner = new Map(groups.flatMap((group) =>
    (group.screenGroup.questions || []).map((question) => [question.questionId, group])))
  const blankQuestionId = new Map(groups.flatMap((group) =>
    (group.screenGroup.paragraphs || []).flatMap((paragraph) =>
      (paragraph.nodes || []).flatMap((node) =>
        node.type === 'blank'
          && typeof node.blankId === 'string'
          && typeof node.questionId === 'string'
          ? [[node.blankId, node.questionId]]
          : []))))
  const blankOwner = new Map(groups.flatMap((group) => [
    ...(group.screenGroup.questions || []).flatMap((question) =>
      typeof question.blankId === 'string' ? [[question.blankId, group]] : []),
    ...(group.screenGroup.paragraphs || []).flatMap((paragraph) =>
      (paragraph.nodes || []).flatMap((node) =>
        node.type === 'blank' && typeof node.blankId === 'string'
          ? [[node.blankId, group]]
          : [])),
  ]))
  const sources = []
  for (const config of ANALYSIS_CONFIGS) {
    const filePath = path.join(versionDir, 'analyses', config.fileName)
    if (!existsSync(filePath)) continue
    let analysis
    try {
      analysis = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      rejected('CANONICAL_COMPATIBILITY_ANALYSIS_INVALID', `${config.fileName} is invalid JSON`)
    }
    if (analysis.schemaVersion !== config.schemaVersion || analysis.paperId !== paperId) {
      rejected('CANONICAL_COMPATIBILITY_ANALYSIS_IDENTITY_MISMATCH', `${config.fileName} paper/schema identity disagrees`)
    }
    const entryMap = analysis[config.entryMapKey]
    if (!entryMap || typeof entryMap !== 'object' || Array.isArray(entryMap)) {
      rejected('CANONICAL_COMPATIBILITY_ANALYSIS_INVALID', `${config.fileName} entry map is invalid`)
    }
    const ownerByEntryId = new Map()
    for (const identity of Object.keys(entryMap)) {
      const owner = config.entryMapKey === 'blanks'
        ? blankOwner.get(identity) || questionOwner.get(identity)
        : questionOwner.get(identity)
      if (!owner || owner.screenGroup.groupType !== config.groupType) {
        rejected('CANONICAL_COMPATIBILITY_ANALYSIS_IDENTITY_MISMATCH', `${config.fileName} entry ${identity} is outside its Canonical Group`)
      }
      ownerByEntryId.set(identity, owner)
    }
    for (const groupId of analysis.targetGroups || []) {
      const group = groups.find((candidate) => candidate.groupId === groupId)
      if (!group || group.screenGroup.groupType !== config.groupType) {
        rejected('CANONICAL_COMPATIBILITY_ANALYSIS_IDENTITY_MISMATCH', `${config.fileName} targets another Canonical Group`)
      }
    }
    if (!groupsByType.has(config.groupType)) {
      rejected('CANONICAL_COMPATIBILITY_ANALYSIS_IDENTITY_MISMATCH', `${config.fileName} has no matching Canonical family`)
    }
    const groupIds = [...new Set([
      ...(analysis.targetGroups || []),
      ...[...ownerByEntryId.values()].map((owner) => owner.groupId),
    ])]
    const entryIdsByGroupId = Object.fromEntries(groupIds.map((groupId) => [
      groupId,
      [...ownerByEntryId.entries()]
        .filter(([, owner]) => owner.groupId === groupId)
        .map(([identity]) => identity),
    ]))
    const questionIdByEntryId = Object.fromEntries(
      [...ownerByEntryId.keys()].map((identity) => [
        identity,
        blankQuestionId.get(identity) || identity,
      ]),
    )
    sources.push(freezeTree({
      paperId,
      schemaVersion: config.schemaVersion,
      fileName: config.fileName,
      groupType: config.groupType,
      groupIds,
      entryIdsByGroupId,
      questionIdByEntryId,
      entryMapKey: config.entryMapKey,
      analysis,
    }))
  }
  return sources
}

function buildPaperSnapshot({ row, screen, printPdf, versionDir }) {
  if (
    screen.paperId !== row.paper_id
    || printPdf.paperId !== row.paper_id
    || screen.sourceAssetVersion !== row.source_asset_version
    || printPdf.sourceAssetVersion !== row.source_asset_version
    || screen.publicationDigest !== row.publication_digest
    || printPdf.publicationDigest !== row.publication_digest
  ) rejected('CANONICAL_COMPATIBILITY_REF_MISMATCH', 'Canonical consumption does not match the exact current database ref')
  const provenance = exactProvenance(versionDir, row.paper_id)
  const groups = exactProjectedGroups(screen, printPdf)
  const displayAsset = projectCanonicalPaperBrowseDisplayAsset(screen)
  const analysisSources = sidecarSources(versionDir, row.paper_id, groups)
  const groupEntries = []
  const questionEntries = []
  for (const [groupIndex, group] of groups.entries()) {
    const printQuestions = new Map((group.printGroup.questions || []).map(
      (question) => [question.questionId, question],
    ))
    const questionIds = (group.screenGroup.questions || []).map((question) => question.questionId)
    const groupType = displayGroupType(group.screenGroup.groupType)
    const materialText = paragraphText(group.screenGroup)
    const card = freezeTree({
      id: group.groupId,
      title: `${provenance.sourceLabel} ${group.groupId}`,
      source: provenance.sourceLabel,
      sourceType: provenance.sourceType,
      year: provenance.year,
      region: provenance.region,
      paperName: provenance.paperName,
      section: group.groupId,
      passageTitle: materialText.slice(0, 120) || group.groupId,
      summary: materialText.slice(0, 180),
      groupType,
      questionCount: questionIds.length,
      difficulty: '',
      tags: [...provenance.defaultTags],
      topicLabels: [],
      hit: String(group.screenGroup.questions?.[0]?.stem || materialText.slice(0, 120)),
      answerPreview: '',
      defaultScore: 2.5,
      hasPaperSurfaceAnalysis: analysisSources.some(
        (source) => source.groupIds.includes(group.groupId),
      ),
      paperSurfaceHref: `?view=paper-intelligence&source=canonical-compatibility&paperId=${encodeURIComponent(row.paper_id)}&surface=paper&groupId=${encodeURIComponent(group.groupId)}`,
      paperSurfaceLabel: '试卷解析',
      canAddToDraftPaper: false,
      draftPaperButtonState: 'disabled',
      currentDraftPaperId: null,
      printUnavailableReason: 'Canonical-only 题组尚未迁移到独立组卷写入合同',
    })
    const questions = (group.screenGroup.questions || []).map((question, questionIndex) => {
      const printQuestion = printQuestions.get(question.questionId)
      const detail = freezeTree({
        id: question.questionId,
        questionNo: String(question.questionNo),
        questionType: groupType,
        stem: String(question.stem || question.blankId || ''),
        answer: answerForQuestion(printQuestion),
        explanation: '',
        difficulty: '',
        aiDifficultyScore: null,
        teacherDifficulty: null,
        difficultyOverrideReason: '',
        difficultyOverrideNote: '',
        difficultyTaggedAt: '',
        score: 0,
        displayOrder: questionIndex + 1,
        note: '',
        options: (question.options || []).map((option, optionIndex) => ({
          id: option.optionId,
          label: option.label,
          content: String(option.text || ''),
          displayOrder: optionIndex + 1,
        })),
      })
      questionEntries.push([question.questionId, freezeTree({
        paperId: row.paper_id,
        groupId: group.groupId,
        groupOrder: groupIndex + 1,
        questionOrder: questionIndex + 1,
        groupType,
        detail,
      })])
      return detail
    })
    groupEntries.push([group.groupId, freezeTree({
      paperId: row.paper_id,
      groupId: group.groupId,
      groupOrder: groupIndex + 1,
      familyContractId: group.familyContractId,
      groupType,
      questionIds,
      card,
      detail: {
        ...card,
        paperId: row.paper_id,
        instruction: '',
        note: '',
        sourceDetail: {
          id: provenance.examCode,
          publisher: '',
          originalUrl: '',
          fileRef: provenance.questionSource.originalName,
          note: '',
        },
        passage: {
          id: group.groupId,
          title: card.passageTitle,
          materialText,
          summary: card.summary,
          theme: '',
          discourseType: '',
          wordCount: null,
          note: '',
        },
        questions,
        ...(
          group.familyContractId === 'application-writing'
            ? {
                writingTask: {
                  taskType: 'application',
                  continuationStarters: [],
                },
              }
            : group.familyContractId === 'continuation-writing'
              ? {
                  writingTask: {
                    taskType: 'continuation',
                    continuationStarters: (group.screenGroup.answerRegion?.starterLines || [])
                      .map((starter) => starter.text),
                  },
                }
              : {}
        ),
        readingParseResult: null,
        readingVerifyResult: null,
        clozeParseResult: null,
        grammarParseResult: null,
        sevenChoicesParseResult: null,
      },
    })])
  }
  return freezeTree({
    cacheKey: `${row.paper_id}@${row.version_name}@${row.publication_digest}`,
    paperId: row.paper_id,
    versionName: row.version_name,
    publicationDigest: row.publication_digest,
    provenance,
    displayAsset,
    groupEntries,
    questionEntries,
    analysisSources,
  })
}

function validateHistoricalIdentity(db, paper) {
  const tables = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('question_groups', 'questions', 'passages', 'sources')",
  ).all().map((row) => row.name))
  if (!["question_groups", "questions", "passages", "sources"].every((name) => tables.has(name))) return
  const selectGroup = db.prepare(`
    SELECT qg.group_type, s.paper_name
    FROM question_groups qg
    JOIN passages p ON p.id = qg.passage_id
    JOIN sources s ON s.id = p.source_id
    WHERE qg.id = ?
  `)
  const selectQuestions = db.prepare(`
    SELECT id FROM questions WHERE group_id = ? ORDER BY display_order, question_no
  `)
  const selectQuestionOwner = db.prepare('SELECT group_id FROM questions WHERE id = ?')
  for (const [groupId, group] of paper.groupEntries) {
    const row = selectGroup.get(groupId)
    if (row) {
      const questionIds = selectQuestions.all(groupId).map((question) => question.id)
      if (
        row.group_type !== group.groupType
        || row.paper_name !== paper.provenance.paperName
        || stableStringify(questionIds) !== stableStringify(group.questionIds)
      ) rejected(
        'CANONICAL_COMPATIBILITY_HISTORICAL_CONFLICT',
        `Historical Group ${groupId} disagrees with current Canonical ownership or order`,
      )
    }
    for (const questionId of group.questionIds) {
      const owner = selectQuestionOwner.get(questionId)
      if (owner && owner.group_id !== groupId) rejected(
        'CANONICAL_COMPATIBILITY_HISTORICAL_CONFLICT',
        `Historical Question ${questionId} belongs to another Group`,
      )
    }
  }
}

function validateHistoricalAssetIdentity(rootDir, groupsById, questionsById) {
  if (!existsSync(rootDir)) return
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const { assetPath } = resolvePaperAssetReadPaths(rootDir, entry.name)
    if (!existsSync(assetPath)) continue
    let asset
    try {
      asset = JSON.parse(readFileSync(assetPath, 'utf8'))
    } catch {
      continue
    }
    const paperId = String(asset?.paper?.paperId || entry.name)
    const groups = asset?.content?.groups
    if (!groups || typeof groups !== 'object' || Array.isArray(groups)) continue
    for (const [groupId, historicalGroup] of Object.entries(groups)) {
      const canonicalGroup = groupsById[groupId]
      const questionIds = Array.isArray(historicalGroup?.questionIds)
        ? historicalGroup.questionIds.map(String)
        : []
      if (
        canonicalGroup
        && (
          canonicalGroup.paperId !== paperId
          || canonicalGroup.groupType !== displayGroupType(historicalGroup.groupType)
          || stableStringify(canonicalGroup.questionIds) !== stableStringify(questionIds)
        )
      ) rejected(
        'CANONICAL_COMPATIBILITY_HISTORICAL_CONFLICT',
        `Historical Paper Asset Group ${groupId} disagrees with current Canonical ownership or order`,
      )
      for (const questionId of questionIds) {
        const canonicalQuestion = questionsById[questionId]
        if (canonicalQuestion && canonicalQuestion.groupId !== groupId) rejected(
          'CANONICAL_COMPATIBILITY_HISTORICAL_CONFLICT',
          `Historical Paper Asset Question ${questionId} belongs to another Group`,
        )
      }
    }
  }
}

export function createCanonicalActiveConsumerCompatibilityAdapter({
  rootDir,
  openDatabase,
  createConsumerRuntime = createCanonicalConsumerRuntime,
}) {
  const cache = new Map()

  function snapshot() {
    const db = openDatabase({ readOnly: true })
    try {
      const hasTable = db.prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'canonical_paper_publications'",
      ).get()
      if (!hasTable) return freezeTree({ papersById: {}, groupsById: {}, questionsById: {}, analysisSources: [] })
      const rows = db.prepare(`
        SELECT paper_id, version_name, source_asset_version, publication_digest
        FROM canonical_paper_publications
        WHERE is_current = 1
        ORDER BY paper_id
      `).all()
      const runtime = createConsumerRuntime({ rootDir, db, readOnly: true })
      const papersById = {}
      const groupsById = {}
      const questionsById = {}
      const analysisSources = []
      for (const row of rows) {
        const cacheKey = `${row.paper_id}@${row.version_name}@${row.publication_digest}`
        const versionDir = safeVersionDir(rootDir, row)
        if (!isFormat2CompatibilityPublication(versionDir)) continue
        let paper = cache.get(cacheKey)
        if (!paper) {
          paper = buildPaperSnapshot({
            row,
            versionDir,
            screen: runtime.load({ paperId: row.paper_id, consumerId: 'screen' }),
            printPdf: runtime.load({ paperId: row.paper_id, consumerId: 'print_pdf' }),
          })
          cache.set(cacheKey, paper)
        }
        validateHistoricalIdentity(db, paper)
        papersById[paper.paperId] = paper
        for (const [groupId, group] of paper.groupEntries) {
          if (groupsById[groupId]) {
            rejected('CANONICAL_COMPATIBILITY_GROUP_CONFLICT', `Canonical Group ${groupId} belongs to multiple current publications`)
          }
          groupsById[groupId] = group
        }
        for (const [questionId, question] of paper.questionEntries) {
          if (questionsById[questionId]) {
            rejected('CANONICAL_COMPATIBILITY_QUESTION_CONFLICT', `Canonical Question ${questionId} belongs to multiple current publications`)
          }
          questionsById[questionId] = question
        }
        analysisSources.push(...paper.analysisSources)
      }
      validateHistoricalAssetIdentity(rootDir, groupsById, questionsById)
      return freezeTree({ papersById, groupsById, questionsById, analysisSources })
    } finally {
      db.close()
    }
  }

  return Object.freeze({ snapshot })
}
