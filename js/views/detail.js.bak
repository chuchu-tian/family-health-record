// js/views/detail.js — 病历详情：分块展示 + 附件查看 + 按权限显示编辑/删除
import { getRecord, getMember, signedUrl, deleteRecord } from '../api.js'
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
      <div class="section" style="margin-top:0">医生诊断</div>
      <div>${escapeHtml(r.diagnosis)}</div>
      ${block('医院', r.hospital)}${block('科室', r.department)}${block('医生', r.doctor_name)}
    </div>` : (r.hospital || r.department || r.doctor_name ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">就诊信息</div>
      ${block('医院', r.hospital)}${block('科室', r.department)}${block('医生', r.doctor_name)}
    </div>` : '')}

    ${r.medications.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">用药</div>
      ${r.medications.map(m => `<div style="margin:8px 0">💊 <b>${escapeHtml(m.drug_name)}</b>
        ${m.dosage ? `<span class="muted"> · ${escapeHtml(m.dosage)}</span>` : ''}</div>`).join('')}
    </div>` : ''}

    ${(r.cause || r.dietary_restrictions || r.prevention || r.notes) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">病情说明</div>
      ${block('起因', r.cause)}${block('忌口', r.dietary_restrictions)}
      ${block('预防注意', r.prevention)}${block('其他备注', r.notes)}
    </div>` : ''}

    ${(r.cost != null || r.insurance_note) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">费用</div>
      ${r.cost != null ? block('花费', `¥${r.cost}`) : ''}${block('医保/报销', r.insurance_note)}
    </div>` : ''}

    ${r.attachments.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">附件（${r.attachments.length}）</div>
      <div class="thumbs" id="atts"></div>
      <div id="att-summaries"></div>
    </div>` : ''}

    ${writable ? `<button class="btn btn-secondary" id="edit-btn">编辑这条记录</button>
      <button class="btn btn-danger" id="del-btn">删除这条记录</button>` : ''}`

  const attsBox = app.querySelector('#atts')
  if (attsBox) for (const a of r.attachments) {
    const url = await signedUrl(a.storage_path)
    const link = document.createElement('a')
    link.href = url; link.target = '_blank'; link.rel = 'noopener'
    link.innerHTML = a.file_type === 'image'
      ? `<img src="${url}" alt="附件">`
      : '<div class="pdf-thumb">📄 PDF<br>点击查看</div>'
    attsBox.append(link)
    if (a.ai_summary) {
      const p = document.createElement('div')
      p.className = 'msg msg-ok'
      p.textContent = `📋 摘要：${a.ai_summary}`
      app.querySelector('#att-summaries').append(p)
    }
  }

  app.querySelector('#edit-btn')?.addEventListener('click', () => go(`/edit/${r.id}`))
  app.querySelector('#del-btn')?.addEventListener('click', async () => {
    if (!confirm('确定删除这条病历吗？附件也会一起删除，无法恢复。')) return
    try {
      await deleteRecord(r)
      go(`/member/${r.member_id}`); await render()
    } catch (e) {
      alert(`删除失败：${e.message}`)
    }
  })
}
