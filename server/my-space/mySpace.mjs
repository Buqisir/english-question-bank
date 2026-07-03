import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// M0-4 user data isolation (docs/cuts/m0-4-user-scope/plan.md decisions 4-6):
// new-form shape only. my_space_folders.name is per-user unique (UNIQUE(user_id,
// name)) rather than the old global-unique inline constraint — SQLite cannot
// ALTER an inline UNIQUE, so upgrading a real pre-M0-4 table happens via the
// rebuild-table migration branch in server/api.mjs's ensureUserDatabaseShape,
// not here. This CREATE TABLE IF NOT EXISTS only ever fires for a brand-new
// database (fresh install) — an existing old-form table is left untouched by
// this statement (IF NOT EXISTS) and is migrated by the caller instead.
export function ensureMySpaceDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS my_space_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS my_space_artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      folder_id TEXT REFERENCES my_space_folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      artifact_type TEXT NOT NULL DEFAULT 'student-paper' CHECK (artifact_type IN ('student-paper')),
      source_draft_paper_id TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_my_space_artifacts_folder ON my_space_artifacts(folder_id, generated_at);
    CREATE INDEX IF NOT EXISTS idx_my_space_artifacts_draft ON my_space_artifacts(source_draft_paper_id);
  `)
}

export function ensureMySpaceFilesRoot(filesRoot) {
  mkdirSync(filesRoot, { recursive: true })
}

function nowIso() {
  return new Date().toISOString()
}

// M0-4 user data isolation (docs/cuts/m0-4-user-scope/plan.md decision 3): every
// function below that touches my_space_folders / my_space_artifacts now takes a
// required userId — no default, so a caller that forgets to pass it throws instead
// of silently falling back to LOCAL_USER_ID.
function requireUserId(userId) {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('mySpace: userId is required')
  }
  return userId
}

function cleanName(value, fallback) {
  return String(value || '').trim().replace(/\s+/g, ' ') || fallback
}

function safePdfFileName(value) {
  const name = cleanName(value, '英语草稿卷-学生卷.pdf')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.pdf$/i, '')
  return `${name || '英语草稿卷-学生卷'}.pdf`
}

export function countPdfPages(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer || '')
  return (text.match(/\/Type\s*\/Page\b/g) || []).length
}

function rowToFolder(row, artifactCount = 0) {
  return {
    id: row.id,
    name: row.name,
    artifactCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToArtifact(row) {
  return {
    id: row.id,
    folderId: row.folder_id || null,
    title: row.title,
    fileName: row.file_name,
    fileUrl: `/user-space/files/${encodeURIComponent(row.id)}.pdf`,
    artifactType: row.artifact_type,
    sourceDraftPaperId: row.source_draft_paper_id,
    sourceDraftTitle: row.source_draft_title || '',
    sourceDraftExists: Number(row.source_draft_exists || 0) === 1,
    pageCount: Number(row.page_count || 0),
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listMySpace(db, userId, { folderId = null } = {}) {
  requireUserId(userId)
  const folders = db
    .prepare(
      `
      SELECT f.*, COUNT(a.id) AS artifact_count
      FROM my_space_folders f
      LEFT JOIN my_space_artifacts a ON a.folder_id = f.id AND a.user_id = f.user_id
      WHERE f.user_id = ?
      GROUP BY f.id
      ORDER BY f.updated_at DESC, f.created_at DESC
      `,
    )
    .all(userId)
    .map((row) => rowToFolder(row, Number(row.artifact_count || 0)))

  const params = [userId]
  let where = 'WHERE a.user_id = ?'
  if (folderId) {
    where += ' AND a.folder_id = ?'
    params.push(folderId)
  }

  // PA SW-3 (plan.md decision 3): both sides of the LEFT JOIN are scoped
  // (a.user_id = ? via the WHERE above, dp.user_id = a.user_id here) as an
  // explicit belt-and-suspenders — normal-path artifacts only ever point at a
  // same-user draft, but without this, a cross-user artifact whose
  // source_draft_paper_id happens to collide with another user's draft id could
  // make source_draft_exists misreport true.
  const artifacts = db
    .prepare(
      `
      SELECT
        a.*,
        dp.title AS source_draft_title,
        CASE WHEN dp.id IS NULL THEN 0 ELSE 1 END AS source_draft_exists
      FROM my_space_artifacts a
      LEFT JOIN draft_papers dp ON dp.id = a.source_draft_paper_id AND dp.status = 'active' AND dp.user_id = a.user_id
      ${where}
      ORDER BY a.generated_at DESC, a.created_at DESC
      `,
    )
    .all(...params)
    .map(rowToArtifact)

  return { folders, artifacts }
}

export function createMySpaceFolder(db, userId, input) {
  requireUserId(userId)
  const name = cleanName(input?.name, '')
  if (!name) throw new Error('文件夹名称不能为空')
  const id = `my-folder-${randomUUID()}`
  try {
    db.prepare('INSERT INTO my_space_folders (id, user_id, name) VALUES (?, ?, ?)').run(id, userId, name)
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) throw new Error('文件夹名称已存在')
    throw error
  }
  return rowToFolder(db.prepare('SELECT * FROM my_space_folders WHERE id = ? AND user_id = ?').get(id, userId), 0)
}

export function renameMySpaceFolder(db, userId, folderId, input) {
  requireUserId(userId)
  const name = cleanName(input?.name, '')
  if (!name) throw new Error('文件夹名称不能为空')
  const current = db.prepare('SELECT * FROM my_space_folders WHERE id = ? AND user_id = ?').get(folderId, userId)
  if (!current) throw new Error('文件夹不存在')
  const count = db.prepare('SELECT COUNT(*) AS count FROM my_space_artifacts WHERE folder_id = ? AND user_id = ?').get(folderId, userId)?.count || 0
  if (current.name === name) return rowToFolder(current, Number(count))

  let result
  try {
    result = db.prepare('UPDATE my_space_folders SET name = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(name, folderId, userId)
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) throw new Error('文件夹名称已存在')
    throw error
  }
  if (result.changes === 0) throw new Error('文件夹不存在')
  return rowToFolder(db.prepare('SELECT * FROM my_space_folders WHERE id = ? AND user_id = ?').get(folderId, userId), Number(count))
}

export function deleteMySpaceFolder(db, userId, folderId) {
  requireUserId(userId)
  const count = db.prepare('SELECT COUNT(*) AS count FROM my_space_artifacts WHERE folder_id = ? AND user_id = ?').get(folderId, userId)?.count || 0
  if (Number(count) > 0) throw new Error('文件夹中还有文件，不能删除')
  const result = db.prepare('DELETE FROM my_space_folders WHERE id = ? AND user_id = ?').run(folderId, userId)
  if (result.changes === 0) throw new Error('文件夹不存在')
  return { ok: true }
}

// PA MF-3 (plan.md decision 3, "协作路径点名"): folderId existence check is scoped
// AND user_id = ? (a bare `WHERE id = ?` would let B file an artifact into A's
// folder just by knowing A's folderId). The artifact row's user_id is ALWAYS the
// userId argument the caller passed in — never derived/reversed from draftPaper or
// folderId — so this function cannot be tricked into writing a row for the wrong
// user even if draftPaper or folderId belong to someone else (the caller,
// server/my-space/mySpaceRoutes.mjs's POST /api/my-space/artifacts handler, is
// responsible for having already 404'd on a cross-user draftPaperId via
// exportDraftPaperPdf before this function is ever called).
export function saveMySpaceArtifact(db, userId, {
  filesRoot,
  draftPaper,
  pdfBody,
  folderId = null,
  fileName,
  sourcePdfPath = '',
}) {
  requireUserId(userId)
  if (!draftPaper?.id) throw new Error('草稿卷不存在')
  ensureMySpaceFilesRoot(filesRoot)

  const selectedFolderId = String(folderId || '').trim() || null
  if (selectedFolderId) {
    const folder = db.prepare('SELECT id FROM my_space_folders WHERE id = ? AND user_id = ?').get(selectedFolderId, userId)
    if (!folder) throw new Error('文件夹不存在')
  }

  const id = `artifact-${randomUUID()}`
  const finalFileName = safePdfFileName(fileName || `${draftPaper.title || '英语草稿卷'}-学生卷.pdf`)
  const filePath = path.resolve(filesRoot, `${id}.pdf`)
  const body = Buffer.isBuffer(pdfBody) ? pdfBody : readFileSync(sourcePdfPath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, body)
  const pageCount = countPdfPages(body)
  const generatedAt = nowIso()
  try {
    db.prepare(
      `
      INSERT INTO my_space_artifacts (
        id, user_id, folder_id, title, file_name, file_path, artifact_type,
        source_draft_paper_id, page_count, generated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'student-paper', ?, ?, ?)
      `,
    ).run(id, userId, selectedFolderId, finalFileName.replace(/\.pdf$/i, ''), finalFileName, filePath, draftPaper.id, pageCount, generatedAt)
  } catch (error) {
    rmSync(filePath, { force: true })
    throw error
  }

  return rowToArtifact(
    db
      .prepare(
        `
        SELECT
          a.*,
          dp.title AS source_draft_title,
          CASE WHEN dp.id IS NULL THEN 0 ELSE 1 END AS source_draft_exists
        FROM my_space_artifacts a
        LEFT JOIN draft_papers dp ON dp.id = a.source_draft_paper_id AND dp.status = 'active' AND dp.user_id = a.user_id
        WHERE a.id = ? AND a.user_id = ?
        `,
      )
      .get(id, userId),
  )
}

export function deleteMySpaceArtifact(db, userId, filesRoot, artifactId) {
  requireUserId(userId)
  const row = db.prepare('SELECT * FROM my_space_artifacts WHERE id = ? AND user_id = ?').get(artifactId, userId)
  if (!row) throw new Error('文件不存在')
  const file = resolveMySpaceArtifactPath(filesRoot, row.file_path)
  db.prepare('DELETE FROM my_space_artifacts WHERE id = ? AND user_id = ?').run(artifactId, userId)
  rmSync(file, { force: true })
  return { ok: true }
}

export function resolveMySpaceArtifactForDownload(db, userId, filesRoot, artifactId) {
  requireUserId(userId)
  const row = db.prepare('SELECT * FROM my_space_artifacts WHERE id = ? AND user_id = ?').get(artifactId, userId)
  if (!row) return null
  const filePath = resolveMySpaceArtifactPath(filesRoot, row.file_path)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null
  return {
    body: readFileSync(filePath),
    fileName: row.file_name,
    outputPath: filePath,
  }
}

export function resolveMySpaceArtifactPath(filesRoot, storedPath) {
  const root = path.resolve(filesRoot)
  const filePath = path.resolve(storedPath)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid user-space path')
  }
  return filePath
}
