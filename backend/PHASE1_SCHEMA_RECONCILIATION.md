# Phase 1 schema reconciliation

Migration `006_v5_phase1_schema_reconciliation.sql` is a forward-only repair for
databases whose schema matches the repository's post-005 state. Do not execute
the SQL file directly. The TypeScript runner verifies the prerequisite schema,
runs the SQL and records its SHA-256 checksum in one transaction.

For the approved disposable local database, set the test guard variables from
`TEST_DATABASE_SAFETY.md`, then run:

```powershell
npm run migrate:phase1:reconcile
npm run verify:phase1:schema
npm run test:phase1:fresh-schema
```

The first command reports `applied` once and `already-applied` on a repeat run.
It stops with a nonzero exit when the pre-005 schema is incomplete, the recorded
checksum conflicts with the migration file, or existing data violates a new
constraint.

The fresh-schema command is destructive and is guarded to the exact local
`pho_test` identity. It rebuilds the base schema, applies migrations 001–006,
and leaves a minimal set of actor-attributed test grants for verification.

The migration:

- soft-revokes only the exact actorless grant shapes created by migration 002;
- leaves actor-attributed permission grants and historical rows unchanged;
- adds and validates the invitation, submission, and submission-event status
  constraints that migration 003 could not retrofit;
- creates only export-job metadata in `REPORT_EXPORTS`; and
- records a redacted system audit event when implicit grants are revoked.

`REPORT_EXPORTS` stores requester, module, CSV/XLSX format, validated-filter
metadata, lifecycle status, row count, private storage reference, safe error
code, and timestamps. It contains no patient payload, public URL, generated
export, or default expiry/retention policy.
