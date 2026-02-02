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
  status text default 'active' check (status in ('active', 'inactive', 'pending')),
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
  status text default 'pending' check (status in ('active', 'inactive', 'pending')),
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
  created_at timestamptz default now()
);

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
  status text default 'pending' check (status in ('active', 'inactive', 'pending')),
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

-- Helper: current user's role and company_id from profiles
create or replace function public.my_profile()
returns table (role text, company_id uuid) as $$
  select p.role, p.company_id
  from public.profiles p
  where p.id = auth.uid();
$$ language sql security definer stable;

-- =============================================================================
-- RLS: enable and policies
-- =============================================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_admins enable row level security;
alter table public.rooms enable row level security;
alter table public.employees enable row level security;
alter table public.invitations enable row level security;

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

-- RPC: get invitation by token (for accept-invitation; callable without auth)
create or replace function public.get_invitation_by_token(t text)
returns setof public.invitations language sql security definer set search_path = public as $$
  select * from public.invitations where token = t and expires_at > now();
$$;
grant execute on function public.get_invitation_by_token(text) to anon;

-- First sys_admin: after signing up once in the app, run (replace email):
--   insert into public.profiles (id, email, role) select id, email, 'sys_admin' from auth.users where email = 'your@email.com';
-- Or in Table Editor: add a row to profiles with id = auth user id, email, role = 'sys_admin'.