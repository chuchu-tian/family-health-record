-- 005_health_metrics_rls_fix.sql — 修复线上 health_metrics 的 RLS 漏洞（动态清空版）
--
-- 背景：线上旧策略允许未登录（anon）读全家健康指标（已实测确认）。
-- 第一版本文件按 004 的四个策略名去 drop，但实测发现线上旧策略
-- 名字与仓库不同（四条 create 全部成功=同名策略原本不存在），
-- 于是旧的宽松 select 策略根本没被删掉，anon 依旧可读。
-- 改为：遍历 pg_policies 清空该表全部策略，再按正确版本重建。幂等，可重复执行。
--
-- 执行：Supabase Dashboard → SQL Editor 整段粘贴，Run（不要只选中部分行）。
-- 验证：node --env-file=.env.local --test tests/rls.test.mjs → 22 项全绿。

alter table health_metrics enable row level security;

-- 清空 health_metrics 上的所有策略（无论叫什么名字）
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'health_metrics'
  loop
    execute format('drop policy %I on health_metrics', p.policyname);
  end loop;
end $$;

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

-- 自查：执行完看下面这句的输出，应恰好 4 行、且 roles 均为 {authenticated}
select policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename = 'health_metrics' order by policyname;
