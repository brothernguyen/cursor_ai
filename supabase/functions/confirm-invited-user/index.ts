// Confirm email for a user who just signed up via an invitation link.
// Uses service role to set email_confirm = true so they can sign in without Supabase's "Confirm email" step.
// Invoke with POST body: { token: string, userId: string }

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  token?: string;
  userId?: string;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { token, userId } = body;
  if (!token || !userId) {
    return new Response(
      JSON.stringify({ error: 'token and userId are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (invError || !invitations?.length) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired invitation token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const invitationEmail = (invitations[0] as { email: string }).email;

  const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !user?.user) {
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (user.user.email?.toLowerCase() !== invitationEmail.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: 'User email does not match invitation' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (updateError) {
    console.error('Failed to confirm user email:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to confirm email', details: updateError.message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(handler);
