# Swagger UI / Editor tips

## Swagger UI in this app

Run `npm start` and open **`/api-docs`** (e.g. [http://localhost:4200/api-docs](http://localhost:4200/api-docs)). The UI loads [`openapi.yaml`](./openapi.yaml) from the dev server and uses **`persistAuthorization`** so Authorize values survive reloads in the same browser session.

## Auth without retyping every request

1. Import [`openapi.yaml`](./openapi.yaml) into Swagger UI or editor.swagger.io.
2. Click **Authorize** (lock icon).
3. Enter **apikey**: your Supabase **anon** key (from the Supabase dashboard → Project Settings → API, or `environment.ts`).
4. Enter **bearerAuth**: `Bearer <access_token>` from the **Admin login** response (`session.access_token`), not the anon key.
5. In standalone **Swagger UI**, enable **persistAuthorization** in the UI config so the browser remembers values for the session (Swagger Editor online may still reset on full page reload).

You cannot remove the `apikey` header from real HTTP calls: Supabase PostgREST requires it. This project’s OpenAPI spec uses global **security schemes** so you set those once via **Authorize**, not per operation.

## `GET /rest/v1/companies` returns `[]`

PostgREST returns **200** with **`[]`** when **RLS** returns no visible rows (not a 403).

For `companies`, the policy requires `profiles.role = 'sys_admin'` for the authenticated user (`auth.uid()`). Fix in Supabase SQL Editor:

```sql
-- Replace email with your admin login email
insert into public.profiles (id, email, role)
select id, email, 'sys_admin'
from auth.users
where email = 'your@email.com'
on conflict (id) do update set role = excluded.role;
```

See also [`supabase/schema-and-rls.sql`](../supabase/schema-and-rls.sql).
