create table blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- RLS: enable, then —
alter table public.blocks enable row level security;
grant select, insert, delete on public.blocks to authenticated;

-- select: blocker_id = auth.uid()          (only see who *you* blocked)
create policy "select own blocks" on public.blocks
for select using (blocker_id = auth.uid());
-- insert: blocker_id = auth.uid()          (can only create a block as yourself)
create policy "insert own block" on public.blocks
for insert with check (blocker_id = auth.uid());

-- delete: blocker_id = auth.uid()          (only unblock your own blocks)
create policy "delete own block" on public.blocks
for delete using (blocker_id = auth.uid());




-- no update policy — a block either exists or doesn't
