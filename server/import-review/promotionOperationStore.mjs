import { DatabaseSync } from 'node:sqlite'
import { realpathSync } from 'node:fs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { closedPromotionSlot, releasePromotionSlot } from './reviewCompatibilityScheduling.mjs'

export const PROMOTION_PROTOCOL = 1
export function promotionOperationError(reasonCode, operationId = null) {
  return Object.assign(new Error(reasonCode === 'BUSY'
    ? '发布计算槽位正忙，请核实当前操作后重试。'
    : '发布结果待核实，请保留 operationId，不要重复发布。'), {
    code: `IMPORT_REVIEW_PROMOTION_${reasonCode}`, reasonCode, operationId,
    status: 409, retryable: reasonCode === 'BUSY',
  })
}
export function ensurePromotionOperationShape(db) {
  // An already initialized store must remain read-only during another writer.
  // All three objects are committed together by the migration below.
  if (db.prepare(`SELECT COUNT(*) n FROM sqlite_schema WHERE
    (type = 'table' AND name = 'import_review_promotion_operations') OR
    (type = 'index' AND name IN ('idx_review_promotion_unresolved', 'idx_review_promotion_request'))`)
    .get().n === 3) return
  // Additive, atomic and idempotent; never infer completion for legacy rows.
  try { db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS import_review_promotion_operations (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id),
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      mode TEXT NOT NULL CHECK(mode IN ('ship','retry_ship','owner_publish','scoped')),
      actor TEXT NOT NULL CHECK(length(actor) BETWEEN 1 AND 200),
      request_id TEXT REFERENCES import_review_publication_requests(id),
      expected_json TEXT NOT NULL CHECK(length(CAST(expected_json AS BLOB)) <= 20000),
      request_digest TEXT NOT NULL,
      promotion_id TEXT REFERENCES import_review_promotions(id),
      state TEXT NOT NULL CHECK(state IN ('reserved','running','unknown','completed','rejected')),
      launch_nonce_hash TEXT NOT NULL,
      host_slot_token TEXT NOT NULL,
      owner_boot_id TEXT NOT NULL, owner_pid INTEGER NOT NULL, owner_start_id TEXT NOT NULL,
      supervisor_pid INTEGER, supervisor_start_id TEXT,
      worker_pid INTEGER, worker_start_id TEXT, process_group_id INTEGER,
      release_identity TEXT NOT NULL,
      created_at TEXT NOT NULL, started_at TEXT, deadline_at TEXT NOT NULL, finished_at TEXT,
      outcome_json TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_promotion_unresolved
      ON import_review_promotion_operations((1))
      WHERE state IN ('reserved','running','unknown');
    CREATE INDEX IF NOT EXISTS idx_review_promotion_request
      ON import_review_promotion_operations(request_digest, created_at DESC);
    COMMIT;`) } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}
export function promotionRequestDigest(mode, actor, expected) {
  return digestJson({ mode, actor, expected })
}
export function readPromotionOperation(db, id) {
  const row = db.prepare('SELECT * FROM import_review_promotion_operations WHERE id = ?').get(id)
  return row ? { ...row, expected: JSON.parse(row.expected_json),
    outcome: row.outcome_json ? JSON.parse(row.outcome_json) : null } : null
}
function executableOperation(row) {
  return row && (row.state === 'reserved' || (row.state === 'unknown'
    && ['API_IPC_LOST', 'HTTP_WAIT_TIMEOUT'].includes(row.outcome?.reasonCode)))
    && row.request_digest === promotionRequestDigest(row.mode, row.actor, row.expected)
}
export function operationForExecution(db, context, paperId, actor) {
  if (!context) return null
  const row = readPromotionOperation(db, context.id)
  if (!executableOperation(row) || !row.started_at || row.promotion_id
    || row.worker_pid !== process.pid || row.launch_nonce_hash !== sha256(context.nonce)
    || row.paper_id !== paperId || row.actor !== actor) throw promotionOperationError('UNKNOWN', context.id)
  return row
}
// Called only inside the SAME transaction as begin/consume. The operation is
// audit identity; content capabilities still come from the existing store.
export function linkPromotionOperation(db, context, promotion) {
  if (!context) return
  const row = readPromotionOperation(db, context.id)
  if (!executableOperation(row) || !row.started_at || row.promotion_id
    || row.worker_pid !== process.pid || row.launch_nonce_hash !== sha256(context.nonce)
    || row.paper_id !== promotion.paperId || row.revision_id !== promotion.revisionId) {
    throw promotionOperationError('UNKNOWN', context.id)
  }
  const changed = db.prepare(`UPDATE import_review_promotion_operations
    SET promotion_id = ?, state = CASE WHEN state='unknown' THEN 'unknown' ELSE 'running' END
    WHERE id = ? AND state IN ('reserved','unknown') AND promotion_id IS NULL`)
    .run(promotion.promotionId, context.id)
  if (changed.changes !== 1) throw promotionOperationError('UNKNOWN', context.id)
}

export function createPromotionOperationStore({ dbPath, busyTimeoutMs = 0 }) {
  function withDb(write, callback) {
    const db = new DatabaseSync(dbPath, { readOnly: !write })
    try {
      db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=${busyTimeoutMs}`)
      return callback(db)
    } catch (error) {
      if (error.errcode === 5 || error.code === 'SQLITE_BUSY'
        || /database is locked|database is busy/.test(error.message)) throw promotionOperationError('BUSY')
      throw error
    } finally { db.close() }
  }
  return {
    legacyPublishing() {
      return withDb(false, db => !!db.prepare("SELECT 1 FROM import_review_promotions WHERE state='publishing' LIMIT 1").get())
    },
    get(id) { return withDb(false, db => readPromotionOperation(db, id)) },
    rejectUnbegun(snapshot) {
      if (snapshot.promotion_id || !['reserved', 'unknown'].includes(snapshot.state)) return false
      return withDb(true, db => db.prepare(`UPDATE import_review_promotion_operations
        SET state='rejected',finished_at=?,outcome_json=?
        WHERE id=? AND state=? AND promotion_id IS NULL AND started_at IS ?
          AND supervisor_pid IS ? AND worker_pid IS ? AND host_slot_token=?
          AND launch_nonce_hash=? AND request_digest=?`)
        .run(new Date().toISOString(), JSON.stringify({
          reasonCode: 'NOT_BEGUN', error: '发布未开始，可重新发起。', status: 409,
        }), snapshot.id, snapshot.state, snapshot.started_at, snapshot.supervisor_pid,
        snapshot.worker_pid, snapshot.host_slot_token, snapshot.launch_nonce_hash,
        snapshot.request_digest).changes === 1)
    },
    unresolved() { return withDb(false, db => db.prepare(`SELECT id FROM import_review_promotion_operations
      WHERE state IN ('reserved','running','unknown')`).all().map(row => readPromotionOperation(db, row.id))) },
    find(mode, actor, expected) {
      return withDb(false, db => {
        const row = db.prepare(`SELECT id FROM import_review_promotion_operations
          WHERE request_digest = ? ORDER BY created_at DESC LIMIT 1`)
          .get(promotionRequestDigest(mode, actor, expected))
        return row ? readPromotionOperation(db, row.id) : null
      })
    },
    reserve(input) {
      return withDb(true, db => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const unresolved = db.prepare(`SELECT id FROM import_review_promotion_operations
            WHERE state IN ('reserved','running','unknown')`).get()
          if (unresolved) {
            const previous = readPromotionOperation(db, unresolved.id)
            if (input.mode !== 'retry_ship' || previous.id !== input.replacesOperationId
              || previous.state !== 'unknown' || previous.promotion_id !== input.legacyPromotionId
              || previous.paper_id !== input.paperId || previous.revision_id !== input.revisionId
              || previous.host_slot_token !== input.slotToken) throw promotionOperationError('BUSY', unresolved.id)
            db.prepare(`UPDATE import_review_promotion_operations SET state='rejected',finished_at=?,outcome_json=?
              WHERE id=? AND state='unknown'`).run(new Date().toISOString(),
              JSON.stringify({ reasonCode: 'EXPLICIT_RECOVERY_HANDOFF', promotionId: previous.promotion_id,
                nextOperationId: input.id, previousOutcome: previous.outcome }), previous.id)
          }
          // Old publishing rows must be explicitly reconciled, never hidden by
          // the new empty operation table. Exact retry retains their target.
          const legacy = db.prepare("SELECT id FROM import_review_promotions WHERE state = 'publishing'").all()
          if (legacy.length && !(input.mode === 'retry_ship' && legacy.length === 1
            && legacy[0].id === input.legacyPromotionId)) throw promotionOperationError('BUSY')
          db.prepare(`INSERT INTO import_review_promotion_operations
            (id,paper_id,revision_id,mode,actor,request_id,expected_json,request_digest,
             state,launch_nonce_hash,host_slot_token,owner_boot_id,owner_pid,owner_start_id,
             release_identity,created_at,deadline_at)
            VALUES (?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?,?,?,?)`)
            .run(input.id, input.paperId, input.revisionId, input.mode, input.actor,
              input.requestId || null, JSON.stringify(input.expected),
              promotionRequestDigest(input.mode, input.actor, input.expected), sha256(input.nonce),
              input.slotToken, input.owner.bootId, input.owner.pid, input.owner.startId,
              input.releaseIdentity, new Date().toISOString(), input.deadlineAt)
          db.exec('COMMIT')
          return readPromotionOperation(db, input.id)
        } catch (error) { db.exec('ROLLBACK'); throw error }
      })
    },
    registerSupervisor(id, nonce, identity) {
      return withDb(true, db => {
        const result = db.prepare(`UPDATE import_review_promotion_operations
          SET supervisor_pid=?, supervisor_start_id=?
          WHERE id=? AND state='reserved' AND launch_nonce_hash=? AND supervisor_pid IS NULL`)
          .run(identity.pid, identity.startId, id, sha256(nonce))
        if (result.changes !== 1) throw promotionOperationError('UNKNOWN', id)
      })
    },
    registerWorker(id, nonce, identity) {
      return withDb(true, db => {
        const result = db.prepare(`UPDATE import_review_promotion_operations
          SET worker_pid=?, worker_start_id=?, process_group_id=?
          WHERE id=? AND state='reserved' AND launch_nonce_hash=? AND worker_pid IS NULL`)
          .run(identity.pid, identity.startId, identity.pid, id, sha256(nonce))
        if (result.changes !== 1) throw promotionOperationError('UNKNOWN', id)
      })
    },
    claim(id, nonce, releaseIdentity) {
      return withDb(true, db => {
        if (!executableOperation(readPromotionOperation(db, id))) throw promotionOperationError('UNKNOWN', id)
        const result = db.prepare(`UPDATE import_review_promotion_operations SET started_at=?
          WHERE id=? AND state IN ('reserved','unknown') AND launch_nonce_hash=? AND release_identity=?
          AND started_at IS NULL AND worker_pid=? AND deadline_at > ?`)
          .run(new Date().toISOString(), id, sha256(nonce), releaseIdentity, process.pid, new Date().toISOString())
        if (result.changes !== 1) throw promotionOperationError('UNKNOWN', id)
        return readPromotionOperation(db, id)
      })
    },
    unknown(id, reasonCode, executionError = null) {
      return withDb(true, db => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const current = readPromotionOperation(db, id)
          // Serialize with acknowledge: no stale API/SUP callback can reopen
          // a terminal row whose exact reservation was durably closed.
          if (current?.state !== 'completed'
            || !closedPromotionSlot(current.host_slot_token, id, realpathSync(dbPath))) {
            db.prepare(`UPDATE import_review_promotion_operations SET state='unknown',outcome_json=?,finished_at=NULL
              WHERE id=? AND state NOT IN ('rejected','unknown')`).run(JSON.stringify({ reasonCode }), id)
            if (executionError) db.prepare(`UPDATE import_review_promotion_operations
              SET outcome_json=json_set(outcome_json,'$.executionError',?) WHERE id=? AND state='unknown'`)
              .run(String(executionError).slice(0, 1000), id)
          }
          db.exec('COMMIT')
        } catch (error) {
          if (db.isTransaction) db.exec('ROLLBACK')
          throw error
        }
      })
    },
    finish(id, state, outcome, { reconciled = false } = {}) {
      if (!['completed', 'rejected'].includes(state) || Buffer.byteLength(JSON.stringify(outcome)) > 16_384) {
        throw new Error('Invalid promotion outcome')
      }
      return withDb(true, db => {
        const result = db.prepare(`UPDATE import_review_promotion_operations SET state=?,outcome_json=?,finished_at=?
          WHERE id=? AND state IN (${reconciled ? "'unknown','reserved','running'" : "'reserved','running'"})`)
          .run(state, JSON.stringify(outcome), new Date().toISOString(), id)
        if (result.changes !== 1) throw promotionOperationError('UNKNOWN', id)
      })
    },
    acknowledge(id, outcome) {
      return withDb(true, db => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const current = readPromotionOperation(db, id)
          if (['completed', 'rejected'].includes(current?.state)
            && JSON.stringify(current.outcome) === JSON.stringify(outcome)) {
            // Hold the same writer lock as unknown across rename + fsync.
            // The slot cannot close between another process's check/update.
            releasePromotionSlot(current.host_slot_token)
          }
          db.exec('COMMIT')
        } catch (error) {
          if (db.isTransaction) db.exec('ROLLBACK')
          throw error
        }
      })
    },
  }
}
