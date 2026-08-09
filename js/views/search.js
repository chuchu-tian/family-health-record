// js/views/search.js — ���文搜索���历
import { searchRecords, getMember } from '../api.js'
import { escapeHtml, fmtDate, STATUS } from '../utils.js'
import { setTitle, go } from '../router.js'

export default async function searchView(app) {
  setTitle('搜索���历', { back: true })

  app.innerHTML = `
    <div class="card" style="cursor:default">
      <input type="text" id="search-input" placeholder="�����索病名���诊断、医院、���生..." style="width:100%;padding:10px;font-size:16px;border:1px solid #ddd;border-radius:6px">
      <div id="search-results" style="margin-top:20px"></div>
    </div>
  `

  const input = app.querySelector('#search-input')
  const resultsBox = app.querySelector('#search-results')
  let searchTimeout

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const query = input.value.trim()
    if (!query) {
      resultsBox.innerHTML = ''
      return
    }
    searchTimeout = setTimeout(async () => {
      try {
        resultsBox.innerHTML = '<div class="muted">���索中...</div>'
        const records = await searchRecords(query)
        if (records.length === 0) {
          resultsBox.innerHTML = '<div class="muted">���找到相���病历</div>'
          return
        }

        // ���取所有成员���息
        const memberIds = [...new Set(records.map(r => r.member_id))]
        const members = await Promise.all(memberIds.map(id => getMember(id)))
        const memberMap = Object.fromEntries(members.map(m => [m.id, m]))

        resultsBox.innerHTML = records.map(r => {
          const m = memberMap[r.member_id]
          const st = STATUS[r.status]
          return `
            <div class="card" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail: '/record/${r.id}'}))" style="margin-bottom:10px">
              <div class="field-label">${escapeHtml(m.avatar + ' ' + m.display_name)} · ${fmtDate(r.occurred_on)}</div>
              <h3 style="margin:6px 0">${escapeHtml(r.illness_name)}</h3>
              <div><span class="tag ${st.cls}">${st.label}</span></div>
              ${r.diagnosis ? `<div class="muted" style="margin-top:6px">${escapeHtml(r.diagnosis).substring(0, 80)}${r.diagnosis.length > 80 ? '...' : ''}</div>` : ''}
            </div>
          `
        }).join('')
      } catch (e) {
        resultsBox.innerHTML = `<div class="msg msg-err">搜索失���：${e.message}</div>`
      }
    }, 300)
  })

  input.focus()
}
