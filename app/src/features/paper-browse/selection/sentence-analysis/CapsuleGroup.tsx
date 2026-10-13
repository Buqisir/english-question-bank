import { unitText } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import type { CapsuleGroup as Group } from './capsuleGroups'
import { capsuleLabel } from './sentencePresentation'

function LabelParts({ label }: { label: string }) {
  const [role, form] = label.split('（')
  return <span className="sa-label-parts" aria-hidden="true">
    <span className="sa-label-role">{role}</span>
    {form ? <><span className="sa-label-separator">·</span><span>{form.replace(/）$/, '')}</span></> : null}
  </span>
}

export function CapsuleGroup({ group, analysis, focusId, scopeId, onSelect, onBack, onHover }: {
  group: Group
  analysis: SentenceAnalysisV1
  focusId: string
  scopeId: string | null
  onSelect: (id: string) => void
  onBack: () => void
  onHover: () => void
}) {
  return <span className="sa-label-group" data-sa-decoration="" data-sa-group={group.kind}
    data-persistent={group.persistent ? '' : undefined} onMouseEnter={onHover}>
    {group.sharedLabel ? <button type="button" className="sa-shared-label"
      aria-label={`选择第一个并列成分：${group.sharedLabel}`} title={unitText(analysis, group.units[0])}
      onMouseDown={event => event.preventDefault()}
      onClick={event => { event.stopPropagation(); onSelect(group.units[0].id) }}>
      <LabelParts label={group.sharedLabel} /><span className="sa-parallel-label">并列</span>
    </button> : null}
    {group.units.map((unit, index) => <span key={unit.id} className="sa-label-entry">
      {group.kind === 'nested' && index > 0 ? <span className="sa-group-separator" aria-hidden="true">›</span> : null}
      <button type="button" className="sa-label" aria-label={capsuleLabel(analysis, unit, true)}
        aria-pressed={focusId === unit.id} title={unitText(analysis, unit)}
        data-sa-decoration="" data-sa-label={unit.id}
        data-current={focusId === unit.id ? 'true' : undefined}
        onMouseDown={event => event.preventDefault()}
        onClick={event => { event.stopPropagation(); if (unit.id === scopeId) onBack(); else onSelect(unit.id) }}>
        {group.numbers ? <span className="sa-member-number" aria-hidden="true">{group.numbers[index]}</span>
          : <LabelParts label={capsuleLabel(analysis, unit, unit.id === scopeId)} />}
      </button>
    </span>)}
  </span>
}
