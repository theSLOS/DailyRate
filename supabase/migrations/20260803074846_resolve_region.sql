create or replace function public.resolve_region(lng double precision, lat double precision)
returns table (country_code text, state_code text, place_label text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_point geography;
  v_country_code text;
  v_country_name text;
  v_state_code   text;
  v_state_name   text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_point := ST_SetSRID(ST_Point(lng, lat), 4326)::geography;

  -- one index-backed scan; conditional aggregation splits the two tiers
  select
    coalesce(
      max(case when admin_level = 'country' then rb.country_code end),
      max(case when admin_level = 'state'   then rb.country_code end)
    ),
    max(case when admin_level = 'country' then rb.name end),
    max(case when admin_level = 'state'   then rb.state_code end),
    max(case when admin_level = 'state'   then rb.name end)
  into v_country_code, v_country_name, v_state_code, v_state_name
  from public.region_boundaries rb
  where ST_Covers(rb.geom, v_point);

  if v_country_code is null then
    return;                       -- zero rows: the "no region" case
  end if;

  return query select
    v_country_code,
    v_state_code,
    concat_ws(', ', v_state_name, v_country_name);
end;
$$;

revoke execute on function public.resolve_region(double precision, double precision) from public;
grant execute on function public.resolve_region(double precision, double precision) to authenticated;
