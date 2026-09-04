#!/usr/bin/env node
/**
 * Read-only extract of one question group for detail prototype.
 * Group id defaults to group-2026-i-reading-c.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dbPath = join(root, 'data', 'question-bank.sqlite')
const groupId = process.argv[2] || 'group-2026-i-reading-c'

const KIND = { real_exam: '真题', mock_exam: '模拟', self_made: '自建', other: '其他' }
const GROUP_TYPE = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '应用文写作',
  continuation: '读后续写',
  listening: '听力',
  other: '其他',
}

function openDatabase() {
  const require = createRequire(import.meta.url)
  for (const rel of ['app/node_modules/better-sqlite3', 'server/node_modules/better-sqlite3']) {
    try {
      const Database = require(join(root, rel))
      return { db: new Database(dbPath, { readonly: true }), close: (db) => db.close() }
    } catch {
      /* try next */
    }
  }
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  return { db, close: (db) => db.close() }
}

function topicLeaf(row) {
  return String(row.subtopic || '').trim() || String(row.label || '').split('-').pop().trim()
}

function topicPath(row) {
  return String(row.label || '').trim()
}

function countQuestionTypes(questions) {
  const counts = new Map()
  for (const q of questions) {
    const type = String(q.questionType || '').trim()
    if (!type || type === '阅读理解') continue
    counts.set(type, (counts.get(type) || 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
}

const { db, close } = openDatabase()
try {
  const group = db.prepare(`
    SELECT qg.id, qg.title, qg.group_type, qg.instruction
    FROM question_groups qg
    WHERE qg.id = ?
  `).get(groupId)

  if (!group) {
    console.error(`Group not found: ${groupId}`)
    process.exit(1)
  }

  const passage = db.prepare(`
    SELECT p.summary, p.material_text, s.source_type, s.year, s.paper_name, s.region
    FROM question_groups qg
    JOIN passages p ON p.id = qg.passage_id
    JOIN sources s ON s.id = p.source_id
    WHERE qg.id = ?
  `).get(groupId)

  const topicRows = db.prepare(`
    SELECT label, subtopic, theme, theme_group
    FROM question_group_topic_labels
    WHERE question_group_id = ?
    ORDER BY theme, theme_group, subtopic, label
  `).all(groupId)

  const questionRows = db.prepare(`
    SELECT id, question_no, question_type, stem, display_order
    FROM questions
    WHERE group_id = ?
    ORDER BY display_order
  `).all(groupId)

  const optionRows = db.prepare(`
    SELECT o.question_id, o.label, o.content, o.display_order
    FROM options o
    JOIN questions q ON q.id = o.question_id
    WHERE q.group_id = ?
    ORDER BY q.display_order, o.display_order
  `).all(groupId)

  const optionsByQuestion = new Map()
  for (const opt of optionRows) {
    if (!optionsByQuestion.has(opt.question_id)) optionsByQuestion.set(opt.question_id, [])
    optionsByQuestion.get(opt.question_id).push({
      label: opt.label,
      content: opt.content,
    })
  }

  const questions = questionRows.map((q) => ({
    id: q.id,
    number: q.question_no,
    questionType: q.question_type,
    stem: q.stem,
    options: optionsByQuestion.get(q.id) || [],
  }))

  const parseRow = db.prepare(`
    SELECT payload_json FROM reading_parse_results WHERE question_group_id = ?
  `).get(groupId)

  let parseQuestionTypes = []
  if (parseRow?.payload_json) {
    try {
      const payload = JSON.parse(parseRow.payload_json)
      const perQuestion = payload?.questions || payload?.items || []
      const counts = new Map()
      for (const item of perQuestion) {
        const type = String(item.questionType || item.type || '').trim()
        if (type) counts.set(type, (counts.get(type) || 0) + 1)
      }
      parseQuestionTypes = [...counts.entries()].map(([label, count]) => ({ label, count }))
    } catch {
      /* ignore malformed payload */
    }
  }

  const typeDistribution = parseQuestionTypes.length
    ? parseQuestionTypes
    : countQuestionTypes(questions)

  const paragraphs = String(passage.material_text || '')
    .split(/\n\n+/)
    .map((text) => text.trim())
    .filter(Boolean)

  const detail = {
    id: group.id,
    title: group.title,
    groupTypeLabel: GROUP_TYPE[group.group_type] || group.group_type,
    questionCount: questions.length,
    kind: KIND[passage.source_type] || '',
    summary: passage.summary || '',
    typeDistribution,
    typeDistributionMissing: typeDistribution.length === 0,
    topicLabels: topicRows.map((row) => ({
      leaf: topicLeaf(row),
      path: topicPath(row),
    })),
    passage: { paragraphs },
    questions,
    source: {
      year: passage.year,
      paperName: passage.paper_name,
      region: passage.region,
      sourceType: passage.source_type,
    },
  }

  process.stdout.write(JSON.stringify(detail, null, 2) + '\n')
} finally {
  close(db)
}
