import { Fragment } from 'react'
import { ButtonLink } from '../../shared-ui/Button'
import type { OtterExample } from '../../services/paperDictionary'

function highlightedText(example: OtterExample, forms: string[]) {
  if (example.highlightRanges?.length) {
    const points = [...example.text]
    const ranges = example.highlightRanges
    const slice = (start: number, end?: number) => points.slice(start, end).join('')
    return <>
      {ranges.map(([start, end], index) => (
        <Fragment key={start}>{slice(ranges[index - 1]?.[1] ?? 0, start)}<strong>{slice(start, end)}</strong></Fragment>
      ))}
      {slice(ranges.at(-1)![1])}
    </>
  }
  const pattern = [...forms].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern})(?![\\p{L}\\p{M}])`, 'iu').exec(example.text)
  return match ? <>{example.text.slice(0, match.index)}<strong>{match[0]}</strong>{example.text.slice(match.index + match[0].length)}</> : example.text
}

export function ExampleSentence({ example, forms }: { example: OtterExample; forms: string[] }) {
  const { paperId, label, groupId, locator } = example.source
  const params = new URLSearchParams({ view: 'paper-browse', paperId, focusGroupId: groupId })
  const questionId = locator.questionId?.split('#')[0]
  if (locator.paragraphId) params.set('focusParagraphId', locator.paragraphId)
  if (questionId) params.set('questionId', questionId)
  return (
    <div className="otter-example">
      <p lang="en">{highlightedText(example, forms)}</p>
      {example.zh && <p>{example.zh}</p>}
      <ButtonLink size="sm" href={`?${params}`} className="otter-source">
        {label}
      </ButtonLink>
    </div>
  )
}
