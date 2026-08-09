// js/views/detail.js — 病���详情：���块展示 + 附件查看 + ���权限���示编辑/删除 + AI 识���
import { getRecord, getMember, signedUrl, deleteRecord, analyzeAttachment, applyAiExtraction } from '../api.js'
import { escapeHtml, fmtDate, STATUS } from '../utils.js'
import { setTitle, go, render } from '../router.js'
import { canWrite } from '../db.js'

export default async function detailView(app, [recordId]) {
  const r = await getRecord(recordId)
  const [member, writable] = await Promise.all([getMember(r.member_id), canWrite(r.member_id)])
  setTitle('病历详情', { back: true })
  const st = STATUS[r.status]
  const block = (label, value) => value
    ? `<div style="margin:10px 0"><div class="field-label">${label}</div><div>${escapeHtml(value)}</div></div>` : ''

  app.innerHTML = `
    <div class="card" style="cursor:default">
      <div class="field-label">${escapeHtml(member.avatar + ' ' + member.display_name)}</div>
      <h2 style="margin:6px 0">${escapeHtml(r.illness_name)}</h2>
      <div class="field-label">${fmtDate(r.occurred_on)}</div>
      <div><span class="tag ${st.cls}">${st.label}</span>
        ${r.follow_up_on ? `<span class="tag st-ongoing">📅 复诊 ${fmtDate(r.follow_up_on)}</span>` : ''}</div>
    </div>

    ${r.diagnosis ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">医���诊���</div>
      <div>${escapeHtml(r.diagnosis)}</div>
      ${block('���院', r.hospital)}${block('���室', r.department)}${block('医���', r.doctor_name)}
    </div>` : (r.hospital || r.department || r.doctor_name ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">就���信息</div>
      ${block('���院', r.hospital)}${block('科室', r.department)}${block('医生', r.doctor_name)}
    </div>` : '')}

    ${r.medications.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">���药</div>
      ${r.medications.map(m => `<div style="margin:8px 0">💊 <b>${escapeHtml(m.drug_name)}</b>
        ${m.dosage ? `<span class="muted"> · ${escapeHtml(m.dosage)}</span>` : ''}</div>`).join('')}
    </div>` : ''}

    ${(r.cause || r.dietary_restrictions || r.prevention || r.notes) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">病情说明</div>
      ${block('起���', r.cause)}${block('忌���', r.dietary_restrictions)}
      ${block('预防注意', r.prevention)}${block('其他备注', r.notes)}
    </div>` : ''}

    ${(r.cost != null || r.insurance_note) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">费用</div>
      ${r.cost != null ? block('���费', `¥${r.cost}`) : ''}${block('医保/报���', r.insurance_note)}
    </div>` : ''}

    ${r.attachments.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">附件（${r.attachments.length}）</div>
      <div class="thumbs" id="atts"></div>
      <div id="ai-results"></div>
    </div>` : ''}

    ${writable ? `<button class="btn btn-secondary" id="edit-btn">编辑���条记录</button>
      <button class="btn btn-danger" id="del-btn">删���这条记录</button>` : ''}`

  const attsBox = app.querySelector('#atts')
  const aiResults = app.querySelector('#ai-results')

  if (attsBox) for (const a of r.attachments) {
    const url = await signedUrl(a.storage_path)
    const link = document.createElement('a')
    link.href = url; link.target = '_blank'; link.rel = 'noopener'
    link.innerHTML = a.file_type === 'image'
      ? `<img src="${url}" alt="附件">`
      : '<div class="pdf-thumb">📄 PDF<br>点击���看</div>'
    attsBox.append(link)

    // AI ���别按钮和结果
    if (writable && aiResults) {
      const aiBtn = document.createElement('button')
      aiBtn.className = 'btn btn-secondary'
      aiBtn.style.marginTop = '10px'
      aiBtn.textContent = a.ai_summary ? '🔄 ���新识���' : '���� AI 识���'
      aiBtn.dataset.attachmentId = a.id
      aiResults.append(aiBtn)

      if (a.ai_summary) {
        const summary = document.createElement('div')
        summary.className = 'msg msg-ok'
        summary.style.marginTop = '10px'
        try {
          const parsed = JSON.parse(a.ai_summary)
          summary.innerHTML = `<b>📋 AI 识别结���：</b><pre style="white-space:pre-wrap;font-size:13px">${JSON.stringify(parsed, null, 2)}</pre>`
        } catch {
          summary.textContent = `📋 摘要���${a.ai_summary}`
        }
        aiResults.append(summary)
      }

      aiBtn.addEventListener('click', async () => {
        aiBtn.disabled = true
        aiBtn.textContent = '⏳ 识���中...'
        try {
          const result = await analyzeAttachment(a.id)
          if (result.success && result.extracted) {
            const confirmDiv = document.createElement('div')
            confirmDiv.className = 'msg msg-ok'
            confirmDiv.style.marginTop = '10px'
            confirmDiv.innerHTML = `
              <b>✅ ���别���功���</b>
              <pre style="white-space:pre-wrap;font-size:13px">${JSON.stringify(result.extracted, null, 2)}</pre>
              <button class="btn btn-primary" style="margin-top:10px" id="apply-ai-${a.id}">确���并���用到���历</button>
              <button class="btn btn-secondary" style="margin-top:10px;margin-left:10px" id="cancel-ai-${a.id}">取���</button>
            `
            aiResults.append(confirmDiv)

            document.getElementById(`apply-ai-${a.id}`).addEventListener('click', async () => {
              try {
                await applyAiExtraction(r.id, result.extracted)
                alert('✅ 已应��� AI 识别结���到病���！')
                go(`/record/${r.id}`)
                await render()
              } catch (e) {
                alert(`应用失败：${e.message}`)
              }
            })

            document.getElementById(`cancel-ai-${a.id}`).addEventListener('click', () => {
              confirmDiv.remove()
              aiBtn.disabled = false
              aiBtn.textContent = '🤖 AI 识别'
            })
          } else {
            throw new Error(result.error || 'AI 识���失败')
          }
        } catch (e) {
          alert(`识别失败：${e.message}`)
          aiBtn.disabled = false
          aiBtn.textContent = '🤖 AI 识别'
        }
      })
    }
  }

  app.querySelector('#edit-btn')?.addEventListener('click', () => go(`/edit/${r.id}`))
  app.querySelector('#del-btn')?.addEventListener('click', async () => {
    if (!confirm('���定删除这条病历吗？附件也���一起删除，无法恢复���')) return
    try {
      await deleteRecord(r)
      go(`/member/${r.member_id}`); await render()
    } catch (e) {
      alert(`删除失败���${e.message}`)
    }
  })
}
