-- 目標達成会議 Supabase schema
-- Supabase の SQL Editor でこのファイル全体を貼り付けて Run してください。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_month text not null check (target_month ~ '^[0-9]{4}-[0-9]{2}$'),
  theme text not null default '',
  work_goal text not null default '',
  private_goal text not null default '',
  mindset_goal text not null default '',
  support_request text not null default '',
  reflection text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists monthly_posts_one_live_per_user_month
  on public.monthly_posts(user_id, target_month)
  where deleted_at is null;

create index if not exists monthly_posts_month_idx
  on public.monthly_posts(target_month, status, deleted_at, updated_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.monthly_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists comments_post_idx
  on public.comments(post_id, parent_comment_id, deleted_at, created_at);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('thumbs_up', 'fire', 'muscle', 'eyes', 'raised_hands', 'bulb')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists reactions_one_live_per_user_target_type
  on public.reactions(target_type, target_id, user_id, reaction_type)
  where deleted_at is null;

create index if not exists reactions_target_idx
  on public.reactions(target_type, target_id, deleted_at);

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.monthly_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists post_versions_post_idx
  on public.post_versions(post_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.monthly_posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.post_versions enable row level security;

drop policy if exists "profiles are visible to members" on public.profiles;
create policy "profiles are visible to members"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "members can insert own profile" on public.profiles;
create policy "members can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "members can update own profile" on public.profiles;
create policy "members can update own profile"
on public.profiles for update
to authenticated
