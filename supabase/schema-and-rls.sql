-- =============================================================================
-- Supabase schema + RLS for meeting-room app (run in SQL Editor)
-- =============================================================================
-- Run this in your Supabase project: Dashboard → SQL Editor → New query
-- Replace and run in order. Create first sys_admin after signup (see bottom).
-- =============================================================================

-- 1. Companies (no FK to profiles)
create table if not exists public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  logo_url text,
  address text not null,
  phone text,
  industry text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Profiles (extends auth.users with role and company)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  role text not null check (role in ('sys_admin', 'company_admin', 'employee')),
  company_id uuid references public.companies(id) on delete set null,
  first_name text,
  last_name text,
  status text default 'inactive' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Company admins (invitation + link user to company)
create table if not exists public.company_admins (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  status text default 'inactive' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, email)
);

-- 4. Rooms (per company)
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  capacity int not null,
  available_from text not null,
  available_to text not null,
  location text not null,
  timezone text default 'UTC',
  status text default 'active' check (status in ('active', 'inactive')),
  featured_image_url text,
  created_at timestamptz default now()
);

-- Add featured_image_url if table already exists (run once if you added rooms before this column)
-- alter table public.rooms add column if not exists featured_image_url text;

-- Storage bucket for room images (public read so cards can display without auth)
-- Run in SQL Editor if the bucket does not exist:
-- insert into storage.buckets (id, name, public) values ('room-images', 'room-images', true)
--   on conflict (id) do update set public = true;
-- Policy: allow authenticated upload (service role used by Edge Function), public read via bucket public flag

-- 5. Employees (per company)
create table if not exists public.employees (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  department text,
  role text default 'employee',
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. Invitations (for accept-invitation flow)
create table if not exists public.invitations (
  id uuid default gen_random_uuid() primary key,
  token text not null unique,
  email text not null,
  role text not null,
  company_id uuid references public.companies(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- 7. Meetings & meeting_guests (see also supabase/migrations/20250406000000_meetings_and_guests.sql)
create extension if not exists btree_gist;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  room_id uuid not null references public.rooms (id) on delete restrict,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  meeting_note text,
  details text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_time_order check (end_time > start_time)
);

create table if not exists public.meeting_guests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);

create index if not exists idx_meetings_company_start on public.meetings (company_id, start_time desc);
create index if not exists idx_meetings_created_by on public.meetings (created_by);
create index if not exists idx_meeting_guests_meeting on public.meeting_guests (meeting_id);
create index if not exists idx_meeting_guests_user on public.meeting_guests (user_id);

alter table public.meetings drop constraint if exists meetings_no_overlap_scheduled;
alter table public.meetings
  add constraint meetings_no_overlap_scheduled
  exclude using gist (
    room_id with =,
    tstzrange (start_time, end_time) with &&
  )
  where (status = 'scheduled');

create or replace function public.meetings_touch_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.meetings_before_write ()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  r_company uuid;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.room_id is distinct from old.room_id) then
    select company_id into r_company from public.rooms where id = new.room_id;
    if r_company is null then
      raise exception 'Invalid room_id';
    end if;
    new.company_id := r_company;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.created_by is null then
      raise exception 'Authentication required';
    end if;
  end if;

  if new.end_time <= new.start_time then
    raise exception 'end_time must be after start_time';
  end if;

  return new;
end;
$$;

drop trigger if exists meetings_before_write on public.meetings;
create trigger meetings_before_write
  before insert or update on public.meetings
  for each row execute function public.meetings_before_write ();

drop trigger if exists meetings_touch_updated_at on public.meetings;
create trigger meetings_touch_updated_at
  before update on public.meetings
  for each row execute function public.meetings_touch_updated_at ();

-- Helper: current user's role and company_id from profiles
create or replace function public.my_profile()
returns table (role text, company_id uuid) as $$
  select p.role, p.company_id
  from public.profiles p
  where p.id = auth.uid();
$$ language sql security definer stable;

-- =============================================================================
-- Trigger: create profiles row when a new auth user is created (long-term fix)
-- Uses raw_user_meta_data from signUp({ options: { data: { role, company_id, ... } } })
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, company_id, first_name, last_name, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'employee'),
    (new.raw_user_meta_data->>'company_id')::uuid,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(nullif(trim(new.raw_user_meta_data->>'status'), ''), 'active')
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    role = coalesce(nullif(trim(excluded.role), ''), profiles.role),
    company_id = coalesce(excluded.company_id, profiles.company_id),
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    status = coalesce(nullif(trim(excluded.status), ''), profiles.status);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS: enable and policies
-- =============================================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_admins enable row level security;
alter table public.rooms enable row level security;
alter table public.employees enable row level security;
alter table public.invitations enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_guests enable row level security;

-- Companies: sys_admin all; company_admin read own
drop policy if exists "companies_sys_admin_all" on public.companies;
create policy "companies_sys_admin_all" on public.companies for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "companies_company_admin_read" on public.companies;
create policy "companies_company_admin_read" on public.companies for select
  using (id = (select company_id from my_profile()));

-- Profiles: users can read/update own; sys_admin all
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_sys_admin_all" on public.profiles;
create policy "profiles_sys_admin_all" on public.profiles for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

-- Company admins: sys_admin all; company_admin CRUD for own company
drop policy if exists "company_admins_sys_admin_all" on public.company_admins;
create policy "company_admins_sys_admin_all" on public.company_admins for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "company_admins_company_admin_all" on public.company_admins;
create policy "company_admins_company_admin_all" on public.company_admins for all
  using (company_id = (select company_id from my_profile()))
  with check (company_id = (select company_id from my_profile()));

-- Rooms: sys_admin all; company_admin CRUD own company
drop policy if exists "rooms_sys_admin_all" on public.rooms;
create policy "rooms_sys_admin_all" on public.rooms for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "rooms_company_admin_all" on public.rooms;
create policy "rooms_company_admin_all" on public.rooms for all
  using (company_id = (select company_id from my_profile()))
  with check (company_id = (select company_id from my_profile()));

-- Employees: sys_admin all; company_admin CRUD own company
drop policy if exists "employees_sys_admin_all" on public.employees;
create policy "employees_sys_admin_all" on public.employees for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "employees_company_admin_all" on public.employees;
create policy "employees_company_admin_all" on public.employees for all
  using (company_id = (select company_id from my_profile()))
  with check (company_id = (select company_id from my_profile()));

-- Invitations: sys_admin and company_admin can manage; allow read by token for accept (anon or service)
drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all" on public.invitations for all
  using (
    (select role from my_profile()) = 'sys_admin'
    or (select role from my_profile()) = 'company_admin'
  )
  with check (
    (select role from my_profile()) = 'sys_admin'
    or (select role from my_profile()) = 'company_admin'
  );

-- Meetings & meeting_guests (sys_admin / company_admin / employee)
drop policy if exists "meetings_sys_admin_all" on public.meetings;
create policy "meetings_sys_admin_all" on public.meetings for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "meetings_company_select" on public.meetings;
create policy "meetings_company_select" on public.meetings for select
  using (
    company_id = (select company_id from my_profile())
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.meeting_guests mg
        where mg.meeting_id = meetings.id and mg.user_id = auth.uid()
      )
    )
  );

drop policy if exists "meetings_company_insert" on public.meetings;
create policy "meetings_company_insert" on public.meetings for insert
  with check (
    (select role from my_profile()) in ('company_admin', 'employee')
    and company_id = (select company_id from my_profile())
    and (select company_id from my_profile()) is not null
    and created_by = auth.uid()
  );

drop policy if exists "meetings_company_update" on public.meetings;
create policy "meetings_company_update" on public.meetings for update
  using (
    company_id = (select company_id from my_profile())
    and (
      created_by = auth.uid()
      or (select role from my_profile()) = 'company_admin'
    )
  )
  with check (
    company_id = (select company_id from my_profile())
    and (
      created_by = auth.uid()
      or (select role from my_profile()) = 'company_admin'
    )
  );

drop policy if exists "meetings_company_delete" on public.meetings;
create policy "meetings_company_delete" on public.meetings for delete
  using ((select role from my_profile()) = 'sys_admin');

drop policy if exists "meeting_guests_sys_admin_all" on public.meeting_guests;
create policy "meeting_guests_sys_admin_all" on public.meeting_guests for all
  using ((select role from my_profile()) = 'sys_admin')
  with check ((select role from my_profile()) = 'sys_admin');

drop policy if exists "meeting_guests_select_company" on public.meeting_guests;
create policy "meeting_guests_select_company" on public.meeting_guests for select
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_guests.meeting_id
        and m.company_id = (select company_id from my_profile())
        and (
          m.created_by = auth.uid()
          or exists (
            select 1 from public.meeting_guests mg
            where mg.meeting_id = m.id and mg.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "meeting_guests_insert_company" on public.meeting_guests;
create policy "meeting_guests_insert_company" on public.meeting_guests for insert
  with check (
    exists (
      select 1
      from public.meetings m
      join public.profiles p on p.id = meeting_guests.user_id
      where m.id = meeting_guests.meeting_id
        and m.company_id = p.company_id
        and m.company_id = (select company_id from my_profile())
        and (
          m.created_by = auth.uid()
          or (select role from my_profile()) = 'company_admin'
        )
    )
  );

drop policy if exists "meeting_guests_update_company" on public.meeting_guests;
create policy "meeting_guests_update_company" on public.meeting_guests for update
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_guests.meeting_id
        and m.company_id = (select company_id from my_profile())
        and (
          m.created_by = auth.uid()
          or (select role from my_profile()) = 'company_admin'
          or meeting_guests.user_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_guests.meeting_id
        and m.company_id = (select company_id from my_profile())
        and (
          m.created_by = auth.uid()
          or (select role from my_profile()) = 'company_admin'
          or meeting_guests.user_id = auth.uid()
        )
    )
  );

drop policy if exists "meeting_guests_delete_company" on public.meeting_guests;
create policy "meeting_guests_delete_company" on public.meeting_guests for delete
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_guests.meeting_id
        and m.company_id = (select company_id from my_profile())
        and (
          m.created_by = auth.uid()
          or (select role from my_profile()) = 'company_admin'
        )
    )
  );

grant select, insert, update, delete on public.meetings to authenticated, service_role;
grant select, insert, update, delete on public.meeting_guests to authenticated, service_role;

-- RPC: get invitation by token (for accept-invitation; callable without auth)
create or replace function public.get_invitation_by_token(t text)
returns setof public.invitations language sql security definer set search_path = public as $$
  select * from public.invitations where token = t and expires_at > now();
$$;
grant execute on function public.get_invitation_by_token(text) to anon;

create or replace function public.create_meeting_with_guests (
  p_room_id uuid,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_meeting_note text default null,
  p_details text default null,
  p_guest_ids uuid[] default array[]::uuid[]
)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_meeting public.meetings;
  uid uuid := auth.uid();
  my_role text;
  my_company uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  select role, company_id into my_role, my_company from public.profiles where id = uid;
  if my_role is null then
    raise exception 'Profile required';
  end if;

  select company_id into v_company_id from public.rooms where id = p_room_id;
  if v_company_id is null then
    raise exception 'Invalid room_id';
  end if;

  if my_role <> 'sys_admin' then
    if my_company is distinct from v_company_id then
      raise exception 'Room is not in your company';
    end if;
    if my_role not in ('company_admin', 'employee') then
      raise exception 'Insufficient permission to create meetings';
    end if;
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end_time must be after start_time';
  end if;

  if p_guest_ids is not null and coalesce(array_length(p_guest_ids, 1), 0) > 0 then
    if exists (
      select 1 from unnest(p_guest_ids) as gid
      where not exists (
        select 1 from public.profiles p
        where p.id = gid and p.company_id is not distinct from v_company_id
      )
    ) then
      raise exception 'All guests must belong to the same company as the room';
    end if;
  end if;

  begin
    insert into public.meetings (
      company_id, created_by, room_id, title, start_time, end_time, meeting_note, details, status
    )
    values (
      v_company_id, uid, p_room_id, p_title, p_start_time, p_end_time, p_meeting_note, p_details, 'scheduled'
    )
    returning * into v_meeting;
  exception
    when exclusion_violation then
      raise exception 'Room overlap: another scheduled meeting exists in this time range';
  end;

  if p_guest_ids is not null and coalesce(array_length(p_guest_ids, 1), 0) > 0 then
    insert into public.meeting_guests (meeting_id, user_id, status)
    select v_meeting.id, gid, 'pending'
    from unnest(p_guest_ids) as gid
    on conflict (meeting_id, user_id) do nothing;
  end if;

  return v_meeting;
end;
$$;

create or replace function public.rsvp_meeting (p_meeting_id uuid, p_status text)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.meetings;
  n int;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'Invalid status';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.meeting_guests mg
  set status = p_status
  where mg.meeting_id = p_meeting_id and mg.user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Not a guest of this meeting';
  end if;

  select * into r from public.meetings where id = p_meeting_id;
  return r;
end;
$$;

grant execute on function public.create_meeting_with_guests (
  uuid, text, timestamptz, timestamptz, text, text, uuid[]
) to authenticated;
grant execute on function public.rsvp_meeting (uuid, text) to authenticated;

-- First sys_admin: after signing up once in the app, run (replace email):
--   insert into public.profiles (id, email, role) select id, email, 'sys_admin' from auth.users where email = 'your@email.com';
-- Or in Table Editor: add a row to profiles with id = auth user id, email, role = 'sys_admin'.