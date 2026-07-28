-- (a) friend_requests: the pending queue. Directional, either party can drain it.

create table public.friend_requests (
    requester_id uuid not null references public.profiles(id) on delete cascade,
    addressee_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (requester_id, addressee_id),
    check (requester_id <> addressee_id) 
);

create unique index friend_requests_pair_idx
  on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friend_requests_addressee_idx
  on public.friend_requests (addressee_id);

alter table public.friend_requests enable row level security;
grant select, insert, delete on public.friend_requests to authenticated;

-- select: either party        (see requests sent to you AND ones you sent)
create policy "select own friend requests" on public.friend_requests
for select using ( requester_id = auth.uid() or addressee_id = auth.uid() );

-- insert: requester_id = auth.uid()   (can't forge a request from someone else)
create policy "insert own friend request" on public.friend_requests
for insert with check ( requester_id = auth.uid() );

-- delete: either party        (one policy = both "reject theirs" and "cancel mine")
create policy "delete own friend request" on public.friend_requests
for delete using ( requester_id = auth.uid() or addressee_id = auth.uid() );

-- no update policy — a request either exists or it doesn't


-- (b) friendships: the confirmed set. Undirected, stored as two mirrored rows.

create table public.friendships (
    user_id uuid not null references public.profiles(id) on delete cascade,
    friend_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, friend_id),
    check (user_id <> friend_id) 
);

alter table public.friendships enable row level security;
grant select on public.friendships to authenticated;

-- select: user_id = auth.uid()   (your own row's friend_id; never the mirror)
create policy "select own friendships" on public.friendships
for select using ( user_id = auth.uid() );

-- no insert/update/delete policy and no write grant — every mutation goes
-- through the two functions below, so the mirrored pair can't go one-sided


-- (c) the two mutation paths. security definer: RLS does not apply inside.

create or replace function public.accept_friend_request(other_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.friend_requests where requester_id = other_user_id and addressee_id = v_uid;
  if not found then
    raise exception 'no friend request from % to %', other_user_id, v_uid using errcode = 'P0001';
  end if;
  insert into public.friendships (user_id, friend_id) values (v_uid, other_user_id), (other_user_id, v_uid)
  on conflict do nothing; -- in case of race condition
  
end;
$$;


create or replace function public.remove_friendship(other_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.friendships where user_id = v_uid and friend_id = other_user_id;
  delete from public.friendships where user_id = other_user_id and friend_id = v_uid;
end;
$$;

-- (d) EXECUTE defaults to PUBLIC on create — revoke before granting.

revoke execute on function public.accept_friend_request(uuid) from public;
revoke execute on function public.remove_friendship(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.remove_friendship(uuid) to authenticated;
