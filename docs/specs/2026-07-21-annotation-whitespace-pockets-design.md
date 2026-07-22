# Annotation whitespace pockets and fair placement

## Scope

This design changes only the placement algorithm in the throwaway prototype:
`docs/cuts/applied-writing-lecture/prototype-annotate-v3.html`.

It does not change annotation content, the two-page teaching structure,
Xiaolai SC, Shantell Sans, the real paper geometry, or production code.

## Problem

The current algorithm scans one horizontal strip at a time. It knows that a
note fits at a given `x` and `y`, but it does not know that several adjacent
strips form one large, visually open region. Its global solver then minimizes
the sum of all placement scores. A note can be sent to a poor distant position
when that slightly improves the combined score for the other notes.

This produces two visible failures on the review page:

- “判型” loses the open area above the first body sentence even though that is
  the natural place to begin reading the annotations.
- “主时态” is pushed to the bottom although a spacious position exists farther
  left and higher on the page.

The algorithm must prioritize the place where a teacher would naturally put a
note. Connector length is optimized after that spatial choice.

## Alternatives

### Reweight the current scanline candidates

Add bonuses for `above` and `left` and increase order penalties. This is quick,
but it encodes this one essay screenshot rather than a reusable spatial rule.

### Two-dimensional whitespace pockets with fair allocation

Merge adjacent free scanline intervals into sustained rectangular pockets,
then allocate notes so no individual note is sacrificed for a better total.
This is the selected approach.

### Force-directed or annealed label placement

Let labels repel text and one another until the layout settles. This may look
organic, but it is harder to reproduce, explain, and constrain. It is not
appropriate for this deterministic teaching surface.

## Spatial model

### Build pockets

1. Use the white paper as the outer boundary.
2. Inflate English text and the review header by the existing safety padding;
   these rectangles remain hard obstacles.
3. At a 4 px vertical step, subtract obstacles from the paper width to obtain
   free horizontal intervals.
4. Measure each annotation at a small set of readable widths, from its normal
   line length down to a narrow handwritten-margin shape. Merge intervals on
   adjacent rows when their overlap can still contain that measured shape.
   Each merged run becomes a two-dimensional pocket with
   `left`, `right`, `top`, `bottom`, `width`, `height`, and `area`.
5. Remove contained duplicates and pockets too small for any annotation.

This retains the current deterministic grid while giving the solver an actual
model of vertical openness. It avoids a new geometry dependency.

### Generate human placement candidates

For each measured note shape that fits a pocket, generate candidates at:

- the point in the pocket nearest the target phrase;
- nearby positions above and below that point, at a fraction and a full note
  height, so several notes can share a tall margin without colliding;
- top-left and top-right, inset by the paper safety padding;
- bottom-left and bottom-right, inset by the same padding.

Deduplicate candidates that land within 8 px. Keep at least one candidate per
spatial lane so an early low score cannot erase a different useful direction.
Normal-width notes receive a small shape advantage; narrow wrapping is used
only when it unlocks a genuinely closer side pocket.

The lanes are `above`, `left`, `right`, `inner`, and `below`, defined relative
to the English letter bounds rather than the answer-frame border.

## Candidate quality

Hard constraints are evaluated first:

- the complete note stays inside the white paper;
- the note does not overlap English text, the review header, or another note;
- its leader does not pass through text or another note;
- leaders do not cross;
- the approved flick, short-leader, and long-leader rules remain unchanged.

Valid candidates then receive a local quality score:

1. **Pocket openness:** reward usable area around the note in both axes, not
   only spare horizontal width.
2. **Reading direction:** the earliest body annotation prefers an available
   `above` pocket; later annotations prefer the nearest open side or inner
   pocket instead of automatically falling to `below`.
3. **Clearance:** reward distance from text, borders, and other pocket edges.
4. **Connector cost:** prefer a shorter clear connector after the spatial
   qualities above are satisfied.
5. **Stable tie-break:** use the existing deterministic seed only when the
   meaningful scores are equal.

The direction rule uses anchor order and geometry, not annotation labels. The
prototype must not contain special cases for “判型” or “主时态”.

## Fair global allocation

For every note, record its best valid local score. A candidate's `regret` is
the difference between its score and that note's best score.

Compare complete layout states lexicographically:

1. place all notes;
2. minimize the worst individual regret;
3. minimize reading-order inversions within the same spatial lane;
4. minimize total regret;
5. minimize total connector and crowding cost.

This replaces a single summed cost. One note can no longer be banished to the
bottom merely because four other notes become slightly cheaper.

Within one lane, anchor order is a hard ordering constraint: if annotation A's
target appears above annotation B's target, A cannot appear materially below B.
Different lanes may have independent vertical orders.

If no full layout satisfies the hard constraints, the prototype must show the
actual `空白寻位 n/5` result. It may widen the candidate set or beam, but it must
not silently cover essay text or allow crossed leaders.

## Rendering boundary

This cut changes placement, not ink style. The existing rendering remains:

- under 20 px: one-stroke pointing flick;
- approximately 20–46 px: short asymmetric leader;
- farther away: single shallow leader with a one-sided head;
- no elbows, S curves, symmetric technical heads, or underline extensions.

## Acceptance

At the current 1470 × 719 browser viewport with `?variant=A`:

- “判型” occupies the open area above the first body sentence.
- “主时态” moves visibly left and upward into the open pocket instead of the
  lower central strip.
- “读者” does not take the first annotation's upper position.
- “要点②” retains its nearby pointing flick.
- The review page places 5/5 notes and the highlight page places 4/4 notes.
- No note covers English text; no leaders cross; all notes remain inside the
  white paper.
- Reloading without changing the seed reproduces the same layout.
- “重新寻位” may choose a different valid tie-break, but it must preserve the
  same pocket, fairness, and reading-order rules.

## Non-goals

- No production PaperSurface implementation.
- No annotation copy or teaching-content changes.
- No additional variants, interactions, animation, persistence, or geometry
  library.
- No hard-coded coordinates or label-specific placement rules.
