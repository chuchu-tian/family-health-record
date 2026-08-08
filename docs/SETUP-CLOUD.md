# 云端开通指南（管理员一次性操作，约 10 分钟）

做完这四步，网站就从「云端还没开通」变成可用状态。

## 第 1 步：创建 Supabase 项目（免费）

1. 打开 https://supabase.com/dashboard 登录（可用 GitHub 账号 chuchu-tian 直接登录）
2. 「New project」：
   - Name：`family-health-record`
   - Database Password：设一个**强密码并记下来**
   - Region：**Northeast Asia (Tokyo)**（买房地图同款，国内连通性已验证）
3. 等 1-2 分钟项目初始化完成

## 第 2 步：取密钥、填配置、跑迁移

在项目页 **Settings → API** 拿三样东西：
- Project URL（形如 `https://xxxx.supabase.co`）
- `anon` `public` key
- `service_role` key（⚠️ 这个绝不能泄漏/提交）

在 **Connect →  Session pooler** 复制连接串（把 `[YOUR-PASSWORD]` 换成第 1 步的数据库密码）。

回到本项目目录：

```bash
cd /Users/chuchu/Documents/Project/family-health-record
cp .env.example .env.local
# 编辑 .env.local，填入上面四样
```

应用数据库迁移（需要 psql；没有就 `brew install libpq && brew link --force libpq`）：

```bash
source .env.local
psql "$SUPABASE_DB_URL" -f supabase/migrations/001_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_rls.sql
```

> psql 连不上的备选：把两个 SQL 文件内容依次粘到 Supabase Dashboard → SQL Editor 里运行。
> 若 002 中 storage.objects 的策略报 `must be owner`，去 Dashboard → Storage → attachments → Policies 手动建三条同名策略（表达式照抄 SQL 文件）。

## 第 3 步：创建全家账号

```bash
cp scripts/family.example.json scripts/family.local.json
# 编辑 family.local.json：填真实邮箱、初始密码、称呼、头像、角色
node --env-file=.env.local scripts/create-users.mjs
```

然后跑权限测试，**13 项必须全绿**（这是隐私底线）：

```bash
node --env-file=.env.local --test tests/rls.test.mjs
```

## 第 4 步：把前端指向云端并发布

编辑 `js/config.js`，填入 Project URL 和 anon key（这两个可以公开，安全靠登录+RLS）：

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJ......'
```

同时把 `sw.js` 第一行的缓存版本号 +1（`fhr-v1` → `fhr-v2`），然后：

```bash
git add js/config.js sw.js
git commit -m "chore: 接入 Supabase 云端"
git push
```

等 1-2 分钟 GitHub Pages 重新发布，打开网站就是登录页了。把各自的邮箱密码发给家人（参考 docs/USAGE.md 教他们添加到主屏幕）。

## 上线后安全自查（强烈建议）

```bash
source .env.local
# 未登录读数据库，应返回 []（空数组）
curl -s "$SUPABASE_URL/rest/v1/records?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# 无凭证访问，应返回 401
curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/rest/v1/records"
```
