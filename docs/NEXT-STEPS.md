# 部署状态（2026-08-10 已完成验收）

## 已完成 ✅

- **前端乱码**：已修复并推送，线上 16 个 JS 逐一验证 0 损坏字符，缓存 fhr-v3
- **Edge Function**：新版已部署——无 JWT 调用返回 401（鉴权生效）、
  多 MB 附件不再爆栈（原「Maximum call stack size exceeded」已消除）
- **health_metrics RLS**：005 已执行，匿名读返回 []，隐私漏洞已堵上
- **RLS 自动化测试：22/22 全绿**（含 anon 拒读、越权改挂、管理员代录等边界）

## AI 识别已全线打通 ✅（2026-08-11 真实化验单验收）

真实 PDF 化验单端到端实测通过：识别（~26 秒）→ 核对页逐项显示
病名/医院/科室/医生/费用/两种用药 → 确认保存 → 病历入库 → 搜「同仁医院」命中。

最终配置（Edge Functions → Secrets）：
- `JD_CLOUD_API_KEY` = JoyBuilder 平台申请的 key
- `JD_CLOUD_ENDPOINT` = https://modelservice.jdcloud.com/anthropic/v1/messages
- `JD_CLOUD_MODEL` = claude-sonnet-5-hq

注意：网关的 /v1/messages 路径不是 Anthropic 兼容入口（会报 Account invalid），
必须用 /anthropic/v1/messages。

## 平时的验证命令

```bash
node --env-file=.env.local --test tests/rls.test.mjs
```
