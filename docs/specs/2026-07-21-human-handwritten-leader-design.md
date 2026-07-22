# Human handwritten annotation leaders

## Scope

This design changes only the throwaway applied-writing annotation prototype:
`docs/cuts/applied-writing-lecture/prototype-annotate-v3.html`.

It answers one visual question: when a note is already close to the English
sentence it explains, how should the leader look like something a teacher
would actually draw?

## Problem

The current connector starts from a generic point on the note and often aims
at the end of the annotated sentence. A nearby note can therefore receive a
long horizontal arrow. The arrow also appears to grow out of the sentence
underline. Perfectly straight geometry, uniform stroke weight, and a symmetric
arrowhead make the result look diagrammatic instead of handwritten.

## Approved behavior

Use proximity before routing:

- A nearby note uses the shortest clear gap between the note edge and the
  annotated phrase. Its leader should normally be 20–45 px long.
- The leader and the sentence underline are separate marks. Leave a visible
  gap between them.
- A nearby leader is one short, slightly asymmetric stroke. Its arrowhead is a
  single quick flick rather than a symmetric technical arrowhead.
- If the note is close enough that alignment already makes the relationship
  unambiguous, a pointing flick under 20 px may replace a full arrow.
- A long shallow leader is reserved for notes that cannot be placed near their
  target without covering the essay or another note.

## Placement and routing

For each note candidate, calculate the rectangular gap between the note box
and every meaningful line rectangle belonging to its target phrase. Ignore a
wrapped tail narrower than 48 px or 18% of the widest line when a fuller line
from the same phrase exists; a fragment such as `me.` is not a useful teaching
target by itself.

1. Prefer the target rectangle with the smallest unobstructed gap.
2. Start at the nearest boundary point of the note, not its center.
3. End just outside the nearest boundary of the target phrase, not at the
   sentence endpoint and not on the underline.
4. When the gap is at most 56 px, reject a route longer than `gap + 24 px`.
5. Score connector length strongly enough that moving a note slightly is
   cheaper than drawing an unnecessarily long arrow.
6. Preserve the existing whole-page constraints: notes remain inside the
   paper, do not cover essay text, and leaders do not cross one another.

The lower-right “要点②” note is the acceptance example: it should sit close to
`beauty around me` and point back with a short diagonal flick, not a horizontal
arrow running along the sentence underline.

## Rendering

- Draw the short leader as a shallow quadratic stroke with deterministic,
  subtle asymmetry; do not use an elbow or S curve.
- Keep round caps and joins.
- Use a slightly lighter main stroke and one firmer arrow flick to suggest pen
  pressure without adding animation or random movement between renders.
- Do not rotate the annotation text. Xiaolai SC remains the Chinese annotation
  face and Shantell Sans remains the English essay face.

## Prototype acceptance

- The lower-right nearby annotation uses a visibly shorter connector than the
  current screenshot, with a clear gap from the sentence underline.
- No nearby connector looks as if it extends the underline.
- Review page still places all 5 notes; highlight page still places all 4.
- No leaders cross, no note covers essay text, and every note stays inside the
  white paper.
- Browser screenshots at the current 1470 × 719 viewport make the target and
  note relationship clear without debug overlays.
