-- Firebase -> Supabase migration base schema for VPN app.
-- Uses prefixed table names to avoid collisions with existing Supabase projects.

create extension if not exists pgcrypto;

create table if not exists public.vpn_firestore_documents (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  document_path text not null unique,
  collection_path text not null,
  collection_name text not null,
  document_id text not null,
  parent_document_path text,
  data jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  migrated_at timestamptz not null default now()
);

create index if not exists idx_vpn_firestore_documents_app_id
  on public.vpn_firestore_documents (app_id);

create index if not exists idx_vpn_firestore_documents_collection_path
  on public.vpn_firestore_documents (collection_path);

create index if not exists idx_vpn_firestore_documents_collection_name
  on public.vpn_firestore_documents (collection_name);

create index if not exists idx_vpn_firestore_documents_data_gin
  on public.vpn_firestore_documents using gin (data);

create table if not exists public.vpn_users (
  uid text primary key,
  app_id text not null,
  email text,
  name text,
  phone text,
  role text,
  plan text,
  uuid text,
  sub_id text,
  expires_at timestamptz,
  tariff_id text,
  tariff_name text,
  photo_url text,
  language text,
  referred_by text,
  raw jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  migrated_at timestamptz not null default now()
);

create unique index if not exists idx_vpn_users_app_id_uid
  on public.vpn_users (app_id, uid);

create index if not exists idx_vpn_users_app_id_role
  on public.vpn_users (app_id, role);

create index if not exists idx_vpn_users_app_id_email
  on public.vpn_users (app_id, email);

create index if not exists idx_vpn_users_app_id_sub_id
  on public.vpn_users (app_id, sub_id);

create table if not exists public.vpn_tariffs (
  id text not null,
  app_id text not null,
  name text,
  price numeric,
  duration_days integer,
  is_active boolean,
  raw jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  migrated_at timestamptz not null default now(),
  primary key (app_id, id)
);

create index if not exists idx_vpn_tariffs_app_id
  on public.vpn_tariffs (app_id);

create table if not exists public.vpn_payments (
  id text not null,
  app_id text not null,
  user_id text,
  amount numeric,
  status text,
  provider text,
  tariff_id text,
  created_at timestamptz,
  paid_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  migrated_at timestamptz not null default now(),
  primary key (app_id, id)
);

create index if not exists idx_vpn_payments_app_id_user_id
  on public.vpn_payments (app_id, user_id);

create index if not exists idx_vpn_payments_app_id_status
  on public.vpn_payments (app_id, status);

alter table public.vpn_firestore_documents enable row level security;
alter table public.vpn_users enable row level security;
alter table public.vpn_tariffs enable row level security;
alter table public.vpn_payments enable row level security;
