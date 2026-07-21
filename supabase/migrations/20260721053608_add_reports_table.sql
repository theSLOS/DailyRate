create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_target_idx on public.reports(target_type, target_id);

alter table public.reports enable row level security;

grant insert on public.reports to authenticated;

create policy "insert own report on visible target" on public.reports
for insert with check (
  reporter_id = auth.uid()
  and (
    (target_type = 'post' and exists (select 1 from public.posts where posts.id = target_id))
    or (target_type = 'comment' and exists (select 1 from public.comments where comments.id = target_id))
  )
);

-- No select/update/delete policy for regular users: reports are write-only from the
-- app's side until Phase 7's admin moderation queue adds a role='admin' scoped select
-- (and update, for setting status/reviewed_by/reviewed_at).
