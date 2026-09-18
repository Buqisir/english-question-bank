#!/usr/bin/env node
/**
 * Verification: rebuildBlocks preserves non-group block interleaving
 * (section_header / page_break stay in place) when the basket changes.
 *
 * Contract test: uses domain rebuildBlocks.
 */

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail}`) }
}

console.log('=== Paper Block Layout Verification ===\n')

console.log('Test: rebuildBlocksFromBasket preserves interleaving')
{
  // Contract test: uses domain rebuildBlocks
  const { rebuildBlocks: domainRebuild } = await import('../app/src/domain/paperLayout.ts')

  const oldBlocks = [
    { id: 'sh1', type: 'section_header', title: '第一部分' },
    { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2, questionCount: 4 },
    { id: 'pb1', type: 'page_break' },
    { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 2.5, questionCount: 5 },
  ]

  // Add g3 to basket (g1, g2 remain)
  const newItems = [
    { id: 'g1', score: 2, questionCount: 4 },
    { id: 'g2', score: 2.5, questionCount: 5 },
    { id: 'g3', score: 3, questionCount: 3 },
  ]

  const rebuilt = domainRebuild(oldBlocks, newItems)
  assert('section_header stays at index 0', rebuilt[0].type === 'section_header' && rebuilt[0].id === 'sh1', `got ${rebuilt[0]?.type} ${rebuilt[0]?.id}`)
  assert('g1 stays at index 1', rebuilt[1].type === 'question_group' && rebuilt[1].questionGroupId === 'g1', `got ${rebuilt[1]?.type} ${rebuilt[1]?.questionGroupId}`)
  assert('page_break stays at index 2', rebuilt[2].type === 'page_break' && rebuilt[2].id === 'pb1', `got ${rebuilt[2]?.type} ${rebuilt[2]?.id}`)
  assert('g2 stays at index 3', rebuilt[3].type === 'question_group' && rebuilt[3].questionGroupId === 'g2', `got ${rebuilt[3]?.type} ${rebuilt[3]?.questionGroupId}`)
  assert('g3 appended at index 4', rebuilt[4].type === 'question_group' && rebuilt[4].questionGroupId === 'g3', `got ${rebuilt[4]?.type} ${rebuilt[4]?.questionGroupId}`)
  assert('total blocks = 5', rebuilt.length === 5, `got ${rebuilt.length}`)

  // Remove g1 from basket
  const newItems2 = [
    { id: 'g2', score: 2.5, questionCount: 5 },
  ]
  const rebuilt2 = domainRebuild(oldBlocks, newItems2)
  assert('after remove g1: section_header at 0', rebuilt2[0].type === 'section_header', `got ${rebuilt2[0]?.type}`)
  assert('after remove g1: page_break at 1', rebuilt2[1].type === 'page_break', `got ${rebuilt2[1]?.type}`)
  assert('after remove g1: g2 at 2', rebuilt2[2].type === 'question_group' && rebuilt2[2].questionGroupId === 'g2', `got ${rebuilt2[2]?.type}`)
  assert('after remove g1: total = 3', rebuilt2.length === 3, `got ${rebuilt2.length}`)
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
