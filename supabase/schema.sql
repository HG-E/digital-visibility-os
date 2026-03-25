-- ============================================================
-- DVOS — Supabase Schema
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. PROFILES — one row per anonymous session / user
-- ============================================================
create table if not exists profiles (
  id            uuid primary key,           -- = auth.uid()
  orcid         text,
  name          text        not null,
  institution   text        default '',
  field         text        default '',
  score         integer     default 0,
  data          jsonb       default '{}',   -- full S.profile blob
  updated_at    timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users manage own profile"
  on profiles for all
  using  (id = auth.uid())
  with check (id = auth.uid());


-- 2. COLLAB CARDS — public read, owner write, auto-expire 30 days
-- ============================================================
create table if not exists collab_cards (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete cascade not null,
  name        text        not null,
  institution text        default '',
  field       text        default '',
  orcid       text        default '',
  topic       text        not null,
  stage       text        default '',
  looking_for text        default '',
  contact     text        default '',
  active      boolean     default true,
  created_at  timestamptz default now(),
  expires_at  timestamptz default (now() + interval '30 days')
);

alter table collab_cards enable row level security;

-- Anyone can read active, non-expired cards (powers the live feed)
create policy "Anyone can read active cards"
  on collab_cards for select
  using (active = true and expires_at > now());

-- Only owner can insert / update / delete their own cards
create policy "Users manage own cards"
  on collab_cards for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fast lookup for field-based browsing
create index if not exists idx_collab_field_active
  on collab_cards (field, active, expires_at desc);


-- 3. SAVED ITEMS — private bookmarks (conf, grant, collab)
-- ============================================================
create table if not exists saved_items (
  id        uuid        primary key default gen_random_uuid(),
  user_id   uuid        references auth.users(id) on delete cascade not null,
  type      text        not null check (type in ('conf', 'grant', 'collab')),
  item_id   text        not null,
  payload   jsonb       not null default '{}',
  saved_at  timestamptz default now(),
  unique (user_id, type, item_id)
);

alter table saved_items enable row level security;

create policy "Users manage own saved items"
  on saved_items for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
