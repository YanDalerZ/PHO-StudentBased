# Phase 3 Direct CSV/XLSX Export Release

## Current contract

Phase 3 exports are delivered synchronously from the authenticated export
request. The application does not create an export job, write a file to Render,
poll a status endpoint, issue a download token, or retain an exported file.

`POST /api/v1/reports/:moduleSlug/exports`

Request body:

```json
{
  "format": "csv",
  "filters": {
    "period": "2026-10",
    "school_id": 123
  }
}
```

Successful response:

- HTTP `200` with the CSV or XLSX bytes;
- `Content-Disposition: attachment` with a date-scoped filename;
- `Cache-Control: private, no-store`;
- `X-Content-Type-Options: nosniff`; and
- no persistent server-side file or public URL.

The former `GET /report-exports/:id`, download, and delete endpoints are retired.
The existing `REPORT_EXPORTS` table remains in the migrated schema for backward
compatibility and history, but direct downloads do not insert or update it.

## Security and authorization retained

- authentication, `school_staff`/`superuser` role checks, active-module checks,
  `can_export`, and effective school scope are enforced before data is returned;
- filter geography, the 365-day date range, and the 50,000-row ceiling remain
  enforced;
- all queries remain parameterized and every module uses an explicit export
  column allowlist;
- strings beginning with `=`, `+`, `-`, or `@` are neutralized in CSV and XLSX;
- export audit events record requested, completed, downloaded, or failed status
  without patient payloads, credentials, or storage paths.

## Render configuration

`REPORT_EXPORT_STORAGE_ROOT` is no longer used and should be removed from the
Render environment. No persistent disk is required for report exports.

Keep the existing production settings for `DATABASE_URL`, `JWT_SECRET`,
`NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, public registration, and any other
unrelated application features.

## Verification record

Completed on 2026-10-02:

- backend TypeScript build: passed;
- frontend production build: passed;
- frontend lint: passed with two existing Fast Refresh warnings in
  `MockDataContext.tsx` and `AuthContext.tsx`, and no errors;
- Phase 3 reporting UI contract test: passed;
- Phase 1 effective-access regression test: passed; and
- shared/production Aiven was not used for destructive tests.

The rewritten database-backed direct-export integration suite is guarded to run
only on local `pho_test`. Its attempted run correctly refused the normal
environment, and a second local attempt reached PostgreSQL but could not
authenticate because no local test password was available. Run the command below
with the existing local `pho_test` credentials before calling the change fully
runtime-verified:

```bash
NODE_ENV=test \
PHO_ALLOW_DESTRUCTIVE_TESTS=true \
PHO_EXPECTED_DB_HOST=localhost \
PHO_EXPECTED_DB_PORT=5432 \
PHO_EXPECTED_DB_NAME=pho_test \
PHO_EXPECTED_DB_USER=postgres \
DATABASE_URL='postgresql://postgres:<url-encoded-local-test-password>@localhost:5432/pho_test' \
JWT_SECRET='local-test-only-secret' \
npm run test:phase3:report-exports
```

Do not point that test command at shared Aiven or production.

## Deployment smoke test

After deployment, sign in as a user with `can_export`, open each consolidated
report, apply a small period, and download both CSV and XLSX. Confirm the browser
downloads immediately, the files open, the response is not cached, and Render
logs contain no `EXPORT_GENERATION_FAILED` or storage-root error.
