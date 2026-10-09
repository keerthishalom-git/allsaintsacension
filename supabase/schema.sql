-- ============================================================
-- All Saints & Ascension: CMS database setup
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again (it will not delete your content).
-- ============================================================

-- 1. People who can use the admin area ---------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  role                 text not null default 'editor' check (role in ('admin','editor')),
  active               boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);

-- 2. Content ---------------------------------------------------------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 150),
  description      text check (char_length(description) <= 2000),
  event_date       date not null,
  time_text        text check (char_length(time_text) <= 60),
  location         text check (char_length(location) <= 200),
  registration_url text check (registration_url is null or registration_url ~* '^https?://'),
  image_url        text,
  status           text not null default 'draft' check (status in ('draft','published')),
  published_at     timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 150),
  body         text check (char_length(body) <= 5000),
  category     text check (char_length(category) <= 40),
  image_url    text,
  link_url     text check (link_url is null or link_url ~* '^https?://'),
  display_date date not null default current_date,
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Simple key/value site settings (top banner today; more later)
create table if not exists public.site_settings (
  key        text primary key,
  value      text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists events_date_idx on public.events (event_date);
create index if not exists announcements_date_idx on public.announcements (display_date desc);

-- 3. Helper checks (used by the security rules) -------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- 4. Automatic bookkeeping ----------------------------------------------
create or replace function public.touch_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    new.published_at := case when new.status = 'published' then now() else null end;
  end if;
  return new;
end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before insert or update on public.events
  for each row execute function public.touch_row();
drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before insert or update on public.announcements
  for each row execute function public.touch_row();

-- First Admin: when THIS email is created in Supabase Auth, it becomes an Admin.
-- (Everyone else gets access only when an Admin adds them in the Users page.)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'asa2018@sbcglobal.net' then
    insert into public.profiles (id, email, full_name, role, active)
    values (new.id, new.email, 'Parish Office', 'admin', true)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets a signed-in person mark their own "must change password" as done.
create or replace function public.clear_must_change() returns void
language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.clear_must_change() from public;
grant execute on function public.clear_must_change() to authenticated;

-- 5. Security rules (Row Level Security) -------------------------------
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.announcements  enable row level security;
alter table public.site_settings  enable row level security;

-- profiles: you can read your own; admins read everyone. Nobody edits from the browser
-- (changes go through the secure /api/users function).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- events
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select to anon, authenticated
  using (status = 'published' or public.is_staff());
drop policy if exists events_staff_insert on public.events;
create policy events_staff_insert on public.events for insert to authenticated
  with check (public.is_staff());
drop policy if exists events_staff_update on public.events;
create policy events_staff_update on public.events for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (public.is_admin() or (public.is_staff() and status = 'draft'));

-- announcements
drop policy if exists ann_public_read on public.announcements;
create policy ann_public_read on public.announcements for select to anon, authenticated
  using (status = 'published' or public.is_staff());
drop policy if exists ann_staff_insert on public.announcements;
create policy ann_staff_insert on public.announcements for insert to authenticated
  with check (public.is_staff());
drop policy if exists ann_staff_update on public.announcements;
create policy ann_staff_update on public.announcements for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists ann_delete on public.announcements;
create policy ann_delete on public.announcements for delete to authenticated
  using (public.is_admin() or (public.is_staff() and status = 'draft'));

-- site settings: everyone can read (the banner is public); only Admins change it
drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists settings_admin_write on public.site_settings;
create policy settings_admin_write on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6. Photo storage ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists media_staff_read on storage.objects;
create policy media_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_staff());
drop policy if exists media_staff_insert on storage.objects;
create policy media_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- 7. Starting content (same as the current News page) -------------------
insert into public.site_settings (key, value) values
  ('announce_enabled', 'true'),
  ('announce_text', 'Join us this Sunday at 9:00 AM for Holy Eucharist. All are welcome.')
on conflict (key) do nothing;

insert into public.announcements (title, body, category, image_url, display_date, status)
select * from (values
  ('Latest Weekly Email Blast Sent',
   'Read about our communal garden harvest, upcoming ministries, and a message from Rev. Fenner in our latest weekly email blast.',
   'Community',
   'https://allsaintsascension.com/wp-content/uploads/2026/03/easter-egg-hunt-announcement-2026-rev1.jpg',
   date '2026-07-01', 'published'),
  ('Thank You, Food Pantry Volunteers',
   'Our monthly giveaway served a record number of families this spring. Thank you for your generosity.',
   'Food Pantry',
   'https://allsaintsascension.com/wp-content/uploads/2024/07/bishop-deon-visitation-photo-july-21-2024-1-1754485455-e1722030639409.jpg',
   date '2026-06-01', 'published')
) as t(title, body, category, image_url, display_date, status)
where not exists (select 1 from public.announcements);
