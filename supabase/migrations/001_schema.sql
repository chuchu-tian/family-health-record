-- 001_schema.sql — 表结构、辅助函数、审计触发器（RLS 见 002）
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  avatar text not null default '🙂',
  birth_year int,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  occurred_on date not null,
  illness_name text not null,
  cause text,
  dietary_restrictions text,
  prevention text,
  notes text,
  diagnosis text,
  hospital text,
  department text,
  doctor_name text,
  cost numeric(10,2) check (cost >= 0),
  insurance_note text,
  follow_up_on date,
  status text not null default 'ongoing' check (status in ('ongoing','recovered','chronic')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz
);
create index if not exists records_member_idx on records (member_id, occurred_on desc);

create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  drug_name text not null,
  dosage text,
  note text
);
create index if not exists medications_record_idx on medications (record_id);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  storage_path text not null,
  file_type text not null check (file_type in ('image','pdf')),
  ai_summary text,
  uploaded_at timestamptz not null default now()
);
create index if not exists attachments_record_idx on attachments (record_id);

-- 当前登录用户对应的成员 id（security definer 绕过 RLS，避免策略递归）
create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where auth_user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from members where auth_user_id = auth.uid()), false)
$$;

-- 更新时自动记录审计字段（含管理员代改是谁改的）
create or replace function set_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_set_updated on records;
create trigger records_set_updated before update on records
  for each row execute function set_updated();
