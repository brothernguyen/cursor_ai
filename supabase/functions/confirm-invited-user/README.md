# Confirm Invited User

This Edge Function marks a user's email as confirmed right after they sign up via an invitation link, so they can sign in without Supabase’s “Confirm email” step.

## Why it’s needed

Supabase Auth can require “Confirm email” before sign-in. For invitation-based signup, the invite link is the verification, so we confirm the user programmatically using the service role.

## Deploy

From the project root:

```bash
npx supabase functions deploy confirm-invited-user --no-verify-jwt
```

No extra secrets are required; Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Flow

1. User opens the invite link and submits the register form.
2. The app calls `signUp`, then invokes this function with `{ token, userId }`.
3. The function checks the invitation token, ensures the user’s email matches, then calls `auth.admin.updateUserById(userId, { email_confirm: true })`.
4. The app continues with profile/company_admin updates. The user can sign in immediately.

## Alternative

If you prefer not to use this function, in Supabase Dashboard go to **Authentication → Providers → Email** and turn **off** “Confirm email”. Then invited users can sign in without this function.
