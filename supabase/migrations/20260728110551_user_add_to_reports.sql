alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'user'));

drop policy "insert own report on visible target" on public.reports;

create policy "insert own report on visible target" on public.reports
for insert with check (
  reporter_id = auth.uid()
  and (
    (target_type = 'post' and exists (select 1 from public.posts where posts.id = reports.target_id))
    or (target_type = 'comment' and exists (select 1 from public.comments where comments.id = reports.target_id))
    or (
      target_type = 'user'
      and reports.target_id <> auth.uid()
      and exists (select 1 from public.profiles_public where profiles_public.id = reports.target_id)
    )
  )
);