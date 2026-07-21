drop policy "select own or live posts" on public.posts;

create policy "select own or live posts" on public.posts
for select using (
  user_id = auth.uid()
  or (
    created_at > now() - interval '36 hours'
    and moderation_status = 'approved'
    and not exists (
      select 1 from public.blocks
      where (blocker_id = auth.uid() and blocked_id = posts.user_id)
         or (blocker_id = posts.user_id and blocked_id = auth.uid())
    )
  )
);

drop policy "select comments on visible posts" on public.comments;

create policy "select comments on visible posts" on public.comments
for select using (
  exists (select 1 from public.posts where posts.id = comments.post_id)
  and not exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = comments.user_id)
       or (blocker_id = comments.user_id and blocked_id = auth.uid())
  )
);
