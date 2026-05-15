#!/usr/bin/env node
/**
 * Verification: paperExportPayload produces correct save/DOCX/PDF payloads.
 * Imports the REAL production module — no logic duplication.
 */

import { buildSavePayload, buildDocxPayload, buildPdfPayload } from '../app/src/paperAssembly/paperExportPayload.ts'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

const state = {
  basket: [
    { id: 'g1', score: 2, questionCount: 4, sectionTitle: '阅读理解 B', note: '重点', title: 'Group 1', groupType: 'reading', defaultScore: 2 },
    { id: 'g2', score: 2.5, questionCount: 5, sectionTitle: '七选五', note: '', title: 'Group 2', groupType: 'seven_choices', defaultScore: 2.5 },
  ],
  paperBlocks: [
    { id: 'sh1', type: 'section_header', title: '第一部分 阅读理解' },
    { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2 },
    { id: 'pb1', type: 'page_break' },
    { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.5 },
  ],
  questionNumberStart: 21,
  paperExportStyle: 'exam',
  paperTitle: '2025 英语模拟',
  versionType: 'student',
}

console.log('=== Paper Export Payload Verification ===\n')

// Test 1: Save payload
console.log('Test 1: buildSavePayload')
{
  const payload = buildSavePayload(state)
  assert('title correct', payload.title === '2025 英语模拟', `got: ${payload.title}`)
  assert('items.length = 2', payload.items.length === 2, `got: ${payload.items.length}`)
  assert('items[0].questionGroupId = g1', payload.items[0].questionGroupId === 'g1', '')
  assert('items[0].score = 2', payload.items[0].score === 2, `got: ${payload.items[0].score}`)
  assert('items[0].sectionTitle', payload.items[0].sectionTitle === '阅读理解 B', '')
  assert('items[0].note', payload.items[0].note === '重点', '')
  assert('layout exists', payload.layout != null, '')
  assert('layout.blocks.length = 4', payload.layout.blocks.length === 4, `got: ${payload.layout.blocks.length}`)
  assert('layout.questionNumberStart = 21', payload.layout.questionNumberStart === 21, '')
  assert('layout.printStyle = exam', payload.layout.printStyle === 'exam', '')
}

// Test 2: DOCX payload
console.log('\nTest 2: buildDocxPayload')
{
  const payload = buildDocxPayload(state)
  assert('title correct', payload.title === '2025 英语模拟', '')
  assert('versionType = student', payload.versionType === 'student', '')
  assert('printStyle = exam', payload.printStyle === 'exam', '')
  assert('questionNumberStart = 21', payload.questionNumberStart === 21, '')
  assert('items.length = 2', payload.items.length === 2, '')
  assert('blocks.length = 4', payload.blocks.length === 4, `got: ${payload.blocks?.length}`)
  assert('blocks[0] is section_header', payload.blocks[0].type === 'section_header', '')
  assert('blocks[1] is question_group with score', payload.blocks[1].type === 'question_group' && payload.blocks[1].score === 2, '')
  assert('blocks[1].sectionTitle from basket', payload.blocks[1].sectionTitle === '阅读理解 B', `got: ${payload.blocks[1].sectionTitle}`)
  assert('blocks[1].note from basket', payload.blocks[1].note === '重点', `got: ${payload.blocks[1].note}`)
  assert('blocks[2] is page_break', payload.blocks[2].type === 'page_break', '')
  assert('blocks[3] is question_group g2', payload.blocks[3].type === 'question_group' && payload.blocks[3].questionGroupId === 'g2', '')
}

// Test 3: PDF payload same as DOCX
console.log('\nTest 3: buildPdfPayload matches DOCX')
{
  const docx = buildDocxPayload(state)
  const pdf = buildPdfPayload(state)
  assert('same title', pdf.title === docx.title, '')
  assert('same versionType', pdf.versionType === docx.versionType, '')
  assert('same printStyle', pdf.printStyle === docx.printStyle, '')
  assert('same questionNumberStart', pdf.questionNumberStart === docx.questionNumberStart, '')
  assert('same blocks length', pdf.blocks?.length === docx.blocks?.length, '')
  assert('same items length', pdf.items.length === docx.items.length, '')
}

// Test 4: Empty title fallback
console.log('\nTest 4: Empty title fallback')
{
  const payload = buildSavePayload({ ...state, paperTitle: '  ' })
  assert('fallback title', payload.title === '未命名题集', `got: ${payload.title}`)
}

// Test 5: Handout style
console.log('\nTest 5: Handout style propagates')
{
  const payload = buildDocxPayload({ ...state, paperExportStyle: 'handout' })
  assert('printStyle = handout', payload.printStyle === 'handout', `got: ${payload.printStyle}`)
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
