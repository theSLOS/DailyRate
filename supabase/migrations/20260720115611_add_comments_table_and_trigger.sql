create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_post_id_idx on public.comments(post_id);

alter table public.comments enable row level security;

grant select, insert on public.comments to authenticated;

create policy "select comments on visible posts" on public.comments
for select using (
  exists (select 1 from public.posts where posts.id = comments.post_id)
);

create policy "insert own comment on visible post" on public.comments
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts where posts.id = comments.post_id)
);

create or replace function public.handle_comment_count_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = comment_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger comments_count_trigger
after insert or delete on public.comments
for each row execute function public.handle_comment_count_change();
