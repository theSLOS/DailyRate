create table public.region_boundaries (
    id serial primary key, 
    admin_level text not null check (admin_level in ('country', 'state')),
    country_code text not null, 
    state_code text,
    name text not null,
    geom geography(MultiPolygon, 4326) not null,
    check ((admin_level = 'country') = (state_code is null))
);

create index region_boundaries_geom on public.region_boundaries using gist (geom);

alter table public.region_boundaries enable row level security;
create policy "select boundaries" on public.region_boundaries
    for select using (true);
    grant select on public.region_boundaries to authenticated;