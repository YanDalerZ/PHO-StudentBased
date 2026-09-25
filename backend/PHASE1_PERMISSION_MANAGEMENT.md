# Phase 1 permission management

The admin replacement endpoints validate their complete request before changing
active access. Both operations lock the target user and run validation,
soft-revocation, replacement inserts, and the required audit event in one
database transaction.

## Module permissions

- The target user must exist.
- Duplicate, missing, and non-approved module IDs are rejected.
- A submitted module entry must grant at least one action.
- Administrator accounts cannot receive clinical module grants.
- `can_approve_registration` is valid only for a `school_staff` account on
  `patient-info`.
- An empty replacement remains available to remove legacy grants, including
  invalid grants on administrator accounts.

## School assignments

- The target user must exist.
- New assignments are permitted only for `school_staff` accounts.
- Duplicate, missing, and inactive school IDs are rejected.
- An empty replacement remains available to remove legacy assignments from an
  ineligible account.

Rejected requests leave current access and history unchanged. Successful
replacements retain revoked rows with the acting administrator in `revoked_by`
and insert a minimal audit summary in the same transaction.

Run the focused verification only against the guarded disposable database:

```powershell
npm run test:phase1:permission-management
```
