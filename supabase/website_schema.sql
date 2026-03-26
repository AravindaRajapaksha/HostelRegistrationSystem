create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role_group') then
    create type public.user_role_group as enum ('student', 'academic', 'warden');
  end if;

  if not exists (select 1 from pg_type where typname = 'hostel_gender') then
    create type public.hostel_gender as enum ('male', 'female', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_workflow') then
    create type public.booking_workflow as enum ('regular', 'special');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('pending', 'approved', 'rejected', 'waiting', 'not_required');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_state') then
    create type public.payment_state as enum ('unpaid', 'paid', 'partial', 'waived');
  end if;

  if not exists (select 1 from pg_type where typname = 'review_stage') then
    create type public.review_stage as enum ('academic', 'warden');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.hostel_settings (
  id integer primary key default 1 check (id = 1),
  hostel_name text not null,
  daily_fee numeric(10, 2) not null check (daily_fee >= 0),
  one_time_fee numeric(10, 2) not null check (one_time_fee >= 0),
  year_stay_limit_days integer not null check (year_stay_limit_days > 0),
  total_rooms integer not null check (total_rooms > 0),
  beds_per_room integer not null check (beds_per_room > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.departments (
  code text primary key,
  name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  username citext primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  role_group public.user_role_group not null,
  role_label text not null,
  department_code text references public.departments (code) on delete set null,
  managed_gender public.hostel_gender,
  gender public.hostel_gender,
  name text not null,
  student_number text unique,
  registration_number text unique,
  faculty text,
  degree_program text,
  email citext unique,
  address text,
  home_phone text,
  mobile_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_details_required check (
    role_group <> 'student'
    or (student_number is not null and registration_number is not null and gender is not null)
  )
);

create table if not exists public.rooms (
  room_number integer primary key,
  room_gender public.hostel_gender not null,
  total_beds integer not null default 4 check (total_beds > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_requests (
  id text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  workflow public.booking_workflow not null,
  student_username citext not null references public.profiles (username) on delete restrict,
  check_in date not null,
  check_out date not null,
  requested_days integer generated always as (greatest((check_out - check_in) + 1, 1)) stored,
  room_number integer not null references public.rooms (room_number) on delete restrict,
  bed_number integer not null check (bed_number > 0),
  academic_approver_username citext references public.profiles (username) on delete set null,
  academic_status public.approval_status not null default 'pending',
  academic_reviewed_by citext references public.profiles (username) on delete set null,
  academic_reviewed_at timestamptz,
  warden_approver_username citext references public.profiles (username) on delete set null,
  warden_status public.approval_status not null default 'pending',
  warden_reviewed_by citext references public.profiles (username) on delete set null,
  warden_reviewed_at timestamptz,
  department_code text references public.departments (code) on delete set null,
  course_code text,
  academic_activity text,
  special_reason text,
  home_phone text,
  mobile_phone text,
  payment_total numeric(10, 2),
  payment_status public.payment_state not null default 'unpaid',
  payment_paid_at timestamptz,
  academic_decision_reason text,
  warden_decision_reason text,
  qr_value text unique,
  cancelled_at timestamptz,
  student_cleared_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint booking_dates_valid check (check_out >= check_in),
  constraint booking_special_reason_required check (
    workflow <> 'special' or length(trim(coalesce(special_reason, ''))) > 0
  )
);

create table if not exists public.booking_review_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.booking_requests (id) on delete cascade,
  stage public.review_stage not null,
  action public.approval_status not null,
  actor_username citext not null references public.profiles (username) on delete restrict,
  decision_reason text,
  action_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_clearances (
  booking_id text not null references public.booking_requests (id) on delete cascade,
  cleared_by_username citext not null references public.profiles (username) on delete restrict,
  role_group public.user_role_group not null,
  cleared_at timestamptz not null default timezone('utc', now()),
  primary key (booking_id, cleared_by_username),
  constraint clearance_role_allowed check (role_group in ('academic', 'warden'))
);

create table if not exists public.qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id text references public.booking_requests (id) on delete set null,
  student_username citext references public.profiles (username) on delete set null,
  scanned_at timestamptz not null,
  qr_code_name text,
  qr_value text not null,
  role text not null default 'unknown',
  result text not null default 'not confirmed',
  message text not null default 'No scan message available.',
  device_name text not null default 'ESP32-CAM QR Scanner',
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.apply_booking_defaults()
returns trigger
language plpgsql
as $$
declare
  active_settings record;
  stay_days integer;
begin
  select *
  into active_settings
  from public.hostel_settings
  where id = 1;

  stay_days := greatest((new.check_out - new.check_in) + 1, 1);

  if new.payment_total is null then
    new.payment_total :=
      coalesce(active_settings.one_time_fee, 0) +
      (coalesce(active_settings.daily_fee, 0) * stay_days);
  end if;

  if coalesce(new.qr_value, '') = '' then
    new.qr_value := 'TRF|' || new.id || '|' || new.student_username;
  end if;

  return new;
end;
$$;

create index if not exists idx_profiles_role_group on public.profiles (role_group);
create index if not exists idx_profiles_department_code on public.profiles (department_code);
create index if not exists idx_booking_requests_student_username on public.booking_requests (student_username);
create index if not exists idx_booking_requests_statuses on public.booking_requests (academic_status, warden_status, payment_status);
create index if not exists idx_booking_requests_room_dates on public.booking_requests (room_number, bed_number, check_in, check_out);
create unique index if not exists uq_booking_review_logs_action on public.booking_review_logs (booking_id, stage, actor_username, action_at);
create index if not exists idx_qr_scan_logs_scanned_at on public.qr_scan_logs (scanned_at desc);
create index if not exists idx_qr_scan_logs_booking_id on public.qr_scan_logs (booking_id);
create unique index if not exists uq_qr_scan_logs_scan_row on public.qr_scan_logs (scanned_at, qr_value, device_name);

alter table public.booking_requests
  drop constraint if exists no_overlapping_approved_bed_allocations;

alter table public.booking_requests
  add constraint no_overlapping_approved_bed_allocations
  exclude using gist (
    room_number with =,
    bed_number with =,
    daterange(check_in, check_out, '[]') with &&
  )
  where (warden_status = 'approved' and cancelled_at is null);

drop trigger if exists trg_hostel_settings_updated_at on public.hostel_settings;
create trigger trg_hostel_settings_updated_at
before update on public.hostel_settings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

drop trigger if exists trg_booking_requests_updated_at on public.booking_requests;
create trigger trg_booking_requests_updated_at
before update on public.booking_requests
for each row
execute function public.set_updated_at();

drop trigger if exists trg_booking_requests_defaults on public.booking_requests;
create trigger trg_booking_requests_defaults
before insert or update on public.booking_requests
for each row
execute function public.apply_booking_defaults();
