#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeNarrativeContinuationImportCandidate,
  buildNarrativeContinuationAnalysisMessages,
  validateNarrativeContinuationAnalysis,
} from '../server/paper-import-ai/analyzeNarrativeContinuation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
function check(label, fn) {
  fn()
  passed += 1
  console.log(`PASS ${label}`)
}

function rejects(label, fn, pattern) {
  assert.throws(fn, pattern)
  passed += 1
  console.log(`PASS ${label}`)
}

const writingTask = {
  writingTaskId: 'wt-fixture-continuation',
  groupId: 'group-fixture-continuation',
  taskType: 'continuation',
  title: '读后续写',
  instruction: '阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。',
  wordCountTarget: 150,
  materialText: [
    'The twins wanted to surprise their mother with breakfast.',
    'The porridge boiled over, and both children stared at the messy stove in disappointment.',
    'They still hoped to finish the breakfast before their mother woke up.',
  ].join(' '),
  continuationStarters: [
    'As the twins looked around them in disappointment, their father appeared.',
    'The twins carried the breakfast upstairs and woke their mother up.',
  ],
}

const evidence = (source, excerpt) => ({ source, excerpt })
const grounded = (statement, source, excerpt) => ({
  statement,
  evidence: [evidence(source, excerpt)],
})

function validCandidate() {
  const materialSituation = grounded(
    'The twins want to make breakfast for their mother, but their first attempt fails.',
    'material',
    'The twins wanted to surprise their mother with breakfast.',
  )
  const failure = grounded(
    'The children are disappointed by the failed porridge and messy stove.',
    'material',
    'The porridge boiled over',
  )
  const fatherEntry = grounded(
    'The father enters when the twins are disappointed.',
    'paragraph1Starter',
    'their father appeared',
  )
  const breakfastReady = grounded(
    'Paragraph one must end with a breakfast ready to be carried upstairs.',
    'paragraph2Starter',
    'carried the breakfast upstairs',
  )
  const motherWakes = grounded(
    'Paragraph two begins when the twins wake their mother.',
    'paragraph2Starter',
    'woke their mother up',
  )

  return {
    schemaVersion: 'continuation-analysis-v1',
    storyUnderstanding: {
      centralSituation: materialSituation,
      sourceEndState: failure,
      narrativePerspective: grounded('The story uses a third-person perspective.', 'material', 'The twins'),
      timeAndPlaceFrame: grounded('The immediate scene is the family kitchen before the mother wakes.', 'material', 'messy stove'),
      characters: [
        {
          name: 'the twins',
          role: 'protagonists',
          establishedTraits: [grounded('They are caring and persistent.', 'material', 'still hoped to finish')],
          motivations: [grounded('They want to surprise their mother.', 'material', 'surprise their mother')],
          currentState: failure,
        },
        {
          name: 'the father',
          role: 'helper introduced by the first starter',
          establishedTraits: [],
          motivations: [],
          currentState: fatherEntry,
        },
      ],
      relationships: [
        {
          participants: ['the twins', 'their mother'],
          currentRelation: grounded('The children want to express care for their mother.', 'material', 'surprise their mother'),
        },
      ],
      causalChain: [
        {
          cause: grounded('The porridge boils over.', 'material', 'The porridge boiled over'),
          effect: failure,
        },
      ],
      unresolvedProblem: grounded('The failed breakfast must be repaired before the mother wakes.', 'material', 'finish the breakfast before their mother woke up'),
      usableClues: [
        grounded('The children have not given up on finishing breakfast.', 'material', 'They still hoped to finish the breakfast'),
      ],
      meaningDirection: {
        statement: 'Care is expressed through persistence and shared action rather than perfect results.',
        confidence: 'stronglyInferred',
        evidence: [evidence('material', 'surprise their mother with breakfast')],
      },
      sourceStyle: grounded('The source uses plain third-person narration with concrete actions.', 'material', 'both children stared at the messy stove'),
    },
    continuationContract: {
      hardConstraints: [
        { id: 'hc-father-entry', ...fatherEntry },
        { id: 'hc-breakfast-ready', ...breakfastReady },
        { id: 'hc-mother-wakes', ...motherWakes },
      ],
      softAffordances: [
        grounded('The twins can persist instead of abandoning the plan.', 'material', 'still hoped to finish'),
      ],
      openChoices: [
        'The exact way the father helps the twins repair the breakfast.',
        'The mother’s specific response after waking.',
      ],
      forbiddenContradictions: [
        {
          id: 'fc-no-ready-breakfast',
          ...grounded('Paragraph one cannot end without a completed breakfast.', 'paragraph2Starter', 'carried the breakfast upstairs'),
        },
      ],
      paragraphs: [
        {
          paragraphIndex: 1,
          entryState: fatherEntry,
          starterFunction: grounded('The first starter introduces help at the point of failure.', 'paragraph1Starter', 'their father appeared'),
          requiredMoves: [
            {
              id: 'p1-repair',
              ...grounded('The failed breakfast must be repaired.', 'paragraph2Starter', 'carried the breakfast upstairs'),
            },
          ],
          requiredExitState: [{ id: 'p1-ready', ...breakfastReady }],
          supportedOptions: [
            grounded('The father may help because he appears at the moment of disappointment.', 'paragraph1Starter', 'their father appeared'),
          ],
        },
        {
          paragraphIndex: 2,
          entryState: motherWakes,
          starterFunction: grounded('The second starter moves the action from preparation to the mother’s response.', 'paragraph2Starter', 'woke their mother up'),
          requiredMoves: [
            {
              id: 'p2-response',
              ...grounded('The mother must respond to the children and the breakfast.', 'paragraph2Starter', 'woke their mother up'),
            },
          ],
          requiredExitState: [
            {
              id: 'p2-closure',
              ...grounded('The children’s caring purpose must reach a clear result.', 'material', 'surprise their mother with breakfast'),
            },
          ],
          supportedOptions: [],
        },
      ],
      closureRequirements: [
        {
          id: 'closure-care',
          ...grounded('The ending must resolve the children’s attempt to care for their mother.', 'material', 'surprise their mother with breakfast'),
        },
      ],
    },
    narrativeDevelopment: {
      coreTension: grounded('The children’s caring intention is threatened by their failed cooking attempt.', 'material', 'The porridge boiled over'),
      drivingMotivations: [grounded('The twins want to complete their surprise.', 'material', 'still hoped to finish the breakfast')],
      requiredTurningPoints: [fatherEntry, breakfastReady, motherWakes],
      eventChain: [
        {
          cause: 'The father sees the twins’ disappointment.',
          event: 'He helps them make a simple replacement breakfast.',
          immediateEffect: 'The twins regain hope and complete the meal.',
          evidence: [evidence('paragraph1Starter', 'their father appeared')],
        },
        {
          cause: 'The breakfast is ready.',
          event: 'The twins carry it upstairs and wake their mother.',
          immediateEffect: 'Their caring intention becomes visible to her.',
          evidence: [evidence('paragraph2Starter', 'carried the breakfast upstairs')],
        },
      ],
      emotionLogic: [
        {
          trigger: 'The first breakfast fails.',
          internalResponse: 'The twins feel disappointed but still want to continue.',
          visibleAction: 'They accept help and try again.',
        },
      ],
      relationshipMovement: [
        {
          participants: ['the twins', 'their mother'],
          from: 'care intended but not yet communicated',
          to: 'care understood and appreciated',
          cause: 'the repaired breakfast and the children’s effort',
        },
      ],
      interactionMoves: [
        {
          speaker: 'the father',
          listener: 'the twins',
          purpose: 'offer calm practical help',
          relationshipNeed: 'support without blame',
          expectedEffect: 'restore the children’s confidence',
          evidence: [evidence('paragraph1Starter', 'their father appeared')],
        },
      ],
      cluePayoffs: [
        {
          clue: evidence('material', 'still hoped to finish the breakfast'),
          payoff: 'The twins persist until they finish a replacement breakfast.',
        },
      ],
      endingState: 'The mother understands the twins’ care, and the failed attempt becomes a shared family success.',
    },
    languageAlignment: {
      personAndPerspective: 'Maintain third-person narration centered on the twins.',
      baseTense: 'Use the simple past for the main event line.',
      licensedTenseShifts: [],
      narrativeDistanceAndRegister: 'Keep the warm, direct family-story register of the source.',
      sourceStyleContinuity: 'Continue with plain narration and concrete actions rather than ornate commentary.',
      cohesionPlan: [
        { relation: 'cause', use: 'Make the father’s help lead visibly to the repaired breakfast.' },
        { relation: 'echo', use: 'Return to the twins’ original wish to surprise their mother.' },
      ],
      dialoguePolicy: 'Use at most a short supportive line from the father if it advances the repair action.',
      descriptionPriorities: ['concrete repair actions', 'the twins’ change from disappointment to hope'],
      functionLedLanguage: ['action verbs for the repair sequence', 'brief emotional reactions tied to visible behavior'],
      languageRisks: ['overwriting the scene with tears or moral commentary', 'shifting away from the twins’ perspective'],
    },
    paragraphBlueprint: {
      selectedRoute: 'The father helps the twins calmly remake breakfast; their mother values the care behind it.',
      routeRationale: [fatherEntry, breakfastReady, motherWakes],
      paragraphs: [
        {
          paragraphIndex: 1,
          narrativeFunction: 'Turn failure into a workable repair and reach a completed breakfast.',
          eventMoves: ['The father notices the problem.', 'They divide simple repair tasks.', 'The replacement breakfast is completed.'],
          characterActionsAndReactions: ['The father responds without blame.', 'The twins regain confidence and act.'],
          evidenceToReuse: [evidence('material', 'messy stove'), evidence('paragraph1Starter', 'their father appeared')],
          stateChange: 'failed breakfast and disappointment → completed breakfast and renewed hope',
          bridgeToNext: 'End with the twins ready to carry the breakfast upstairs.',
        },
        {
          paragraphIndex: 2,
          narrativeFunction: 'Show the mother’s response and close the children’s caring purpose.',
          eventMoves: ['The twins wake their mother.', 'She sees the breakfast and their effort.', 'The family shares a warm response.'],
          characterActionsAndReactions: ['The mother recognizes the twins’ intention.', 'The twins understand that care matters more than perfection.'],
          evidenceToReuse: [evidence('paragraph2Starter', 'woke their mother up'), evidence('material', 'surprise their mother')],
          stateChange: 'care intended → care understood',
          bridgeToNext: 'Close the whole story without introducing a new event.',
        },
      ],
      finalEffect: 'The original problem is resolved through plausible shared action, and the ending grows from the twins’ initial purpose.',
      validAlternativeRoutes: ['The father gives instructions while the twins complete the repair themselves.'],
      qualityRisks: ['Skipping the actual repair process', 'Making the mother react before the second starter'],
    },
  }
}

const candidate = validCandidate()

check('valid narrative continuation analysis passes the runtime contract', () => {
  assert.doesNotThrow(() => validateNarrativeContinuationAnalysis(candidate, { writingTask }))
})

check('message builder uses the tracked prompt and complete source task', () => {
  const messages = buildNarrativeContinuationAnalysisMessages({ writingTask })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /continuation-analysis-v1/)
  assert.match(messages[0].content, /不生成范文/)
  assert.equal(messages[1].role, 'user')
  assert.match(messages[1].content, /The porridge boiled over/)
  assert.match(messages[1].content, /their father appeared/)
})

rejects('legacy continuationDesign shape is rejected', () => {
  validateNarrativeContinuationAnalysis({
    schemaVersion: 'continuation-analysis-v1',
    continuationDesign: { theme: 'care', paragraphs: ['one', 'two'] },
  }, { writingTask })
}, /continuation analysis schema invalid/i)

rejects('unknown score fields are rejected', () => {
  const withScore = structuredClone(candidate)
  withScore.predictedScore = 23
  validateNarrativeContinuationAnalysis(withScore, { writingTask })
}, /additional properties|predictedScore/i)

rejects('evidence excerpts must be exact substrings of their named source', () => {
  const forged = structuredClone(candidate)
  forged.storyUnderstanding.centralSituation.evidence[0].excerpt = 'a sentence not present in the task'
  validateNarrativeContinuationAnalysis(forged, { writingTask })
}, /evidence excerpt.*material/i)

rejects('paragraph contracts remain exactly ordered 1 then 2', () => {
  const swapped = structuredClone(candidate)
  swapped.continuationContract.paragraphs[0].paragraphIndex = 2
  validateNarrativeContinuationAnalysis(swapped, { writingTask })
}, /continuation analysis schema invalid/i)

rejects('unsupported discourse sentinel stops without retrying as narrative', () => {
  validateNarrativeContinuationAnalysis({
    status: 'unsupported',
    observedMode: 'argumentative',
    reason: 'The task requires a position supported by reasons and evidence.',
  }, { writingTask })
}, /UNSUPPORTED_CONTINUATION_MODE/)

check('schema and prompt artifacts name the same contract', () => {
  const schema = JSON.parse(readFileSync(
    path.join(rootDir, 'schemas/paper-import/continuation-analysis-v1.schema.json'),
    'utf8',
  ))
  const prompt = readFileSync(path.join(rootDir, 'prompts/continuation-analysis-v1.md'), 'utf8')
  assert.equal(schema.$id, 'continuation-analysis-v1.schema.json')
  assert.equal(schema.properties.schemaVersion.const, 'continuation-analysis-v1')
  assert.match(prompt, /continuation-analysis-v1/)
  assert.doesNotMatch(prompt, /"modelAnswer"\s*:/)
  assert.doesNotMatch(prompt, /"continuationDesign"\s*:/)
})

const providerResult = await analyzeNarrativeContinuationImportCandidate(
  { writingTask, providerId: 'deepseek-v4-pro' },
  {
    analysisRetries: 0,
    providerRetries: 0,
    providerCallers: {
      deepseek: async () => ({
        rawText: JSON.stringify(candidate),
        provider: 'fixture',
        model: 'fixture-model',
        latencyMs: 1,
      }),
    },
  },
)

check('provider shell returns the validated field without a parallel result shape', () => {
  assert.deepEqual(providerResult.analysis, candidate)
  assert.equal(providerResult.provider, 'fixture')
})

console.log(`\nverify-continuation-analysis-v1: ${passed} passed, 0 failed`)
