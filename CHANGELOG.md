# Changelog

## [1.0.1.0] - 2026-09-22

### Added

- Publish the separate bench demo on Cloudflare Workers with a Neon production database and immediate read-after-write results through Hyperdrive.
- Document manual releases and credential-safe Neon setup, and include the requested Neon project skills.
- Run the browser flows in the Workers runtime alongside database connection lifecycle tests.

### Fixed

- Keep each Worker's database connections within its request and release them after streamed responses finish, fail, or are cancelled.
- Build deployments from the source configuration and regenerate route types before type checks.

## [1.0.0.0] - 2026-09-22

### Added

- Browse 520 sample park benches on a searchable map and list, view current supporters and adoption dates, and adopt an available bench without payment.
- Manage inventory, donor contacts, adoption corrections, renewals, cancellations, and audit history in an open staff workspace.
- Preview and import bench or adoption CSV files atomically, and export filtered staff records.
- Prevent overlapping adoptions with PostgreSQL constraints and transactions; keep donor contact details private.
- Run the application locally with documented setup, assumptions, deployment steps, and automated unit, database, and browser checks.
