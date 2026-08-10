// js/api.js — 数据访问层：所有 Supabase 读写集中在此，视图层不直接碰 client
import { client } from './db.js'
import { escapeLike } from './utils.js'

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

// 追加用药（不动已有的）。AI 识别只能新增，不能覆盖用户手填的内容
export async function appendMedications(recordId, meds) {
  const rows = meds.filter(m => m.drug_name?.trim()).map(m => ({
    record_id: recordId, drug_name: m.drug_name.trim(),
    dosage: m.dosage?.trim() || null, note: m.note?.trim() || null,
  }))
  if (!rows.length) return
  const { error } = await client.from('medications').insert(rows)
  if (error) throw error
}

// 写回附件的人工核对后摘要（spec：ai_summary 是「经人工核对后的文字摘要」，纳入搜索）
export async function setAttachmentSummary(attachmentId, summary) {
  const { error } = await client.from('attachments')
    .update({ ai_summary: summary || null }).eq('id', attachmentId)
  if (error) throw error
}

// 将核对后的 AI 识别结果写入病历。
// 入参是用户在核对页编辑过的对象；只写用户勾选保留的字段。
export async function applyAiExtraction(recordId, extracted) {
  const record = await getRecord(recordId)

  // 病历基础字段：只覆盖用户确认要写的（空值一律跳过，避免抹掉已有内容）
  const recordFields = {}
  for (const k of ['illness_name', 'diagnosis', 'hospital', 'department',
                   'doctor_name', 'occurred_on', 'notes', 'insurance_note']) {
    const v = extracted[k]
    if (v !== null && v !== undefined && String(v).trim() !== '') recordFields[k] = v
  }
  if (extracted.cost !== null && extracted.cost !== undefined && extracted.cost !== '') {
    recordFields.cost = Number(extracted.cost)
  }
  if (Object.keys(recordFields).length) {
    const { error } = await client.from('records').update(recordFields).eq('id', recordId)
    if (error) throw error
  }

  // 用药：追加，不覆盖
  if (extracted.medications?.length) {
    await appendMedications(recordId, extracted.medications)
  }

  // 健康指标：逐条写入，供 M3 趋势图使用
  if (extracted.health_metrics?.length) {
    const rows = extracted.health_metrics
      .filter(m => m.metric_type && m.value !== '' && m.value !== null && m.value !== undefined)
      .map(m => ({
        member_id: record.member_id,
        record_id: recordId,
        measured_on: m.measured_on || extracted.occurred_on || record.occurred_on,
        metric_type: m.metric_type,
        value: Number(m.value),
        unit: m.unit || null,
        is_abnormal: !!m.is_abnormal,
        note: m.note || null,
      }))
    if (rows.length) {
      const { error } = await client.from('health_metrics').insert(rows)
      if (error) throw error
    }
  }
}

// ========== M2: 搜索 ==========

// 全局搜索。
// 为什么不用 Postgres 全文检索：to_tsvector('simple') 不做中文分词，整句会被存成
// 一个 token（实测「RLS测试记录」→ 'rls测试记录':1A），于是搜「测试」得 0 行——
// 而 spec 的验收标准正是「搜『血糖』命中相关记录」。中文分词要装 pg_jieba/zhparser
// 扩展，Supabase 托管环境装不了，故改用 ilike 子串匹配：家庭数据量（几百条）下
// 全表扫描毫秒级，且天然支持搜任意片段。
const RECORD_COLS = ['illness_name', 'diagnosis', 'cause', 'dietary_restrictions',
  'prevention', 'notes', 'hospital', 'department', 'doctor_name', 'insurance_note']

export async function searchRecords(query) {
  const q = escapeLike(query.trim())
  if (!q) return []
  const like = `*${q}*`
  // 值用双引号包裹：否则查询词里的逗号会被 PostgREST 当成 or= 的分隔符而语法报错
  const orExpr = RECORD_COLS.map(c => `${c}.ilike."${like}"`).join(',')

  // 三路并行：主表字段、用药名、AI 摘要（spec 第 4 节要求后两者也纳入搜索）
  const [main, meds, atts] = await Promise.all([
    client.from('records').select('*, medications(id), attachments(id)')
      .or(orExpr).order('occurred_on', { ascending: false }).limit(50),
    client.from('medications').select('record_id').ilike('drug_name', like).limit(200),
    client.from('attachments').select('record_id').ilike('ai_summary', like).limit(200),
  ])
  for (const r of [main, meds, atts]) if (r.error) throw r.error

  // 命中子表的补拉父病历，与主表结果合并去重
  const extraIds = [...new Set([...meds.data, ...atts.data].map(r => r.record_id))]
    .filter(id => id && !main.data.some(r => r.id === id))
  let extra = []
  if (extraIds.length) {
    const { data, error } = await client.from('records')
      .select('*, medications(id), attachments(id)').in('id', extraIds)
    if (error) throw error
    extra = data
  }
  return [...main.data, ...extra]
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
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
