# Paper Typography v10 migration

Paper Typography v10 succeeds v9
(`sha256:656c3b97dc9151dce770c7da23098da7294d979e5b9f3e656be9baba18758684`)
without modifying it.

It advances the NCK1 section-heading contract to v2 and changes only the
numeric-run baseline calibration from `0.2em` to `0.1em`. The value is derived
from the owner-QA local visible-glyph comparison; it is not a conversion from
reference screenshot pixels to paper units. The existing one Song font stack,
regular weights, font size, line height, text rules, and all six public
surfaces remain bound by the successor. The pre-existing PDF part-to-first-
section gold relation retains its `0.2em` numeric baseline calibration, so
print media compensates the new run shift without changing the accepted PDF
part-to-section visible-glyph relation; Screen retains its already-passing
layout relation.
