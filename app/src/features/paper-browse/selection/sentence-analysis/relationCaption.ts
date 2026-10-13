type Point = { x: number; y: number }
type Box = { left: number; right: number; top: number; bottom: number }

function intersects(a: Box, b: Box) {
  return a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2
}

// Reserve a readable, horizontal title above the middle of this relation.
export function logicalSubjectRoute(start: Point, end: Point, boxes: Box[], width: number) {
  for (const lift of [8, 14, 22, 34, 48, 64]) {
    const rail = Math.min(start.y, end.y) - lift
    const c1 = { x: start.x, y: rail }
    const c2 = { x: end.x, y: rail }
    const points: Point[] = []
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, u = 1 - t
      points.push({ x: u*u*u*start.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*end.x,
        y: u*u*u*start.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*end.y })
    }
    const blocked = points.some(point => {
      if ([start, end].some(tip => Math.hypot(point.x - tip.x, point.y - tip.y) < 5)) return false
      return boxes.some(box => point.x >= box.left - 1 && point.x <= box.right + 1 && point.y >= box.top - 1 && point.y <= box.bottom + 1)
    })
    if (blocked) continue
    for (const index of [16, 14, 18, 12, 20]) {
      const point = points[index]
      const x = Math.min(width - 28, Math.max(28, point.x))
      const y = point.y - 7
      const box = {left:x - 27, right:x + 27, top:y - 12, bottom:y + 2}
      if (box.top < -36 || boxes.some(other => intersects(box, other))) continue
      return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
        points, caption: { x, y, text: '逻辑主语' }, captionBox: box }
    }
  }
  return null
}
