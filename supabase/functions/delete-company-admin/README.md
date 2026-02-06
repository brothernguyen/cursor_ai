# Delete Company Admin (row + auth user)

This Edge Function deletes a company admin completely:

1. Removes the row from `company_admins`.
2. If the admin had accepted the invite and signed up (`user_id` set), deletes their **auth user** so they can no longer log in, then deletes their **profile** row (explicitly, as a safety net even though the schema has `profiles.id` → `auth.users(id)` ON DELETE CASCADE).

**Why login still worked if you saw it:** Login is gated by `auth.users`. If the auth user wasn’t removed (e.g. `user_id` was null, or `deleteUser` failed), they can still sign in; the profile then still exists because we only cascade when the auth user is deleted. We don’t “keep” the profile by design—we rely on deleting the auth user and cascade (plus an explicit profile delete now).

Uses the **service role** (automatically available in the Edge Function runtime) so the auth user can be deleted.

## Deploy

From the project root:

```bash
npx supabase functions deploy delete-company-admin
```

No extra secrets are required. Callers must send a valid JWT (authenticated sys_admin or company_admin).

## Request

- **Method:** POST
- **Headers:** `Authorization: Bearer <user JWT>`, `Content-Type: application/json`
- **Body:** `{ "company_admin_id": "<uuid>" }`

The Angular app calls this when you delete a company admin from the UI.
