// js/views/metrics.js — 健康指标趋势图（M3）：曲线 + 正常范围底色 + 异常点高亮 + 手动录入
// 指标元数据与异常判定在 utils.js（纯函数，node 可测）
import { listHealthMetrics, getMember, createHealthMetric, deleteHealthMetric } from '../api.js'
import { escapeHtml, fmtDate, METRIC_LABELS, isAbnormal } from '../utils.js'
import { setTitle } from '../router.js'
import { canWrite } from '../db.js'

const today = () => new Date().toLocaleDateString('sv')
const fmtNum = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString()

export default async function metricsView(app, [memberId]) {
  const [member, writable] = await Promise.all([getMember(memberId), canWrite(memberId)])
  setTitle(`${member.display_name} 健康指标`, { back: true })

  app.innerHTML = `
    <div class="card" style="cursor:default">
      <h2 style="margin:0 0 10px">${escapeHtml(member.avatar + ' ' + member.display_name)}</h2>
      <label for="metric-type">看哪项指标</label>
      <select id="metric-type">
        <option value="">请选择…</option>
        ${Object.entries(METRIC_LABELS).map(([key, meta]) =>
          `<option value="${key}">${meta.name}</option>`).join('')}
      </select>
    </div>

    ${writable ? `<details id="add-box">
      <summary>＋ 手动添加一条指标</summary>
      <form id="add-form" style="margin-top:10px">
        <label for="add-type">指标</label>
        <select id="add-type" required>
          ${Object.entries(METRIC_LABELS).map(([key, meta]) =>
            `<option value="${key}">${meta.name}${meta.unit ? `（${meta.unit}）` : ''}</option>`).join('')}
        </select>
        <label for="add-value">数值 <span class="muted">（必填）</span></label>
        <input id="add-value" type="number" step="0.01" required inputmode="decimal">
        <label for="add-date">测量日期</label>
        <input id="add-date" type="date" required value="${today()}">
        <label for="add-note">备注（可不填）</label>
        <input id="add-note" placeholder="如：空腹 / 早晨测">
        <button class="btn" type="submit">保 存</button>
        <div id="add-msg"></div>
      </form>
    </details>` : ''}

    <div id="chart-container" hidden>
      <div class="card" style="cursor:default">
        <h3 id="chart-title" style="margin:0 0 6px"></h3>
        <div class="muted" id="chart-range" style="font-size:15px;margin-bottom:12px"></div>
        <canvas id="chart" role="img"></canvas>
        <div class="muted" style="font-size:14px;margin-top:8px">
          绿色区间为一般参考范围，仅供参考；请以化验单自带范围和医生意见为准。
        </div>
      </div>
      <div class="card" style="cursor:default">
        <div class="section" style="margin-top:0">数据列表</div>
        <div id="data-list"></div>
      </div>
    </div>`

  const select = app.querySelector('#metric-type')
  const chartContainer = app.querySelector('#chart-container')
  const canvas = app.querySelector('#chart')
  const chartTitle = app.querySelector('#chart-title')
  const chartRange = app.querySelector('#chart-range')
  const dataList = app.querySelector('#data-list')

  async function paint() {
    const metricType = select.value
    if (!metricType) { chartContainer.hidden = true; return }
    const meta = METRIC_LABELS[metricType]
    chartContainer.hidden = false
    chartTitle.textContent = `${meta.name}${meta.unit ? `（${meta.unit}）` : ''}`
    chartRange.textContent = meta.range
      ? `参考范围 ${meta.range[0]} – ${meta.range[1]}${meta.unit ? ' ' + meta.unit : ''}`
      : '此项无固定参考范围'

    let metrics
    try {
      metrics = await listHealthMetrics(memberId, metricType, 50)
    } catch (e) {
      canvas.hidden = true
      dataList.innerHTML = `<div class="msg msg-error">加载失败：${escapeHtml(e.message)}</div>`
      return
    }

    if (!metrics.length) {
      canvas.hidden = true
      dataList.innerHTML = `<div class="muted">还没有${escapeHtml(meta.name)}的数据${
        writable ? '，可用上面的「＋ 手动添加一条指标」录入' : ''}</div>`
      return
    }

    // 接口按日期倒序返回；画图要正序
    const asc = metrics.slice().reverse()
    canvas.hidden = false
    drawLineChart(canvas, asc, meta)

    // 列表最新在前
    dataList.innerHTML = metrics.map(m => {
      const bad = isAbnormal(m, meta)
      return `<div style="margin:10px 0;padding:10px;border-left:4px solid ${
        bad ? 'var(--danger)' : meta.color};background:#fafbfa;border-radius:8px">
        <div style="font-size:19px"><b>${escapeHtml(String(m.value))} ${escapeHtml(m.unit || meta.unit)}</b>
          ${bad ? '<span class="tag" style="background:#fdecea;color:var(--danger)">⚠️ 异常</span>' : ''}</div>
        <div class="field-label">${fmtDate(m.measured_on)}</div>
        ${m.note ? `<div class="muted" style="margin-top:4px">${escapeHtml(m.note)}</div>` : ''}
        ${writable ? `<button class="btn btn-danger" data-del="${m.id}"
          style="min-height:44px;font-size:16px;margin:8px 0 0">删除</button>` : ''}
      </div>`
    }).join('')

    dataList.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除这条指标数据吗？')) return
        btn.disabled = true
        try { await deleteHealthMetric(btn.dataset.del); await paint() }
        catch (e) { alert(`删除失败：${e.message}`); btn.disabled = false }
      }))
  }

  select.addEventListener('change', paint)
  // 转屏/改窗宽后重画，否则 canvas 尺寸是旧的（画布按 CSS 宽度算像素）
  window.addEventListener('resize', () => { if (!chartContainer.hidden) paint() })

  const addForm = app.querySelector('#add-form')
  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = addForm.querySelector('button[type=submit]')
    const msg = addForm.querySelector('#add-msg')
    btn.disabled = true; btn.textContent = '保存中…'; msg.innerHTML = ''
    const type = addForm.querySelector('#add-type').value
    const meta = METRIC_LABELS[type]
    const value = Number(addForm.querySelector('#add-value').value)
    try {
      await createHealthMetric({
        member_id: memberId,
        measured_on: addForm.querySelector('#add-date').value,
        metric_type: type,
        value,
        unit: meta.unit || null,
        is_abnormal: meta.range ? (value < meta.range[0] || value > meta.range[1]) : false,
        note: addForm.querySelector('#add-note').value.trim() || null,
      })
      msg.innerHTML = '<div class="msg msg-ok">已保存</div>'
      addForm.querySelector('#add-value').value = ''
      addForm.querySelector('#add-note').value = ''
      select.value = type          // 存完直接看这项的趋势
      await paint()
    } catch (err) {
      msg.innerHTML = `<div class="msg msg-error">保存失败：${escapeHtml(err.message)}<br>内容已保留，可再试一次。</div>`
    } finally {
      btn.disabled = false; btn.textContent = '保 存'
    }
  })
}

// 折线图：正常范围绿色底带 + 异常点红色加大 + 适老化字号
export function drawLineChart(canvas, metrics, meta) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  const cssW = Math.max(280, (canvas.parentElement?.clientWidth ?? 340) - 32)
  const cssH = 240
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = cssW + 'px'
  canvas.style.height = cssH + 'px'
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const padL = 52, padR = 14, padT = 16, padB = 42
  const plotW = cssW - padL - padR
  const plotH = cssH - padT - padB

  const values = metrics.map(m => parseFloat(m.value))
  // Y 轴范围要把参考区间也包进来，否则底色带可能整条落在可视区外
  const lo = Math.min(...values, ...(meta.range ?? []))
  const hi = Math.max(...values, ...(meta.range ?? []))
  const gap = (hi - lo) * 0.12 || Math.max(Math.abs(hi) * 0.1, 1)
  const yMin = lo - gap, yMax = hi + gap
  const span = yMax - yMin || 1
  const yOf = v => padT + plotH - ((v - yMin) / span) * plotH
  const xOf = i => metrics.length > 1 ? padL + (i / (metrics.length - 1)) * plotW : padL + plotW / 2

  // 正常范围底色
  if (meta.range) {
    const yTop = yOf(meta.range[1]), yBot = yOf(meta.range[0])
    ctx.fillStyle = 'rgba(58,125,92,.13)'
    ctx.fillRect(padL, yTop, plotW, yBot - yTop)
    ctx.strokeStyle = 'rgba(58,125,92,.45)'
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, yTop); ctx.lineTo(padL + plotW, yTop)
    ctx.moveTo(padL, yBot); ctx.lineTo(padL + plotW, yBot)
    ctx.stroke(); ctx.setLineDash([])
  }

  // 坐标轴
  ctx.strokeStyle = '#cfe6da'; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH)
  ctx.stroke()

  // 折线
  ctx.strokeStyle = meta.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'
  ctx.beginPath()
  metrics.forEach((m, i) => {
    const x = xOf(i), y = yOf(parseFloat(m.value))
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 数据点：异常点更大、红色
  metrics.forEach((m, i) => {
    const bad = isAbnormal(m, meta)
    const x = xOf(i), y = yOf(parseFloat(m.value))
    ctx.beginPath(); ctx.arc(x, y, bad ? 7 : 5, 0, 2 * Math.PI)
    ctx.fillStyle = bad ? '#c0392b' : meta.color
    ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
  })

  // Y 轴刻度（上/中/下三档）
  ctx.fillStyle = '#5d7268'; ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  for (const v of [yMax, (yMax + yMin) / 2, yMin]) ctx.fillText(fmtNum(v), padL - 8, yOf(v))

  // X 轴：首末日期（多于两点时补中间一个）
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  const short = iso => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` }
  const marks = metrics.length > 2
    ? [0, Math.floor((metrics.length - 1) / 2), metrics.length - 1]
    : metrics.map((_, i) => i)
  ;[...new Set(marks)].forEach(i => ctx.fillText(short(metrics[i].measured_on), xOf(i), padT + plotH + 10))

  canvas.setAttribute('aria-label', `${meta.name}趋势图，共 ${metrics.length} 条数据，`
    + `从 ${metrics[0].measured_on} 到 ${metrics[metrics.length - 1].measured_on}`)
}
