import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const MY_SPACE_ARTIFACT_TYPES = new Set(['student-paper'])

export function ensureMySpaceDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS my_space_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS my_space_artifacts (
      id TEXT PRIMARY KEY,
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

export function listMySpace(db, { folderId = null } = {}) {
  const folders = db
    .prepare(
      `
      SELECT f.*, COUNT(a.id) AS artifact_count
      FROM my_space_folders f
      LEFT JOIN my_space_artifacts a ON a.folder_id = f.id
      GROUP BY f.id
      ORDER BY f.updated_at DESC, f.created_at DESC
      `,
    )
    .all()
    .map((row) => rowToFolder(row, Number(row.artifact_count || 0)))

  const params = []
  let where = ''
  if (folderId) {
    where = 'WHERE a.folder_id = ?'
    params.push(folderId)
  }

  const artifacts = db
    .prepare(
      `
      SELECT
        a.*,
        dp.title AS source_draft_title,
        CASE WHEN dp.id IS NULL THEN 0 ELSE 1 END AS source_draft_exists
      FROM my_space_artifacts a
      LEFT JOIN draft_papers dp ON dp.id = a.source_draft_paper_id AND dp.status = 'active'
      ${where}
      ORDER BY a.generated_at DESC, a.created_at DESC
      `,
    )
    .all(...params)
    .map(rowToArtifact)

  return { folders, artifacts }
}

export function createMySpaceFolder(db, input) {
  const name = cleanName(input?.name, '')
  if (!name) throw new Error('文件夹名称不能为空')
  const id = `my-folder-${randomUUID()}`
  try {
    db.prepare('INSERT INTO my_space_folders (id, name) VALUES (?, ?)').run(id, name)
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) throw new Error('文件夹名称已存在')
    throw error
  }
  return rowToFolder(db.prepare('SELECT * FROM my_space_folders WHERE id = ?').get(id), 0)
}

export function renameMySpaceFolder(db, folderId, input) {
  const name = cleanName(input?.name, '')
  if (!name) throw new Error('文件夹名称不能为空')
  let result
  try {
    result = db.prepare('UPDATE my_space_folders SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, folderId)
  } catch (error) {
    if (String(error?.message || error).includes('UNIQUE')) throw new Error('文件夹名称已存在')
    throw error
  }
  if (result.changes === 0) throw new Error('文件夹不存在')
  const count = db.prepare('SELECT COUNT(*) AS count FROM my_space_artifacts WHERE folder_id = ?').get(folderId)?.count || 0
  return rowToFolder(db.prepare('SELECT * FROM my_space_folders WHERE id = ?').get(folderId), Number(count))
}

export function deleteMySpaceFolder(db, folderId) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM my_space_artifacts WHERE folder_id = ?').get(folderId)?.count || 0
  if (Number(count) > 0) throw new Error('文件夹中还有文件，不能删除')
  const result = db.prepare('DELETE FROM my_space_folders WHERE id = ?').run(folderId)
  if (result.changes === 0) throw new Error('文件夹不存在')
  return { ok: true }
}

export function saveMySpaceArtifact(db, {
  filesRoot,
  draftPaper,
  pdfBody,
  folderId = null,
  fileName,
  sourcePdfPath = '',
}) {
  if (!draftPaper?.id) throw new Error('草稿卷不存在')
  ensureMySpaceFilesRoot(filesRoot)

  const selectedFolderId = String(folderId || '').trim() || null
  if (selectedFolderId) {
    const folder = db.prepare('SELECT id FROM my_space_folders WHERE id = ?').get(selectedFolderId)
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
        id, folder_id, title, file_name, file_path, artifact_type,
        source_draft_paper_id, page_count, generated_at
      )
      VALUES (?, ?, ?, ?, ?, 'student-paper', ?, ?, ?)
      `,
    ).run(id, selectedFolderId, finalFileName.replace(/\.pdf$/i, ''), finalFileName, filePath, draftPaper.id, pageCount, generatedAt)
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
        LEFT JOIN draft_papers dp ON dp.id = a.source_draft_paper_id AND dp.status = 'active'
        WHERE a.id = ?
        `,
      )
      .get(id),
  )
}

export function deleteMySpaceArtifact(db, filesRoot, artifactId) {
  const row = db.prepare('SELECT * FROM my_space_artifacts WHERE id = ?').get(artifactId)
  if (!row) throw new Error('文件不存在')
  const file = resolveMySpaceArtifactPath(filesRoot, row.file_path)
  db.prepare('DELETE FROM my_space_artifacts WHERE id = ?').run(artifactId)
  rmSync(file, { force: true })
  return { ok: true }
}

export function resolveMySpaceArtifactForDownload(db, filesRoot, artifactId) {
  const row = db.prepare('SELECT * FROM my_space_artifacts WHERE id = ?').get(artifactId)
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
