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
| `FRONTEND_URL`     | **Your Angular app URL** where users open the signup link, e.g. `https://yourapp.com` or `http://localhost:4200`. **Do not use your Supabase project URL** (e.g. `https://xxx.supabase.co`) — that causes "requested path is invalid" when the user clicks the link. |
| `EMAIL_PRIMARY`    | Optional. Default `resend`. Set to **`smtp`** to **send invitations only via SMTP** and skip Resend. Use this when you see Resend errors like “only send testing emails to your own email address” and you have not finished domain verification — no Resend domain required. |
| `RESEND_API_KEY`   | Your Resend API key (not used when `EMAIL_PRIMARY=smtp`). |
| `RESEND_FROM`      | Sender on a **verified** Resend domain. Ignored when `EMAIL_PRIMARY=smtp` (use `SMTP_FROM` instead). |

#### SMTP (fallback, or primary with `EMAIL_PRIMARY=smtp`)

Set these when using SMTP as fallback or when **`EMAIL_PRIMARY=smtp`**:

| Secret       | Description |
|--------------|-------------|
| `SMTP_HOST`  | e.g. `smtp.gmail.com` |
| `SMTP_PORT`  | `465` (TLS) for Gmail with this function |
| `SMTP_USER`  | Full Gmail address |
| `SMTP_PASS`  | **Gmail App Password** (Google Account → Security → 2-Step Verification → App passwords). Normal account passwords return **535** from Gmail. |
| `SMTP_FROM`  | Optional; defaults to `SMTP_USER`. Must be an address your SMTP account may send as. |
| `SMTP_TLS_MODE` | Optional. `starttls` (use with **port 587**) or `tls` (implicit TLS, typical **465**). If omitted: port **587** → STARTTLS; other ports → TLS. |

**If Gmail returns `535 BadCredentials`**

1. **App password** — [Google → App passwords](https://myaccount.google.com/apppasswords). Turn on **2-Step Verification** first. The password is **16 characters**; paste into `SMTP_PASS` (spaces are stripped automatically for `smtp.gmail.com`).
2. **`SMTP_USER`** — Must be the **full** address (e.g. `you@gmail.com`), not only the name before `@`.
3. Try **port 587**: `SMTP_PORT` = `587`, `SMTP_TLS_MODE` = `starttls` (or leave mode unset; the function defaults 587 to STARTTLS).
4. **Google Workspace** (@company.com): Org admins can **disable SMTP / App passwords**. Use a **personal Gmail** for sending, **Resend with verified domain**, or **SendGrid/Mailgun SMTP** instead.

**Quick path to invite any email without Resend domain verification**

1. In Google Account, turn on 2FA and create an **App password** for “Mail”.
2. In Supabase **Secrets**, add `EMAIL_PRIMARY` = `smtp` (exact value).
3. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM`.
4. Redeploy the function if you changed code; secrets apply without redeploy.

You can remove or keep `RESEND_API_KEY`; it will not be used for sending when `EMAIL_PRIMARY=smtp`.

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
  - Inserts a row into `employees` (inactive until the invite is accepted).
   - Inserts a row into `invitations` with `role: employee`.
   - Invokes this function with `email`, `token`, optional `companyName`, and **`inviteRole: "employee"`** (subject/body say “employee” instead of “Company Admin”).
3. The function sends an email with a link: `FRONTEND_URL/register?token=<token>`.
4. The invitee opens the link, completes the register form, and `acceptInvitation` links their auth user and profile; for employees it also updates the `employees` row (`user_id`, names, `active`).
