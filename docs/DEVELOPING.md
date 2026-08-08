# 开发指南

## 架构

```
全家设备（iPhone/安卓/Mac/Win 浏览器 或 PWA 主屏幕图标）
    ↓ HTTPS
前端 PWA — GitHub Pages 托管（本仓库 main 分支根目录，推 main 即发布）
  纯 HTML/CSS/JS，无框架无构建；代码公开但不含任何密钥
    ↓ supabase-js（登录后才可访问）
Supabase（东京节点）
  ├─ Auth        邮箱+密码；账号由管理员用 scripts/create-users.mjs 创建
  ├─ Postgres    records/medications/attachments/members；RLS 行级安全
  └─ Storage     attachments 私有桶；路径 member_id/record_id/uuid.ext
```

设计文档（决策记录齐全）：`docs/superpowers/specs/2026-08-08-family-health-record-design.md`
实施计划：`docs/superpowers/plans/2026-08-08-m1-core-records.md`

## 文件结构

| 路径 | 职责 |
|---|---|
| `index.html` | 应用外壳（单页，hash 路由） |
| `css/style.css` | 药房绿主题 + 适老化（正文≥18px、触控≥48px、深色模式） |
| `js/config.js` | Supabase URL + anon key（可公开；空值时前端显示开通引导页） |
| `js/db.js` | 客户端初始化、登录/登出、当前成员缓存、canWrite |
| `js/api.js` | 全部数据读写（视图层不直接碰 supabase client） |
| `js/utils.js` | 纯函数（node 可测）：日期、复诊窗口、转义、状态字典 |
| `js/compress.js` | 图片上传前压缩（长边 2000px JPEG85%） |
| `js/router.js` | hash 路由 + 登录守卫 + 未配置云端守卫 |
| `js/views/*.js` | setup 引导 / login / home / timeline / detail / form |
| `supabase/migrations/` | 数据库迁移（按序号累加，不改已应用的文件） |
| `scripts/create-users.mjs` | 建家庭账号（幂等）；读 family.local.json（不入库） |
| `tests/` | utils 纯函数测试 + RLS 权限边界测试 |

## 本地开发

```bash
python3 -m http.server 5173   # 项目根目录；无构建步骤（原生 ES Modules）
```

## 环境变量（.env.local，绝不提交）

见 `.env.example`。关键区别：
- **anon key**：设计上可公开（前端就带着它），安全靠 RLS + 登录
- **service_role key**：等于数据库全权，只在本机脚本用，泄漏须立即在 Dashboard 轮换

## 数据库迁移

```bash
source .env.local
psql "$SUPABASE_DB_URL" -f supabase/migrations/00X_xxx.sql
```

## 账号管理

```bash
node --env-file=.env.local scripts/create-users.mjs        # 幂等，可重复跑
```

给男朋友升管理员：`update members set role='admin' where display_name='阿伟';`
重置某人密码：Dashboard → Authentication → Users → 该用户 → Reset password。

## 测试

```bash
node --test tests/utils.test.mjs                            # 纯函数，随时可跑
node --env-file=.env.local --test tests/rls.test.mjs        # 权限边界；改 RLS 后必跑，13 项必须全绿
```

## 部署与缓存纪律

- 推 `main` 即自动发布到 GitHub Pages（1-2 分钟）
- **改任何前端文件后，把 `sw.js` 里的 `CACHE = 'fhr-vN'` 版本号 +1**，否则家人手机上是旧缓存
- Supabase 请求不经过 Service Worker，数据永远实时

## M2 / M3 接入点（已在架构中预留）

- **M2 AI 识别**：新增 Supabase Edge Function，持有京东云 Claude 网关 token（存 Supabase Secrets，前端永不接触）。识别结果写 `attachments.ai_summary`（详情页已会展示）+ 新建 `metrics` 表（迁移 003）。识别→人工核对→入库的核对页挂在 form 流程后。
- **M2 搜索**：首页加搜索框，Postgres `ilike` 覆盖病名/诊断/描述/药名/ai_summary。
- **M3 趋势图**：成员页加「健康指标」标签，读 `metrics` 表画时间曲线。
