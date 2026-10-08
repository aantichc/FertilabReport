create extension if not exists "pgcrypto";

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  current_status text not null check (current_status in ('GREEN', 'YELLOW', 'RED')),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  type text not null check (type in ('CREACION', 'ACTUALIZACION', 'CAMBIO_ESTADO')),
  content text,
  previous_status text check (previous_status is null or previous_status in ('GREEN', 'YELLOW', 'RED')),
  new_status text check (new_status is null or new_status in ('GREEN', 'YELLOW', 'RED')),
  created_at timestamptz not null default now(),
  user_name text
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  recipients text[] not null default '{}',
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.report_history enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.email_log enable row level security;

drop policy if exists "Public read reports" on public.reports;
drop policy if exists "Public insert reports" on public.reports;
drop policy if exists "Public update reports" on public.reports;
drop policy if exists "Public delete reports" on public.reports;

create policy "Public read reports" on public.reports for select using (true);
create policy "Public insert reports" on public.reports for insert with check (true);
create policy "Public update reports" on public.reports for update using (true) with check (true);
create policy "Public delete reports" on public.reports for delete using (true);

drop policy if exists "Public read history" on public.report_history;
drop policy if exists "Public insert history" on public.report_history;

create policy "Public read history" on public.report_history for select using (true);
create policy "Public insert history" on public.report_history for insert with check (true);

drop policy if exists "Public read recipients" on public.notification_recipients;
drop policy if exists "Public insert recipients" on public.notification_recipients;
drop policy if exists "Public update recipients" on public.notification_recipients;
drop policy if exists "Public delete recipients" on public.notification_recipients;

create policy "Public read recipients" on public.notification_recipients for select using (true);
create policy "Public insert recipients" on public.notification_recipients for insert with check (true);
create policy "Public update recipients" on public.notification_recipients for update using (true) with check (true);
create policy "Public delete recipients" on public.notification_recipients for delete using (true);

drop policy if exists "Public read email log" on public.email_log;
drop policy if exists "Public insert email log" on public.email_log;

create policy "Public read email log" on public.email_log for select using (true);
create policy "Public insert email log" on public.email_log for insert with check (true);

grant usage on schema public to anon;

grant select, insert, update, delete on public.reports to anon;
grant select, insert on public.report_history to anon;
grant select, insert, update, delete on public.notification_recipients to anon;
grant select, insert on public.email_log to anon;
