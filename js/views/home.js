// js/views/home.js — 成员门户首页：成员大卡片 + 近期复诊横幅 + 新增按钮
import { listMembers, latestRecordByMember, recordsWithFollowUp } from '../api.js'
import { escapeHtml, fmtDate, followUpKind } from '../utils.js'
import { setTitle, go } from '../router.js'

export default async function homeView(app) {
  setTitle('家庭病例档案')
  const [members, latest, followUps] = await Promise.all([
    listMembers(), latestRecordByMember(), recordsWithFollowUp(),
  ])

  const memberName = Object.fromEntries(members.map(m => [m.id, `${m.avatar} ${m.display_name}`]))
  const alerts = followUps
    .map(r => ({ ...r, kind: followUpKind(r.follow_up_on) }))
    .filter(r => r.kind)
    .sort((a, b) => a.follow_up_on.localeCompare(b.follow_up_on))

  app.innerHTML = `
    ${alerts.map(a => `
      <button class="banner ${a.kind === 'overdue' ? 'overdue' : ''}" data-rec="${a.id}"
        style="display:block;width:100%;text-align:left;font:inherit;cursor:pointer">
        ${a.kind === 'overdue' ? '📅 复诊日期已过' : '🔔 近期复诊'}：${escapeHtml(memberName[a.member_id] ?? '')}
        ${fmtDate(a.follow_up_on)}${a.department ? ' · ' + escapeHtml(a.department) : ''}（${escapeHtml(a.illness_name)}）
      </button>`).join('')}
    <button class="btn" id="new-btn">＋ 新增</button>
    ${members.map(m => {
      const rec = latest[m.id]
      return `<button class="card member-card" data-id="${m.id}">
          <span class="avatar">${escapeHtml(m.avatar)}</span>
          <span>
            <span class="name">${escapeHtml(m.display_name)}</span>
            ${m.role === 'admin' ? '<span class="tag">管理员</span>' : ''}
            <br><span class="sub">${rec
              ? `最近：${escapeHtml(rec.illness_name)} · ${fmtDate(rec.occurred_on)}`
              : '还没有记录'}</span>
          </span>
        </button>`
    }).join('')}
    ${members.length ? '' : '<div class="empty">还没有家庭成员，请先运行 scripts/create-users.mjs</div>'}`

  app.querySelector('#new-btn').addEventListener('click', () => go('/new'))
  app.querySelectorAll('.member-card').forEach(el =>
    el.addEventListener('click', () => go(`/member/${el.dataset.id}`)))
  app.querySelectorAll('.banner[data-rec]').forEach(el =>
    el.addEventListener('click', () => go(`/record/${el.dataset.rec}`)))
}
