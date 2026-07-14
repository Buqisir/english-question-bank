#!/usr/bin/env node
/**
 * Verification script for paper-asset-v1 fixture.
 * Run: node scripts/verify-paper-asset-v1.mjs
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 * DOCX text is extracted via built-in zlib (ZIP local-file parsing) + regex on word/document.xml.
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { inflateRawSync } from 'zlib';

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


// ─── DOCX text extraction (pure Node.js, no external deps) ──────────────────────

/**
 * Extract all text from a .docx file by reading word/document.xml from the ZIP.
 * Uses only Node.js built-in zlib (inflateRawSync) for decompression.
 * Returns the full concatenated text with paragraph boundaries as newlines.
 */
function extractDocxText(docxPath) {
  const buf = readFileSync(docxPath);
  const xmlContent = readZipEntry(buf, 'word/document.xml');
  if (!xmlContent) {
    throw new Error('Could not find word/document.xml inside DOCX ZIP');
  }
  // Parse paragraphs: split on <w:p ...> boundaries, extract <w:t ...>text</w:t> within each
  const paragraphs = [];
  // Split by paragraph open tags
  const paraChunks = xmlContent.split(/<w:p[\s>]/);
  for (let i = 1; i < paraChunks.length; i++) {
    const chunk = paraChunks[i];
    // Extract all <w:t> text nodes within this paragraph
    const textParts = [];
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = wtRegex.exec(chunk)) !== null) {
      textParts.push(decodeXmlEntities(m[1]));
    }
    if (textParts.length > 0) {
      paragraphs.push(textParts.join(''));
    }
  }
  return paragraphs.join('\n');
}


/**
 * Read a single file entry from a ZIP buffer (minimal ZIP local-file-header parser).
 * Supports both STORED and DEFLATED entries.
 */
function readZipEntry(zipBuf, targetName) {
  let offset = 0;
  while (offset < zipBuf.length - 4) {
    const sig = zipBuf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Not a local file header
    const method = zipBuf.readUInt16LE(offset + 8);
    const compSize = zipBuf.readUInt32LE(offset + 18);
    const uncompSize = zipBuf.readUInt32LE(offset + 22);
    const nameLen = zipBuf.readUInt16LE(offset + 26);
    const extraLen = zipBuf.readUInt16LE(offset + 28);
    const name = zipBuf.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;

    if (name === targetName) {
      const compressed = zipBuf.subarray(dataStart, dataStart + compSize);
      if (method === 0) {
        // STORED
        return compressed.toString('utf8');
      } else if (method === 8) {
        // DEFLATED
        const decompressed = inflateRawSync(compressed);
        return decompressed.toString('utf8');
      } else {
        throw new Error(`Unsupported ZIP method ${method} for ${name}`);
      }
    }
    offset = dataStart + compSize;
  }
  return null;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}


// ─── Normalization for source matching ──────────────────────────────────────────

/**
 * Normalize for source matching: normalize punctuation then REMOVE all whitespace.
 * This makes matching robust against DOCX spacing artifacts.
 */
function normalizeForSourceMatch(s) {
  return s
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u00a0/g, ' ')  // NBSP → space
    .replace(/\s+/g, '')      // Remove ALL whitespace
    .toLowerCase();
}

// ─── Load fixture ───────────────────────────────────────────────────────────────

const fixturePath = resolve(ROOT, 'test-fixtures/paper-assets/paper-2024-jslk-english/paper-asset.json');
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
  const clozeNos = clozeGroup.questionIds.map(qid => asset.content.questions[qid]?.questionNo).sort((a, b) => a - b);
  assert(clozeNos[0] === 41 && clozeNos[clozeNos.length - 1] === 55, '完形 covers Q41-55');
}


// ─── 语法填空 ───────────────────────────────────────────────────────────────────

const grammarGroup = asset.content.groups['group-2024-jslk-grammar-fill'];
assert(!!grammarGroup, '语法填空 group exists');
if (grammarGroup) {
  assert(grammarGroup.questionIds.length === 10, '语法填空 has 10 questions (56-65)');
  assert(grammarGroup.blankIds && grammarGroup.blankIds.length === 10, '语法填空 has 10 blanks');
  const blanks = asset.content.blanks || {};
  const hasPrompt = grammarGroup.blankIds.some(bid => blanks[bid]?.prompt);
  assert(hasPrompt, '语法填空 has at least one blank with prompt word');
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
  assert(docContent.includes('JSON 文件输出标准'), 'Product doc defines external AI JSON file output standard');
  assert(docContent.includes('首字符必须是 `{`，末字符必须是 `}`'), 'Product doc requires raw JSON object output boundaries');
  assert(docContent.includes('不得输出顶层 `status`'), 'Product doc forbids top-level status wrapper for analysis files');
  assert(docContent.includes('信息足够时必须立即生成 JSON 文件正文'), 'Product doc requires immediate JSON output when information is sufficient');
  assert(docContent.includes('不做题目解析以外的无意义思考'), 'Product doc forbids unrelated deliberation in external AI output');
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
  assert(rp.includes('NOT selectable') || rp.includes('not selectable') || (rp.includes('NOT') && rp.includes('selectable')), 'Reading prompt includes unsupportedClaim non-interactive rule');
  assert(rp.includes('JSON file output contract'), 'Reading prompt defines JSON file output contract');
  assert(rp.includes('suitable to save') && rp.includes('reading-choice-analysis-v1.json'), 'Reading prompt frames output as saveable JSON file content');
  assert(rp.includes('downloadable `.json`'), 'Reading prompt asks for downloadable JSON file when supported');
  assert(rp.includes('Schema obedience rule'), 'Reading prompt defines schema obedience rule');
  assert(rp.includes('The first character of the response MUST be `{`'), 'Reading prompt requires first character to be raw JSON object start');
  assert(rp.includes('The final character of the response MUST be `}`'), 'Reading prompt requires final character to be raw JSON object end');
  assert(rp.includes('If the supplied passage, questions, options, and answerKey are sufficient'), 'Reading prompt defines sufficient-information fast-output condition');
  assert(rp.includes('MUST generate the JSON file immediately'), 'Reading prompt requires immediate generation when sufficient');
  assert(rp.includes('MUST NOT output reasoning steps'), 'Reading prompt forbids outputting reasoning steps');
  assert(rp.includes('**DO NOT** output `status`'), 'Reading prompt forbids top-level status wrapper');
  assert(rp.includes('**DO NOT** output a top-level `analysis` wrapper'), 'Reading prompt forbids top-level analysis wrapper');
  assert(rp.includes('**DO NOT** output `answer` inside question analysis'), 'Reading prompt forbids question-level answer field');
  assert(rp.includes('**DO NOT** output `questionId`, `groupId`, `questionNumber`, `stem`, or `optionText` inside question analysis'), 'Reading prompt forbids duplicated question fields');
  assert(rp.includes('`skill` must be an object'), 'Reading prompt locks skill object shape');
  assert(rp.includes('Do not use `conditionDrop`; use `conditionRemoved`'), 'Reading prompt forbids conditionDrop enum drift');
  assert(rp.includes('Do not use `scopeNarrowing`; use `understatement`'), 'Reading prompt forbids scopeNarrowing enum drift');
  assert(rp.includes('Do not use `valueReversal`'), 'Reading prompt forbids valueReversal enum drift');
  assert(rp.includes('Do not use `inferenceBridge`; choose `paraphrase` or `locationCue`'), 'Reading prompt forbids inferenceBridge enum drift');
  assert(rp.includes('do not use `semantic`'), 'Reading prompt forbids semantic matchType drift');
  assertNot(rp.includes('"status": "ok"'), 'Reading prompt no longer includes old status ok wrapper');
  assertNot(rp.includes('"status": "failed"'), 'Reading prompt no longer includes old status failed wrapper');
}


// ─── Source-faithfulness checks (NON-SKIPPABLE) ─────────────────────────────────

// 1. No string value may contain literal "..." as truncation
function findEllipsis(obj, path = '') {
  const results = [];
  if (obj === null || obj === undefined) return results;
  if (typeof obj === 'string') {
    if (obj.includes('...')) results.push(path);
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => results.push(...findEllipsis(item, `${path}[${i}]`)));
  } else if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      results.push(...findEllipsis(val, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

const ellipsisPaths = findEllipsis(asset);
assert(ellipsisPaths.length === 0, `No "..." truncation in any string value (found ${ellipsisPaths.length}: ${ellipsisPaths.slice(0, 3).join(', ')})`);

// 2. Extract DOCX text using built-in Node.js ZIP parsing — MUST NOT be skipped
let docxNormalizedText = '';
assert(existsSync(docxFullPath), 'Source DOCX must exist for source-faithfulness extraction');

try {
  const rawDocxText = extractDocxText(docxFullPath);
  assert(rawDocxText.length > 1000, `DOCX extraction produced substantial text (${rawDocxText.length} chars)`);
  docxNormalizedText = normalizeForSourceMatch(rawDocxText);
} catch (e) {
  assert(false, `DOCX text extraction FAILED (non-skippable): ${e.message}`);
  console.error('\nCannot continue — source-faithfulness checks require DOCX text extraction.');
  process.exit(1);
}


// Helper: assert text is contained in normalized DOCX source (whitespace-stripped match)
function assertInSource(text, label) {
  const normText = normalizeForSourceMatch(text);
  assert(docxNormalizedText.includes(normText), `${label} full text found in DOCX source`);
}

// 3. Reading A-D paragraph texts must be found in normalized DOCX
for (const gid of readingGroups) {
  const g = asset.content.groups[gid];
  if (g && g.passage && g.passage.paragraphs) {
    for (const para of g.passage.paragraphs) {
      if (para.text && para.text.length > 10) {
        assertInSource(para.text, `${gid} para "${para.paragraphId}"`);
      }
    }
  }
}

// 4. 七选五 group must have passage paragraphs and each must be in DOCX
const sevenPassage = asset.content.groups['group-2024-jslk-seven-choices']?.passage;
assert(!!sevenPassage, '七选五 has passage object');
assert(sevenPassage && sevenPassage.paragraphs && sevenPassage.paragraphs.length > 0, '七选五 has passage paragraphs');
if (sevenPassage && sevenPassage.paragraphs) {
  for (const para of sevenPassage.paragraphs) {
    if (para.text && para.text.length > 10) {
      assertInSource(para.text, `七选五 para "${para.paragraphId}"`);
    }
  }
}

// 5. clozeText must be found in DOCX
const clozeText = asset.content.groups['group-2024-jslk-cloze']?.clozeText;
assert(!!clozeText && clozeText.length > 100, '完形 clozeText is substantial (>100 chars)');
if (clozeText) assertInSource(clozeText, '完形 clozeText');

// 6. grammarText must be found in DOCX
const grammarText = asset.content.groups['group-2024-jslk-grammar-fill']?.grammarText;
assert(!!grammarText && grammarText.length > 100, '语法填空 grammarText is substantial (>100 chars)');
if (grammarText) assertInSource(grammarText, '语法填空 grammarText');

// 7. 读后续写 materialText must be found in DOCX
const contTask = asset.content.writingTasks['writing-2024-jslk-continuation'];
const materialText = contTask?.materialText;
assert(!!materialText && materialText.length > 100, '读后续写 materialText is substantial (>100 chars)');
if (materialText) assertInSource(materialText, '读后续写 materialText');


// 8. Grammar blanks prompt words
const expectedPrompts = {
  'blank-2024-jslk-056': 'keyboard',
  'blank-2024-jslk-057': 'be',
  'blank-2024-jslk-059': 'use',
  'blank-2024-jslk-060': 'simple',
  'blank-2024-jslk-062': 'improve',
  'blank-2024-jslk-064': 'stay',
  'blank-2024-jslk-065': 'they'
};
for (const [bid, expectedPrompt] of Object.entries(expectedPrompts)) {
  const blank = asset.content.blanks[bid];
  assert(blank && blank.prompt === expectedPrompt, `${bid} has prompt "${expectedPrompt}" (got "${blank?.prompt}")`);
}
const noPromptBlanks = ['blank-2024-jslk-058', 'blank-2024-jslk-061', 'blank-2024-jslk-063'];
for (const bid of noPromptBlanks) {
  const blank = asset.content.blanks[bid];
  assert(!blank?.prompt, `${bid} has no prompt (fill-in-word blank)`);
}

// ─── Anti-regression: verify this script has no forbidden patterns ───────────────

const selfSource = readFileSync(resolve(ROOT, 'scripts/verify-paper-asset-v1.mjs'), 'utf8');
// Use split-string technique so the check strings don't match themselves in source
const FORBIDDEN_IMPORT = 'from docx import ' + 'Document';
const FORBIDDEN_PKG = 'python' + '-docx';
const FORBIDDEN_SKIP = 'Skipping source-faithfulness' + ' checks';
assertNot(selfSource.includes(FORBIDDEN_IMPORT), 'Script does not use python docx import');
assertNot(selfSource.includes(FORBIDDEN_PKG), 'Script does not reference python docx package');
assertNot(selfSource.includes(FORBIDDEN_SKIP), 'Script has no skip path for source-faithfulness');


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
