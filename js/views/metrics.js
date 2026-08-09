// js/views/metrics.js — 健康指标趋势图（M3）
import { listHealthMetrics, getMember } from '../api.js'
import { escapeHtml, fmtDate } from '../utils.js'
import { setTitle } from '../router.js'

// 指标类型中文名称和单位
const METRIC_LABELS = {
  blood_pressure_systolic: { name: '收缩压', unit: 'mmHg', color: '#e74c3c' },
  blood_pressure_diastolic: { name: '舒张压', unit: 'mmHg', color: '#c0392b' },
  heart_rate: { name: '心率', unit: 'bpm', color: '#e67e22' },
  blood_glucose: { name: '血糖', unit: 'mmol/L', color: '#f39c12' },
  temperature: { name: '体温', unit: '℃', color: '#3498db' },
  weight: { name: '体重', unit: 'kg', color: '#9b59b6' },
  height: { name: '身高', unit: 'cm', color: '#1abc9c' },
  bmi: { name: 'BMI', unit: '', color: '#16a085' },
  cholesterol_total: { name: '总胆固醇', unit: 'mmol/L', color: '#2ecc71' },
  cholesterol_ldl: { name: '低密度脂蛋白', unit: 'mmol/L', color: '#27ae60' },
  cholesterol_hdl: { name: '高密度脂蛋白', unit: 'mmol/L', color: '#2980b9' },
  triglycerides: { name: '甘油三酯', unit: 'mmol/L', color: '#8e44ad' },
  white_blood_cell: { name: '白细胞', unit: '×10⁹/L', color: '#34495e' },
  red_blood_cell: { name: '红细胞', unit: '×10¹²/L', color: '#e74c3c' },
  hemoglobin: { name: '血红蛋白', unit: 'g/L', color: '#c0392b' },
  platelet: { name: '血小板', unit: '×10⁹/L', color: '#d35400' },
  uric_acid: { name: '尿酸', unit: 'μmol/L', color: '#f39c12' },
  creatinine: { name: '肌酐', unit: 'μmol/L', color: '#e67e22' },
  alt: { name: '谷丙转氨酶', unit: 'U/L', color: '#1abc9c' },
  ast: { name: '谷草转氨酶', unit: 'U/L', color: '#16a085' },
  other: { name: '其他指标', unit: '', color: '#95a5a6' }
}

export default async function metricsView(app, [memberId]) {
  const member = await getMember(memberId)
  setTitle(`${member.display_name} 健康指标`, { back: true })

  app.innerHTML = `
    <div class="card" style="cursor:default">
      <h2 style="margin:0 0 10px">${escapeHtml(member.avatar + ' ' + member.display_name)}</h2>
      <select id="metric-type" style="width:100%;padding:10px;font-size:16px;border:1px solid #ddd;border-radius:6px">
        <option value="">选择指标类型…</option>
        ${Object.entries(METRIC_LABELS).map(([key, meta]) =>
          `<option value="${key}">${meta.name}</option>`
        ).join('')}
      </select>
    </div>
    <div id="chart-container" style="display:none">
      <div class="card" style="cursor:default">
        <h3 id="chart-title" style="margin:0 0 20px"></h3>
        <canvas id="chart" width="400" height="200"></canvas>
      </div>
      <div class="card" style="cursor:default">
        <div class="section" style="margin-top:0">数据列表</div>
        <div id="data-list"></div>
      </div>
    </div>
  `

  const select = app.querySelector('#metric-type')
  const chartContainer = app.querySelector('#chart-container')
  const canvas = app.querySelector('#chart')
  const chartTitle = app.querySelector('#chart-title')
  const dataList = app.querySelector('#data-list')

  select.addEventListener('change', async () => {
    const metricType = select.value
    if (!metricType) {
      chartContainer.style.display = 'none'
      return
    }

    try {
      const metrics = await listHealthMetrics(memberId, metricType, 50)
      if (metrics.length === 0) {
        chartContainer.style.display = 'block'
        chartTitle.textContent = METRIC_LABELS[metricType].name
        canvas.style.display = 'none'
        dataList.innerHTML = '<div class="muted">暂无数据</div>'
        return
      }

      // 按时间正序（画图需要）
      metrics.reverse()

      const meta = METRIC_LABELS[metricType]
      chartTitle.textContent = `${meta.name}${meta.unit ? ` (${meta.unit})` : ''}`
      chartContainer.style.display = 'block'
      canvas.style.display = 'block'

      // 绘制简单折线图
      drawLineChart(canvas, metrics, meta)

      // 显示数据列表（倒序，最新在前）
      dataList.innerHTML = metrics.slice().reverse().map(m => `
        <div style="margin:10px 0;padding:10px;border-left:3px solid ${meta.color};background:#f9f9f9">
          <div><b>${m.value} ${m.unit || meta.unit}</b> ${m.is_abnormal ? '<span class="tag st-chronic">异常</span>' : ''}</div>
          <div class="muted">${fmtDate(m.measured_on)}</div>
          ${m.note ? `<div class="muted" style="margin-top:4px">${escapeHtml(m.note)}</div>` : ''}
        </div>
      `).join('')

    } catch (e) {
      alert(`加载失败：${e.message}`)
    }
  })
}

// 简单折线图绘制（Canvas 2D，适老化大字号）
function drawLineChart(canvas, metrics, meta) {
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const padding = 40

  // 清空画布
  ctx.clearRect(0, 0, width, height)

  if (metrics.length === 0) return

  // 数据范围
  const values = metrics.map(m => parseFloat(m.value))
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  // 绘制坐标轴
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding, padding)
  ctx.lineTo(padding, height - padding)
  ctx.lineTo(width - padding, height - padding)
  ctx.stroke()

  // 绘制数据点和连线
  ctx.strokeStyle = meta.color
  ctx.fillStyle = meta.color
  ctx.lineWidth = 2

  const plotWidth = width - 2 * padding
  const plotHeight = height - 2 * padding
  const stepX = metrics.length > 1 ? plotWidth / (metrics.length - 1) : 0

  ctx.beginPath()
  metrics.forEach((m, i) => {
    const x = padding + i * stepX
    const y = height - padding - ((parseFloat(m.value) - minVal) / range) * plotHeight
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  // 绘制数据点
  metrics.forEach((m, i) => {
    const x = padding + i * stepX
    const y = height - padding - ((parseFloat(m.value) - minVal) / range) * plotHeight
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, 2 * Math.PI)
    ctx.fill()
  })

  // 绘制 Y 轴标签（最小值和最大值）
  ctx.fillStyle = '#666'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(maxVal.toFixed(1), padding - 5, padding + 5)
  ctx.fillText(minVal.toFixed(1), padding - 5, height - padding + 5)

  // 绘制 X 轴标签（首末日期）
  ctx.textAlign = 'center'
  ctx.fillText(fmtDate(metrics[0].measured_on), padding, height - padding + 20)
  if (metrics.length > 1) {
    ctx.fillText(fmtDate(metrics[metrics.length - 1].measured_on), width - padding, height - padding + 20)
  }
}
