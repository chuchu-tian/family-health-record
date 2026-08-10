// tests/rls.test.mjs — RLS 权限边界测试（against 真实 Supabase 项目）
// 运行: node --env-file=.env.local --test tests/rls.test.mjs
// 前置: 已应用 001/002 迁移，已运行 scripts/create-users.mjs
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_KEY
assert.ok(URL && ANON && SVC, '请用 --env-file=.env.local 运行，并配置好三项凭证')
const family = JSON.parse(readFileSync(join(__dirname, '../scripts/family.local.json'), 'utf-8'))
const adminCfg = family.find(p => p.role === 'admin')
const memberCfgs = family.filter(p => p.role === 'member')
assert.ok(adminCfg && memberCfgs.length >= 2, 'family.local.json 需要 1 个 admin 和至少 2 个 member')

async function login(cfg) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  })
  assert.ok(res.ok, `登录失败: ${cfg.email}`)
  return (await res.json()).access_token
}
const H = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
const SVCH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

let admin, dad, mom            // access tokens（借用称呼：memberCfgs[0]=dad, [1]=mom）
let dadId, momId               // member 表 id
let dadRec, momRec             // 种子记录
const createdRecords = []

before(async () => {
  ;[admin, dad, mom] = await Promise.all([login(adminCfg), login(memberCfgs[0]), login(memberCfgs[1])])
  const members = await (await fetch(`${URL}/rest/v1/members?select=id,display_name`, { headers: SVCH })).json()
  const idOf = (cfg) => members.find(m => m.display_name === cfg.display_name)?.id
  dadId = idOf(memberCfgs[0]); momId = idOf(memberCfgs[1])
  assert.ok(dadId && momId, '成员行缺失，请先运行 scripts/create-users.mjs')
  dadRec = await seed(dad, dadId)
  momRec = await seed(mom, momId)
})
async function seed(token, memberId) {
  const res = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: memberId, occurred_on: '2026-01-01', illness_name: 'RLS测试记录' }),
  })
  if (res.status !== 201) {
    const body = await res.text()
    throw new Error(`种子插入失败: ${res.status} ${body}`)
  }
  const [row] = await res.json(); createdRecords.push(row.id); return row
}
after(async () => {
  if (createdRecords.length)
    await fetch(`${URL}/rest/v1/records?id=in.(${createdRecords.join(',')})`, { method: 'DELETE', headers: SVCH })
})

test('无 apikey 访问被拒绝(401)', async () => {
  const res = await fetch(`${URL}/rest/v1/records`)
  assert.equal(res.status, 401)
})

test('匿名(未登录)读不到任何记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [])
})

test('登录成员可读全家记录', async () => {
  const rows = await (await fetch(`${URL}/rest/v1/records?select=id,member_id`, { headers: H(dad) })).json()
  assert.ok(rows.some(r => r.member_id === momId), 'dad 应能看到 mom 的记录')
})

test('成员不能替别人新增记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: H(dad),
    body: JSON.stringify({ member_id: momId, occurred_on: '2026-01-02', illness_name: 'RLS测试-越权插入' }) })
  assert.ok([401, 403].includes(res.status), `预期 401/403，实际 ${res.status}`)
})

test('成员不能修改别人的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ illness_name: 'RLS测试-被篡改' }) })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0, '越权修改应影响 0 行')
  const check = await (await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}&select=illness_name`, { headers: SVCH })).json()
  assert.equal(check[0].illness_name, 'RLS测试记录')
})

test('成员可以修改自己的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${dadRec.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ diagnosis: '自己改的' }) })
  assert.equal((await res.json()).length, 1)
})

test('管理员可以替任何成员新增和修改', async () => {
  const ins = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: { ...H(admin), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: momId, occurred_on: '2026-01-03', illness_name: 'RLS测试-管理员代记' }) })
  assert.equal(ins.status, 201)
  const [row] = await ins.json(); createdRecords.push(row.id)
  const upd = await fetch(`${URL}/rest/v1/records?id=eq.${dadRec.id}`, {
    method: 'PATCH', headers: { ...H(admin), Prefer: 'return=representation' },
    body: JSON.stringify({ notes: '管理员补充' }) })
  assert.equal((await upd.json()).length, 1)
})

test('成员不能删除别人的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}`, {
    method: 'DELETE', headers: { ...H(dad), Prefer: 'return=representation' } })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0)
})

test('成员不能给别人的病历挂用药', async () => {
  const res = await fetch(`${URL}/rest/v1/medications`, {
    method: 'POST', headers: H(dad),
    body: JSON.stringify({ record_id: momRec.id, drug_name: 'RLS测试-越权用药' }) })
  assert.ok([401, 403].includes(res.status))
})

test('成员可以给自己的病历挂用药', async () => {
  const res = await fetch(`${URL}/rest/v1/medications`, {
    method: 'POST', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ record_id: dadRec.id, drug_name: '测试药', dosage: '每日一次' }) })
  assert.equal(res.status, 201)
})

test('Storage: 只能传自己目录，不能传别人目录', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) // 最小 JPEG 壳
  const run = crypto.randomUUID().slice(0, 8)            // 唯一路径：上次异常退出的残留不影响本次
  const own = await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/${run}.jpg`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${dad}`, 'Content-Type': 'image/jpeg' }, body: bytes })
  assert.ok(own.ok, `本人目录上传应成功，实际 ${own.status} ${await own.text()}`)
  const other = await fetch(`${URL}/storage/v1/object/attachments/${momId}/rls-test/${run}.jpg`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${dad}`, 'Content-Type': 'image/jpeg' }, body: bytes })
  assert.ok(!other.ok, `别人目录上传应被拒绝，实际 ${other.status}`)
  await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/${run}.jpg`, { method: 'DELETE', headers: SVCH })
})

test('Storage: 未登录拿不到文件', async () => {
  const res = await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/a.jpg`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  assert.ok(!res.ok)
})

// ===== health_metrics（004 迁移）——此前漏测，正是漏过 anon 可读漏洞的地方 =====

const HM = `${URL}/rest/v1/health_metrics`
const createdMetrics = []
async function seedMetric(token, memberId) {
  const res = await fetch(HM, {
    method: 'POST', headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: memberId, measured_on: '2026-01-01',
      metric_type: 'blood_glucose', value: 5.5, unit: 'mmol/L', note: 'RLS测试指标' }) })
  assert.equal(res.status, 201, `指标种子插入失败: ${res.status} ${await res.clone().text()}`)
  const [row] = await res.json(); createdMetrics.push(row.id); return row
}
after(async () => {
  if (createdMetrics.length)
    await fetch(`${HM}?id=in.(${createdMetrics.join(',')})`, { method: 'DELETE', headers: SVCH })
})

test('指标: 本人可以录入自己的', async () => {
  await seedMetric(dad, dadId)
})

test('指标: 匿名(未登录)读不到任何指标——隐私底线', async () => {
  await seedMetric(dad, dadId)   // 保证表里有数据，[] 才有证明力
  const res = await fetch(`${HM}?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [], 'anon 应读到空数组')
})

test('指标: 匿名不能写入', async () => {
  const res = await fetch(HM, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: dadId, measured_on: '2026-01-01', metric_type: 'weight', value: 1 }) })
  assert.ok([401, 403].includes(res.status), `预期 401/403，实际 ${res.status}`)
})

test('指标: 登录成员可读全家指标', async () => {
  const m = await seedMetric(mom, momId)
  const rows = await (await fetch(`${HM}?select=id,member_id`, { headers: H(dad) })).json()
  assert.ok(rows.some(r => r.id === m.id), 'dad 应能看到 mom 的指标')
})

test('指标: 成员不能替别人录入', async () => {
  const res = await fetch(HM, {
    method: 'POST', headers: H(dad),
    body: JSON.stringify({ member_id: momId, measured_on: '2026-01-01', metric_type: 'weight', value: 60 }) })
  assert.ok([401, 403].includes(res.status), `预期 401/403，实际 ${res.status}`)
})

test('指标: 成员不能修改别人的（含改挂到自己名下）', async () => {
  const m = await seedMetric(mom, momId)
  const res = await fetch(`${HM}?id=eq.${m.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ value: 99 }) })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0, '越权修改应影响 0 行')
})

test('指标: 本人不能把自己的指标改挂到别人名下(with check)', async () => {
  const m = await seedMetric(dad, dadId)
  const res = await fetch(`${HM}?id=eq.${m.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: momId }) })
  const ok = res.ok ? (await res.json()).length : 0
  assert.equal(ok, 0, '改挂他人应被 with check 拒绝')
})

test('指标: 成员不能删别人的', async () => {
  const m = await seedMetric(mom, momId)
  const res = await fetch(`${HM}?id=eq.${m.id}`, {
    method: 'DELETE', headers: { ...H(dad), Prefer: 'return=representation' } })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0)
})

test('指标: 本人可删自己的', async () => {
  const m = await seedMetric(dad, dadId)
  const res = await fetch(`${HM}?id=eq.${m.id}`, {
    method: 'DELETE', headers: { ...H(dad), Prefer: 'return=representation' } })
  assert.equal((await res.json()).length, 1)
})

test('指标: 管理员可替任何成员录入和删除', async () => {
  const ins = await fetch(HM, {
    method: 'POST', headers: { ...H(admin), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: momId, measured_on: '2026-01-02',
      metric_type: 'heart_rate', value: 72, note: 'RLS测试-管理员代录' }) })
  assert.equal(ins.status, 201)
  const [row] = await ins.json(); createdMetrics.push(row.id)
  const del = await fetch(`${HM}?id=eq.${row.id}`, {
    method: 'DELETE', headers: { ...H(admin), Prefer: 'return=representation' } })
  assert.equal((await del.json()).length, 1)
})
