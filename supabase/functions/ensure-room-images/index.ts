// Download a featured image for each room that doesn't have one, upload to Storage, save URL in DB.
// Call with: POST body {}, Authorization: Bearer <user JWT>.
// Requires: room-images bucket (public). Create in Dashboard or run:
//   insert into storage.buckets (id, name, public) values ('room-images', 'room-images', true) on conflict (id) do update set public = true;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROOM_PHOTOS = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1593062096033-9a26dc09f2d5?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573164713988-8665fc2effaa?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556760544-74068565f05e?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552581234-26160f608093?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556761175-b19a2182beb8?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=600&fit=crop&q=80',
];

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h;
}

function pickImageUrl(roomId: string): string {
  const index = Math.abs(simpleHash(roomId)) % ROOM_PHOTOS.length;
  return ROOM_PHOTOS[index];
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();

  const companyId = profile?.company_id as string | null;
  const role = profile?.role as string | null;
  if (!companyId && role !== 'sys_admin') {
    return new Response(
      JSON.stringify({ error: 'Company context required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let toProcess: { id: string }[];
  if (companyId) {
    const { data: companyRooms, error: roomsError } = await supabaseAdmin
      .from('rooms')
      .select('id')
      .eq('company_id', companyId)
      .is('featured_image_url', null);
    if (roomsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rooms', details: roomsError.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    toProcess = (companyRooms ?? []).filter((r: { id: string }) => r.id);
  } else {
    const { data: allRooms, error: roomsError } = await supabaseAdmin
      .from('rooms')
      .select('id')
      .is('featured_image_url', null);
    if (roomsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rooms', details: roomsError.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    toProcess = (allRooms ?? []).filter((r: { id: string }) => r.id);
  }

  let updated = 0;
  const bucket = 'room-images';

  for (const room of toProcess) {
    const roomId = room.id as string;
    const sourceUrl = pickImageUrl(roomId);
    try {
      const imageRes = await fetch(sourceUrl, { redirect: 'follow' });
      if (!imageRes.ok) {
        console.error(`Room ${roomId}: fetch image failed ${imageRes.status}`);
        continue;
      }
      const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      const buffer = await imageRes.arrayBuffer();
      const path = `room-${roomId}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`Room ${roomId}: upload failed`, uploadError);
        continue;
      }

      const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

      const { error: updateError } = await supabaseAdmin
        .from('rooms')
        .update({ featured_image_url: publicUrl })
        .eq('id', roomId);

      if (updateError) {
        console.error(`Room ${roomId}: update DB failed`, updateError);
        continue;
      }
      updated++;
    } catch (e) {
      console.error(`Room ${roomId}:`, e);
    }
  }

  return new Response(
    JSON.stringify({ updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(handler);
