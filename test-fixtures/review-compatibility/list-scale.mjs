import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
    // Construction allocates and hashes 37 MiB of synthetic subjects. Exercise
    // the real reads in a clean process, as an API process opening this DB would,
    // so fixture garbage collection is not charged to the read-only seam.
    const program = `import { verifyReviewListScaleReads } from ${JSON.stringify(import.meta.url)};
      await verifyReviewListScaleReads({ dbPath: process.argv[1], filesRoot: process.argv[2] });`
    console.log(execFileSync(process.execPath, ['-e', program, destination, filesRoot],
      { encoding: 'utf8', timeout: 30_000 }).trim())
  } finally { db.close() }
}

export async function verifyReviewListScaleReads({ dbPath, filesRoot }) {
  const db = new DatabaseSync(dbPath)
  try {
    const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'scale-fixture' })
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
    const attempts = db.prepare('SELECT rowid, evidence_json, evidence_digest FROM review_compatibility').all()
    for (const mode of ['bad_digest', 'changed_json', 'mismatched_result', 'mismatched_reason']) {
      try {
        const update = db.prepare('UPDATE review_compatibility SET evidence_json=?, evidence_digest=? WHERE rowid=?')
        for (const row of attempts) {
          const evidence = JSON.parse(row.evidence_json)
          if (mode === 'changed_json') evidence.metrics = { corrupted: true }
          if (mode === 'mismatched_result') evidence.result = 'unknown'
          if (mode === 'mismatched_reason') evidence.reasonCode = 'FORGED'
          const digest = mode === 'bad_digest' ? 'corrupted'
            : mode === 'changed_json' ? row.evidence_digest : digestJson(evidence)
          update.run(JSON.stringify(evidence), digest, row.rowid)
        }
        assert(store.listPapers().every(row => row.compatibility.result !== 'equal'), mode)
        assert.notEqual(store.agentPaperStatus('paper-scale-0').compatibility.result, 'equal', mode)
      } finally {
        const restore = db.prepare('UPDATE review_compatibility SET evidence_json=?, evidence_digest=? WHERE rowid=?')
        for (const row of attempts) restore.run(row.evidence_json, row.evidence_digest, row.rowid)
      }
    }
    console.log('PASS lightweight list/probe reject corrupt evidence digest, changed JSON and recomputed but inconsistent result/reason')
    console.log(JSON.stringify({ check: 'review-list-scale', papers: 100, subjectBytesAtLeast: 365 * 1024,
      elapsedMs, probeMs, maxTimerDelayMs: delay, ticks }))
  } finally { db.close() }
}
