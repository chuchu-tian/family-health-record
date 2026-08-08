// js/db.js — Supabase 客户端初始化 + 登录态 + 当前成员缓存
import { SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_READY } from './config.js'

export const client = CLOUD_READY()
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null
let me = null

export async function getSession() {
  if (!client) return null
  return (await client.auth.getSession()).data.session
}

export async function login(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  me = null
}

export async function logout() {
  await client.auth.signOut()
  me = null
}

// 当前登录用户对应的 members 行（含 role），会话内缓存
export async function currentMember() {
  if (me) return me
  const session = await getSession()
  if (!session) return null
  const { data, error } = await client.from('members')
    .select('*').eq('auth_user_id', session.user.id).single()
  if (error) throw error
  me = data
  return me
}

// 能否编辑某成员名下的数据：本人或管理员（与 RLS 规则一致，仅用于控制界面显隐）
export async function canWrite(memberId) {
  const m = await currentMember()
  return !!m && (m.role === 'admin' || m.id === memberId)
}
