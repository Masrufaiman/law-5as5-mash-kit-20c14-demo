
Issue restatement:
- The failure is still `POST /rest/v1/organizations` with `403` and `new row violates row-level security policy`.
- You should not delete the DB. This is a logic/policy interaction bug in onboarding flow.

Do I know what the issue is?
- Yes.

Root cause (from code + request logs):
- Onboarding currently does:
  - `insert(...).select().single()` on `organizations`.
- That generates `?select=*` + `return=representation`.
- With RLS, `INSERT ... RETURNING *` also requires the inserted row to pass `SELECT` policy.
- Your `organizations` SELECT policy only allows orgs where `id = get_user_org_id()`.
- New users have no `profile.organization_id` yet, so `get_user_org_id()` is null at org-creation time.
- Result: insert path is blocked by the implicit RETURNING visibility check.

Implementation plan:
1) Fix onboarding insert to avoid RETURNING row
- File: `src/pages/Onboarding.tsx`
- Replace `insert(...).select().single()` with insert-only call.
- Generate `orgId` client-side (`crypto.randomUUID()`), include it in insert payload.
- Reuse `orgId` for profile update/insert and default vault creation.

2) Keep current RLS policy (no DB reset, no destructive migration)
- Existing INSERT policy is already present and acceptable.
- No schema wipe, no table drop.

3) Improve onboarding error handling
- In `Onboarding.tsx`, normalize common DB errors:
  - slug duplicate -> show friendly “Organization name already exists, try another name”.
  - generic RLS/permission errors -> include operation context (create org / update profile / create vault) for faster debugging.

4) (Optional hardening, second pass) make onboarding atomic
- Add a `SECURITY DEFINER` RPC to create org + profile + default vault in one transaction.
- Call RPC from UI instead of 3 separate client writes.
- This removes partial-write risk and avoids future RLS edge cases during onboarding.

Validation checklist after implementation:
- End-to-end test: sign up (new user) -> onboarding -> create org -> redirect to `/`.
- Network check: organizations POST should no longer include `?select=*`.
- DB check:
  - one row in `organizations` for new org
  - user profile has `organization_id` set
  - “General” vault exists for same org
- Regression check: existing users with organization still bypass onboarding.

Technical notes:
- This is a classic PostgREST/Supabase RLS + `RETURNING` behavior, not a broken auth token problem.
- The `setSession` call is not the primary fix for this error; removing row-return on org insert is.
