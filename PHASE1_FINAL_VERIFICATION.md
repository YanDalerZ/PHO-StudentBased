# Phase 1 final verification and independent-QA handoff

## Final status

Phase 1 Milestone 6 and the complete Phase 1 Foundation are **VERIFIED and
accepted**. Antigravity supplied the independent QA verdict after the Codex
implementation and verification run.

## Safety boundary

Every Phase 1 setup, migration, seed, and fixture workflow must receive all of
the following explicit settings before it may mutate PostgreSQL:

- `NODE_ENV=test`
- `PHO_ALLOW_DESTRUCTIVE_TESTS=true`
- expected host, port, database, and user values
- a `DATABASE_URL` that exactly matches those expected values
- the database name `pho_test`
- a local host (`localhost`, `127.0.0.1`, or `::1`)

The guard validates the parsed URL before connecting and then queries
`current_database()`, `current_user`, `inet_server_addr()`, and
`inet_server_port()` before mutation. A URL label alone is not accepted as proof
of identity. Automatic database creation remains disabled because it would need
a privileged connection to a different database.

The tracked `backend/.env` values were cleared, and `backend/.env.example`
contains placeholders only. The previously exposed database password and any
other credentials that were stored in that file must be rotated outside this
repository. Removing a value from the working tree does not rotate it or remove
it from Git history.

## Implemented contract

The Phase 1 report-export metadata table stores only the approved contract:
requester, module, CSV/XLSX format, validated filters, status
(`pending`, `running`, `completed`, `failed`, or `expired`), row count, private
storage reference, safe error code, and created/started/completed/expiry
timestamps. Phase 1 does not add patient payloads, public download URLs, export
generation, or an invented retention default.

## Verification completed by Codex

All of these commands completed successfully on the explicitly verified local
`pho_test` target:

- backend and frontend production builds
- full frontend ESLint: zero errors; two non-blocking Fast Refresh warnings
- isolated database guard tests
- fresh schema path through migrations 001-006
- schema and constraint verification
- admin permission-management integration tests
- authorization and audit HTTP integration tests under both `/api` and `/api/v1`
- frontend effective-access tests

The HTTP matrix covers authentication, explicit action grants, school scope,
same-school access independent of record creator, forged identifiers, student
transfers, administrator clinical denial, ungranted superuser filtering, module
disable behavior, immediate user/grant/assignment revocation, audit rollback and
redaction, invalid grant combinations, and route-prefix parity.

The database inventory records migration 006 in the ledger. Migrations 001-005
predate that ledger, so their historical execution cannot be proved from ledger
rows; the fresh-schema run and current constraints provide reproducible schema
evidence for them.

## Antigravity independent-QA handoff

1. Use only a disposable local database named exactly `pho_test`; never point
   these commands at a shared, staging, or production database.
2. Supply credentials privately through the process environment. Do not paste or
   log them.
3. Run `npm run test:phase1:safety` first in `backend/`.
4. Set the explicit safety variables listed above, then run:
   `test:phase1:fresh-schema`, `verify:phase1:schema`,
   `test:phase1:permission-management`, and `test:phase1:authorization`.
5. In `frontend/`, run `npm run lint`, `npm run build`, and
   `npm run test:phase1:effective-access`.
6. Confirm the browser hides ungranted navigation and actions, direct route
   access is blocked, and a server 403 reloads effective access before the next
   authorization decision.
7. Report an independent verdict of `VERIFIED` or `REJECTED` with the failing
   command/scenario. Do not treat this Codex run as independent QA evidence.
