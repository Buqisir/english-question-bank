# Verification data authority repair

## Reproduced baseline

On clean `origin/main` at
[`5458e8c7f01d6e547d9d632d0d76fb0266641d23`](https://github.com/Buqisir/english-question-bank/commit/5458e8c7f01d6e547d9d632d0d76fb0266641d23),
the three direct Node verifiers reproduced the Detail evidence:

| Command (`node scripts/…`) | Baseline |
| --- | --- |
| `verify-similar-v2.mjs` | 82 PASS / 1 FAIL: valid `self_made` rejected |
| `verify-paper-assets-consistency.mjs` | 141 PASS / 35 FAIL: all served papers absent from dev DB inventory |
| `verify-genre-truth.mjs` | 10 PASS / 2 FAIL: nine seed passages versus 273 historical decisions |

The unchanged local `data/question-bank.sqlite` SHA-256 before work was
`a83bfd9fb19e7679a0f2e62d28266d67192d7d879c401870fe173d067783c2cc`.
`scripts/init-db.sh` applies `data/sql/schema.sql` and `data/sql/seed-v0.sql`;
`.agents/setup` and `.agents/resume` invoke it. The nine-row V0 sample is not
the tracked served corpus. Clean CI does not carry this ignored SQLite and
previously skipped the asset DB check. The seed is not corrupted by these facts.

The tracked corpus contains 291 group-derived passage IDs: every one of the
273 reviewed genre IDs is present, plus 18 newer mock-paper passages. Therefore
even importing the entire current corpus would not fix historical whole-DB
equality. The schema explicitly permits real_exam, mock_exam, self_made, other;
the engine correctly gives authenticity credit only to real_exam.

## Scope of the correction

The daily checks exercise isolated synthetic SQLite regressions against the
real schema, retain actual tracked asset and genre-artifact checks, and do not
infer corpus identity from the incidental presence of a development DB.
Negative regressions cover both orphan directions, source-only/published-only
references, failed publication, unrenderable assets, missing historical genre
rows, wrong applied values, and question-type residue on newer passages.
Similar exercises all four supported source types through the actual engine.

Explicit `--db` audits remain read-only and fail closed; assets can pair the DB
with `--paper-assets`. Historical genre coverage is a required subset, never
an intersection-only test, and applied values are now checked as well. Newer
passages are reported outside the reviewed batch, not silently genre-approved.

**This changes the daily gate's authority, not the existing local data.** A
complete suite PASS is not a complete-corpus audit PASS for the nine-row seed.
That seed must still fail the explicit assets and genre corpus audits. No
production migration, data deletion, genre apply, publication, or deployment
is included in this work. No fixture is constructed by copying a production DB.

## License / authorization evidence and applicability

The owner states existing web display/distribution authorization. Repository
inspection found no affirmative license/redistribution grant for papers or
fonts in root LICENSE/NOTICE/COPYING or relevant tracked authorization files.
This is an evidence limitation, not a finding that the owner's grant is invalid.

The supplied historical thread
[font investigation](https://ampcode.com/threads/T-01a07ebd-ffde-7649-b1f7-b1461cadca6b)
did **not** establish that grant: it distinguished CSS font stacks and
`standards/paper-canonical/rendering/times-compatible-metrics-v1.json` font
fingerprints from licenses. Neither proves Times New Roman/Songti web-font
redistribution. `server/vocabulary/assets/shuyao-hengshui.ttf` is a different
vocabulary font, without a discovered accompanying grant; its presence cannot
authorize other fonts. The historical shared-paper-layout spec cited in that
thread is absent from this checkout and is not used as current authority.

`docs/cuts/import-format-capabilities/spec.md` separates technical processing
from public-use authorization (§ source capabilities and watermarks).
`docs/cuts/I1-paper-import/pa.md` calls for synthetic or owner-cleared fixtures.
Those are restrictions, not affirmative grants.

This patch adds no paper text, font, external asset, public serving route, or
new distribution. Added SQLite fixtures contain synthetic IDs/titles and
metadata only; existing corpus checks only read already tracked artifacts.
Consequently the unverified external grant need not be expanded to implement
this verifier-only repair, and it supplies no production migration authority.

## Validation

Final command results and exact Ship evidence are recorded with the delivery.
At implementation smoke-check: similar 87/0, assets 147/0, genre 19/0.

Explicit CLI E2E used a disposable real-schema SQLite plus synthetic asset
directory: valid pair PASS; disk-only orphan and malformed JSON FAIL; historical
genre rows plus newer NULL row PASS; missing historical row and stale genre on
the newer row FAIL; valid self-made source PASS and injected invalid source FAIL.
All three missing/empty DB paths fail nonzero, do not create a database, and
never fall back to regressions. Similar cleans its temporary assets even on an
audit exception. The valid explicit source audit left its input bytes unchanged.

Against the original unchanged dev SQLite, explicit source audit is 88/0;
explicit assets audit is 147/1 (35 orphan IDs); explicit genre audit is 19/1
(273 missing IDs). These latter two are expected corpus mismatch failures, not
passes or skipped audits. The original SHA-256 remained unchanged after them.

Independent Standards/Spec review of the implementation found no Must Fix.
It specifically accepted the non-vacuous negative cases, strict optional audits,
and clearly stated daily-versus-corpus authority boundary. Follow-up self-review
closed empty-path fallback and exception-path temporary-asset cleanup, with
seven direct CLI assertions passing. Review requested this report be included
in the final tracked candidate; it is intentionally force-added because the
repository ignores `reports/` by default.
