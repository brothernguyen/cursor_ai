# Send Company Admin Invite Email

This Edge Function sends an invitation email to new company admins (and, with `inviteRole: "employee"`, to **employees**) using [Resend](https://resend.com).
If Resend blocks delivery while your domain is being verified, it can optionally fall back to sending via Gmail SMTP.

## Supabase setup

### 1. Resend

- Create an account at [resend.com](https://resend.com).
- Create an [API key](https://resend.com/api-keys).
- **To invite emails other than your Resend account address:** [Verify a domain](https://resend.com/domains), complete DNS, then set Supabase secret `RESEND_FROM` to an address on that domain (e.g. `noreply@yourdomain.com`). The default `onboarding@resend.dev` only allows “testing” delivery to your own account email.

### 2. Edge Function secrets

In **Supabase Dashboard** → **Edge Functions** → **Secrets**, set:

| Secret             | Description |
|--------------------|-------------|
| `RESEND_API_KEY`   | Your Resend API key (optional if using SMTP-only). |
| `FRONTEND_URL`     | **Your Angular app URL** where users open the signup link, e.g. `https://yourapp.com` or `http://localhost:4200`. **Do not use your Supabase project URL** (e.g. `https://xxx.supabase.co`) — that causes "requested path is invalid" when the user clicks the link. |
| `RESEND_FROM`      | Sender on a **verified** domain, e.g. `noreply@yourdomain.com`. Required for real invites; default sandbox address cannot mail arbitrary recipients. |

#### Optional: SMTP fallback (Gmail)

Enable SMTP by setting these secrets. It is used:
- as fallback when Resend blocks sandbox recipients, or
- as primary sender if `RESEND_API_KEY` is not set.

| Secret       | Description |
|--------------|-------------|
| `SMTP_HOST`  | SMTP server hostname (Gmail: `smtp.gmail.com`) |
| `SMTP_PORT`  | SMTP port (`465` for TLS; `587` if you configure STARTTLS separately) |
| `SMTP_USER`  | Gmail address you are sending from (e.g. `you@gmail.com`) |
| `SMTP_PASS`  | Gmail **app password** (not your normal Google password). |
| `SMTP_FROM`  | Optional. If unset, it defaults to `SMTP_USER`. Use `you@gmail.com` or `Name <you@gmail.com>`. |

### 3. Deploy the function

From the project root:

```bash
npx supabase functions deploy send-company-admin-invite
```

This function is deployed **without JWT verification** (`verify_jwt = false` in `supabase/config.toml`) so the app can call it after creating the invitation. Only authenticated admins can create invitations (RLS), so the flow remains secure.

If you get **401 Invalid JWT** when sending the invite email, redeploy with the flag:

```bash
npx supabase functions deploy send-company-admin-invite --no-verify-jwt
```

To set secrets when deploying:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxx
npx supabase secrets set FRONTEND_URL=https://yourapp.com
```

### 4. Local testing (optional)

```bash
npx supabase start
npx supabase functions serve send-company-admin-invite --env-file .env.local
```

Use an `.env` file with `RESEND_API_KEY` and optionally `FRONTEND_URL` / `RESEND_FROM`.
To enable SMTP fallback locally too, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` (and optional `SMTP_FROM`).

## Flow

1. When a system/company admin creates a company admin (invite), the app:
   - Inserts a row into `company_admins`.
   - Inserts a row into `invitations` (token, email, role, company_id, expires_at).
   - Invokes this Edge Function with `email`, `token`, and optional `companyName`.
2. When a company admin **invites an employee**, the app:
   - Inserts a row into `employees` (pending).
   - Inserts a row into `invitations` with `role: employee`.
   - Invokes this function with `email`, `token`, optional `companyName`, and **`inviteRole: "employee"`** (subject/body say “employee” instead of “Company Admin”).
3. The function sends an email with a link: `FRONTEND_URL/register?token=<token>`.
4. The invitee opens the link, completes the register form, and `acceptInvitation` links their auth user and profile; for employees it also updates the `employees` row (`user_id`, names, `active`).
