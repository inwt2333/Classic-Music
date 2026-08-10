begin;

create table if not exists public.personal_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  status text not null check (status in ('interested', 'attended')),
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id),
  check (snapshot is null or jsonb_typeof(snapshot) = 'object')
);

create index if not exists personal_events_user_status_idx
  on public.personal_events (user_id, status, updated_at desc);

alter table public.personal_events enable row level security;

drop policy if exists "personal_events_select_own" on public.personal_events;
drop policy if exists "personal_events_insert_own" on public.personal_events;
drop policy if exists "personal_events_update_own" on public.personal_events;
drop policy if exists "personal_events_delete_own" on public.personal_events;

create policy "personal_events_select_own"
on public.personal_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "personal_events_insert_own"
on public.personal_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "personal_events_update_own"
on public.personal_events for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "personal_events_delete_own"
on public.personal_events for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists personal_events_set_updated_at on public.personal_events;
create trigger personal_events_set_updated_at
  before update on public.personal_events
  for each row execute procedure public.set_updated_at();

revoke all on public.personal_events from anon, authenticated;
grant select, insert, update, delete on public.personal_events to authenticated;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  follows jsonb not null default '{}'::jsonb,
  saved_filters jsonb not null default '[]'::jsonb,
  notification_history jsonb not null default '[]'::jsonb,
  read_notification_ids jsonb not null default '[]'::jsonb,
  dismissed_notification_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(follows) = 'object'),
  check (jsonb_typeof(saved_filters) = 'array'),
  check (jsonb_typeof(notification_history) = 'array'),
  check (jsonb_typeof(read_notification_ids) = 'array'),
  check (jsonb_typeof(dismissed_notification_ids) = 'array')
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
drop policy if exists "user_preferences_insert_own" on public.user_preferences;
drop policy if exists "user_preferences_update_own" on public.user_preferences;
drop policy if exists "user_preferences_delete_own" on public.user_preferences;

create policy "user_preferences_select_own"
on public.user_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "user_preferences_insert_own"
on public.user_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_preferences_update_own"
on public.user_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_preferences_delete_own"
on public.user_preferences for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute procedure public.set_updated_at();

revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

commit;
