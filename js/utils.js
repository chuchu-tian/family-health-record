// js/utils.js — 纯函数工具：无 DOM、无网络，node 直接可测
export const STATUS = {
  ongoing: { label: '进行中', cls: 'st-ongoing' },
  recovered: { label: '已痊愈', cls: 'st-recovered' },
  chronic: { label: '长期慢性', cls: 'st-chronic' },
}

export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// 复诊提醒窗口：未来 0–14 天 upcoming；过期 1–30 天 overdue（标灰）；其余不提醒
export function followUpKind(iso, today = new Date()) {
  if (!iso) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = iso.split('-').map(Number)
  const diff = Math.round((new Date(y, m - 1, d) - t0) / 86400000)
  if (diff >= 0 && diff <= 14) return 'upcoming'
  if (diff < 0 && diff >= -30) return 'overdue'
  return null
}
