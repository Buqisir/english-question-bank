import { resolveConsumerPresentation } from './consumers.mjs'

// The historical __NN__ adapter left three literal underscores on each side
// of the registered _____NN_____ dialect. Do not rewrite its signed projection.
export function blankPresentationParagraphs(group, consumerContractRef) {
  if (group.groupType !== 'sevenChoices'
    || resolveConsumerPresentation(consumerContractRef)?.policy.sevenChoicesBlankResidue !== 'paired_three_underscores') {
    return group.paragraphs
  }
  return group.paragraphs.map(paragraph => {
    const nodes = paragraph.nodes.map(node => ({ ...node }))
    for (let index = 1; index < nodes.length - 1; index += 1) {
      const before = nodes[index - 1]
      const after = nodes[index + 1]
      if (nodes[index].type !== 'blank' || before.type !== 'text' || after.type !== 'text') continue
      if (!/(?<!_)___$/u.test(before.text) || !/^___(?!_)/u.test(after.text)) continue
      before.text = before.text.slice(0, -3)
      after.text = after.text.slice(3)
    }
    return { ...paragraph, nodes }
  })
}
