#!/usr/bin/env node
/**
 * Verification: Paper layout persistence roundtrip.
 * Contract test: uses domain sanitizeLayout as canonical implementation.
 */

import { sanitizeLayout } from '../app/src/domain/paperLayout.ts'

// Wrapper matching server's sanitizePaperSetLayout interface
function sanitizePaperSetLayout(rawLayoutJson, items) {
  if (!rawLayoutJson) return { layout: null, layoutWarnings: [] }
  let parsed
  try { parsed = JSON.parse(rawLayoutJson) } catch { return { layout: null, layoutWarnings: ['布局数据解析失败，已忽略'] } }
  if (!parsed || !Array.isArray(parsed.blocks)) return { layout: null, layoutWarnings: [] }

  const { blocks, warnings } = sanitizeLayout(parsed.blocks, items)
  return {
    layout: {
      blocks,
      questionNumberStart: Number.isInteger(parsed.questionNumberStart) && parsed.questionNumberStart >= 1 ? parsed.questionNumberStart : 1,
      printStyle: parsed.printStyle === 'handout' ? 'handout' : 'exam',
    },
    layoutWarnings: warnings,
  }
}

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

console.log('=== Paper Layout Roundtrip Verification ===\n')

// Test 1: Full roundtrip with layout
console.log('Test 1: Layout roundtrip preserves blocks/questionNumberStart/printStyle')
{
  const layout = {
    blocks: [
      { id: 'sh1', type: 'section_header', title: '第一部分' },
      { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2 },
      { id: 'pb1', type: 'page_break' },
      { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.5 },
    ],
    questionNumberStart: 21,
    printStyle: 'handout',
  }
  const items = [
    { itemId: 'g1', score: 2, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 2.5, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('blocks preserved', result.blocks.length === 4, `got ${result.blocks.length}`)
  assert('section_header at 0', result.blocks[0].type === 'section_header', `got ${result.blocks[0].type}`)
  assert('g1 at 1', result.blocks[1].type === 'question_group' && result.blocks[1].questionGroupId === 'g1', '')
  assert('page_break at 2', result.blocks[2].type === 'page_break', '')
  assert('g2 at 3', result.blocks[3].type === 'question_group' && result.blocks[3].questionGroupId === 'g2', '')
  assert('questionNumberStart = 21', result.questionNumberStart === 21, `got ${result.questionNumberStart}`)
  assert('printStyle = handout', result.printStyle === 'handout', `got ${result.printStyle}`)
  assert('no warnings', layoutWarnings.length === 0, `got ${layoutWarnings}`)
}

// Test 2: No layout → fallback (returns null)
console.log('\nTest 2: No layout_json → null layout')
{
  const items = [{ itemId: 'g1', score: 2, questionGroup: { title: 'G1' } }]
  const { layout, layoutWarnings } = sanitizePaperSetLayout(null, items)
  assert('layout is null', layout === null, `got ${JSON.stringify(layout)}`)
  assert('no warnings', layoutWarnings.length === 0, '')
}

// Test 3: Layout missing a group that exists in paper_items → append + warning
console.log('\nTest 3: Layout missing paper_items group → append to end')
{
  const layout = {
    blocks: [{ id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2 }],
    questionNumberStart: 1,
    printStyle: 'exam',
  }
  const items = [
    { itemId: 'g1', score: 2, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 3, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('blocks = 2 (g1 + appended g2)', result.blocks.length === 2, `got ${result.blocks.length}`)
  assert('g1 at 0', result.blocks[0].questionGroupId === 'g1', '')
  assert('g2 appended at 1', result.blocks[1].questionGroupId === 'g2', `got ${result.blocks[1]?.questionGroupId}`)
  assert('1 warning about missing group', layoutWarnings.length === 1, `got ${layoutWarnings.length}`)
  assert('warning mentions Group 2', layoutWarnings[0].includes('Group 2'), `got: ${layoutWarnings[0]}`)
}

// Test 4: Layout references invalid/deleted group → filter + warning
console.log('\nTest 4: Layout references deleted group → filter out + warning')
{
  const layout = {
    blocks: [
      { id: 'sh1', type: 'section_header', title: 'Header' },
      { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2 },
      { id: 'block-deleted', type: 'question_group', questionGroupId: 'deleted-id', score: 1 },
      { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.5 },
    ],
    questionNumberStart: 5,
    printStyle: 'exam',
  }
  const items = [
    { itemId: 'g1', score: 2, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 2.5, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('blocks = 3 (sh + g1 + g2, deleted removed)', result.blocks.length === 3, `got ${result.blocks.length}`)
  assert('section_header preserved', result.blocks[0].type === 'section_header', '')
  assert('g1 at 1', result.blocks[1].questionGroupId === 'g1', '')
  assert('g2 at 2', result.blocks[2].questionGroupId === 'g2', '')
  assert('1 warning about deleted group', layoutWarnings.length === 1, `got ${layoutWarnings.length}`)
  assert('warning mentions deleted-id', layoutWarnings[0].includes('deleted-id'), `got: ${layoutWarnings[0]}`)
  assert('questionNumberStart = 5', result.questionNumberStart === 5, '')
}

// Test 5: Invalid JSON → null layout + warning
console.log('\nTest 5: Invalid JSON → null + warning')
{
  const { layout, layoutWarnings } = sanitizePaperSetLayout('not valid json{', [])
  assert('layout is null', layout === null, '')
  assert('1 warning', layoutWarnings.length === 1, `got ${layoutWarnings.length}`)
}

// Test 6: Layout score overridden by paper_items score
console.log('\nTest 6: Layout stale score overridden by paper_items score')
{
  const layout = {
    blocks: [
      { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 1.5 },
      { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.0 },
    ],
    questionNumberStart: 1,
    printStyle: 'exam',
  }
  const items = [
    { itemId: 'g1', score: 3, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 4, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('g1 score = 3 (from paper_items, not layout 1.5)', result.blocks[0].score === 3, `got ${result.blocks[0].score}`)
  assert('g2 score = 4 (from paper_items, not layout 2.0)', result.blocks[1].score === 4, `got ${result.blocks[1].score}`)
  assert('no warnings', layoutWarnings.length === 0, `got ${layoutWarnings.length}`)
}

// Test 7: Duplicate question_group in layout → keep first, remove rest + warning
console.log('\nTest 7: Duplicate question_group blocks filtered with warning')
{
  const layout = {
    blocks: [
      { id: 'block-g1-a', type: 'question_group', questionGroupId: 'g1', score: 2 },
      { id: 'pb1', type: 'page_break' },
      { id: 'block-g1-b', type: 'question_group', questionGroupId: 'g1', score: 2 },
      { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.5 },
    ],
    questionNumberStart: 1,
    printStyle: 'exam',
  }
  const items = [
    { itemId: 'g1', score: 2, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 2.5, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('blocks = 3 (g1 + pb + g2, duplicate g1 removed)', result.blocks.length === 3, `got ${result.blocks.length}`)
  assert('first g1 kept at 0', result.blocks[0].questionGroupId === 'g1', '')
  assert('page_break at 1', result.blocks[1].type === 'page_break', `got ${result.blocks[1].type}`)
  assert('g2 at 2', result.blocks[2].questionGroupId === 'g2', '')
  assert('1 warning about duplicate', layoutWarnings.length === 1, `got ${layoutWarnings.length}`)
  assert('warning mentions duplicate', layoutWarnings[0].includes('重复'), `got: ${layoutWarnings[0]}`)
}

// Test 8: Blocks missing id get stable fallback ids (aligned with server format)
console.log('\nTest 8: Blocks missing id get stable fallback ids')
{
  const layout = {
    blocks: [
      { type: 'section_header', title: 'No ID Header' },
      { type: 'question_group', questionGroupId: 'g1', score: 2 },
      { type: 'page_break' },
      { id: 'has-id', type: 'question_group', questionGroupId: 'g2', score: 2.5 },
    ],
    questionNumberStart: 1,
    printStyle: 'exam',
  }
  const items = [
    { itemId: 'g1', score: 2, questionGroup: { title: 'Group 1' } },
    { itemId: 'g2', score: 2.5, questionGroup: { title: 'Group 2' } },
  ]
  const { layout: result, layoutWarnings } = sanitizePaperSetLayout(JSON.stringify(layout), items)
  assert('all blocks have id', result.blocks.every(b => b.id && b.id.length > 0), `ids: ${result.blocks.map(b => b.id)}`)
  // section_header at position 0 → layout-block-1
  assert('section_header gets layout-block-1', result.blocks[0].id === 'layout-block-1', `got: ${result.blocks[0].id}`)
  // question_group without id → block-{questionGroupId}
  assert('g1 gets block-g1', result.blocks[1].id === 'block-g1', `got: ${result.blocks[1].id}`)
  // page_break at position 2 (after 2 blocks already pushed) → layout-block-3
  assert('page_break gets layout-block-3', result.blocks[2].id === 'layout-block-3', `got: ${result.blocks[2].id}`)
  // g2 keeps existing id
  assert('g2 keeps existing id', result.blocks[3].id === 'has-id', `got: ${result.blocks[3].id}`)
  assert('no warnings', layoutWarnings.length === 0, `got ${layoutWarnings.length}`)
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
