-- 003_health_metrics.sql — M2/M3 健康指标表和搜索索引

-- 健康指标表（由 AI 识别或手动录入）
create table if not exists health_metrics (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  record_id uuid references records(id) on delete set null,
  measured_on date not null,
  metric_type text not null check (metric_type in (
    'blood_pressure_systolic',    -- 收缩压
    'blood_pressure_diastolic',   -- 舒张压
    'heart_rate',                 -- 心率
    'blood_glucose',              -- 血糖
    'temperature',                -- 体温
    'weight',                     -- 体重
    'height',                     -- 身高
    'bmi',                        -- BMI
    'cholesterol_total',          -- 总胆固醇
    'cholesterol_ldl',            -- 低密度脂蛋白
    'cholesterol_hdl',            -- 高密度脂蛋白
    'triglycerides',              -- 甘油三酯
    'white_blood_cell',           -- 白细胞
    'red_blood_cell',             -- 红细胞
    'hemoglobin',                 -- 血红蛋白
    'platelet',                   -- 血小板
    'uric_acid',                  -- 尿酸
    'creatinine',                 -- 肌酐
    'alt',                        -- 谷丙转氨酶
    'ast',                        -- 谷草转氨酶
    'other'                       -- 其他
  )),
  value numeric(10,2) not null,
  unit text,
  is_abnormal boolean default false,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists health_metrics_member_idx on health_metrics (member_id, measured_on desc);
create index if not exists health_metrics_type_idx on health_metrics (member_id, metric_type, measured_on desc);
create index if not exists health_metrics_record_idx on health_metrics (record_id);

-- 全文搜索配置：为 records 表添加检索列
alter table records add column if not exists search_vector tsvector;

-- 生成搜索向量的函数（中文分词简化版：直接分字 + 拼音首字母，实用优先）
create or replace function records_search_vector() returns trigger
language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.illness_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.diagnosis, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.hospital, '') || ' ' || coalesce(new.department, '') || ' ' || coalesce(new.doctor_name, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.cause, '') || ' ' || coalesce(new.notes, '') || ' ' || coalesce(new.prevention, '')), 'D');
  return new;
end $$;

drop trigger if exists records_search_vector_update on records;
create trigger records_search_vector_update
  before insert or update on records
  for each row execute function records_search_vector();

-- 为现有记录生成检索向量
update records set search_vector =
  setweight(to_tsvector('simple', coalesce(illness_name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(diagnosis, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(hospital, '') || ' ' || coalesce(department, '') || ' ' || coalesce(doctor_name, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(cause, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(prevention, '')), 'D');

create index if not exists records_search_idx on records using gin(search_vector);
