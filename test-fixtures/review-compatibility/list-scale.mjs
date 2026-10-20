import assert from 'node:assert/strict'
import { copyFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { createImportReviewStore } from '../../server/import-review/importReviewStore.mjs'

export async function verifyReviewListScale({ dbPath, destination, filesRoot }) {
  copyFileSync(dbPath, destination)
  const db = new DatabaseSync(destination)
  const tables = ['import_review_papers', 'import_review_revisions', 'import_review_product_previews',
    'review_subject', 'review_compatibility']
  const originals = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} LIMIT 1`).get()]))
  const insert = (table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')})
    VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row))
  try {
    db.exec('BEGIN IMMEDIATE')
    for (const table of [...tables].reverse()) db.exec(`DELETE FROM ${table}`)
    for (let i = 0; i < 100; i++) {
      const revisionId = `scale-revision-${i}`
      const paperId = `paper-scale-${i}`
      const rows = structuredClone(originals)
      Object.assign(rows.import_review_papers, { paper_id: paperId, latest_revision_id: revisionId })
      Object.assign(rows.import_review_revisions, { id: revisionId, paper_id: paperId })
      rows.import_review_product_previews.revision_id = revisionId
      const subject = JSON.parse(rows.review_subject.subject_json)
      subject.revisionId = revisionId
      subject.components.consumer.scaleFixture = 'x'.repeat(365 * 1024)
      rows.review_subject.subject_json = JSON.stringify(subject)
      rows.review_subject.revision_id = revisionId
      rows.review_subject.subject_digest = digestJson(subject)
      const attempt = rows.review_compatibility
      attempt.revision_id = revisionId
      attempt.subject_digest = rows.review_subject.subject_digest
      const evidence = JSON.parse(attempt.evidence_json)
      evidence.binding.revisionId = revisionId
      evidence.binding.subjectDigest = attempt.subject_digest
      attempt.evidence_json = JSON.stringify(evidence)
      attempt.evidence_digest = digestJson(evidence)
      for (const table of tables) insert(table, rows[table])
    }
    db.exec('COMMIT')
    const store = createImportReviewStore({ dbPath: destination, filesRoot, rendererBuildId: 'scale-fixture' })
    await store.ready()
    let tick = performance.now()
    let delay = 0
    let ticks = 0
    const timer = setInterval(() => {
      const now = performance.now()
      delay = Math.max(delay, now - tick - 2)
      tick = now
      ticks++
    }, 2)
    let elapsedMs
    let probeMs
    try {
      await yieldFor(10)
      const started = performance.now()
      const list = store.listPapers()
      elapsedMs = performance.now() - started
      assert.equal(list.length, 100)
      assert(list.every(row => row.compatibility.result === 'equal'))
      const probeStarted = performance.now()
      const status = store.agentPaperStatus('paper-scale-0')
      probeMs = performance.now() - probeStarted
      assert.equal(status.compatibility.result, 'equal')
      assert.equal(status.latestRevisionId, 'scale-revision-0')
      await yieldFor(10)
    } finally { clearInterval(timer) }
    assert(elapsedMs < 100, `100-paper list took ${elapsedMs.toFixed(2)}ms`)
    assert(probeMs < 100, `large-subject probe took ${probeMs.toFixed(2)}ms`)
    assert(ticks > 0)
    assert(delay < 50, `list delayed timers ${delay.toFixed(2)}ms`)
    // Every cheap binding cell is independently fail-closed.
    for (const [table, cell, replacement] of [
      ['review_subject', 'subject_digest', 'changed'],
      ['import_review_product_previews', 'payload_digest', 'changed'],
      ['import_review_product_previews', 'bundle_digest', 'changed'],
      ['import_review_product_previews', 'renderer_build_id', 'changed'],
      ['review_compatibility', 'target_build_id', 'changed'],
      ['review_compatibility', 'subject_digest', 'changed'],
    ]) {
      const originals = db.prepare(`SELECT rowid, ${cell} AS value FROM ${table}`).all()
      try {
        db.prepare(`UPDATE ${table} SET ${cell}=?`).run(replacement)
        assert(store.listPapers().every(row => row.compatibility.result !== 'equal'), `${table}.${cell}`)
      } finally {
        const restore = db.prepare(`UPDATE ${table} SET ${cell}=? WHERE rowid=?`)
        for (const original of originals) restore.run(original.value, original.rowid)
      }
      assert(store.listPapers().every(row => row.compatibility.result === 'equal'))
    }
    console.log(JSON.stringify({ check: 'review-list-scale', papers: 100, subjectBytesAtLeast: 365 * 1024,
      elapsedMs, probeMs, maxTimerDelayMs: delay, ticks }))
  } finally { db.close() }
}
