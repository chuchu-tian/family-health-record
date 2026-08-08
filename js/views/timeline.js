// js/views/timeline.js — 某成员的病历时间线（倒序卡片列表）
import { getMember, listRecords } from '../api.js'
import { escapeHtml, fmtDate, followUpKind, STATUS } from '../utils.js'
import { setTitle, go } from '../router.js'
import { canWrite } from '../db.js'

export default async function timelineView(app, [memberId]) {
  const [member, records, writable] = await Promise.all([
    getMember(memberId), listRecords(memberId), canWrite(memberId),
  ])
  setTitle(`${member.avatar} ${member.display_name}`, { back: true })

  app.innerHTML = `
    ${writable ? '<button class="btn" id="new-btn">＋ 新增</button>' : ''}
    ${records.length ? records.map(r => {
      const st = STATUS[r.status]
      const fu = followUpKind(r.follow_up_on)
      return `<button class="card" data-id="${r.id}">
        <div style="font-size:20px;font-weight:600">${escapeHtml(r.illness_name)}</div>
        <div class="field-label">${fmtDate(r.occurred_on)}${r.hospital ? ' · ' + escapeHtml(r.hospital) : ''}</div>
        <div>
          <span class="tag ${st.cls}">${st.label}</span>
          ${r.medications.length ? `<span class="tag">💊 用药 ${r.medications.length}</span>` : ''}
          ${r.attachments.length ? `<span class="tag">📎 附件 ${r.attachments.length}</span>` : ''}
          ${fu ? `<span class="tag ${fu === 'overdue' ? '' : 'st-ongoing'}">📅 复诊 ${fmtDate(r.follow_up_on)}</span>` : ''}
        </div>
      </button>`
    }).join('') : `<div class="empty">还没有病历记录${writable ? '，点上面的「＋ 新增」记第一条' : ''}</div>`}`

  app.querySelector('#new-btn')?.addEventListener('click', () => go(`/new/${memberId}`))
  app.querySelectorAll('.card[data-id]').forEach(el =>
    el.addEventListener('click', () => go(`/record/${el.dataset.id}`)))
}
