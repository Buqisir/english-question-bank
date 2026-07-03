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

// M0-1 user-data split: draft_papers / draft_paper_items now live in the user database
// (userDb), while question groups / print-readiness live in the shared bank database
// (bankDb). Methods that touch both sides receive `{ userDb, bankDb }` from their caller
// (route layer for db-param methods; self-opened for the self-open methods below) — see
// docs/cuts/m0-1-user-db-split/plan.md "store 连接改造清单" for the per-method contract.
// No SQL statement may cross sides; cross-side assembly always happens in application code.
export function createDraftPaperStore({
  exportDir,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  openUserDatabase,
  paperAssetsDir,
  rootDir,
  selectQuestionGroupCards,
}) {
  const recentDraftPdfExports = new Map()

  function getCurrentDraftPaperRow(userDb) {
    return userDb
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

  function createDraftPaper({ userDb, bankDb }, title = makeDraftPaperTitle()) {
    const id = `draft-paper-${randomUUID()}`
    userDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1').run()
    userDb.prepare(
      `
      INSERT INTO draft_papers (id, title, subject, status, current_marker)
      VALUES (?, ?, 'english', 'active', 1)
      `,
    ).run(id, String(title || '').trim() || makeDraftPaperTitle())
    return getDraftPaper({ userDb, bankDb }, id)
  }

  function touchDraftPaper(userDb, draftPaperId) {
    userDb.prepare('UPDATE draft_papers SET updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
  }

  function markCurrentDraftPaper(userDb, draftPaperId) {
    userDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1 AND id <> ?').run(draftPaperId)
    userDb.prepare('UPDATE draft_papers SET current_marker = 1, updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
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
      if (item.groupMissing) continue
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
      items: draftPaper.items
        .filter((item) => !item.groupMissing)
        .map((item) => ({
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
    if (!input.items.length) return ''
    const exportItems = input.items.map((item) => {
      // 依赖 getQuestionGroupDetail 每次返回全新对象：下方教师版分支会就地
      // 写入 detail.questions[].explanation。若它将来加缓存（LRU 等），教师版
      // 解析会泄漏进后续学生版导出——加缓存前必须先改这里为深拷贝。
      // groupMissing items are filtered out of input.items above, so this
      // getQuestionGroupDetail lookup must never see an orphaned groupId here.
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
      if (item.groupMissing) continue
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

  // Orphan tolerance (ADR-0011 / plan.md decision 4): a draft item whose question group
  // has disappeared from the bank (e.g. a bank-file replacement dropped it) is returned
  // with groupMissing: true and a null questionGroup, instead of crashing. This is the
  // single point where orphaned items are detected; print/export filtering downstream
  // (buildDraftPaperExportInput / buildDraftPaperBlocks) relies on this flag.
  function getDraftPaperItems({ userDb, bankDb }, draftPaperId) {
    const rows = userDb
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
      const questionGroup = selectQuestionGroupCards(bankDb, 'WHERE id = ?', [row.group_id])[0] || null
      const groupMissing = !questionGroup
      const printReady = groupMissing
        ? { ok: false, reason: '题组不存在' }
        : isGroupPrintReady(bankDb, row.group_id)
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
        groupMissing,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
  }

  function getDraftPaper({ userDb, bankDb }, draftPaperId, { includePrintHtml = true, versionType = 'student' } = {}) {
    const row = userDb
      .prepare(
        `
        SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at
        FROM draft_papers
        WHERE id = ? AND status = 'active'
        `,
      )
      .get(draftPaperId)
    if (!row) return null
    const items = getDraftPaperItems({ userDb, bankDb }, draftPaperId)
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
    const userDb = openUserDatabase({ readOnly: true })
    const bankDb = openDatabase()
    try {
      const rows = userDb
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
      return rows.map((row) => rowToDraftPaperSummary(row, getDraftPaperItems({ userDb, bankDb }, row.id)))
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function getOrCreateCurrentDraftPaper({ createIfMissing = true } = {}) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      let current = getCurrentDraftPaperRow(userDb)
      if (!current && createIfMissing) {
        userDb.exec('BEGIN')
        try {
          const draft = createDraftPaper({ userDb, bankDb })
          userDb.exec('COMMIT')
          return draft
        } catch (error) {
          userDb.exec('ROLLBACK')
          throw error
        }
      }
      return current ? getDraftPaper({ userDb, bankDb }, current.id) : null
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function sourcePaperIdFromCard(card) {
    return [card?.year, card?.region, card?.paperName].filter(Boolean).join('__')
  }

  function normalizeDraftItemOrder(userDb, draftPaperId) {
    const rows = userDb
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? ORDER BY order_index ASC, created_at ASC')
      .all(draftPaperId)
    const update = userDb.prepare('UPDATE draft_paper_items SET order_index = ?, updated_at = datetime(\'now\') WHERE id = ?')
    rows.forEach((row, index) => update.run(index + 1, row.id))
  }

  // Write-side guard preserved (plan.md decision 8): adding a group that no longer
  // exists in the bank still throws. Orphan tolerance only applies to the read side
  // (a group already in a draft that later disappears from the bank).
  function addGroupToDraftPaper({ userDb, bankDb }, draftPaperId, groupId, { insertIndex = null, pageBreakBefore = false } = {}) {
    const [card] = selectQuestionGroupCards(bankDb, 'WHERE id = ?', [groupId])
    if (!card) throw new Error(`questionGroupId not found: ${groupId}`)
    const ready = isGroupPrintReady(bankDb, groupId)
    if (!ready.ok) throw new Error(ready.reason || '题组暂不可打印')
    const existing = userDb
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? AND group_id = ?')
      .get(draftPaperId, groupId)
    if (existing) return existing.id
    const count = userDb
      .prepare('SELECT COUNT(*) AS count FROM draft_paper_items WHERE draft_paper_id = ?')
      .get(draftPaperId)?.count || 0
    const targetIndex = Number.isInteger(Number(insertIndex)) && Number(insertIndex) >= 0
      ? Math.min(Number(insertIndex), Number(count))
      : Number(count)
    userDb.prepare(
      `
      UPDATE draft_paper_items
      SET order_index = order_index + 1, updated_at = datetime('now')
      WHERE draft_paper_id = ? AND order_index > ?
      `,
    ).run(draftPaperId, targetIndex)
    const itemId = `draft-item-${randomUUID()}`
    userDb.prepare(
      `
      INSERT INTO draft_paper_items (id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(itemId, draftPaperId, groupId, sourcePaperIdFromCard(card), targetIndex + 1, pageBreakBefore ? 1 : 0)
    touchDraftPaper(userDb, draftPaperId)
    normalizeDraftItemOrder(userDb, draftPaperId)
    return itemId
  }

  function addGroupToCurrentDraftPaper(groupId) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        let current = getCurrentDraftPaperRow(userDb)
        if (!current) {
          createDraftPaper({ userDb, bankDb })
          current = getCurrentDraftPaperRow(userDb)
        }
        addGroupToDraftPaper({ userDb, bankDb }, current.id, groupId)
        markCurrentDraftPaper(userDb, current.id)
        userDb.exec('COMMIT')
        return getDraftPaper({ userDb, bankDb }, current.id)
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function updateDraftPaper(draftPaperId, input) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const existing = getDraftPaper({ userDb, bankDb }, draftPaperId, { includePrintHtml: false })
        if (!existing) throw new Error('Draft paper not found')
        if (Object.prototype.hasOwnProperty.call(input, 'title')) {
          const title = String(input.title || '').trim() || makeDraftPaperTitle()
          userDb.prepare('UPDATE draft_papers SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(title, draftPaperId)
        }
        if (Array.isArray(input.items)) {
          const knownItems = new Set(
            userDb.prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ?').all(draftPaperId).map((row) => row.id),
          )
          const updateItem = userDb.prepare(
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
          normalizeDraftItemOrder(userDb, draftPaperId)
          touchDraftPaper(userDb, draftPaperId)
        }
        markCurrentDraftPaper(userDb, draftPaperId)
        userDb.exec('COMMIT')
        return getDraftPaper({ userDb, bankDb }, draftPaperId)
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function patchDraftPaperItem(draftPaperId, itemId, input) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const existing = userDb
          .prepare('SELECT id FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?')
          .get(itemId, draftPaperId)
        if (!existing) throw new Error('Draft item not found')
        if (Object.prototype.hasOwnProperty.call(input, 'pageBreakBefore')) {
          userDb.prepare(
            'UPDATE draft_paper_items SET page_break_before = ?, updated_at = datetime(\'now\') WHERE id = ? AND draft_paper_id = ?',
          ).run(input.pageBreakBefore ? 1 : 0, itemId, draftPaperId)
        }
        touchDraftPaper(userDb, draftPaperId)
        markCurrentDraftPaper(userDb, draftPaperId)
        userDb.exec('COMMIT')
        return getDraftPaper({ userDb, bankDb }, draftPaperId)
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // JOIN rewritten to a single-table lookup (plan.md decision 5): the original JOIN
  // against question_groups was only an existence check on the item itself, and whether
  // the referenced group still exists in the bank is irrelevant to delete semantics
  // (orphaned items must remain deletable). userDb-only — no bank touch here at all.
  function deleteDraftPaperItem(draftPaperId, itemId) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const row = userDb
          .prepare(
            `
            SELECT *
            FROM draft_paper_items
            WHERE id = ? AND draft_paper_id = ?
            `,
          )
          .get(itemId, draftPaperId)
        if (!row) throw new Error('Draft item not found')
        userDb.prepare('DELETE FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?').run(itemId, draftPaperId)
        normalizeDraftItemOrder(userDb, draftPaperId)
        touchDraftPaper(userDb, draftPaperId)
        markCurrentDraftPaper(userDb, draftPaperId)
        userDb.exec('COMMIT')
        return {
          draftPaper: getDraftPaper({ userDb, bankDb }, draftPaperId),
          removed: {
            itemId: row.id,
            groupId: row.group_id,
            orderIndex: Number(row.order_index || 1),
            pageBreakBefore: Number(row.page_break_before || 0) === 1,
          },
        }
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function restoreDraftPaperItem(draftPaperId, input) {
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const groupId = String(input.groupId || '').trim()
        if (!groupId) throw new Error('groupId is required')
        const insertIndex = Number.isInteger(Number(input.orderIndex)) ? Number(input.orderIndex) - 1 : null
        addGroupToDraftPaper({ userDb, bankDb }, draftPaperId, groupId, {
          insertIndex,
          pageBreakBefore: input.pageBreakBefore === true,
        })
        markCurrentDraftPaper(userDb, draftPaperId)
        userDb.exec('COMMIT')
        return getDraftPaper({ userDb, bankDb }, draftPaperId)
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function migrateAssemblyBasketToDraftPaper(input) {
    const groupIds = Array.isArray(input?.groupIds) ? input.groupIds.map((id) => String(id || '').trim()).filter(Boolean) : []
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        let current = getCurrentDraftPaperRow(userDb)
        if (current) {
          userDb.exec('COMMIT')
          return { draftPaper: getDraftPaper({ userDb, bankDb }, current.id), migratedCount: 0, skippedCount: groupIds.length }
        }
        const draft = createDraftPaper({ userDb, bankDb })
        let migratedCount = 0
        let skippedCount = 0
        for (const groupId of groupIds) {
          try {
            addGroupToDraftPaper({ userDb, bankDb }, draft.id, groupId)
            migratedCount += 1
          } catch {
            skippedCount += 1
          }
        }
        userDb.exec('COMMIT')
        return { draftPaper: getDraftPaper({ userDb, bankDb }, draft.id), migratedCount, skippedCount }
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function exportDraftPaperPdf(draftPaperId, { preferRecent = false, versionType = 'student' } = {}) {
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      const draftPaper = getDraftPaper({ userDb, bankDb }, draftPaperId, { includePrintHtml: false })
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
        userDb.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
        return { body: readFileSync(recent.outputPath), fileName: recent.fileName, outputPath: recent.outputPath, draftPaper, reusedRecent: true }
      }
      const html = buildDraftPrintHtml(draftPaper, { versionType: normalizedVersionType })
      if (!html) throw new Error('请先添加题组')
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
        userDb.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(draftPaperId)
        recentDraftPdfExports.set(draftPaperId, { signature, fileName, outputPath, createdAt: Date.now() })
        return { body: readFileSync(outputPath), fileName, outputPath, draftPaper, reusedRecent: false }
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    } finally {
      userDb.close()
      bankDb.close()
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
