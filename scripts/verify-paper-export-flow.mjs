#!/usr/bin/env node
/**
 * Verification: Paper export flow module structure.
 * Tests that usePaperExports hook module exports correct interface
 * and that payload assembly is delegated (not duplicated).
 */

import { buildSavePayload, buildPrintPayload } from '../app/src/paperAssembly/paperExportPayload.ts'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

console.log('=== Paper Export Flow Verification ===\n')

const state = {
  basket: [
    { id: 'g1', score: 2, questionCount: 4, sectionTitle: '阅读 B', note: '', title: 'G1', groupType: 'reading', defaultScore: 2 },
  ],
  paperBlocks: [
    { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2 },
  ],
  questionNumberStart: 1,
  paperExportStyle: 'exam',
  paperTitle: 'Test Paper',
  versionType: 'student',
}

// Test 1: the supported Print payload preserves the full paper request shape.
console.log('Test 1: Print payload shape')
{
  const print = buildPrintPayload(state)
  assert('title', print.title === state.paperTitle, '')
  assert('versionType', print.versionType === state.versionType, '')
  assert('printStyle', print.printStyle === state.paperExportStyle, '')
  assert('questionNumberStart', print.questionNumberStart === state.questionNumberStart, '')
  assert('blocks count', print.blocks?.length === state.paperBlocks.length, '')
  assert('items count', print.items.length === state.basket.length, '')
}

// Test 2: buildSavePayload includes layout but not versionType/printStyle at top level
console.log('\nTest 2: Save payload structure')
{
  const save = buildSavePayload(state)
  assert('has title', save.title === 'Test Paper', '')
  assert('has items', save.items.length === 1, '')
  assert('has layout', save.layout != null, '')
  assert('layout has blocks', save.layout.blocks.length === 1, '')
  assert('layout has questionNumberStart', save.layout.questionNumberStart === 1, '')
  assert('layout has printStyle', save.layout.printStyle === 'exam', '')
  assert('no versionType at top level', !('versionType' in save), '')
}

// Test 3: Empty basket produces valid but empty payloads
console.log('\nTest 3: Empty basket payloads')
{
  const emptyState = { ...state, basket: [], paperBlocks: [] }
  const print = buildPrintPayload(emptyState)
  assert('empty items', print.items.length === 0, `got ${print.items.length}`)
  assert('empty blocks', print.blocks?.length === 0, `got ${print.blocks?.length}`)
}

// Test 4: Payload delegates to paperLayout (blocks have sectionTitle/note from basket)
console.log('\nTest 4: Payload enriches blocks from basket')
{
  const richState = {
    ...state,
    basket: [{ id: 'g1', score: 3, questionCount: 4, sectionTitle: '阅读理解 C', note: '重点复习', title: 'G1', groupType: 'reading', defaultScore: 2 }],
  }
  const print = buildPrintPayload(richState)
  const qgBlock = print.blocks?.find(b => b.type === 'question_group')
  assert('block has sectionTitle from basket', qgBlock?.sectionTitle === '阅读理解 C', `got: ${qgBlock?.sectionTitle}`)
  assert('block has note from basket', qgBlock?.note === '重点复习', `got: ${qgBlock?.note}`)
  assert('block has score from paperBlocks', qgBlock?.score === 2, `got: ${qgBlock?.score}`)
}

// Test 5: Hook module file exists and exports are structurally correct
console.log('\nTest 5: usePaperExports module structure')
{
  // We can't fully import the hook in Node (it imports from services/questionGroups
  // which has non-.ts imports). Verify the file exists and the barrel exports it.
  const { existsSync } = await import('node:fs')
  const hookPath = new URL('../app/src/paperAssembly/usePaperExports.ts', import.meta.url).pathname
  assert('usePaperExports.ts exists', existsSync(hookPath), '')
  const content = (await import('node:fs')).readFileSync(hookPath, 'utf8')
  assert('exports usePaperExports function', content.includes('export function usePaperExports'), '')
  assert('imports renderer-neutral buildPrintPayload', content.includes('buildPrintPayload'), '')
  assert('does not import a DOCX-named payload', !content.includes('buildDocxPayload'), '')
  assert('does not import obsolete converted-PDF payload', !content.includes('buildPdfPayload'), '')
  assert('has no generated-DOCX or converted-PDF action', !/exportDocx|exportPdf/.test(content), '')
  assert('has resetExportStatuses', content.includes('resetExportStatuses'), '')
  assert('has downloadBlob helper', content.includes('downloadBlob'), '')
  assert('has no unused export callback extension point', !content.includes('onPdfExported'), '')
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
