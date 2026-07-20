create table public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
alter table public.likes enable row level security;

grant select, insert, delete on public.likes to authenticated;

create policy "select own likes on visible posts" on public.likes
for select using (
  user_id = auth.uid()
  and exists (select 1 from public.posts where posts.id = likes.post_id)
);

create policy "insert own like on visible post" on public.likes
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts where posts.id = likes.post_id)
);

create policy "delete own like" on public.likes
for delete using (user_id = auth.uid());

create or replace function public.handle_like_count_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = like_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger likes_count_trigger
after insert or delete on public.likes
for each row execute function public.handle_like_count_change();
