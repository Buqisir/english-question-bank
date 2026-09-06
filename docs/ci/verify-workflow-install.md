# CI verification

The dedicated CI Orb receives signed GitHub webhooks, runs the trusted
controller's isolated required lanes (main always Fast+Full), and publishes `Amp Orb Verify`
from App ID `4835036`. This exact-SHA GitHub Check is the sole CI authority.
The Hosted workflow and former copy-and-install template are retired.

Normal Ship reads GitHub directly: use the current PR head's v6 binding to
base/tested merge/tree/policy/delivery, or exact live main's v4 binding.
PR reduction is authorized only by the installed trusted policy; default and
rollback are always-full. No Focused/Low report or private-receipt retrieval is required.
The original High thread is only the infrastructure host; Low is for requested
troubleshooting. See [ADR-0025](../adr/0025-repo-only-app-check-deployment-authority.md)
and the [CI runbook](../agents/app-ci-cutover.md) for authority, acceptance and
rollback boundaries. Historical installation notes are evidence, not instructions.
