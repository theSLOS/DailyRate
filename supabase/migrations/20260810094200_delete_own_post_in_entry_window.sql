-- "Unsend today's entry". Deliberately mirrors the existing UPDATE policy
-- rather than inventing a second rule: a post is deletable exactly when it is
-- already editable, so this grants no ability that .upsert() didn't already
-- give (overwriting today's entry during the open window).
--
-- Spec §48 — "remains in the author's private history forever" — still holds
-- for everything outside the window. get_entry_date returns null in the
-- 12pm–4pm dead zone, so `local_date = null` is NULL, the policy is false, and
-- nothing is deletable then.
--
-- Cascade consequence, accepted: likes and comments are `on delete cascade`
-- on posts, so deleting also removes any engagement the post picked up during
-- the window. Reports are polymorphic (no FK) and would be left orphaned —
-- acceptable at window scale, but revisit in Phase 7 if per-post delete ever
-- widens beyond the entry window.
create policy "delete own post in entry window" on public.posts
for delete using (
  user_id = auth.uid()
  and local_date = get_entry_date(
    now(),
    (select timezone from public.profiles where id = auth.uid())
  )
);

grant delete on public.posts to authenticated;
