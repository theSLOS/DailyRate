drop policy "select boundaries" on public.region_boundaries;

create policy "select boundaries" on public.region_boundaries
    for select to authenticated using (true);
