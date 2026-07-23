# Model and effort guidance

The owner creates top-level tasks manually. This table is a cost/quality
recommendation to include in `Next`, not a dispatch authority or state machine.

Matt's effort rule is **start low and creep up**. More effort spends more
tokens, reaches attention degradation sooner, and is not a free quality switch.
Always report the effort next to the model. Raise it only when the task is
genuinely difficult or a lower setting has shown visible quality loss.

| Work | Recommended model | Starting effort |
| --- | --- | --- |
| Ask Matt, Wayfinder, grilling, domain modeling, spec | `gpt-5.6-sol` | `medium` |
| Ordinary code research | `gpt-5.6-terra` | `low` |
| `/implement` ticket | `gpt-5.6-terra` | `medium` |
| Independent `/code-review` | `gpt-5.6-sol` | `medium` |
| QA preparation and mechanical shipping work | `gpt-5.6-terra` | `low` |
| Proven difficult work or a retry after visible quality loss | keep the role's model | `high` |

`xhigh`, `max`, and `ultra` require explicit owner direction and evidence that
the lower setting is inadequate. They are never a ritual attached to a role,
cut size, or final review.

If a route is unavailable, tell the owner and recommend the closest sensible
choice. Do not log availability probes, build substitution ledgers, or create a
blocked dispatch state. Model selection does not change product risk gates.
