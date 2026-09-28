import { randomUUID } from 'node:crypto'
import {
  PERSONAL_LAYER_SCHEMA_VERSION,
  applyPersonalLayerOperations,
  createEmptyPersonalLayerState,
} from '../../shared/personal-paper-layer/index.mjs'

// Receipts older than this are pruned. A late resend then fails the version
// check (its original write already bumped the version), so it can never
// apply twice; the client re-reads the layer instead.
export const PERSONAL_LAYER_MUTATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function fail(code, message, status, details) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (details !== undefined) error.details = details
  return error
}

export function ensurePersonalPaperLayerShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_paper_layers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      source_projection_version TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, paper_id, source_revision)
    );
    CREATE TABLE IF NOT EXISTS personal_paper_objects (
      layer_id TEXT NOT NULL REFERENCES personal_paper_layers(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL,
      type TEXT NOT NULL,
      body_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (layer_id, object_id)
    );
    CREATE TABLE IF NOT EXISTS personal_paper_tombstones (
      layer_id TEXT NOT NULL REFERENCES personal_paper_layers(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (layer_id, object_id)
    );
    CREATE TABLE IF NOT EXISTS personal_paper_mutations (
      user_id TEXT NOT NULL,
      client_mutation_id TEXT NOT NULL,
      layer_id TEXT NOT NULL,
      body_digest TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, client_mutation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_personal_paper_layers_user_paper
      ON personal_paper_layers(user_id, paper_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_personal_paper_mutations_created
      ON personal_paper_mutations(created_at);
  `)
}

function tableExists(db) {
  return Boolean(db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'personal_paper_layers'
  `).get())
}

function runImmediate(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createPersonalPaperLayerStore(db) {
  function layerRow(userId, paperId, sourceRevision) {
    return db.prepare(`
      SELECT * FROM personal_paper_layers
      WHERE user_id = ? AND paper_id = ? AND source_revision = ?
    `).get(userId, paperId, sourceRevision)
  }

  function stateFromRow(row) {
    const objects = db.prepare(`
      SELECT body_json FROM personal_paper_objects WHERE layer_id = ? ORDER BY position, object_id
    `).all(row.id).map((object) => JSON.parse(object.body_json))
    const deletedObjectIds = db.prepare(`
      SELECT object_id FROM personal_paper_tombstones WHERE layer_id = ? ORDER BY object_id
    `).all(row.id).map((tombstone) => tombstone.object_id)
    return {
      schemaVersion: row.schema_version,
      paperId: row.paper_id,
      sourceRevision: row.source_revision,
      sourceProjectionVersion: row.source_projection_version,
      version: row.version,
      objects,
      deletedObjectIds,
    }
  }

  function readLayer(userId, paperId, sourceRevision) {
    if (!tableExists(db)) return null
    const row = layerRow(userId, paperId, sourceRevision)
    return row ? stateFromRow(row) : null
  }

  function listRevisions(userId, paperId) {
    if (!tableExists(db)) return []
    return db.prepare(`
      SELECT l.source_revision AS sourceRevision, l.version AS version, l.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM personal_paper_objects o WHERE o.layer_id = l.id) AS objectCount
      FROM personal_paper_layers l
      WHERE l.user_id = ? AND l.paper_id = ?
      ORDER BY l.updated_at DESC
    `).all(userId, paperId).map((row) => ({ ...row }))
  }

  /*
   * One transaction covers idempotency lookup, version comparison, validation,
   * object writes, version bump and the mutation receipt, so a failure never
   * leaves half a batch behind.
   */
  function commit(userId, {
    source,
    expectedVersion,
    clientMutationId,
    operations,
    bodyDigest,
    now,
  }) {
    ensurePersonalPaperLayerShape(db)
    return runImmediate(db, () => {
      const prior = db.prepare(`
        SELECT * FROM personal_paper_mutations WHERE user_id = ? AND client_mutation_id = ?
      `).get(userId, clientMutationId)
      if (prior) {
        if (prior.body_digest !== bodyDigest) {
          throw fail('PERSONAL_LAYER_MUTATION_CONFLICT', '同一个保存编号对应了不同的修改', 409)
        }
        return { ...JSON.parse(prior.result_json), replayed: true }
      }
      const row = layerRow(userId, source.paperId, source.sourceRevision)
      const current = row ? stateFromRow(row) : createEmptyPersonalLayerState(source)
      if (current.version !== expectedVersion) {
        throw fail('PERSONAL_LAYER_VERSION_CONFLICT', '批注已在别处更新', 409, {
          currentVersion: current.version,
        })
      }
      const { state, affectedObjectIds } = applyPersonalLayerOperations(current, operations, {
        source,
        now,
      })
      const layerId = row?.id ?? randomUUID()
      if (row) {
        db.prepare(`
          UPDATE personal_paper_layers SET version = ?, updated_at = ? WHERE id = ?
        `).run(state.version, now, layerId)
      } else {
        db.prepare(`
          INSERT INTO personal_paper_layers
            (id, user_id, paper_id, source_revision, source_projection_version, schema_version, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          layerId,
          userId,
          state.paperId,
          state.sourceRevision,
          state.sourceProjectionVersion,
          PERSONAL_LAYER_SCHEMA_VERSION,
          state.version,
          now,
          now,
        )
      }
      const liveIds = new Set(state.objects.map((object) => object.id))
      const affected = new Set(affectedObjectIds)
      const upsert = db.prepare(`
        INSERT INTO personal_paper_objects
          (layer_id, object_id, type, body_json, revision, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (layer_id, object_id) DO UPDATE SET
          body_json = excluded.body_json,
          revision = excluded.revision,
          position = excluded.position,
          updated_at = excluded.updated_at
      `)
      const reposition = db.prepare(`
        UPDATE personal_paper_objects SET position = ? WHERE layer_id = ? AND object_id = ? AND position != ?
      `)
      state.objects.forEach((object, position) => {
        // Deletions shift later objects; keep stored positions dense so new
        // objects never tie with old ones and reorder the layer on reload.
        if (!affected.has(object.id)) {
          reposition.run(position, layerId, object.id, position)
          return
        }
        upsert.run(
          layerId,
          object.id,
          object.type,
          JSON.stringify(object),
          object.revision,
          position,
          object.createdAt,
          object.updatedAt,
        )
      })
      const removeObject = db.prepare('DELETE FROM personal_paper_objects WHERE layer_id = ? AND object_id = ?')
      const tombstone = db.prepare(`
        INSERT OR IGNORE INTO personal_paper_tombstones (layer_id, object_id, deleted_at) VALUES (?, ?, ?)
      `)
      const deletedObjectIds = []
      for (const objectId of affected) {
        if (liveIds.has(objectId)) continue
        removeObject.run(layerId, objectId)
        tombstone.run(layerId, objectId, now)
        deletedObjectIds.push(objectId)
      }
      const result = {
        layerVersion: state.version,
        acceptedMutationId: clientMutationId,
        objects: state.objects.filter((object) => affected.has(object.id)),
        deletedObjectIds,
      }
      db.prepare(`
        INSERT INTO personal_paper_mutations
          (user_id, client_mutation_id, layer_id, body_digest, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, clientMutationId, layerId, bodyDigest, JSON.stringify(result), now)
      return { ...result, replayed: false }
    })
  }

  function pruneMutations(nowMs) {
    if (!tableExists(db)) return 0
    const cutoff = new Date(nowMs - PERSONAL_LAYER_MUTATION_RETENTION_MS).toISOString()
    return Number(db.prepare('DELETE FROM personal_paper_mutations WHERE created_at < ?').run(cutoff).changes)
  }

  return { readLayer, listRevisions, commit, pruneMutations }
}
