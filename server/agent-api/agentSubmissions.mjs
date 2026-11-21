import { randomUUID } from 'node:crypto'

export function ensureAgentSubmissionShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_reports (
      id TEXT PRIMARY KEY, token_id TEXT NOT NULL REFERENCES agent_tokens(id),
      paper_id TEXT NOT NULL, question_id TEXT, group_id TEXT,
      kind TEXT NOT NULL, note TEXT NOT NULL, evidence TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK ((question_id IS NULL) <> (group_id IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_reports_token ON agent_reports(token_id, created_at);
    CREATE TABLE IF NOT EXISTS agent_drafts (
      token_id TEXT NOT NULL REFERENCES agent_tokens(id), paper_id TEXT NOT NULL, question_id TEXT NOT NULL,
      body_json TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (token_id, paper_id, question_id)
    );
  `)
}

const reportColumns = `r.id, r.paper_id AS paperId, r.question_id AS questionId, r.group_id AS groupId,
  r.kind, r.note, r.evidence, r.created_at AS createdAt, 'pending' AS status`

export function listAgentReports(db, tokenId) {
  return db.prepare(`SELECT ${reportColumns} FROM agent_reports r
    WHERE r.token_id = ? ORDER BY r.created_at DESC, r.id`).all(tokenId)
}

export function listAdminAgentReports(db) {
  return db.prepare(`SELECT ${reportColumns}, t.name AS tokenName FROM agent_reports r
    JOIN agent_tokens t ON t.id = r.token_id ORDER BY r.created_at DESC, r.id`).all()
}

export function insertAgentReport(db, tokenId, { paperId, questionId, groupId, kind, note, evidence }) {
  const id = randomUUID()
  db.prepare(`INSERT INTO agent_reports (id, token_id, paper_id, question_id, group_id, kind, note, evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tokenId, paperId, questionId, groupId, kind, note, evidence, new Date().toISOString())
  return db.prepare(`SELECT ${reportColumns} FROM agent_reports r WHERE r.id = ?`).get(id)
}

export function readAgentDraft(db, tokenId, paperId, questionId) {
  const row = db.prepare(`SELECT body_json AS body, updated_at AS updatedAt FROM agent_drafts
    WHERE token_id = ? AND paper_id = ? AND question_id = ?`).get(tokenId, paperId, questionId)
  return row && { paperId, questionId, body: JSON.parse(row.body), updatedAt: row.updatedAt }
}

export function putAgentDraft(db, tokenId, paperId, questionId, body) {
  const updatedAt = new Date().toISOString()
  db.prepare(`INSERT INTO agent_drafts (token_id, paper_id, question_id, body_json, updated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (token_id, paper_id, question_id) DO UPDATE SET
    body_json = excluded.body_json, updated_at = excluded.updated_at`)
    .run(tokenId, paperId, questionId, JSON.stringify(body), updatedAt)
  return { paperId, questionId, body, updatedAt }
}
