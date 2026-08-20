-- profiles_public has been readable unauthenticated since 20260713092053.
-- Verified 2026-08-20: the publishable key alone returns every row — the full
-- user list with usernames and display names, filterable by username (a
-- username -> uuid oracle) and countable via the Content-Range header.
--
-- Unlike the same day's posts finding, this is not a defect: the view does
-- exactly what it was written to do. Phase 3 needed four profile columns
-- readable cross-user so post and comment authors could render, without
-- widening profiles' owner-only RLS. "Cross-user" was simply implemented as
-- "everyone", and the unstated assumption that a reader would be logged in was
-- never written down anywhere.
--
-- Closing it costs nothing: every route in the app sits behind an auth gate,
-- so no screen renders a profile for a caller without a session.
--
-- The view stays a PLAIN view — deliberately. security_invoker = on would make
-- profiles' owner-only policy apply to it, and every cross-user author name in
-- the app would break. The bypass is the feature; the missing identity check is
-- the problem, so only the identity check is added.
create or replace view public.profiles_public as
select id, username, display_name, avatar_url
from public.profiles
where auth.uid() is not null;

-- create or replace preserves existing grants, so the Phase 3 grant to
-- authenticated still stands and is not repeated here.
