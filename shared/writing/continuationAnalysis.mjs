export const CONTINUATION_ANALYSIS_V1 = 'continuation-analysis-v1'
export const CONTINUATION_ANALYSIS_V2 = 'continuation-analysis-v2'

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

export function isContinuationAnalysisV1(value) {
  const analysis = object(value)
  return Boolean(
    analysis
    && analysis.schemaVersion === CONTINUATION_ANALYSIS_V1
    && object(analysis.storyUnderstanding)
    && object(analysis.continuationContract)
    && object(analysis.narrativeDevelopment)
    && object(analysis.languageAlignment)
    && object(analysis.paragraphBlueprint),
  )
}

export function isContinuationAnalysisV2(value) {
  const analysis = object(value)
  return Boolean(
    analysis
    && analysis.schemaVersion === CONTINUATION_ANALYSIS_V2
    && object(analysis.storyUnderstanding)
    && object(analysis.continuationContract)
    && object(analysis.developmentPlan),
  )
}

// Read-only compatibility projection. It never rewrites persisted V1 records.
// V1-only, source-grounded details remain under legacyDetails so neither
// consumer has to discard evidence while presenting the same four sections.
export function projectContinuationAnalysisDisplay(value) {
  if (isContinuationAnalysisV2(value)) {
    return {
      sourceVersion: CONTINUATION_ANALYSIS_V2,
      storyUnderstanding: value.storyUnderstanding,
      continuationContract: value.continuationContract,
      developmentPlan: value.developmentPlan,
      legacyDetails: null,
    }
  }
  if (!isContinuationAnalysisV1(value)) return null
  const narrative = value.narrativeDevelopment
  const blueprint = value.paragraphBlueprint
  return {
    sourceVersion: CONTINUATION_ANALYSIS_V1,
    storyUnderstanding: value.storyUnderstanding,
    continuationContract: value.continuationContract,
    developmentPlan: {
      selectedRoute: blueprint.selectedRoute,
      routeRationale: blueprint.routeRationale,
      paragraphs: blueprint.paragraphs.map((paragraph) => ({
        paragraphIndex: paragraph.paragraphIndex,
        // A paragraph's narrative job is not evidence for an event's cause.
        paragraphPurpose: paragraph.narrativeFunction,
        action: paragraph.eventMoves.join('；'),
        result: paragraph.stateChange,
        sourceEvidence: paragraph.evidenceToReuse,
        cluePayoffs: [],
        ...(paragraph.paragraphIndex === 1
          ? { bridge: paragraph.bridgeToNext }
          : { ending: paragraph.bridgeToNext }),
        emotionChanges: [],
        relationshipChanges: [],
      })),
      alternatives: blueprint.validAlternativeRoutes,
      qualityRisks: blueprint.qualityRisks,
    },
    legacyDetails: {
      coreTension: narrative.coreTension,
      drivingMotivations: narrative.drivingMotivations,
      requiredTurningPoints: narrative.requiredTurningPoints,
      eventChain: narrative.eventChain,
      emotionLogic: narrative.emotionLogic,
      relationshipMovement: narrative.relationshipMovement,
      interactionMoves: narrative.interactionMoves,
      // V1 clues were not assigned to paragraphs. Preserve that granularity
      // instead of claiming that all payoffs happen in paragraph two.
      cluePayoffs: narrative.cluePayoffs,
      endingState: narrative.endingState,
      characterActionsByParagraph: blueprint.paragraphs.map((paragraph) => ({
        paragraphIndex: paragraph.paragraphIndex,
        items: paragraph.characterActionsAndReactions,
      })),
      finalEffect: blueprint.finalEffect,
      languageAlignment: value.languageAlignment,
    },
  }
}
