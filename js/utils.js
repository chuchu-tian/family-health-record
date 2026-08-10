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

// 搜索词转义：ilike 里 % 和 _ 是通配符，PostgREST 的引号值里 " 和 \ 需转义。
// 不转义的话搜「100%」会变成「100 任意字符」，搜「_」会命中一切。
export function escapeLike(q) {
  return String(q ?? '')
    .replace(/\\/g, '\\\\')   // 反斜杠自身最先转义
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/"/g, '\\"')
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

// ===== M3 健康指标 =====
// range 为一般参考区间，仅用于画底色和标异常，不构成诊断依据——
// 各实验室/年龄/性别标准不同，以化验单自带范围和医生意见为准。
// 放在 utils 而非 views：纯数据+纯函数，node 可直接测。
export const METRIC_LABELS = {
  blood_pressure_systolic: { name: '收缩压', unit: 'mmHg', color: '#e74c3c', range: [90, 139] },
  blood_pressure_diastolic: { name: '舒张压', unit: 'mmHg', color: '#c0392b', range: [60, 89] },
  heart_rate: { name: '心率', unit: 'bpm', color: '#e67e22', range: [60, 100] },
  blood_glucose: { name: '血糖（空腹）', unit: 'mmol/L', color: '#f39c12', range: [3.9, 6.1] },
  temperature: { name: '体温', unit: '℃', color: '#3498db', range: [36, 37.2] },
  weight: { name: '体重', unit: 'kg', color: '#9b59b6', range: null },
  height: { name: '身高', unit: 'cm', color: '#1abc9c', range: null },
  bmi: { name: 'BMI', unit: '', color: '#16a085', range: [18.5, 23.9] },
  cholesterol_total: { name: '总胆固醇', unit: 'mmol/L', color: '#2ecc71', range: [0, 5.2] },
  cholesterol_ldl: { name: '低密度脂蛋白', unit: 'mmol/L', color: '#27ae60', range: [0, 3.4] },
  cholesterol_hdl: { name: '高密度脂蛋白', unit: 'mmol/L', color: '#2980b9', range: [1, 2.5] },
  triglycerides: { name: '甘油三酯', unit: 'mmol/L', color: '#8e44ad', range: [0, 1.7] },
  white_blood_cell: { name: '白细胞', unit: '×10⁹/L', color: '#34495e', range: [3.5, 9.5] },
  red_blood_cell: { name: '红细胞', unit: '×10¹²/L', color: '#e74c3c', range: [3.8, 5.8] },
  hemoglobin: { name: '血红蛋白', unit: 'g/L', color: '#c0392b', range: [115, 175] },
  platelet: { name: '血小板', unit: '×10⁹/L', color: '#d35400', range: [125, 350] },
  uric_acid: { name: '尿酸', unit: 'μmol/L', color: '#f39c12', range: [155, 428] },
  creatinine: { name: '肌酐', unit: 'μmol/L', color: '#e67e22', range: [44, 133] },
  alt: { name: '谷丙转氨酶', unit: 'U/L', color: '#1abc9c', range: [0, 50] },
  ast: { name: '谷草转氨酶', unit: 'U/L', color: '#16a085', range: [0, 40] },
  other: { name: '其他指标', unit: '', color: '#95a5a6', range: null },
}

// 是否异常：录入/AI 已标 is_abnormal 优先，其次看是否超出参考区间
export function isAbnormal(m, meta) {
  if (m?.is_abnormal) return true
  if (!meta?.range) return false
  const v = parseFloat(m?.value)
  if (Number.isNaN(v)) return false
  return v < meta.range[0] || v > meta.range[1]
}
