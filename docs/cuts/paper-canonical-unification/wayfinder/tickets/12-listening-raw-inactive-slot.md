# 定义听力 raw/inactive 插槽与未来 activation seam

Status: closed
Type: prototype
Claim: claimed
Blocked by: 定义卷型模板与整卷装配单合同; 定义读后续写 canonical variant 与 starters 合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/13-atomic-sidecars-and-consumer-selector.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What minimal listening facts must the Paper Format Profile, Canonical Paper Plan, Source Capture, and Normalization Report carry now so a full paper is structurally complete while listening remains `raw/inactive`? Define completeness checks for questions, options, official answers, transcript segments, timing data when supplied, and absent audio; define the seam that a future active listening model would have to satisfy. Do not create a website Question Group, renderer, analysis pipeline, or speculative audio schema beyond what current source material proves.

## Resolution

[Prototype asset: Listening raw/inactive slot and future activation seam](../../prototypes/listening-raw-inactive-slot.md)

Keep listening as two required **Inactive Source Slots**:
`listening.short-dialogue` (questions 1–5, five transcript segments) and
`listening.long-form` (questions 6–20, five transcript segments). Both use
`activation: inactive_source`, `renderPolicy: suppress`, and versioned
`listening-raw-closure@nck1-v1`; they bind validated source closures in the
complete-only Plan, never carry `groupRef`, emit zero Canonical Question
Groups, and reach no current consumer.

The Paper Format Profile owns exact question ranges/cardinality, A–C option
labels, one official answer per Question, five segments per slot with
exactly-once Question coverage, literal preservation of timing when supplied,
and the ruling that audio is not required for inactive closure. The Plan
stores only `sourceSliceRefs` plus an exact Report closure reference/digest.
It does not duplicate question, answer, transcript, timing, or audio facts.

Source Capture retains immutable source bytes/digests/roles, source-mapped
observations for every listening instruction/question/option/official-answer/
transcript/timing value, and a closed received-artifact inventory. Because
absence is not a Source Span fact, `timing.not_supplied` requires a fully
observed transcript slice with no timing table; `audio.not_supplied` requires
a closed inventory with no captured audio reference.
Supplied audio is captured opaquely with bytes/media type/length/digest;
codec, duration, segmentation, playback, and alignment semantics remain
undefined. Referenced audio without bytes/digest is `incomplete_source`.

The Normalization Report owns both per-slot closure records, direct source maps,
exact join Transformation Records, conditional timing/audio dispositions, and
diagnostics. Missing question/option/answer/segment/timing evidence is
`incomplete_source`; a clearly complete non-NCK1 shape is `unsupported`;
official-answer disagreement is `answer_conflict`; and multiple plausible or
overlapping transcript joins are `needs_review`. Only two closed listening
slots may contribute to a whole-paper `ready` result, still with zero
listening Groups.

The only current raw proof, `paper-2026-i`, has 5+15 questions with A–C,
20 answers, ten transcript segments, ten source-supplied timing rows, and no
audio artifact. Staging and `latest` raw JSON copies are byte-identical. They
prove the shape but are not themselves a Source Capture because they lack
typed Source Spans, extraction provenance, immutable document closure, and a
closed input inventory.

Future activation keeps `compileCanonicalPaper(request)` as the sole external
Module interface. It requires a new Profile version changing the slot to
`canonical_group`, a versioned active listening family contract, and a private
family compiler that consumes Source Capture observations and emits a
source-mapped conforming Group. That future contract must decide its own
transcript/timing/audio semantics and separately ship verified website,
renderer, and Analysis consumers; it cannot mutate this inactive Plan or
promote the closure itself into a Group. A public listening plugin port is
rejected now because only one inactive implementation exists.

The throwaway logic prototype reported `PASS 11 / FAIL 0` across complete,
optional-timing, incomplete-source, unsupported, answer-conflict,
needs-review, and absent/missing-audio scenarios, then was deleted. No
production Question Group, renderer, Analysis, audio schema, Fog graduation,
or new ticket is created. `CONTEXT.md` now records the resolved **Inactive
Source Slot** domain term. The existing atomic-sidecar ticket remains the
declared successor.
