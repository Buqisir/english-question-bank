# Golden Geometry Framework v1

This framework turns a digest-bound visual reference into renderer-neutral,
dimensionless geometry evidence. It defines measurement axes, not shared
family values. Every paper family must publish its own golden digest,
measurements, strategy classification, local renderer mapping, tolerances, and
public-artifact oracle.

## Axes

### Vertical

- semantic role and adjacency identity;
- baseline step, wrapped-line rhythm, optional-node collapse, and page relation;
- same-page, cross-page, continuation, and unsplittable-unit behavior.

### Horizontal

- row occupancy and repeated x-coordinate clusters;
- usable-content left/right bounds;
- label anchors, text-start anchors, visible content bounds, and alignment;
- track count/width, gutters, and wrapping continuation;
- strategy classification: fixed track, content-driven, distributed, or a
  declared composition of those strategies.

Raw reference pixels are evidence coordinates only. Normalize distances by a
local baseline, local font/em proxy, or usable-content width from the same
digest-bound crop. Never map JPEG pixels directly to CSS pixels, PDF points, or
full-page A4 scale.

## Strategy inference

Use repeated coordinates across rows before naming a strategy:

- stable label anchors plus text starts that vary only with label glyph width
  indicate a fixed row origin with content-driven inline label placement;
- multiple stable left-edge clusters indicate multiple tracks;
- content-dependent start positions or expanding inter-item gaps can indicate
  distribution or `space-between`;
- a stable text continuation x equal to the first-line text start is a hanging
  indent;
- absence of a wrapped golden row must be recorded as unobserved, then covered
  by a renderer fixture without claiming it was measured in the golden crop.

## Public-artifact proof

Each family oracle must use source identities independent of renderer DOM order
or production selection logic. It must execute short, long, wrapped, and
adversarial content against real Screen, Print HTML, and exact-A4 PDF artifacts.
Checks fail closed on missing or duplicate roles, wrong group/row/page, strategy
drift, split atomic units, unexplained Screen/Print parity drift, or leaked
browser/process resources.
