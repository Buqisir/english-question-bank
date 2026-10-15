import { useMemo } from 'react'
import { ROLE_LABELS, legendRolesIn, sentenceLegendRoles, visibleRoleUnits } from './sentencePresentation'
import { underlinePaths } from './underlines'
import type { GrammarFilter, LineKind } from './underlines'
import type { SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'

function SampleLine({ kind }: { kind: LineKind }) {
  return <svg className="sa-legend-stroke" width="30" height="9" viewBox="0 0 30 9" aria-hidden="true">
    {underlinePaths(kind, 1, 29, 2).map((path, index) => <path key={index} d={path.d} strokeDasharray={path.dash} />)}
  </svg>
}

export function GrammarLegend({ analysis, scopeId, selected, onSelect }: {
  analysis: SentenceAnalysisV1
  scopeId: string | null
  selected: GrammarFilter | null
  onSelect: (role: GrammarFilter) => void
}) {
  const inSentence = useMemo(() => sentenceLegendRoles(analysis), [analysis])
  const here = legendRolesIn(visibleRoleUnits(analysis, scopeId))
  if (!inSentence.size) return null
  return <div className="sa-legend" role="group" aria-label="句子成分图例">
    <span className="sa-legend-filters" title="点一项，只看这类成分">
    {inSentence.has('trunk') && <button className="sa-legend-item sa-legend-trunk" type="button" aria-label="查看主语和谓语"
      title={here.has('trunk') ? '同时查看主语和谓语，再次点击取消' : '这一层未标出主语和谓语'} disabled={!here.has('trunk')}
      aria-pressed={selected === 'trunk'} onClick={() => onSelect('trunk')}>
      <span className="sa-legend-pair">
        <span>主语<SampleLine kind="subject" /></span>
        <span>谓语<SampleLine kind="predicate" /></span>
      </span>
    </button>}
    {(['object', 'adverbial', 'attributive', 'complement'] as const).filter(role => inSentence.has(role)).map(role => {
      const present = here.has(role)
      const label = ROLE_LABELS[role]
      return <button className="sa-legend-item" type="button" key={role} aria-label={`查看${label}`}
        title={present ? `查看${label}，再次点击取消` : `这一层未标出${label}`}
        aria-pressed={selected === role} disabled={!present} onClick={() => onSelect(role)}>
        <span>{label}</span><SampleLine kind={role} />
      </button>
    })}
    </span>
  </div>
}
