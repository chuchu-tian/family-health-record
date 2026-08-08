// js/config.js — 前端公开配置。anon key 按 Supabase 设计可公开——数据安全靠 RLS 与登录，不靠隐藏它。
// ⚠️ 云端尚未开通：按 docs/SETUP-CLOUD.md 完成四步后，把下面两个值填上并推送即可上线。
export const SUPABASE_URL = ''
export const SUPABASE_ANON_KEY = ''
export const CLOUD_READY = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY)
