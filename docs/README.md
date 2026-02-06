# API Documentation (OpenAPI / Swagger)

This folder contains the **OpenAPI 3.0** specification for the Meeting Room app API (Supabase Auth, PostgREST, Edge Functions).

## View the docs

### Option 1: With the Angular app running

1. Run the app: `ng serve` (or `npm start`)
2. Open: **http://localhost:4200/api-docs/index.html**

The same files are copied from `public/api-docs/` when the app is built/served.

### Option 2: Standalone (no app)

1. Serve the `docs` folder, e.g.:
   ```bash
   npx serve docs
   ```
2. Open the URL shown (e.g. http://localhost:3000) and click `index.html`, or open `docs/index.html` directly in the browser (some browsers may block loading `openapi.yaml` from file://).

### Option 3: Swagger Editor

- Go to [editor.swagger.io](https://editor.swagger.io)
- File → Import file → choose `docs/openapi.yaml`

## Spec location

- **Source (canonical):** `docs/openapi.yaml`
- **Served by app:** `public/api-docs/openapi.yaml` and `public/api-docs/index.html`

Update `docs/openapi.yaml` and sync to `public/api-docs/openapi.yaml` if you keep both (or use a single source and copy on build).

## Contents

The spec documents:

- **Auth:** login, logout, session, profile
- **Companies:** list, create, update, delete (sys_admin)
- **Company Admins:** list, create (invite + email), update, delete
- **Invitations:** get by token, sign up (accept invitation)
- **Rooms:** list, create, update, delete (company_admin)
- **Employees:** list, invite, update, delete (company_admin)
- **Edge Functions:** send-company-admin-invite, confirm-invited-user

All operations are implemented via Supabase (Auth, PostgREST, RPC, Edge Functions). The spec uses logical paths; actual requests go to your Supabase project URL with the appropriate path prefix (`/auth/v1`, `/rest/v1`, `/functions/v1`).

## Troubleshooting – List companies returns `[]`

1. **Send both headers**  
   For **List all companies**, fill in **Parameters**:
   - **apikey**: your Supabase anon key (from `src/environments/environment.ts`).
   - **Authorization**: paste exactly `Bearer <access_token>` (one space after `Bearer`). Get `<access_token>` from **Admin login** response → `access_token` or `session.access_token`.

2. **Check profile role**  
   RLS returns companies only if the authenticated user’s profile has role **`sys_admin`**. In Supabase Dashboard → **Table Editor** → **profiles**, find the row where `id` = your auth user id and ensure **role** = `sys_admin`. If it’s missing or different, fix it (e.g. set role to `sys_admin` for your admin user).
