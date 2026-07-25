export function buildExactPaperGroupSourceSlice(asset, groupId) {
  const group = asset?.content?.groups?.[groupId]
  const questionIds = Array.isArray(group?.questionIds) ? group.questionIds : []
  const blankIds = Array.isArray(group?.blankIds) ? group.blankIds : []

  return {
    paperId: asset?.paper?.paperId,
    sourceAssetVersion: asset?.paper?.assetVersion,
    group,
    questions: Object.fromEntries(
      questionIds
        .filter(
          (questionId) =>
            asset?.content?.questions?.[questionId] !== undefined,
        )
        .map((questionId) => [
          questionId,
          asset.content.questions[questionId],
        ]),
    ),
    blanks: Object.fromEntries(
      blankIds
        .filter(
          (blankId) => asset?.content?.blanks?.[blankId] !== undefined,
        )
        .map((blankId) => [blankId, asset.content.blanks[blankId]]),
    ),
  }
}
