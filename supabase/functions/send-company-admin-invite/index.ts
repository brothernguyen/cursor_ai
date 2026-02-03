// Send invitation email to a new company admin (Resend).
// Set RESEND_API_KEY and FRONTEND_URL in Supabase Dashboard → Edge Functions → Secrets.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'http://localhost:4200';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteBody {
  email: string;
  token: string;
  companyName?: string;
}

function getInviteHtml(registerUrl: string, companyName?: string): string {
  const intro = companyName
    ? `You have been invited to join <strong>${escapeHtml(companyName)}</strong> as a Company Admin.`
    : 'You have been invited to join as a Company Admin.';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invitation</title></head>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #333;">Company Admin Invitation</h2>
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

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set');
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
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

  const { email, token, companyName } = body;
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
  const html = getInviteHtml(registerUrl, companyName);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev',
      to: email,
      subject: companyName ? `You're invited to join ${companyName} as Company Admin` : "You're invited as Company Admin",
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Resend error:', res.status, data);
    return new Response(
      JSON.stringify({ error: 'Failed to send email', details: data }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, id: data.id }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(handler);
