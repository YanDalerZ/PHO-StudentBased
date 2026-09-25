# Plan v5 Phase 1 production release runbook

This runbook is limited to authorization and data foundations. It must not be
used to enable the Phase 2 public QR or review-queue runtime.

## Safety invariants

- Never run `database/schema.sql`, `database/seed.sql`, `DROP SCHEMA`, a reset
  script, or a destructive test command against production.
- HTTP startup never runs migrations. `npm start` only starts `dist/index.js`.
- Keep `backend/.env`, real access manifests, database URLs, JWT secrets, CA
  material, and account passwords outside Git. Render is the production secret
  store.
- Migration 007 is forward-only and additive. It retains the legacy `users.role`
  column so the previous application revision can still authenticate during an
  application rollback.

## Required owner inputs

Before the release window, the Render/Aiven owner must provide:

1. A successful Aiven backup or point-in-time recovery marker and confirmation
   that restore has been rehearsed.
2. The current production `DATABASE_URL` and CA certificate through Render
   secrets only.
3. An approved access manifest, kept outside the repository, covering every
   active `school_staff` and `superuser`. Each school assignment and module grant
   must name an active admin approver. Admins must not appear in the manifest.
4. Confirmation of the Render service root/build/start settings and the approved
   public application origin.

## Read-only preflight

Run from `backend` in a Render shell or an equivalent restricted release shell:

```sh
npm ci
npm run preflight:production:phase1
```

The command opens a PostgreSQL `READ ONLY` transaction and reports the safe
database identity, supported schema state, required tables/columns/indexes,
legacy and portal-role counts, account status counts, access-readiness counts,
and checksum ledger. It does not print credentials, account identities, patient
data, or clinical payloads.

Proceed only when `schemaVersion` is `phase4-clean`, `partial-v5`, or
`phase1-release`. An `unknown` result is an abort requiring owner review.

## Explicit migration

Prepare the real manifest using `backend/access-manifest.example.json` as a
shape reference, but do not add it to Git. Then invoke the migration explicitly:

```sh
NODE_ENV=production \
PHO_PRODUCTION_MIGRATION_ACK=APPLY_PHASE1_V5 \
PHO_ACCESS_MANIFEST_PATH=/secure/release/phase1-access.json \
npm run migrate:production:phase1
```

The runner:

- accepts only a clean Phase 4 schema, the known partial v5 schema, or an
  already-reconciled Phase 1 schema;
- verifies any existing migration-ledger checksums for migrations 002-007;
- acquires a PostgreSQL advisory transaction lock;
- applies migration 007, the approved access manifest, validation, audit events,
  and the checksum-ledger row in one transaction;
- revokes actorless grants left by migration 002 and rejects duplicate active
  grants/assignments instead of guessing which row is authoritative;
- aborts and rolls back if an active staff/superuser lacks explicit access, an
  admin has clinical access, a school assignment has no actor, or the schema is
  unknown.

Run the read-only preflight again after migration and archive its redacted JSON
with the release record.

## Render deployment order

1. Freeze account/grant changes for the release window.
2. Confirm the Aiven recovery point and record its timestamp/identifier outside
   this repository.
3. Run the read-only preflight and review all warnings.
4. Apply migration 007 with the approved external access manifest.
5. Run the read-only preflight again.
6. Configure Render secrets: `DATABASE_URL`, `JWT_SECRET`, CA certificate or
   `DB_CA_CERT`, and `APP_ORIGIN`. Set frontend build variable
   `VITE_API_URL=/api/v1`; this is same-origin and the backend also retains the
   `/api` compatibility alias.
7. Build from `backend` with `npm run render-build` (or the equivalent Render
   build command) and start with `npm start`.
8. Complete the smoke checklist before lifting the account/grant freeze.

## Rollback and restore

- Before commit: any migration error causes a PostgreSQL transaction rollback;
  investigate and rerun the preflight. Do not edit the ledger or apply SQL by
  hand.
- After database commit but before a healthy app deploy: roll Render back to the
  previous application revision. Migration 007 is additive and retains the
  legacy role column, so application rollback does not require a down migration.
- If migrated data itself must be reversed: stop writes, preserve the failed
  database for investigation, restore the owner-approved Aiven snapshot/PITR to
  a separate instance, run the preflight against that restored instance, and
  only then repoint Render under owner approval. Do not drop or mutate the
  original production database as a rollback technique.

## Post-deploy smoke checklist

- Login succeeds for one approved `school_staff`, `superuser`, and `admin`.
- `GET /api/v1/auth/me` and `GET /api/auth/me` return `user.portal_role` plus
  `effectiveAccess.assignedSchoolIds` and all module action flags.
- School staff enter `/teacher/dashboard` only when Patient Information view is
  granted; an account without an enterable grant sees the stable 403 page.
- A superuser with only one module is redirected to that module, not to an
  ungranted Patient Information dashboard.
- Admin enters `/admin/dashboard` and receives 403 from every clinical module
  route.
- A missing action grant and an out-of-scope school both return a JSON 403, with
  no logout, redirect loop, or blank page.
- Revoking a grant takes effect on the next API request without restarting the
  service.
- `/api/lookup/municipalities`, barangays, and schools work under both `/api`
  and `/api/v1` and respect the user's scope.
- No public `/register/:token` page, review-queue navigation, or QR runtime API
  is exposed by this Phase 1 release.
- Render logs contain no database URL, password, JWT, raw token, access manifest,
  patient payload, or other credential/clinical data.
