// scripts/reset-password.mjs — 重置���定用户密码
// 用法: node --env-file=.env.local scripts/reset-password.mjs <email> <new-password>
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY
if (!URL || !SVC) throw new Error('请在 .env.local ���置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY')

const [email, newPassword] = process.argv.slice(2)
if (!email || !newPassword) {
  console.error('���法: node --env-file=.env.local scripts/reset-password.mjs <email> <new-password>')
  console.error('示例: node --env-file=.env.local scripts/reset-password.mjs dad@example.com NewPass123!')
  process.exit(1)
}

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

// 查���用户
const list = await (await fetch(`${URL}/auth/v1/admin/users?per_page=100`, { headers: H })).json()
const user = (list.users ?? []).find(u => u.email === email)
if (!user) throw new Error(`未���到用���: ${email}`)

// 更新密���
const res = await fetch(`${URL}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ password: newPassword })
})

if (!res.ok) throw new Error(`重���密码失败 (HTTP ${res.status}): ${await res.text()}`)

console.log(`✅ 已成功���置 ${email} 的密���`)
