#!/usr/bin/env node
/**
 * Verification script for calibratedDifficultyPreview service.
 * Tests: T2 uplift, T3 word_meaning_context_load, T10 low confidence,
 *        high_ceiling_watch, no-reason unchanged.
 */

import { computeCalibrationPreview } from '../app/src/services/difficultyCalibration.ts'

function calibrate(input) {
  const result = computeCalibrationPreview(input)
  if (!result) throw new Error('Expected calibration preview, got null')
  return result
}

// --- Test cases ---

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}: ${detail}`)
  }
}

console.log('=== Calibration Preview Verification ===\n')

// Test 1: T2 uplift — hidden blocker audit raises score
console.log('Test 1: T2 uplift (t2_hidden_blocker_audit)')
{
  const input = {
    aiDifficultyScore: 3, // maps to raw 2
    surfaceType: 'single_detail_normal',
    answeringMove: 'direct_locating',
    tCardId: 'T2',
    mainBlockers: ['vocab', 'distractor'],
  }
  const r = calibrate(input)
  assert('raw score is 2', r.rawScore === 2, `got ${r.rawScore}`)
  assert('calibrated is 3', r.calibratedScore === 3, `got ${r.calibratedScore}`)
  assert('has t2_hidden_blocker_audit', r.reasons.includes('t2_hidden_blocker_audit'), `reasons: ${r.reasons}`)
  assert('label shows score change', r.displayLabel === '校正建议 2 → 3', `label: ${r.displayLabel}`)
}

// Test 2: T3 word_meaning_context_load
console.log('\nTest 2: T3 word_meaning_context_load')
{
  const input = {
    aiDifficultyScore: 4, // maps to raw 2
    surfaceType: 'word_meaning',
    answeringMove: 'context_guessing',
    tCardId: 'T3',
    mainBlockers: ['syntax'],
    stem: 'What does "it" refer to in line 5?',
  }
  const r = calibrate(input)
  assert('raw score is 2', r.rawScore === 2, `got ${r.rawScore}`)
  assert('has word_meaning_context_load', r.reasons.includes('word_meaning_context_load'), `reasons: ${r.reasons}`)
  assert('calibrated >= 3', r.calibratedScore >= 3, `got ${r.calibratedScore}`)
}

// Test 3: T10 low confidence (possible overestimate)
console.log('\nTest 3: T10 low confidence')
{
  const input = {
    aiDifficultyScore: 8, // maps to raw 4
    surfaceType: 'attitude_tone',
    answeringMove: 'coverage_test',
    tCardId: 'T10',
    mainBlockers: ['abstraction'],
  }
  const r = calibrate(input)
  assert('raw score is 4', r.rawScore === 4, `got ${r.rawScore}`)
  assert('has t10_possible_overestimate', r.reasons.includes('t10_possible_overestimate'), `reasons: ${r.reasons}`)
  assert('calibrated < raw', r.calibratedScore < r.rawScore, `calibrated=${r.calibratedScore}, raw=${r.rawScore}`)
  assert('has low-confidence watch flag', r.watchFlags.some(f => f.code === 't10_possible_overestimate'), `flags: ${JSON.stringify(r.watchFlags)}`)
}

// Test 4: high_ceiling_watch — does NOT auto score 5
console.log('\nTest 4: high_ceiling_watch (no auto 5)')
{
  const input = {
    aiDifficultyScore: 7, // maps to raw 4
    surfaceType: 'passage_main_idea',
    answeringMove: 'coverage_test',
    tCardId: 'T5',
    mainBlockers: ['vocab', 'abstraction'],
  }
  const r = calibrate(input)
  assert('has high_ceiling_watch', r.reasons.includes('high_ceiling_watch'), `reasons: ${r.reasons}`)
  assert('calibrated is NOT 5', r.calibratedScore !== 5, `got ${r.calibratedScore}`)
  assert('calibrated <= 4', r.calibratedScore <= 4, `got ${r.calibratedScore}`)
  assert('has high-ceiling watch flag', r.watchFlags.some(f => f.code === 'high_ceiling_watch'), `flags: ${JSON.stringify(r.watchFlags)}`)
}

// Test 5: No reasons, unchanged score
console.log('\nTest 5: No reasons + unchanged score')
{
  const input = {
    aiDifficultyScore: 6, // maps to raw 3
    surfaceType: 'single_detail_normal',
    answeringMove: 'direct_locating',
    tCardId: 'T1',
    mainBlockers: [],
  }
  const r = calibrate(input)
  assert('raw score is 3', r.rawScore === 3, `got ${r.rawScore}`)
  assert('calibrated equals raw', r.calibratedScore === r.rawScore, `calibrated=${r.calibratedScore}`)
  assert('no reasons', r.reasons.length === 0, `reasons: ${r.reasons}`)
  assert('label marks raw-only preview', r.displayLabel === '未触发校正规则，仅为原始分', `label: ${r.displayLabel}`)
}

// Test 6: deepseekMappedDifficulty overrides aiDifficultyScore mapping
console.log('\nTest 6: deepseekMappedDifficulty overrides ceil(aiDifficultyScore/2)')
{
  // aiDifficultyScore=4 would map to ceil(4/2)=2 via fallback,
  // but deepseekMappedDifficulty=3 should take priority as rawScore.
  const input = {
    aiDifficultyScore: 4,
    deepseekMappedDifficulty: 3,
    surfaceType: 'single_detail_normal',
    answeringMove: 'direct_locating',
    tCardId: 'T1',
    mainBlockers: [],
  }
  const r = calibrate(input)
  assert('rawScore uses deepseekMappedDifficulty (3), not ceil(4/2)=2', r.rawScore === 3, `got ${r.rawScore}`)
  assert('calibrated equals rawScore when no rules fire', r.calibratedScore === 3, `got ${r.calibratedScore}`)
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)