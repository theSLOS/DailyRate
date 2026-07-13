create view public.profiles_public as
select id, username, display_name, avatar_url
from public.profiles;

grant select on public.profiles_public to authenticated;