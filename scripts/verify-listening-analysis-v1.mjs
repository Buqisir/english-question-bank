#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { validateNck1AnalysisGroupInput } from '../.amp/plugins/nck1-analysis-agent.js'
import { buildCompanionAnalysisHtml } from '../server/exports/companionAnalysisRenderer.mjs'
import {
  LEGACY_NCK1_ANALYSIS_PROFILE,
  LISTENING_ANALYSIS_PROFILE,
  buildListeningAnalysisAgentRequest,
  buildListeningAnalysisInput,
  buildListeningAnalysisMessages,
  validateListeningAnalysis,
} from '../server/paper-import-ai/analyzeListening.mjs'
import {
  buildNck1AnalysisProjection,
  NCK1_STAGED_ANALYSIS_FILES,
} from '../server/import-review/nck1AnalysisProjection.mjs'
import {
  buildNck1CompatibilityPaperAsset,
} from '../server/import-review/revisionProjection.mjs'
import {
  swapPaperImportLatest,
  writePaperImportVersion,
} from '../server/paper-import/storage.mjs'
import {
  normalizeTopicLabelPayload,
} from '../shared/topics/topicTaxonomy.mjs'
import {
  createListeningMaterialProjectionRoutes,
  readCurrentListeningMaterialProjection,
} from '../server/search/listeningMaterialProjection.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const materialization = makeFixture({ listening: true })
const topic = { theme: '人与社会', themeGroup: '社会服务与人际沟通', subtopic: '社会交往' }

function makeAnalysis() {
  const input = buildListeningAnalysisInput(materialization)
  return {
    schemaVersion: 'listening-analysis-v1',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    materials: Object.fromEntries(input.materials.map((material) => [material.segmentId, {
      segmentId: material.segmentId,
      questionIds: material.questions.map(({ questionId }) => questionId),
      transcript: material.transcript,
      translationZh: `这是${material.segmentId}对应听力原文的完整自然中文翻译。`,
      topic,
      summaryZh: '两位说话者围绕日常安排交换信息并明确接下来的行动计划',
    }])),
    questions: Object.fromEntries(input.materials.flatMap((material) =>
      material.questions.map((question) => [question.questionId, {
        questionId: question.questionId,
        segmentId: material.segmentId,
        stemTranslationZh: `第${question.questionNo}题题干翻译`,
        optionTranslationsZh: { A: '选项甲', B: '选项乙', C: '选项丙' },
        officialAnswer: question.officialAnswer,
        evidence: { quote: material.transcript },
        reasonZh: '原话直接说明了相关事实，题干只是换了一种自然说法，因此选择官方答案。',
      }]))),
  }
}

const analysis = makeAnalysis()
const result = validateListeningAnalysis(analysis, { materialization })
assert.equal(result.ok, true)
assert.equal(result.warnings.length, 0)
assert.equal(Object.keys(analysis.materials).length, 10)
assert.equal(Object.keys(analysis.questions).length, 20)
assert.equal(analysis.materials['text:6'].questionIds.length, 3, 'one material supports multiple questions')
assert.equal(analysis.questions['question:listening:1'].distractors, undefined, 'distractors are conditional')
assert.equal('timing' in analysis, false, 'whole MP3 needs no analysis timestamps')
const twoQuestionMaterialization = structuredClone(materialization)
twoQuestionMaterialization.listening.transcript.find(({ segmentId }) => segmentId === 'text:6').questionNumbers = [6, 7]
assert.equal(
  buildListeningAnalysisInput(twoQuestionMaterialization, { segmentIds: ['text:6'] }).materials[0].questions.length,
  2,
  'one listening segment may bind exactly two questions without positional inference',
)

function rejected(mutator, pattern) {
  const candidate = structuredClone(analysis)
  mutator(candidate)
  assert.throws(() => validateListeningAnalysis(candidate, { materialization }), pattern)
}

rejected((candidate) => { delete candidate.questions['question:listening:20'] }, /identity closure mismatch/u)
rejected((candidate) => { candidate.materials['text:1'].questionIds.push('question:listening:1') }, /uniqueItems|duplicate/u)
rejected((candidate) => { candidate.questions['question:listening:1'].segmentId = 'text:2' }, /wrong listening material/u)
rejected((candidate) => { candidate.questions['question:listening:1'].evidence.quote = 'FORGED QUOTE' }, /exactly occur/u)
rejected((candidate) => { candidate.questions['question:listening:1'].officialAnswer = 'B' }, /disagrees/u)
rejected((candidate) => { candidate.materials['text:1'].topic.themeGroup = '科学与技术' }, /taxonomy parent-child triple/u)

const warningCandidate = structuredClone(analysis)
warningCandidate.materials['text:1'].summaryZh = '太短总结'
warningCandidate.materials['text:2'].summaryZh = '这是一段故意写得明显超过四十个汉字的听力材料总结用于证明长度边界只是提醒不会阻止真实内容进入教师审核流程'
const warningResult = validateListeningAnalysis(warningCandidate, { materialization })
assert.deepEqual(warningResult.warnings.map(({ code }) => code).sort(), [
  'LISTENING_SUMMARY_LONG',
  'LISTENING_SUMMARY_SHORT',
])

const messages = buildListeningAnalysisMessages({ materialization })
assert.match(messages[0].content, /Exact output JSON Schema/u)
assert.match(messages[0].content, /"const": "listening-analysis-v1"/u)
assert.match(messages[0].content, /"themeGroup": "社会服务与人际沟通"/u)
assert.match(messages[1].content, /question:listening:20/u)
const agentRequest = buildListeningAnalysisAgentRequest({
  materialization,
  teachingDoctrine: '先讲人话，再讲关系。',
})
assert.equal(agentRequest.group, 'listening-unit')
assert.equal(Object.keys(agentRequest.authoritativeAnswers).length, 20)
assert.match(agentRequest.outputContract, /Exact output JSON Schema/u)
assert.match(agentRequest.outputContract, /"const": "listening-analysis-v1"/u)
assert.deepEqual(validateNck1AnalysisGroupInput(agentRequest), agentRequest)
assert.equal(LEGACY_NCK1_ANALYSIS_PROFILE, 'legacy-nine-v1')
assert.equal(LISTENING_ANALYSIS_PROFILE, 'complete-with-listening-v1')

assert.deepEqual(
  normalizeTopicLabelPayload([{ theme: '人与自我', subtopic: '创新与创业意识', source: 'legacy', confidence: 2 }])
    .map(({ label, source, confidence }) => ({ label, source, confidence })),
  [
    { label: '人与自我-做人与做事-创新意识', source: 'legacy', confidence: 1 },
    { label: '人与自我-做人与做事-创业意识', source: 'legacy', confidence: 1 },
  ],
  'shared taxonomy preserves API alias expansion and confidence normalization',
)
assert.deepEqual(
  normalizeTopicLabelPayload({ labels: [
    ' 人与社会 - 科学与技术 - 科技发展 ',
    { label: '人与社会-科学与技术-科技发展', confidence: -1 },
    { 主题: '人与自然', 主题群: '宇宙探索', 子主题: '地球奥秘探索', reason: '原调用形状' },
    '不存在-的话题-标签',
  ]}).map(({ label }) => label),
  ['人与社会-科学与技术-科技发展', '人与自然-宇宙探索-地球奥秘探索'],
  'shared taxonomy preserves compact labels, Chinese keys, de-duplication and invalid-label filtering',
)

const profileRoot = mkdtempSync(path.join(tmpdir(), 'listening-analysis-profile-'))
try {
  for (const descriptor of NCK1_STAGED_ANALYSIS_FILES) {
    writeFileSync(path.join(profileRoot, descriptor.path), '{}')
  }
  assert.throws(() => buildNck1AnalysisProjection({
    rootDir: profileRoot,
    materialization,
    paperAsset: {},
    required: true,
    analysisProfile: LISTENING_ANALYSIS_PROFILE,
  }), /requires analysis-listening\.json/u)
  assert.throws(() => buildNck1AnalysisProjection({
    rootDir: profileRoot,
    materialization,
    paperAsset: {},
    required: true,
    analysisProfile: LEGACY_NCK1_ANALYSIS_PROFILE,
  }), /45 authoritative objective answers/u, 'historical nine-file mode proceeds without silently requiring a tenth shard')
} finally {
  rmSync(profileRoot, { recursive: true, force: true })
}

const config = {
  provenance: { paperName: 'Listening fixture', source: 'Verifier', year: 2026 },
}
const paperAsset = buildNck1CompatibilityPaperAsset({
  config,
  materialization,
  sourceAssetVersion: 1,
})
const studentPayload = JSON.stringify(paperAsset)
assert.doesNotMatch(studentPayload, /完整自然中文翻译|原话直接说明|Short listening transcript/u)
const companionHtml = buildCompanionAnalysisHtml({
  paperAsset,
  analyses: { listening: analysis },
})
assert.match(companionHtml, /data-listening-segment-id="text:6"/u)
assert.match(companionHtml, /听力原文/u)
assert.match(companionHtml, /原话直接说明了相关事实/u)
assert.equal((companionHtml.match(/question--listening/gu) || []).length, 20)

const paperAssetsDir = mkdtempSync(path.join(tmpdir(), 'listening-analysis-storage-'))
try {
  const dbPath = path.join(paperAssetsDir, 'projection.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE canonical_paper_publications (
    paper_id TEXT NOT NULL,
    version_name TEXT NOT NULL,
    source_asset_version INTEGER NOT NULL,
    publication_digest TEXT NOT NULL,
    is_current INTEGER NOT NULL
  )`)
  const packageData = {
    paperAsset,
    answerKey: { schemaVersion: 'answer-key-v1', paperId: materialization.paperId, sourceAssetVersion: 1, answers: paperAsset.answerKey.answers },
    importMeta: { schemaVersion: 'import-meta-v1', paperId: materialization.paperId },
    listeningAnalysis: analysis,
  }
  const reports = { schemaVersion: 'fixture-report-v1' }
  const v1 = writePaperImportVersion({ paperAssetsDir, packageData, validationReport: reports, publishReport: reports, version: 1 })
  swapPaperImportLatest({ paperAssetsDir, paperId: materialization.paperId, versionDir: v1.versionDir })
  db.prepare('INSERT INTO canonical_paper_publications VALUES (?, ?, ?, ?, 1)')
    .run(materialization.paperId, 'v1', 1, 'sha256:v1')
  assert.equal(
    readCurrentListeningMaterialProjection({ db, paperAssetsDir, paperId: materialization.paperId })
      .materials[0].summaryZh,
    analysis.materials['text:1'].summaryZh,
  )
  const v2Package = structuredClone(packageData)
  v2Package.listeningAnalysis.materials['text:1'].summaryZh = '第二版听力总结用于验证版本读取与回滚保持完全一致且不会混入其他版本'
  const v2 = writePaperImportVersion({ paperAssetsDir, packageData: v2Package, validationReport: reports, publishReport: reports, version: 2 })
  swapPaperImportLatest({ paperAssetsDir, paperId: materialization.paperId, versionDir: v2.versionDir })
  db.prepare('UPDATE canonical_paper_publications SET version_name = ?, source_asset_version = ?, publication_digest = ? WHERE paper_id = ?')
    .run('v2', 2, 'sha256:v2', materialization.paperId)
  const latestPath = path.join(paperAssetsDir, materialization.paperId, 'latest', 'analyses', 'listening-analysis-v1.json')
  assert.equal(JSON.parse(readFileSync(latestPath, 'utf8')).materials['text:1'].summaryZh, v2Package.listeningAnalysis.materials['text:1'].summaryZh)
  const currentV2 = readCurrentListeningMaterialProjection({ db, paperAssetsDir, paperId: materialization.paperId })
  assert.equal(currentV2.sourceAssetVersion, 2)
  assert.equal(currentV2.materials[0].summaryZh, v2Package.listeningAnalysis.materials['text:1'].summaryZh)
  assert.equal(currentV2.materials[0].similarityText, currentV2.materials[0].summaryZh)
  assert.equal(currentV2.materials.length, 10)
  swapPaperImportLatest({ paperAssetsDir, paperId: materialization.paperId, versionDir: v1.versionDir, operation: 'rollback' })
  db.prepare('UPDATE canonical_paper_publications SET version_name = ?, source_asset_version = ?, publication_digest = ? WHERE paper_id = ?')
    .run('v1', 1, 'sha256:v1', materialization.paperId)
  const rolledBack = JSON.parse(readFileSync(latestPath, 'utf8'))
  assert.equal(rolledBack.materials['text:1'].summaryZh, analysis.materials['text:1'].summaryZh)
  assert.equal(rolledBack.sourceAssetVersion, 1)
  const rolledBackProjection = readCurrentListeningMaterialProjection({ db, paperAssetsDir, paperId: materialization.paperId })
  assert.equal(rolledBackProjection.sourceAssetVersion, 1)
  assert.equal(rolledBackProjection.materials[0].summaryZh, analysis.materials['text:1'].summaryZh)
  assert.notEqual(rolledBackProjection.materials[0].summaryZh, currentV2.materials[0].summaryZh)
  const filtered = readCurrentListeningMaterialProjection({
    db,
    paperAssetsDir,
    paperId: materialization.paperId,
    topic: { subtopic: topic.subtopic },
  })
  assert.equal(filtered.materials.length, 10, 'topic query reads material-level triples without changing ranking')

  const route = createListeningMaterialProjectionRoutes()[0]
  let apiResult = null
  await route.handle({
    response: {},
    match: ['', encodeURIComponent(materialization.paperId)],
    url: new URL(`http://example.test/api/papers/${materialization.paperId}/listening-materials?theme=${encodeURIComponent(topic.theme)}`),
    context: {
      paperAssetsDir,
      openDatabase: () => new DatabaseSync(dbPath),
      sendJson: (_response, status, body) => { apiResult = { status, body } },
    },
  })
  assert.equal(apiResult.status, 200)
  assert.equal(apiResult.body.sourceAssetVersion, 1)
  assert.equal(apiResult.body.materials[0].summaryZh, analysis.materials['text:1'].summaryZh)
  assert.ok(existsSync(path.join(v2.versionDir, 'analyses', 'listening-analysis-v1.json')), 'version two remains immutable after rollback')
  db.close()
} finally {
  rmSync(paperAssetsDir, { recursive: true, force: true })
}

console.log('Listening analysis V1 schema, prompt, taxonomy, privacy, companion and version rollback: PASS')
