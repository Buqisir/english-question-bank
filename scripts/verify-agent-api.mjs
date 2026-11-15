#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { closeSync, ftruncateSync, openSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createSession, createUser, ensureAuthDatabaseShape } from '../server/auth/auth.mjs'
import { ensureCanonicalPublicationDatabaseShape } from '../server/paper-canonical/publication.mjs'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '..')
const temp = mkdtempSync(path.join(tmpdir(), 'eqb-agent-api-'))
const bankPath = path.join(temp, 'bank.sqlite')
const userPath = path.join(temp, 'users.sqlite')
const reviewPath = path.join(temp, 'review.sqlite')
const assets = path.join(temp, 'assets')
const files = path.join(temp, 'review-files')
const api = '/api/agent/v1'
const admin = '/api/admin/agent-tokens'
let child
let logs = ''
function jsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}
function assetFor(paperId) {
  const groupId = `group-${paperId}`
  const questionId = `question-${paperId}`
  return {
    paper: { paperId, title: '不应替代元数据标题' },
    layoutTree: { parts: [{ title: '阅读', sections: [{ title: '阅读理解', groups: [{ groupId }] }] }] },
    content: {
      blocks: [{ type: 'group', groupId }],
      groups: { [groupId]: { groupId, groupType: 'reading', title: '阅读 A',
        passage: { paragraphs: [{ text: 'A teacher prepares a lesson.' }] }, questionIds: [questionId] } },
      questions: { [questionId]: { questionId, groupId, questionNo: 21, stem: 'What does the teacher prepare?',
        options: [{ label: 'A', text: 'A lesson.' }, { label: 'B', text: 'A trip.' }] } },
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
const ref = { paperId: publishedId, versionName: 'v1', sourceAssetVersion: 1, publicationDigest: 'fixture-digest' }
bank.prepare(`INSERT INTO canonical_paper_publications
  (paper_id, version_name, source_asset_version, publication_digest, is_current) VALUES (?, 'v1', 1, ?, 1)`)
  .run(publishedId, ref.publicationDigest)
bank.close()
jsonFile(path.join(assets, publishedId, 'latest/paper-asset.json'), pubAsset)
jsonFile(path.join(assets, publishedId, 'latest/import-meta.json'), { paper: { year: 2026, paperName: '正式测试卷' } })
jsonFile(path.join(assets, publishedId, 'latest/canonical-paper-publication-ref-v1.json'), ref)
jsonFile(path.join(assets, publishedId, 'versions/v1/canonical/canonical-paper-plan-v1.json'), {
  paperId: publishedId, slotBindings: [{ state: 'bound', groupRef: { groupId: `group-${publishedId}` } }],
})
const users = new DatabaseSync(userPath)
ensureAuthDatabaseShape(users)
const owner = createUser(users, { username: 'agent-test-owner', passwordHash: 'unused', role: 'owner' })
const member = createUser(users, { username: 'agent-test-member', passwordHash: 'unused', role: 'member' })
const ownerCookie = `eqb_session=${createSession(users, owner.id)}`
const memberCookie = `eqb_session=${createSession(users, member.id)}`
users.close()

const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const origin = `http://127.0.0.1:${port}`
async function req(route, { token, cookie, method = 'GET', body } = {}) {
  const response = await fetch(origin + route, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) }
}
async function expectStatus(route, options, status) {
  const result = await req(route, options)
  assert.equal(result.status, status, `${route}: ${JSON.stringify(result.data)}`)
  return result.data
}
function seedReview(paperId = pendingId, { state = 'awaiting_review', number = 1, ocr = false, largeMedia = false, textSize = 0 } = {}) {
  const db = new DatabaseSync(reviewPath)
  const timestamp = new Date().toISOString()
  const id = `rev-${randomUUID()}`
  const config = { paperId, provenance: { year: 2026, sourceType: '模拟题', paperName: '待审测试卷' } }
  const bytes = Buffer.from(JSON.stringify(config))
  jsonFile(path.join(files, id, 'config.json'), config)
  const manifest = { schemaVersion: ocr ? 'web-import-ocr-review-bundle-v1' : 'web-import-review-bundle-v1', paperId, paperName: '待审测试卷',
    files: [{ path: 'config.json', sha256: sha256(bytes), byteLength: bytes.length, mediaType: 'application/json', role: 'config' }] }
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
  seedReview(publishedId)
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
  await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '' } }, 400)
  const tokenRows = await expectStatus(admin, { cookie: ownerCookie }, 200)
  assert(!JSON.stringify(tokenRows).includes(credential.token))
  assert(tokenRows.tokens.every(row => !('token_hash' in row) && !('token' in row) && !('scope' in row)))
  const tokenDb = new DatabaseSync(userPath, { readOnly: true })
  assert.equal(tokenDb.prepare('SELECT token_hash FROM agent_tokens WHERE id = ?').get(credential.id).token_hash, sha256(credential.token).replace(/^sha256:/, ''))
  assert(!tokenDb.prepare('PRAGMA table_info(agent_tokens)').all().some(column => column.name === 'scope'))
  tokenDb.close()
  await expectStatus(`${api}/papers`, { token: credential.token, method: 'POST', body: {} }, 405)
  await expectStatus(`${api}/papers`, { token: credential.token, method: 'OPTIONS' }, 405)
  await expectStatus('/api/draft-papers', { token: credential.token }, 401)
  console.log('PASS token creation, digest-only storage, redaction, GET-only access')

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
  assert.equal(groups.groups[0].preview, 'A teacher prepares a lesson.')
  assert(!('status' in groups.groups[0]) && !('revision' in groups.groups[0]))
  const group = await expectStatus(`${api}/groups/group-${publishedId}`, { token: credential.token }, 200)
  assert.equal(group.questions[0].answer, 'A')
  assert(!('status' in group) && !('revision' in group))
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
  console.log('EXAMPLES', JSON.stringify({ papers: filtered, paper: detail, groups, group }))
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

  const rate = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '限流' } }, 201)
  for (let count = 0; count < 120; count++) await expectStatus(`${api}/papers`, { token: rate.token }, 200)
  const limited = await req(`${api}/papers`, { token: rate.token })
  assert.equal(limited.status, 429)
  assert(Number(limited.headers.get('retry-after')) > 0)
  assert((await expectStatus(admin, { cookie: ownerCookie }, 200)).tokens.find(row => row.id === rate.id).lastUsedAt)
  await expectStatus(`${admin}/${credential.id}/revoke`, { cookie: ownerCookie, method: 'POST', body: {} }, 200)
  await expectStatus(`${api}/papers`, { token: credential.token }, 401)
  await expectStatus('/api/draft-papers', { cookie: ownerCookie }, 200)
  console.log('PASS 120/min limit, activity timestamp, immediate revocation, unchanged sessions')
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
