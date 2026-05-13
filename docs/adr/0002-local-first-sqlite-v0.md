# Local-first SQLite for V0

V0 uses a local-first SQLite data store instead of a hosted database. The project is currently for one teacher, needs reliable local import/export, and should avoid account, deployment, and privacy complexity until the product workflow is proven.

## Considered Options

- Hosted database now: easier future sharing, but adds login, deployment, backup, and privacy decisions too early.
- Local SQLite now: faster to build, easy to inspect, works offline, and can migrate later when sharing becomes real.

## Consequences

- V0 does not include login, roles, or cloud sync.
- Import files and exports stay on the local machine.
- The schema should avoid local-only assumptions that would block future cloud migration.
