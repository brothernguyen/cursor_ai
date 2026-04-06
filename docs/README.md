# API Documentation (OpenAPI / Swagger)

This folder contains the **OpenAPI 3.0** specification for the Meeting Room app API (Supabase Auth, PostgREST, Edge Functions).

## View the docs

### Option 1: Swagger UI in the Angular app (recommended)

1. Run the app: `ng serve` (or `npm start`)
2. Open: **http://localhost:4200/api-docs** (Angular route — not `/api-docs/index.html`)

The UI loads **`/openapi.yaml`**, which is **`docs/openapi.yaml`** copied to the site root at build/serve time (see `angular.json` assets).

**Production:** [https://cursor-ai-one.vercel.app/api-docs](https://cursor-ai-one.vercel.app/api-docs) — same UI; the spec must be redeployed with the app for new endpoints (e.g. **Meetings**) to appear there.

Use the **Authorize** button once for **apikey** (anon) and **bearerAuth** (JWT). You should **not** see duplicate `apikey` / `Authorization` fields under **Parameters** for each operation.

### Option 2: Standalone (no app)

1. Serve the `docs` folder, e.g.:
   ```bash
   npx serve docs
   ```
2. Open the URL shown and use Swagger Editor / import `openapi.yaml`, or use [editor.swagger.io](https://editor.swagger.io) → Import file → `docs/openapi.yaml`.

### Option 3: Swagger Editor (online)

- Go to [editor.swagger.io](https://editor.swagger.io)
- File → Import file → choose `docs/openapi.yaml`

## Spec location

- **Canonical source:** `docs/openapi.yaml` (only file to edit)

## Contents

The spec documents:

- **Auth:** login, logout, session, profile
- **Companies:** list, create, update, delete (sys_admin)
- **Company Admins:** list, create (invite + email), update, delete
- **Invitations:** get by token, sign up (accept invitation)
- **Rooms:** list, create, update, delete (company_admin)
- **Employees:** list, invite, update, delete (company_admin)
- **Meetings:** list (RLS: my meetings), create (direct or RPC `create_meeting_with_guests` with guests), get/patch (including cancel), `meeting_guests`, RPC `rsvp_meeting`
- **Edge Functions:** send-company-admin-invite, confirm-invited-user

All operations are implemented via Supabase (Auth, PostgREST, RPC, Edge Functions). The spec uses logical paths; actual requests go to your Supabase project URL with the appropriate path prefix (`/auth/v1`, `/rest/v1`, `/functions/v1`).

## Application role vs Auth `user.role`

After password login, Supabase’s **`POST /auth/v1/token?grant_type=password`** response includes `user.role`: **`authenticated`**. That value is the **JWT / PostgREST role** (`authenticated` or `anon`), not your product permissions.

Your real roles are **`sys_admin`**, **`company_admin`**, and **`employee`** in **`public.profiles.role`**. The Angular app loads them right after sign-in and on refresh via **`GET /rest/v1/profiles`** (see `AuthService.adminLogin` and `restoreSession`). In the browser **Network** tab, open the **`profiles?select=...`** request to see the app role—not only **`token?grant_type=password`**.

## Troubleshooting – List companies returns `[]`

1. **Auth headers**  
   In Swagger UI, open **Authorize** and set **apikey** (anon) and **bearerAuth** (JWT only — do not type `Bearer` twice; paste the raw JWT if the UI already prefixes `Bearer`).

2. **Check profile role**  
   RLS returns companies only if the authenticated user’s profile has role **`sys_admin`**. In Supabase Dashboard → **Table Editor** → **profiles**, find the row where `id` = your auth user id and ensure **role** = `sys_admin`. If it’s missing or different, fix it (e.g. set role to `sys_admin` for your admin user).
