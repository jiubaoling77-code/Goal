-- 目標達成会議: Supabase schema, RLS, Realtime, backup RPC
-- Supabase SQL Editor にそのまま貼って Run してください。

create extension if not exists pgcrypto;

do $$
begin
  create type public.post_status as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.reaction_target_type as enum ('post', 'comment');
exception
  when duplicate_object then null;
end $$;

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
  status public.post_status not null default 'draft',
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
  target_type public.reaction_target_type not null,
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists monthly_posts_touch_updated_at on public.monthly_posts;
create trigger monthly_posts_touch_updated_at
before update on public.monthly_posts
for each row execute function public.touch_updated_at();

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
before update on public.comments
for each row execute function public.touch_updated_at();

create or replace function public.save_post_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.post_versions (post_id, user_id, snapshot_json)
  values (
    new.id,
    new.user_id,
    jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'target_month', new.target_month,
      'theme', new.theme,
      'work_goal', new.work_goal,
      'private_goal', new.private_goal,
      'mindset_goal', new.mindset_goal,
      'support_request', new.support_request,
      'reflection', new.reflection,
      'status', new.status,
      'created_at', new.created_at,
      'updated_at', new.updated_at,
      'deleted_at', new.deleted_at
    )
  );
  return new;
end;
$$;

drop trigger if exists monthly_posts_save_version on public.monthly_posts;
create trigger monthly_posts_save_version
after insert or update on public.monthly_posts
for each row execute function public.save_post_version();

create or replace function public.prevent_nested_replies()
returns trigger
language plpgsql
as $$
declare
  parent_post_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select post_id, parent_comment_id
    into parent_post_id, parent_parent_id
  from public.comments
  where id = new.parent_comment_id
    and deleted_at is null;

  if parent_post_id is null then
    raise exception 'parent comment does not exist';
  end if;

  if parent_post_id <> new.post_id then
    raise exception 'reply must belong to the same post';
  end if;

  if parent_parent_id is not null then
    raise exception 'replies are limited to one level';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_prevent_nested_replies on public.comments;
create trigger comments_prevent_nested_replies
before insert or update of parent_comment_id, post_id on public.comments
for each row execute function public.prevent_nested_replies();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), 'メンバー')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.export_backup()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'app', 'goal-share-meeting',
    'schema_version', 1,
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.profiles p), '[]'::jsonb),
    'monthly_posts', coalesce((select jsonb_agg(to_jsonb(mp) order by mp.created_at) from public.monthly_posts mp), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.comments c), '[]'::jsonb),
    'reactions', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reactions r), '[]'::jsonb),
    'post_versions', coalesce((select jsonb_agg(to_jsonb(pv) order by pv.created_at) from public.post_versions pv), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

grant execute on function public.export_backup() to authenticated;

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
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members can read visible posts" on public.monthly_posts;
create policy "members can read visible posts"
on public.monthly_posts for select
to authenticated
using (
  deleted_at is null
  and (status = 'published' or user_id = auth.uid())
);

drop policy if exists "members can insert own posts" on public.monthly_posts;
create policy "members can insert own posts"
on public.monthly_posts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "members can update own posts" on public.monthly_posts;
create policy "members can update own posts"
on public.monthly_posts for update
to authenticated
using (user_id = auth.uid() and deleted_at is null)
with check (user_id = auth.uid());

drop policy if exists "members can read visible comments" on public.comments;
create policy "members can read visible comments"
on public.comments for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.monthly_posts p
    where p.id = comments.post_id
      and p.deleted_at is null
      and (p.status = 'published' or p.user_id = auth.uid())
  )
);

drop policy if exists "members can insert comments on published posts" on public.comments;
create policy "members can insert comments on published posts"
on public.comments for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.monthly_posts p
    where p.id = comments.post_id
      and p.deleted_at is null
      and p.status = 'published'
  )
);

drop policy if exists "members can soft delete own comments" on public.comments;
create policy "members can soft delete own comments"
on public.comments for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "members can read visible reactions" on public.reactions;
create policy "members can read visible reactions"
on public.reactions for select
to authenticated
using (
  deleted_at is null
  and (
    (
      target_type = 'post'
      and exists (
        select 1 from public.monthly_posts p
        where p.id = reactions.target_id
          and p.deleted_at is null
          and (p.status = 'published' or p.user_id = auth.uid())
      )
    )
    or
    (
      target_type = 'comment'
      and exists (
        select 1 from public.comments c
        join public.monthly_posts p on p.id = c.post_id
        where c.id = reactions.target_id
          and c.deleted_at is null
          and p.deleted_at is null
          and (p.status = 'published' or p.user_id = auth.uid())
      )
    )
  )
);

drop policy if exists "members can insert own reactions" on public.reactions;
create policy "members can insert own reactions"
on public.reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (
      target_type = 'post'
      and exists (
        select 1 from public.monthly_posts p
        where p.id = reactions.target_id
          and p.deleted_at is null
          and (p.status = 'published' or p.user_id = auth.uid())
      )
    )
    or
    (
      target_type = 'comment'
      and exists (
        select 1 from public.comments c
        join public.monthly_posts p on p.id = c.post_id
        where c.id = reactions.target_id
          and c.deleted_at is null
          and p.deleted_at is null
          and (p.status = 'published' or p.user_id = auth.uid())
      )
    )
  )
);

drop policy if exists "members can update own reactions" on public.reactions;
create policy "members can update own reactions"
on public.reactions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "members can read own post versions" on public.post_versions;
create policy "members can read own post versions"
on public.post_versions for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.monthly_posts p
    where p.id = post_versions.post_id
      and p.user_id = auth.uid()
  )
);

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.monthly_posts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reactions;
exception
  when duplicate_object then null;
end $$;
