// 全量种子：把一个 Canonical 数据仓（publication.sqlite + <paperId>/versions/vN/... + <paperId>/latest/ref）
// 里所有「当前版本」的卷整卷种进一个临时题库，供本地测试网站（scripts/component-inventory/rig.mjs，
// INVENTORY_SEED=full）使用。不改 canonicalDraftE2eFixture.mjs 的行为。
//
// 写什么、照谁写：
//   1. 文件：整卷目录复制到临时 paper-assets，再照 scripts/lib/productionCanonicalBackfill.mjs 的映射把
//      versions/vN/paper-asset.json（封存源字节）挪成 versions/vN/canonical/source-asset.bin，封存字节一个不改。
//   2. 投影：ticket-26 封存源（source-capture-v1）里每份 immutable_source_document 都记着它原来的位置
//      （observation.value.path = app/public/paper-assets/<paperId>/latest/<file>），字节和 sha256 也在。
//      这里只把这些字节按原相对路径放回 versions/vN/ 和（当前版本）latest/（paper-asset.json、import-meta.json、
//      answer-key.json、figures/...），每份都先核对 sha256/长度。这正是 C7 导入（server/paper-import/storage.mjs
//      enumeratePaperImportOutputs / swapPaperImportLatest）上线时版本目录和 latest/ 里该有的文件；
//      整卷目录（listCanonicalPaperCatalog）、题组详情（findPaperAssetGroup）、整卷预览页（PaperBrowsePage 取
//      /paper-assets/<id>/versions/vN/paper-asset.json）读的都是它。
//      版本目录已是 C7 布局（paper-asset.json 本身是 paper-asset-v1）的，原样不动。
//   3. 题库表：照 server/paper-import/publisher.mjs upsertPaperAssetToDb 写 sources / passages / question_groups /
//      questions / options / tags / tag_links / question_group_topic_labels / paper_asset_versions，
//      字段一一对应，取值只来自上面那三份文件（及版本目录里有的 analyses、public-search-metadata）。
//   4. 上线记录：canonical_paper_publications 照数据仓自己的 publication.sqlite 逐行抄（含 created_at），
//      和 productionCanonicalBackfill 一样；paper_import_runs 只在版本目录里真有 publish-report.json 时照抄
//      （C7 写版本时会写它；已审答案承诺 sourceReferencePublication 就在里面），没有就不写，不编。
//   5. 写完用服务端自己的 createCanonicalConsumerRuntime 逐卷 load screen / print_pdf，结果写进返回值，
//      不绕过任何校验；load 不 ready 的卷照实报告。
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { ensureCanonicalPublicationDatabaseShape } from '../../server/paper-canonical/publication.mjs'
import { loadCanonicalSourceAssetRepresentation } from '../../server/paper-canonical/sourceAssetRepresentation.mjs'
import { createCanonicalConsumerRuntime } from '../../server/paper-canonical/consumerRuntime.mjs'
import { ensurePaperImportDatabaseShape } from '../../server/paper-import/publisher.mjs'
import { listCanonicalPaperCatalog } from '../../server/search/canonicalPaperCatalog.mjs'
import { TOPIC_LABEL_TAXONOMY } from '../../shared/topics/topicTaxonomy.mjs'

export const DEFAULT_FULL_SEED_STORE = path.join(
  'test-fixtures', 'paper-canonical', 'publications', 'ticket-32-remaining-v1', 'store',
)

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

// ---- 以下映射与 server/paper-import/publisher.mjs 同名常量逐字一致（该文件未导出它们） ----
const groupTypeMap = {
  reading: 'reading', cloze: 'cloze', sevenChoices: 'seven_choices', grammarFill: 'grammar_cloze',
  errorCorrection: 'errorCorrection', listening: 'listening', writing: 'writing',
}
const sourceTypeMap = { 真题: 'real_exam', 模拟题: 'mock_exam', 自编题: 'self_made', 校本题: 'other' }
const difficultyMap = { 低: 'low', 中: 'medium', 高: 'high' }
const analysisFiles = {
  readingAnalysis: 'reading-choice-analysis-v1.json',
  scAnalysis: 'seven-choices-analysis-v1.json',
  clozeAnalysis: 'cloze-analysis-v1.json',
  grammarFillAnalysis: 'grammar-fill-analysis-v1.json',
}
const stableTail = (id) => String(id || '').replace(/^group-/, '').replace(/[^a-zA-Z0-9-]/g, '-')
function findSectionTitleForGroup(asset, groupId) {
  for (const part of asset.layoutTree?.parts || []) {
    for (const section of part.sections || []) {
      if ((section.groups || []).some((group) => group.groupId === groupId)) return `${part.title} / ${section.title}`
    }
  }
  return ''
}
function getGroupMaterialText(group) {
  if (group.passage?.paragraphs?.length) return group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n\n')
  if (group.clozeText) return group.clozeText
  if (group.grammarText) return group.grammarText
  return ''
}
function getQuestionType(groupType) {
  return { reading: '阅读理解', cloze: '完形填空', sevenChoices: '七选五', grammarFill: '语法填空',
    errorCorrection: '短文改错', listening: '听力', writing: '写作' }[groupType] || '其他'
}
function getDefaultScore(group, answers) {
  const scores = (group.questionIds || []).map((id) => Number(answers?.[id]?.score)).filter((s) => Number.isFinite(s) && s > 0)
  return scores.length > 0 ? scores[0] : 0
}
function analysisOverview(packageData, groupId) {
  for (const key of Object.keys(analysisFiles)) {
    const overview = packageData[key]?.groups?.[groupId]?.overview
    if (typeof overview === 'string' && overview.trim()) return overview.trim()
  }
  return ''
}
// ---------------------------------------------------------------------------------------------

let idCounter = 0
const nextId = (prefix) => `${prefix}-seed-${(++idCounter).toString(36)}`

function upsertQuestionGroupTags(db, groupId, tags) {
  db.prepare("DELETE FROM tag_links WHERE target_type = 'question_group' AND target_id = ?").run(groupId)
  for (const tagName of tags.filter(Boolean)) {
    const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)
    const tagId = existing?.id || nextId('tag')
    if (!existing) {
      db.prepare("INSERT INTO tags (id, name, category, description, is_active, updated_at) VALUES (?, ?, '导入标签', '', 1, datetime('now'))").run(tagId, tagName)
    }
    db.prepare("INSERT OR IGNORE INTO tag_links (id, tag_id, target_type, target_id) VALUES (?, ?, 'question_group', ?)").run(nextId('tl'), tagId, groupId)
  }
}

const topicByLabel = new Map(TOPIC_LABEL_TAXONOMY.map((entry) => [entry.label, entry]))
function replacePublishedTopicLabels(db, groupId, labels) {
  db.prepare('DELETE FROM question_group_topic_labels WHERE question_group_id = ?').run(groupId)
  for (const label of labels || []) {
    const topic = topicByLabel.get(label)
    if (!topic) throw new Error(`public-search-metadata 里有未知话题标签：${label}`)
    db.prepare(`INSERT INTO question_group_topic_labels (id, question_group_id, label, theme, theme_group, subtopic,
      source, reason, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'public-search-metadata-v1', '', 1, datetime('now'), datetime('now'))`)
      .run(nextId('qgtl'), groupId, topic.label, topic.theme, topic.themeGroup, topic.subtopic)
  }
}

// publisher.mjs upsertPaperAssetToDb 的逐字段复刻（只读 packageData，不碰文件）。
function upsertPaperAssetToDb(db, packageData, version) {
  const { paperAsset, answerKey, importMeta } = packageData
  const paper = paperAsset.paper
  const answers = answerKey.answers || {}
  const sourceType = sourceTypeMap[importMeta.paper.sourceType] || 'other'
  const defaultTags = Array.isArray(importMeta.paper.defaultTags) ? importMeta.paper.defaultTags : []
  const publicMetadataByGroup = new Map((packageData.publicSearchMetadata?.groups || []).map((g) => [g.groupId, g]))
  for (const [index, group] of Object.values(paperAsset.content.groups).entries()) {
    const groupMeta = importMeta.groups?.[group.groupId] || {}
    const tail = stableTail(group.groupId)
    const sourceId = `src-${tail}`
    const passageId = `passage-${tail}`
    const difficulty = difficultyMap[groupMeta.difficulty] || 'medium'
    const sectionTitle = findSectionTitleForGroup(paperAsset, group.groupId)
    const materialText = getGroupMaterialText(group)
    const summary = groupMeta.summary || analysisOverview(packageData, group.groupId) || group.title || paper.title
    const groupTitle = groupMeta.displayTitleOverride || group.title
    const defaultScore = getDefaultScore(group, answers)
    const publicMetadata = publicMetadataByGroup.get(group.groupId) || null
    db.prepare(`INSERT INTO sources (id, source_type, year, month, region, paper_name, section, file_ref, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      sourceId, sourceType, importMeta.paper.year, importMeta.paper.month ?? null, importMeta.paper.region,
      importMeta.paper.paperName, sectionTitle, `paper-assets/${paper.paperId}/latest/paper-asset.json`, `C7 whole-paper import v${version}`)
    db.prepare(`INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, word_count, difficulty, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      passageId, sourceId, groupTitle, materialText, summary, '', publicMetadata?.genre || null,
      publicMetadata?.counts?.wordCount ?? materialText.split(/\s+/).filter(Boolean).length, difficulty,
      `paperId=${paper.paperId}; groupId=${group.groupId}; assetVersion=${version}`)
    db.prepare(`INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      group.groupId, passageId, groupTypeMap[group.groupType] || 'other', groupTitle, sectionTitle, index + 1,
      defaultScore, difficulty, `C7 imported from ${paper.paperId} v${version}`)
    for (const [questionIndex, questionId] of (group.questionIds || []).entries()) {
      const question = paperAsset.content.questions[questionId]
      if (!question) continue
      const answer = answers[questionId]?.answer || paperAsset.answerKey?.answers?.[questionId]?.answer || ''
      const score = Number(answers[questionId]?.score || defaultScore || 0)
      db.prepare(`INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        question.questionId, group.groupId,
        group.groupType === 'errorCorrection' && question.questionNo === null ? '' : String(question.questionNo),
        getQuestionType(group.groupType), question.stem || '', answer, '', difficulty, score, questionIndex + 1,
        `paperId=${paper.paperId}; assetVersion=${version}`)
      for (const [optionIndex, option] of (question.options || []).entries()) {
        db.prepare('INSERT INTO options (id, question_id, label, content, display_order) VALUES (?, ?, ?, ?, ?)')
          .run(`${question.questionId}-${option.label}`, question.questionId, option.label, option.text || '', optionIndex + 1)
      }
    }
    upsertQuestionGroupTags(db, group.groupId, [...defaultTags, ...(Array.isArray(groupMeta.tags) ? groupMeta.tags : [])])
    if (publicMetadata) replacePublishedTopicLabels(db, group.groupId, publicMetadata.topicLabels)
  }
  db.prepare(`INSERT INTO paper_asset_versions (id, paper_id, asset_version, version_name, version_dir, source_file_sha256, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')`).run(
    `pav-${paper.paperId}-v${version}`, paper.paperId, version, `v${version}`,
    path.join('app/public/paper-assets', paper.paperId, 'versions', `v${version}`),
    packageData.sourceFileSha256 || '')
}

// ticket-26 封存源：把每份带「原位置」的 immutable_source_document 放回 targetDirs 下（相对 latest/ 的同一路径）。
function restoreProjectionFromSourceCapture({ wrapper, versionDir, targetDirs, paperId }) {
  const prefix = `app/public/paper-assets/${paperId}/latest/`
  const restored = []
  for (const observation of wrapper.observations || []) {
    if (observation?.kind !== 'immutable_source_document') continue
    const recordedPath = observation.value?.path
    if (typeof recordedPath !== 'string' || !recordedPath.startsWith(prefix)) continue
    const relative = recordedPath.slice(prefix.length)
    if (!relative || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`${paperId}: 封存源记录的原位置不合法：${recordedPath}`)
    }
    const document = (wrapper.documents || []).find((d) => d.documentId === observation.documentId)
    const ref = document?.immutableArtifactRef
    if (!ref?.relativePath?.startsWith('source-evidence/') || ref.relativePath.includes('..')) {
      throw new Error(`${paperId}: ${relative} 没有封存字节`)
    }
    const bytes = readFileSync(path.join(versionDir, ref.relativePath))
    const digest = sha256(bytes)
    if (digest !== document.sha256 || digest !== ref.sha256 || digest !== observation.value.sha256
      || bytes.byteLength !== document.byteLength || bytes.byteLength !== observation.value.byteLength) {
      throw new Error(`${paperId}: ${relative} 的封存字节与记录不一致`)
    }
    for (const dir of targetDirs) {
      const target = path.join(dir, relative)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, bytes)
    }
    restored.push(relative)
  }
  return restored
}

// 一个版本目录换成生产布局：封存源字节挪到 canonical/source-asset.bin（productionCanonicalBackfill 的同一映射），
// versions/vN/paper-asset.json 换成 C7 的 paper-asset-v1 投影（整卷预览页直接取这个文件，要 content.blocks）。
// 返回该版本的封存源种类。
function convertVersionToProductionLayout({ versionDir, paperId, latestDir }) {
  const sealedPath = path.join(versionDir, 'paper-asset.json')
  const binPath = path.join(versionDir, 'canonical', 'source-asset.bin')
  if (!existsSync(sealedPath)) return { kind: existsSync(binPath) ? 'already-converted' : 'missing', restored: [] }
  const sealedBytes = readFileSync(sealedPath)
  let parsed = null
  try { parsed = JSON.parse(sealedBytes.toString('utf8')) } catch { /* DOCX 等非 JSON 封存源 */ }
  if (parsed?.schemaVersion === 'paper-asset-v1') return { kind: 'paper-asset-v1', restored: [] } // 已是 C7 布局
  if (existsSync(binPath) && !readFileSync(binPath).equals(sealedBytes)) throw new Error(`${paperId}: source-asset.bin 与 paper-asset.json 封存字节不同`)
  writeFileSync(binPath, sealedBytes)
  rmSync(sealedPath)
  if (parsed?.schemaVersion !== 'source-capture-v1') {
    return { kind: sealedBytes.subarray(0, 2).toString('latin1') === 'PK' ? 'docx' : 'unknown', restored: [] }
  }
  const restored = restoreProjectionFromSourceCapture({ wrapper: parsed, versionDir, paperId,
    targetDirs: latestDir ? [versionDir, latestDir] : [versionDir] })
  // 与服务端同一个解封函数核对：放回的 paper-asset.json 就是封存源里的 asset-projection。
  const { asset } = loadCanonicalSourceAssetRepresentation({ sourceAsset: parsed, versionDir,
    label: `${paperId} full seed`, reject(message) { throw new Error(message) } })
  if (JSON.stringify(asset) !== JSON.stringify(readJson(sealedPath))) {
    throw new Error(`${paperId}: 放回的 paper-asset.json 与封存 asset-projection 不一致`)
  }
  return { kind: 'source-capture-v1', restored }
}

function readJson(filePath) { return JSON.parse(readFileSync(filePath, 'utf8')) }
function readJsonIfExists(filePath) { return existsSync(filePath) ? readJson(filePath) : null }

/**
 * 把 storeDir 里所有当前版本的卷整卷种进 bankDbPath / paperAssetsDir。
 * 返回逐卷报告：哪些卷整卷可上线、哪些题组进了题库、听力音频、已审答案承诺、Screen/Print 能否 load。
 */
export function seedFullCanonicalStore({ repositoryRoot, storeDir, bankDbPath, paperAssetsDir }) {
  const sourceStore = path.resolve(repositoryRoot, storeDir || DEFAULT_FULL_SEED_STORE)
  const indexPath = path.join(sourceStore, 'publication.sqlite')
  if (!existsSync(indexPath)) throw new Error(`数据仓没有 publication.sqlite：${sourceStore}`)
  const index = new DatabaseSync(indexPath, { readOnly: true })
  const rows = index.prepare(`SELECT paper_id, version_name, source_asset_version, publication_digest, is_current, created_at
    FROM canonical_paper_publications ORDER BY paper_id, source_asset_version`).all()
  index.close()
  const current = rows.filter((row) => row.is_current === 1)
  if (!current.length) throw new Error(`数据仓里没有当前版本的卷：${sourceStore}`)

  mkdirSync(paperAssetsDir, { recursive: true })
  const db = new DatabaseSync(bankDbPath)
  db.exec(readFileSync(path.join(repositoryRoot, 'data/sql/schema.sql'), 'utf8'))
  ensureCanonicalPublicationDatabaseShape(db)
  ensurePaperImportDatabaseShape(db)
  const insertPublication = db.prepare(`INSERT INTO canonical_paper_publications (paper_id, version_name, source_asset_version,
    publication_digest, is_current, created_at) VALUES (?, ?, ?, ?, ?, ?)`)

  const papers = []
  for (const row of current) {
    const paperId = row.paper_id
    const report = { paperId, versionName: row.version_name, groups: 0, listeningGroups: 0, listeningAudio: null,
      sourceReferences: false, publishReport: false, answerCommitment: false, skipped: null, restored: [] }
    papers.push(report)
    const latestRef = readJson(path.join(sourceStore, paperId, 'latest', 'canonical-paper-publication-ref-v1.json'))
    if (latestRef.paperId !== paperId || latestRef.versionName !== row.version_name
      || latestRef.sourceAssetVersion !== row.source_asset_version || latestRef.publicationDigest !== row.publication_digest) {
      report.skipped = 'latest ref 与 publication.sqlite 当前行不一致'
      continue
    }
    const paperDir = path.join(paperAssetsDir, paperId)
    cpSync(path.join(sourceStore, paperId), paperDir, { recursive: true })
    for (const pub of rows.filter((r) => r.paper_id === paperId)) {
      insertPublication.run(pub.paper_id, pub.version_name, pub.source_asset_version, pub.publication_digest, pub.is_current, pub.created_at)
    }
    const versionDir = path.join(paperDir, 'versions', row.version_name)
    const manifestName = readdirSync(path.join(versionDir, 'canonical')).find((f) => /^canonical-paper-publication-v\d+\.json$/.test(f))
    const manifest = manifestName ? readJson(path.join(versionDir, 'canonical', manifestName)) : null
    if (manifest?.listeningAudio) {
      report.listeningAudio = { relativePath: manifest.listeningAudio.relativePath,
        present: existsSync(path.join(versionDir, manifest.listeningAudio.relativePath)) }
    }
    report.sourceReferences = existsSync(path.join(versionDir, 'source-references-v1.json'))

    // 每个版本目录都换成生产布局；当前版本的投影同时放进 latest/（C7 swapPaperImportLatest 的样子）。
    let currentKind = null
    for (const pub of rows.filter((r) => r.paper_id === paperId)) {
      const isCurrent = pub.version_name === row.version_name
      const converted = convertVersionToProductionLayout({ versionDir: path.join(paperDir, 'versions', pub.version_name),
        paperId, latestDir: isCurrent ? path.join(paperDir, 'latest') : null })
      if (isCurrent) { currentKind = converted.kind; report.restored = converted.restored }
    }
    if (currentKind === 'docx') { report.skipped = '封存源是 DOCX，数据仓里没有 paper-asset-v1 投影（题组、元数据都无从取）'; continue }
    if (!['source-capture-v1', 'paper-asset-v1'].includes(currentKind)) { report.skipped = `封存源种类 ${currentKind}，不认识`; continue }
    const baseDir = versionDir
    const paperAsset = readJsonIfExists(path.join(baseDir, 'paper-asset.json'))
    const importMeta = readJsonIfExists(path.join(baseDir, 'import-meta.json'))
    const answerKey = readJsonIfExists(path.join(baseDir, 'answer-key.json'))
    if (!paperAsset || !importMeta || !answerKey) {
      report.skipped = `缺 ${[!paperAsset && 'paper-asset.json', !importMeta && 'import-meta.json', !answerKey && 'answer-key.json'].filter(Boolean).join('、')}`
      continue
    }
    if (paperAsset.paper?.paperId !== paperId) { report.skipped = 'paper-asset.json 的 paperId 不符'; continue }
    const packageData = { paperAsset, importMeta, answerKey, sourceFileSha256: importMeta.sourceFileSha256,
      publicSearchMetadata: readJsonIfExists(path.join(versionDir, 'public-search-metadata-v1.json')) }
    for (const [key, file] of Object.entries(analysisFiles)) packageData[key] = readJsonIfExists(path.join(versionDir, 'analyses', file))
    db.exec('BEGIN')
    try {
      upsertPaperAssetToDb(db, packageData, row.source_asset_version)
      const publishReport = readJsonIfExists(path.join(versionDir, 'publish-report.json'))
      if (publishReport) {
        const validationReport = readJsonIfExists(path.join(versionDir, 'validation-report.json')) || {}
        db.prepare(`INSERT INTO paper_import_runs (id, paper_id, asset_version, status, validation_report_json, publish_report_json)
          VALUES (?, ?, ?, 'published', ?, ?)`).run(nextId('pir'), paperId, row.source_asset_version,
          JSON.stringify(validationReport), JSON.stringify(publishReport))
        report.publishReport = true
        report.answerCommitment = Boolean(publishReport.sourceReferencePublication)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    const groups = Object.values(paperAsset.content?.groups || {})
    report.groups = groups.length
    report.listeningGroups = groups.filter((g) => g.groupType === 'listening').length
  }

  // 用服务端自己的读法核对：整卷目录收不收、Screen / Print-PDF 能不能 load。
  const catalog = new Set(listCanonicalPaperCatalog({ db, rootDir: paperAssetsDir }).map((p) => p.paperId))
  const runtime = createCanonicalConsumerRuntime({ rootDir: paperAssetsDir, db })
  for (const report of papers) {
    report.catalog = catalog.has(report.paperId)
    for (const consumerId of ['screen', 'print_pdf']) {
      try {
        const loaded = runtime.load({ paperId: report.paperId, consumerId })
        report[consumerId] = loaded.disposition === 'ready' ? 'ready' : `${loaded.disposition}:${loaded.diagnostics?.[0]?.code || ''}`
      } catch (error) {
        report[consumerId] = `error:${error.code || error.message}`
      }
    }
  }
  db.close()
  return { store: sourceStore, papers }
}
