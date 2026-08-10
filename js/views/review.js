// js/views/review.js — AI 识别核对页（M2，spec 第 5 节页面 6）
// 规矩：AI 只是草稿。所有字段可改、可勾掉，「确认保存」后才入库；
// 也可以只存原图不存摘要。异常指标标 ⚠️。
import { applyAiExtraction, setAttachmentSummary } from '../api.js'
import { escapeHtml, METRIC_LABELS, isAbnormal } from '../utils.js'

const RECORD_FIELDS = [
  ['illness_name', '病名'],
  ['occurred_on', '就诊日期', 'date'],
  ['diagnosis', '医生诊断', 'textarea'],
  ['hospital', '医院'],
  ['department', '科室'],
  ['doctor_name', '医生'],
  ['cost', '花费（元）', 'number'],
  ['insurance_note', '医保/报销'],
  ['notes', '其他备注', 'textarea'],
]

// 渲染核对界面到 host 元素。完成后回调 onDone（用于刷新详情页）
export function renderReview(host, { recordId, attachmentId, extracted, rawText }, onDone) {
  const val = k => extracted?.[k] ?? ''
  const meds = Array.isArray(extracted?.medications) ? extracted.medications : []
  const mets = Array.isArray(extracted?.health_metrics) ? extracted.health_metrics : []

  const fieldRow = ([key, label, type]) => {
    const v = val(key)
    const has = String(v).trim() !== ''
    const input = type === 'textarea'
      ? `<textarea id="f-${key}" ${has ? '' : 'placeholder="AI 没认出来，可自己补"'}>${escapeHtml(v)}</textarea>`
      : `<input id="f-${key}" type="${type || 'text'}" value="${escapeHtml(v)}"
           ${has ? '' : 'placeholder="AI 没认出来，可自己补"'}>`
    return `<div style="margin:14px 0">
      <label style="display:flex;align-items:center;gap:8px" for="f-${key}">
        <input type="checkbox" class="pick" data-key="${key}" ${has ? 'checked' : ''}
          style="width:26px;min-height:26px;flex:0 0 auto">
        <span>${label}</span>
      </label>
      ${input}
    </div>`
  }

  host.innerHTML = `
    <div class="card" style="cursor:default;border-left-color:var(--warn)">
      <div class="section" style="margin-top:0">🤖 AI 识别结果 · 请核对</div>
      <div class="msg" style="background:#fff8e6;border:2px solid #f2d799;color:#7a5600">
        AI 可能认错。<b>请逐项核对</b>，不要的取消勾选，改完再点最下方「确认保存」。
      </div>

      <div class="section">病历信息</div>
      ${RECORD_FIELDS.map(fieldRow).join('')}

      <div class="section">用药（${meds.length} 条）</div>
      <div id="med-rows">
        ${meds.length ? meds.map((m, i) => `
          <div class="med-row" data-i="${i}" style="align-items:center">
            <input type="checkbox" class="med-pick" checked style="width:26px;min-height:26px;flex:0 0 auto">
            <input class="med-name" value="${escapeHtml(m.drug_name ?? '')}" placeholder="药名">
            <input class="med-dosage" value="${escapeHtml(m.dosage ?? '')}" placeholder="用法用量">
          </div>`).join('') : '<div class="muted">没识别到用药</div>'}
      </div>

      <div class="section">健康指标（${mets.length} 项）</div>
      <div id="met-rows">
        ${mets.length ? mets.map((m, i) => {
          const meta = METRIC_LABELS[m.metric_type] ?? METRIC_LABELS.other
          const bad = isAbnormal(m, meta)
          return `<div class="met-row" data-i="${i}"
            style="display:flex;gap:8px;align-items:center;margin:8px 0;padding:8px;
                   border-left:4px solid ${bad ? 'var(--danger)' : 'var(--green)'};
                   background:#fafbfa;border-radius:8px;flex-wrap:wrap">
            <input type="checkbox" class="met-pick" checked style="width:26px;min-height:26px;flex:0 0 auto">
            <select class="met-type" style="flex:1 1 130px;min-width:120px">
              ${Object.entries(METRIC_LABELS).map(([k, v]) =>
                `<option value="${k}"${k === m.metric_type ? ' selected' : ''}>${v.name}</option>`).join('')}
            </select>
            <input class="met-value" type="number" step="0.01" value="${escapeHtml(m.value ?? '')}"
              style="flex:0 1 100px" inputmode="decimal">
            <input class="met-unit" value="${escapeHtml(m.unit ?? meta.unit ?? '')}"
              style="flex:0 1 90px" placeholder="单位">
            ${bad ? '<span class="tag" style="background:#fdecea;color:var(--danger)">⚠️ 异常</span>' : ''}
          </div>`
        }).join('') : '<div class="muted">没识别到指标数值</div>'}
      </div>

      <label style="display:flex;align-items:center;gap:8px;margin-top:18px">
        <input type="checkbox" id="save-summary" checked style="width:26px;min-height:26px;flex:0 0 auto">
        <span>同时保存这份摘要（便于以后搜索）</span>
      </label>

      <button class="btn" id="confirm-ai">确认保存</button>
      <button class="btn btn-secondary" id="only-image">不保存摘要，只留原图</button>
      <details style="margin-top:10px">
        <summary>看 AI 原始返回</summary>
        <pre style="white-space:pre-wrap;font-size:13px;overflow-x:auto">${escapeHtml(rawText ?? JSON.stringify(extracted, null, 2))}</pre>
      </details>
      <div id="ai-msg"></div>
    </div>`

  const msg = host.querySelector('#ai-msg')
  const confirmBtn = host.querySelector('#confirm-ai')

  // 收集用户核对后的结果
  const collect = () => {
    const out = {}
    host.querySelectorAll('.pick').forEach(cb => {
      if (!cb.checked) return
      const el = host.querySelector(`#f-${cb.dataset.key}`)
      const v = el.value.trim()
      if (v !== '') out[cb.dataset.key] = v
    })
    out.medications = [...host.querySelectorAll('#med-rows .med-row')]
      .filter(r => r.querySelector('.med-pick').checked)
      .map(r => ({
        drug_name: r.querySelector('.med-name').value,
        dosage: r.querySelector('.med-dosage').value,
      }))
      .filter(m => m.drug_name.trim())
    out.health_metrics = [...host.querySelectorAll('#met-rows .met-row')]
      .filter(r => r.querySelector('.met-pick').checked)
      .map(r => {
        const type = r.querySelector('.met-type').value
        const value = r.querySelector('.met-value').value
        const meta = METRIC_LABELS[type] ?? METRIC_LABELS.other
        return {
          metric_type: type,
          value,
          unit: r.querySelector('.met-unit').value.trim() || meta.unit || null,
          is_abnormal: isAbnormal({ value }, meta),
        }
      })
      .filter(m => m.value !== '')
    return out
  }

  confirmBtn.addEventListener('click', async () => {
    const picked = collect()
    confirmBtn.disabled = true
    confirmBtn.textContent = '保存中…'
    msg.innerHTML = ''
    try {
      await applyAiExtraction(recordId, picked)
      // spec：ai_summary 存的是「经人工核对后的摘要」，且纳入搜索
      if (host.querySelector('#save-summary').checked) {
        await setAttachmentSummary(attachmentId, summaryText(picked))
      }
      msg.innerHTML = '<div class="msg msg-ok">已保存到病历</div>'
      await onDone?.()
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-error">保存失败：${escapeHtml(e.message)}<br>内容已保留，可再点一次。</div>`
      confirmBtn.disabled = false
      confirmBtn.textContent = '确认保存'
    }
  })

  host.querySelector('#only-image').addEventListener('click', async () => {
    msg.innerHTML = '<div class="msg msg-ok">已保留原图，未写入摘要</div>'
    await onDone?.()
  })
}

// 人工核对后的摘要文本：可读、可被 ilike 搜到
export function summaryText(p) {
  const parts = []
  if (p.illness_name) parts.push(`病名：${p.illness_name}`)
  if (p.diagnosis) parts.push(`诊断：${p.diagnosis}`)
  const visit = [p.hospital, p.department, p.doctor_name].filter(Boolean).join(' ')
  if (visit) parts.push(`就诊：${visit}`)
  if (p.medications?.length) {
    parts.push('用药：' + p.medications
      .map(m => [m.drug_name, m.dosage].filter(Boolean).join(' ')).join('；'))
  }
  if (p.health_metrics?.length) {
    parts.push('指标：' + p.health_metrics.map(m => {
      const meta = METRIC_LABELS[m.metric_type] ?? METRIC_LABELS.other
      return `${meta.name} ${m.value}${m.unit || ''}${m.is_abnormal ? '(异常)' : ''}`
    }).join('；'))
  }
  if (p.notes) parts.push(`备注：${p.notes}`)
  return parts.join('\n')
}
