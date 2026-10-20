// Rework owns the whole grammar classification, not just the failing leaf.
export const GRAMMAR_REWORK_RULE = '语法题以整道题为返工单位：允许重新判断并修改 facetKey、role、similarityProfile.route 和 features；先依据答案与原句判语法，再选合法值。不得自动把未知 route 映射为近义 route，不得新增词表值。其他题与来源身份保持不变。'

export function metadataReworkFeedback({ request, authored, issues }) {
  const questions = new Map()
  for (const issue of issues) {
    const match = /^\$\.groups\[(\d+)\]\.metadata\.questions\[(\d+)\]/u.exec(issue.path)
    if (!match) continue
    const group = authored.groups?.[Number(match[1])]
    if (group?.family !== 'grammar-fill') continue
    const current = group.metadata.questions[Number(match[2])]
    const source = request.sourceGroups.find(item => item.groupId === group.groupId)
    const question = source?.questions.find(item => item.questionId === current.questionId)
    const facts = request.deterministic.find(item => item.groupId === group.groupId)?.grammarSourceFacts?.[current.questionId]
    if (!question || !facts) throw new Error(`返工缺少源题事实：${current.questionId}`)
    if (!questions.has(current.questionId)) {
      const candidates = request.controlledValues.grammarFacets
        .filter(facet => facet.blank_type === facts.blankType)
        .map(facet => {
          const spec = request.controlledValues.grammarSimilarity.find(item => item.facet_key === facet.facet_key)
          if (!spec) throw new Error(`返工缺少合法值：${facet.facet_key}`)
          const nonFinite = facet.facet_key === 'grammar-fill.given.verb.non-finite'
          const legalRoles = ['subject', 'predicative', 'object', 'attributive', 'adverbial', 'appositive', 'object-complement', 'subject-complement']
          return { facetKey: facet.facet_key, routes: spec.routes, features: spec.features,
            roles: nonFinite ? legalRoles : [null],
            roleRule: nonFinite ? 'role 必须与 route 的完整角色前缀一致' : 'role 必须为 null' }
        })
      const context = source.blocks.filter(block => block.content?.some(run => run.blankId === facts.blankId))
        .map(block => ({ blockId: block.blockId, text: block.content.map(run =>
          run.kind === 'blank_ref' ? (run.blankId === facts.blankId ? `[${facts.answer}]` : `[${run.blankId}]`) : run.text || '').join('') }))
      questions.set(current.questionId, { questionId: current.questionId, blankType: facts.blankType,
        hint: facts.hint, answer: facts.answer, context, current, errors: [], candidates })
    }
    questions.get(current.questionId).errors.push(issue)
  }
  return { instruction: GRAMMAR_REWORK_RULE, grammarQuestions: [...questions.values()], issues }
}
