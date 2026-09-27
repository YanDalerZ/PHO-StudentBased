# Shared Aiven database development

Local backend development connects directly to the same shared Aiven PostgreSQL
database used by the deployed service. A separate local `pho_test` database is
not part of the active developer workflow.

## Configure once

1. Copy `backend/.env.example` to the ignored `backend/.env` file.
2. Obtain the current `DATABASE_URL` and CA certificate from the team's private
   secret store. Do not paste either value into Git, Markdown, chat, or logs.
3. Keep `NODE_ENV=development` and start the backend from `backend/` with
   `npm run dev`.
4. Keep the frontend `VITE_API_URL` pointed at the local backend. The browser
   calls the local API, and the local API connects to Aiven.

Verify the target without reading application or patient rows:

```powershell
cd C:\Users\User1\Desktop\PHO\PHO-StudentBased\backend
npm run verify:shared:database
```

The command reports only PostgreSQL connection identity and fails if the server
is local. It does not print the connection string or password.

## Shared-data rules

- Treat every local request as a production-data operation.
- Do not run `database/schema.sql`, `database/seed.sql`, reset helpers,
  destructive test suites, or ad hoc update scripts against the shared target.
- Do not create fake students, accounts, clinical records, or QR submissions.
- Use designated development accounts and existing approved records for manual
  smoke checks. Remove any explicitly approved temporary record immediately.
- Apply schema changes only through reviewed, forward-only migrations and the
  release runbook in `PHASE1_PRODUCTION_RELEASE.md`.
- Confirm an Aiven backup or point-in-time recovery marker before an approved
  migration. Application development does not authorize schema migration.

The legacy disposable-database test guard remains in the codebase to ensure old
destructive Phase 1 verification commands reject the shared Aiven target. Those
commands are historical QA tools, not part of normal local development.
