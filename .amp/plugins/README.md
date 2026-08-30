# Source-intake wakeup plugin

`source-intake-wakeup.js` is the optional wakeup layer for the Owner source-intake queue.
SQLite remains authoritative: a missed, duplicated, or delayed webhook cannot create a second
active claim.

The plugin is inert by default. Activating it is a separate shared-state operation and requires
current Owner approval. Enable it only in the dedicated owning Orb thread, not in every local Amp
client. Before loading it, set these only in the private Amp/plugin environment:

- `QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED=1`
- `QUESTION_BANK_SOURCE_INTAKE_RUNNER_ID=<stable private Mac runner ID>`
- `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET=<shared HMAC secret>` (recommended)

After an approved plugin reload, explicitly run the command-palette action
`题源 Agent: 复制题源队列 Webhook URL`. Put the returned capability URL in the API server’s
private `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_URL`; configure the same HMAC secret as
`QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET`. Never commit or log any of those values.

The Mac runner must already have the repository checkout and private
`QUESTION_BANK_IMPORT_OPS_ORIGIN` / `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN` environment needed
by `scripts/import-pipeline/source-intake.mjs`. The plugin creates a private thread on that runner;
it does not import inside the 30-second webhook handler.
