import type { TextRange } from '../../../../../../shared/sentence-analysis/types.d.mts'

function pieces(text: string, ranges: TextRange[]) {
  const cuts = new Set<number>([0, text.length])
  for (const range of ranges) {
    if (range.end > range.start) {
      cuts.add(range.start)
      cuts.add(range.end)
    }
  }
  const points = [...cuts].sort((a, b) => a - b)
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    return {
      text: text.slice(start, end),
      hit: ranges.some((range) => range.start <= start && range.end >= end),
    }
  }).filter((part) => part.text)
}

export function TranslationBlock({ text, ranges }: { text: string; ranges: TextRange[] }) {
  return (
    <section className="sa-translation">
      <p className="sa-translation-body">
        <span className="sa-translation-label">参考译文</span>
        {pieces(text, ranges).map((part, index) => (
          part.hit
            ? <mark key={index} className="sa-zh-hit">{part.text}</mark>
            : <span key={index}>{part.text}</span>
        ))}
      </p>
    </section>
  )
}
