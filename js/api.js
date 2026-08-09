// js/api.js — 数据访问层：所有 Supabase 读写集中在此，视图层不直接碰 client
import { client } from './db.js'

export async function listMembers() {
  const { data, error } = await client.from('members').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function getMember(id) {
  const { data, error } = await client.from('members').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// 每位成员最近一条记录（首页卡片摘要）。家庭数据量级下全量拉取足够快。
export async function latestRecordByMember() {
  const { data, error } = await client.from('records')
    .select('member_id, illness_name, occurred_on')
    .order('occurred_on', { ascending: false })
  if (error) throw error
  const map = {}
  for (const r of data) if (!map[r.member_id]) map[r.member_id] = r
  return map
}

export async function listRecords(memberId) {
  const { data, error } = await client.from('records')
    .select('*, medications(id), attachments(id)')
    .eq('member_id', memberId).order('occurred_on', { ascending: false })
  if (error) throw error
  return data
}

export async function getRecord(id) {
  const { data, error } = await client.from('records')
    .select('*, medications(*), attachments(*)').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createRecord(fields) {
  const { data, error } = await client.from('records').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateRecord(id, fields) {
  const { data, error } = await client.from('records').update(fields).eq('id', id).select().single()
  if (error) throw error
  return data
}

// 覆盖式保存用药：先删后插，编辑逻辑最简单（RLS 保证只有本人/管理员能做）
export async function saveMedications(recordId, meds) {
  let { error } = await client.from('medications').delete().eq('record_id', recordId)
  if (error) throw error
  const rows = meds.filter(m => m.drug_name?.trim()).map(m => ({
    record_id: recordId, drug_name: m.drug_name.trim(),
    dosage: m.dosage?.trim() || null, note: m.note?.trim() || null,
  }))
  if (!rows.length) return
  ;({ error } = await client.from('medications').insert(rows))
  if (error) throw error
}

export async function uploadAttachment(memberId, recordId, blob, ext, fileType) {
  const path = `${memberId}/${recordId}/${crypto.randomUUID()}.${ext}`
  let { error } = await client.storage.from('attachments')
    .upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw error
  ;({ error } = await client.from('attachments')
    .insert({ record_id: recordId, storage_path: path, file_type: fileType }))
  if (error) throw error
}

export async function deleteAttachment(att) {
  let { error } = await client.storage.from('attachments').remove([att.storage_path])
  if (error) throw error
  ;({ error } = await client.from('attachments').delete().eq('id', att.id))
  if (error) throw error
}

// 删除病历：先删 Storage 文件，再删记录行（用药/附件行由外键级联删除）
export async function deleteRecord(record) {
  const paths = (record.attachments ?? []).map(a => a.storage_path)
  if (paths.length) {
    const { error } = await client.storage.from('attachments').remove(paths)
    if (error) throw error
  }
  const { error } = await client.from('records').delete().eq('id', record.id)
  if (error) throw error
}

// 私有文件的临时访问链接（1小时有效）
export async function signedUrl(path) {
  const { data, error } = await client.storage.from('attachments').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// 所有带复诊日期的记录（首页横幅，客户端按 14/30 天窗口过滤）
export async function recordsWithFollowUp() {
  const { data, error } = await client.from('records')
    .select('id, member_id, illness_name, department, follow_up_on')
    .not('follow_up_on', 'is', null)
  if (error) throw error
  return data
}

// ========== M2: AI 识别 ==========

// 调用 Edge Function 分析附件
export async function analyzeAttachment(attachmentId) {
  const { data, error } = await client.functions.invoke('analyze-attachment', {
    body: { attachmentId }
  })
  if (error) throw error
  return data
}

// 将 AI 识别结果应用到病历（用户确认后调用）
export async function applyAiExtraction(recordId, extracted) {
  // 更新病历基础字段
  const recordFields = {}
  if (extracted.illness_name) recordFields.illness_name = extracted.illness_name
  if (extracted.diagnosis) recordFields.diagnosis = extracted.diagnosis
  if (extracted.hospital) recordFields.hospital = extracted.hospital
  if (extracted.department) recordFields.department = extracted.department
  if (extracted.doctor_name) recordFields.doctor_name = extracted.doctor_name
  if (extracted.occurred_on) recordFields.occurred_on = extracted.occurred_on
  if (extracted.cost !== null && extracted.cost !== undefined) recordFields.cost = extracted.cost
  if (extracted.notes) recordFields.notes = extracted.notes

  if (Object.keys(recordFields).length > 0) {
    const { error } = await client.from('records').update(recordFields).eq('id', recordId)
    if (error) throw error
  }

  // 添加用药记录
  if (extracted.medications && extracted.medications.length > 0) {
    await saveMedications(recordId, extracted.medications)
  }

  // 添加健康指标
  if (extracted.health_metrics && extracted.health_metrics.length > 0) {
    const record = await getRecord(recordId)
    const metricsRows = extracted.health_metrics.map(m => ({
      member_id: record.member_id,
      record_id: recordId,
      measured_on: extracted.occurred_on || record.occurred_on,
      metric_type: m.metric_type,
      value: m.value,
      unit: m.unit || null,
      is_abnormal: m.is_abnormal || false,
      note: m.note || null
    }))
    const { error } = await client.from('health_metrics').insert(metricsRows)
    if (error) throw error
  }
}

// ========== M2: 搜索 ==========

// 全文搜索病历
export async function searchRecords(query) {
  const { data, error } = await client.from('records')
    .select('*, medications(id), attachments(id)')
    .textSearch('search_vector', query, { type: 'websearch' })
    .order('occurred_on', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

// ========== M3: 健康指标 ==========

// 获取某成员的健康指标列表（按类型分组）
export async function listHealthMetrics(memberId, metricType = null, limit = 100) {
  let query = client.from('health_metrics')
    .select('*')
    .eq('member_id', memberId)
    .order('measured_on', { ascending: false })
    .limit(limit)

  if (metricType) {
    query = query.eq('metric_type', metricType)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// 添加一条健康指标
export async function createHealthMetric(fields) {
  const { data, error } = await client.from('health_metrics').insert(fields).select().single()
  if (error) throw error
  return data
}

// 批量添加健康指标（用于 AI 识别或手动输入多项）
export async function createHealthMetrics(metricsArray) {
  const { data, error } = await client.from('health_metrics').insert(metricsArray).select()
  if (error) throw error
  return data
}

// 删除健康指标
export async function deleteHealthMetric(id) {
  const { error } = await client.from('health_metrics').delete().eq('id', id)
  if (error) throw error
}
