#!/usr/bin/env node

/**
 * Ticket 21: freeze the current latest corpus and its zero-mutation migration
 * ledger.
 *
 * The default action is a read-only check. `--write` is the only action that
 * writes, and it writes only the two checked-in migration artifacts named
 * below. It never writes paper-assets, the question-bank database, or a
 * publication/version tree. `--allow-head-move` is an explicit regeneration
 * escape hatch after the fixed-point implementation commit; the scoped input
 * diff check remains active.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

export const EXPECTED_BRANCH = 'codex/paper-canonical-unification-20260725'
export const INPUT_FIXED_POINT = '064fa340969e6e1f8595fd8fb93171096d96fc4e'
export const MANIFEST_REL = 'docs/cuts/paper-canonical-unification/migration/manifest-v1.json'
export const LEDGER_REL = 'docs/cuts/paper-canonical-unification/migration/ledger-v1.json'
export const PAPER_ASSETS_REL = 'app/public/paper-assets'
export const CONFIG_ROOT_REL = 'scripts/import-pipeline/papers'
export const DB_REL = 'data/question-bank.sqlite'

const EXPECTED_COUNTS = Object.freeze({
  papers: 33,
  groups: 273,
  objectiveQuestions: 1530,
  questionOwnedAbcdSets: 1035,
})

const FAMILY_ORDER = Object.freeze([
  'reading',
  'seven-choices',
  'cloze',
  'grammar-fill',
  'application-writing',
  'continuation-writing',
])

const PROFILE_SHAPES = Object.freeze([
  {
    profileId: 'nck1',
    artifactId: 'profile-nck1',
    path: 'profiles/nck1-v10.json',
    groups: { reading: 4, 'seven-choices': 1, cloze: 1, 'grammar-fill': 1, writing: 2 },
    questions: { reading: 15, 'seven-choices': 5, cloze: 15, 'grammar-fill': 10 },
  },
  {
    profileId: 'national-legacy',
    artifactId: 'profile-national-legacy',
    path: 'profiles/national-legacy-v3.json',
    groups: { reading: 4, 'seven-choices': 1, cloze: 1, 'grammar-fill': 1, writing: 0 },
    questions: { reading: 15, 'seven-choices': 5, cloze: 20, 'grammar-fill': 10 },
  },
  {
    profileId: 'zhejiang-legacy',
    artifactId: 'profile-zhejiang-legacy',
    path: 'profiles/zhejiang-legacy-v7.json',
    groups: { reading: 3, 'seven-choices': 1, cloze: 1, 'grammar-fill': 1, writing: 2 },
    questions: { reading: 10, 'seven-choices': 5, cloze: 20, 'grammar-fill': 10 },
  },
])

const FAMILY_BY_GROUP_TYPE = Object.freeze({
  reading: 'reading',
  sevenChoices: 'seven-choices',
  cloze: 'cloze',
  grammarFill: 'grammar-fill',
})

const OBJECTIVE_FAMILIES = new Set(['reading', 'seven-choices', 'cloze', 'grammar-fill'])

const SOURCE_ROLE_BY_FILE = Object.freeze({
  'paper-asset.json': 'asset-projection',
  'answer-key.json': 'official-answer-lead',
  'import-meta.json': 'source-provenance',
  'analyses/cloze-analysis-v1.json': 'analysis-supplement',
  'analyses/grammar-fill-analysis-v1.json': 'analysis-supplement',
  'analyses/reading-choice-analysis-v1.json': 'analysis-supplement',
  'analyses/seven-choices-analysis-v1.json': 'analysis-supplement',
  'analyses/writing-analysis-v1.json': 'analysis-supplement',
  'figures/manifest.json': 'figure-inventory',
  'listening/questions.json': 'listening-question-source',
  'listening/answers.json': 'listening-official-answer-lead',
  'listening/transcript.json': 'listening-transcript-source',
})

function abs(rel) {
  return path.join(ROOT, rel)
}

function posixRel(value) {
  return value.split(path.sep).join('/')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    )
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function digestJson(value) {
  return `sha256:${sha256(stableStringify(value))}`
}

function withoutKey(value, key) {
  const copy = { ...value }
  delete copy[key]
  return copy
}

function readJson(rel) {
  return JSON.parse(readFileSync(abs(rel), 'utf8'))
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function gitPreflight({ strictHead = false, allowDirty = false } = {}) {
  const branch = git(['branch', '--show-current'])
  const head = git(['rev-parse', 'HEAD'])
  const status = git(['status', '--porcelain=v1'])
  if (branch !== EXPECTED_BRANCH) {
    throw new Error(`branch mismatch: expected ${EXPECTED_BRANCH}, got ${branch || '(detached)'}`)
  }
  if (strictHead && head !== INPUT_FIXED_POINT) {
    throw new Error(`HEAD mismatch: expected ${INPUT_FIXED_POINT}, got ${head}`)
  }
  if (!allowDirty && status !== '') {
    throw new Error('worktree is not clean')
  }

  // After the implementation commit, the current HEAD is allowed to move,
  // but the immutable census inputs must still be byte-identical to the
  // declared fixed point. This keeps a later writer or scope drift fail-closed.
  if (head !== INPUT_FIXED_POINT) {
    const diff = execFileSync(
      'git',
      [
        'diff',
        '--quiet',
        INPUT_FIXED_POINT,
        '--',
        PAPER_ASSETS_REL,
        CONFIG_ROOT_REL,
        DB_REL,
        'standards/paper-canonical',
        'shared/paper-canonical',
      ],
      { cwd: ROOT, stdio: 'ignore' },
    )
    void diff
  }
  return { branch, head, status }
}

function walkFiles(rootRel) {
  const rootAbs = abs(rootRel)
  if (!existsSync(rootAbs)) return []
  const result = []
  function visit(currentAbs, currentRel) {
    const entries = readdirSync(currentAbs, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const nextRel = posixRel(path.join(currentRel, entry.name))
      const nextAbs = path.join(currentAbs, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`symlink is not an immutable corpus input: ${nextRel}`)
      if (entry.isDirectory()) visit(nextAbs, nextRel)
      else if (entry.isFile()) result.push({ abs: nextAbs, rel: nextRel })
      else throw new Error(`unsupported filesystem entry in corpus: ${nextRel}`)
    }
  }
  visit(rootAbs, '')
  return result
}

function fileRole(relativePath) {
  return SOURCE_ROLE_BY_FILE[relativePath] || 'corpus-extra'
}

function fileRecord(rootRel, file) {
  const bytes = readFileSync(file.abs)
  return {
    path: posixRel(path.join(rootRel, file.rel)),
    relativePath: file.rel,
    role: fileRole(file.rel),
    byteLength: bytes.length,
    sha256: sha256(bytes),
  }
}

function inventoryTree(rootRel) {
  const files = walkFiles(rootRel).map((file) => fileRecord(rootRel, file))
  const treeInput = files
    .map((file) => `${file.relativePath}\t${file.byteLength}\t${file.sha256}\n`)
    .join('')
  return {
    path: rootRel,
    present: existsSync(abs(rootRel)),
    fileCount: files.length,
    byteLength: files.reduce((total, file) => total + file.byteLength, 0),
    treeDigest: `sha256:${sha256(treeInput)}`,
    files,
  }
}

function fileByRelativePath(tree, relativePath) {
  return tree.files.find((file) => file.relativePath === relativePath) || null
}

function evidenceRef(file, kind = 'asset') {
  if (!file) return { kind, present: false, path: null, byteLength: null, sha256: null }
  return {
    kind,
    present: true,
    path: file.path,
    byteLength: file.byteLength,
    sha256: file.sha256,
  }
}

function flattenStrings(value, result = []) {
  if (typeof value === 'string') result.push(value)
  else if (Array.isArray(value)) value.forEach((item) => flattenStrings(item, result))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => flattenStrings(item, result))
  return result
}

function countMatches(value, pattern) {
  return flattenStrings(value).reduce((count, text) => count + (text.match(pattern) || []).length, 0)
}

function isNonEmpty(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function canonicalFamily(group) {
  if (FAMILY_BY_GROUP_TYPE[group.groupType]) return FAMILY_BY_GROUP_TYPE[group.groupType]
  if (group.groupType === 'writing') {
    if (String(group.groupId).endsWith('-application')) return 'application-writing'
    if (String(group.groupId).endsWith('-continuation')) return 'continuation-writing'
  }
  return `unsupported:${String(group.groupType || 'missing')}`
}

function optionShape(question) {
  const labels = Array.isArray(question?.options) ? question.options.map((option) => option?.label) : []
  if (labels.length === 4 && labels.join('') === 'ABCD') return 'abcd'
  if (labels.length === 0) return 'none'
  return `other-${labels.length}`
}

function answerEntryCount(value) {
  if (Array.isArray(value)) return value.length
  if (!value || typeof value !== 'object') return 0
  const direct = value.answers ?? value.answerKey ?? value.answer_key
  if (Array.isArray(direct)) return direct.length
  if (direct && typeof direct === 'object') return Object.keys(direct).length
  return Object.keys(value).filter((key) => /^\d+$/.test(key) || /^q[-_]/i.test(key)).length
}

function shapeSummary(value) {
  const strings = flattenStrings(value)
  let arrays = 0
  let objects = 0
  function visit(node) {
    if (Array.isArray(node)) {
      arrays++
      node.forEach(visit)
    } else if (node && typeof node === 'object') {
      objects++
      Object.values(node).forEach(visit)
    }
  }
  visit(value)
  return { arrayCount: arrays, objectCount: objects, stringCount: strings.length }
}

function profileCandidate(familyCounts, authorityManifest) {
  const shape = PROFILE_SHAPES.find((candidate) => {
    for (const [family, count] of Object.entries(candidate.groups)) {
      if ((familyCounts[family]?.groupCount || 0) !== count) return false
    }
    for (const [family, count] of Object.entries(candidate.questions)) {
      if ((familyCounts[family]?.questionCount || 0) !== count) return false
    }
    return true
  })
  if (!shape) {
    return {
      status: 'unresolved',
      candidateProfileId: null,
      authorityArtifact: null,
      basis: 'whole-paper-family-and-question-cardinality',
    }
  }
  const artifact = authorityManifest.artifacts.find((item) => item.id === shape.artifactId)
  if (!artifact) throw new Error(`authority manifest is missing ${shape.artifactId}`)
  const authorityPath = posixRel(path.join('standards/paper-canonical', artifact.path))
  const profile = readJson(authorityPath)
  const profileFile = inventoryTree(path.dirname(authorityPath)).files.find(
    (file) => file.path === authorityPath,
  )
  return {
    status: 'candidate_not_source_confirmed',
    candidateProfileId: profile.profileId,
    candidateProfileVersion: profile.version,
    authorityArtifact: {
      id: artifact.id,
      path: authorityPath,
      byteLength: profileFile?.byteLength ?? statSync(abs(authorityPath)).size,
      fileSha256: profileFile?.sha256 ?? sha256(readFileSync(abs(authorityPath))),
      authorityDigest: artifact.sha256,
    },
    basis: 'whole-paper-family-and-question-cardinality',
  }
}

function actionsFor(code) {
  if (code.includes('source') || code.includes('figure') || code.includes('listening')) {
    return ['restore_or_recapture_immutable_source_evidence']
  }
  if (code.includes('marker') || code.includes('ordinal') || code.includes('heading')) {
    return ['source_bound_boundary_or_marker_review']
  }
  if (code.includes('continuation') || code.includes('application') || code.includes('writing')) {
    return ['source_bound_writing_shape_review']
  }
  if (code.includes('title')) return ['source_bound_metadata_review']
  return ['review_known_corpus_anomaly']
}

function makeAnomaly({ paperId, code, scope, family = null, evidence }) {
  return {
    id: `anomaly.${code}.${paperId}.${scope}`,
    code,
    paperId,
    scope,
    family,
    disposition: 'needs_review',
    recoveryActions: actionsFor(code),
    evidenceRefs: evidence,
  }
}

function summarizeWritingTask(asset, group) {
  const taskId = group.writingTaskId || null
  const tasks = asset.content?.writingTasks || {}
  const task = taskId && !Array.isArray(tasks) ? tasks[taskId] : null
  const isApplication = group.groupId.endsWith('-application')
  const isContinuation = group.groupId.endsWith('-continuation')
  const applicationGiven = task?.applicationGiven
  const starters = task?.continuationStarters ?? task?.starters ?? task?.paragraphStarters ?? []
  return {
    taskId,
    present: Boolean(task),
    applicationGiven: isApplication
      ? applicationGiven === undefined
        ? 'absent'
        : isNonEmpty(applicationGiven)
          ? 'present_nonempty'
          : 'present_empty'
      : null,
    starterCount: isContinuation && Array.isArray(starters) ? starters.length : null,
    fieldShape: task ? Object.keys(task).sort() : [],
  }
}

function collectAnomalies({ paperId, asset, meta, tree, groupDetails, source, writingSummaries }) {
  const anomalies = []
  const assetFile = fileByRelativePath(tree, 'paper-asset.json')
  const metaFile = fileByRelativePath(tree, 'import-meta.json')
  const answerFile = fileByRelativePath(tree, 'answer-key.json')
  const evidence = [
    evidenceRef(assetFile, 'asset-projection'),
    evidenceRef(metaFile, 'source-provenance'),
    evidenceRef(answerFile, 'official-answer-lead'),
  ]

  if (source.declaredSourceType !== source.observedSourceExtension) {
    anomalies.push(makeAnomaly({
      paperId,
      code: 'source-type-mismatch',
      scope: 'primary',
      family: null,
      evidence,
    }))
  }
  if (source.sourceDigest !== meta.sourceFileSha256 || source.sourceDigest !== asset.sources?.docx?.sha256) {
    anomalies.push(makeAnomaly({
      paperId,
      code: 'source-digest-mismatch',
      scope: 'primary',
      family: null,
      evidence,
    }))
  }

  for (const detail of groupDetails) {
    if (detail.family === 'reading') {
      for (const question of detail.readingSuffixQuestionNos) {
        anomalies.push(makeAnomaly({
          paperId,
          code: 'reading-heading-suffix',
          scope: `${detail.groupId}-q${question}`,
          family: 'reading',
          evidence,
        }))
      }
    }
    if (detail.family === 'seven-choices' && detail.longMarkerCount > 0) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'mixed-seven-marker-dialect',
        scope: detail.groupId,
        family: 'seven-choices',
        evidence,
      }))
    }
    if (detail.family === 'seven-choices' && detail.markerOrdinalCount > 0) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'seven-marker-local-ordinal',
        scope: detail.groupId,
        family: 'seven-choices',
        evidence,
      }))
    }
    if (detail.family === 'grammar-fill' && detail.longMarkerCount > 0) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'mixed-grammar-marker-dialect',
        scope: detail.groupId,
        family: 'grammar-fill',
        evidence,
      }))
    }
    if (detail.family === 'grammar-fill' && detail.markerOrdinalCount > 0) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'grammar-marker-local-ordinal',
        scope: detail.groupId,
        family: 'grammar-fill',
        evidence,
      }))
    }
  }

  for (const writing of writingSummaries) {
    if (writing.family === 'application-writing' && writing.applicationGiven === 'present_empty') {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'application-given-empty',
        scope: writing.groupId,
        family: 'application-writing',
        evidence,
      }))
    }
    if (writing.family === 'continuation-writing' && writing.starterCount !== null && writing.starterCount !== 2) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'continuation-starter-cardinality',
        scope: `${writing.groupId}-${writing.starterCount}`,
        family: 'continuation-writing',
        evidence,
      }))
    }
  }

  if (!fileByRelativePath(tree, 'analyses/writing-analysis-v1.json') && writingSummaries.length > 0) {
    anomalies.push(makeAnomaly({
      paperId,
      code: 'writing-analysis-missing',
      scope: 'writing',
      family: null,
      evidence,
    }))
  }

  const title = asset.paper?.title
  if (title === 'paper' || title === 'source') {
    anomalies.push(makeAnomaly({
      paperId,
      code: 'placeholder-paper-title',
      scope: 'paper',
      family: null,
      evidence,
    }))
  }

  const figureManifest = fileByRelativePath(tree, 'figures/manifest.json')
  if (figureManifest) {
    const figures = readJson(figureManifest.path)
    const entries = Array.isArray(figures.figures) ? figures.figures : []
    if (entries.some((figure) => figure.pixelWidth == null || figure.pixelHeight == null || figure.sha256 == null)) {
      anomalies.push(makeAnomaly({
        paperId,
        code: 'figure-manifest-incomplete-digest',
        scope: 'figures',
        family: 'reading',
        evidence: [evidenceRef(figureManifest, 'figure-inventory'), ...evidence],
      }))
    }
  }

  return anomalies.sort((a, b) => a.id.localeCompare(b.id))
}

function buildGroupDetails({ paperId, asset }) {
  const groups = Object.values(asset.content?.groups || {})
  const questions = asset.content?.questions || {}
  return groups.map((group) => {
    const family = canonicalFamily(group)
    const groupQuestions = (group.questionIds || []).map((id) => questions[id]).filter(Boolean)
    const strings = flattenStrings(group)
    const readingSuffixQuestionNos = family === 'reading'
      ? groupQuestions
        .filter((question) => /(?:^|\s)[ABCD](?:[.)])?\s*$/.test(String(question.stem || '')))
        .map((question) => question.questionNo)
      : []
    const markerOrdinalPattern = family === 'grammar-fill'
      ? /(?:_{2,}\d{1,3}_{2,}|_{5,}|\d{1,3}\._{3,})\s*(?:[.)]\s*)?\d+\b/g
      : /_{2,}\d{1,3}_{2,}\s*\d+\b/g
    const markerOrdinalCount = strings.reduce((count, text) => count + (text.match(markerOrdinalPattern) || []).length, 0)
    const longMarkerPattern = family === 'grammar-fill'
      ? /\d{1,3}\._{3,}/g
      : /_{3,}\d{1,3}_{3,}/g
    const longMarkerCount = strings.reduce((count, text) => count + (text.match(longMarkerPattern) || []).length, 0)
    const shapeCounts = {}
    for (const question of groupQuestions) {
      const shape = optionShape(question)
      shapeCounts[shape] = (shapeCounts[shape] || 0) + 1
    }
    return {
      groupId: group.groupId,
      family,
      groupType: group.groupType,
      questionCount: groupQuestions.length,
      blankCount: Array.isArray(group.blankIds) ? group.blankIds.length : 0,
      questionOwnedAbcdSets: groupQuestions.filter((question) => optionShape(question) === 'abcd').length,
      optionShapeCounts: Object.fromEntries(Object.entries(shapeCounts).sort(([a], [b]) => a.localeCompare(b))),
      optionBankCount: Array.isArray(group.optionBank) ? group.optionBank.length : 0,
      readingSuffixQuestionNos,
      markerOrdinalCount,
      longMarkerCount,
      writing: family === 'application-writing' || family === 'continuation-writing'
        ? summarizeWritingTask(asset, group)
        : null,
    }
  }).sort((a, b) => a.groupId.localeCompare(b.groupId))
}

function summarizeFamilies(groupDetails) {
  const result = {}
  for (const family of [...FAMILY_ORDER, 'writing']) {
    const rows = groupDetails.filter((group) => group.family === family || (family === 'writing' && group.groupType === 'writing'))
    result[family] = {
      groupCount: rows.length,
      groupIds: rows.map((row) => row.groupId).sort(),
      questionCount: rows.reduce((sum, row) => sum + row.questionCount, 0),
      blankCount: rows.reduce((sum, row) => sum + row.blankCount, 0),
      objectiveQuestionCount: rows
        .filter((row) => OBJECTIVE_FAMILIES.has(row.family))
        .reduce((sum, row) => sum + row.questionCount, 0),
      questionOwnedAbcdSets: rows.reduce((sum, row) => sum + row.questionOwnedAbcdSets, 0),
      optionBankCount: rows.reduce((sum, row) => sum + row.optionBankCount, 0),
    }
  }
  return result
}

function summarizeSource({ paperId, asset, meta, tree }) {
  const source = asset.sources?.docx || asset.sources?.pdf || {}
  const fileName = String(source.fileName || meta.sourceFileName || '')
  const extension = path.extname(fileName).slice(1).toLowerCase() || 'unknown'
  return {
    roles: [
      {
        role: 'question_source',
        evidenceRef: evidenceRef(fileByRelativePath(tree, 'import-meta.json'), 'source-provenance'),
        sourceDigest: source.sha256 || meta.sourceFileSha256 || null,
        sourceFileNameDigest: fileName ? `sha256:${sha256(fileName)}` : null,
        declaredSourceType: asset.sources?.primarySourceType || null,
        observedSourceExtension: extension,
      },
      {
        role: 'official_answer_lead',
        evidenceRef: evidenceRef(fileByRelativePath(tree, 'answer-key.json'), 'official-answer-lead'),
        sourceDigest: null,
        sourceFileNameDigest: null,
        declaredSourceType: null,
        observedSourceExtension: null,
      },
    ],
    declaredSourceType: asset.sources?.primarySourceType || null,
    observedSourceExtension: extension,
    sourceDigest: source.sha256 || meta.sourceFileSha256 || null,
    sourceDigestMatchesAssetAndMeta: source.sha256 === meta.sourceFileSha256 && source.sha256 === asset.sources?.docx?.sha256,
  }
}

function summarizeExtras({ tree, paperId }) {
  const files = tree.files.filter((file) => file.relativePath.startsWith('figures/') || file.relativePath.startsWith('listening/'))
  const figureFiles = files.filter((file) => file.relativePath.startsWith('figures/'))
  const listeningFiles = files.filter((file) => file.relativePath.startsWith('listening/'))
  const figureManifest = fileByRelativePath(tree, 'figures/manifest.json')
  const listeningShape = {}
  for (const file of listeningFiles) listeningShape[file.relativePath.slice('listening/'.length)] = shapeSummary(readJson(file.path))
  const figureData = figureManifest ? readJson(figureManifest.path) : null
  return {
    figures: {
      present: figureFiles.length > 0,
      files: figureFiles.map((file) => evidenceRef(file, 'figure-extra')),
      entryCount: Array.isArray(figureData?.figures) ? figureData.figures.length : 0,
      entryIds: Array.isArray(figureData?.figures)
        ? figureData.figures.map((figure) => figure.figureId).filter(Boolean).sort()
        : [],
    },
    listening: {
      present: listeningFiles.length > 0,
      files: listeningFiles.map((file) => evidenceRef(file, 'listening-extra')),
      shapes: listeningShape,
    },
    canonicalSidecars: tree.files
      .filter((file) => /(?:paper-normalized-groups-v1|canonical-paper-publication|canonical-paper-publication-ref)/.test(file.relativePath))
      .map((file) => evidenceRef(file, 'canonical-sidecar')),
    paperId,
  }
}

function summarizeAnswerKey({ tree }) {
  const file = fileByRelativePath(tree, 'answer-key.json')
  if (!file) return { present: false, path: null, byteLength: null, sha256: null, entryCount: null }
  const value = readJson(file.path)
  return {
    present: true,
    path: file.path,
    byteLength: file.byteLength,
    sha256: file.sha256,
    entryCount: answerEntryCount(value),
    valuesRecorded: false,
  }
}

function summarizeFilesystemVersions({ paperId }) {
  const versionsRoot = `${PAPER_ASSETS_REL}/${paperId}/versions`
  const versions = walkFiles(versionsRoot)
  const versionNames = [...new Set(versions.map((file) => file.rel.split('/')[0]).filter(Boolean))]
    .filter((name) => /^v\d+$/.test(name))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  return {
    path: versionsRoot,
    present: existsSync(abs(versionsRoot)),
    versionNames,
    versionCount: versionNames.length,
    versionTrees: versionNames.map((versionName) => inventoryTree(`${versionsRoot}/${versionName}`)),
  }
}

function getDbSnapshot() {
  const dbPath = abs(DB_REL)
  if (!existsSync(dbPath)) return { present: false, path: DB_REL, byteLength: null, sha256: null, inventory: null }
  const bytes = readFileSync(dbPath)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const versionRows = db.prepare(`
    SELECT id, paper_id, asset_version, version_name, version_dir, source_file_sha256, status
    FROM paper_asset_versions
    ORDER BY paper_id, asset_version, id
  `).all()
  const sourceRows = db.prepare(`
    SELECT id, source_type, file_ref
    FROM sources
    WHERE file_ref LIKE 'paper-assets/%'
    ORDER BY file_ref, id
  `).all()
  const importRows = db.prepare(`
    SELECT id, paper_id, asset_version, status,
      validation_report_json, publish_report_json, error_message
    FROM paper_import_runs
    ORDER BY paper_id, asset_version, id
  `).all()
  const canonicalRows = db.prepare(`
    SELECT paper_id, version_name, source_asset_version, publication_digest, is_current
    FROM canonical_paper_publications
    ORDER BY paper_id, version_name
  `).all()
  const sourceTypeCounts = db.prepare(`
    SELECT source_type, COUNT(*) AS count
    FROM sources
    WHERE file_ref LIKE 'paper-assets/%'
    GROUP BY source_type
    ORDER BY source_type
  `).all()
  db.close()
  const sanitizedImportRows = importRows.map((row) => ({
    id: row.id,
    paperId: row.paper_id,
    assetVersion: row.asset_version,
    status: row.status,
    validationReportSha256: `sha256:${sha256(row.validation_report_json || '')}`,
    publishReportSha256: `sha256:${sha256(row.publish_report_json || '')}`,
    errorSha256: `sha256:${sha256(row.error_message || '')}`,
  }))
  return {
    present: true,
    path: DB_REL,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    inventory: {
      versionRows,
      versionRowCount: versionRows.length,
      versionPaperCount: new Set(versionRows.map((row) => row.paper_id)).size,
      sourceRows,
      sourceRowCount: sourceRows.length,
      sourceTypeCounts,
      importRuns: sanitizedImportRows,
      importRunCount: sanitizedImportRows.length,
      canonicalPublicationRows: canonicalRows,
      canonicalPublicationCount: canonicalRows.length,
    },
  }
}

function dbRefsForPaper({ paperId, dbSnapshot }) {
  if (!dbSnapshot.present) {
    return { databasePresent: false, versionRows: [], sourceRefs: [], importRuns: [], canonicalPublications: [] }
  }
  return {
    databasePresent: true,
    versionRows: dbSnapshot.inventory.versionRows.filter((row) => row.paper_id === paperId),
    sourceRefs: dbSnapshot.inventory.sourceRows.filter((row) => row.file_ref === `paper-assets/${paperId}`),
    importRuns: dbSnapshot.inventory.importRuns.filter((row) => row.paperId === paperId),
    canonicalPublications: dbSnapshot.inventory.canonicalPublicationRows.filter((row) => row.paper_id === paperId),
  }
}

function inventoryConfigFiles() {
  return walkFiles(CONFIG_ROOT_REL)
    .filter((file) => file.rel.endsWith('/config.json'))
    .map((file) => fileRecord(CONFIG_ROOT_REL, file))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function configPaperIds(configFiles) {
  return configFiles
    .map((file) => file.relativePath.split('/')[0])
    .sort()
}

function buildAuthoritySummary() {
  const manifestPath = 'standards/paper-canonical/manifest-v35.json'
  const manifestBytes = readFileSync(abs(manifestPath))
  const manifest = JSON.parse(manifestBytes)
  if (canonicalAuthorityRef.manifestId !== manifest.manifestId || canonicalAuthorityRef.manifestVersion !== manifest.version) {
    throw new Error('canonical authority reference does not point to Manifest v35')
  }
  const consumers = [
    { id: 'screen', path: 'standards/paper-canonical/consumers/screen-v35.json' },
    { id: 'print_pdf', path: 'standards/paper-canonical/consumers/print-pdf-v36.json' },
  ].map(({ id, path: contractPath }) => {
    const bytes = readFileSync(abs(contractPath))
    const contract = JSON.parse(bytes)
    const ref = consumerContractRefs[id]
    if (!ref || contract.contractDigest !== ref.digest || contract.version !== ref.version) {
      throw new Error(`consumer authority mismatch for ${id}`)
    }
    return {
      id,
      version: contract.version,
      path: contractPath,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      authorityManifestDigest: contract.authorityManifestDigest,
      contractDigest: contract.contractDigest,
      legacyCapabilities: Object.fromEntries(
        contract.families.map((family) => [family.familyContractId, family.legacyCapability]),
      ),
    }
  })
  return {
    manifest: {
      id: manifest.manifestId,
      version: manifest.version,
      path: manifestPath,
      byteLength: manifestBytes.length,
      fileSha256: sha256(manifestBytes),
      authorityDigest: canonicalAuthorityRef.manifestDigest,
    },
    profileArtifacts: PROFILE_SHAPES.map((shape) => {
      const artifact = manifest.artifacts.find((item) => item.id === shape.artifactId)
      if (!artifact) throw new Error(`authority manifest is missing ${shape.artifactId}`)
      const profilePath = posixRel(path.join('standards/paper-canonical', artifact.path))
      const bytes = readFileSync(abs(profilePath))
      const profile = JSON.parse(bytes)
      return {
        id: artifact.id,
        profileId: profile.profileId,
        version: profile.version,
        path: profilePath,
        byteLength: bytes.length,
        fileSha256: sha256(bytes),
        authorityDigest: artifact.sha256,
      }
    }),
    consumers,
  }
}

function buildCorpusState({ latestIds, configFiles, dbSnapshot, authority }) {
  const latestTrees = latestIds.map((paperId) => inventoryTree(`${PAPER_ASSETS_REL}/${paperId}/latest`))
  const configInventory = {
    path: CONFIG_ROOT_REL,
    files: configFiles,
    fileCount: configFiles.length,
    treeDigest: `sha256:${sha256(configFiles.map((file) => `${file.path}\t${file.byteLength}\t${file.sha256}\n`).join(''))}`,
  }
  const stateValue = {
    latestTrees: latestTrees.map((tree) => ({ path: tree.path, fileCount: tree.fileCount, byteLength: tree.byteLength, treeDigest: tree.treeDigest })),
    configInventory,
    database: dbSnapshot.present
      ? { path: dbSnapshot.path, byteLength: dbSnapshot.byteLength, sha256: dbSnapshot.sha256 }
      : { path: dbSnapshot.path, present: false },
    authority: {
      manifest: `${authority.manifest.fileSha256}:${authority.manifest.authorityDigest}`,
      profiles: authority.profileArtifacts.map((profile) => `${profile.id}:${profile.fileSha256}:${profile.authorityDigest}`).sort(),
      consumers: authority.consumers.map((consumer) => `${consumer.id}:${consumer.sha256}:${consumer.contractDigest}`).sort(),
    },
  }
  return {
    stateDigest: digestJson(stateValue),
    latestTrees,
    configInventory,
    database: dbSnapshot.present
      ? { path: dbSnapshot.path, present: true, byteLength: dbSnapshot.byteLength, sha256: dbSnapshot.sha256 }
      : { path: dbSnapshot.path, present: false, byteLength: null, sha256: null },
  }
}

function buildManifest() {
  const authority = buildAuthoritySummary()
  const latestPaperIds = readdirSync(abs(PAPER_ASSETS_REL), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const configFiles = inventoryConfigFiles()
  const configIds = configPaperIds(configFiles)
  const dbSnapshot = getDbSnapshot()
  const beforeState = buildCorpusState({ latestIds: latestPaperIds, configFiles, dbSnapshot, authority })
  const papers = latestPaperIds.map((paperId, index) => {
    const tree = beforeState.latestTrees[index]
    const asset = readJson(`${PAPER_ASSETS_REL}/${paperId}/latest/paper-asset.json`)
    const meta = readJson(`${PAPER_ASSETS_REL}/${paperId}/latest/import-meta.json`)
    const groupDetails = buildGroupDetails({ paperId, asset })
    const families = summarizeFamilies(groupDetails)
    const source = summarizeSource({ paperId, asset, meta, tree })
    const writingSummaries = groupDetails
      .filter((group) => group.family === 'application-writing' || group.family === 'continuation-writing')
      .map((group) => ({ family: group.family, groupId: group.groupId, ...group.writing }))
    const anomalies = collectAnomalies({
      paperId,
      asset,
      meta,
      tree,
      groupDetails,
      source,
      writingSummaries,
    })
    return {
      paperId,
      latestTree: tree,
      asset: {
        schemaVersion: asset.schemaVersion || null,
        paperAssetVersion: asset.paper?.assetVersion ?? null,
        status: asset.paper?.status || 'unknown',
      },
      source,
      sourceRolesObserved: [...new Set(tree.files.map((file) => file.role))].sort(),
      profileCandidate: profileCandidate(families, readJson(authority.manifest.path)),
      families,
      groupDetails,
      objectiveQuestionCount: Object.values(families)
        .filter((family) => family.groupIds.some((groupId) => groupId.includes('-reading-') || groupId.includes('-seven-choices') || groupId.includes('-cloze') || groupId.includes('-grammar-fill')))
        .reduce((sum, family) => sum + family.objectiveQuestionCount, 0),
      questionOwnedAbcdSets: Object.values(families).reduce((sum, family) => sum + family.questionOwnedAbcdSets, 0),
      answerKey: summarizeAnswerKey({ tree }),
      extras: summarizeExtras({ tree, paperId }),
      filesystemVersions: summarizeFilesystemVersions({ paperId }),
      databaseRefs: dbRefsForPaper({ paperId, dbSnapshot }),
      anomalies,
      anomalyIds: anomalies.map((anomaly) => anomaly.id),
    }
  })

  const paperGroups = papers.reduce((sum, paper) => sum + paper.groupDetails.length, 0)
  const objectiveQuestions = papers.reduce((sum, paper) => sum + paper.groupDetails
    .filter((group) => OBJECTIVE_FAMILIES.has(group.family))
    .reduce((groupSum, group) => groupSum + group.questionCount, 0), 0)
  const abcdSets = papers.reduce((sum, paper) => sum + paper.questionOwnedAbcdSets, 0)
  const configOnly = configIds.filter((id) => !latestPaperIds.includes(id))
  const latestOnly = latestPaperIds.filter((id) => !configIds.includes(id))
  const dbInventory = dbSnapshot.present
    ? {
      path: dbSnapshot.path,
      present: true,
      byteLength: dbSnapshot.byteLength,
      sha256: dbSnapshot.sha256,
      versionRows: dbSnapshot.inventory.versionRowCount,
      versionPapers: dbSnapshot.inventory.versionPaperCount,
      sourceRows: dbSnapshot.inventory.sourceRowCount,
      importRuns: dbSnapshot.inventory.importRunCount,
      canonicalPublicationRows: dbSnapshot.inventory.canonicalPublicationCount,
      sourceTypeCounts: dbSnapshot.inventory.sourceTypeCounts,
    }
    : { path: DB_REL, present: false, byteLength: null, sha256: null }

  if (latestPaperIds.length !== EXPECTED_COUNTS.papers || paperGroups !== EXPECTED_COUNTS.groups || objectiveQuestions !== EXPECTED_COUNTS.objectiveQuestions || abcdSets !== EXPECTED_COUNTS.questionOwnedAbcdSets) {
    throw new Error(`accepted denominator mismatch: ${JSON.stringify({ papers: latestPaperIds.length, groups: paperGroups, objectiveQuestions, questionOwnedAbcdSets: abcdSets })}`)
  }

  const afterState = buildCorpusState({ latestIds: latestPaperIds, configFiles, dbSnapshot: getDbSnapshot(), authority: buildAuthoritySummary() })
  if (beforeState.stateDigest !== afterState.stateDigest) {
    throw new Error('concurrent writer detected: corpus state changed during census')
  }

  const manifest = {
    schemaVersion: 'paper-canonical-migration-manifest-v1',
    manifestId: 'paper-canonical-migration',
    version: '1',
    binding: {
      inputFixedPoint: INPUT_FIXED_POINT,
      expectedBranch: EXPECTED_BRANCH,
      corpusRoot: PAPER_ASSETS_REL,
      corpusSelector: '*/latest',
      sourceAuthority: 'checked-in latest bytes, not import config or DB version paths',
    },
    authority,
    census: {
      fixedPoint: INPUT_FIXED_POINT,
      denominator: {
        papers: latestPaperIds.length,
        groups: paperGroups,
        objectiveQuestions,
        questionOwnedAbcdSets: abcdSets,
      },
      familyTotals: FAMILY_ORDER.reduce((result, family) => {
        result[family] = papers.reduce((sum, paper) => sum + (paper.families[family]?.groupCount || 0), 0)
        return result
      }, {}),
      profileCandidateTotals: PROFILE_SHAPES.reduce((result, shape) => {
        result[shape.profileId] = papers.filter((paper) => paper.profileCandidate.candidateProfileId === shape.profileId).length
        return result
      }, {}),
    },
    corpusInputs: {
      latestPaperIds,
      latestPaperCount: latestPaperIds.length,
      configInventory: beforeState.configInventory,
      configPaperIds: configIds,
      configOnlyPaperIds: configOnly,
      latestOnlyPaperIds: latestOnly,
      configLatestSetEqual: configOnly.length === 0 && latestOnly.length === 0,
      database: dbInventory,
    },
    filesystemState: {
      versions: {
        presentVersionDirectoryCount: papers.reduce((sum, paper) => sum + paper.filesystemVersions.versionCount, 0),
        papersWithVersionDirectories: papers.filter((paper) => paper.filesystemVersions.versionCount > 0).map((paper) => paper.paperId),
        recordedPerPaper: papers.map((paper) => ({ paperId: paper.paperId, ...paper.filesystemVersions })),
      },
      canonicalSidecars: {
        count: papers.reduce((sum, paper) => sum + paper.extras.canonicalSidecars.length, 0),
        files: papers.flatMap((paper) => paper.extras.canonicalSidecars),
      },
      latestTrees: papers.map((paper) => ({
        paperId: paper.paperId,
        path: paper.latestTree.path,
        treeDigest: paper.latestTree.treeDigest,
        fileCount: paper.latestTree.fileCount,
        byteLength: paper.latestTree.byteLength,
      })),
    },
    databaseRefs: {
      versionRows: dbSnapshot.present ? dbSnapshot.inventory.versionRows : [],
      sourceRows: dbSnapshot.present ? dbSnapshot.inventory.sourceRows : [],
      importRuns: dbSnapshot.present ? dbSnapshot.inventory.importRuns : [],
      canonicalPublicationRows: dbSnapshot.present ? dbSnapshot.inventory.canonicalPublicationRows : [],
    },
    rollbackState: {
      operation: 'not_attempted',
      canonicalPublicationRows: dbSnapshot.present ? dbSnapshot.inventory.canonicalPublicationCount : null,
      currentPublicationRefs: papers.filter((paper) => paper.databaseRefs.canonicalPublications.length > 0).map((paper) => paper.paperId),
      latestSwapJournalCount: papers.reduce((sum, paper) => sum + paper.latestTree.files.filter((file) => file.relativePath === '.latest-swap.json').length, 0),
      availableRollbackTargets: papers.flatMap((paper) => paper.databaseRefs.canonicalPublications),
      missingFilesystemVersionRefs: dbSnapshot.present
        ? dbSnapshot.inventory.versionRows.filter((row) => !existsSync(abs(row.version_dir))).map((row) => ({
          paperId: row.paper_id,
          versionName: row.version_name,
          versionDir: row.version_dir,
        }))
        : [],
    },
    papers,
    stateProof: {
      mode: 'read_only_census',
      comparedState: 'latest trees, import configs, question-bank database bytes, and canonical authority refs',
      beforeStateDigest: beforeState.stateDigest,
      afterStateDigest: afterState.stateDigest,
      equal: beforeState.stateDigest === afterState.stateDigest,
      mutationCount: 0,
      writesPerformedByCensus: [],
    },
  }
  manifest.manifestDigest = digestJson(manifest)
  return { manifest, dbSnapshot, beforeState, afterState }
}

function anomalyIndex(manifest) {
  return new Map(manifest.papers.flatMap((paper) => paper.anomalies.map((anomaly) => [anomaly.id, anomaly])))
}

function buildLedger({ manifest, dbSnapshot }) {
  const anomalies = anomalyIndex(manifest)
  const corpusAnomalies = []
  if (manifest.corpusInputs.configOnlyPaperIds.length || manifest.corpusInputs.latestOnlyPaperIds.length) {
    corpusAnomalies.push({
      id: 'anomaly.corpus.config-latest-set-drift',
      code: 'config-latest-set-drift',
      scope: 'corpus',
      disposition: 'needs_review',
      recoveryActions: ['retain_latest_as_denominator', 'record_config_provenance_drift'],
      evidenceRefs: [
        { kind: 'config-inventory', path: CONFIG_ROOT_REL, sha256: manifest.corpusInputs.configInventory.treeDigest },
        ...manifest.filesystemState.latestTrees.map((tree) => ({ kind: 'latest-tree', path: tree.path, sha256: tree.treeDigest })),
      ],
    })
  }
  if (manifest.filesystemState.versions.presentVersionDirectoryCount === 0 && (dbSnapshot?.inventory?.versionRowCount || 0) > 0) {
    corpusAnomalies.push({
      id: 'anomaly.corpus.database-version-refs-without-filesystem-trees',
      code: 'database-version-refs-without-filesystem-trees',
      scope: 'corpus',
      disposition: 'needs_review',
      recoveryActions: ['do_not_reconstruct_missing_historical_version_tree'],
      evidenceRefs: [{ kind: 'database', path: DB_REL, sha256: manifest.corpusInputs.database.sha256 }],
    })
  }
  const paperEntries = manifest.papers.map((paper) => {
    const paperAnomalies = paper.anomalies
    const actions = [...new Set(paperAnomalies.flatMap((anomaly) => anomaly.recoveryActions))].sort()
    const evidenceRefs = [
      evidenceRef(fileByRelativePath(paper.latestTree, 'paper-asset.json'), 'asset-projection'),
      evidenceRef(fileByRelativePath(paper.latestTree, 'import-meta.json'), 'source-provenance'),
      evidenceRef(fileByRelativePath(paper.latestTree, 'answer-key.json'), 'official-answer-lead'),
    ]
    return {
      queueId: `migration.paper.${paper.paperId}`,
      paperId: paper.paperId,
      orderKey: paper.paperId,
      scope: 'whole-paper',
      status: 'queued',
      primaryDisposition: 'queued',
      anomalyIds: paper.anomalyIds,
      recoveryActions: actions,
      immutableEvidenceRefs: evidenceRefs,
      dispositionHistory: [{ disposition: 'queued', attemptId: null, evidenceRefs }],
      failedAttempts: [],
      recompileAttempts: [],
      reviewDecision: null,
      publication: null,
      surfaceProof: null,
      rollbackProof: null,
      retainedAttemptCount: 0,
    }
  })
  const corpusEntry = {
    queueId: 'migration.corpus',
    paperId: null,
    orderKey: '',
    scope: 'corpus',
    status: 'queued',
    primaryDisposition: 'queued',
    anomalyIds: corpusAnomalies.map((anomaly) => anomaly.id),
    recoveryActions: [...new Set(corpusAnomalies.flatMap((anomaly) => anomaly.recoveryActions))].sort(),
    immutableEvidenceRefs: corpusAnomalies.flatMap((anomaly) => anomaly.evidenceRefs),
    dispositionHistory: [{ disposition: 'queued', attemptId: null, evidenceRefs: corpusAnomalies.flatMap((anomaly) => anomaly.evidenceRefs) }],
    failedAttempts: [],
    recompileAttempts: [],
    reviewDecision: null,
    publication: null,
    surfaceProof: null,
    rollbackProof: null,
    retainedAttemptCount: 0,
  }
  const queueEntries = [corpusEntry, ...paperEntries].sort((a, b) => a.queueId.localeCompare(b.queueId))
  const familyAccounting = {
    reading: { inScope: 126, pending: 126, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0 },
    'seven-choices': { inScope: 33, pending: 33, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0 },
    cloze: { inScope: 33, pending: 33, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0 },
    'grammar-fill': { inScope: 33, pending: 33, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0 },
    'application-writing': { inScope: 24, pending: 24, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0, profileBackedNA: 9 },
    'continuation-writing': { inScope: 24, pending: 24, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0, profileBackedNA: 9 },
    'listening-inactive': { inScope: 2, pending: 2, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0, paperCount: 1, questionCount: 20, transcriptSegmentCount: 10 },
  }
  const ledger = {
    schemaVersion: 'paper-canonical-migration-ledger-v1',
    ledgerId: 'paper-canonical-migration-ledger',
    version: '1',
    manifestPath: MANIFEST_REL,
    manifestDigest: manifest.manifestDigest,
    binding: manifest.binding,
    queue: {
      schemaVersion: 'migration-queue-v1',
      ordering: 'queueId ascending, paperId lexical within paper queues',
      entries: queueEntries,
      failedAttemptsRetained: true,
      queueEntryCount: queueEntries.length,
    },
    accounting: {
      paper: { inScope: EXPECTED_COUNTS.papers, pending: EXPECTED_COUNTS.papers, blocked: 0, readyUnpublished: 0, publishedUnverified: 0, canonicalSelected: 0, rolledBack: 0 },
      profile: Object.fromEntries(PROFILE_SHAPES.map((shape) => [shape.profileId, { inScope: manifest.census.profileCandidateTotals[shape.profileId], pending: manifest.census.profileCandidateTotals[shape.profileId], blocked: 0, canonicalSelected: 0 }])),
      family: familyAccounting,
      disposition: { queued: EXPECTED_COUNTS.papers, needs_review: 0, unsupported: 0, incomplete_source: 0, answer_conflict: 0, cleared: 0 },
      publication: { latestInputs: EXPECTED_COUNTS.papers, canonicalPublications: 0, canonicalSelected: 0, rollbackTargets: 0 },
      surfaces: { screen: { inScope: EXPECTED_COUNTS.papers, pending: EXPECTED_COUNTS.papers, pass: 0 }, printHtml: { inScope: EXPECTED_COUNTS.papers, pending: EXPECTED_COUNTS.papers, pass: 0 }, pdf: { inScope: EXPECTED_COUNTS.papers, pending: EXPECTED_COUNTS.papers, pass: 0 } },
      equations: {
        paper: 'pending + blocked + readyUnpublished + publishedUnverified + canonicalSelected + rolledBack = inScope',
        family: 'same equation for each family denominator; profile-backed N/A remains explicit',
      },
    },
    knownAnomalies: {
      paperAnomalyCount: anomalies.size,
      corpusAnomalies: corpusAnomalies,
      paperAnomalyIds: manifest.papers.flatMap((paper) => paper.anomalyIds).sort(),
    },
    retainedLegacyImportAttempts: manifest.databaseRefs.importRuns,
    zeroMutation: manifest.stateProof,
    scopeBoundary: {
      noCorrections: true,
      noPublication: true,
      noLatestSwitch: true,
      noRendering: true,
      noCompilerDryRun: true,
      noTicket22Action: true,
      copiedSourcePassages: false,
      copiedAnswers: false,
      copiedPrivateData: false,
      copiedCredentials: false,
      copiedMutableSourceBytes: false,
    },
  }
  ledger.ledgerDigest = digestJson(ledger)
  return ledger
}

function compareJson(actual, expected, label) {
  const actualStable = stableStringify(actual)
  const expectedStable = stableStringify(expected)
  if (actualStable !== expectedStable) {
    throw new Error(`${label} does not match the deterministic current census`)
  }
}

function assertNoRawSourcePayloads(value, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawSourcePayloads(item, `${location}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (/^(stem|text|content|prompt|passage|options|answer|explanation|summary|private|credential|secret|token)$/i.test(key)) {
      throw new Error(`raw source payload key is not permitted in ledger: ${location}.${key}`)
    }
    assertNoRawSourcePayloads(nested, `${location}.${key}`)
  }
}

function verifyArtifacts({ manifest, ledger, dbSnapshot }) {
  if (manifest.schemaVersion !== 'paper-canonical-migration-manifest-v1') throw new Error('manifest schema version mismatch')
  if (ledger.schemaVersion !== 'paper-canonical-migration-ledger-v1') throw new Error('ledger schema version mismatch')
  if (manifest.manifestDigest !== digestJson(withoutKey(manifest, 'manifestDigest'))) throw new Error('manifest digest mismatch')
  if (ledger.ledgerDigest !== digestJson(withoutKey(ledger, 'ledgerDigest'))) throw new Error('ledger digest mismatch')
  if (ledger.manifestDigest !== manifest.manifestDigest) throw new Error('ledger is not bound to manifest digest')
  if (JSON.stringify(manifest.census.denominator) !== JSON.stringify(EXPECTED_COUNTS)) throw new Error('denominator is not exact')
  if (manifest.papers.length !== EXPECTED_COUNTS.papers) throw new Error('paper denominator is not exact')
  if (manifest.stateProof.equal !== true || manifest.stateProof.mutationCount !== 0 || manifest.stateProof.writesPerformedByCensus.length !== 0) throw new Error('zero-mutation proof is not closed')
  if (ledger.scopeBoundary.noCorrections !== true || ledger.scopeBoundary.noPublication !== true || ledger.scopeBoundary.noLatestSwitch !== true || ledger.scopeBoundary.noRendering !== true || ledger.scopeBoundary.noCompilerDryRun !== true || ledger.scopeBoundary.noTicket22Action !== true) throw new Error('Ticket 21 scope boundary is not closed')
  assertNoRawSourcePayloads(manifest)
  assertNoRawSourcePayloads(ledger)
  const queueIds = ledger.queue.entries.map((entry) => entry.queueId)
  if (JSON.stringify(queueIds) !== JSON.stringify([...queueIds].sort())) throw new Error('queue ordering is not deterministic')
  if (new Set(queueIds).size !== queueIds.length) throw new Error('queue ids are not unique')
  if (ledger.queue.entries.length !== EXPECTED_COUNTS.papers + 1) throw new Error('queue fan-out is not 33 papers plus corpus')
  for (const paper of manifest.papers) {
    if (paper.latestTree.fileCount !== paper.latestTree.files.length) throw new Error(`file count mismatch for ${paper.paperId}`)
    const treeInput = paper.latestTree.files.map((file) => `${file.relativePath}\t${file.byteLength}\t${file.sha256}\n`).join('')
    if (paper.latestTree.treeDigest !== `sha256:${sha256(treeInput)}`) throw new Error(`tree digest mismatch for ${paper.paperId}`)
    if (paper.filesystemVersions.versionCount !== 0 && paper.filesystemVersions.versionCount !== paper.filesystemVersions.versionNames.length) throw new Error(`version inventory mismatch for ${paper.paperId}`)
    if (!paper.answerKey.present || !paper.answerKey.sha256 || !paper.answerKey.path) throw new Error(`answer key is not recorded for ${paper.paperId}`)
  }
  if (dbSnapshot.present && manifest.corpusInputs.database.versionRows !== dbSnapshot.inventory.versionRowCount) throw new Error('DB version row count drift')
}

function loadCheckedArtifacts() {
  if (!existsSync(abs(MANIFEST_REL)) || !existsSync(abs(LEDGER_REL))) throw new Error('Ticket 21 migration artifacts are missing')
  return { manifest: readJson(MANIFEST_REL), ledger: readJson(LEDGER_REL) }
}

function writeArtifacts(manifest, ledger) {
  mkdirSync(path.dirname(abs(MANIFEST_REL)), { recursive: true })
  writeFileSync(abs(MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(abs(LEDGER_REL), `${JSON.stringify(ledger, null, 2)}\n`)
}

function run() {
  const args = new Set(process.argv.slice(2))
  const write = args.has('--write')
  const strictPreflight = args.has('--preflight')
  const allowHeadMove = args.has('--allow-head-move')
  const allowDirty = !strictPreflight && args.has('--allow-dirty')
  const state = gitPreflight({ strictHead: strictPreflight || (write && !allowHeadMove), allowDirty })
  if (!existsSync(abs(DB_REL))) {
    console.log('SKIP migration ledger: data/question-bank.sqlite is absent')
    process.exitCode = 2
    return
  }
  const built = buildManifest()
  const ledger = buildLedger({ manifest: built.manifest, dbSnapshot: built.dbSnapshot })
  verifyArtifacts({ manifest: built.manifest, ledger, dbSnapshot: built.dbSnapshot })
  if (write) {
    writeArtifacts(built.manifest, ledger)
    console.log(`WROTE ${MANIFEST_REL}`)
    console.log(`WROTE ${LEDGER_REL}`)
  } else {
    const checked = loadCheckedArtifacts()
    compareJson(checked.manifest, built.manifest, 'checked-in migration manifest')
    compareJson(checked.ledger, ledger, 'checked-in migration ledger')
    console.log('PASS Ticket 21 deterministic census and zero-mutation migration ledger')
  }
  console.log(`CENSUS ${JSON.stringify(built.manifest.census.denominator)}`)
  console.log(`STATE ${built.manifest.stateProof.beforeStateDigest} = ${built.manifest.stateProof.afterStateDigest}`)
  console.log(`HEAD ${state.head}`)
}

run()
