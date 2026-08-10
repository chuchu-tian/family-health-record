// Edge Function: analyze-attachment
// 调用京东云 Claude 网关识别病历附件中的结构化信息
//
// 安全边界（对应 spec 第 6 节）：
//   1. 必须携带登录用户的 JWT —— 未登录一律 401
//   2. 先用调用者自己的身份确认这条附件对他可见，才继续
//   3. 网关 token 只存在于 Supabase Secrets，不进前端、不进 git

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// 二进制转 base64。不能写 btoa(String.fromCharCode(...bytes))：
// 附件可能好几 MB，展开成函数参数会爆调用栈（RangeError）。分块处理。
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// 从存储路径后缀推断图片类型（attachments 表只有 file_type: image/pdf）
function imageMediaType(storagePath: string): string {
  const ext = storagePath.toLowerCase().split('.').pop() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ===== 1. 校验调用者身份（未登录直接拒绝）=====
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return json({ error: '未登录：缺少 Authorization 头' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 用调用者自己的 JWT 建客户端 —— 受 RLS 约束，用来确认「他是谁、能看到什么」
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return json({ error: '登录状态无效或已过期，请重新登录' }, 401)
    }

    const { attachmentId } = await req.json()
    if (!attachmentId) {
      return json({ error: 'Missing attachmentId' }, 400)
    }

    // ===== 2. 用调用者身份读附件：读不到就是无权访问 =====
    const { data: visible } = await userClient
      .from('attachments')
      .select('id')
      .eq('id', attachmentId)
      .maybeSingle()
    if (!visible) {
      return json({ error: '附件不存在或你无权访问' }, 404)
    }

    // ===== 3. 通过校验后才用 service role 下载文件、写回摘要 =====
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 获取附件信息
    const { data: attachment, error: fetchError } = await supabase
      .from('attachments')
      .select('*, records!inner(member_id)')
      .eq('id', attachmentId)
      .single()

    if (fetchError || !attachment) {
      return json({ error: 'Attachment not found' }, 404)
    }

    // 下载附件文件
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('attachments')
      .download(attachment.storage_path)

    if (downloadError || !fileData) {
      return json({ error: 'Failed to download attachment' }, 500)
    }

    // 把文件转为 base64
    const bytes = new Uint8Array(await fileData.arrayBuffer())
    const base64 = toBase64(bytes)
    const isPdf = attachment.file_type === 'pdf'

    // ===== 4. 调用京东云 Claude 网关 =====
    const jdCloudApiKey = Deno.env.get('JD_CLOUD_API_KEY')!
    // 端点与模型名都走 Secret：网关侧路径/可用模型会变，改 Secret 即时生效，无需重新部署
    const jdCloudEndpoint = Deno.env.get('JD_CLOUD_ENDPOINT')
      || 'https://modelservice.jdcloud.com/anthropic/v1/messages'
    const jdCloudModel = Deno.env.get('JD_CLOUD_MODEL') || 'claude-sonnet-5'

    const prompt = `请分析这份病历/检查报告，提取以下信息（JSON 格式）：
{
  "illness_name": "疾病名称",
  "diagnosis": "医生诊断",
  "hospital": "医院名称",
  "department": "科室",
  "doctor_name": "医生姓名",
  "medications": [
    {"drug_name": "药品名", "dosage": "用法用量", "note": "备注"}
  ],
  "health_metrics": [
    {"metric_type": "指标类型（如 blood_pressure_systolic）", "value": 数值, "unit": "单位", "is_abnormal": 是否异常}
  ],
  "occurred_on": "就诊日期 YYYY-MM-DD",
  "cost": 费用（元）,
  "notes": "其他重要信息"
}

如果某个字段无法识别，设为 null。健康指标类型请从以下选项中选择：
blood_pressure_systolic, blood_pressure_diastolic, heart_rate, blood_glucose, temperature,
weight, height, bmi, cholesterol_total, cholesterol_ldl, cholesterol_hdl, triglycerides,
white_blood_cell, red_blood_cell, hemoglobin, platelet, uric_acid, creatinine, alt, ast, other

只返回 JSON，不要其他文字。`

    // PDF 必须走 document 块：塞进 image 会被网关拒绝
    const fileBlock = isPdf
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMediaType(attachment.storage_path),
            data: base64,
          },
        }

    const claudeResponse = await fetch(jdCloudEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jdCloudApiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: jdCloudModel,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [fileBlock, { type: 'text', text: prompt }],
        }],
      }),
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', errorText)
      return json({ error: 'AI analysis failed', details: errorText }, 500)
    }

    const claudeData = await claudeResponse.json()

    // 模型可能因安全策略拒答：此时 content 可能为空，要先看 stop_reason
    if (claudeData.stop_reason === 'refusal') {
      return json({ error: 'AI 拒绝处理这份附件，请换一张或手动填写' }, 422)
    }

    // 不能直接取 content[0].text —— 第一个块不一定是 text
    const textBlock = (claudeData.content ?? []).find(
      (b: { type: string }) => b.type === 'text',
    )
    const aiText: string = textBlock?.text ?? ''
    if (!aiText) {
      return json({ error: 'AI 没有返回可用内容，请重试' }, 502)
    }

    // ===== 5. 解析 AI 返回的 JSON =====
    let extracted
    try {
      // 提取 JSON（可能包含在 markdown 代码块中）
      const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) || aiText.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiText
      extracted = JSON.parse(jsonStr)
    } catch {
      // JSON 解析失败，把原文返回给用户自己看
      return json({ error: 'Failed to parse AI response', ai_text: aiText }, 500)
    }

    // 更新 attachments 表的 ai_summary
    await supabase
      .from('attachments')
      .update({ ai_summary: JSON.stringify(extracted) })
      .eq('id', attachmentId)

    // 返回提取的结构化数据（供前端确认后入库）
    return json({ success: true, extracted, raw_ai_text: aiText })

  } catch (error) {
    console.error('Edge Function error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
