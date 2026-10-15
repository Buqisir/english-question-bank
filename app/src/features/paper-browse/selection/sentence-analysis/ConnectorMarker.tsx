import { connectorTarget } from './sentencePresentation'
import { unitDisplayLabel } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { FocusState, SentenceAnalysisV1, Unit } from '../../../../../../shared/sentence-analysis/types.d.mts'

export const CONNECTOR_TRIANGLE = 'M 3.3 11.5 C 4.2 8.7 5.9 5.8 7.4 2.5 C 7.8 1.7 8.2 1.9 8.7 2.8 C 9.8 5.2 11.2 8.2 12.9 11.2 C 13.5 12.2 12.9 12.6 11.8 12.6 C 8.8 12.9 5.6 12.6 2.6 12'

export function ConnectorMarker({ analysis, connector, focus, onSelect }: {
  analysis: SentenceAnalysisV1; connector: Unit; focus: FocusState; onSelect: (id: string) => void
}) {
  const target = connectorTarget(analysis, connector)
  const active = focus.kind === 'unit' && (focus.unitId === target.id || focus.unitId === connector.id)
  const word = connector.spans.flatMap(span => analysis.tokens.slice(span.start, span.end).map(token => token.text)).join(' ')
  const title = unitDisplayLabel(analysis, target) || '连接结构'
  return <button type="button" className="sa-ink-connector" data-sa-decoration="" data-connector-id={connector.id}
    aria-label={`${word}：${title}`} title={`${word} · 引导${title}`} aria-pressed={active}
    onClick={event => { event.stopPropagation(); onSelect(target.id) }}>
    <svg width="13" height="12" viewBox="0 0 16 15" aria-hidden="true">
      <path className="sa-ink-triangle-fill" d={`${CONNECTOR_TRIANGLE} Z`} />
      <path className="sa-ink-triangle-stroke" d={CONNECTOR_TRIANGLE} />
    </svg>
  </button>
}
