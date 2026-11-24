import { ButtonLink } from '../../shared-ui/Button'
import type { OtterExample } from '../../services/paperDictionary'

export function ExampleSentence({ example, forms }: { example: OtterExample; forms: string[] }) {
  const { paperId, label, groupId, locator } = example.source
  const params = new URLSearchParams({ view: 'paper-browse', paperId, focusGroupId: groupId })
  const questionId = locator.questionId?.split('#')[0]
  if (locator.paragraphId) params.set('focusParagraphId', locator.paragraphId)
  if (questionId) params.set('questionId', questionId)
  const pattern = [...forms].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern})(?![\\p{L}\\p{M}])`, 'iu').exec(example.text)
  return (
    <div className="otter-example">
      <p lang="en">{match ? <>{example.text.slice(0, match.index)}<strong>{match[0]}</strong>{example.text.slice(match.index + match[0].length)}</> : example.text}</p>
      {example.zh && <p>{example.zh}</p>}
      <ButtonLink size="sm" href={`?${params}`} className="otter-source">
        {label}
      </ButtonLink>
    </div>
  )
}
