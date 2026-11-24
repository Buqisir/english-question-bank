import { ButtonLink } from '../../shared-ui/Button'
import type { OtterExample } from '../../services/paperDictionary'

export function ExampleSentence({ example, forms }: { example: OtterExample; forms: string[] }) {
  const { paperId, paperTitle, groupId, locator } = example.source
  const params = new URLSearchParams({ view: 'paper-browse', paperId, focusGroupId: groupId })
  const questionId = locator.questionId?.split('#')[0]
  if (locator.paragraphId) params.set('focusParagraphId', locator.paragraphId)
  if (questionId) params.set('questionId', questionId)
  const reading = groupId.match(/:reading-([a-d])$/i)?.[1]?.toUpperCase()
  const title = paperTitle.replace(/(\d{4})年普通高等学校招生全国统一考试英语[（(](.+?)[）)]/, '$1 $2')
    .replace(/新课标(I{1,3})卷/, '新课标 $1 卷')
  const pattern = [...forms].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern})(?![\\p{L}\\p{M}])`, 'iu').exec(example.text)
  return (
    <div className="otter-example">
      <p lang="en">{match ? <>{example.text.slice(0, match.index)}<strong>{match[0]}</strong>{example.text.slice(match.index + match[0].length)}</> : example.text}</p>
      {example.zh && <p>{example.zh}</p>}
      <ButtonLink size="sm" href={`?${params}`} className="otter-source">
        {title}{reading && ` · 阅读 ${reading}`}
      </ButtonLink>
    </div>
  )
}
