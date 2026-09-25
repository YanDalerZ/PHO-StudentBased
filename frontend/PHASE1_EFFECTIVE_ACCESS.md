# Phase 1 frontend effective access

Milestone 5 uses the `effectiveAccess` returned by login and `/auth/me` for
navigation, route, and mutation controls. The backend remains the authority;
the frontend gates prevent stale or misleading UI and do not replace API
authorization.

## Implemented behavior

- Student registry, profile, overview, and Patient Information routes require
  `patient-info.can_view`.
- Each clinical dashboard and form route requires that module's `can_view`.
- Student registration controls require `patient-info.can_create`; student
  profile editing requires `patient-info.can_edit`; the review queue requires
  `patient-info.can_approve_registration`.
- Clinical forms select `can_create` for a missing record and `can_edit` for an
  existing record. Users without the required action receive a read-only notice
  and cannot submit the form.
- Sidebar links, student module cards, and superuser quick-access cards include
  only modules with `can_view`.
- An API `403` immediately clears the cached access snapshot and reloads
  `/auth/me`. Guarded content unmounts while current access is loading. An API
  `401` clears the session and returns to login.
- Oral Health creation continues to send `student_id` and clinical fields
  without inventing a body `school_id`.

## Verification commands

```powershell
cd C:\Users\User1\Desktop\PHO\PHO-StudentBased\frontend
npm run test:phase1:effective-access
npm run build
```

```powershell
cd C:\Users\User1\Desktop\PHO\PHO-StudentBased\backend
npm run build
```

The focused frontend lint command exits successfully with one existing Fast
Refresh warning in `AuthContext.tsx`. The full `npm run lint` remains nonzero
because of previously existing errors in `RegistrationForm.tsx`,
`RegistrationReviewQueue.tsx`, `services/api.ts`, and `update_navigation.ts`.
Those failures are recorded for the final lint-closure milestone.

## Independent browser checks

Use only disposable local accounts and data.

1. Give school staff `patient-info.can_view` without create/edit. Confirm the
   registry and profile load, registration and edit controls are absent, and a
   direct visit to `/registration-form` shows Forbidden.
2. Add `patient-info.can_create`. Confirm registration controls appear. Remove
   the grant while the same token remains open, trigger the next API request,
   and confirm the guarded page reloads access and no longer exposes the action.
3. Remove `patient-info.can_view` with the same token. Confirm the next `403`
   unmounts student data, removes its navigation, and renders the Forbidden
   state after access refresh.
4. Give a superuser only `oral-health.can_view`. Confirm only Oral Health module
   navigation appears, its dashboard opens, and Patient Information overview
   and student routes remain Forbidden.
5. For each clinical module, test view-only, create-only paired with view, and
   edit-only paired with view against a student with and without an existing
   record. Confirm the save control follows the required action.
6. Create an Oral Health record from the browser and inspect the request. It
   must succeed without a body `school_id`; school scope comes from the stored
   student relationship.
7. Confirm loading, empty, retry/error, read-only, and Forbidden states remain
   distinct and readable on desktop and mobile layouts.

Status: implemented, awaiting independent Antigravity QA.
