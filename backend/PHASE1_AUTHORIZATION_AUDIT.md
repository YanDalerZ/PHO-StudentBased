# Phase 1 authorization and audit coverage

Milestone 4 applies the current database role, active module state, action
grant, and school assignment on every protected request. It does not trust the
role or access claims embedded in an existing token.

## Enforced boundaries

- Student and clinical record scope is resolved from the stored student-school
  relationship. A caller cannot change scope by sending a different
  `school_id` in the request body.
- Student transfers require access to both the student's current school and
  the destination school.
- School staff dashboards are bounded to their active assignments. An empty
  assignment produces empty aggregates instead of province-wide data.
- Superuser dashboard module completion includes only modules with an active
  `can_view` or `can_report` grant.
- Direct student registration and every clinical write return
  `MODULE_DISABLED` while their module is inactive. Existing records remain
  readable to authorized users.
- Lookup routes require authentication, school lookups are assignment-filtered
  for school staff, and the obsolete unauthenticated `/users` route is no
  longer mounted.
- Both `/api/v1` and the `/api` compatibility prefix use the same protected
  router.

## Audit behavior

Student and clinical mutations record only identifiers, action context, and
changed field names. Clinical audit writes share the mutation transaction, so
an audit failure rolls back the data write. Denial events store a reason code,
HTTP method, and path without query strings or assignment lists. The audit
service recursively redacts known identity, credential, contact, token, and
payload fields, and database-write failures are logged without the failed
payload or raw database error.

Run the focused check only against the guarded disposable database:

```powershell
npm run test:phase1:authorization
```

The check creates temporary users, schools, assignments, grants, students, and
clinical records; exercises both API prefixes; verifies successful and failed
audit behavior; and removes all fixtures in a `finally` block.
