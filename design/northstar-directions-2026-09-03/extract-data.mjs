#!/usr/bin/env node
/**
 * Read-only extract of source papers from data/question-bank.sqlite.
 * Kind follows production: sources.source_type real_exam → 真题, mock_exam → 模拟
 * (same mapping as ConciergePaperRow SOURCE_TYPE_LABEL). Titles use the
 * production headline (strip year token, dedupe region). Topic summary uses
 * the first topic-label leaf per passage, first-seen, max 3, joined by " · ".
 * 读后续写 is stored as group_type=writing + title; we split by title.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dbPath = join(root, 'data', 'question-bank.sqlite')

const KIND = { real_exam: '真题', mock_exam: '模拟', self_made: '自建', other: '其他' }
const TYPE_ORDER = ['阅读', '完形', '七选五', '语法填空', '应用文', '读后续写']

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

function stripLeadingYearToken(paperName, year) {
  if (!year) return paperName
  const full = String(year)
  const short = full.slice(2)
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*(?:${escape(full)}|${escape(short)})(?:\\.(\\d{1,2}))?[.\\-年\\s]*`)
  const match = paperName.match(pattern)
  if (!match) return paperName
  const month = match[1]
  const rest = paperName.slice(match[0].length).trim()
  if (!rest) return paperName
  return month ? `${Number(month)}月${rest}` : rest
}

function buildHeadline(paperName, region, year) {
  const name = stripLeadingYearToken(paperName, year).trim()
  const place = (region || '').trim()
  if (!place) return name
  if (!name) return place
  const core = name.endsWith('卷') ? name.slice(0, -1) : name
  const overlaps = core.length > 0 && (name.includes(place) || place.includes(core))
  return overlaps ? name : `${place} ${name}`.trim()
}

function passageType(groupType, title) {
  if (groupType === 'reading') return '阅读'
  if (groupType === 'cloze') return '完形'
  if (groupType === 'seven_choices') return '七选五'
  if (groupType === 'grammar_cloze') return '语法填空'
  if (groupType === 'continuation' || /读后续写/.test(title)) return '读后续写'
  if (groupType === 'writing' || /应用文/.test(title)) return '应用文'
  return ''
}

function topicLeaf(row) {
  const leaf = String(row.subtopic || '').trim() || String(row.label || '').split('-').pop().trim()
  return leaf
}

const { db, close } = openDatabase()
try {
  const cards = db.prepare(`
    SELECT
      qg.id,
      qg.title,
      qg.group_type,
      qg.display_order,
      s.id AS source_id,
      s.source_type,
      s.year,
      s.region,
      s.paper_name,
      s.created_at
    FROM question_groups qg
    JOIN passages p ON p.id = qg.passage_id
    JOIN sources s ON s.id = p.source_id
    ORDER BY s.year DESC, s.paper_name, qg.display_order, qg.title
  `).all()

  const labels = db.prepare(`
    SELECT question_group_id, label, subtopic
    FROM question_group_topic_labels
    ORDER BY theme, theme_group, subtopic, label
  `).all()

  const firstLabel = new Map()
  for (const row of labels) {
    if (!firstLabel.has(row.question_group_id)) firstLabel.set(row.question_group_id, row)
  }

  const buckets = new Map()
  for (const card of cards) {
    const key = [card.paper_name, card.year, card.region, card.source_type].join('\u0001')
    let paper = buckets.get(key)
    if (!paper) {
      paper = {
        id: `${card.year}-${card.source_type}-${card.paper_name}`,
        title: buildHeadline(card.paper_name, card.region, card.year),
        year: card.year,
        kind: KIND[card.source_type] || '',
        importedAt: card.created_at || '',
        passageCount: 0,
        topicSummary: '',
        passageTypes: [],
        _paperName: card.paper_name,
        _topics: [],
        _types: new Set(),
      }
      buckets.set(key, paper)
    }
    if (card.created_at && (!paper.importedAt || card.created_at > paper.importedAt)) {
      paper.importedAt = card.created_at
    }
    paper.passageCount += 1
    const type = passageType(card.group_type, card.title)
    if (type) paper._types.add(type)
    const first = firstLabel.get(card.id)
    if (first) {
      const leaf = topicLeaf(first)
      if (leaf && !paper._topics.includes(leaf) && paper._topics.length < 3) {
        paper._topics.push(leaf)
      }
    }
  }

  const papers = [...buckets.values()].map((paper) => {
    paper.topicSummary = paper._topics.join(' · ')
    paper.passageTypes = TYPE_ORDER.filter((type) => paper._types.has(type))
    delete paper._topics
    delete paper._types
    return paper
  })

  papers.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return a._paperName.localeCompare(b._paperName, 'zh-Hans-CN')
  })
  for (const paper of papers) delete paper._paperName

  const totals = {
    paperCount: papers.length,
    passageCount: papers.reduce((sum, paper) => sum + paper.passageCount, 0),
  }

  process.stdout.write(JSON.stringify({ totals, papers }, null, 2) + '\n')
} finally {
  close(db)
}
