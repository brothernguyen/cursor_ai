# Delete Company Admin (row + auth user)

This Edge Function deletes a company admin completely:

1. Removes the row from `company_admins`.
2. If the admin had accepted the invite and signed up (`user_id` set), deletes their auth user so they **can no longer log in**.

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
