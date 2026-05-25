---
inclusion: auto
---

# UI mockup before DEV protocol

Scope: applies to important UI, layout, and visual decisions in the
`Buqisir/english-question-bank` repository. This protocol exists to
reduce rework when a feature depends on spatial proportion, reading
flow, or visual trust.

Authoritative rule: for important UI decisions, generate and discuss
2-4 visual mockups / proportional diagrams before writing the DEV
implementation prompt.

---

## 1. When to use this protocol

Use this protocol before DEV when the task involves:

- major page layout changes
- paper / rail / side panel / right panel balance
- sticky headers, hover rails, drawers, popovers, overlays, or sidebars
- visual hierarchy that affects teacher trust
- product states that are hard to describe in text
- peer feedback about spacing, color, size, or "feel"
- the user says "我感觉不对但说不清", "先看图", "先生图",
  "出个比例图", or equivalent

Especially apply it to PaperSurface and Paper Intelligence surfaces,
where small layout choices can affect whether the page feels like a
real teacher workbench or an AI toy.

## 2. When NOT to use it

Usually skip image mockups for:

- typo fixes
- pure data/model/adapter work
- verify-script-only work
- small CSS bug fixes with an obvious single outcome
- backend/server changes
- refactors that do not change visible UI

If the visual direction is already approved and the change is purely
mechanical, go straight to DEV.

## 3. Required workflow

For important UI work, follow this order:

1. Grill the product question first: teacher task, failure mode,
   current cut vs. future cut, and what the PO actually needs to
   decide.
2. State which mockups should be generated.
3. Generate 2-4 images.
4. Let the user choose, reject, or modify the direction.
5. Translate the chosen image into hard DEV constraints.
6. Only then send the DEV prompt.

Do not skip from "rough visual concern" directly to implementation
when a quick mockup could clarify the spatial model.

Hard brake: if two mockup rounds do not converge, stop generating
images and return to problem definition. More images will not fix an
unclear product question.

## 4. Recommended mockup set

For layout work, prefer a small set like:

1. current problem view, or conservative option
2. recommended target default state
3. expanded / active interaction state
4. aggressive option, anti-pattern, or before-vs-after comparison

For responsive work, first settle the desktop main state. Generate
breakpoint mockups only if the desktop direction is approved or if the
breakpoint itself is the decision.

## 5. Mockup rules

Mockups should be:

- proportional, not decorative
- labeled in Chinese when they are for product discussion
- clear about what is paper, rail, gutter, panel, popover, or overlay
- explicit about default state vs active / hover / focus state
- honest about what may temporarily overlay content

Mockups are discussion artifacts. They are NOT production assets and
must not be added to the app bundle unless the user explicitly asks.

## 6. Turning mockups into DEV prompts

After the user accepts a direction, the DEV prompt must convert the
image into concrete constraints:

- which container changes
- which files are allowed / forbidden
- default state
- hover / focus / active state
- expected widths, max-widths, gaps, and z-index relationships
- what must not move or regress
- browser QA checklist

Do not tell DEV to "make it like the image" without hard constraints.
The image aligns intent; the prompt defines implementation.

## 7. Relationship to QA

Image approval does not replace browser QA.

After implementation, still verify the real page:

- screenshots / visual inspection
- computed styles for key colors and z-index
- DOMRect checks for popovers and sticky anchors
- scroll behavior
- responsive breakpoints

The purpose of mockups is to reduce avoidable rework before code, not
to waive verification after code.

## 8. Product principle

For this product, important UI should preserve the teacher's reading
flow:

- the paper remains visually primary
- AI support is hidden by default but one gesture away
- panels should feel like a workbench, not a floating admin card
- layout choices must support teacher trust, not only fit the pixels
