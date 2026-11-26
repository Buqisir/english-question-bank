#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { closeSync, ftruncateSync, openSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createSession, createUser, ensureAuthDatabaseShape } from '../server/auth/auth.mjs'
import { ensureCanonicalPublicationDatabaseShape } from '../server/paper-canonical/publication.mjs'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { agentDeploymentMeta } from '../server/agent-api/agentRoutes.mjs'
import { agentGroup } from '../server/agent-api/agentCatalog.mjs'
import { projectAgentPassage } from '../server/agent-api/agentPassage.mjs'
import { auditParagraphRefs } from './agent-paragraph-ref-audit.mjs'

const root = path.resolve(import.meta.dirname, '..')
const temp = mkdtempSync(path.join(tmpdir(), 'eqb-agent-api-'))
const bankPath = path.join(temp, 'bank.sqlite')
const userPath = path.join(temp, 'users.sqlite')
const reviewPath = path.join(temp, 'review.sqlite')
const assets = path.join(temp, 'assets')
const files = path.join(temp, 'review-files')
const api = '/api/agent/v1'
const admin = '/api/admin/agent-tokens'
const adminReports = '/api/admin/agent-reports'
let child
let logs = ''
function jsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  const bytes = Buffer.from(JSON.stringify(value))
  writeFileSync(file, bytes)
  return { sha256: sha256(bytes), byteLength: bytes.length }
}
const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3n0AAAAASUVORK5CYII=', 'base64')
const redraw = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAE0lEQVQI12NkYGD4zwAFTAxIAAAWOAEDGPDUFQAAAABJRU5ErkJggg==', 'base64')
const redrawMeta = { mimeType: 'image/png', sha256: sha256(redraw), pixelWidth: 3, pixelHeight: 2 }
const display = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAMAAgA0JaQAA3AA/vuUAAA=', 'base64')
const displayMeta = { mimeType: 'image/webp', sha256: sha256(display), pixelWidth: 2, pixelHeight: 3 }
const materializationFilename = 'materialization/nck1-source-materialization-v1.json'
const ocrFilename = 'materialization/nck1-ocr-source-evidence-v1.json'
const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
const source = { kind: 'page_region', documentId: 'questions', page: 1, region }
const ocrFor = paperId => ({ paperId, schemaVersion: 'nck1-ocr-source-evidence-v1',
  documents: [{ documentId: 'answers', pages: [{ page: 2, observations: [{ region, text: '21. A' }] }] }] })
const mediaFor = paperId => ({ mediaId: `media:${paperId}:fixture`, mimeType: 'image/png', sha256: sha256(picture),
  pixelWidth: 1, pixelHeight: 1 })
const unreferencedMedia = { ...mediaFor('unreferenced'), usage: 'visual_proof' }
const tableMedia = mediaFor('table-cell')
const stemMedia = mediaFor('stem')
const optionMedia = mediaFor('option')
const secondOptionMedia = mediaFor('option-second')
const pendingOptionMedia = mediaFor('pending-option')
const passageFor = paperId => paperId === 'paper-agent-pending' ? [] : [
  { paragraphId: 'p1', text: 'A teacher prepares a lesson.' },
  { paragraphId: 'p2', text: 'She always remembers' },
  { paragraphId: 'p3', text: 'to bring her notes.' },
]
function materializationFor(paperId) {
  const paragraphs = passageFor(paperId).map(({ paragraphId, text }) =>
    ({ kind: 'paragraph', blockId: paragraphId, role: 'body', source, content: [{ kind: 'text', text }] }))
  const figure = { kind: 'figure', blockId: 'figure', mediaId: mediaFor(paperId).mediaId, caption: 'Figure', source }
  const table = { kind: 'table', blockId: 'table', columnCount: 3, source, rows: [{ cells: [
    { cellId: 'cell', columnStart: 1, columnSpan: 2, rowSpan: 1, content: [{ kind: 'text', text: 'Merged' }] },
    { cellId: 'image-cell', columnStart: 3, columnSpan: 1, rowSpan: 1, content: [{ kind: 'media_ref', mediaId: tableMedia.mediaId, alt: '' }] },
  ] }] }
  const blocks = paragraphs.length ? [paragraphs[0], figure, ...paragraphs.slice(1), table,
    { kind: 'paragraph', blockId: 'title', role: 'title', source, content: [{ kind: 'text', text: 'Title' }] },
    { kind: 'paragraph', blockId: 'ambiguous', role: 'body', source, content: [{ kind: 'text', text: 'One.\n\nTwo.' }] },
    { kind: 'paragraph', blockId: 'after-ambiguous', role: 'body', source, content: [{ kind: 'text', text: 'Three.' }] },
  ] : [figure]
  const media = mediaFor(paperId)
  const question = { questionId: `question-${paperId}`,
    options: [{ label: 'B', figure: { mediaId: (paragraphs.length ? optionMedia : pendingOptionMedia).mediaId } }] }
  if (paragraphs.length) {
    media.publication = { selection: 'human_confirmed_ai_candidate', candidate: redrawMeta }
    media.displayVariant = { sha256: displayMeta.sha256, byteLength: display.length, path: 'materialization/media/display.webp',
      generator: 'codex-cli', textCheck: 'verified' }
    question.stemFigures = [{ kind: 'figure', mediaId: stemMedia.mediaId }]
  }
  return { paperId, schemaVersion: 'nck1-source-materialization-v11', documents: [{ documentId: 'answers', role: 'official_answers' }],
    groups: [{ groupId: `group-${paperId}`, blocks, questions: [question] }], answers: [], media: [media, unreferencedMedia, tableMedia,
      { ...stemMedia, publication: { selection: 'human_confirmed_ai_candidate', candidate: redrawMeta } },
      { ...optionMedia, publication: { selection: 'human_confirmed_ai_candidate', candidate: redrawMeta } },
      secondOptionMedia, pendingOptionMedia] }
}
function assetFor(paperId) {
  const groupId = `group-${paperId}`
  const questionId = `question-${paperId}`
  const optionC = { label: 'C', text: 'A trip.' }
  if (paperId === 'paper-agent-published') optionC.content = [
    { kind: 'media_ref', mediaId: secondOptionMedia.mediaId }, { kind: 'media_ref', mediaId: optionMedia.mediaId },
  ]
  return {
    paper: { paperId, title: '不应替代元数据标题' },
    layoutTree: { parts: [{ title: '阅读', sections: [{ title: '阅读理解', groups: [{ groupId }] }] }] },
    content: {
      blocks: [{ type: 'group', groupId }],
      groups: { [groupId]: { groupId, groupType: 'reading', title: '阅读 A',
        passage: { paragraphs: passageFor(paperId) }, questionIds: [questionId] } },
      questions: { [questionId]: { questionId, groupId, questionNo: 21, stem: 'What does the teacher prepare?',
        options: [{ label: 'A', text: 'A lesson.' }, { label: 'B', text: '' }, optionC,
        { label: 'D', text: '' }] } },
    },
    answerKey: { answers: { [questionId]: { questionNo: 21, answer: 'A' } } },
  }
}
const bank = new DatabaseSync(bankPath)
bank.exec('CREATE TABLE question_groups (id TEXT PRIMARY KEY)')
bank.exec("CREATE TABLE sources (source_type TEXT, file_ref TEXT, year INTEGER)")
bank.prepare('INSERT INTO sources (source_type, file_ref) VALUES (?, ?)').run('real_exam', 'paper-assets/paper-agent-published/latest/paper-asset.json')
ensureCanonicalPublicationDatabaseShape(bank)
const publishedId = 'paper-agent-published'
const pendingId = 'paper-agent-pending'
const pubAsset = assetFor(publishedId)
const versionDir = path.join(assets, publishedId, 'versions/v1')
const materialization = jsonFile(path.join(versionDir, 'canonical/source-asset.bin'), materializationFor(publishedId))
const ocrEvidence = jsonFile(path.join(versionDir, 'source-evidence/ocr.bin'), ocrFor(publishedId))
writeFileSync(path.join(versionDir, 'source-evidence/picture.bin'), picture)
writeFileSync(path.join(versionDir, 'source-evidence/redraw.bin'), redraw)
writeFileSync(path.join(versionDir, 'source-evidence/display.bin'), display)
const canonicalGroups = jsonFile(path.join(versionDir, 'canonical/canonical-question-groups-v1.json'), {
  groups: [{ media: [{ mediaId: mediaFor(publishedId).mediaId, displayVariant: displayMeta }] }],
})
const ocrCommitment = digestJson({ digest: ocrEvidence.sha256, roles: ['source_provenance'], inputKey: 'ocr_source_evidence' })
const publication = {
  sourceAssetDigest: materialization.sha256,
  artifacts: [{ role: 'question_groups', relativePath: 'canonical/canonical-question-groups-v1.json', ...canonicalGroups }],
  sourceEvidence: [
    { documentId: `document:${ocrCommitment.slice('sha256:'.length).slice(0, 28)}`, relativePath: 'source-evidence/ocr.bin', ...ocrEvidence },
    { documentId: 'picture', relativePath: 'source-evidence/picture.bin', byteLength: picture.length, sha256: sha256(picture) },
    { documentId: 'redraw', relativePath: 'source-evidence/redraw.bin', byteLength: redraw.length, sha256: redrawMeta.sha256 },
    { documentId: 'display', relativePath: 'source-evidence/display.bin', byteLength: display.length, sha256: displayMeta.sha256 },
  ],
}
const ref = { paperId: publishedId, versionName: 'v1', sourceAssetVersion: 1, publicationDigest: digestJson(publication) }
jsonFile(path.join(versionDir, 'canonical/canonical-paper-publication-v1.json'), { ...publication, publicationDigest: ref.publicationDigest })
bank.prepare(`INSERT INTO canonical_paper_publications
  (paper_id, version_name, source_asset_version, publication_digest, is_current, created_at)
  VALUES (?, 'v1', 1, ?, 1, '2026-01-01 00:00:00')`)
  .run(publishedId, ref.publicationDigest)
bank.close()
jsonFile(path.join(versionDir, 'paper-asset.json'), pubAsset)
jsonFile(path.join(versionDir, 'import-meta.json'), { paper: { year: 2026, paperName: '正式测试卷' } })
const otherAsset = structuredClone(pubAsset)
otherAsset.paper.title = '其他版本'
otherAsset.content.groups[`group-${publishedId}`].passage.paragraphs[0].text = 'Different text.'
jsonFile(path.join(assets, publishedId, 'latest/paper-asset.json'), otherAsset)
jsonFile(path.join(assets, publishedId, 'latest/import-meta.json'), { paper: { year: 2025, paperName: '其他版本' } })
jsonFile(path.join(assets, publishedId, 'latest/canonical-paper-publication-ref-v1.json'), ref)
const publicationTime = new Date('2026-01-01T00:00:00Z')
utimesSync(path.join(assets, publishedId, 'latest/canonical-paper-publication-ref-v1.json'), publicationTime, publicationTime)
jsonFile(path.join(assets, publishedId, 'versions/v1/canonical/canonical-paper-plan-v1.json'), {
  paperId: publishedId, slotBindings: [{ state: 'bound', groupRef: { groupId: `group-${publishedId}` } }],
})
const users = new DatabaseSync(userPath)
ensureAuthDatabaseShape(users)
const owner = createUser(users, { username: 'agent-test-owner', passwordHash: 'unused', role: 'owner' })
const member = createUser(users, { username: 'agent-test-member', passwordHash: 'unused', role: 'member' })
const ownerCookie = `eqb_session=${createSession(users, owner.id)}`
const memberCookie = `eqb_session=${createSession(users, member.id)}`
const legacyToken = `eqb_agent_${'L'.repeat(43)}`
users.exec(`CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
)`)
users.prepare('INSERT INTO agent_tokens (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)')
  .run('legacy', '存量口令', sha256(legacyToken).slice('sha256:'.length), new Date().toISOString())
users.close()

const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const origin = `http://127.0.0.1:${port}`
async function req(route, { token, cookie, method = 'GET', body, ifNoneMatch, format = 'json' } = {}) {
  const response = await fetch(origin + route, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = format === 'bytes' ? Buffer.from(await response.arrayBuffer())
    : format === 'ndjson' ? (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      : await response.json().catch(() => null)
  return { status: response.status, headers: response.headers, data }
}
async function expectStatus(route, options, status) {
  const result = await req(route, options)
  assert.equal(result.status, status, `${route}: ${JSON.stringify(result.data)}`)
  return result.data
}
function seedReview(paperId = pendingId, { state = 'awaiting_review', number = 1, ocr = false, largeMedia = false, textSize = 0 } = {}) {
  const db = new DatabaseSync(reviewPath)
  const timestamp = `2026-01-0${number + 1}T00:00:00.000Z`
  const id = `rev-${randomUUID()}`
  const config = { paperId, provenance: { year: 2026, sourceType: '模拟题', paperName: '待审测试卷' } }
  const bytes = Buffer.from(JSON.stringify(config))
  jsonFile(path.join(files, id, 'config.json'), config)
  const manifest = { schemaVersion: ocr ? 'web-import-ocr-review-bundle-v1' : 'web-import-review-bundle-v1', paperId, paperName: '待审测试卷',
    files: [{ path: 'config.json', sha256: sha256(bytes), byteLength: bytes.length, mediaType: 'application/json', role: 'config' }] }
  if (paperId === pendingId) for (const [file, role, value] of [[materializationFilename, 'materialization', materializationFor(paperId)],
    [ocrFilename, 'ocr_source_evidence', ocrFor(paperId)]]) {
    manifest.files.push({ path: file, role, mediaType: 'application/json', ...jsonFile(path.join(files, id, file), value) })
  }
  if (largeMedia) for (const [extension, mediaType] of [['pdf', 'application/pdf'], ['mp3', 'audio/mpeg']]) {
    const file = { path: `agent-large.${extension}`, byteLength: 64 * 1024 * 1024,
      sha256: sha256('deliberately different'), mediaType, role: 'source' }
    const descriptor = openSync(path.join(files, id, file.path), 'w')
    try { ftruncateSync(descriptor, file.byteLength) } finally { closeSync(descriptor) }
    manifest.files.push(file)
  }
  db.prepare(`INSERT INTO import_review_papers (paper_id, paper_name, latest_revision_id, created_at, updated_at)
    VALUES (?, '待审测试卷', ?, ?, ?)
    ON CONFLICT(paper_id) DO UPDATE SET latest_revision_id = excluded.latest_revision_id`)
    .run(paperId, id, timestamp, timestamp)
  db.prepare(`INSERT INTO import_review_revisions
    (id,paper_id,revision_number,state,source_digest,candidate_digest,visible_structure_digest,bundle_digest,
     producer_build_id,renderer_build_id,manifest_json,created_at,finalized_at,updated_at)
    VALUES (?, ?, ?, ?, 'source', 'candidate', 'visible', 'bundle', 'fixture', 'fixture', ?, ?, ?, ?)`)
    .run(id, paperId, number, state, JSON.stringify(manifest), timestamp, timestamp, timestamp)
  const preview = { paperAsset: assetFor(paperId) }
  if (paperId === pendingId) preview.consumption = { mediaArtifacts: [mediaFor(paperId), pendingOptionMedia, secondOptionMedia]
    .map(item => ({ ...item, encodedBytes: picture.toString('base64') })) }
  if (textSize) preview.paperAsset.content.groups[`group-${paperId}`].passage.paragraphs[0].text = 'Reading text. '.repeat(textSize)
  db.prepare(`INSERT INTO import_review_product_previews
    (revision_id,bundle_digest,renderer_build_id,payload_digest,payload_json) VALUES (?, 'bundle', 'fixture', ?, ?)`)
    .run(id, digestJson(preview), JSON.stringify(preview))
  for (const file of manifest.files) db.prepare(`INSERT INTO import_review_files
    (revision_id,path,sha256,byte_length,media_type,role,uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, file.path, file.sha256, file.byteLength, file.mediaType, file.role, timestamp)
  db.close()
  return id
}

try {
  const guardPath = path.join(temp, 'guard-media.mjs')
  writeFileSync(guardPath, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    for (const name of ['openSync', 'readFileSync']) {
      const original = fs[name]
      fs[name] = function (file, ...args) {
        if (String(file).includes('agent-large.')) throw new Error('Agent read bundle PDF/audio')
        return original.call(this, file, ...args)
      }
    }
    syncBuiltinESMExports()
  `)
  child = spawn(process.execPath, ['--import', guardPath, 'server/api.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, QUESTION_BANK_DB: bankPath, USER_DATA_DB: userPath,
    QUESTION_BANK_API_PORT: String(port), QUESTION_BANK_PAPER_ASSET_ROOT: assets,
    QUESTION_BANK_IMPORT_OPS_DB: reviewPath, QUESTION_BANK_IMPORT_OPS_ROOT: files,
    QUESTION_BANK_USER_SPACE_ROOT: path.join(temp, 'space'),
  } })
  child.stdout.on('data', data => { logs += data })
  child.stderr.on('data', data => { logs += data })
  let ready = false
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await req('/api/health')).status === 200) { ready = true; break } } catch {}
    if (child.exitCode !== null) throw new Error(logs)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert(ready, logs)
  seedReview()
  const pendingRevisionId = seedReview(pendingId, { number: 2, largeMedia: true })
  const newerPublicationCandidate = seedReview(publishedId)
  for (const state of ['changes_requested', 'uploading', 'approved', 'superseded']) {
    seedReview(`paper-agent-${state}`, { state })
  }
  seedReview('paper-agent-ocr', { ocr: true })

  await expectStatus(`${api}/papers`, {}, 401)
  await expectStatus(`${api}/papers`, { token: `eqb_agent_${'x'.repeat(43)}` }, 401)
  await expectStatus(`${api}/papers`, { cookie: ownerCookie }, 401)
  await expectStatus('/api/draft-papers', {}, 401)
  await expectStatus('/api/draft-papers', { cookie: ownerCookie }, 200)
  for (const [route, method, body] of [[admin, 'GET'], [admin, 'POST', { name: 'denied' }], [`${admin}/missing/revoke`, 'POST', {}]]) {
    await expectStatus(route, { cookie: memberCookie, method, body }, 403)
  }
  await expectStatus(admin, {}, 401)
  console.log('PASS Bearer-only authentication, Owner management, existing session gate')

  const credential = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '组卷 Agent' } }, 201)
  assert.match(credential.token, /^eqb_agent_[A-Za-z0-9_-]{43}$/)
  assert.deepEqual(credential.scope, ['read'])
  await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '' } }, 400)
  await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '无效', scope: ['publish'] } }, 400)
  const tokenRows = await expectStatus(admin, { cookie: ownerCookie }, 200)
  assert(!JSON.stringify(tokenRows).includes(credential.token))
  assert(tokenRows.tokens.every(row => !('token_hash' in row) && !('token' in row)))
  assert.deepEqual(tokenRows.tokens.find(row => row.id === 'legacy').scope, ['read'])
  const tokenDb = new DatabaseSync(userPath, { readOnly: true })
  assert.equal(tokenDb.prepare('SELECT token_hash FROM agent_tokens WHERE id = ?').get(credential.id).token_hash, sha256(credential.token).replace(/^sha256:/, ''))
  tokenDb.close()
  await expectStatus(`${api}/papers`, { token: credential.token, method: 'POST', body: {} }, 405)
  await expectStatus(`${api}/papers`, { token: credential.token, method: 'OPTIONS' }, 405)
  await expectStatus('/api/draft-papers', { token: credential.token }, 401)
  await expectStatus(`${api}/papers`, { token: legacyToken }, 200)
  console.log('PASS legacy token migration and read access, new read default, digest-only storage and redaction')

  const list = await expectStatus(`${api}/papers`, { token: credential.token }, 200)
  assert.deepEqual(list.papers.map(item => item.paperId), [pendingId, publishedId])
  const pending = list.papers[0]
  assert.equal(pending.status, 'awaiting_review')
  assert.equal(pending.revisionId, pendingRevisionId)
  assert.equal(pending.title, '待审测试卷')
  assert.equal(pending.year, null)
  assert.equal(pending.type, null)
  assert.equal(pending.groupCount, null)
  assert.equal(list.papers[1].title, '正式测试卷')
  assert.equal(list.papers[1].type, 'real')
  assert.equal(list.papers[1].status, 'published')
  assert(!('revisionId' in list.papers[1]))
  const authDictionary = { token: credential.token }
  const dictionary = await expectStatus(`${api}/papers?view=dictionary`, authDictionary, 200)
  assert.equal(dictionary.view, 'dictionary')
  assert.equal(dictionary.papers.find(p => p.paperId === publishedId).revisionId, newerPublicationCandidate)
  const target = `${api}/papers/${publishedId}?view=dictionary&revision=`
  assert.equal((await expectStatus(target + newerPublicationCandidate, authDictionary, 200)).status, 'awaiting_review')
  await expectStatus(target + encodeURIComponent(ref.publicationDigest), authDictionary, 404)
  const revisionDb = new DatabaseSync(reviewPath)
  revisionDb.prepare("UPDATE import_review_revisions SET state = 'changes_requested' WHERE id = ?").run(newerPublicationCandidate)
  revisionDb.close()
  assert.equal((await expectStatus(target + encodeURIComponent(ref.publicationDigest), authDictionary, 200)).status, 'published')
  for (const failure of ['missing', 'identity']) {
    const id = `paper-agent-broken-${failure}`
    const revision = seedReview(id)
    const db = new DatabaseSync(reviewPath)
    db.prepare(failure === 'missing'
      ? 'DELETE FROM import_review_product_previews WHERE revision_id = ?'
      : "UPDATE import_review_product_previews SET payload_digest = 'invalid' WHERE revision_id = ?").run(revision)
    db.close()
    await expectStatus(`${api}/papers?type=mock`, { token: credential.token }, 200)
    await expectStatus(`${api}/papers/${id}`, { token: credential.token }, 404)
    await expectStatus(`${api}/groups/group-${id}`, { token: credential.token }, 404)
    assert.equal((await expectStatus(`${api}/groups?limit=1`, { token: credential.token }, 200)).total, 2)
  }
  const query = async (route, q) => expectStatus(`${api}/${route}?q=${encodeURIComponent(q)}`, { token: credential.token }, 200)
  assert.deepEqual((await query('papers', 'AGENT-PUBLISHED 正式')).papers.map(p => p.paperId), [publishedId])
  assert.equal((await query('papers', '正式 missing')).papers.length, 0)
  assert.equal((await query('groups', '正式   TEACHER')).total, 1)
  assert.equal((await query('groups', '正式 trip')).total, 1)
  const longRevision = seedReview('paper-agent-long', { textSize: 20 })
  const longDb = new DatabaseSync(reviewPath)
  const longPreview = JSON.parse(longDb.prepare('SELECT payload_json FROM import_review_product_previews WHERE revision_id = ?').get(longRevision).payload_json)
  longPreview.paperAsset.content.groups['group-paper-agent-long'].passage.paragraphs[0].text += ' BeyondPreview'
  longDb.prepare('UPDATE import_review_product_previews SET payload_json = ?, payload_digest = ? WHERE revision_id = ?')
    .run(JSON.stringify(longPreview), digestJson(longPreview), longRevision)
  longDb.close()
  assert.equal((await query('groups', 'beyondpreview')).total, 1)
  assert.deepEqual(await expectStatus(`${api}/papers/paper-agent-long/answer-source`, { token: credential.token }, 200), { notice: 'none' })
  const hideLong = new DatabaseSync(reviewPath)
  hideLong.prepare("UPDATE import_review_revisions SET state = 'changes_requested' WHERE id = ?").run(longRevision)
  hideLong.close()
  assert.equal((await query('groups', 'teacher missing')).total, 0)
  assert.equal((await query('groups', '   ')).total, 2)
  assert.deepEqual(await expectStatus(`${api}/sections?type=mock&year=2026`, { token: credential.token }, 200),
    { sections: [{ section: '阅读理解', count: 1 }] })
  assert.deepEqual(await expectStatus(`${api}/sections?year=1999`, { token: credential.token }, 200), { sections: [] })
  console.log('PASS missing/invalid preview isolation, paper/group search and section counts')
  assert.equal((await expectStatus(`${api}/groups/group-${pendingId}`, { token: credential.token }, 200)).questions[0].answer, 'A')
  const pendingDetail = await expectStatus(`${api}/papers/${pendingId}`, { token: credential.token }, 200)
  assert.equal(pendingDetail.groups[0].questions[0].answer, 'A')
  assert.equal(pendingDetail.revisionId, pendingRevisionId)
  assert.equal(pendingDetail.year, 2026)
  assert.equal((await expectStatus(`${api}/papers?type=mock&year=2026`, { token: credential.token }, 200)).papers.length, 1)
  const pendingGroups = await expectStatus(`${api}/groups?type=mock&year=2026`, { token: credential.token }, 200)
  assert.deepEqual(pendingGroups.groups.map(group => group.paperId), [pendingId])
  console.log('PASS cold list is lazy; paper/group reads never open 64 MiB PDF or audio')
  for (const id of ['paper-agent-changes_requested', 'paper-agent-ocr']) {
    await expectStatus(`${api}/papers/${id}`, { token: credential.token }, 404)
    await expectStatus(`${api}/groups/group-${id}`, { token: credential.token }, 404)
  }
  const filtered = await expectStatus(`${api}/papers?type=real&year=2026`, { token: credential.token }, 200)
  assert.equal(filtered.papers.length, 1)
  const detail = await expectStatus(`${api}/papers/${publishedId}`, { token: credential.token }, 200)
  assert.equal(detail.groups[0].questions[0].answer, 'A')
  assert.equal(detail.groups[0].questions[0].number, 21)
  assert.deepEqual(detail.groups[0].questions[0].options[0], { label: 'A', content: 'A lesson.' })
  assert.equal(detail.groups[0].passage.paragraphs[0].text, 'A teacher prepares a lesson.')
  assert.equal(detail.status, 'published')
  assert(!('revisionId' in detail))
  const groups = await expectStatus(`${api}/groups?section=${encodeURIComponent('阅读理解')}&type=real&year=2026&limit=1&offset=0`, { token: credential.token }, 200)
  assert.equal(groups.total, 1)
  assert.equal(groups.groups[0].preview, 'A teacher prepares a lesson. She always remembers to bring her notes.')
  assert(!('status' in groups.groups[0]) && !('revision' in groups.groups[0]))
  const group = await expectStatus(`${api}/groups/group-${publishedId}`, { token: credential.token }, 200)
  assert.equal(group.questions[0].answer, 'A')
  assert(!('status' in group) && !('revision' in group))
  const auth = { token: credential.token }
  const passage = detail.groups[0].passage
  const mediaUrlFor = (paperId, mediaId) => `${api}/media/${paperId}/${encodeURIComponent(mediaId)}`
  const regressionCases = [
    ['partial option media resolves available images and reports missing IDs', () => {
      const asset = structuredClone(pubAsset)
      const groupId = `group-${publishedId}`
      const option = asset.content.questions[`question-${publishedId}`].options[2]
      const missingId = 'media:missing-option:fixture'
      option.content[1].mediaId = missingId
      const result = agentGroup({ paperId: publishedId, asset }, groupId, { media: [secondOptionMedia] })
      assert.deepEqual(result.questions[0].options[2], {
        ...detail.groups[0].questions[0].options[2],
        media: detail.groups[0].questions[0].options[2].media.slice(0, 1),
        notice: 'media_missing',
        missingMediaIds: [missingId],
      })
    }],
    ['option media projected and served only for its paper', async () => {
      const options = detail.groups[0].questions[0].options
      const projected = (item, variant = item) => ({
        mediaId: item.mediaId, mimeType: variant.mimeType, width: variant.pixelWidth, height: variant.pixelHeight,
        mediaUrl: mediaUrlFor(publishedId, item.mediaId),
      })
      assert.deepEqual(options, [
        { label: 'A', content: 'A lesson.' },
        { label: 'B', content: '', kind: 'image', media: [projected(optionMedia, redrawMeta)] },
        { label: 'C', content: 'A trip.', kind: 'mixed', media: [projected(secondOptionMedia), projected(optionMedia, redrawMeta)] },
        { label: 'D', content: '', kind: 'image', media: [], notice: 'media_missing' },
      ])
      assert.deepEqual(group.questions[0].options, options)
      for (const item of options[2].media) {
        const image = await req(item.mediaUrl, { ...auth, format: 'bytes' })
        assert.equal(image.status, 200)
        assert.equal(image.headers.get('content-type'), item.mimeType)
        assert.equal(image.headers.get('etag'), `"${sha256(image.data)}"`)
        assert.equal(sha256(image.data), item.mediaId === optionMedia.mediaId ? redrawMeta.sha256 : secondOptionMedia.sha256)
        await expectStatus(mediaUrlFor(pendingId, item.mediaId), auth, 404)
      }
    }],
    ['Candidate media bytes loaded on demand', async () => {
      const option = pendingDetail.groups[0].questions[0].options[1]
      assert.deepEqual(option, { label: 'B', content: '', kind: 'image', media: [{
        mediaId: pendingOptionMedia.mediaId, mimeType: 'image/png', width: 1, height: 1,
        mediaUrl: mediaUrlFor(pendingId, pendingOptionMedia.mediaId),
      }] })
      const image = await req(option.media[0].mediaUrl, { ...auth, format: 'bytes' })
      assert.equal(image.status, 200)
      assert.equal(image.headers.get('etag'), `"${sha256(image.data)}"`)
      assert.equal(sha256(image.data), pendingOptionMedia.sha256)
      const db = new DatabaseSync(reviewPath)
      const row = db.prepare('SELECT payload_digest FROM import_review_product_previews WHERE revision_id = ?').get(pendingRevisionId)
      const update = db.prepare('UPDATE import_review_product_previews SET payload_digest = ? WHERE revision_id = ?')
      try {
        update.run('invalid', pendingRevisionId)
        await expectStatus(pendingDetail.groups[0].passage.blocks[0].mediaUrl, auth, 404)
      } finally {
        update.run(row.payload_digest, pendingRevisionId)
        db.close()
      }
    }],
    ['published display variant metadata and bytes', async () => {
      const figure = passage.blocks[1]
      const image = await req(figure.mediaUrl, { ...auth, format: 'bytes' })
      assert.deepEqual([figure.mimeType, figure.width, figure.height, image.headers.get('content-type'), sha256(image.data)],
        [displayMeta.mimeType, displayMeta.pixelWidth, displayMeta.pixelHeight, displayMeta.mimeType, displayMeta.sha256])
      const selected = await req(mediaUrlFor(publishedId, stemMedia.mediaId), { ...auth, format: 'bytes' })
      assert.equal(sha256(selected.data), redrawMeta.sha256)
    }],
    ['stem and table image references', async () => {
      const stem = await req(mediaUrlFor(publishedId, stemMedia.mediaId), { ...auth, format: 'bytes' })
      const cell = await req(mediaUrlFor(publishedId, tableMedia.mediaId), { ...auth, format: 'bytes' })
      assert.deepEqual([stem.status, cell.status, passage.blocks[4].rows[0][1]],
        [200, 200, { mediaId: tableMedia.mediaId, mediaUrl: mediaUrlFor(publishedId, tableMedia.mediaId) }])
    }],
    ['confirmed uppercase cross-page continuation', () => {
      const joined = materializationFor(publishedId)
      const continuation = joined.groups[0].blocks.find(block => block.blockId === 'p3')
      continuation.content[0].text = 'London was on her list.'
      continuation.source = { ...source, page: 2 }
      joined.paragraphJoins = [{ groupId: `group-${publishedId}`, sourceReview: { sameNaturalParagraph: true },
        fragments: [{ blockId: 'p2' }, { blockId: 'p3' }] }]
      const result = agentGroup({ paperId: publishedId, asset: pubAsset }, `group-${publishedId}`, { materialization: joined })
      assert.deepEqual(result.passage.paragraphs.map(p => [p.naturalParagraph, p.naturalParagraphBasis]),
        [[1, 'order'], [2, 'order'], [2, 'merged']])
    }],
  ]
  const failures = []
  for (const [name, check] of regressionCases) {
    try {
      await check()
      console.log(`PASS ${name}`)
    } catch (error) {
      failures.push(`${name}: ${error.message}`)
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(passage.paragraphs, passageFor(publishedId).map((paragraph, index) => ({
    ...paragraph, naturalParagraph: [1, 2, 2][index], naturalParagraphBasis: index === 2 ? 'merged' : 'order',
  })))
  assert.deepEqual(group.passage, passage)
  assert.deepEqual(passage.blocks.map(block => block.kind),
    ['paragraph', 'figure', 'paragraph', 'paragraph', 'table', 'paragraph', 'paragraph', 'paragraph'])
  assert.deepEqual(passage.blocks[2], { kind: 'paragraph', blockId: 'p2', paragraphId: 'p2', role: 'body',
    page: 1, naturalParagraph: 2, naturalParagraphBasis: 'order' })
  assert.deepEqual(passage.blocks[4], { kind: 'table', blockId: 'table', columnCount: 3,
    rows: [[{ text: 'Merged', columnSpan: 2 }, { mediaId: tableMedia.mediaId, mediaUrl: mediaUrlFor(publishedId, tableMedia.mediaId) }]] })
  assert.deepEqual(passage.blocks[5], { kind: 'paragraph', blockId: 'title', paragraphId: null, role: 'title', page: 1 })
  assert.deepEqual(passage.blocks[6], { kind: 'paragraph', blockId: 'ambiguous', paragraphId: null, role: 'body',
    page: 1, naturalParagraph: null, naturalParagraphBasis: null, naturalParagraphReason: 'multiple_paragraphs_in_block' })
  assert.equal(passage.blocks[7].naturalParagraph, null)
  const pendingPassage = pendingDetail.groups[0].passage
  assert.equal(pendingPassage.notice, 'image_only')
  assert.deepEqual(pendingPassage.paragraphs, [])
  for (const [figure, paperId] of [[passage.blocks[1], publishedId], [pendingPassage.blocks[0], pendingId]]) {
    const item = paperId === publishedId ? { ...mediaFor(paperId), ...displayMeta } : mediaFor(paperId)
    assert.deepEqual(figure, { kind: 'figure', blockId: 'figure', mediaId: item.mediaId, caption: 'Figure', page: 1,
      mimeType: item.mimeType, width: item.pixelWidth, height: item.pixelHeight, mediaUrl: mediaUrlFor(paperId, item.mediaId) })
    const image = await req(figure.mediaUrl, { ...auth, format: 'bytes' })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), item.mimeType)
    assert.equal(image.headers.get('etag'), `"${item.sha256}"`)
    assert.equal(sha256(image.data), item.sha256)
    await expectStatus(figure.mediaUrl, { ...auth, ifNoneMatch: image.headers.get('etag') }, 304)
    const ocr = await expectStatus(`${api}/papers/${paperId}/answer-source`, auth, 200)
    assert.deepEqual(ocr, { entries: [{ documentId: 'answers', page: 2, region, text: '21. A' }] })
  }
  await expectStatus(passage.blocks[1].mediaUrl, {}, 401)
  await expectStatus(`${api}/media/${publishedId}/${encodeURIComponent(pendingPassage.blocks[0].mediaId)}`, auth, 404)
  await expectStatus(`${api}/media/${publishedId}/${encodeURIComponent(unreferencedMedia.mediaId)}`, auth, 404)
  await expectStatus(`${api}/media/${publishedId}/%ff`, auth, 404)
  assert.equal(projectAgentPassage(publishedId, { paragraphs: [] }, undefined).notice, 'empty')
  const inverted = materializationFor(publishedId).groups[0]
  inverted.blocks[0].source = { ...source, page: 2 }
  assert.equal(projectAgentPassage(publishedId, { paragraphs: passageFor(publishedId) }, inverted)
    .blocks.find(block => block.blockId === 'p2').naturalParagraphReason, 'source_order_conflict')
  const syntheticAudit = { paperId: publishedId, groups: [{ ...group, questions: [
    { number: 21, stem: 'Why does the author mention her notes in the first paragraph?', options: [] },
    { number: 22, stem: 'Why does the author mention her notes in Para. 1?', options: [] },
    { number: 23, stem: 'What does “her notes” mean in the 2nd paragraph?', options: [] },
  ] }] }
  assert.deepEqual(auditParagraphRefs(syntheticAudit).map(issue => [issue.questionNo, issue.citedParagraph, issue.actualParagraph]),
    [[21, 1, 2], [22, 1, 2]])
  console.log('PASS original paragraphs, ordered blocks, natural paragraph numbering, merged table, image-only notice, scoped media and answer OCR')

  const ndjson = { ...auth, format: 'ndjson' }
  const exported = await req(`${api}/export`, ndjson)
  assert.equal(exported.status, 200)
  assert.match(exported.headers.get('content-type'), /^application\/x-ndjson/)
  assert.deepEqual(exported.data.map(({ etag, updatedAt, ...paper }) => {
    assert.equal(etag, digestJson(paper))
    assert.equal(updatedAt, new Date(updatedAt).toISOString())
    return paper
  }), [pendingDetail, detail])
  assert.deepEqual((await expectStatus(`${api}/export?since=2026-01-01T12:00:00Z`, ndjson, 200)).map(row => row.paperId), [pendingId])
  assert.deepEqual(await expectStatus(`${api}/export?since=2026-01-03T00:00:00Z`, ndjson, 200), [])
  await expectStatus(`${api}/export?since=yesterday`, auth, 400)
  await expectStatus(`${api}/export`, {}, 401)
  await expectStatus(`${api}/meta`, {}, 401)
  assert.deepEqual(Object.keys(await expectStatus(`${api}/meta`, auth, 200)).sort(), ['apiVersion', 'deployedAt', 'deployedSha'])
  const deployedSha = 'a'.repeat(40)
  const releaseDir = path.join(temp, 'deploy', 'releases', deployedSha)
  jsonFile(path.join(releaseDir, '.eqb-release.json'), {
    schemaVersion: 'eqb-release-v1', sha: deployedSha, secretPath: userPath,
  })
  symlinkSync(releaseDir, path.join(temp, 'deploy/current'), 'dir')
  const meta = agentDeploymentMeta(releaseDir)
  assert.deepEqual(meta, { deployedSha, deployedAt: new Date(meta.deployedAt).toISOString(), apiVersion: 'v1' })
  assert(!JSON.stringify(meta).includes(userPath))
  console.log('PASS NDJSON detail parity and ETags, two since cutoffs, and deployment meta fields')

  const reportPath = `${api}/reports`
  const questionId = `question-${publishedId}`
  const draftPath = `${api}/drafts/${publishedId}/${questionId}`
  const reportBody = { paperId: publishedId, questionId, kind: 'answer', note: '复核选项 A', evidence: '答案页第 2 页' }
  const fullScope = ['read', 'report:append', 'drafts:write']
  const makeWriter = async (name, scope = fullScope) => (await expectStatus(admin, {
    cookie: ownerCookie, method: 'POST', body: { name, scope },
  }, 201)).token
  const writer = { token: await makeWriter('复核 Agent') }
  const other = { token: await makeWriter('另一 Agent') }
  const reportOnly = { token: await makeWriter('上报 Agent', ['report:append']) }
  assert.doesNotMatch(reportOnly.token, /^eqb_agent_[A-Za-z0-9_-]{43}$/)
  await expectStatus(`${api}/papers`, reportOnly, 403)
  assert.deepEqual((await expectStatus(`${api}/meta?include=scope`, reportOnly, 200)).scope, ['report:append'])
  for (const [route, method, body] of [[reportPath, 'POST', reportBody], [draftPath, 'PUT', {}]]) {
    await expectStatus(route, { method, body }, 401)
    await expectStatus(route, { token: legacyToken, method, body }, 403)
    await expectStatus(route, { token: legacyToken }, 403)
  }
  const postReport = (body, status = 201) => expectStatus(reportPath, { ...writer, method: 'POST', body }, status)
  const report = await postReport(reportBody)
  const reportForGroup = await postReport({ ...reportBody, questionId: undefined, groupId: `group-${publishedId}` })
  for (const bad of [{ groupId: `group-${publishedId}` }, { questionId: undefined }, { note: 'n'.repeat(2001) }]) {
    await postReport({ ...reportBody, ...bad }, 400)
  }
  for (const bad of [{ questionId: `question-${pendingId}` }, { paperId: 'paper-agent-changes_requested' },
    { questionId: undefined, groupId: `group-${pendingId}` }]) await postReport({ ...reportBody, ...bad }, 404)
  const myReports = (await expectStatus(reportPath, writer, 200)).reports
  assert.deepEqual(myReports.map(item => item.id).sort(), [report.id, reportForGroup.id].sort())
  assert(myReports.every(item => item.status === 'pending'))
  assert.deepEqual((await expectStatus(reportPath, other, 200)).reports, [])
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    for (const route of [reportPath, `${reportPath}/${report.id}`]) await expectStatus(route, { ...writer, method }, 405)
  }
  await expectStatus(adminReports, {}, 401)
  await expectStatus(adminReports, { cookie: memberCookie }, 403)
  const ownerReports = (await expectStatus(adminReports, { cookie: ownerCookie }, 200)).reports
  assert.deepEqual(ownerReports.map(item => [item.id, item.tokenName]).sort(),
    myReports.map(item => [item.id, '复核 Agent']).sort())

  const draftMarker = 'agent-draft-private-marker'
  const screenPath = `/paper-assets/${publishedId}/latest/paper-asset.json`
  const screenBefore = await expectStatus(screenPath, { cookie: ownerCookie }, 200)
  await expectStatus(`${api}/drafts/${publishedId}/question-${pendingId}`, { ...writer, method: 'PUT', body: {} }, 404)
  await expectStatus(draftPath, { ...writer, method: 'PUT', body: [] }, 400)
  await expectStatus(draftPath, { ...writer, method: 'PUT', body: { content: 'x'.repeat(32768) } }, 413)
  for (const content of ['first draft', draftMarker]) {
    await expectStatus(draftPath, { ...writer, method: 'PUT', body: { content } }, 200)
  }
  assert.deepEqual((await expectStatus(draftPath, writer, 200)).body, { content: draftMarker })
  await expectStatus(draftPath, other, 404)
  await expectStatus(draftPath, { ...other, method: 'PUT', body: { content: 'separate draft' } }, 200)
  assert.deepEqual((await expectStatus(draftPath, writer, 200)).body, { content: draftMarker })
  for (const route of ['papers', `papers/${publishedId}`, 'groups', `groups/group-${publishedId}`, 'export']) {
    const data = await expectStatus(`${api}/${route}`, route === 'export' ? ndjson : auth, 200)
    assert(!JSON.stringify(data).includes(draftMarker))
  }
  assert.deepEqual(await expectStatus(screenPath, { cookie: ownerCookie }, 200), screenBefore)
  console.log('PASS scoped reports, target validation, append-only routes, Owner list and draft overwrite/isolation from paper reads')

  const regressions = await Promise.allSettled([
    (async () => {
      await expectStatus(draftPath, { ...writer, method: 'PUT' }, 400)
      const chunked = await fetch(origin + draftPath, {
        method: 'PUT', headers: { Authorization: `Bearer ${writer.token}` }, duplex: 'half',
        body: new ReadableStream({ start(controller) { controller.close() } }),
      })
      assert.equal(chunked.status, 400)
      await chunked.json()
      assert.deepEqual((await expectStatus(draftPath, writer, 200)).body, { content: draftMarker })
      assert.deepEqual((await expectStatus(draftPath, { ...writer, method: 'PUT', body: {} }, 200)).body, {})
    })(),
    (async () => {
      const db = new DatabaseSync(userPath)
      try {
        const { id } = db.prepare('SELECT id FROM agent_tokens WHERE name = ?').get('复核 Agent')
        const insert = db.prepare(`INSERT INTO agent_reports (id, token_id, paper_id, question_id, kind, note, evidence, created_at)
          VALUES (?, ?, ?, ?, 'answer', 'fixture', 'fixture', '2026-01-02T00:00:00.000Z')`)
        for (let i = 0; i < 201; i++) insert.run(`fixture-${String(i).padStart(3, '0')}`, id, publishedId, questionId)
      } finally { db.close() }
      for (const [route, credentials] of [[reportPath, writer], [adminReports, { cookie: ownerCookie }]]) {
        const first = await expectStatus(route, credentials, 200)
        assert.equal(first.reports.length, 50, `${route} default page length`)
        assert.equal(first.nextOffset, 50)
        const second = await expectStatus(`${route}?limit=200&offset=50`, credentials, 200)
        assert.equal(second.reports.length, 153)
        assert.equal(second.reports[0].id, 'fixture-048')
        assert.equal(second.nextOffset, null)
        await expectStatus(`${route}?limit=201`, credentials, 400)
        await expectStatus(`${route}?offset=-1`, credentials, 400)
      }
    })(),
  ])
  assert.deepEqual(regressions.flatMap(result => result.status === 'rejected' ? [result.reason.message] : []), [])
  console.log('PASS empty draft PUT preserves data, explicit object allowed, both report lists are paginated')

  const rate = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '限流', scope: fullScope } }, 201)
  for (let count = 0; count < 118; count++) await expectStatus(`${api}/papers`, { token: rate.token }, 200)
  assert.equal((await req(passage.blocks[1].mediaUrl, { token: rate.token, format: 'bytes' })).status, 200)
  assert.equal((await expectStatus(`${api}/export`, { token: rate.token, format: 'ndjson' }, 200)).length, 2)
  const limited = await req(`${api}/papers`, { token: rate.token })
  assert.equal(limited.status, 429)
  assert(Number(limited.headers.get('retry-after')) > 0)
  for (const [route, method, body, readStatus, writeStatus] of [
    [reportPath, 'POST', reportBody, 200, 201], [draftPath, 'PUT', {}, 404, 200],
  ]) {
    for (let count = 0; count < 29; count++) await expectStatus(route, { token: rate.token }, readStatus)
    await expectStatus(route, { token: rate.token, method, body }, writeStatus)
    await expectStatus(route, { token: rate.token, method, body }, 429)
  }
  assert((await expectStatus(admin, { cookie: ownerCookie }, 200)).tokens.find(row => row.id === rate.id).lastUsedAt)
  console.log('PASS independent read, report and draft limits, read includes media and counts export once, activity timestamp')
  await expectStatus(`${api}/groups?limit=-1`, { token: credential.token }, 400)
  seedReview(pendingId, { number: 3 })
  const refreshed = await expectStatus(`${api}/papers/${pendingId}`, { token: credential.token }, 200)
  assert.notEqual(refreshed.revisionId, pendingRevisionId)
  const reviewDb = new DatabaseSync(reviewPath)
  reviewDb.prepare("UPDATE import_review_revisions SET state = 'changes_requested' WHERE paper_id = ?").run(pendingId)
  reviewDb.close()
  assert.equal((await expectStatus(`${api}/papers?type=mock`, { token: credential.token }, 200)).papers.length, 0)
  await expectStatus(`${api}/papers/${pendingId}`, { token: credential.token }, 404)
  console.log('PASS published priority, latest awaiting Candidate, status exclusion, cache refresh, filters and answers')
  console.log('EXAMPLES', JSON.stringify({ papers: filtered, groups, media: passage.blocks[1], meta }))
  const benchmarkRevisions = Array.from({ length: 10 }, (_, i) =>
    seedReview(`paper-agent-benchmark-${i}`, { state: 'changes_requested', textSize: 10000 }))
  const reviewStore = createImportReviewStore({ dbPath: reviewPath, filesRoot: files,
    rendererBuildId: 'fixture', initializeSchema: false })
  const timings = benchmarkRevisions.map(id => {
    const started = performance.now()
    assert.equal(reviewStore.agentPaperAssetForRevision(id).paperAsset.paper.paperId.startsWith('paper-agent-benchmark-'), true)
    return performance.now() - started
  })
  console.log('BENCHMARK 10 uncached ~128 KiB JSON papers', JSON.stringify({
    totalMs: timings.reduce((a, b) => a + b, 0), meanMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: Math.min(...timings), maxMs: Math.max(...timings),
  }))

  await expectStatus(`${admin}/${credential.id}/revoke`, { cookie: ownerCookie, method: 'POST', body: {} }, 200)
  await expectStatus(`${api}/papers`, { token: credential.token }, 401)
  await expectStatus('/api/draft-papers', { cookie: ownerCookie }, 200)
  console.log('PASS immediate revocation and unchanged sessions')
  const bootstrap = new DatabaseSync(userPath)
  bootstrap.exec('DELETE FROM users')
  bootstrap.close()
  await expectStatus(`${api}/papers`, {}, 401)
  await expectStatus(admin, { method: 'POST', body: { name: 'denied' } }, 403)
  await expectStatus('/api/draft-papers', {}, 200)
  console.log('PASS empty-user bootstrap cannot bypass Agent or token-management authentication')
} catch (error) {
  console.error(logs)
  throw error
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close')
    child.kill('SIGTERM')
    const force = setTimeout(() => child.kill('SIGKILL'), 5000)
    await closed
    clearTimeout(force)
  }
  rmSync(temp, { recursive: true, force: true })
}
