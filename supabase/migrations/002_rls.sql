-- 002_rls.sql — 行级安全策略 + 私有存储桶（隐私底线）
alter table members enable row level security;
alter table records enable row level security;
alter table medications enable row level security;
alter table attachments enable row level security;

-- 能否写某成员名下数据：本人或管理员
create or replace function can_write_member(mid uuid) returns boolean
language sql stable as $$
  select mid = current_member_id() or is_admin()
$$;
-- 能否写某条病历下挂的数据
create or replace function can_write_record(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from records r where r.id = rid
                 and (r.member_id = current_member_id() or is_admin()))
$$;

-- members：登录可读；仅管理员可改；增删走 service role（无策略=默认拒绝）
create policy members_select on members for select to authenticated using (true);
create policy members_update on members for update to authenticated
  using (is_admin()) with check (is_admin());

-- records：登录可读全家；写=本人或管理员（with check 同时防止把记录改挂到别人名下）
create policy records_select on records for select to authenticated using (true);
create policy records_insert on records for insert to authenticated
  with check (can_write_member(member_id));
create policy records_update on records for update to authenticated
  using (can_write_member(member_id)) with check (can_write_member(member_id));
create policy records_delete on records for delete to authenticated
  using (can_write_member(member_id));

-- medications / attachments：权限跟随父病历
create policy medications_select on medications for select to authenticated using (true);
create policy medications_insert on medications for insert to authenticated with check (can_write_record(record_id));
create policy medications_update on medications for update to authenticated
  using (can_write_record(record_id)) with check (can_write_record(record_id));
create policy medications_delete on medications for delete to authenticated using (can_write_record(record_id));

create policy attachments_select on attachments for select to authenticated using (true);
create policy attachments_insert on attachments for insert to authenticated with check (can_write_record(record_id));
create policy attachments_update on attachments for update to authenticated
  using (can_write_record(record_id)) with check (can_write_record(record_id));
create policy attachments_delete on attachments for delete to authenticated using (can_write_record(record_id));

-- 私有存储桶
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- 存储策略：登录可读；写/删仅限自己（或管理员）的成员目录（路径第一段 = member_id）
create policy att_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy att_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and can_write_member(((storage.foldername(name))[1])::uuid));
create policy att_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and can_write_member(((storage.foldername(name))[1])::uuid));
