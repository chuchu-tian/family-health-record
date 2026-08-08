// js/views/form.js — 新增/编辑病历。路由三形态：/new（记给自己/管理员可选人）、/new/:memberId、/edit/:recordId
import { listMembers, getRecord, createRecord, updateRecord, saveMedications,
         uploadAttachment, signedUrl, deleteAttachment } from '../api.js'
import { escapeHtml, STATUS } from '../utils.js'
import { setTitle, go, render } from '../router.js'
import { currentMember, canWrite } from '../db.js'
import { compressImage } from '../compress.js'

const today = () => new Date().toLocaleDateString('sv')  // sv 语言环境给出 YYYY-MM-DD

export default async function formView(app, params) {
  const hash = location.hash.slice(1)
  const editing = hash.startsWith('/edit/')
  const me = await currentMember()
  const record = editing ? await getRecord(params[0]) : null
  if (editing && !(await canWrite(record.member_id))) {
    app.innerHTML = '<div class="msg msg-error">你没有权限编辑这条记录</div>'
    return
  }
  const members = await listMembers()
  const defaultMember = record?.member_id ?? (hash.startsWith('/new/') ? params[0] : me.id)
  const canPickMember = !editing && me.role === 'admin'
  setTitle(editing ? '编辑病历' : '新增病历', { back: true })
  const v = (x) => escapeHtml(x ?? '')

  app.innerHTML = `
  <form id="rec-form" class="card" style="cursor:default">
    ${canPickMember ? `<label for="member_id">记给谁</label>
      <select id="member_id">${members.map(m =>
        `<option value="${m.id}"${m.id === defaultMember ? ' selected' : ''}>${escapeHtml(m.avatar + ' ' + m.display_name)}</option>`).join('')}</select>`
      : `<input type="hidden" id="member_id" value="${defaultMember}">`}

    <label for="illness_name">得了什么病 <span class="muted">（必填）</span></label>
    <input id="illness_name" required placeholder="如：感冒发烧 / 高血压" value="${v(record?.illness_name)}">

    <label for="occurred_on">哪一天 <span class="muted">（必填）</span></label>
    <input id="occurred_on" type="date" required value="${record?.occurred_on ?? today()}">

    <label for="files">拍照或选择图片 / PDF</label>
    <input id="files" type="file" accept="image/*,application/pdf" multiple>
    <div id="upload-status" class="muted"></div>
    <div id="existing-atts" class="thumbs" style="margin-top:10px"></div>

    <details ${editing ? 'open' : ''}>
      <summary>展开更多（诊断、用药、忌口、费用、复诊）</summary>

      <label for="status">现在情况</label>
      <select id="status">${Object.entries(STATUS).map(([k, s]) =>
        `<option value="${k}"${(record?.status ?? 'ongoing') === k ? ' selected' : ''}>${s.label}</option>`).join('')}</select>

      <label for="diagnosis">医生怎么说（诊断）</label>
      <textarea id="diagnosis">${v(record?.diagnosis)}</textarea>

      <label for="hospital">哪个医院</label>
      <input id="hospital" value="${v(record?.hospital)}">
      <label for="department">哪个科室</label>
      <input id="department" value="${v(record?.department)}">
      <label for="doctor_name">哪位医生</label>
      <input id="doctor_name" value="${v(record?.doctor_name)}">

      <div class="section">用药</div>
      <div id="meds"></div>
      <button type="button" class="btn btn-secondary" id="add-med">＋ 加一种药</button>

      <label for="cause">怎么得的（起因）</label>
      <textarea id="cause">${v(record?.cause)}</textarea>
      <label for="dietary_restrictions">要忌口什么</label>
      <textarea id="dietary_restrictions">${v(record?.dietary_restrictions)}</textarea>
      <label for="prevention">以后怎么预防</label>
      <textarea id="prevention">${v(record?.prevention)}</textarea>
      <label for="notes">其他备注</label>
      <textarea id="notes">${v(record?.notes)}</textarea>

      <label for="cost">花了多少钱（元）</label>
      <input id="cost" type="number" min="0" step="0.01" value="${record?.cost ?? ''}">
      <label for="insurance_note">医保/报销情况</label>
      <input id="insurance_note" value="${v(record?.insurance_note)}">
      <label for="follow_up_on">下次复诊日期</label>
      <input id="follow_up_on" type="date" value="${record?.follow_up_on ?? ''}">
    </details>

    <button class="btn" type="submit">保 存</button>
    <div id="form-msg"></div>
  </form>`

  // 用药行（编辑时预填已有用药）
  const medsBox = app.querySelector('#meds')
  const addMedRow = (m = {}) => {
    const row = document.createElement('div')
    row.className = 'med-row'
    row.innerHTML = `<input class="med-name" placeholder="药名" value="${escapeHtml(m.drug_name ?? '')}">
      <input class="med-dosage" placeholder="用法用量" value="${escapeHtml(m.dosage ?? '')}">
      <button type="button" class="icon-btn" aria-label="删除这一行">✕</button>`
    row.querySelector('button').addEventListener('click', () => row.remove())
    medsBox.append(row)
  }
  ;(record?.medications ?? []).forEach(addMedRow)
  app.querySelector('#add-med').addEventListener('click', () => addMedRow())

  // 已有附件：展示 + 删除
  const attBox = app.querySelector('#existing-atts')
  async function paintAtts() {
    const atts = record?.attachments ?? []
    attBox.innerHTML = ''
    for (const a of atts) {
      const wrap = document.createElement('div')
      if (a.file_type === 'image') {
        const url = await signedUrl(a.storage_path)
        wrap.innerHTML = `<img src="${url}" alt="附件">`
      } else wrap.innerHTML = '<div class="pdf-thumb">📄 PDF</div>'
      const del = document.createElement('button')
      del.type = 'button'; del.className = 'btn btn-danger'; del.style.minHeight = '40px'
      del.textContent = '删除'
      del.addEventListener('click', async () => {
        if (!confirm('确定删除这个附件吗？')) return
        await deleteAttachment(a)
        record.attachments = record.attachments.filter(x => x.id !== a.id)
        paintAtts()
      })
      wrap.append(del); attBox.append(wrap)
    }
  }
  if (editing) paintAtts()

  const form = app.querySelector('#rec-form')
  const msg = app.querySelector('#form-msg')
  const status = app.querySelector('#upload-status')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button[type=submit]')
    btn.disabled = true; btn.textContent = '保存中…'; msg.innerHTML = ''
    const num = (s) => (s === '' ? null : Number(s))
    const txt = (s) => (s.trim() === '' ? null : s.trim())
    const fields = {
      member_id: form.member_id.value,
      illness_name: form.illness_name.value.trim(),
      occurred_on: form.occurred_on.value,
      status: form.status.value,
      diagnosis: txt(form.diagnosis.value), hospital: txt(form.hospital.value),
      department: txt(form.department.value), doctor_name: txt(form.doctor_name.value),
      cause: txt(form.cause.value), dietary_restrictions: txt(form.dietary_restrictions.value),
      prevention: txt(form.prevention.value), notes: txt(form.notes.value),
      cost: num(form.cost.value), insurance_note: txt(form.insurance_note.value),
      follow_up_on: form.follow_up_on.value || null,
    }
    try {
      const saved = editing ? await updateRecord(record.id, fields) : await createRecord(fields)
      await saveMedications(saved.id, [...medsBox.querySelectorAll('.med-row')].map(r => ({
        drug_name: r.querySelector('.med-name').value,
        dosage: r.querySelector('.med-dosage').value,
      })))
      const files = [...form.files.files]
      for (const [i, file] of files.entries()) {
        status.textContent = `正在上传第 ${i + 1}/${files.length} 个附件…`
        const isPdf = file.type === 'application/pdf'
        if (isPdf && file.size > 20 * 1024 * 1024) throw new Error(`「${file.name}」超过 20MB，请压缩后再传`)
        const blob = isPdf ? file : await compressImage(file)
        await uploadAttachment(fields.member_id, saved.id, blob, isPdf ? 'pdf' : 'jpg', isPdf ? 'pdf' : 'image')
      }
      status.textContent = ''
      go(`/record/${saved.id}`); await render()
    } catch (err) {
      // 表单内容保留不丢：只提示错误，不清空、不跳转
      msg.innerHTML = `<div class="msg msg-error">保存失败：${escapeHtml(err.message)}<br>内容已保留，检查网络后可再点保存。</div>`
      status.textContent = ''
      btn.disabled = false; btn.textContent = '保 存'
    }
  })
}
