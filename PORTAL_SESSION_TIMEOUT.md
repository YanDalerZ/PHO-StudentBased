# Portal session timeout

## Implemented contract

- Admins can set inactivity to 5, 10, or 15 minutes in Admin Portal → Settings → Session Timeout. The database default is 15 minutes. A change is audited in the same transaction as the policy update.
- Login creates a server-side session row and signs a JWT containing its session ID. The server checks that row, the current global policy, user status, role, and existing effective access on every protected request. Background GETs and other ordinary API requests do not update `last_activity_at`.
- Genuine portal pointer, keyboard, input, touch, or scroll activity sends a throttled request to `POST /auth/session/activity`. The server checks both deadlines before updating activity. `GET /auth/session` never extends activity. If any authenticated request observes that a session has expired, the server persists terminal revocation so a later timeout-policy increase cannot revive it. `POST /auth/logout` revokes the session before the browser clears credentials.
- A session ends at the earlier of `last_activity_at + inactivity_minutes` and `created_at + 8 hours`. Reducing the policy immediately makes already-idle sessions invalid on their next protected request or timeout check. It does not grandfather them. Continue session cannot revive an expired session or extend the eight-hour maximum.
- The browser polls read-only status, displays a one-minute warning dialog with a countdown and unsaved-form warning, and shows the correct login message after an inactivity or maximum-lifetime `401`. Session state and logout changes synchronize via browser storage events. Public `/register/:token` does not run portal session checks and uses a separate Axios client with no portal-token interceptor.

## Migration and deployment

Migration [`backend/database/migrations/017_portal_sessions.sql`](backend/database/migrations/017_portal_sessions.sql) creates `PORTAL_SESSION_POLICY` and `PORTAL_SESSIONS` and seeds the 15-minute default. It was applied and verified on shared Aiven together with migration 018 on 2026-10-30, under explicit owner authorization including the waiver of a confirmed recovery point. See `SHARED_MIGRATIONS_017_018_RESULT.json` and the read-only `backend/database/verification/verify_017_018.sql` checks.

Do not rerun raw migration 017 on this shared target; its objects now exist. The compatible backend and frontend must be deployed together after the release blockers below are resolved. Pre-existing JWTs have no session ID and will require users to sign in again. After deployment, verify the setting, login, warning, Continue, expiry, logout, and public QR route against approved non-patient test accounts.

The guarded local command is `cd backend && node --env-file=.env.test dist/scripts/migrate_portal_sessions_local.js` after `npm run build`. It checks that the connected database is exactly local `pho_test` and refuses shared Aiven. The corresponding test is `node --env-file=.env.test dist/scripts/test_portal_sessions.js`.

## Verification scope

- Backend HTTP/database test passed for default and all three policy choices, login for all three roles, admin-only edits, audit entries, read-only background checks, active continuation, inactivity expiry, 8-hour expiry, shorter-policy immediate expiry, logout revocation, malformed/legacy tokens, and a public route.
- Existing Phase 1 authorization/audit integration test passed after updating its JWT fixture to create a session and its deworming payload to meet current validation. This covers role, school, and module permissions through the new auth middleware.
- Local browser checks passed for the warning at 39 seconds, Continue, reload, 5/10/15-minute setting controls, cross-tab activity continuation and logout, inactivity and maximum-lifetime messages, and opening the public QR page while signed in.
- Browser network headers for the QR page were not independently captured; isolation is based on the separate `publicApi` client and the public-route browser behavior. Production behavior remains unverified until deployment and smoke checks.

## Release review reconciliation — 2026-10-30

The reproduced timeout-policy increase edge case is resolved. When the server
observes inactivity or maximum-lifetime expiry, it now persists terminal
revocation. The guarded regression suite verifies that a session rejected under
the 5-minute policy remains rejected after the policy returns to 15 minutes.

The existing independent session report remains a point-in-time record whose
browser cases were blocked by its runner environment. Do not rewrite that
historical evidence. Complete deployed smoke checks for the warning, Continue,
expiry, logout, cross-tab behavior, and public QR request isolation before final
production acceptance.
