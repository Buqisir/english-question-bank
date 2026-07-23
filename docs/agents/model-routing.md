# Model guidance

The owner creates top-level tasks manually. This table is a cost/quality
recommendation to include in `Next`, not a dispatch authority or state machine.

| Work | Recommended model | Effort |
| --- | --- | --- |
| Ask Matt, Wayfinder, grilling, domain modeling, spec | `gpt-5.6-sol` | `high` |
| Ordinary code research | `gpt-5.6-terra` | `medium` |
| `/implement` ticket | `gpt-5.6-terra` | `medium` |
| Gnarly cross-module implementation or repeated failure | `gpt-5.6-terra` | `high` |
| Independent `/code-review` or high-risk design review | `gpt-5.6-sol` | `high` |
| QA preparation and mechanical shipping work | `gpt-5.6-terra` | `medium` |
| High-risk final review when explicitly justified | `gpt-5.6-sol` | `xhigh` |

`max` and `ultra` require explicit owner direction.

If a route is unavailable, tell the owner and recommend the closest sensible
choice. Do not log availability probes, build substitution ledgers, or create a
blocked dispatch state. Model selection does not change product risk gates.
