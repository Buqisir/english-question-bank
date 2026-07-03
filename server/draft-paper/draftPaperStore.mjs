import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { buildPrintHtml } from '../print-renderer.mjs'
import { loadGroupAnalysisTexts } from './analysisText.mjs'

export function createDraftPaperStore({
  exportDir,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  paperAssetsDir,
  rootDir,
  selectQuestionGroupCards,
}) {
  const recentDraftPdfExports = new Map()

  function getCurrentDraftPaperRow(db) {
    return db
      .prepare(
        `
        SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at
        FROM draft_papers
        WHERE status = 'active' AND current_marker = 1
        ORDER BY updated_at DESC
        LIMIT 1
        `,
      )
      .get() || null
  }

  function makeDraftPaperTitle() {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${month}${day} 英语草稿卷`
  }

  function createDraftPaper(db, title = makeDraftPaperTitle()) {
    const id = `draft-paper-${randomUUID()}`
    db.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1').run()
    db.prepare(
      `
      INSERT INTO draft_papers (id, title, subject, status, current_marker)
      VALUES (?, ?, 'english', 'active', 1)
      `,
    ).run(id, String(title || '').trim() || makeDraftPaperTitle())
    return getDraftPaper(db, id)
  }

  function touchDraftPaper(db, draftPaperId) {
    db.prepare('UPDATE draft_papers SET updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
  }

  function markCurrentDraftPaper(db, draftPaperId) {
    db.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1 AND id <> ?').run(draftPaperId)
    db.prepare('UPDATE draft_papers SET current_marker = 1, updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
  }

  function cnSectionNumber(index) {
    const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    if (index <= 10) return numerals[index]
    if (index < 20) return `十${numerals[index - 10]}`
    return String(index)
  }

  function buildDraftPaperBlocks(items) {
    const blocks = []
    let previousType = ''
    let sectionIndex = 0
    for (const [index, item] of items.entries()) {
      const groupType = item.questionGroup?.groupType || item.groupType || ''
      if (index > 0 && item.pageBreakBefore) blocks.push({ type: 'page_break' })
      if (groupType !== previousType) {
        sectionIndex += 1
        blocks.push({
          type: 'section_header',
          title: `第${cnSectionNumber(sectionIndex)}部分 ${groupTypeLabels[groupType] || '综合练习'}`,
        })
        previousType = groupType
      }
      blocks.push({
        type: 'question_group',
        questionGroupId: item.groupId,
        score: Number(item.questionGroup?.defaultScore || item.defaultScore || 0),
      })
    }
    return blocks
  }

  function buildDraftPaperExportInput(draftPaper, { versionType = 'student', printStyle = 'exam', questionNumberStart = 1 } = {}) {
    return {
      title: draftPaper.title || '未命名英语练习卷',
      versionType: versionType === 'teacher' ? 'teacher' : 'student',
      printStyle: printStyle === 'handout' ? 'handout' : 'exam',
      questionNumberStart: Number.isInteger(Number(questionNumberStart)) && Number(questionNumberStart) >= 1 ? Number(questionNumberStart) : 1,
      items: draftPaper.items.map((item) => ({
        questionGroupId: item.groupId,
        score: Number(item.questionGroup?.defaultScore || 0),
        sectionTitle: '',
        note: '',
      })),
      blocks: buildDraftPaperBlocks(draftPaper.items),
    }
  }

  function addDraftFooterCss(html, title) {
    const safeTitle = String(title || '英语练习卷').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const footerCss = `
@page {
  @bottom-center {
    content: "${safeTitle} · " counter(page);
    font-size: 9pt;
    color: #666;
  }
}
`
    return html.replace('</style>', `${footerCss}\n</style>`)
  }

  function buildDraftPrintHtml(draftPaper, exportOptions = {}) {
    if (!draftPaper.items.length) return ''
    const input = buildDraftPaperExportInput(draftPaper, exportOptions)
    const exportItems = input.items.map((item) => {
      // 依赖 getQuestionGroupDetail 每次返回全新对象：下方教师版分支会就地
      // 写入 detail.questions[].explanation。若它将来加缓存（LRU 等），教师版
      // 解析会泄漏进后续学生版导出——加缓存前必须先改这里为深拷贝。
      const detail = getQuestionGroupDetail(item.questionGroupId)
      if (!detail) throw new Error(`questionGroupId not found: ${item.questionGroupId}`)
      return {
        detail,
        note: '',
        score: Math.max(0, Number.isFinite(Number(item.score)) ? Number(item.score) : detail.defaultScore),
        sectionTitle: '',
      }
    })
    if (input.versionType === 'teacher' && paperAssetsDir) {
      // Restart cut ③ — join teacher-version explanations from paper-assets
      // analysis files. Display-layer only: never writes questions.explanation.
      const analysisTextByQuestionId = loadGroupAnalysisTexts(exportItems, { paperAssetsDir })
      for (const item of exportItems) {
        for (const question of item.detail.questions) {
          if (question.explanation) continue
          const analysisText = analysisTextByQuestionId.get(question.id)
          if (analysisText) question.explanation = analysisText
        }
      }
    }
    return addDraftFooterCss(
      buildPrintHtml({
        title: input.title,
        versionType: input.versionType,
        printStyle: input.printStyle,
        items: exportItems,
        blocks: input.blocks,
        questionNumberStart: input.questionNumberStart,
      }),
      input.title,
    )
  }

  function clearRecentDraftPdfExport(draftPaperId, outputPath) {
    const cached = recentDraftPdfExports.get(draftPaperId)
    if (!outputPath || cached?.outputPath === outputPath) recentDraftPdfExports.delete(draftPaperId)
    if (!outputPath) return

    const resolvedOutputPath = path.resolve(outputPath)
    const resolvedExportDir = path.resolve(exportDir)
    if (resolvedOutputPath === resolvedExportDir || !resolvedOutputPath.startsWith(`${resolvedExportDir}${path.sep}`)) return
    try {
      rmSync(resolvedOutputPath, { force: true })
    } catch {
      // Best-effort cleanup for staging PDFs; the My Space copy is already persisted.
    }
  }

  function draftPaperPrintSignature(draftPaper, versionType) {
    return JSON.stringify({
      id: draftPaper.id,
      title: draftPaper.title,
      versionType,
      items: draftPaper.items.map((item) => ({
        id: item.id,
        groupId: item.groupId,
        orderIndex: item.orderIndex,
        pageBreakBefore: item.pageBreakBefore,
        updatedAt: item.updatedAt,
      })),
    })
  }

  function estimateEnglishWords(text) {
    return String(text || '').match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g)?.length || 0
  }

  function buildPageBreakSuggestions(items) {
    const suggestions = []
    let previousEstimate = 0
    for (const [index, item] of items.entries()) {
      const detail = getQuestionGroupDetail(item.groupId)
      if (!detail) continue
      const materialWords = estimateEnglishWords(`${detail.passage.materialText || ''}\n${detail.passage.summary || ''}`)
      const optionCount = detail.questions.reduce((sum, question) => sum + question.options.length, 0)
      const estimate = materialWords * 1.2 + detail.questions.length * 80 + optionCount * 12
      let reason = ''
      if ((detail.groupType === 'reading' || detail.groupType === 'seven_choices') && materialWords > 600) {
        reason = '长篇材料超过 600 词'
      } else if (detail.questions.length > 4 && optionCount > 16) {
        reason = '题量和选项较多'
      } else if (previousEstimate > 0 && estimate > 700 && previousEstimate + estimate > 1000) {
        reason = '预计会超过当前 A4 页面 70%'
      }
      if (index > 0 && reason && !item.pageBreakBefore) {
        suggestions.push({ itemId: item.id, groupId: item.groupId, reason })
      }
      previousEstimate = estimate
    }
    return suggestions
  }

  function rowToDraftPaperSummary(row, itemRows = []) {
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      status: row.status,
      isCurrent: Number(row.current_marker || 0) === 1,
      itemCount: itemRows.length,
      totalQuestions: itemRows.reduce((sum, item) => sum + Number(item.questionGroup?.questionCount || 0), 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastPrintedAt: row.last_printed_at || null,
    }
  }

  function getDraftPaperItems(db, draftPaperId) {
    const rows = db
      .prepare(
        `
        SELECT id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before, created_at, updated_at
        FROM draft_paper_items
        WHERE draft_paper_id = ?
        ORDER BY order_index ASC, created_at ASC
        `,
      )
      .all(draftPaperId)

    return rows.map((row) => {
      const questionGroup = selectQuestionGroupCards(db, 'WHERE id = ?', [row.group_id])[0] || null
      const printReady = isGroupPrintReady(db, row.group_id)
      return {
        id: row.id,
        draftPaperId: row.draft_paper_id,
        groupId: row.group_id,
        sourcePaperId: row.source_paper_id || '',
        orderIndex: Number(row.order_index || 0),
        pageBreakBefore: Number(row.page_break_before || 0) === 1,
        printReady: printReady.ok,
        printUnavailableReason: printReady.reason,
        questionGroup,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
  }

  function getDraftPaper(db, draftPaperId, { includePrintHtml = true, versionType = 'student' } = {}) {
    const row = db
      .prepare(
        `
        SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at
        FROM draft_papers
        WHERE id = ? AND status = 'active'
        `,
      )
      .get(draftPaperId)
    if (!row) return null
    const items = getDraftPaperItems(db, draftPaperId)
    const draftPaper = {
      ...rowToDraftPaperSummary(row, items),
      items,
      pageBreakSuggestions: buildPageBreakSuggestions(items),
    }
    return {
      ...draftPaper,
      printHtml: includePrintHtml && items.length > 0 ? buildDraftPrintHtml(draftPaper, { versionType }) : '',
    }
  }

  function listDraftPapers() {
    const db = openDatabase()
    try {
      const rows = db
        .prepare(
          `
          SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at
          FROM draft_papers
          WHERE status = 'active'
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 12
          `,
        )
        .all()
      return rows.map((row) => rowToDraftPaperSummary(row, getDraftPaperItems(db, row.id)))
    } finally {
      db.close()
    }
  }

  function getOrCreateCurrentDraftPaper({ createIfMissing = true } = {}) {
    const db = openDatabase({ readOnly: false })
    try {
      let current = getCurrentDraftPaperRow(db)
      if (!current && createIfMissing) {
        db.exec('BEGIN')
        try {
          const draft = createDraftPaper(db)
          db.exec('COMMIT')
          return draft
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }
      return current ? getDraftPaper(db, current.id) : null
    } finally {
      db.close()
    }
  }

  function sourcePaperIdFromCard(card) {
    return [card?.year, card?.region, card?.paperName].filter(Boolean).join('__')
  }

  function normalizeDraftItemOrder(db, draftPaperId) {
    const rows = db
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? ORDER BY order_index ASC, created_at ASC')
      .all(draftPaperId)
    const update = db.prepare('UPDATE draft_paper_items SET order_index = ?, updated_at = datetime(\'now\') WHERE id = ?')
    rows.forEach((row, index) => update.run(index + 1, row.id))
  }

  function addGroupToDraftPaper(db, draftPaperId, groupId, { insertIndex = null, pageBreakBefore = false } = {}) {
    const [card] = selectQuestionGroupCards(db, 'WHERE id = ?', [groupId])
    if (!card) throw new Error(`questionGroupId not found: ${groupId}`)
    const ready = isGroupPrintReady(db, groupId)
    if (!ready.ok) throw new Error(ready.reason || '题组暂不可打印')
    const existing = db
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? AND group_id = ?')
      .get(draftPaperId, groupId)
    if (existing) return existing.id
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM draft_paper_items WHERE draft_paper_id = ?')
      .get(draftPaperId)?.count || 0
    const targetIndex = Number.isInteger(Number(insertIndex)) && Number(insertIndex) >= 0
      ? Math.min(Number(insertIndex), Number(count))
      : Number(count)
    db.prepare(
      `
      UPDATE draft_paper_items
      SET order_index = order_index + 1, updated_at = datetime('now')
      WHERE draft_paper_id = ? AND order_index > ?
      `,
    ).run(draftPaperId, targetIndex)
    const itemId = `draft-item-${randomUUID()}`
    db.prepare(
      `
      INSERT INTO draft_paper_items (id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(itemId, draftPaperId, groupId, sourcePaperIdFromCard(card), targetIndex + 1, pageBreakBefore ? 1 : 0)
    touchDraftPaper(db, draftPaperId)
    normalizeDraftItemOrder(db, draftPaperId)
    return itemId
  }

  function addGroupToCurrentDraftPaper(groupId) {
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        let current = getCurrentDraftPaperRow(db)
        if (!current) {
          createDraftPaper(db)
          current = getCurrentDraftPaperRow(db)
        }
        addGroupToDraftPaper(db, current.id, groupId)
        markCurrentDraftPaper(db, current.id)
        db.exec('COMMIT')
        return getDraftPaper(db, current.id)
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function updateDraftPaper(draftPaperId, input) {
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        const existing = getDraftPaper(db, draftPaperId, { includePrintHtml: false })
        if (!existing) throw new Error('Draft paper not found')
        if (Object.prototype.hasOwnProperty.call(input, 'title')) {
          const title = String(input.title || '').trim() || makeDraftPaperTitle()
          db.prepare('UPDATE draft_papers SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(title, draftPaperId)
        }
        if (Array.isArray(input.items)) {
          const knownItems = new Set(
            db.prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ?').all(draftPaperId).map((row) => row.id),
          )
          const updateItem = db.prepare(
            `
            UPDATE draft_paper_items
            SET order_index = ?, page_break_before = ?, updated_at = datetime('now')
            WHERE id = ? AND draft_paper_id = ?
            `,
          )
          input.items.forEach((item, index) => {
            if (!knownItems.has(item.id)) return
            updateItem.run(index + 1, item.pageBreakBefore ? 1 : 0, item.id, draftPaperId)
          })
          normalizeDraftItemOrder(db, draftPaperId)
          touchDraftPaper(db, draftPaperId)
        }
        markCurrentDraftPaper(db, draftPaperId)
        db.exec('COMMIT')
        return getDraftPaper(db, draftPaperId)
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function patchDraftPaperItem(draftPaperId, itemId, input) {
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        const existing = db
          .prepare('SELECT id FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?')
          .get(itemId, draftPaperId)
        if (!existing) throw new Error('Draft item not found')
        if (Object.prototype.hasOwnProperty.call(input, 'pageBreakBefore')) {
          db.prepare(
            'UPDATE draft_paper_items SET page_break_before = ?, updated_at = datetime(\'now\') WHERE id = ? AND draft_paper_id = ?',
          ).run(input.pageBreakBefore ? 1 : 0, itemId, draftPaperId)
        }
        touchDraftPaper(db, draftPaperId)
        markCurrentDraftPaper(db, draftPaperId)
        db.exec('COMMIT')
        return getDraftPaper(db, draftPaperId)
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function deleteDraftPaperItem(draftPaperId, itemId) {
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        const row = db
          .prepare(
            `
            SELECT dpi.*, qg.id AS group_id
            FROM draft_paper_items dpi
            JOIN question_groups qg ON qg.id = dpi.group_id
            WHERE dpi.id = ? AND dpi.draft_paper_id = ?
            `,
          )
          .get(itemId, draftPaperId)
        if (!row) throw new Error('Draft item not found')
        db.prepare('DELETE FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?').run(itemId, draftPaperId)
        normalizeDraftItemOrder(db, draftPaperId)
        touchDraftPaper(db, draftPaperId)
        markCurrentDraftPaper(db, draftPaperId)
        db.exec('COMMIT')
        return {
          draftPaper: getDraftPaper(db, draftPaperId),
          removed: {
            itemId: row.id,
            groupId: row.group_id,
            orderIndex: Number(row.order_index || 1),
            pageBreakBefore: Number(row.page_break_before || 0) === 1,
          },
        }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function restoreDraftPaperItem(draftPaperId, input) {
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        const groupId = String(input.groupId || '').trim()
        if (!groupId) throw new Error('groupId is required')
        const insertIndex = Number.isInteger(Number(input.orderIndex)) ? Number(input.orderIndex) - 1 : null
        addGroupToDraftPaper(db, draftPaperId, groupId, {
          insertIndex,
          pageBreakBefore: input.pageBreakBefore === true,
        })
        markCurrentDraftPaper(db, draftPaperId)
        db.exec('COMMIT')
        return getDraftPaper(db, draftPaperId)
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function migrateAssemblyBasketToDraftPaper(input) {
    const groupIds = Array.isArray(input?.groupIds) ? input.groupIds.map((id) => String(id || '').trim()).filter(Boolean) : []
    const db = openDatabase({ readOnly: false })
    try {
      db.exec('BEGIN')
      try {
        let current = getCurrentDraftPaperRow(db)
        if (current) {
          db.exec('COMMIT')
          return { draftPaper: getDraftPaper(db, current.id), migratedCount: 0, skippedCount: groupIds.length }
        }
        const draft = createDraftPaper(db)
        let migratedCount = 0
        let skippedCount = 0
        for (const groupId of groupIds) {
          try {
            addGroupToDraftPaper(db, draft.id, groupId)
            migratedCount += 1
          } catch {
            skippedCount += 1
          }
        }
        db.exec('COMMIT')
        return { draftPaper: getDraftPaper(db, draft.id), migratedCount, skippedCount }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
  }

  function exportDraftPaperPdf(draftPaperId, { preferRecent = false, versionType = 'student' } = {}) {
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const db = openDatabase({ readOnly: false })
    try {
      const draftPaper = getDraftPaper(db, draftPaperId, { includePrintHtml: false })
      if (!draftPaper) throw new Error('Draft paper not found')
      if (!draftPaper.items.length) throw new Error('请先添加题组')
      const signature = draftPaperPrintSignature(draftPaper, normalizedVersionType)
      const recent = recentDraftPdfExports.get(draftPaperId)
      if (
        preferRecent &&
        recent &&
        recent.signature === signature &&
        Date.now() - recent.createdAt <= 30_000 &&
        existsSync(recent.outputPath)
      ) {
        db.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
        return { body: readFileSync(recent.outputPath), fileName: recent.fileName, outputPath: recent.outputPath, draftPaper, reusedRecent: true }
      }
      const html = buildDraftPrintHtml(draftPaper, { versionType: normalizedVersionType })
      const vivliostylePaths = [
        path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
        path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
        path.join(rootDir, 'app', 'node_modules', '.bin', 'vivliostyle'),
      ]
      let vivliostyleBin = null
      for (const p of vivliostylePaths) {
        if (existsSync(p)) { vivliostyleBin = p; break }
      }
      if (!vivliostyleBin) {
        throw new Error('vivliostyle CLI not found. Install with: npm install @vivliostyle/cli')
      }

      mkdirSync(exportDir, { recursive: true })
      const tempDir = mkdtempSync(path.join(tmpdir(), 'draft-paper-print-'))
      const htmlPath = path.join(tempDir, 'draft-paper.html')
      const pdfPath = path.join(tempDir, 'draft-paper.pdf')
      try {
        writeFileSync(htmlPath, html)
        execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000 })
        const safeTitle = String(draftPaper.title || '英语草稿卷').replace(/[\\/:*?"<>|]/g, '-')
        const versionLabel = normalizedVersionType === 'teacher' ? '教师卷' : '学生卷'
        const fileName = `${safeTitle}-${versionLabel}.pdf`
        const outputPath = path.join(exportDir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${fileName}`)
        copyFileSync(pdfPath, outputPath)
        db.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
        recentDraftPdfExports.set(draftPaperId, { signature, fileName, outputPath, createdAt: Date.now() })
        return { body: readFileSync(outputPath), fileName, outputPath, draftPaper, reusedRecent: false }
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    } finally {
      db.close()
    }
  }

  return {
    addGroupToCurrentDraftPaper,
    addGroupToDraftPaper,
    buildDraftPrintHtml,
    clearRecentDraftPdfExport,
    deleteDraftPaperItem,
    exportDraftPaperPdf,
    getCurrentDraftPaperRow,
    getDraftPaper,
    getOrCreateCurrentDraftPaper,
    listDraftPapers,
    markCurrentDraftPaper,
    migrateAssemblyBasketToDraftPaper,
    patchDraftPaperItem,
    restoreDraftPaperItem,
    updateDraftPaper,
  }
}
