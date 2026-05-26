# Decisions Template

Cut:
Status:
Last synced:
Open review items:

Use this file as the decision ledger for the cut. It must reflect the
current accepted product / architecture truth, not only the original PM
proposal.

## Sync Rule

After PA or Big CR writes a report, update the status fields in the
same PR before another agent depends on this file.

If PA or Big CR opens decisions:

```text
Last synced: <date> after <PA / Big CR>.
Open review items: <N> (see <report path> §<section>)
```

After PM / PO compression resolves them:

```text
Last synced: <date> after <PA / Big CR> + PM compression.
Open review items: 0
```

## Locked Decisions

- `<decision>`

## Open Decisions

- `<decision or none>`

## Moved / Cut

- `<out-of-scope item>`
