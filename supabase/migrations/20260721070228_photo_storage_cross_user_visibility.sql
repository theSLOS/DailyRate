create policy "select photos on visible posts" on storage.objects
for select using (
  bucket_id = 'post-photos'
  and exists (
    select 1 from public.posts
    where posts.photo_url = storage.objects.name
      and (
        posts.user_id = auth.uid()
        or (
          posts.created_at > now() - interval '36 hours'
          and posts.moderation_status = 'approved'
          and not exists (
            select 1 from public.blocks
            where (blocker_id = auth.uid() and blocked_id = posts.user_id)
               or (blocker_id = posts.user_id and blocked_id = auth.uid())
          )
        )
      )
  )
);
