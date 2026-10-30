# Immunization form and persistence reconciliation

Implemented in the shared Immunization form and its existing backend controller.
The teacher and superuser routes support both /immunization and /immuniz, with
the same role, module and school authorization.

## Resolved blockers

- Migration 018 adds nullable TEXT deferred_reason_text to public.immunization
  with a 2,000-character database length constraint. Existing rows remain NULL.
  No historical refusal text or general remarks are copied into this column.
- POST and PUT accept the dedicated field; create/update responses and the
  existing GET /modules/immunization/student/:studentId response return it.
  There is no GET-by-record route in the current router.
- Deferred requires a nonblank explanation, at most 2,000 characters. The form
  now saves it and loads it on edit. An omitted explanation on a partial API
  edit preserves the saved value. Historical Deferred records with NULL remain
  readable and require a new explanation when saved as Deferred.
- The backend rejects Deferred and Refused both being true. Switching away
  from Deferred clears only its explanation; switching away from Refused clears
  its code/text. General remarks and facility details remain unchanged when
  omitted. The frontend requires acknowledgement before removing or replacing
  historical dose, lot, refusal or deferral data.
- All six dose lots are independently nullable strings, validated as ASCII
  digits only. Empty strings normalize to NULL. Leading zeroes and large strings
  are preserved. Historical alphanumeric lots remain readable, but require an
  explicit correction before an edit can be saved.
- Male HPV eligibility uses canonical student sex from PostgreSQL on both
  create and merged update. A client-supplied sex or school-program flag cannot
  bypass this form's requested program rule. It is not described as a universal
  medical contraindication. Historical invalid selections remain readable.
- The backend rejects is_sick_today=true without creating an event or inferring
  deferral. New frontend screening has no selected answer; Yes blocks progression.
  Back retains draft answers. Cancel leaves the saved record unchanged.
- New event program type defaults to School-Based Immunization. Historical type
  and school-based flag remain unchanged unless explicitly edited.
- Removed facility controls, shared historical lot value and general remarks
  are omitted from form updates. Historical refusal explanations are omitted
  while the record remains Refused, preserving the exact saved text.
- Deferral drafts are cleared when leaving that option, and excluded from the
  submitted payload for other states. Nothing is saved merely by selecting a
  screening answer or disposition.
- SQL DATE formatting preserves calendar dates across positive timezone offsets.

## Verified locally by Codex on 2026-10-30

1. Backend and frontend TypeScript/Vite builds passed.
2. Targeted frontend ESLint passed.
3. Guarded API/database suite passed on verified postgres@::1:5432/pho_test:
   explanation create/edit/read and partial-edit retention; status transitions;
   missing, blank, overlong and wrong-state explanations; all six nullable lots
   and invalid digit formats; canonical Male HPV denial; unauthenticated/admin,
   cross-school and revoked edit-permission denials; /api alias; historical
   clinical/facility/shared-lot preservation; audit text minimization and forced
   audit-failure rollback for inserts and updates.
4. Real headless Edge + local backend + PostgreSQL flows passed for teacher and
   superuser: Deferred create, reload, explanation edit, reload, transition to
   Neither, and reload of a long lot string with leading zeroes.
5. Synthetic-response Edge regression suite passed for first-step gating,
   Yes/No exclusivity, Back, all status choices, six lots, desktop three-column
   and mobile one-column layout without page overflow, Male HPV controls,
   legacy correction acknowledgements and hidden-value preservation in payloads.

The API suite verifies the database identity before any fixture writes and
cleans its synthetic clinical records, students, users, grants, sessions,
audit rows and geography afterwards. It restores module availability.
The browser persistence helper runs only through that guarded suite and uses
its ephemeral local backend. Its preview adapter forwards API calls to that
server and uses the backend-approved development origin. It does not test
production origin configuration.

The synthetic-response browser suite tests presentation and payloads without a
database. Database persistence evidence comes from the separate guarded suite.
## Independent acceptance reconciled on 2026-10-30

Antigravity reports **VERIFIED — local feature accepted**, with I01–I16 passing
and zero open application findings. See
`ANTIGRAVITY_IMMUNIZATION_ACCEPTANCE_REPORT.md` and its saved independent QA summary.
Codex checked all 14 reported file hashes against the current files; all match.
The saved evidence includes local database identity, schema inspection, browser
results, authorization and rollback checks, and zero remaining run-owned fixtures
in the recorded post-cleanup counts. This reconciliation inspected evidence;
it did not rerun the suites or perform database writes.

The accepted scope is the tested local implementation. Shared schema migrations
017 and 018 were subsequently applied and verified as recorded below. Application
deployment and production origin configuration remain outside this acceptance.

## Migration and release steps remaining

Migrations 017 and 018 were applied to the explicitly authorized shared Aiven
defaultdb on 2026-10-30 in one transaction. The owner explicitly authorized
proceeding without a confirmed backup/PITR recovery point. The transaction and
a separate read-only post-commit verification both succeeded. The new session
policy has id=1 and inactivity_minutes=15; session tables, user foreign keys,
checks, the active-session index, and the nullable deferral column/length check
were verified. Existing clinical values were not rewritten. No production login
or clinical smoke write was run.

Execution evidence: `SHARED_MIGRATIONS_017_018_RESULT.json`.
Read-only DBeaver script: `backend/database/verification/verify_017_018.sql`.

For this verified shared target, do not rerun the raw migration files: their
objects now exist. Deploy the compatible backend and frontend together, then
perform the authorized production smoke checks. Other targets require their own
identity/schema check and approved release process. The raw migration files
intentionally fail if objects already exist; inspect rather than blindly rerun.
Do not run baseline/seed scripts. The local migration runner refuses shared targets.

## Reproduce

From backend, with a private .env.test containing the verified disposable local
identity and required test opt-in:

    npm run migrate:local:immunization-deferral
    npm run test:immunization-contract

For the real browser persistence checks, start the built frontend separately:

    npm run preview -- --host 127.0.0.1 --port 5185 --strictPort

Then run the backend test with PHO_PLAYWRIGHT_MODULE set to the absolute path of
an installed playwright/index.mjs (Microsoft Edge is required). This enables
frontend/scripts/verify-immunization-persistence.mjs inside the guarded suite.
PHO_QA_ORIGIN defaults to http://127.0.0.1:5185.

The independent presentation suite is frontend/scripts/verify-immunization-form.mjs.
It uses the same Playwright setting and preview origin, intercepts every API call
with synthetic responses, and saves screenshots to ignored .qa-immunization/.
