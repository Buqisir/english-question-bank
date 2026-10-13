// Curve and arrowhead proportions ported from neat-annotations
// https://github.com/syabro/neat-annotations
// MIT License, Copyright (c) 2026 Maxim Syabro

export type NeatPoint = { x: number; y: number }

type Shape = { c1: [number, number]; c2: [number, number] }

// Control points as (along chord, across chord) fractions of the chord, measured from the start.
const DIAGONAL: Shape = { c1: [0.214, 0.105], c2: [0.607, 0.052] }
const STRAIGHT: Shape = { c1: [0.28, -0.03], c2: [0.67, -0.03] }

const DIAGONAL_HEAD = { back: 6, side: 2.8 }
const STRAIGHT_HEAD = { back: 6, side: 2.8 }

function isDiagonal(dx: number, dy: number) {
  const quarter = Math.PI / 2
  const angle = ((Math.atan2(dy, dx) % quarter) + quarter) % quarter
  return Math.abs(angle - quarter / 2) < Math.PI / 8
}

export function neatCurve(start: NeatPoint, end: NeatPoint, bend: 1 | -1 = 1) {
  const vx = end.x - start.x
  const vy = end.y - start.y
  const shape = isDiagonal(vx, vy) ? DIAGONAL : STRAIGHT
  const at = ([along, across]: [number, number]): NeatPoint => ({
    x: start.x + along * vx - across * bend * vy,
    y: start.y + along * vy + across * bend * vx,
  })
  const c1 = at(shape.c1)
  const c2 = at(shape.c2)
  return { c1, c2, d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}` }
}

export function neatHead(tip: NeatPoint, previous: NeatPoint): [NeatPoint, NeatPoint] {
  const dx = tip.x - previous.x
  const dy = tip.y - previous.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const { back, side } = isDiagonal(dx, dy) ? DIAGONAL_HEAD : STRAIGHT_HEAD
  return [
    { x: tip.x - ux * back - uy * side, y: tip.y - uy * back + ux * side },
    { x: tip.x - ux * back + uy * side, y: tip.y - uy * back - ux * side },
  ]
}
