import policy from '../../standards/paper-canonical/rendering/application-writing-drawing-area-v1.json' with { type: 'json' }

export const applicationDrawingAreaPolicy = Object.freeze(policy)
// Both surfaces use the version-bound fraction, including the label and border.
export const applicationDrawingAreaStyles = Object.freeze({
  top: Object.freeze({ display: 'grid', gridTemplateColumns: `minmax(0, ${1 - policy.widthRatio}fr) minmax(0, ${policy.widthRatio}fr)`, alignItems: 'start', flexShrink: 0 }),
  given: Object.freeze({ minWidth: 0, paddingRight: '1em', overflowWrap: 'anywhere' }),
  area: Object.freeze({ width: '100%', aspectRatio: String(policy.aspectRatio), boxSizing: 'border-box', padding: `${policy.labelPaddingPx}px`, border: 'var(--drawing-area-border, 1px) solid currentColor', textAlign: 'left', textIndent: 0, overflowWrap: 'anywhere' }),
})
