# Passage-first question bank model

We model the question bank around **Passage -> Question Group -> Question**, not around isolated questions. This preserves exam context, supports teacher search by theme and discourse, and keeps future recommendation work focused on teachable materials rather than detached items.

## Considered Options

- Isolated question bank: simpler for storage, weaker for English teaching and passage-based exams.
- Passage-first model: more structure upfront, better match for reading, cloze, seven choices, grammar cloze, writing, and continuation tasks.

## Consequences

- Search results should usually aggregate around question groups.
- Manual entry must create or select a passage before adding most question groups.
- Future AI tagging should evaluate passages and question groups before individual questions.
