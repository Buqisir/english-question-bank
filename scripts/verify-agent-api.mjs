#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createSession, createUser, ensureAuthDatabaseShape } from '../server/auth/auth.mjs'
import { ensureCanonicalPublicationDatabaseShape } from '../server/paper-canonical/publication.mjs'
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
jsonFile(path.join(assets, publishedId, 'latest/import-meta.json'), { paper: { year: 2026, paperName: '正式测试卷', sourceType: '真题' } })
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
let revision
let publishedRevision
function seedReview() {
  const db = new DatabaseSync(reviewPath)
  const timestamp = new Date().toISOString()
  for (const paperId of [publishedId, pendingId]) {
  db.prepare(`INSERT INTO import_review_papers (paper_id, paper_name, created_at, updated_at)
    VALUES (?, '待审测试卷', ?, ?)`).run(paperId, timestamp, timestamp)
  for (let number = 1; number <= 2; number++) {
    const id = `rev-${randomUUID()}`
    if (paperId === pendingId) revision = id
    else publishedRevision = id
    const config = { paperId, provenance: { year: 2026, sourceType: paperId === pendingId ? '模拟题' : '真题', paperName: '待审测试卷' } }
    const bytes = Buffer.from(JSON.stringify(config))
    jsonFile(path.join(files, id, 'config.json'), config)
    const manifest = { schemaVersion: 'web-import-review-bundle-v1', paperId, paperName: '待审测试卷',
      files: [{ path: 'config.json', sha256: sha256(bytes), byteLength: bytes.length, mediaType: 'application/json', role: 'config' }] }
    db.prepare(`INSERT INTO import_review_revisions
      (id,paper_id,revision_number,state,source_digest,candidate_digest,visible_structure_digest,bundle_digest,
       producer_build_id,renderer_build_id,manifest_json,created_at,finalized_at,updated_at)
      VALUES (?, ?, ?, 'awaiting_review', 'source', 'candidate', 'visible', 'bundle', 'fixture', 'fixture', ?, ?, ?, ?)`)
      .run(id, paperId, number, JSON.stringify(manifest), timestamp, timestamp, timestamp)
    const preview = { paperAsset: assetFor(paperId) }
    db.prepare(`INSERT INTO import_review_product_previews
      (revision_id,bundle_digest,renderer_build_id,payload_digest,payload_json) VALUES (?, 'bundle', 'fixture', ?, ?)`)
      .run(id, digestJson(preview), JSON.stringify(preview))
  }
  db.prepare('UPDATE import_review_papers SET latest_revision_id = ? WHERE paper_id = ?')
    .run(paperId === pendingId ? revision : publishedRevision, paperId)
  }
  db.close()
}

try {
  child = spawn(process.execPath, ['server/api.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
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

  await expectStatus(`${api}/papers`, {}, 401)
  await expectStatus(`${api}/papers`, { token: `eqb_agent_${'x'.repeat(43)}` }, 401)
  await expectStatus(`${api}/papers`, { cookie: ownerCookie }, 401)
  await expectStatus('/api/draft-papers', {}, 401)
  await expectStatus('/api/draft-papers', { cookie: ownerCookie }, 200)
  for (const [route, method, body] of [[admin, 'GET'], [admin, 'POST', { name: 'denied', scope: 'test' }], [`${admin}/missing/revoke`, 'POST', {}]]) {
    await expectStatus(route, { cookie: memberCookie, method, body }, 403)
  }
  await expectStatus(admin, {}, 401)
  console.log('PASS Bearer-only authentication, Owner management, existing session gate')

  const published = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '正式', scope: 'published' } }, 201)
  const test = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '测试', scope: 'test' } }, 201)
  assert.match(test.token, /^eqb_agent_[A-Za-z0-9_-]{43}$/)
  await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '', scope: 'test' } }, 400)
  await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: 'invalid', scope: 'all' } }, 400)
  const tokenRows = await expectStatus(admin, { cookie: ownerCookie }, 200)
  assert(!JSON.stringify(tokenRows).includes(test.token))
  assert(tokenRows.tokens.every(row => !('token_hash' in row) && !('token' in row)))
  const tokenDb = new DatabaseSync(userPath, { readOnly: true })
  assert.equal(tokenDb.prepare('SELECT token_hash FROM agent_tokens WHERE id = ?').get(test.id).token_hash, sha256(test.token).replace(/^sha256:/, ''))
  tokenDb.close()
  await expectStatus(`${api}/papers`, { token: test.token, method: 'POST', body: {} }, 405)
  await expectStatus(`${api}/papers`, { token: test.token, method: 'OPTIONS' }, 405)
  await expectStatus('/api/draft-papers', { token: test.token }, 401)
  console.log('PASS token creation, digest-only storage, redaction, GET-only scope')

  const list = await expectStatus(`${api}/papers`, { token: published.token }, 200)
  assert.deepEqual(list.papers.map(item => item.paperId), [publishedId])
  assert.equal(list.papers[0].title, '正式测试卷')
  assert.equal(list.papers[0].type, 'real')
  await expectStatus(`${api}/papers/${pendingId}`, { token: published.token }, 404)
  await expectStatus(`${api}/groups/group-${pendingId}`, { token: published.token }, 404)
  await expectStatus(`${api}/papers/${pendingId}?revision=${revision}`, { token: published.token }, 404)
  const testList = await expectStatus(`${api}/papers?type=mock&year=2026`, { token: test.token }, 200)
  assert.equal(testList.papers.length, 1)
  assert.equal(testList.papers[0].status, 'awaiting_review')
  assert.equal(testList.papers[0].revision, revision)
  const detail = await expectStatus(`${api}/papers/${pendingId}?revision=${revision}`, { token: test.token }, 200)
  assert.equal(detail.groups[0].questions[0].answer, 'A')
  assert.equal(detail.groups[0].questions[0].number, 21)
  assert.deepEqual(detail.groups[0].questions[0].options[0], { label: 'A', content: 'A lesson.' })
  assert.equal(detail.groups[0].passage.paragraphs[0].text, 'A teacher prepares a lesson.')
  const groups = await expectStatus(`${api}/groups?section=${encodeURIComponent('阅读理解')}&type=mock&year=2026&limit=1&offset=0`, { token: test.token }, 200)
  assert.equal(groups.total, 1)
  assert.equal(groups.groups[0].preview, 'A teacher prepares a lesson.')
  const group = await expectStatus(`${api}/groups/group-${pendingId}`, { token: test.token }, 200)
  assert.equal(group.questions[0].answer, 'A')
  assert.equal(group.status, 'awaiting_review')
  const pubDetail = await expectStatus(`${api}/papers/${publishedId}`, { token: published.token }, 200)
  assert.equal(pubDetail.groups[0].questions[0].answer, 'A')
  assert.equal((await expectStatus(`${api}/papers/${publishedId}`, { token: test.token }, 200)).status, 'published')
  assert.equal((await expectStatus(`${api}/groups/group-${publishedId}`, { token: test.token }, 200)).status, 'published')
  assert.equal((await expectStatus(`${api}/papers/${publishedId}?revision=${publishedRevision}`, { token: test.token }, 200)).status, 'awaiting_review')
  await expectStatus(`${api}/papers/${publishedId}?revision=${publishedRevision}`, { token: published.token }, 404)
  await expectStatus(`${api}/groups/group-${publishedId}?revision=${publishedRevision}`, { token: published.token }, 404)
  await expectStatus(`${api}/groups?limit=-1`, { token: test.token }, 400)
  console.log('PASS publication isolation, latest pending revision, provenance, filters, passage/options/answers')
  console.log('EXAMPLES', JSON.stringify({ papers: testList, paper: detail, groups, group }))

  const rate = await expectStatus(admin, { cookie: ownerCookie, method: 'POST', body: { name: '限流', scope: 'published' } }, 201)
  for (let count = 0; count < 120; count++) await expectStatus(`${api}/papers`, { token: rate.token }, 200)
  const limited = await req(`${api}/papers`, { token: rate.token })
  assert.equal(limited.status, 429)
  assert(Number(limited.headers.get('retry-after')) > 0)
  assert((await expectStatus(admin, { cookie: ownerCookie }, 200)).tokens.find(row => row.id === rate.id).lastUsedAt)
  await expectStatus(`${admin}/${test.id}/revoke`, { cookie: ownerCookie, method: 'POST', body: {} }, 200)
  await expectStatus(`${api}/papers`, { token: test.token }, 401)
  await expectStatus('/api/draft-papers', { cookie: ownerCookie }, 200)
  console.log('PASS 120/min limit, activity timestamp, immediate revocation, unchanged sessions')
  const bootstrap = new DatabaseSync(userPath)
  bootstrap.exec('DELETE FROM users')
  bootstrap.close()
  await expectStatus(`${api}/papers`, {}, 401)
  await expectStatus(admin, { method: 'POST', body: { name: 'denied', scope: 'test' } }, 403)
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
