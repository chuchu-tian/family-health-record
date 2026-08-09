// js/config.js — 前端公开配置。anon key 按 Supabase 设计可公开——数据安全靠 RLS 与登录，不靠隐藏它。
// 云端已开通（Supabase 项目 prkugdtyenxtlptlpozg）。如需换项目，见 docs/SETUP-CLOUD.md。
export const SUPABASE_URL = 'https://prkugdtyenxtlptlpozg.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_KSIeEqWaK11w-KrFg8uYfQ_34i-pAQ7'
export const CLOUD_READY = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY)
