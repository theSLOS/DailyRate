-- Paywall insurance: unused until a tier/paywall phase exists. Kept out of the
-- profiles_public view so it stays private (that view's column list is the
-- whole privacy boundary). RLS unchanged — profiles base-table RLS is owner-only.
alter table public.profiles add column tier text not null default 'free';

-- Marginal help for user_id-scoped scans (usePostHistory). Not tied to any
-- rate-limit trigger — no such trigger exists — added because it's cheap now.
create index if not exists posts_user_id_created_at_idx
  on public.posts (user_id, created_at desc);
