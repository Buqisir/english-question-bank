#!/usr/bin/env node
/**
 * Verification: Paper block numbering is continuous across the entire paper.
 * section_header does NOT reset numbering.
 *
 * Fixture: two reading question_groups (4 and 5 questions), start=21,
 * with a section_header between them.
 * Expected: group1 = 21-24, group2 = 25-29.
 */

const blocks = [
  { id: 'b1', type: 'question_group', questionGroupId: 'g1', score: 2, questionCount: 4 },
  { id: 'b2', type: 'section_header', title: '第二节 七选五' },
  { id: 'b3', type: 'question_group', questionGroupId: 'g2', score: 2.5, questionCount: 5 },
]

const questionNumberStart = 21

// Contract test: uses domain computeQuestionNumbers as canonical implementation
import { computeQuestionNumbers } from '../app/src/domain/paperLayout.ts'

function computeBlockNumbers(blocks, start) {
  const countMap = new Map(blocks.filter(b => b.type === 'question_group').map(b => [b.questionGroupId, b.questionCount]))
  return computeQuestionNumbers(blocks, start, (gid) => countMap.get(gid) || 0)
}

const numbered = computeBlockNumbers(blocks, questionNumberStart)

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail}`) }
}

console.log('=== Paper Block Numbering Verification ===\n')

const g1 = numbered.find(b => b.blockId === 'b1')
const sh = numbered.find(b => b.blockId === 'b2')
const g2 = numbered.find(b => b.blockId === 'b3')

console.log('Test: Two reading groups, start=21, section_header between them')
assert('group1 starts at 21', g1.startNum === 21, `got ${g1.startNum}`)
assert('group1 ends at 24', g1.endNum === 24, `got ${g1.endNum}`)
assert('section_header has no numbers', sh.startNum === null && sh.endNum === null, `got ${sh.startNum}-${sh.endNum}`)
assert('group2 starts at 25 (not reset)', g2.startNum === 25, `got ${g2.startNum}`)
assert('group2 ends at 29', g2.endNum === 29, `got ${g2.endNum}`)

console.log('\nTest: page_break also does not reset')
const blocksWithPB = [
  { id: 'x1', type: 'question_group', questionGroupId: 'a', score: 2, questionCount: 3 },
  { id: 'x2', type: 'page_break' },
  { id: 'x3', type: 'question_group', questionGroupId: 'b', score: 2, questionCount: 2 },
]
const numbered2 = computeBlockNumbers(blocksWithPB, 1)
const a = numbered2.find(b => b.blockId === 'x1')
const b = numbered2.find(b => b.blockId === 'x3')
assert('first group 1-3', a.startNum === 1 && a.endNum === 3, `got ${a.startNum}-${a.endNum}`)
assert('second group 4-5 after page_break', b.startNum === 4 && b.endNum === 5, `got ${b.startNum}-${b.endNum}`)

console.log('\nTest: rebuildBlocksFromBasket preserves interleaving')
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
