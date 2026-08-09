-- 004_health_metrics_rls.sql — 健康指标表���行级���全策略

alter table health_metrics enable row level security;

-- 全���人都���查看所有人���健康指标
create policy "全家人���查看健康���标"
  on health_metrics for select
  using (true);

-- ���有本���和管理员可以���加/修改���己的指���
create policy "本人���管理员���添加健康指标"
  on health_metrics for insert
  with check (
    member_id = current_member_id() or is_admin()
  );

create policy "本人和管理员���修改健康指标"
  on health_metrics for update
  using (
    member_id = current_member_id() or is_admin()
  );

create policy "本人和管理员可删���健康���标"
  on health_metrics for delete
  using (
    member_id = current_member_id() or is_admin()
  );
