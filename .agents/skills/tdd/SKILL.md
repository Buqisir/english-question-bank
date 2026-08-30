---
name: tdd
description: Test-driven development through public seams. Use when the user explicitly requests test-first work, red-green-refactor, or integration tests.
license: MIT
metadata:
  source: https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/tdd
  revision: 6654f6b60cd9d5be8b54c6fafe44346dabeb3b76
  adapted-for: english-question-bank
---

# Test-Driven Development

TDD is the red → green → refactor loop. This skill makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` and relevant ADRs for domain or architecture work so test names and interfaces match the project's language. Follow the repository's `AGENTS.md` and the proportionate verification routes in `docs/agents/testing-cadence.md`; those project rules override this general workflow.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

Before writing a test, identify the seam under test. Prefer the repository's established public seams, especially its deterministic verifier scripts and affected Screen/Print/PDF routes. If the accepted spec or existing contract makes the seam clear, proceed without ceremony. Ask the user only when choosing a seam would materially change the contract, scope, or verification cost.

When the interface itself is in question, use the vocabulary and ownership boundaries already established by `CONTEXT.md`, relevant ADRs, and the named spec or ticket. Do not invent a new seam merely to make a test easy.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, run it, then write only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactor only while green.** After the test passes, improve the implementation only where the current slice justifies it, then rerun the focused test before beginning another slice.
- **Finish at the affected public seam.** Run the narrowest applicable project verifier after the focused cycles; use `verify:all` only when the repository's risk rules call for it.
