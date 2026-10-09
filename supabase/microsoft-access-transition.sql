-- Transitional authenticated access; legacy anon access remains until deployment.
begin;
grant usage on schema public to authenticated;

alter table public.reports enable row level security;
revoke truncate, references, trigger on public.reports from authenticated;
grant select, insert, update, delete on public.reports to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.reports;
create policy "Fertilab Microsoft access" on public.reports as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select reports" on public.reports;
create policy "Fertilab select reports" on public.reports for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert reports" on public.reports;
create policy "Fertilab insert reports" on public.reports for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab update reports" on public.reports;
create policy "Fertilab update reports" on public.reports for update to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab delete reports" on public.reports;
create policy "Fertilab delete reports" on public.reports for delete to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.report_history enable row level security;
revoke truncate, references, trigger on public.report_history from authenticated;
grant select, insert on public.report_history to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.report_history;
create policy "Fertilab Microsoft access" on public.report_history as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select report_history" on public.report_history;
create policy "Fertilab select report_history" on public.report_history for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert report_history" on public.report_history;
create policy "Fertilab insert report_history" on public.report_history for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.notification_recipients enable row level security;
revoke truncate, references, trigger on public.notification_recipients from authenticated;
grant select, insert, update, delete on public.notification_recipients to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.notification_recipients;
create policy "Fertilab Microsoft access" on public.notification_recipients as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select notification_recipients" on public.notification_recipients;
create policy "Fertilab select notification_recipients" on public.notification_recipients for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert notification_recipients" on public.notification_recipients;
create policy "Fertilab insert notification_recipients" on public.notification_recipients for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab update notification_recipients" on public.notification_recipients;
create policy "Fertilab update notification_recipients" on public.notification_recipients for update to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab delete notification_recipients" on public.notification_recipients;
create policy "Fertilab delete notification_recipients" on public.notification_recipients for delete to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.email_log enable row level security;
revoke truncate, references, trigger on public.email_log from authenticated;
grant select, insert on public.email_log to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.email_log;
create policy "Fertilab Microsoft access" on public.email_log as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select email_log" on public.email_log;
create policy "Fertilab select email_log" on public.email_log for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert email_log" on public.email_log;
create policy "Fertilab insert email_log" on public.email_log for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.calendar_notes enable row level security;
revoke truncate, references, trigger on public.calendar_notes from authenticated;
grant select, insert, delete on public.calendar_notes to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.calendar_notes;
create policy "Fertilab Microsoft access" on public.calendar_notes as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select calendar_notes" on public.calendar_notes;
create policy "Fertilab select calendar_notes" on public.calendar_notes for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert calendar_notes" on public.calendar_notes;
create policy "Fertilab insert calendar_notes" on public.calendar_notes for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab delete calendar_notes" on public.calendar_notes;
create policy "Fertilab delete calendar_notes" on public.calendar_notes for delete to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.preventive_tasks enable row level security;
revoke truncate, references, trigger on public.preventive_tasks from authenticated;
grant select, insert, update, delete on public.preventive_tasks to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.preventive_tasks;
create policy "Fertilab Microsoft access" on public.preventive_tasks as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select preventive_tasks" on public.preventive_tasks;
create policy "Fertilab select preventive_tasks" on public.preventive_tasks for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert preventive_tasks" on public.preventive_tasks;
create policy "Fertilab insert preventive_tasks" on public.preventive_tasks for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab update preventive_tasks" on public.preventive_tasks;
create policy "Fertilab update preventive_tasks" on public.preventive_tasks for update to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab delete preventive_tasks" on public.preventive_tasks;
create policy "Fertilab delete preventive_tasks" on public.preventive_tasks for delete to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

alter table public.preventive_notification_log enable row level security;
revoke truncate, references, trigger on public.preventive_notification_log from authenticated;
grant select, insert on public.preventive_notification_log to authenticated;
drop policy if exists "Fertilab Microsoft access" on public.preventive_notification_log;
create policy "Fertilab Microsoft access" on public.preventive_notification_log as restrictive for all to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org') with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab select preventive_notification_log" on public.preventive_notification_log;
create policy "Fertilab select preventive_notification_log" on public.preventive_notification_log for select to authenticated using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');
drop policy if exists "Fertilab insert preventive_notification_log" on public.preventive_notification_log;
create policy "Fertilab insert preventive_notification_log" on public.preventive_notification_log for insert to authenticated with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and auth.jwt() -> 'app_metadata' ->> 'provider' = 'azure' and lower(auth.jwt() ->> 'email') like '%@fertilab.org');

commit;


