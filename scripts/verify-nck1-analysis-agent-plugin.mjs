#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import nck1AnalysisAgentPlugin, {
  NCK1_ANALYSIS_AGENT_MODEL,
  NCK1_ANALYSIS_AGENT_REASONING_EFFORT,
  NCK1_ANALYSIS_GROUPS,
  buildNck1AnalysisAgentMessage,
  stampNck1AnalysisAgentMeta,
  validateNck1AnalysisGroupInput,
} from '../.amp/plugins/nck1-analysis-agent.js'

function request(group, marker = group) {
  return {
    group,
    sourceGroup: {
      groupKey: group,
      material: {
        groupId: `group-verifier-${group}`,
        passage: `SOURCE-${marker}`,
        questions: [{ id: `q-${marker}`, stem: `Question ${marker}` }],
      },
    },
    authoritativeAnswers: { [`q-${marker}`]: 'A' },
    outputContract: `CONTRACT-${marker}: return {"marker":"${marker}"}`,
    teachingDoctrine: `DOCTRINE-${marker}: explain the missing reasoning step.`,
  }
}

const writingContractMarkers = {
  application: [
    '# Application Writing Model Answer Prompt — V3',
    '# NCK1 Staged Application Analysis Packaging Contract — V1',
  ],
  continuation: [
    '# Narrative Continuation Analysis Prompt — V2',
    '# NCK1 Staged Narrative Continuation Packaging Contract — V2',
  ],
}

function writingRequest(group) {
  const value = request(group, `${group.toUpperCase()}-ONLY`)
  return {
    ...value,
    authoritativeAnswers: {},
    outputContract: `${value.outputContract}\n\n${writingContractMarkers[group].join('\n\n')}`,
  }
}

assert.deepEqual(NCK1_ANALYSIS_GROUPS, [
  'reading-a',
  'reading-b',
  'reading-c',
  'reading-d',
  'seven',
  'cloze',
  'grammar',
  'application',
  'continuation',
  'listening-unit',
])
assert.equal(NCK1_ANALYSIS_AGENT_MODEL, 'xai/grok-4.6')
assert.equal(NCK1_ANALYSIS_AGENT_REASONING_EFFORT, 'xhigh')

const valid = request('reading-a', 'A-ONLY')
const actualContinuationContract = [
  'continuation-analysis-v2.md', 'continuation-writing-staged-analysis-v2.md',
].map((file) => readFileSync(new URL(`../prompts/${file}`, import.meta.url), 'utf8')).join('\n\n')
assert.doesNotThrow(() => validateNck1AnalysisGroupInput({
  ...writingRequest('continuation'), outputContract: actualContinuationContract,
}))
assert.throws(() => validateNck1AnalysisGroupInput({
  ...writingRequest('continuation'), outputContract: actualContinuationContract.replaceAll('— V2', '— V1'),
}), /tracked base and staged/)
const normalizedValid = validateNck1AnalysisGroupInput(valid)
assert.deepEqual({ ...normalizedValid, outputContract: valid.outputContract }, valid)
assert.match(normalizedValid.outputContract, /Exact required groups\[groupId\]\.teachingContent JSON Schema annex/u)
assert.match(normalizedValid.outputContract, /"const": "objective-teaching-content-v1"/u)
assert.match(normalizedValid.outputContract, /"answer-insertion"/u)
const message = buildNck1AnalysisAgentMessage(valid)
assert.match(message, /^Generate exactly the reading-a staged analysis/u)
assert.match(message, /SOURCE-A-ONLY/u)
assert.match(message, /immutable authoritative answers/u)
assert.match(message, /Return JSON only/u)

assert.throws(
  () => validateNck1AnalysisGroupInput({ ...valid, group: 'whole-paper' }),
  /group must be one of/u,
)
const listening = request('listening-unit')
listening.sourceGroup.material = {
  groupId: 'listening-unit',
  questions: [{ questionId: 'question:listening:1' }],
}
listening.authoritativeAnswers = { 'question:listening:1': 'A' }
assert.throws(() => validateNck1AnalysisGroupInput(listening), /exact listening-analysis-v1 schema/u)
listening.outputContract = 'schema { "const": "listening-analysis-v1" }'
assert.deepEqual(validateNck1AnalysisGroupInput(listening), listening)
assert.throws(
  () => validateNck1AnalysisGroupInput({
    ...valid,
    sourceGroup: { ...valid.sourceGroup, groupKey: 'reading-b' },
  }),
  /groupKey must equal group/u,
)
assert.throws(
  () => validateNck1AnalysisGroupInput({
    ...valid,
    sourceGroup: {
      groupKey: 'reading-a',
      material: {
        groups: {
          'group-verifier-reading-a': {},
          'group-verifier-reading-b': {},
        },
      },
    },
  }),
  /more than one group/u,
)
assert.throws(
  () => validateNck1AnalysisGroupInput({
    ...valid,
    sourceGroup: {
      groupKey: 'reading-a',
      material: { groupId: 'group-verifier-reading-c' },
    },
  }),
  /different or additional staged group/u,
)
assert.throws(
  () => validateNck1AnalysisGroupInput({
    ...valid,
    authoritativeAnswers: {
      'q-A-ONLY': 'A',
      'q-OTHER-GROUP': 'B',
    },
  }),
  /question outside sourceGroup/u,
)
assert.throws(
  () => validateNck1AnalysisGroupInput({ ...valid, extra: true }),
  /unexpected or missing fields/u,
)
for (const group of ['application', 'continuation']) {
  assert.throws(
    () => validateNck1AnalysisGroupInput(request(group)),
    /must include its tracked base and staged packaging contracts/u,
  )
  assert.throws(
    () => validateNck1AnalysisGroupInput({
      ...request(group),
      outputContract: writingContractMarkers[group][1],
    }),
    /must include its tracked base and staged packaging contracts/u,
  )
  const staged = writingRequest(group)
  assert.deepEqual(validateNck1AnalysisGroupInput(staged), staged)
}
assert.throws(
  () => validateNck1AnalysisGroupInput({
    ...valid,
    outputContract: 'x'.repeat(80_001),
  }),
  /bounded group-analysis limit/u,
)

let tool = null
const runs = []
const responses = [
  '{"marker":"A-ONLY","meta":{"generatedBy":"external-ai","model":"invented-model","promptVersion":"reading-choice-analysis-v1","reviewStatus":"reviewed","reviewedBy":"invented-reviewer","reviewedAt":"2099-01-01"}}',
  '{"marker":"C-ONLY"}',
  '```json\n{"marker":"bad"}\n```',
  new Error('Grok subscription unavailable'),
  '{"marker":"truncated',
  "I'll inspect existing reading-choice analysis files. ".repeat(4000),
  '[]',
]

await nck1AnalysisAgentPlugin({
  createAgent() {
    assert.fail('Analysis must not create an autonomous agent')
  },
  ai: {
    async generate(options) {
      runs.push(options)
      const response = responses[runs.length - 1]
      if (response instanceof Error) throw response
      return response
    },
  },
  registerTool(definition) {
    tool = definition
  },
})

assert.equal(tool.name, 'nck1_analyze_group')
assert.match(tool.description, /No child agent/u)
assert.deepEqual(tool.inputSchema.properties.group.enum, NCK1_ANALYSIS_GROUPS)
assert.deepEqual(tool.inputSchema.required, [
  'authoritativeAnswers',
  'group',
  'outputContract',
  'sourceGroup',
  'teachingDoctrine',
])

const context = { thread: { id: 'T-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }
const first = JSON.parse(await tool.execute(valid, context))
const secondRequest = request('reading-c', 'C-ONLY')
const second = JSON.parse(await tool.execute(secondRequest, context))

assert.deepEqual(first, {
  schemaVersion: 'nck1-analysis-agent-result-v1',
  group: 'reading-a',
  model: 'xai/grok-4.6',
  reasoningEffort: 'xhigh',
  threadID: context.thread.id,
  analysis: {
    marker: 'A-ONLY',
    meta: {
      generatedBy: 'external-ai',
      model: 'xai/grok-4.6',
      promptVersion: 'reading-choice-analysis-v1',
      reviewStatus: 'reviewed',
    },
  },
})
assert.equal(second.group, 'reading-c')
assert.equal(second.threadID, context.thread.id)
assert.deepEqual(second.analysis, { marker: 'C-ONLY' })
assert.equal(runs.length, 2)
for (const { prompt, system, ...options } of runs) {
  assert.deepEqual(options, {
    model: 'xai/grok-4.6',
    reasoningEffort: 'xhigh',
    maxTokens: 16_384,
    threadID: context.thread.id,
  })
  assert.match(system, /one and only one/u)
  assert.match(system, /Never solve again or alter an authoritative answer/u)
  assert.match(system, /Do not invent a runtime model name/u)
}
assert.match(runs[0].prompt, /A-ONLY/u)
assert.doesNotMatch(runs[0].prompt, /C-ONLY/u)
assert.match(runs[1].prompt, /C-ONLY/u)
assert.doesNotMatch(runs[1].prompt, /A-ONLY/u)

await assert.rejects(
  tool.execute(request('cloze', 'INVALID-JSON'), context),
  /did not return JSON-only output/u,
)
assert.equal(runs.length, 3)

await assert.rejects(tool.execute(valid, context), /Grok subscription unavailable/u)
assert.equal(runs.length, 4, 'A provider failure must propagate without retry or fallback')

for (let index = 4; index < responses.length; index++) {
  await assert.rejects(tool.execute(valid, context), /JSON-only output|one JSON object/u)
  assert.equal(runs.length, index + 1, 'Invalid or truncated output must not trigger a retry')
}
await assert.rejects(tool.execute({ ...valid, extra: true }, context), /unexpected or missing fields/u)
assert.equal(runs.length, responses.length, 'Input rejection must happen before inference')

const writingWithoutMeta = { taskType: 'application', modelAnswer: 'Example.' }
assert.equal(stampNck1AnalysisAgentMeta(writingWithoutMeta), writingWithoutMeta)
assert.deepEqual(writingWithoutMeta, { taskType: 'application', modelAnswer: 'Example.' })

console.log('PASS NCK1 bounded completion pins Grok 4.6 XHigh, isolates groups, rejects invalid output without children or retries')
