create or replace function public.friend_count(target_user_id uuid)
returns integer language plpgsql security definer stable set search_path = public as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select count(*) into v_count
  from public.friendships
  where user_id = target_user_id;
  return v_count;
end;
$$;

revoke execute on function public.friend_count(uuid) from public;
grant execute on function public.friend_count(uuid) to authenticated;