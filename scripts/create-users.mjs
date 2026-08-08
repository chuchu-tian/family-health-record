// scripts/create-users.mjs — 用 service key 创建家庭账号并写入 members 表（幂等，可重复运行）
// 运行: node --env-file=.env.local scripts/create-users.mjs
import { readFileSync } from 'node:fs'

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY
if (!URL || !SVC) throw new Error('请在 .env.local 配置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY')
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }
const family = JSON.parse(readFileSync(new URL('./family.local.json', import.meta.url)))

for (const p of family) {
  let res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email: p.email, password: p.password, email_confirm: true }),
  })
  let user = await res.json()
  if (!res.ok) {
    const list = await (await fetch(`${URL}/auth/v1/admin/users?per_page=100`, { headers: H })).json()
    user = (list.users ?? []).find(u => u.email === p.email)
    if (!user) throw new Error(`创建 ${p.email} 失败 (HTTP ${res.status}): ${JSON.stringify(user)}`)
    console.log(`已存在，复用: ${p.email}`)
  } else console.log(`已创建: ${p.email}`)
  res = await fetch(`${URL}/rest/v1/members?on_conflict=auth_user_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ auth_user_id: user.id, display_name: p.display_name, avatar: p.avatar, role: p.role, birth_year: p.birth_year ?? null }),
  })
  if (!res.ok) throw new Error(`写入成员 ${p.display_name} 失败: ${await res.text()}`)
}
const members = await (await fetch(`${URL}/rest/v1/members?select=display_name,avatar,role`, { headers: H })).json()
console.table(members)
