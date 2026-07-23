# Codex model routing authority

This is the sole current authority for exact Codex model IDs, thinking levels,
role routing, upgrades, and unavailable-model substitution. Other current
rules may require explicit routing, but must not duplicate this table.

## Default routes

| Next role | Configured model | Thinking | Upgrade / boundary |
| --- | --- | --- | --- |
| Wayfinder, PM, grilling, domain modeling, spec | `gpt-5.6-sol` | `high` | No standing upgrade |
| Ordinary code research / factual investigation | `gpt-5.6-terra` | `medium` | Architecture, schema, data-contract, or irreversible design: Sol/high |
| PA | `gpt-5.6-sol` | `high` | Large, contract-level, or irreversible: Sol/xhigh |
| DEV / fix DEV | `gpt-5.6-terra` | `medium` | Genuinely complex, cross-module, or repeated-failure implementation: Terra/high |
| Verification, QA preparation, mechanical state update | `gpt-5.6-terra` | `medium` | Human QA remains owner-only |
| Fresh CR / re-review / RM | `gpt-5.6-sol` | `high` | Big CR follows its separately justified escalation |
| Small clear-boundary direct modification | `gpt-5.6-terra` | `medium` | Normal risk gates still apply |

`max` and `ultra` require explicit owner direction; they are not standing
routes. Every dispatch independently classifies its next role and passes both
`model` and `thinking` to task creation. It never inherits the predecessor's
selection.

## Availability and substitution

Each configured primary has the finite same-family/same-grade candidate set
`[configured primary]`. A dispatcher queries the task-creation capability for
available models and supported thinking levels, then selects the first
authority-listed candidate whose recorded family/grade is the configured
family/grade and which supports the requested thinking level.

The durable dispatch record names: configured model, selected model, requested
thinking, availability source, supported-thinking evidence, family/grade
eligibility proof, and any substitution reason. It must not infer a family,
grade, or lower thinking level. If the eligible intersection is empty, record
`missing-authority` and `dispatch-failed`, create no task, and use only the
existing bounded fallback path.

This governance cut's DEV bootstrap was an owner-locked one-time exception
because this file did not yet exist. It authorizes no later exception.
