import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Send invitation email to a new company admin (Resend, with SMTP fallback).
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
// - FRONTEND_URL (required in production)
// - EMAIL_PRIMARY: `resend` (default) or `smtp`. Set to **`smtp`** to send only via SMTP (Gmail app password,
//   SendGrid SMTP, etc.) and **skip Resend entirely** — fixes “testing emails only” / unverified domain issues.
// - RESEND_API_KEY (required unless EMAIL_PRIMARY=smtp or no Resend path)
// - RESEND_FROM: sender on a verified domain at Resend (not sandbox). Default onboarding@resend.dev = test-only.
// - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional from; defaults to SMTP_USER)
//   Required when EMAIL_PRIMARY=smtp, or used as fallback when Resend blocks delivery.
// - SMTP_TLS_MODE (optional): `tls` = implicit TLS (typical port 465). `starttls` = STARTTLS (use port 587).
//   If unset: port 587 → STARTTLS, any other port → implicit TLS.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'http://localhost:4200';
const RESEND_FROM =
  Deno.env.get('RESEND_FROM')?.trim() || 'onboarding@resend.dev';

const SMTP_HOST = Deno.env.get('SMTP_HOST')?.trim();
const SMTP_PORT = Number.parseInt(Deno.env.get('SMTP_PORT')?.trim() ?? '465', 10);
const SMTP_USER = Deno.env.get('SMTP_USER')?.trim();
const SMTP_PASS = Deno.env.get('SMTP_PASS');
const SMTP_FROM = Deno.env.get('SMTP_FROM')?.trim() || SMTP_USER;
const SMTP_TLS_MODE = Deno.env.get('SMTP_TLS_MODE')?.toLowerCase().trim() || '';

/** `smtp` = send only via SMTP (bypass Resend). Use when Resend domain is not verified yet. */
const EMAIL_PRIMARY = (Deno.env.get('EMAIL_PRIMARY') || 'resend').toLowerCase().trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteBody {
  email: string;
  token: string;
  companyName?: string;
  /** When `employee`, email copy refers to employee workspace invite (same /register?token= link). */
  inviteRole?: 'company_admin' | 'employee';
}

function getInviteHtml(
  registerUrl: string,
  companyName?: string,
  inviteRole: 'company_admin' | 'employee' = 'company_admin',
): string {
  const isEmployee = inviteRole === 'employee';
  const intro = isEmployee
    ? (companyName
      ? `You have been invited to join <strong>${escapeHtml(companyName)}</strong> as an employee.`
      : 'You have been invited to join as an employee.')
    : (companyName
      ? `You have been invited to join <strong>${escapeHtml(companyName)}</strong> as a Company Admin.`
      : 'You have been invited to join as a Company Admin.');
  const title = isEmployee ? 'Employee invitation' : 'Company Admin Invitation';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invitation</title></head>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #333;">${title}</h2>
  <p style="color: #555; line-height: 1.6;">${intro}</p>
  <p style="color: #555;">Click the link below to set your password and complete registration:</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(registerUrl)}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Accept invitation</a>
  </p>
  <p style="color: #888; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="color: #666; font-size: 13px; word-break: break-all;">${escapeHtml(registerUrl)}</p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getInviteText(
  registerUrl: string,
  companyName?: string,
  inviteRole: 'company_admin' | 'employee' = 'company_admin',
): string {
  const isEmployee = inviteRole === 'employee';
  const intro = isEmployee
    ? (companyName
      ? `You have been invited to join ${companyName} as an employee.`
      : 'You have been invited to join as an employee.')
    : (companyName
      ? `You have been invited to join ${companyName} as a Company Admin.`
      : 'You have been invited to join as a Company Admin.');
  const title = isEmployee ? 'Employee invitation' : 'Company Admin Invitation';
  return [
    title,
    '',
    intro,
    '',
    'Click the link below to set your password and complete registration:',
    registerUrl,
    '',
    'This link expires in 7 days. If you didn\'t expect this email, you can ignore it.',
  ].join('\n');
}

/** Implicit TLS (465) vs plain + STARTTLS (587) — see denomailer SMTPClient. */
function smtpUseImplicitTls(port: number): boolean {
  if (SMTP_TLS_MODE === 'starttls') return false;
  if (SMTP_TLS_MODE === 'tls' || SMTP_TLS_MODE === 'ssl') return true;
  return port !== 587;
}

/** Gmail App Passwords are often copied with spaces; AUTH LOGIN requires the 16 chars without spaces. */
function normalizeSmtpPassword(hostname: string, password: string): string {
  const p = password.trim();
  if (/smtp\.gmail\.com/i.test(hostname)) {
    return p.replace(/\s+/g, '');
  }
  return p;
}

async function sendViaSmtp(args: {
  to: string;
  subject: string;
  html: string;
  content: string;
}): Promise<void> {
  const passTrim = SMTP_PASS?.trim() ?? '';
  if (!SMTP_HOST || !Number.isFinite(SMTP_PORT) || !SMTP_USER || !passTrim || !SMTP_FROM) {
    throw new Error('SMTP is not configured');
  }

  const username = SMTP_USER.trim();
  const password = normalizeSmtpPassword(SMTP_HOST, passTrim);
  const implicitTls = smtpUseImplicitTls(SMTP_PORT);

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: implicitTls,
      auth: {
        username,
        password,
      },
    },
  });
  try {
    await client.send({
      from: SMTP_FROM,
      to: args.to,
      subject: args.subject,
      content: args.content,
      html: args.html,
    });
  } finally {
    await Promise.resolve(client.close());
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const smtpConfigured =
    Boolean(SMTP_HOST) &&
    Number.isFinite(SMTP_PORT) &&
    Boolean(SMTP_USER) &&
    Boolean(SMTP_PASS?.trim()) &&
    Boolean(SMTP_FROM);

  const useSmtpOnly = EMAIL_PRIMARY === 'smtp';
  if (useSmtpOnly) {
    if (!smtpConfigured) {
      console.error('EMAIL_PRIMARY=smtp but SMTP secrets are incomplete');
      return new Response(
        JSON.stringify({
          error: 'SMTP not configured for EMAIL_PRIMARY=smtp',
          hint:
            'Set SMTP_HOST (e.g. smtp.gmail.com), SMTP_PORT (465), SMTP_USER, SMTP_PASS (Gmail: App Password), SMTP_FROM. See https://support.google.com/accounts/answer/185833',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } else if (!RESEND_API_KEY && !smtpConfigured) {
    console.error('Neither Resend nor SMTP is configured');
    return new Response(
      JSON.stringify({
        error: 'Email service not configured',
        hint: 'Set RESEND_API_KEY, or set EMAIL_PRIMARY=smtp and configure SMTP_* secrets.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { email, token, companyName, inviteRole: roleRaw } = body;
  const inviteRole: 'company_admin' | 'employee' =
    roleRaw === 'employee' ? 'employee' : 'company_admin';
  if (!email || !token) {
    return new Response(
      JSON.stringify({ error: 'email and token are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // FRONTEND_URL must be your Angular app URL (e.g. https://yourapp.com), NOT your Supabase project URL.
  // If you use a Supabase URL here, the link in the email will hit Supabase and return "requested path is invalid".
  const baseUrl = (FRONTEND_URL || '').replace(/\/$/, '');
  if (!baseUrl || baseUrl.includes('supabase.co')) {
    console.error(
      'FRONTEND_URL must be your app URL (e.g. https://yourapp.com or http://localhost:4200). It must NOT be your Supabase project URL. Current value:', FRONTEND_URL
    );
    return new Response(
      JSON.stringify({
        error: 'FRONTEND_URL is missing or points to Supabase. Set Edge Function secret FRONTEND_URL to your Angular app URL (e.g. https://yourapp.com).',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const registerUrl = `${baseUrl}/register?token=${encodeURIComponent(token)}`;
  const html = getInviteHtml(registerUrl, companyName, inviteRole);
  const subject =
    inviteRole === 'employee'
      ? (companyName
        ? `You're invited to join ${companyName} as an employee`
        : "You're invited as an employee")
      : (companyName
        ? `You're invited to join ${companyName} as Company Admin`
        : "You're invited as Company Admin");
  const plainText = getInviteText(registerUrl, companyName, inviteRole);

  // Skip Resend: send only via SMTP (works to any recipient if your SMTP allows it).
  if (useSmtpOnly) {
    try {
      await sendViaSmtp({
        to: email,
        subject,
        html,
        content: plainText,
      });
      return new Response(
        JSON.stringify({ success: true, provider: 'smtp', emailPrimary: 'smtp' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (smtpErr) {
      return new Response(
        JSON.stringify({
          error: 'Failed to send invitation email via SMTP',
          smtpError: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
          hint:
            'Gmail 535: (1) Use an App Password, not your normal password. (2) In secrets, paste the 16 characters with no spaces (or we strip spaces for smtp.gmail.com). (3) SMTP_USER must be the full Gmail address. (4) Try SMTP_PORT=587 and SMTP_TLS_MODE=starttls. (5) Workspace accounts: admin may block SMTP; use a personal Gmail or another provider.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // If Resend is not configured, send directly with SMTP.
  if (!RESEND_API_KEY) {
    try {
      await sendViaSmtp({
        to: email,
        subject,
        html,
        content: plainText,
      });
      return new Response(
        JSON.stringify({ success: true, provider: 'smtp' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (smtpErr) {
      return new Response(
        JSON.stringify({
          error: 'Failed to send invitation email',
          smtpError: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: email,
      subject,
      html,
      text: plainText,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    console.error('Resend error:', res.status, data);
    let resendMessage = '';
    if (typeof data.message === 'string') resendMessage = data.message;
    else if (data.error && typeof data.error === 'object' && data.error !== null) {
      const m = (data.error as { message?: unknown }).message;
      if (typeof m === 'string') resendMessage = m;
    }
    const isSandboxRecipientLimit =
      /testing emails|verify a domain|only send testing|own email address/i.test(
        resendMessage,
      );
    const payload: Record<string, unknown> = {
      error: 'Failed to send invitation email',
      details: data,
    };

    // If Resend blocks non-matching recipients (domain not verified yet),
    // optionally fall back to Gmail SMTP.
    if (isSandboxRecipientLimit && smtpConfigured) {
      try {
        await sendViaSmtp({
          to: email,
          subject,
          html,
          content: plainText,
        });
        return new Response(
          JSON.stringify({ success: true, provider: 'smtp' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (smtpErr) {
        console.warn('SMTP fallback failed after Resend blocked:', smtpErr);
        payload.smtpError = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      }
    }

    if (isSandboxRecipientLimit) {
      payload.hint =
        'Option A: Verify a domain at https://resend.com/domains and set RESEND_FROM to an address on that domain. Option B: Set Supabase secret EMAIL_PRIMARY=smtp and configure SMTP_HOST/SMTP_USER/SMTP_PASS (see function README) to send via Gmail or another SMTP provider — no Resend domain needed.';
      if (RESEND_FROM.includes('resend.dev')) {
        payload.usedFrom = RESEND_FROM;
      }
    }
    return new Response(JSON.stringify(payload), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ success: true, id: data.id }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(handler);
