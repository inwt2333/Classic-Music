-- 远程审核队列：管理员在浏览器端提交的节目单审核决策，
-- 由 GitHub Actions 定时任务（apply-remote-reviews.yml）拉取并通过
-- scripts/pull-remote-reviews.ts 写回 data/manual-reviews.json 后提交。
begin;

create table if not exists public.remote_review_submissions (
  id bigint generated always as identity primary key,
  event_id text not null,
  source_record_ids jsonb not null default '[]'::jsonb,
  review_status text not null check (review_status in ('approved', 'rejected')),
  program jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'discarded')),
  applied_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now()
);

create index if not exists remote_review_submissions_pending_idx
  on public.remote_review_submissions (status, submitted_at)
  where status = 'pending';

alter table public.remote_review_submissions enable row level security;

drop policy if exists "remote_reviews_admin_write" on public.remote_review_submissions;
create policy "remote_reviews_admin_write"
  on public.remote_review_submissions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
