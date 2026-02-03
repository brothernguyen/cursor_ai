# Send Company Admin Invite Email

This Edge Function sends an invitation email to new company admins using [Resend](https://resend.com).

## Supabase setup

### 1. Resend

- Create an account at [resend.com](https://resend.com).
- Create an [API key](https://resend.com/api-keys).
- (Optional) [Verify your domain](https://resend.com/domains) so you can send from your own address. Until then you can use `onboarding@resend.dev` as sender.

### 2. Edge Function secrets

In **Supabase Dashboard** → **Edge Functions** → **Secrets**, set:

| Secret             | Description |
|--------------------|-------------|
| `RESEND_API_KEY`   | Your Resend API key (required). |
| `FRONTEND_URL`     | **Your Angular app URL** where users open the signup link, e.g. `https://yourapp.com` or `http://localhost:4200`. **Do not use your Supabase project URL** (e.g. `https://xxx.supabase.co`) — that causes "requested path is invalid" when the user clicks the link. |
| `RESEND_FROM`      | (Optional) Sender email, e.g. `noreply@yourdomain.com`. Defaults to `onboarding@resend.dev`. |

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

Use an `.env` file with `RESEND_API_KEY` and optionally `FRONTEND_URL` and `RESEND_FROM`.

## Flow

1. When a system/company admin creates a company admin (invite), the app:
   - Inserts a row into `company_admins`.
   - Inserts a row into `invitations` (token, email, role, company_id, expires_at).
   - Invokes this Edge Function with `email`, `token`, and optional `companyName`.
2. The function sends an email with a link: `FRONTEND_URL/register?token=<token>`.
3. The invitee opens the link, completes the register form, and the existing `acceptInvitation` flow links their account to the company.
