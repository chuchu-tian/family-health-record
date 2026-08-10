# 部署状态（2026-08-10 已完成验收）

## 已完成 ✅

- **前端乱码**：已修复并推送，线上 16 个 JS 逐一验证 0 损坏字符，缓存 fhr-v3
- **Edge Function**：新版已部署——无 JWT 调用返回 401（鉴权生效）、
  多 MB 附件不再爆栈（原「Maximum call stack size exceeded」已消除）
- **health_metrics RLS**：005 已执行，匿名读返回 []，隐私漏洞已堵上
- **RLS 自动化测试：22/22 全绿**（含 anon 拒读、越权改挂、管理员代录等边界）

## 唯一剩余配置：京东云 API Key

AI 识别链路已全通，最后一环是网关凭证。当前网关返回
`Account invalid`，说明 `JD_CLOUD_API_KEY` 这个 Secret 还没配或值不对。

在 Dashboard → Edge Functions → Secrets（你开过的那个页面）设置：

- `JD_CLOUD_API_KEY` = 你在京东云申请的网关 key（必填）
- `JD_CLOUD_ENDPOINT` = 网关地址（可选，默认 https://modelservice.jdcloud.com/v1/messages）

Secrets 保存后**无需重新部署**，下一次调用即生效。
配好后在详情页点「🤖 AI 识别这张」即可走通完整流程：识别 → 核对页逐项确认 → 入库。

## 平时的验证命令

```bash
node --env-file=.env.local --test tests/rls.test.mjs
```
