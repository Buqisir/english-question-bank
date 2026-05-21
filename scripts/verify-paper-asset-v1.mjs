#!/usr/bin/env node
/**
 * Verification script for paper-asset-v1 fixture.
 * Run: node scripts/verify-paper-asset-v1.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function assertNot(condition, msg) {
  assert(!condition, msg);
}

// ─── Load fixture ───────────────────────────────────────────────────────────────

const fixturePath = resolve(ROOT, 'app/public/paper-assets/paper-2024-jslk-english/paper-asset.json');
assert(existsSync(fixturePath), 'Fixture file exists');

let asset;
try {
  const raw = readFileSync(fixturePath, 'utf8');
  asset = JSON.parse(raw);
  assert(true, 'Fixture parses as valid JSON');
} catch (e) {
  assert(false, `Fixture JSON parse error: ${e.message}`);
  console.error('\nCannot continue — fixture is not valid JSON.');
  process.exit(1);
}

// ─── Schema version ─────────────────────────────────────────────────────────────

assert(asset.schemaVersion === 'paper-asset-v1', 'schemaVersion is paper-asset-v1');

// ─── Top-level sections exist ───────────────────────────────────────────────────

const requiredKeys = ['paper', 'sources', 'layoutTree', 'content', 'answerKey', 'analysis'];
for (const k of requiredKeys) {
  assert(k in asset, `Top-level section "${k}" exists`);
}

// ─── Source DOCX ────────────────────────────────────────────────────────────────

const docxRelPath = asset.sources?.docx?.sourcePath;
assert(!!docxRelPath, 'sources.docx.sourcePath is defined');
const docxFullPath = resolve(ROOT, docxRelPath || '');
assert(existsSync(docxFullPath), `Source DOCX exists at repo-local path: ${docxRelPath}`);

if (existsSync(docxFullPath)) {
  const buf = readFileSync(docxFullPath);
  const hash = createHash('sha256').update(buf).digest('hex');
  assert(hash === asset.sources.docx.sha256, `Source DOCX sha256 matches (${hash.slice(0, 16)}...)`);
}

// ─── No forbidden fields ────────────────────────────────────────────────────────

function deepCheck(obj, path = '') {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => deepCheck(item, `${path}[${i}]`));
    return;
  }
  for (const [key, val] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    assertNot(key === 'unknown', `No "unknown" field at ${fullPath}`);
    assertNot(key === 'reviewFlags', `No "reviewFlags" field at ${fullPath}`);
    if (path.startsWith('analysis') || fullPath.includes('analysis')) {
      assertNot(key === 'correctAnswer', `No "correctAnswer" in analysis at ${fullPath}`);
    }
    deepCheck(val, fullPath);
  }
}
deepCheck(asset);

// ─── Paper metadata ─────────────────────────────────────────────────────────────

assert(typeof asset.paper.paperId === 'string' && asset.paper.paperId.length > 0, 'paper.paperId is stable string');
assert(typeof asset.paper.assetVersion === 'number', 'paper.assetVersion is number');

// ─── Layout Tree structure ──────────────────────────────────────────────────────

const parts = asset.layoutTree?.parts || [];
assert(parts.length >= 4, 'layoutTree has at least 4 parts');

const partIds = parts.map(p => p.partId);
assert(partIds.some(id => id.includes('listening')), 'Includes listening part');
assert(partIds.some(id => id.includes('reading')), 'Includes reading part');
assert(partIds.some(id => id.includes('language')), 'Includes language use part');
assert(partIds.some(id => id.includes('writing')), 'Includes writing part');

// Collect all groupIds from layoutTree
const layoutGroupIds = new Set();
for (const part of parts) {
  for (const section of part.sections || []) {
    for (const g of section.groups || []) {
      layoutGroupIds.add(g.groupId);
    }
  }
}

// ─── Content groups match layoutTree refs ───────────────────────────────────────

const contentGroupIds = new Set(Object.keys(asset.content.groups || {}));
for (const gid of layoutGroupIds) {
  assert(contentGroupIds.has(gid), `layoutTree group "${gid}" exists in content.groups`);
}

// ─── Reading A-D ────────────────────────────────────────────────────────────────

const readingGroups = ['group-2024-jslk-reading-a', 'group-2024-jslk-reading-b', 'group-2024-jslk-reading-c', 'group-2024-jslk-reading-d'];
for (const gid of readingGroups) {
  assert(contentGroupIds.has(gid), `Reading group "${gid}" exists`);
  const g = asset.content.groups[gid];
  if (g) {
    assert(g.passage && g.passage.paragraphs && g.passage.paragraphs.length > 0, `${gid} has passage paragraphs`);
    // Paragraph IDs unique within group
    const pIds = g.passage.paragraphs.map(p => p.paragraphId);
    const uniquePIds = new Set(pIds);
    assert(pIds.length === uniquePIds.size, `${gid} paragraph IDs are unique`);
  }
}

// Reading questions 21-35
const readingQuestionNos = [];
for (const gid of readingGroups) {
  const g = asset.content.groups[gid];
  if (g) {
    for (const qid of g.questionIds) {
      const q = asset.content.questions[qid];
      if (q) readingQuestionNos.push(q.questionNo);
    }
  }
}
readingQuestionNos.sort((a, b) => a - b);
assert(readingQuestionNos[0] === 21 && readingQuestionNos[readingQuestionNos.length - 1] === 35, 'Reading A-D covers Q21-35');
assert(readingQuestionNos.length === 15, 'Reading A-D has exactly 15 questions');

// Every reading choice question has A-D options
for (const gid of readingGroups) {
  const g = asset.content.groups[gid];
  if (g) {
    for (const qid of g.questionIds) {
      const q = asset.content.questions[qid];
      if (q) {
        assert(q.options && q.options.length === 4, `${qid} has 4 options`);
        const labels = (q.options || []).map(o => o.label).sort().join('');
        assert(labels === 'ABCD', `${qid} options are A-D`);
      }
    }
  }
}

// ─── 七选五 ─────────────────────────────────────────────────────────────────────

const sevenGroup = asset.content.groups['group-2024-jslk-seven-choices'];
assert(!!sevenGroup, '七选五 group exists');
if (sevenGroup) {
  assert(sevenGroup.optionBank && sevenGroup.optionBank.length === 7, '七选五 has A-G optionBank (7 items)');
  assert(sevenGroup.questionIds.length === 5, '七选五 has 5 questions');
  assert(sevenGroup.blankIds && sevenGroup.blankIds.length === 5, '七选五 has 5 blanks');
  for (const qid of sevenGroup.questionIds) {
    const q = asset.content.questions[qid];
    assert(q && q.blankId, `${qid} links to a blankId`);
  }
}

// ─── 完形填空 ───────────────────────────────────────────────────────────────────

const clozeGroup = asset.content.groups['group-2024-jslk-cloze'];
assert(!!clozeGroup, '完形 group exists');
if (clozeGroup) {
  assert(clozeGroup.questionIds.length === 15, '完形 has 15 questions (41-55)');
  assert(clozeGroup.blankIds && clozeGroup.blankIds.length === 15, '完形 has 15 blanks');
  for (const qid of clozeGroup.questionIds) {
    const q = asset.content.questions[qid];
    assert(q && q.blankId, `${qid} links to blankId`);
    assert(q && q.options && q.options.length === 4, `${qid} has A-D options`);
  }
  // Question numbers 41-55
  const clozeNos = clozeGroup.questionIds.map(qid => asset.content.questions[qid]?.questionNo).sort((a, b) => a - b);
  assert(clozeNos[0] === 41 && clozeNos[clozeNos.length - 1] === 55, '完形 covers Q41-55');
}

// ─── 语法填空 ───────────────────────────────────────────────────────────────────

const grammarGroup = asset.content.groups['group-2024-jslk-grammar-fill'];
assert(!!grammarGroup, '语法填空 group exists');
if (grammarGroup) {
  assert(grammarGroup.questionIds.length === 10, '语法填空 has 10 questions (56-65)');
  assert(grammarGroup.blankIds && grammarGroup.blankIds.length === 10, '语法填空 has 10 blanks');
  // Check prompt words exist for some blanks
  const blanks = asset.content.blanks || {};
  const hasPrompt = grammarGroup.blankIds.some(bid => blanks[bid]?.prompt);
  assert(hasPrompt, '语法填空 has at least one blank with prompt word');
  // Question numbers 56-65
  const gramNos = grammarGroup.questionIds.map(qid => asset.content.questions[qid]?.questionNo).sort((a, b) => a - b);
  assert(gramNos[0] === 56 && gramNos[gramNos.length - 1] === 65, '语法填空 covers Q56-65');
}

// ─── Writing tasks ──────────────────────────────────────────────────────────────

const writingTasks = asset.content.writingTasks || {};
assert('writing-2024-jslk-application' in writingTasks, '应用文 writing task exists');
assert('writing-2024-jslk-continuation' in writingTasks, '读后续写 writing task exists');

// ─── Content blocks checks ──────────────────────────────────────────────────────

const blocks = asset.content.blocks || [];
const blockTypes = blocks.map(b => b.type);
assert(blockTypes.includes('notice'), 'Blocks include notice');
assert(blockTypes.includes('instruction'), 'Blocks include instruction');
assert(blockTypes.includes('answerBox'), 'Blocks include answerBox');
assert(blockTypes.includes('pageBreakHint'), 'Blocks include pageBreakHint');
assert(blockTypes.includes('partHeading'), 'Blocks include partHeading');
assert(blockTypes.includes('sectionHeading'), 'Blocks include sectionHeading');
assert(blockTypes.includes('group'), 'Blocks include group');

// Verify all group block references exist in content.groups
for (const block of blocks) {
  if (block.type === 'group') {
    assert(contentGroupIds.has(block.groupId), `Block group ref "${block.groupId}" exists in content.groups`);
  }
}

// ─── ID uniqueness ──────────────────────────────────────────────────────────────

const allIds = new Set();
const questionIds = Object.keys(asset.content.questions || {});
const blankIds = Object.keys(asset.content.blanks || {});
const groupIds = Object.keys(asset.content.groups || {});
const writingTaskIds = Object.keys(writingTasks);
const partIdsAll = parts.map(p => p.partId);
const sectionIdsAll = parts.flatMap(p => (p.sections || []).map(s => s.sectionId));

const allIdArrays = [...questionIds, ...blankIds, ...groupIds, ...writingTaskIds, ...partIdsAll, ...sectionIdsAll];
let duplicateFound = false;
for (const id of allIdArrays) {
  if (allIds.has(id)) {
    duplicateFound = true;
    assert(false, `Duplicate ID found: ${id}`);
  }
  allIds.add(id);
}
if (!duplicateFound) {
  assert(true, 'All IDs are unique across questions/blanks/groups/parts/sections/writingTasks');
}

// ─── Prompts & docs existence ───────────────────────────────────────────────────

const productDocPath = resolve(ROOT, 'docs/product/paper-asset-v1.md');
assert(existsSync(productDocPath), 'Product doc exists: docs/product/paper-asset-v1.md');

if (existsSync(productDocPath)) {
  const docContent = readFileSync(productDocPath, 'utf8');
  assert(docContent.includes('content.blocks') || docContent.includes('blocks'), 'Product doc mentions content.blocks');
  assert(docContent.includes('answerKey'), 'Product doc mentions answerKey authority');
  assert(docContent.includes('stemTranslationZh'), 'Product doc mentions stemTranslationZh');
  assert(docContent.includes('optionTranslationZh'), 'Product doc mentions optionTranslationZh');
  assert(docContent.includes('locationParaphrases'), 'Product doc mentions locationParaphrases');
  assert(docContent.includes('sourceLexicalTrap'), 'Product doc mentions sourceLexicalTrap');
  assert(docContent.includes('polarityReversal'), 'Product doc mentions polarityReversal');
  assert(docContent.includes('unsupportedClaim'), 'Product doc mentions unsupportedClaim');
}

const extractPromptPath = resolve(ROOT, 'prompts/paper-asset-extract-v1.md');
const readingPromptPath = resolve(ROOT, 'prompts/reading-choice-analysis-v1.md');

assert(existsSync(extractPromptPath), 'Extraction prompt exists: prompts/paper-asset-extract-v1.md');
assert(existsSync(readingPromptPath), 'Reading analysis prompt exists: prompts/reading-choice-analysis-v1.md');

if (existsSync(extractPromptPath)) {
  const ep = readFileSync(extractPromptPath, 'utf8');
  assert(ep.includes('analysis') && (ep.includes('FORBIDDEN') || ep.includes('forbid') || ep.includes('DO NOT')), 'Extraction prompt forbids analysis generation');
}

if (existsSync(readingPromptPath)) {
  const rp = readFileSync(readingPromptPath, 'utf8');
  assert(rp.includes('correctAnswer') && (rp.includes('NOT') || rp.includes('forbid')), 'Reading prompt forbids correctAnswer output');
  assert(rp.includes('stemTranslationZh'), 'Reading prompt includes stemTranslationZh');
  assert(rp.includes('optionTranslationZh'), 'Reading prompt includes optionTranslationZh');
  assert(rp.includes('locationParaphrases'), 'Reading prompt includes locationParaphrases');
  assert(rp.includes('sourceLexicalTrap'), 'Reading prompt includes controlled trap type: sourceLexicalTrap');
  assert(rp.includes('polarityReversal'), 'Reading prompt includes controlled trap type: polarityReversal');
  assert(rp.includes('scopeShift'), 'Reading prompt includes controlled trap type: scopeShift');
  assert(rp.includes('entityMismatch'), 'Reading prompt includes controlled trap type: entityMismatch');
  assert(rp.includes('unsupportedClaim'), 'Reading prompt includes controlled trap type: unsupportedClaim');
  assert(rp.includes('NOT selectable') || rp.includes('not selectable') || rp.includes('NOT') && rp.includes('selectable'), 'Reading prompt includes unsupportedClaim non-interactive rule');
}

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error('\nFailed assertions:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
} else {
  console.log('\n  All assertions passed!');
  process.exit(0);
}
