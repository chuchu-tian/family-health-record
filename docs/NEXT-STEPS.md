# 待你完成的两步线上操作（代码已全部就绪）

本地代码与测试已全部完成并推送。只有两件事需要你的账号权限，各约 2 分钟。

## 第 1 步：修线上 RLS 漏洞（紧急，5 分钟内做）

**现状**：线上 `health_metrics` 表的策略是旧版——**未登录也能读到全家健康指标**（已实测确认）。仓库里早已修好，但改策略需要数据库权限。

1. 打开 https://supabase.com/dashboard/project/prkugdtyenxtlptlpozg/sql/new
2. 把 `supabase/migrations/005_health_metrics_rls_fix.sql` 的内容整段粘贴，点 Run
3. 验证（应 22 项全绿，尤其「指标: 匿名(未登录)读不到任何指标」）：

```bash
cd /Users/chuchu/Documents/Project/family-health-record && node --env-file=.env.local --test tests/rls.test.mjs
```

## 第 2 步：重新部署 Edge Function（AI 识别报错的根因)

**现状**：你点「AI 识别」报 `Maximum call stack size exceeded`（已实测复现）——线上跑的还是旧版函数（`btoa(String.fromCharCode(...bytes))` 在整个 PDF 上爆栈）。旧版还**不校验登录**，属于同级别安全问题。修好的源码在 `supabase/functions/analyze-attachment/index.ts`，部署需要你的 Supabase 账号：

```bash
cd /Users/chuchu/Documents/Project/family-health-record && supabase login
```

（会弹浏览器授权，supabase CLI 已装好）然后：

```bash
cd /Users/chuchu/Documents/Project/family-health-record && supabase functions deploy analyze-attachment --project-ref prkugdtyenxtlptlpozg
```

若还没配过京东云密钥，再执行（把 `<key>` 换成真实值）：

```bash
supabase secrets set JD_CLOUD_API_KEY=<key> --project-ref prkugdtyenxtlptlpozg
```

部署完，在详情页再点「🤖 AI 识别这张」即可走通：识别 → 逐项核对（可改可勾掉）→ 确认保存。

---

### 顺带说明

- **页面乱码已修**：根因是修复只在本地、从没推送，线上 Pages 一直在发损坏文件。现已推送并验证线上 16 个 JS 全部干净。手机上若仍见乱码，是旧 Service Worker 缓存——关掉 PWA 重开一次即可（缓存版本已升 fhr-v3，会自动换新）。
- 云端现有 3 条演示数据（血糖偏高、内分泌复查、血糖 7.2 指标）是 M2/M3 验收用的种子，验收完可在应用里直接删。
