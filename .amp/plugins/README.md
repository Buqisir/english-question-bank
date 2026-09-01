# Project plugins

## NCK1 staged-analysis agent

`nck1-analysis-agent.js` registers `nck1_analyze_group` for the paper-import
coordinator. It deliberately fixes one worker configuration instead of reusing
one conversation:

- model: `openai/gpt-5.6-sol`;
- reasoning effort: `medium`;
- tools: none;
- context: one new child thread per invocation;
- input: one source group, that group's authoritative answers, its tracked
  output contract, and the shared teaching doctrine;
- output: a small provenance envelope whose `analysis` member is the generated
  JSON object; actual model identity is stamped and invented reviewer/time
  fields are removed; the tool never writes files.

Application and Continuation calls must use the tracked composed contracts from
`buildApplicationStagedAnalysisContract` and
`buildNarrativeContinuationStagedAnalysisContract`. The plugin rejects either
writing group's base prompt without its staged packaging contract.

The unique paper writer validates `result.analysis` through the existing
type-specific validator before saving the corresponding staged file. Grammar
Fill first runs `stampGrammarFillDerivedFields`, then validates. The writer must
not pass a whole paper to this tool. Model changes are explicit code changes,
not per-call options. Run `node scripts/verify-nck1-analysis-agent-plugin.mjs`
after changing this boundary.

## Source-intake wakeup plugin

`source-intake-wakeup.js` is the optional wakeup layer for the Owner source-intake queue.
SQLite remains authoritative: a missed, duplicated, or delayed webhook cannot create a second
active claim or a second bound worker.

The plugin is inert by default. Activating it is a separate shared-state operation and requires
current Owner approval. Enable it only in the dedicated owning Orb thread, not in every local Amp
client. Before loading it, add these as private Amp Project Secrets so both the plugin and each new
project Orb receive them without storing or displaying their values:

- `QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED=1`
- `QUESTION_BANK_IMPORT_OPS_ORIGIN=<private Import Ops HTTPS origin>`
- `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN=<least-privilege source-intake Agent token>`
- `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET=<shared HMAC secret>` (recommended)

After an approved plugin reload, explicitly run the command-palette action
`题源 Agent: 复制题源队列 Webhook URL`. Put the returned capability URL in the API server’s
private `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_URL`; configure the same HMAC secret as
`QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET`. Never commit or log any of those values.

The server reserves each immutable submission before the plugin creates an empty private project
Orb. The plugin durably binds the returned Amp thread id before appending the first prompt. A crash
before bind therefore leaves only an inert, unprompted Orb; a repeated delivery resumes the one
bound thread. `scripts/import-pipeline/source-intake.mjs` sends `AMP_THREAD_ID` on every claim and
lease operation. The Agent token cannot approve Review content or promote a paper. No import runs
inside the 30-second webhook handler.

Creating the secrets, enabling/reloading the plugin, and configuring the webhook are shared-state
operations that remain disabled until separately authorized by the Owner.
