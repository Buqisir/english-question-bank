// Import file/bundle/batch LISTING + directory-scan implementation.
// Extracted from server/api.mjs (cut H5-B, refactor-roadmap-2026-06). Behavior-preserving:
// the function bodies are identical to their pre-cut form (only re-indented into the factory;
// leading whitespace added inside SQL template literals is semantically inert).
// Pure read/scan concern; deps (db open, validators, fs helpers, title normalizers) are injected
// so this module never imports back from api.mjs.

import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export function createImportListingImplementation(deps) {
  const {
    openDatabase,
    requiredString,
    optionalString,
    requiredEnum,
    randomUUID,
    sanitizeFileName,
    inferImportFileType,
    normalizeExamTitle,
    extractDeclaredExamTitleFromText,
  } = deps

  function rowToImportFile(row) {
    return {
      id: row.id,
      originalName: row.original_name,
      storedPath: row.stored_path,
      fileType: row.file_type,
      contentRole: row.content_role || 'question',
      bundleId: row.bundle_id || '',
      bundleTitle: row.bundle_title || '',
      status: row.status,
      sourceId: row.source_id || '',
      note: row.note || '',
      createdAt: row.created_at,
      parse: row.parse_id
        ? {
            id: row.parse_id,
            status: row.parse_status,
            parser: row.parser || '',
            lineCount: row.line_count || 0,
            charCount: row.char_count || 0,
            preview: row.parse_preview || '',
            errorMessage: row.error_message || '',
            updatedAt: row.parse_updated_at || '',
          }
        : null,
    }
  }

  function rowToImportFileParse(row) {
    if (!row) return null

    return {
      id: row.id,
      importFileId: row.import_file_id,
      parser: row.parser || '',
      extractedText: row.extracted_text || '',
      lineCount: row.line_count || 0,
      charCount: row.char_count || 0,
      status: row.status,
      errorMessage: row.error_message || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  function listImportFiles(limit = 30) {
    const db = openDatabase()
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 30

    try {
      return db
        .prepare(
          `
          SELECT
            f.id,
            f.original_name,
            f.stored_path,
            f.file_type,
            f.content_role,
            f.bundle_id,
            f.bundle_title,
            f.status,
            f.source_id,
            f.note,
            f.created_at,
            t.id AS parse_id,
            t.status AS parse_status,
            t.parser,
            t.line_count,
            t.char_count,
            substr(replace(replace(t.extracted_text, char(10), ' / '), char(13), ' '), 1, 220) AS parse_preview,
            t.error_message,
            t.updated_at AS parse_updated_at
          FROM import_files
          AS f
          LEFT JOIN import_file_texts t ON t.import_file_id = f.id
          ORDER BY f.created_at DESC
          LIMIT ?
          `,
        )
        .all(safeLimit)
        .map(rowToImportFile)
    } finally {
      db.close()
    }
  }

  function deriveImportBundleReadiness(roleCounts) {
    if (roleCounts.questionWithAnalysis > 0) return 'single_file_ready'
    if (roleCounts.question > 0 && roleCounts.answerAnalysis > 0) return 'paired_files_ready'
    if (roleCounts.question > 0) return 'missing_analysis'
    if (roleCounts.answerAnalysis > 0) return 'missing_question'
    return 'reference_only'
  }

  function buildImportBundleQualityWarnings(title, files) {
    const warnings = []
    const normalizedTitle = normalizeExamTitle(title)

    files.forEach((file) => {
      if (!['question', 'question_with_analysis'].includes(file.contentRole)) return

      const declaredTitle = extractDeclaredExamTitleFromText(file.parse?.preview)
      if (!declaredTitle) return

      const normalizedDeclaredTitle = normalizeExamTitle(declaredTitle)
      const isSameTitle =
        normalizedTitle &&
        normalizedDeclaredTitle &&
        (normalizedTitle.includes(normalizedDeclaredTitle) || normalizedDeclaredTitle.includes(normalizedTitle))

      if (!isSameTitle) {
        warnings.push(`来源口径提示：${file.originalName} 内文开头疑似为「${declaredTitle}」，已按文件名为准。`)
      }
    })

    return warnings.slice(0, 4)
  }

  function buildImportBundle(bundleId, files) {
    const roleCounts = {
      question: 0,
      answerAnalysis: 0,
      questionWithAnalysis: 0,
      other: 0,
    }

    for (const file of files) {
      if (file.contentRole === 'answer_analysis') {
        roleCounts.answerAnalysis += 1
      } else if (file.contentRole === 'question_with_analysis') {
        roleCounts.questionWithAnalysis += 1
      } else if (file.contentRole === 'question') {
        roleCounts.question += 1
      } else {
        roleCounts.other += 1
      }
    }

    const parsedFiles = files.filter((file) => file.parse?.status === 'succeeded')
    const failedParseFiles = files.filter((file) => file.parse?.status === 'failed')
    const title =
      files.find((file) => file.bundleTitle)?.bundleTitle ||
      files[0]?.originalName?.replace(/\.[^.]+$/, '') ||
      '未命名资料组'
    const latestCreatedAt = files.reduce(
      (latest, file) => (String(file.createdAt) > String(latest) ? file.createdAt : latest),
      files[0]?.createdAt || '',
    )

    return {
      id: bundleId,
      title,
      fileCount: files.length,
      parsedCount: parsedFiles.length,
      failedParseCount: failedParseFiles.length,
      totalLineCount: parsedFiles.reduce((sum, file) => sum + (file.parse?.lineCount || 0), 0),
      totalCharCount: parsedFiles.reduce((sum, file) => sum + (file.parse?.charCount || 0), 0),
      latestCreatedAt,
      readiness: deriveImportBundleReadiness(roleCounts),
      qualityWarnings: buildImportBundleQualityWarnings(title, files),
      roleCounts,
      files,
    }
  }

  function listImportBundles() {
    const files = listImportFiles(200)
    const grouped = new Map()

    for (const file of files) {
      const bundleId = file.bundleId || `single-${file.id}`
      grouped.set(bundleId, [...(grouped.get(bundleId) || []), file])
    }

    return Array.from(grouped.entries())
      .map(([bundleId, filesForBundle]) => buildImportBundle(bundleId, filesForBundle))
      .sort((a, b) => String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt)))
  }

  function rowToImportBatchItem(row) {
    return {
      id: row.id,
      batchId: row.batch_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileType: row.file_type,
      fileSize: row.file_size || 0,
      contentRole: row.content_role || 'question_with_analysis',
      bundleId: row.bundle_id || '',
      bundleTitle: row.bundle_title || '',
      importFileId: row.import_file_id || '',
      status: row.status,
      errorMessage: row.error_message || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  function rowToImportBatch(row, items = []) {
    return {
      id: row.id,
      title: row.title,
      directoryPath: row.directory_path,
      recursive: Boolean(row.recursive),
      contentRole: row.content_role,
      status: row.status,
      fileCount: row.file_count || 0,
      supportedCount: row.supported_count || 0,
      importedCount: row.imported_count || 0,
      parsedCount: row.parsed_count || 0,
      failedCount: row.failed_count || 0,
      errorMessage: row.error_message || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
    }
  }

  function listImportBatches(limit = 12) {
    const db = openDatabase()
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 12

    try {
      const batches = db
        .prepare(
          `
          SELECT *
          FROM import_batches
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ?
          `,
        )
        .all(safeLimit)

      const selectItems = db.prepare(
        `
        SELECT *
        FROM import_batch_items
        WHERE batch_id = ?
        ORDER BY file_name COLLATE NOCASE, created_at
        LIMIT 250
        `,
      )

      return batches.map((batch) => rowToImportBatch(batch, selectItems.all(batch.id).map(rowToImportBatchItem)))
    } finally {
      db.close()
    }
  }

  function expandLocalPath(value) {
    const rawPath = requiredString(value, 'directoryPath')
    if (rawPath === '~') return process.env.HOME || rawPath
    if (rawPath.startsWith('~/')) return path.join(process.env.HOME || '', rawPath.slice(2))
    return rawPath
  }

  function inferBatchBundleTitle(fileName) {
    return sanitizeFileName(fileName)
      .replace(/\.[^.]+$/, '')
      .replace(/[-_ ]?答案版$/i, '')
      .replace(/[-_ ]?阅读理解解析[（(][^)）]+[)）]$/i, '')
      .replace(/[-_ ]?试题(?:分析|研究)?[-_ ]?解析版$/i, '')
      .replace(/[-_ ]?解析版$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function inferBatchContentRole(fileName, fallbackRole) {
    const name = String(fileName || '')
    if (/阅读理解解析|试题(?:分析|研究)?[-_ ]?解析版|解析版/.test(name)) return 'answer_analysis'
    if (/答案版/.test(name)) return 'question_with_analysis'
    return fallbackRole
  }

  function collectImportBatchFiles(directoryPath, recursive) {
    const files = []
    const maxFiles = 250
    const maxDepth = recursive ? 3 : 1

    function visit(currentPath, depth) {
      if (files.length >= maxFiles || depth > maxDepth) return

      const entries = readdirSync(currentPath, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.'))

      for (const entry of entries) {
        if (files.length >= maxFiles) break

        const entryPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          if (recursive) visit(entryPath, depth + 1)
          continue
        }

        if (!entry.isFile()) continue

        const fileType = inferImportFileType(entry.name)
        if (!['docx', 'pdf'].includes(fileType)) continue

        const stats = statSync(entryPath)
        files.push({
          fileName: sanitizeFileName(entry.name),
          filePath: entryPath,
          fileType,
          fileSize: stats.size,
        })
      }
    }

    visit(directoryPath, 1)

    return files.sort((a, b) => a.filePath.localeCompare(b.filePath, 'zh-CN'))
  }

  function updateImportBatchStats(db, batchId, explicitStatus = '') {
    const stats = db
      .prepare(
        `
        SELECT
          COUNT(*) AS file_count,
          SUM(CASE WHEN status <> 'unsupported' THEN 1 ELSE 0 END) AS supported_count,
          SUM(CASE WHEN status IN ('imported', 'parsed') THEN 1 ELSE 0 END) AS imported_count,
          SUM(CASE WHEN status = 'parsed' THEN 1 ELSE 0 END) AS parsed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
          SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
        FROM import_batch_items
        WHERE batch_id = ?
        `,
      )
      .get(batchId)

    const fileCount = Number(stats?.file_count || 0)
    const supportedCount = Number(stats?.supported_count || 0)
    const importedCount = Number(stats?.imported_count || 0)
    const parsedCount = Number(stats?.parsed_count || 0)
    const failedCount = Number(stats?.failed_count || 0)
    const queuedCount = Number(stats?.queued_count || 0)
    const skippedCount = Number(stats?.skipped_count || 0)
    const doneCount = importedCount + skippedCount
    const status =
      explicitStatus ||
      (failedCount > 0 && importedCount === 0
        ? 'failed'
        : failedCount > 0 || (queuedCount > 0 && doneCount > 0)
          ? 'partial'
          : supportedCount > 0 && doneCount >= supportedCount
            ? 'imported'
            : 'scanned')

    db.prepare(
      `
      UPDATE import_batches
      SET
        status = ?,
        file_count = ?,
        supported_count = ?,
        imported_count = ?,
        parsed_count = ?,
        failed_count = ?,
        updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(status, fileCount, supportedCount, importedCount, parsedCount, failedCount, batchId)
  }

  function getImportBatch(db, batchId) {
    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId)
    if (!batch) return null

    const items = db
      .prepare(
        `
        SELECT *
        FROM import_batch_items
        WHERE batch_id = ?
        ORDER BY file_name COLLATE NOCASE, created_at
        `,
      )
      .all(batchId)
      .map(rowToImportBatchItem)

    return rowToImportBatch(batch, items)
  }

  function scanImportDirectory(input) {
    const directoryPath = expandLocalPath(input.directoryPath)
    const recursive = input.recursive === undefined ? true : Boolean(input.recursive)
    const contentRole = requiredEnum(
      input.contentRole || 'question_with_analysis',
      ['question', 'answer_analysis', 'question_with_analysis', 'other'],
      'contentRole',
    )

    if (!existsSync(directoryPath)) {
      throw new Error(`directory not found: ${directoryPath}`)
    }

    const directoryStats = statSync(directoryPath)
    if (!directoryStats.isDirectory()) {
      throw new Error(`not a directory: ${directoryPath}`)
    }

    const files = collectImportBatchFiles(directoryPath, recursive)
    const batchId = `batch-${randomUUID()}`
    const title =
      optionalString(input.title) ||
      path.basename(directoryPath) ||
      `批量导入 ${new Date().toISOString().slice(0, 10)}`
    const db = openDatabase({ readOnly: false })

    try {
      db.exec('BEGIN')
      db.prepare(
        `
        INSERT INTO import_batches (id, title, directory_path, recursive, content_role, status, file_count, supported_count)
        VALUES (?, ?, ?, ?, ?, 'scanned', ?, ?)
        `,
      ).run(batchId, title, directoryPath, recursive ? 1 : 0, contentRole, files.length, files.length)

      const insertItem = db.prepare(
        `
        INSERT INTO import_batch_items (
          id,
          batch_id,
          file_name,
          file_path,
          file_type,
          file_size,
          content_role,
          bundle_title,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')
        `,
      )

      files.forEach((file) => {
        insertItem.run(
          `batch-item-${randomUUID()}`,
          batchId,
          file.fileName,
          file.filePath,
          file.fileType,
          file.fileSize,
          inferBatchContentRole(file.fileName, contentRole),
          inferBatchBundleTitle(file.fileName),
        )
      })

      updateImportBatchStats(db, batchId, 'scanned')
      db.exec('COMMIT')

      return getImportBatch(db, batchId)
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // Ignore rollback failures so the original error can be reported.
      }
      throw error
    } finally {
      db.close()
    }
  }

  return {
    listImportFiles,
    listImportBundles,
    listImportBatches,
    scanImportDirectory,
    getImportBatch,
    updateImportBatchStats,
    rowToImportFileParse,
  }
}
