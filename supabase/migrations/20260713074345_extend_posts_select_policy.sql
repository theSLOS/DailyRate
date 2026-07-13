drop policy "select own posts" on posts;
create policy "select own or live posts" on posts
for select using (
  user_id = auth.uid()
  or (created_at > now() - interval '36 hours' and moderation_status = 'approved')
);
