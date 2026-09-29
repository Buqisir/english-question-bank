/*
 * The stage-5d export route runtime (#489): turns the signed-in user's stored
 * personal layer at an explicit version into a private PDF in the user files
 * root — deliberately NOT a My Space artifact: the annotated edition may
 * contain the teacher's own answers, so it is not a "student-paper" and must
 * not claim a draft-paper source. Files live under the private
 * personal-exports subdirectory, are looked up by (user_id, paper_id,
 * server-generated file_id) and served through the personal-paper-layer
 * download route with the same auth as its siblings.
 *
 * The layer is snapshotted (frozen, digested) before the measure pass starts,
 * so later edits can never leak into an in-flight render. The file cache key
 * digests every input that can change the PDF bytes — user, paper, source
 * revision, layout, snapshot objects, personal font registry and the
 * renderer/plan version constants — and is never keyed by paperId alone;
 * entries are user-scoped rows in the same user database.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { PERSONAL_OVERLAY_STYLE_VERSION } from '../../shared/personal-paper-layer/overlayStyles.mjs'
import {
  createEmptyPersonalLayerState,
  createPersonalLayerSnapshot,
} from '../../shared/personal-paper-layer/index.mjs'
import { PERSONAL_EXPORT_PLAN_VERSION, measurePersonalExportPlan } from './exportPlan.mjs'
import { composePersonalExport } from './exportComposer.mjs'
import { PERSONAL_FONT_REGISTRY_DIGEST } from './personalFonts.mjs'
import { personalLayerOwnerKey } from './runtime.mjs'
import { renderPaginatedPaper } from '../draft-paper/paginationRenderer.mjs'
import { createPersonalPaperLayerStore } from './store.mjs'
import { resolveMySpaceArtifactPath } from '../my-space/mySpace.mjs'

// Bump when the composed output changes without the plan/overlay versions
// moving (save format, file naming, compose internals).
export const PERSONAL_EXPORT_RENDERER_VERSION = 'eqb-personal-export-renderer-v1'

const EXPORTS_PER_MINUTE = 6
const EXPORT_BODY_KEYS = new Set(['sourceRevision', 'layerVersion', 'layoutId'])
const FILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function fail(code, message, status, details) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (details !== undefined) error.details = details
  return error
}

// Errors raised below the runtime (measure/compose) carry codes but no HTTP
// status; map them once here so the route's sendError sees the right one.
const CODE_STATUSES = {
  PERSONAL_EXPORT_HAS_DIAGNOSTICS: 422,
  PERSONAL_EXPORT_FONT_FAILED: 422,
  PERSONAL_EXPORT_LAYOUT_MISMATCH: 409,
  PERSONAL_EXPORT_BASE_CHANGED: 503,
  PERSONAL_EXPORT_PLAN_INVALID: 500,
  PERSONAL_EXPORT_COMPOSE_INVALID: 500,
}

function withExportStatus(error) {
  if (!error?.status && CODE_STATUSES[error?.code]) error.status = CODE_STATUSES[error.code]
  // Font failures raised by the measure pass carry the failed face ids in
  // array details; the route surfaces them as response `diagnostics`.
  if (error?.code === 'PERSONAL_EXPORT_FONT_FAILED' && Array.isArray(error.details)) {
    error.diagnostics = error.details
  }
  return error
}

function safeFileTitle(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/gu, '-').trim() || '英语试卷'
}

export function createPersonalPaperExportRuntime({
  openUserDatabase,
  personalPaperLayer,
  personalPaperLayout,
  filesRoot,
  measure = measurePersonalExportPlan,
  compose = composePersonalExport,
  render = renderPaginatedPaper,
  resolvePaperTitle = () => undefined,
  now = () => new Date(),
} = {}) {
  const exportWindows = new Map()
  const inFlight = new Map()

  function throttle(userId, nowMs) {
    const windowStart = nowMs - 60_000
    const recent = (exportWindows.get(userId) || []).filter((at) => at > windowStart)
    if (recent.length >= EXPORTS_PER_MINUTE) {
      throw fail('PERSONAL_EXPORT_RATE_LIMITED', '导出太频繁，稍后再试', 429)
    }
    recent.push(nowMs)
    exportWindows.set(userId, recent)
  }

  function ensureExportCacheShape(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personal_paper_export_files (
        cache_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        layer_version INTEGER NOT NULL,
        source_revision TEXT NOT NULL,
        layout_id TEXT NOT NULL,
        page_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_personal_paper_export_files_user_paper
        ON personal_paper_export_files(user_id, paper_id);
    `)
  }

  function exportCacheTableExists(db) {
    return Boolean(db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'personal_paper_export_files'
    `).get())
  }

  // Same containment rule the My Space download route applies: the stored
  // relative path must resolve inside the user files root.
  function resolveStoredExportPath(filesRoot_, storedRelativePath) {
    return resolveMySpaceArtifactPath(filesRoot_, path.resolve(filesRoot_, storedRelativePath))
  }

  function exportFileExists(storedRelativePath) {
    try {
      const filePath = resolveStoredExportPath(filesRoot, storedRelativePath)
      return existsSync(filePath) && statSync(filePath).isFile()
    } catch {
      return false
    }
  }

  // The cached row is authoritative for the response; the file must still be
  // on disk, otherwise the row is dropped and the export renders again.
  function cachedExport(db, userId, cacheKey) {
    if (!exportCacheTableExists(db)) return null
    const row = db.prepare(`
      SELECT file_id AS fileId, file_name AS fileName, layer_version AS layerVersion,
             source_revision AS sourceRevision, layout_id AS layoutId, page_count AS pageCount,
             file_path AS filePath
      FROM personal_paper_export_files WHERE cache_key = ? AND user_id = ?
    `).get(cacheKey, userId)
    if (!row) return null
    if (!exportFileExists(row.filePath)) {
      db.prepare('DELETE FROM personal_paper_export_files WHERE cache_key = ? AND user_id = ?').run(cacheKey, userId)
      return null
    }
    return {
      fileId: row.fileId,
      fileName: row.fileName,
      layerVersion: Number(row.layerVersion),
      sourceRevision: row.sourceRevision,
      layoutId: row.layoutId,
      pageCount: Number(row.pageCount),
    }
  }

  // Only ids and error codes ever reach the logs — never note text.
  function logExport(fields) {
    console.info(`personal-export ${JSON.stringify(fields)}`)
  }

  function validateBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw fail('PERSONAL_EXPORT_REQUEST_INVALID', '导出请求不正确', 400)
    }
    for (const key of Object.keys(body)) {
      if (!EXPORT_BODY_KEYS.has(key)) throw fail('PERSONAL_EXPORT_REQUEST_INVALID', '导出请求不正确', 400)
    }
    if (typeof body.sourceRevision !== 'string' || !body.sourceRevision
      || typeof body.layoutId !== 'string' || !body.layoutId
      || !Number.isSafeInteger(body.layerVersion) || body.layerVersion < 0) {
      throw fail('PERSONAL_EXPORT_REQUEST_INVALID', '导出请求不正确', 400)
    }
  }

  function cacheKeyFor({ userId, paperId, layout, snapshot }) {
    return `sha256:${createHash('sha256').update(stableStringify({
      scope: 'eqb-personal-export-file-v1',
      userId,
      paperId,
      sourceRevision: layout.sourceRevision,
      layoutId: layout.layoutId,
      objectsDigest: snapshot.objectsDigest,
      fontRegistryDigest: PERSONAL_FONT_REGISTRY_DIGEST,
      planVersion: PERSONAL_EXPORT_PLAN_VERSION,
      overlayStyleVersion: PERSONAL_OVERLAY_STYLE_VERSION,
      rendererVersion: PERSONAL_EXPORT_RENDERER_VERSION,
    })).digest('hex')}`
  }

  function downloadUrl(fileId, paperId) {
    return `/api/personal-paper-layers/${encodeURIComponent(paperId)}/exports/${encodeURIComponent(fileId)}.pdf`
  }

  // Download seam: file ids are server-generated uuids only — anything else,
  // or a row not owned by this exact (user, paper) pair, is the same 404.
  function resolveDownload(userId, paperId, fileId) {
    if (typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId)) return null
    const db = openUserDatabase({ readOnly: true })
    try {
      if (!exportCacheTableExists(db)) return null
      const row = db.prepare(`
        SELECT file_name AS fileName, file_path AS filePath
        FROM personal_paper_export_files WHERE file_id = ? AND user_id = ? AND paper_id = ?
      `).get(fileId, userId, paperId)
      if (!row) return null
      const filePath = resolveStoredExportPath(filesRoot, row.filePath)
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null
      return { body: readFileSync(filePath), fileName: row.fileName }
    } finally {
      db.close()
    }
  }

  async function renderAndSave({ userId, paperId, source, snapshot, layout, printHtml, cacheKey }) {
    const plan = await measure({
      paginatedHtml: layout.paginatedHtml,
      layoutId: layout.layoutId,
      layoutRef: layout.layoutRef,
      source,
      objects: snapshot.objects,
    })
    if (plan.diagnostics.length > 0) {
      // The route surfaces these as response `diagnostics` (ids and codes
      // only); plain array details are stripped from error bodies.
      const error = fail('PERSONAL_EXPORT_HAS_DIAGNOSTICS', '批注存在未解出的问题，已拒绝导出', 422)
      error.diagnostics = plan.diagnostics
      throw error
    }
    const composed = compose({ printHtml, plan, layoutRef: layout.layoutRef })
    const rendered = await render(composed.printHtml, { compose: composed.compose })

    const fileId = randomUUID()
    // Per-user subdirectory keyed like the layer's owner key: derived from the
    // user id, never a raw user-controlled name as a path segment.
    const relativePath = path.join('personal-exports', personalLayerOwnerKey(userId), `${fileId}.pdf`)
    const filePath = resolveStoredExportPath(filesRoot, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, rendered.pdfBytes)

    const db = openUserDatabase({ readOnly: false })
    try {
      ensureExportCacheShape(db)
      // A concurrent identical export may have finished while this one was
      // rendering; keep exactly one file per cache key and drop this twin.
      const raced = cachedExport(db, userId, cacheKey)
      if (raced) {
        rmSync(filePath, { force: true })
        return { ...raced, cached: true }
      }
      const title = safeFileTitle(resolvePaperTitle(paperId) || paperId)
      const fileName = `${title}-我的批注版.pdf`
      db.prepare(`
        INSERT INTO personal_paper_export_files
          (cache_key, user_id, paper_id, file_id, file_name, file_path, layer_version, source_revision, layout_id, page_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cacheKey,
        userId,
        paperId,
        fileId,
        fileName,
        relativePath,
        snapshot.layerVersion,
        layout.sourceRevision,
        layout.layoutId,
        rendered.pageCount,
        now().toISOString(),
      )
      return {
        fileId,
        fileName,
        pageCount: rendered.pageCount,
        cached: false,
      }
    } catch (error) {
      rmSync(filePath, { force: true })
      throw error
    } finally {
      db.close()
    }
  }

  async function create(userId, paperId, body) {
    try {
      validateBody(body)
      // Same source gate as the layer routes: unknown papers are a 404 that
      // never echoes the loader's error, invalid ids a 400.
      const source = personalPaperLayer.loadSource(paperId)
      const { body: layout } = await personalPaperLayout.getLayout(userId, { paperId })
      if (body.sourceRevision !== layout.sourceRevision || body.layoutId !== layout.layoutId) {
        throw fail('PERSONAL_EXPORT_LAYOUT_MISMATCH', '卷子或纸张版已经变化，请重新核对批注位置', 409, {
          currentSourceRevision: layout.sourceRevision,
          currentLayoutId: layout.layoutId,
        })
      }
      const printHtml = (await personalPaperLayout.baseRenderInput(userId, { paperId, layoutId: layout.layoutId })).printHtml

      const db = openUserDatabase({ readOnly: false })
      let snapshot
      let cacheKey
      try {
        ensureExportCacheShape(db)
        const stored = createPersonalPaperLayerStore(db).readLayer(userId, paperId, layout.sourceRevision)
        const currentVersion = stored?.version ?? 0
        if (currentVersion !== body.layerVersion) {
          throw fail('PERSONAL_EXPORT_VERSION_MISMATCH', '批注已更新，保存后再导出', 409, { currentVersion })
        }
        // Frozen copy taken before any Chromium work: edits made while the
        // render runs change the stored layer, never this snapshot.
        snapshot = createPersonalLayerSnapshot(stored ?? createEmptyPersonalLayerState(source))
        cacheKey = cacheKeyFor({ userId, paperId, layout, snapshot })
        const cached = cachedExport(db, userId, cacheKey)
        if (cached) {
          logExport({ event: 'export', userId, paperId, cached: true, fileId: cached.fileId })
          return { ...cached, downloadUrl: downloadUrl(cached.fileId, paperId), cached: true }
        }
      } finally {
        db.close()
      }

      throttle(userId, now().getTime())
      let pending = inFlight.get(cacheKey)
      if (!pending) {
        pending = renderAndSave({ userId, paperId, source, snapshot, layout, printHtml, cacheKey })
          .finally(() => inFlight.delete(cacheKey))
        inFlight.set(cacheKey, pending)
      }
      const saved = await pending
      logExport({ event: 'export', userId, paperId, cached: saved.cached, fileId: saved.fileId })
      return {
        fileId: saved.fileId,
        downloadUrl: downloadUrl(saved.fileId, paperId),
        fileName: saved.fileName,
        layerVersion: body.layerVersion,
        sourceRevision: layout.sourceRevision,
        layoutId: layout.layoutId,
        pageCount: saved.pageCount,
        cached: saved.cached,
      }
    } catch (error) {
      logExport({ event: 'export-failed', userId, paperId, code: error?.code ?? 'PERSONAL_EXPORT_FAILED' })
      throw withExportStatus(error)
    }
  }

  return { create, resolveDownload }
}
