-- 004_health_metrics_rls.sql — 健康指标表的行级安全策略
-- 与 002_rls.sql 保持一致的三条约定：
--   1. 所有策略限定 to authenticated —— 未登录（anon）一律拒绝，守住隐私底线
--   2. 复用 can_write_member() 助手 —— 等价于「本人或管理员」
--   3. update 同时写 using + with check —— 防止把指标改挂到别人名下

alter table health_metrics enable row level security;

-- 登录后全家人都可以查看所有人的健康指标
create policy health_metrics_select on health_metrics for select to authenticated
  using (true);

-- 只有本人和管理员可以增删改自己的指标
create policy health_metrics_insert on health_metrics for insert to authenticated
  with check (can_write_member(member_id));

create policy health_metrics_update on health_metrics for update to authenticated
  using (can_write_member(member_id)) with check (can_write_member(member_id));

create policy health_metrics_delete on health_metrics for delete to authenticated
  using (can_write_member(member_id));
