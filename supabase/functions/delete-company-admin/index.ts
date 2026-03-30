// Delete a company admin: remove the company_admins row and the auth user (if any).
// Uses service role so the auth user can be deleted and they can no longer log in.
// Call with: POST body { company_admin_id: "<uuid>" }, Authorization: Bearer <user JWT>.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  company_admin_id?: string;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Authorization required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const companyAdminId = body.company_admin_id?.trim();
  if (!companyAdminId) {
    return new Response(
      JSON.stringify({ error: 'company_admin_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Validate caller JWT + authorize (without relying on platform verify_jwt).
  // We do this using the anon key so we can call auth.getUser with the provided access token.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error (missing SUPABASE_ANON_KEY)' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: caller, error: callerErr } = await supabaseUser.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (callerErr || !caller?.user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 1) Get company_admin row to read user_id before deleting
  const { data: row, error: fetchError } = await supabaseAdmin
    .from('company_admins')
    .select('user_id, company_id')
    .eq('id', companyAdminId)
    .single();

  if (fetchError || !row) {
    return new Response(
      JSON.stringify({ error: 'Company admin not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = row.user_id as string | null;
  const targetCompanyId = row.company_id as string | null;

  // Determine caller role/company and enforce:
  // - sys_admin can delete any company admin
  // - company_admin can delete only within the same company
  const { data: callerProfile, error: callerProfileErr } = await supabaseAdmin
    .from('profiles')
    .select('role, company_id')
    .eq('id', caller.user.id)
    .single();

  if (callerProfileErr || !callerProfile) {
    return new Response(
      JSON.stringify({ error: 'Caller profile not found' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const callerRole = String(callerProfile.role ?? '');
  const callerCompanyId = callerProfile.company_id as string | null;

  const isSysAdmin = callerRole === 'system_admin' || callerRole === 'sys_admin' || callerRole === 'system';
  const canDelete = isSysAdmin || (callerRole === 'company_admin' && callerCompanyId && targetCompanyId && callerCompanyId === targetCompanyId);
  if (!canDelete) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2) Delete the company_admins row
  const { error: deleteRowError } = await supabaseAdmin
    .from('company_admins')
    .delete()
    .eq('id', companyAdminId);

  if (deleteRowError) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete company admin', details: deleteRowError.message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3) If they had an auth account, delete it so they can no longer log in.
  //    Login is gated by auth.users; without deleting it, they can still sign in.
  //    profiles has FK to auth.users(id) ON DELETE CASCADE, so the profile should
  //    be removed when the user is deleted; we also delete the profile explicitly
  //    as a safety net in case cascade is not in effect in this project.
  if (userId) {
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('Auth user delete error:', deleteUserError);
      return new Response(
        JSON.stringify({ error: 'Company admin removed but failed to remove login account', details: deleteUserError.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (deleteProfileError) {
      console.error('Profile delete error (auth user already removed):', deleteProfileError);
      // Don't fail the request: auth user is gone so they can't log in; profile is just leftover data.
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(handler);
