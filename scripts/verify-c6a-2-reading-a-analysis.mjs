#!/usr/bin/env node
/**
 * C6a-2 verification for the reviewed Reading A analysis slice.
 * Run: node scripts/verify-c6a-2-reading-a-analysis.mjs
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function assertNot(condition, message) {
  assert(!condition, message);
}

function readJson(relPath) {
  const fullPath = resolve(ROOT, relPath);
  assert(existsSync(fullPath), `${relPath} exists`);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

function sorted(value) {
  return [...value].sort();
}

function deepCheckForbidden(value, path = '$') {
  if (value === null || value === undefined || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => deepCheckForbidden(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    assertNot(key === 'correctAnswer', `No correctAnswer field at ${nextPath}`);
    assertNot(key === 'unknown', `No unknown field at ${nextPath}`);
    assertNot(key === 'reviewFlags', `No reviewFlags field at ${nextPath}`);
    deepCheckForbidden(child, nextPath);
  }
}

function quoteExistsInAnyParagraph(quote, paragraphsById) {
  return Object.values(paragraphsById).some((paragraph) => paragraph.includes(quote));
}

const asset = readJson('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json');
const analysis = readJson(
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
);
const readingGroup = asset.content.groups['group-2024-jslk-reading-a'];
const paragraphs = readingGroup.passage.paragraphs;
const paragraphsById = Object.fromEntries(
  paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph.text]),
);
const targetQuestionIds = ['q-2024-jslk-021', 'q-2024-jslk-022', 'q-2024-jslk-023'];
const allowedPrimarySkills = new Set([
  'detail',
  'inference',
  'mainIdea',
  'wordMeaning',
  'authorPurpose',
  'attitude',
  'title',
  'structure',
]);
const allowedTrapTypes = new Set([
  'sourceLexicalTrap',
  'polarityReversal',
  'scopeShift',
  'entityMismatch',
  'unsupportedClaim',
]);
const allowedPolaritySubtypes = new Set([
  'oppositeAction',
  'oppositeAttitude',
  'oppositeTrend',
  'causeEffectReversal',
  'timeOrderReversal',
  'negationReversal',
]);
const allowedScopeSubtypes = new Set([
  'overgeneralization',
  'overstatement',
  'understatement',
  'conditionRemoved',
]);
const allowedRelationTypes = new Set(['locationCue', 'paraphrase', 'wordFamily', 'calculation']);

deepCheckForbidden(analysis);

assert(analysis.status === undefined, 'Stored analysis has no top-level response-wrapper status');
assert(analysis.schemaVersion === 'reading-choice-analysis-v1', 'schemaVersion is reading-choice-analysis-v1');
assert(analysis.paperId === asset.paper.paperId, 'analysis paperId matches paper asset');
assert(
  analysis.sourceAssetVersion === asset.paper.assetVersion,
  'analysis sourceAssetVersion matches paper assetVersion',
);
assert(
  JSON.stringify(analysis.targetGroups) === JSON.stringify(['group-2024-jslk-reading-a']),
  'analysis targets only Reading A',
);
assert(analysis.meta?.generatedBy === 'external-ai', 'meta records external-ai generation');
assert(analysis.meta?.promptVersion === 'reading-choice-analysis-v1', 'meta promptVersion is reading-choice-analysis-v1');
assert(analysis.meta?.reviewStatus === 'reviewed', 'meta reviewStatus is reviewed after Codex cleaning');
assert(analysis.meta?.reviewedBy === 'Codex', 'meta reviewedBy is Codex');

assert(
  JSON.stringify(Object.keys(analysis.groups || {})) === JSON.stringify(['group-2024-jslk-reading-a']),
  'analysis contains only Reading A group analysis',
);
assert(
  JSON.stringify(sorted(Object.keys(analysis.questions || {}))) === JSON.stringify(targetQuestionIds),
  'analysis contains exactly Q21-Q23',
);

const groupAnalysis = analysis.groups['group-2024-jslk-reading-a'];
assert(typeof groupAnalysis.overview === 'string' && groupAnalysis.overview.length > 10, 'group overview is present');
assert(
  typeof groupAnalysis.discourseStructure?.summary === 'string' &&
    groupAnalysis.discourseStructure.summary.length > 10,
  'group discourseStructure summary is present',
);
const discourseParagraphs = groupAnalysis.discourseStructure?.paragraphs || [];
assert(
  JSON.stringify(discourseParagraphs.map((paragraph) => paragraph.paragraphId)) ===
    JSON.stringify(paragraphs.map((paragraph) => paragraph.paragraphId)),
  'discourseStructure paragraph IDs match Reading A source paragraphs in order',
);
for (const paragraph of discourseParagraphs) {
  assert(typeof paragraph.summary === 'string' && paragraph.summary.length > 5, `${paragraph.paragraphId} summary exists`);
  assert(
    typeof paragraph.function === 'string' && paragraph.function.length > 5,
    `${paragraph.paragraphId} function exists`,
  );
}

for (const questionId of targetQuestionIds) {
  const question = analysis.questions[questionId];
  const answerEntry = asset.answerKey.answers[questionId];

  assert(question, `${questionId} analysis exists`);
  assert(allowedPrimarySkills.has(question.skill?.primary), `${questionId} primary skill is controlled`);
  if (question.skill?.secondary !== undefined) {
    assert(question.skill.secondary === 'inference', `${questionId} secondary skill is inference`);
    assert(
      ['detail', 'attitude'].includes(question.skill.primary),
      `${questionId} secondary inference only pairs with detail or attitude`,
    );
  }
  assert(typeof question.questionFocus === 'string' && question.questionFocus.length > 5, `${questionId} questionFocus exists`);
  assert(
    typeof question.stemTranslationZh === 'string' && question.stemTranslationZh.length > 5,
    `${questionId} stemTranslationZh exists`,
  );

  assert(Array.isArray(question.optionAnalysis), `${questionId} optionAnalysis is an array, never an object`);
  assert(question.optionAnalysis.length === 4, `${questionId} optionAnalysis has 4 items`);
  assert(
    JSON.stringify(question.optionAnalysis.map((option) => option.label)) === JSON.stringify(['A', 'B', 'C', 'D']),
    `${questionId} optionAnalysis labels are A-D in order`,
  );

  const correctOptions = question.optionAnalysis.filter((option) => option.status === 'correct');
  assert(correctOptions.length === 1, `${questionId} has exactly one correct option`);
  assert(
    correctOptions[0]?.label === answerEntry.answer,
    `${questionId} correct option matches answerKey (${answerEntry.answer})`,
  );

  for (const option of question.optionAnalysis) {
    assert(
      typeof option.optionTranslationZh === 'string' && option.optionTranslationZh.length > 0,
      `${questionId} option ${option.label} has optionTranslationZh`,
    );
    assert(['correct', 'wrong'].includes(option.status), `${questionId} option ${option.label} status is controlled`);

    if (option.status === 'correct') {
      assert(Array.isArray(option.evidence) && option.evidence.length >= 1, `${questionId} correct option has evidence`);
      assert(option.evidence?.[0]?.role === 'primary', `${questionId} first correct evidence is primary`);
      for (const evidence of option.evidence || []) {
        assert(
          ['primary', 'supporting'].includes(evidence.role),
          `${questionId} evidence role is primary/supporting`,
        );
        assert(
          paragraphsById[evidence.paragraphId]?.includes(evidence.quote),
          `${questionId} evidence quote is exact in ${evidence.paragraphId}`,
        );
        assert(typeof evidence.anchor === 'string' && evidence.anchor.length > 0, `${questionId} evidence anchor exists`);
      }
      assert(option.trap === undefined, `${questionId} correct option has no trap`);
      assert(option.trapEvidence === undefined, `${questionId} correct option has no trapEvidence`);
      continue;
    }

    assert(option.trap, `${questionId} wrong option ${option.label} has trap`);
    assert(
      option.trap?.trapEvidence === undefined,
      `${questionId} wrong option ${option.label} has no nested trapEvidence inside trap`,
    );
    assert(
      allowedTrapTypes.has(option.trap?.primaryType),
      `${questionId} wrong option ${option.label} trap primaryType is controlled`,
    );

    if (option.trap?.primaryType === 'sourceLexicalTrap') {
      assert(['exact', 'wordFamily'].includes(option.trap.matchType), `${questionId} ${option.label} lexical matchType is controlled`);
      assert(
        quoteExistsInAnyParagraph(option.trap.sourceText, paragraphsById),
        `${questionId} ${option.label} sourceLexicalTrap sourceText appears in source`,
      );
      assert(
        Array.isArray(option.trapEvidence) && option.trapEvidence.length >= 1,
        `${questionId} ${option.label} sourceLexicalTrap has top-level trapEvidence`,
      );
    }

    if (option.trap?.primaryType === 'polarityReversal') {
      assert(
        allowedPolaritySubtypes.has(option.trap.subtype),
        `${questionId} ${option.label} polarity subtype is controlled`,
      );
      assert(
        quoteExistsInAnyParagraph(option.trap.sourceQuote, paragraphsById),
        `${questionId} ${option.label} polarity sourceQuote is exact in source`,
      );
      assert(
        Array.isArray(option.trapEvidence) && option.trapEvidence.length >= 1,
        `${questionId} ${option.label} polarityReversal has top-level trapEvidence`,
      );
    }

    if (option.trap?.primaryType === 'scopeShift') {
      assert(allowedScopeSubtypes.has(option.trap.subtype), `${questionId} ${option.label} scope subtype is controlled`);
      assert(
        quoteExistsInAnyParagraph(option.trap.sourceQuote, paragraphsById),
        `${questionId} ${option.label} scope sourceQuote is exact in source`,
      );
    }

    if (option.trap?.primaryType === 'entityMismatch') {
      assert(
        quoteExistsInAnyParagraph(option.trap.sourceQuote, paragraphsById),
        `${questionId} ${option.label} entityMismatch sourceQuote is exact in source`,
      );
      assert(typeof option.trap.sourceEntity === 'string', `${questionId} ${option.label} entityMismatch sourceEntity exists`);
      assert(typeof option.trap.optionEntity === 'string', `${questionId} ${option.label} entityMismatch optionEntity exists`);
    }

    if (option.trap?.primaryType === 'unsupportedClaim') {
      assert(option.trap.sourceQuote === undefined, `${questionId} ${option.label} unsupportedClaim has no sourceQuote`);
      assert(option.trapEvidence === undefined, `${questionId} ${option.label} unsupportedClaim has no trapEvidence`);
      assert(
        /原文未提及/.test(option.trap.explanation || ''),
        `${questionId} ${option.label} unsupportedClaim says 原文未提及`,
      );
    }

    for (const evidence of option.trapEvidence || []) {
      assert(
        paragraphsById[evidence.paragraphId]?.includes(evidence.quote),
        `${questionId} ${option.label} trapEvidence quote is exact in ${evidence.paragraphId}`,
      );
      assert(typeof evidence.anchor === 'string' && evidence.anchor.length > 0, `${questionId} ${option.label} trapEvidence anchor exists`);
    }
  }

  const locationParaphrases = question.locationParaphrases || [];
  assert(
    locationParaphrases.length >= 1 && locationParaphrases.length <= 2,
    `${questionId} has 1-2 locationParaphrases`,
  );
  for (const relation of locationParaphrases) {
    assert(['stem', 'correctOption'].includes(relation.sourceRole), `${questionId} location sourceRole is controlled`);
    assert(allowedRelationTypes.has(relation.relationType), `${questionId} location relationType is controlled`);
    assert(
      paragraphsById[relation.targetParagraphId]?.includes(relation.targetText),
      `${questionId} location targetText is exact in ${relation.targetParagraphId}`,
    );
    assert(typeof relation.note === 'string' && relation.note.length > 5, `${questionId} location note exists`);
  }
}

const readingPrompt = readFileSync(resolve(ROOT, 'prompts/reading-choice-analysis-v1.md'), 'utf8');
assert(/optionAnalysis[\s\S]{0,120}MUST be an array/i.test(readingPrompt), 'Prompt requires optionAnalysis array');
assert(/never an object/i.test(readingPrompt), 'Prompt forbids optionAnalysis object shape');
assert(/trapEvidence[\s\S]{0,160}sibling/i.test(readingPrompt), 'Prompt requires trapEvidence as sibling of trap');
assert(/quote[\s\S]{0,80}copied exactly/i.test(readingPrompt), 'Prompt requires exact copied quotes');
assert(/Material mismatch[\s\S]{0,120}NOT polarityReversal/i.test(readingPrompt), 'Prompt distinguishes material mismatch from polarityReversal');

try {
  const changedFiles = execSync('git diff --name-only github/main...HEAD', {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const allowedFiles = new Set([
    'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
    'prompts/reading-choice-analysis-v1.md',
    'scripts/verify-c6a-2-reading-a-analysis.mjs',
  ]);
  for (const file of changedFiles) {
    assert(allowedFiles.has(file), `Changed file is in C6a-2 allowed scope: ${file}`);
  }
} catch (error) {
  assert(false, `Unable to inspect changed files: ${error.message}`);
}

console.log('\n' + '═'.repeat(60));
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error('\nFailed assertions:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('\n  C6a-2 Reading A analysis verification passed.');
