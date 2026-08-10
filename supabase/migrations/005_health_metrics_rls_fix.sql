-- 005_health_metrics_rls_fix.sql — 修复线上 health_metrics 的 RLS 漏洞
--
-- 背景：最初部署到线上的 004 版本四条策略都没写 `to authenticated`，
-- 配合 using(true)，导致【未登录（anon）也能读到全家健康指标】——
-- 已实测确认（插入探针行后 anon 可读回）。仓库里的 004 已改对，
-- 但线上跑的还是旧版。本文件幂等：drop 后按正确版本重建，可安全重复执行。
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴运行；
-- 或 psql "$SUPABASE_DB_URL" -f supabase/migrations/005_health_metrics_rls_fix.sql
--
-- 验证：执行后跑 node --env-file=.env.local --test tests/rls.test.mjs
-- 其中「指标: 匿名(未登录)读不到任何指标」一项必须变绿。

alter table health_metrics enable row level security;

drop policy if exists health_metrics_select on health_metrics;
drop policy if exists health_metrics_insert on health_metrics;
drop policy if exists health_metrics_update on health_metrics;
drop policy if exists health_metrics_delete on health_metrics;

-- 登录后全家可读；anon 无策略=默认拒绝
create policy health_metrics_select on health_metrics for select to authenticated
  using (true);

-- 写=本人或管理员；update 带 with check，防止把指标改挂到别人名下
create policy health_metrics_insert on health_metrics for insert to authenticated
  with check (can_write_member(member_id));

create policy health_metrics_update on health_metrics for update to authenticated
  using (can_write_member(member_id)) with check (can_write_member(member_id));

create policy health_metrics_delete on health_metrics for delete to authenticated
  using (can_write_member(member_id));
