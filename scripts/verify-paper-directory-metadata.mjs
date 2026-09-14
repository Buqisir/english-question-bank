#!/usr/bin/env node
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { listCanonicalPaperCatalog } from '../server/search/canonicalPaperCatalog.mjs'

const root = path.resolve(import.meta.dirname, '..')
const temp = mkdtempSync(path.join(tmpdir(), 'eqb-directory-metadata-'))
const paperId = 'paper-2023-yi'
const groupId = 'group-2023-yi-reading-a'
const assetRoot = path.join(temp, 'paper-assets')
const latest = path.join(assetRoot, paperId, 'latest')
const metaPath = path.join(latest, 'import-meta.json')
const env = {
  QUESTION_BANK_DB: path.join(temp, 'bank.sqlite'),
  USER_DATA_DB: path.join(temp, 'user.sqlite'),
  QUESTION_BANK_PAPER_ASSET_ROOT: assetRoot,
}
const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
try {
  cpSync(path.join(root, 'data/question-bank.sqlite'), env.QUESTION_BANK_DB)
  cpSync(path.join(root, 'app/public/paper-assets', paperId), path.join(assetRoot, paperId), { recursive: true })
  Object.assign(process.env, env)
  const { getQuestionGroupDetail, getPrintReadyByGroupId, isGroupPrintReady } = await import('../server/api.mjs')
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const detail = getQuestionGroupDetail(groupId)
  assert.ok(detail)
  assert.equal(detail.section, '第二部分 阅读 / 第一节 阅读理解')
  assert.equal(detail.passageTitle, meta.groups[groupId].displayTitleOverride)
  assert.equal(detail.summary, meta.groups[groupId].summary)
  assert.equal(detail.passage.summary, meta.groups[groupId].summary)
  assert.deepEqual(detail.topicLabels, [], 'missing topics must not become invented labels')
  assert.deepEqual(detail.tags, [], 'region and question type are not topic fallbacks')
  assert.equal(detail.canAddToDraftPaper, false, 'editorial metadata does not grant draft eligibility')

  writeFileSync(metaPath, JSON.stringify({ ...meta, paperId: 'another-paper' }))
  assert.equal(getQuestionGroupDetail(groupId).summary, '', 'wrong-paper metadata is not used')
  rmSync(metaPath)
  const missing = getQuestionGroupDetail(groupId)
  assert.equal(missing.summary, '', 'missing summary must not be replaced by raw passage text')
  assert.equal(missing.section, detail.section, 'section hierarchy comes from the paper layout')
  assert.equal(missing.passageTitle, 'Reading A', 'group title remains available without import metadata')
  console.log('PASS directory metadata: existing section, title and Chinese summary; missing/wrong-paper metadata stays empty; no fake topics or new draft eligibility')

  // Asset-only cards have no stored topics. Exercise the DB-backed read as well:
  // a dangling taxonomy-helper call otherwise passes the empty-topic checks.
  const db = new DatabaseSync(env.QUESTION_BANK_DB)
  let storedGroupId
  try {
    // Direct API imports do not run the CLI's schema bootstrap. Match its
    // additive columns in this disposable copy of the older bank fixture.
    for (const [table, columns] of Object.entries({
      questions: ['ai_difficulty_score INTEGER', 'teacher_difficulty INTEGER', 'difficulty_override_reason TEXT', 'difficulty_override_note TEXT', 'difficulty_tagged_at TEXT'],
      reading_parse_results: ['grammar_payload_json TEXT', 'cloze_payload_json TEXT', 'seven_choices_payload_json TEXT'],
    })) {
      const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name))
      for (const column of columns) {
        if (!existing.has(column.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`)
      }
    }
    storedGroupId = db.prepare('SELECT id FROM question_groups ORDER BY id LIMIT 1').get().id
    db.prepare('DELETE FROM question_group_topic_labels WHERE question_group_id = ?').run(storedGroupId)
    db.prepare(`INSERT INTO question_group_topic_labels
      (id, question_group_id, label, theme, theme_group, subtopic, source, reason, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'stored-topic', storedGroupId, '人与社会-历史、社会与文化-文化习俗与传统节日',
      '人与社会', '历史、社会与文化', '文化习俗与传统节日', 'teacher', '保留老师确认的主题', 0.8,
    )
  } finally {
    db.close()
  }
  const storedTopics = getQuestionGroupDetail(storedGroupId).topicLabels
  assert.deepEqual(storedTopics.map(({ id, label, source, reason, confidence }) => ({ id, label, source, reason, confidence })), [
    { id: 'stored-topic', label: '人与社会-历史、社会与文化-文化习俗', source: 'teacher', reason: '保留老师确认的主题', confidence: 0.8 },
    { id: 'stored-topic-2', label: '人与社会-历史、社会与文化-传统节日', source: 'teacher', reason: '保留老师确认的主题', confidence: 0.8 },
  ])
  console.log('PASS stored topic read: legacy alias expands without losing identity, teacher attribution or confidence')

  // These deliberately minimal publications exercise cheap discovery only;
  // they do not claim to be deeply validated Canonical Paper publications.
  const catalogRoot = path.join(temp, 'catalog')
  const catalogDb = new DatabaseSync(':memory:')
  try {
    catalogDb.exec(`CREATE TABLE canonical_paper_publications (
      paper_id TEXT, version_name TEXT, source_asset_version INTEGER,
      publication_digest TEXT, created_at TEXT, is_current INTEGER
    )`)
    for (const [id, ids] of [
      ['paper-one', ['shared-group', 'one-only']],
      ['paper-two', ['shared-group', 'two-only']],
      ['paper-safe', ['safe-group']],
    ]) {
      const ref = { paperId: id, versionName: 'v1', sourceAssetVersion: 1, publicationDigest: `digest-${id}` }
      const base = path.join(catalogRoot, id)
      mkdirSync(path.join(base, 'latest'), { recursive: true })
      mkdirSync(path.join(base, 'versions/v1/canonical'), { recursive: true })
      writeFileSync(path.join(base, 'latest/canonical-paper-publication-ref-v1.json'), JSON.stringify(ref))
      writeFileSync(path.join(base, 'versions/v1/canonical/canonical-paper-plan-v1.json'), JSON.stringify({
        paperId: id, slotBindings: ids.map(groupId => ({ state: 'bound', groupRef: { groupId } })),
      }))
      writeFileSync(path.join(base, 'latest/paper-asset.json'), JSON.stringify({
        paper: { paperId: id }, content: {
          groups: Object.fromEntries(ids.map(groupId => [groupId, { groupId, title: `from-${id}` }])),
          blocks: ids.map(groupId => ({ type: 'group', groupId })),
        },
      }))
      catalogDb.prepare('INSERT INTO canonical_paper_publications VALUES (?, ?, ?, ?, ?, 1)')
        .run(id, 'v1', 1, ref.publicationDigest, '2026-09-01')
    }
    for (const order of ['OFF', 'ON']) {
      catalogDb.exec(`PRAGMA reverse_unordered_selects = ${order}`)
      assert.deepEqual(listCanonicalPaperCatalog({ db: catalogDb, rootDir: catalogRoot }).map(paper => paper.paperId),
        ['paper-safe'], 'exclude every colliding owner, including its noncolliding groups, regardless of DB order')
    }
    catalogDb.prepare('DELETE FROM canonical_paper_publications WHERE paper_id = ?').run('paper-two')
    assert.deepEqual(listCanonicalPaperCatalog({ db: catalogDb, rootDir: catalogRoot }).map(paper => paper.paperId).sort(),
      ['paper-one', 'paper-safe'], 'a uniquely owned paper becomes discoverable again without stale conflict state')
  } finally {
    catalogDb.close()
  }
  console.log('PASS publication ownership: both conflicting papers excluded, unrelated paper retained, either SQL order and conflict removal')

  const duplicate = JSON.parse(readFileSync(path.join(latest, 'paper-asset.json'), 'utf8'))
  // Also bind an existing DB group so both single and batch print-readiness
  // paths see the collision, rather than merely rejecting a missing DB row.
  duplicate.content.groups[storedGroupId] = { ...duplicate.content.groups[groupId], groupId: storedGroupId }
  writeFileSync(path.join(latest, 'paper-asset.json'), JSON.stringify(duplicate))
  duplicate.paper.paperId = 'paper-conflicting-owner'
  const duplicateDir = path.join(assetRoot, duplicate.paper.paperId)
  mkdirSync(path.join(duplicateDir, 'latest'), { recursive: true })
  writeFileSync(path.join(duplicateDir, 'latest/paper-asset.json'), JSON.stringify(duplicate))
  assert.equal(getQuestionGroupDetail(groupId), null, 'scoped detail must reject a second valid owner before canonical paper enrichment')
  const parityDb = new DatabaseSync(env.QUESTION_BANK_DB, { readOnly: true })
  try {
    const rejected = { ok: false, reason: '试卷资产身份不一致' }
    assert.deepEqual(isGroupPrintReady(parityDb, storedGroupId), rejected, 'single-group read rejects duplicate ownership')
    assert.deepEqual(getPrintReadyByGroupId(parityDb, [storedGroupId]).get(storedGroupId), rejected,
      'batch cards must not grant eligibility that single-group/detail reads reject')
  } finally {
    parityDb.close()
  }
  rmSync(duplicateDir, { recursive: true })
  assert.equal(getQuestionGroupDetail(groupId).id, groupId, 'detail recovers after the conflicting owner is removed')
  console.log('PASS detail/print ownership: duplicate valid owner fails closed in detail and single/batch eligibility; unique owner remains readable')
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(temp, { recursive: true, force: true })
}
