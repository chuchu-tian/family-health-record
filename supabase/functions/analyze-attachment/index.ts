// Edge Function: analyze-attachment
// 调用京东云 Claude API ���别病历附件中的结构化信息

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { attachmentId } = await req.json()
    if (!attachmentId) {
      return new Response(JSON.stringify({ error: 'Missing attachmentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ���始化 Supabase 客户端���使��� service role key 绕过 RLS���
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 获取���件信息
    const { data: attachment, error: fetchError } = await supabase
      .from('attachments')
      .select('*, records!inner(member_id)')
      .eq('id', attachmentId)
      .single()

    if (fetchError || !attachment) {
      return new Response(JSON.stringify({ error: 'Attachment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 下载附件文件
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('attachments')
      .download(attachment.storage_path)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: 'Failed to download attachment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ���文件���为 base64
    const bytes = new Uint8Array(await fileData.arrayBuffer())
    const base64 = btoa(String.fromCharCode(...bytes))
    const mediaType = attachment.file_type === 'pdf' ? 'application/pdf' : 'image/jpeg'

    // ���用京东云 Claude API
    const jdCloudApiKey = Deno.env.get('JD_CLOUD_API_KEY')!
    const jdCloudEndpoint = Deno.env.get('JD_CLOUD_ENDPOINT') || 'https://api.jdcloud-api.com/v1/ai/claude'

    const prompt = `请分���这份���历/���查报���图片���提取以下信息���JSON 格���）：
{
  "illness_name": "疾病名称",
  "diagnosis": "���生诊断",
  "hospital": "医院���称",
  "department": "科���",
  "doctor_name": "医生姓名",
  "medications": [
    {"drug_name": "���品名", "dosage": "用法���量", "note": "备注"}
  ],
  "health_metrics": [
    {"metric_type": "指标类���（如 blood_pressure_systolic）", "value": ���值, "unit": "单位", "is_abnormal": 是否���常}
  ],
  "occurred_on": "就诊日期 YYYY-MM-DD",
  "cost": 费用���元）,
  "notes": "���他重要信息"
}

���果���个字段无���识别，设为 null。���康指���类���请从以下���项中选���：
blood_pressure_systolic, blood_pressure_diastolic, heart_rate, blood_glucose, temperature,
weight, height, bmi, cholesterol_total, cholesterol_ldl, cholesterol_hdl, triglycerides,
white_blood_cell, red_blood_cell, hemoglobin, platelet, uric_acid, creatinine, alt, ast, other

只���回 JSON���不要其���文���。`

    const claudeResponse = await fetch(jdCloudEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jdCloudApiKey}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-hq',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      }),
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', errorText)
      return new Response(JSON.stringify({ error: 'AI analysis failed', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeResponse.json()
    const aiText = claudeData.content[0].text

    // 解析 AI 返回的 JSON
    let extracted
    try {
      // 提取 JSON（可���包含在 markdown 代码块中）
      const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) || aiText.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiText
      extracted = JSON.parse(jsonStr)
    } catch (e) {
      // JSON 解���失败，���回原���文���
      return new Response(JSON.stringify({
        error: 'Failed to parse AI response',
        ai_text: aiText
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 更新 attachments 表的 ai_summary
    await supabase
      .from('attachments')
      .update({ ai_summary: JSON.stringify(extracted) })
      .eq('id', attachmentId)

    // 返���提取的结构化���据（供前���确认后入库）
    return new Response(JSON.stringify({
      success: true,
      extracted,
      raw_ai_text: aiText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Edge Function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
