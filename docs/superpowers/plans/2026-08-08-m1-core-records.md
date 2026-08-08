# M1 · 核心记录功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上线家庭病例档案 PWA 的第一期：登录、成员门户首页（含复诊横幅）、病历增删改查（用药/就诊/费用/复诊）、附件上传查看、成员/管理员权限、清爽药房绿适老化 UI、部署到 GitHub Pages。

**Architecture:** 纯 HTML/CSS/JS 静态 PWA（无框架、无构建），托管 GitHub Pages；数据与文件全部在 Supabase（Auth 登录 + Postgres/RLS + 私有 Storage）。前端代码公开但不含任何密钥；隐私完全靠登录 + RLS 保护。AI 识别（Edge Function）属于 M2，本计划不涉及。

**Tech Stack:** Supabase（Auth/Postgres/Storage，东京节点）、supabase-js v2（vendored UMD）、原生 ES Modules、hash 路由、node:test（纯函数与 RLS 测试）、psql（应用迁移）、gh CLI（部署）。

**Spec:** `docs/superpowers/specs/2026-08-08-family-health-record-design.md`（已获用户批准）


> **执行状态（2026-08-09）**：Task 1-3、4（测试代码）、5（策略文件）、6-16 已完成并推送；站点已上线 https://chuchu-tian.github.io/family-health-record/ （显示云端开通引导页）。
> **待人工（Task 0 → 云端开通）**：按 docs/SETUP-CLOUD.md 建 Supabase 项目后，迁移/建号/RLS测试（Task 2/3/5 的运行步骤、Task 4 红绿验证、Task 17 云端自查、Task 18 真机验收）即可执行。密钥三查已通过（无跟踪/无字符串/历史干净）。

---

## 文件结构（全景）

```
family-health-record/            ← 仓库根 = 部署站点根，全部相对路径
├── index.html                   应用外壳（单页，hash 路由）
├── manifest.webmanifest         PWA 清单
├── sw.js                        Service Worker（缓存应用外壳；数据请求走网络）
├── icons/icon.svg, icon-180.png, icon-512.png
├── css/style.css                药房绿主题 + 适老化
├── vendor/supabase.js           supabase-js v2 UMD（vendored，不依赖 CDN）
├── js/
│   ├── config.js                SUPABASE_URL + anon key（anon key 设计上可公开，可提交）
│   ├── db.js                    客户端初始化 + 登录/登出 + 当前成员缓存
│   ├── api.js                   数据访问层（records/medications/attachments CRUD + 签名URL）
│   ├── utils.js                 纯函数（日期/复诊分类/转义/状态字典）——node 可测
│   ├── compress.js              图片压缩（canvas，长边2000px JPEG85%）
│   ├── router.js                hash 路由 + 登录守卫
│   ├── app.js                   入口：注册路由 + SW
│   └── views/login.js / home.js / timeline.js / detail.js / form.js
├── supabase/migrations/001_schema.sql, 002_rls.sql
├── scripts/create-users.mjs     用 service key 建家庭账号（读 family.local.json）
├── scripts/family.example.json  家庭名单模板（真实名单 family.local.json 不提交）
├── tests/utils.test.mjs, rls.test.mjs
├── docs/USAGE.md, DEVELOPING.md
├── .env.example                 （真实 .env.local 不提交）
└── .gitignore
```

**密钥纪律（每个任务都适用）**：`service_role key`、数据库密码、真实邮箱密码只存在 `.env.local` 和 `scripts/family.local.json`，两者都在 .gitignore 里。每次 commit 前确认 `git status` 里没有这两个文件。anon key 和项目 URL 可提交（Supabase 设计如此，安全靠 RLS）。

---

### Task 0: 人工准备（用户完成，开工前置条件）

执行者无法代做的真人步骤，全部完成后才能开始 Task 2：

- [ ] 在 https://supabase.com/dashboard 新建项目（建议名 `family-health-record`，区域 Tokyo，**与买房地图分开的独立项目**）。设置一个强数据库密码并记下。
- [ ] 从项目 Settings → API 页拿到：Project URL、`anon` key、`service_role` key。
- [ ] 从 Connect → Session pooler 拿到 IPv4 可用的连接串（形如 `postgresql://postgres.[ref]:[密码]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`）。
- [ ] 把以上四样填入项目根目录 `.env.local`（Task 1 会给出模板 `.env.example`）。
- [ ] 把全家四人的 邮箱/初始密码/称呼/头像/角色 填入 `scripts/family.local.json`（模板 `scripts/family.example.json`）。建议用真实邮箱（忘记密码时能收重置邮件）；用虚构邮箱也行，但重置密码只能靠管理员在 Supabase 后台操作。

---

### Task 1: 仓库脚手架与本地环境检查

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`, `scripts/family.example.json`

- [ ] **Step 1: 检查本地工具链**

```bash
node --version   # 需要 ≥ v20.6（--env-file 支持）；没有则: brew install node
which psql || brew install libpq && brew link --force libpq
gh auth status   # 应显示已登录（用户名 chuchu-tian）
```

Expected: node ≥ 20.6；psql 可用；gh 已登录。任何一项失败先解决再继续。

- [ ] **Step 2: git 身份与 .gitignore**

```bash
cd /Users/chuchu/Documents/Project/family-health-record
git config user.name "chuchu-tian"
git config user.email "chuchu-tian@users.noreply.github.com"
```

`.gitignore` 改为：

```
.superpowers/
.DS_Store
.env.local
scripts/family.local.json
```

- [ ] **Step 3: 写 `.env.example`**

```
# 复制为 .env.local 并填入真实值（.env.local 已被 gitignore，绝不提交）
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_ANON_KEY=eyJ...   # anon 公钥（前端也用它）
SUPABASE_SERVICE_KEY=eyJ...  # service_role 密钥，只在本机脚本用，泄露=数据全暴露
SUPABASE_DB_URL=postgresql://postgres.REF:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

- [ ] **Step 4: 写 `scripts/family.example.json`**

```json
[
  { "email": "chuchu@example.com", "password": "改成强密码", "display_name": "我", "avatar": "👩", "role": "admin", "birth_year": 1995 },
  { "email": "boyfriend@example.com", "password": "改成强密码", "display_name": "阿伟", "avatar": "👨", "role": "member", "birth_year": 1993 },
  { "email": "dad@example.com", "password": "改成强密码", "display_name": "爸爸", "avatar": "👴", "role": "member", "birth_year": 1965 },
  { "email": "mom@example.com", "password": "改成强密码", "display_name": "妈妈", "avatar": "👵", "role": "member", "birth_year": 1968 }
]
```

- [ ] **Step 5: 确认 Task 0 产物已就位**

```bash
test -f .env.local && test -f scripts/family.local.json && echo OK || echo "等待用户完成 Task 0"
```

Expected: OK。若无，暂停并提醒用户。

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example scripts/family.example.json
git status   # 确认 .env.local 与 family.local.json 不在暂存区
git commit -m "chore: 脚手架——gitignore/env 模板/家庭名单模板"
```

---

### Task 2: 数据库 schema（001_schema.sql）

**Files:**
- Create: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: 写迁移文件**

```sql
-- 001_schema.sql — 表结构、辅助函数、审计触发器（RLS 见 002）
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  avatar text not null default '🙂',
  birth_year int,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  occurred_on date not null,
  illness_name text not null,
  cause text,
  dietary_restrictions text,
  prevention text,
  notes text,
  diagnosis text,
  hospital text,
  department text,
  doctor_name text,
  cost numeric(10,2) check (cost >= 0),
  insurance_note text,
  follow_up_on date,
  status text not null default 'ongoing' check (status in ('ongoing','recovered','chronic')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz
);
create index if not exists records_member_idx on records (member_id, occurred_on desc);

create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  drug_name text not null,
  dosage text,
  note text
);
create index if not exists medications_record_idx on medications (record_id);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  storage_path text not null,
  file_type text not null check (file_type in ('image','pdf')),
  ai_summary text,
  uploaded_at timestamptz not null default now()
);
create index if not exists attachments_record_idx on attachments (record_id);

-- 当前登录用户对应的成员 id（security definer 绕过 RLS，避免策略递归）
create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where auth_user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from members where auth_user_id = auth.uid()), false)
$$;

-- 更新时自动记录审计字段（含管理员代改是谁改的）
create or replace function set_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_set_updated on records;
create trigger records_set_updated before update on records
  for each row execute function set_updated();
```

（metrics 指标表属于 M2 迁移，本期不建——spec「M2 起积累」。）

- [ ] **Step 2: 应用迁移**

```bash
source .env.local
psql "$SUPABASE_DB_URL" -f supabase/migrations/001_schema.sql
```

Expected: 一串 `CREATE TABLE` / `CREATE FUNCTION` / `CREATE TRIGGER`，无 ERROR。
（psql 连不上时的备选：把 SQL 全文粘到 Supabase Dashboard → SQL Editor 运行，属人工步骤。）

- [ ] **Step 3: 验证表存在**

```bash
psql "$SUPABASE_DB_URL" -c "\d records" | head -30
```

Expected: 列出 records 全部列（occurred_on、illness_name、cost、follow_up_on、status…）。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat: 数据库 schema——members/records/medications/attachments + 审计触发器"
```

⚠️ 此刻 RLS 尚未启用，数据库对匿名开放——**Task 5 之前不得录入任何真实数据**。

---

### Task 3: 家庭账号创建脚本

**Files:**
- Create: `scripts/create-users.mjs`

- [ ] **Step 1: 写脚本**

```js
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
    if (!user) throw new Error(`创建 ${p.email} 失败 (HTTP ${res.status})`)
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
```

- [ ] **Step 2: 运行并验证**

```bash
node --env-file=.env.local scripts/create-users.mjs
```

Expected: 四行「已创建/已存在」+ console.table 列出 4 位成员，1 个 admin、3 个 member。

- [ ] **Step 3: Commit**

```bash
git add scripts/create-users.mjs
git status   # 再次确认 family.local.json 未被跟踪
git commit -m "feat: 家庭账号创建脚本（service key 建号 + members 幂等写入）"
```

---

### Task 4: RLS 权限测试先行（TDD 红灯）

**Files:**
- Create: `tests/rls.test.mjs`

隐私底线用自动化测试锁死。先写测试，此刻 RLS 未启用，**预期大面积失败**；Task 5 应用策略后转绿。

- [ ] **Step 1: 写测试**

```js
// tests/rls.test.mjs — RLS 权限边界测试（against 真实 Supabase 项目）
// 运行: node --env-file=.env.local --test tests/rls.test.mjs
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_KEY
const family = JSON.parse(readFileSync(new URL('../scripts/family.local.json', import.meta.url)))
const adminCfg = family.find(p => p.role === 'admin')
const memberCfgs = family.filter(p => p.role === 'member')
assert.ok(adminCfg && memberCfgs.length >= 2, 'family.local.json 需要 1 个 admin 和至少 2 个 member')

async function login(cfg) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  })
  assert.ok(res.ok, `登录失败: ${cfg.email}`)
  return (await res.json()).access_token
}
const H = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
const SVCH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

let admin, dad, mom            // access tokens（借用称呼：memberCfgs[0]=dad, [1]=mom）
let dadId, momId               // member 表 id
let dadRec, momRec             // 种子记录
const createdRecords = []

before(async () => {
  ;[admin, dad, mom] = await Promise.all([login(adminCfg), login(memberCfgs[0]), login(memberCfgs[1])])
  const members = await (await fetch(`${URL}/rest/v1/members?select=id,display_name`, { headers: SVCH })).json()
  const idOf = (cfg) => members.find(m => m.display_name === cfg.display_name)?.id
  dadId = idOf(memberCfgs[0]); momId = idOf(memberCfgs[1])
  assert.ok(dadId && momId, '成员行缺失，请先运行 scripts/create-users.mjs')
  dadRec = await seed(dad, dadId)
  momRec = await seed(mom, momId)
})
async function seed(token, memberId) {
  const res = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: { ...H(token), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: memberId, occurred_on: '2026-01-01', illness_name: 'RLS测试记录' }),
  })
  assert.equal(res.status, 201, `种子插入失败: ${res.status}`)
  const [row] = await res.json(); createdRecords.push(row.id); return row
}
after(async () => {
  if (createdRecords.length)
    await fetch(`${URL}/rest/v1/records?id=in.(${createdRecords.join(',')})`, { method: 'DELETE', headers: SVCH })
})

test('无 apikey 访问被拒绝(401)', async () => {
  const res = await fetch(`${URL}/rest/v1/records`)
  assert.equal(res.status, 401)
})

test('匿名(未登录)读不到任何记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [])
})

test('登录成员可读全家记录', async () => {
  const rows = await (await fetch(`${URL}/rest/v1/records?select=id,member_id`, { headers: H(dad) })).json()
  assert.ok(rows.some(r => r.member_id === momId), 'dad 应能看到 mom 的记录')
})

test('成员不能替别人新增记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: H(dad),
    body: JSON.stringify({ member_id: momId, occurred_on: '2026-01-02', illness_name: 'RLS测试-越权插入' }) })
  assert.ok([401, 403].includes(res.status), `预期 401/403，实际 ${res.status}`)
})

test('成员不能修改别人的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ illness_name: 'RLS测试-被篡改' }) })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0, '越权修改应影响 0 行')
  const check = await (await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}&select=illness_name`, { headers: SVCH })).json()
  assert.equal(check[0].illness_name, 'RLS测试记录')
})

test('成员可以修改自己的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${dadRec.id}`, {
    method: 'PATCH', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ diagnosis: '自己改的' }) })
  assert.equal((await res.json()).length, 1)
})

test('管理员可以替任何成员新增和修改', async () => {
  const ins = await fetch(`${URL}/rest/v1/records`, {
    method: 'POST', headers: { ...H(admin), Prefer: 'return=representation' },
    body: JSON.stringify({ member_id: momId, occurred_on: '2026-01-03', illness_name: 'RLS测试-管理员代记' }) })
  assert.equal(ins.status, 201)
  const [row] = await ins.json(); createdRecords.push(row.id)
  const upd = await fetch(`${URL}/rest/v1/records?id=eq.${dadRec.id}`, {
    method: 'PATCH', headers: { ...H(admin), Prefer: 'return=representation' },
    body: JSON.stringify({ notes: '管理员补充' }) })
  assert.equal((await upd.json()).length, 1)
})

test('成员不能删除别人的记录', async () => {
  const res = await fetch(`${URL}/rest/v1/records?id=eq.${momRec.id}`, {
    method: 'DELETE', headers: { ...H(dad), Prefer: 'return=representation' } })
  const rows = res.ok ? await res.json() : []
  assert.equal(rows.length, 0)
})

test('成员不能给别人的病历挂用药', async () => {
  const res = await fetch(`${URL}/rest/v1/medications`, {
    method: 'POST', headers: H(dad),
    body: JSON.stringify({ record_id: momRec.id, drug_name: 'RLS测试-越权用药' }) })
  assert.ok([401, 403].includes(res.status))
})

test('成员可以给自己的病历挂用药', async () => {
  const res = await fetch(`${URL}/rest/v1/medications`, {
    method: 'POST', headers: { ...H(dad), Prefer: 'return=representation' },
    body: JSON.stringify({ record_id: dadRec.id, drug_name: '测试药', dosage: '每日一次' }) })
  assert.equal(res.status, 201)
})

test('Storage: 只能传自己目录，不能传别人目录', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) // 最小 JPEG 壳
  const own = await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/a.jpg`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${dad}`, 'Content-Type': 'image/jpeg' }, body: bytes })
  assert.ok(own.ok, `本人目录上传应成功，实际 ${own.status}`)
  const other = await fetch(`${URL}/storage/v1/object/attachments/${momId}/rls-test/b.jpg`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${dad}`, 'Content-Type': 'image/jpeg' }, body: bytes })
  assert.ok(!other.ok, `别人目录上传应被拒绝，实际 ${other.status}`)
  await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/a.jpg`, { method: 'DELETE', headers: SVCH })
})

test('Storage: 未登录拿不到文件', async () => {
  const res = await fetch(`${URL}/storage/v1/object/attachments/${dadId}/rls-test/a.jpg`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  assert.ok(!res.ok)
})
```

- [ ] **Step 2: 运行，确认红灯**

```bash
node --env-file=.env.local --test tests/rls.test.mjs
```

Expected: **多项 FAIL**（如「匿名读不到」「不能替别人新增」「Storage」等——RLS 与存储桶还不存在）。红灯期插入的越权测试行会留在库里，Task 5 会清理。

- [ ] **Step 3: Commit**

```bash
git add tests/rls.test.mjs
git commit -m "test: RLS 权限边界测试（先行，待策略后转绿）"
```

---

### Task 5: RLS 策略与私有存储桶（TDD 绿灯）

**Files:**
- Create: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: 写迁移文件**

```sql
-- 002_rls.sql — 行级安全策略 + 私有存储桶（隐私底线）
alter table members enable row level security;
alter table records enable row level security;
alter table medications enable row level security;
alter table attachments enable row level security;

-- 能否写某成员名下数据：本人或管理员
create or replace function can_write_member(mid uuid) returns boolean
language sql stable as $$
  select mid = current_member_id() or is_admin()
$$;
-- 能否写某条病历下挂的数据
create or replace function can_write_record(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from records r where r.id = rid
                 and (r.member_id = current_member_id() or is_admin()))
$$;

-- members：登录可读；仅管理员可改；增删走 service role（无策略=默认拒绝）
create policy members_select on members for select to authenticated using (true);
create policy members_update on members for update to authenticated
  using (is_admin()) with check (is_admin());

-- records：登录可读全家；写=本人或管理员（with check 同时防止把记录改挂到别人名下）
create policy records_select on records for select to authenticated using (true);
create policy records_insert on records for insert to authenticated
  with check (can_write_member(member_id));
create policy records_update on records for update to authenticated
  using (can_write_member(member_id)) with check (can_write_member(member_id));
create policy records_delete on records for delete to authenticated
  using (can_write_member(member_id));

-- medications / attachments：权限跟随父病历
create policy medications_select on medications for select to authenticated using (true);
create policy medications_insert on medications for insert to authenticated with check (can_write_record(record_id));
create policy medications_update on medications for update to authenticated
  using (can_write_record(record_id)) with check (can_write_record(record_id));
create policy medications_delete on medications for delete to authenticated using (can_write_record(record_id));

create policy attachments_select on attachments for select to authenticated using (true);
create policy attachments_insert on attachments for insert to authenticated with check (can_write_record(record_id));
create policy attachments_update on attachments for update to authenticated
  using (can_write_record(record_id)) with check (can_write_record(record_id));
create policy attachments_delete on attachments for delete to authenticated using (can_write_record(record_id));

-- 私有存储桶
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- 存储策略：登录可读；写/删仅限自己（或管理员）的成员目录（路径第一段 = member_id）
create policy att_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy att_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and can_write_member(((storage.foldername(name))[1])::uuid));
create policy att_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and can_write_member(((storage.foldername(name))[1])::uuid));
```

- [ ] **Step 2: 应用迁移**

```bash
source .env.local
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_rls.sql
```

Expected: 一串 `ALTER TABLE` / `CREATE POLICY`，无 ERROR。

⚠️ **已知坑**：若 storage.objects 的 `create policy` 报 `must be owner of table objects`，说明该项目限制了 postgres 角色对 storage 的权限。备选路径（人工）：Dashboard → Storage → attachments 桶 → Policies → New Policy，逐条创建同名策略，表达式抄上面三条的 `using`/`with check` 内容。

- [ ] **Step 3: 清理红灯期越权测试残留**

```bash
source .env.local
curl -s -X DELETE "$SUPABASE_URL/rest/v1/records?illness_name=like.RLS%E6%B5%8B%E8%AF%95*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

- [ ] **Step 4: 运行测试，确认全绿**

```bash
node --env-file=.env.local --test tests/rls.test.mjs
```

Expected: **全部 PASS**（13 项）。任何一项失败都必须修复策略后重跑——不许跳过。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat: RLS 策略与私有存储桶——全家可读/本人或管理员可写，测试全绿"
```

---

### Task 6: 纯函数工具库（TDD）

**Files:**
- Create: `js/utils.js`
- Test: `tests/utils.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
// tests/utils.test.mjs — 运行: node --test tests/utils.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtDate, followUpKind, escapeHtml, STATUS } from '../js/utils.js'

const today = new Date('2026-08-08T10:00:00')

test('fmtDate 输出中文日期', () => assert.equal(fmtDate('2026-08-05'), '2026年8月5日'))
test('fmtDate 空值返回空串', () => assert.equal(fmtDate(null), ''))
test('followUpKind: 未来14天内为 upcoming', () => assert.equal(followUpKind('2026-08-20', today), 'upcoming'))
test('followUpKind: 当天算 upcoming', () => assert.equal(followUpKind('2026-08-08', today), 'upcoming'))
test('followUpKind: 超过14天后不提醒', () => assert.equal(followUpKind('2026-09-08', today), null))
test('followUpKind: 过期30天内为 overdue', () => assert.equal(followUpKind('2026-08-01', today), 'overdue'))
test('followUpKind: 过期超过30天不提醒', () => assert.equal(followUpKind('2026-06-01', today), null))
test('followUpKind: 空值不提醒', () => assert.equal(followUpKind(null, today), null))
test('escapeHtml 转义五种危险字符', () =>
  assert.equal(escapeHtml(`<b>&"'`), '&lt;b&gt;&amp;&quot;&#39;'))
test('STATUS 覆盖三种状态', () =>
  assert.deepEqual(Object.keys(STATUS), ['ongoing', 'recovered', 'chronic']))
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/utils.test.mjs`
Expected: FAIL（Cannot find module '../js/utils.js'）

- [ ] **Step 3: 实现 `js/utils.js`**

```js
// js/utils.js — 纯函数工具：无 DOM、无网络，node 直接可测
export const STATUS = {
  ongoing: { label: '进行中', cls: 'st-ongoing' },
  recovered: { label: '已痊愈', cls: 'st-recovered' },
  chronic: { label: '长期慢性', cls: 'st-chronic' },
}

export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// 复诊提醒窗口：未来 0–14 天 upcoming；过期 1–30 天 overdue（标灰）；其余不提醒
export function followUpKind(iso, today = new Date()) {
  if (!iso) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = iso.split('-').map(Number)
  const diff = Math.round((new Date(y, m - 1, d) - t0) / 86400000)
  if (diff >= 0 && diff <= 14) return 'upcoming'
  if (diff < 0 && diff >= -30) return 'overdue'
  return null
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/utils.test.mjs`
Expected: 10 项全部 PASS

- [ ] **Step 5: Commit**

```bash
git add js/utils.js tests/utils.test.mjs
git commit -m "feat: 工具函数——日期格式化/复诊分类/HTML转义（含测试）"
```

---

### Task 7: vendored supabase-js + 前端配置 + 登录封装

**Files:**
- Create: `vendor/supabase.js`, `js/config.js`, `js/db.js`

- [ ] **Step 1: vendor supabase-js v2 UMD（不依赖 CDN，国内访问更稳）**

```bash
mkdir -p vendor js/views icons css
curl -fsSL -o vendor/supabase.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js
head -c 200 vendor/supabase.js   # 确认是 JS 而非错误页
```

Expected: 文件 > 100KB，开头是 JS 代码。若 jsdelivr 不通，换 `https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js`。

- [ ] **Step 2: 从 .env.local 生成 `js/config.js`（anon key 可公开，提交无碍）**

```bash
source .env.local
cat > js/config.js <<EOF
// 前端公开配置。anon key 按 Supabase 设计可公开——数据安全靠 RLS 与登录，不靠隐藏它。
export const SUPABASE_URL = '$SUPABASE_URL'
export const SUPABASE_ANON_KEY = '$SUPABASE_ANON_KEY'
EOF
grep -q "supabase.co" js/config.js && echo OK
```

- [ ] **Step 3: 写 `js/db.js`**

```js
// js/db.js — Supabase 客户端初始化 + 登录态 + 当前成员缓存
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
let me = null

export async function getSession() {
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
```

- [ ] **Step 4: Commit**

```bash
git add vendor/supabase.js js/config.js js/db.js
git commit -m "feat: vendored supabase-js + 前端配置 + 登录/成员封装"
```

---

### Task 8: 数据访问层 api.js

**Files:**
- Create: `js/api.js`

浏览器专用模块，正确性由 Task 11-13 的界面验证 + Task 18 验收清单覆盖（RLS 边界已有自动化测试）。

- [ ] **Step 1: 写 `js/api.js`**

```js
// js/api.js — 数据访问层：所有 Supabase 读写集中在此，视图层不直接碰 client
import { client } from './db.js'

export async function listMembers() {
  const { data, error } = await client.from('members').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function getMember(id) {
  const { data, error } = await client.from('members').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// 每位成员最近一条记录（首页卡片摘要）。家庭数据量级下全量拉取足够快。
export async function latestRecordByMember() {
  const { data, error } = await client.from('records')
    .select('member_id, illness_name, occurred_on')
    .order('occurred_on', { ascending: false })
  if (error) throw error
  const map = {}
  for (const r of data) if (!map[r.member_id]) map[r.member_id] = r
  return map
}

export async function listRecords(memberId) {
  const { data, error } = await client.from('records')
    .select('*, medications(id), attachments(id)')
    .eq('member_id', memberId).order('occurred_on', { ascending: false })
  if (error) throw error
  return data
}

export async function getRecord(id) {
  const { data, error } = await client.from('records')
    .select('*, medications(*), attachments(*)').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createRecord(fields) {
  const { data, error } = await client.from('records').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateRecord(id, fields) {
  const { data, error } = await client.from('records').update(fields).eq('id', id).select().single()
  if (error) throw error
  return data
}

// 覆盖式保存用药：先删后插，编辑逻辑最简单（RLS 保证只有本人/管理员能做）
export async function saveMedications(recordId, meds) {
  let { error } = await client.from('medications').delete().eq('record_id', recordId)
  if (error) throw error
  const rows = meds.filter(m => m.drug_name?.trim()).map(m => ({
    record_id: recordId, drug_name: m.drug_name.trim(),
    dosage: m.dosage?.trim() || null, note: m.note?.trim() || null,
  }))
  if (!rows.length) return
  ;({ error } = await client.from('medications').insert(rows))
  if (error) throw error
}

export async function uploadAttachment(memberId, recordId, blob, ext, fileType) {
  const path = `${memberId}/${recordId}/${crypto.randomUUID()}.${ext}`
  let { error } = await client.storage.from('attachments')
    .upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw error
  ;({ error } = await client.from('attachments')
    .insert({ record_id: recordId, storage_path: path, file_type: fileType }))
  if (error) throw error
}

export async function deleteAttachment(att) {
  let { error } = await client.storage.from('attachments').remove([att.storage_path])
  if (error) throw error
  ;({ error } = await client.from('attachments').delete().eq('id', att.id))
  if (error) throw error
}

// 删除病历：先删 Storage 文件，再删记录行（用药/附件行由外键级联删除）
export async function deleteRecord(record) {
  const paths = (record.attachments ?? []).map(a => a.storage_path)
  if (paths.length) {
    const { error } = await client.storage.from('attachments').remove(paths)
    if (error) throw error
  }
  const { error } = await client.from('records').delete().eq('id', record.id)
  if (error) throw error
}

// 私有文件的临时访问链接（1小时有效）
export async function signedUrl(path) {
  const { data, error } = await client.storage.from('attachments').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// 所有带复诊日期的记录（首页横幅，客户端按 14/30 天窗口过滤）
export async function recordsWithFollowUp() {
  const { data, error } = await client.from('records')
    .select('id, member_id, illness_name, department, follow_up_on')
    .not('follow_up_on', 'is', null)
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Commit**

```bash
git add js/api.js
git commit -m "feat: 数据访问层——records/medications/attachments CRUD 与签名URL"
```

---

### Task 9: 图片压缩模块

**Files:**
- Create: `js/compress.js`

- [ ] **Step 1: 写 `js/compress.js`**

```js
// js/compress.js — 上传前压缩：长边 2000px、JPEG 85%（化验单文字肉眼清晰，体积约 1-2MB）
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error(`无法读取「${file.name}」，请换一张图片（或先截图再上传）`)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('图片压缩失败，请重试')
  return blob
}
```

- [ ] **Step 2: Commit**

```bash
git add js/compress.js
git commit -m "feat: 图片上传前压缩（canvas，长边2000px JPEG85%）"
```

---

### Task 10: 应用外壳、药房绿主题、路由

**Files:**
- Create: `index.html`, `css/style.css`, `js/router.js`, `js/app.js`

- [ ] **Step 1: 写 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#3a7d5c">
<title>家庭病例档案</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="css/style.css">
<script src="vendor/supabase.js"></script>
</head>
<body>
<header id="topbar" hidden>
  <button id="back-btn" class="icon-btn" hidden aria-label="返回">←</button>
  <h1 id="page-title">家庭病例档案</h1>
  <button id="logout-btn" class="icon-btn" hidden aria-label="退出登录">退出</button>
</header>
<main id="app" aria-live="polite"></main>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 `css/style.css`（药房绿 + 适老化：正文 18px、触控 ≥48px）**

```css
:root{
  --green:#3a7d5c; --green-dark:#2c5f46; --green-soft:#e8f3ed; --green-line:#cfe6da;
  --bg:#f7faf8; --card:#fff; --text:#1c2b23; --muted:#5d7268; --danger:#c0392b; --warn:#b7791f;
  --radius:14px; --shadow:0 2px 8px rgba(28,43,35,.08);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-size:18px;line-height:1.6;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
#topbar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--green);color:#fff;
  position:sticky;top:0;z-index:10;padding-top:max(12px,env(safe-area-inset-top))}
#page-title{font-size:20px;margin:0;flex:1;text-align:center}
.icon-btn{min-width:48px;min-height:48px;font-size:18px;background:transparent;border:0;color:#fff;cursor:pointer;border-radius:10px}
.icon-btn:active{background:rgba(255,255,255,.18)}
#app{padding:16px;max-width:720px;margin:0 auto;padding-bottom:calc(32px + env(safe-area-inset-bottom))}
.card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;margin-bottom:14px;
  border-left:5px solid var(--green);text-align:left;width:100%;display:block;font:inherit;color:inherit;cursor:pointer}
.card:active{background:var(--green-soft)}
.member-card{display:flex;align-items:center;gap:14px;min-height:88px}
.member-card .avatar{font-size:40px}
.member-card .name{font-size:22px;font-weight:600}
.member-card .sub{color:var(--muted);font-size:16px}
.btn{display:block;width:100%;min-height:56px;font-size:20px;font-weight:600;border:0;border-radius:var(--radius);
  background:var(--green);color:#fff;cursor:pointer;margin:12px 0}
.btn:active{background:var(--green-dark)}
.btn-secondary{background:#fff;color:var(--green);border:2px solid var(--green-line)}
.btn-danger{background:#fff;color:var(--danger);border:2px solid #f0c8c2}
label{display:block;margin:14px 0 6px;font-weight:600}
input,select,textarea{width:100%;min-height:52px;font-size:18px;padding:12px;border:2px solid var(--green-line);
  border-radius:10px;background:#fff;color:var(--text);font-family:inherit}
textarea{min-height:88px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:3px solid var(--green-soft);border-color:var(--green)}
.tag{display:inline-block;background:var(--green-soft);color:var(--green-dark);border-radius:999px;
  padding:3px 12px;font-size:15px;margin:4px 6px 0 0}
.st-ongoing{background:#fff4e0;color:#8a5a00}
.st-recovered{background:var(--green-soft);color:var(--green-dark)}
.st-chronic{background:#e9eefb;color:#33478f}
.banner{background:#fff8e6;border:2px solid #f2d799;color:#7a5600;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:17px}
.banner.overdue{background:#f1f3f2;border-color:#d6dcd8;color:var(--muted)}
.section{margin:22px 0 10px;font-size:16px;color:var(--muted);letter-spacing:.05em}
.field-label{color:var(--muted);font-size:16px}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.thumbs img{width:100%;height:110px;object-fit:cover;border-radius:10px;border:2px solid var(--green-line)}
.pdf-thumb{display:flex;align-items:center;justify-content:center;height:110px;background:var(--green-soft);
  border-radius:10px;color:var(--green-dark);font-size:15px;text-align:center;padding:6px}
.msg{padding:12px 14px;border-radius:10px;margin:12px 0;font-size:17px}
.msg-error{background:#fdecea;color:var(--danger);border:2px solid #f5c6c0}
.msg-ok{background:var(--green-soft);color:var(--green-dark);border:2px solid var(--green-line)}
.muted{color:var(--muted)}
.empty{text-align:center;color:var(--muted);padding:36px 16px}
details>summary{min-height:52px;display:flex;align-items:center;font-size:19px;font-weight:600;
  color:var(--green-dark);cursor:pointer;padding:8px 0}
.med-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px}
.med-row .icon-btn{color:var(--danger);min-width:48px}
@media (prefers-color-scheme:dark){
  :root{--bg:#121815;--card:#1b241f;--text:#e8f0ea;--muted:#9fb3a8;--green-soft:#22332b;--green-line:#33473c}
  input,select,textarea{background:#141c18}
}
```

- [ ] **Step 3: 写 `js/router.js`**

```js
// js/router.js — hash 路由 + 登录守卫
import { getSession } from './db.js'

const routes = []
export function route(pattern, handler) { routes.push({ pattern, handler }) }

export function go(hash) {
  if (location.hash === hash) render()
  else location.hash = hash
}

export function setTitle(text, { back = false } = {}) {
  document.getElementById('page-title').textContent = text
  document.getElementById('back-btn').hidden = !back
}

export async function render() {
  const app = document.getElementById('app')
  const hash = location.hash.slice(1) || '/'
  const session = await getSession()
  if (!session) {
    document.getElementById('topbar').hidden = true
    const login = routes.find(r => r.pattern === '/login')
    return login.handler(app, [])
  }
  document.getElementById('topbar').hidden = false
  document.getElementById('logout-btn').hidden = false
  if (hash === '/login') return go('/')
  for (const { pattern, handler } of routes) {
    const keys = []
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$')
    const m = hash.match(re)
    if (m) {
      app.innerHTML = '<p class="empty">加载中…</p>'
      try { return await handler(app, m.slice(1)) }
      catch (e) {
        app.innerHTML = `<div class="msg msg-error">出错了：${e.message}</div>`
        return
      }
    }
  }
  app.innerHTML = '<div class="empty">页面不存在</div>'
}

window.addEventListener('hashchange', render)
```

- [ ] **Step 4: 写 `js/app.js`**

```js
// js/app.js — 入口：注册路由、绑定顶栏、注册 Service Worker
import { route, render, go } from './router.js'
import { logout } from './db.js'
import loginView from './views/login.js'
import homeView from './views/home.js'
import timelineView from './views/timeline.js'
import detailView from './views/detail.js'
import formView from './views/form.js'

route('/login', loginView)
route('/', homeView)
route('/member/:id', timelineView)
route('/record/:id', detailView)
route('/new', formView)
route('/new/:memberId', formView)
route('/edit/:recordId', formView)

document.getElementById('back-btn').addEventListener('click', () => history.back())
document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout(); go('/login'); render()
})

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))

render()
```

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/router.js js/app.js
git commit -m "feat: 应用外壳、药房绿适老化主题、hash 路由与登录守卫"
```

---

### Task 11: 登录页 + 成员门户首页（含复诊横幅）

**Files:**
- Create: `js/views/login.js`, `js/views/home.js`

- [ ] **Step 1: 写 `js/views/login.js`**

```js
// js/views/login.js — 邮箱密码登录；登录态由 Supabase 长期保持
import { login } from '../db.js'
import { render, go } from '../router.js'

export default function loginView(app) {
  app.innerHTML = `
    <h2 style="text-align:center;margin:28px 0 8px">家庭病例档案</h2>
    <p class="empty" style="padding:0 0 18px">请用自己的账号登录</p>
    <form id="login-form" class="card" style="cursor:default">
      <label for="email">邮箱</label>
      <input id="email" type="email" autocomplete="username" required>
      <label for="password">密码</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <button class="btn" type="submit">登 录</button>
      <div id="login-msg"></div>
    </form>`
  const form = app.querySelector('#login-form')
  const msg = app.querySelector('#login-msg')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button')
    btn.disabled = true; btn.textContent = '登录中…'; msg.innerHTML = ''
    try {
      await login(form.email.value.trim(), form.password.value)
      go('/'); await render()
    } catch (err) {
      const text = /Invalid login credentials/i.test(err.message)
        ? '邮箱或密码不对，请再试一次'
        : `登录失败：${err.message}（请检查网络）`
      msg.innerHTML = `<div class="msg msg-error">${text}</div>`
      btn.disabled = false; btn.textContent = '登 录'
    }
  })
}
```

- [ ] **Step 2: 写 `js/views/home.js`**

```js
// js/views/home.js — 成员门户首页：成员大卡片 + 近期复诊横幅 + 新增按钮
import { listMembers, latestRecordByMember, recordsWithFollowUp } from '../api.js'
import { escapeHtml, fmtDate, followUpKind } from '../utils.js'
import { setTitle, go } from '../router.js'

export default async function homeView(app) {
  setTitle('家庭病例档案')
  const [members, latest, followUps] = await Promise.all([
    listMembers(), latestRecordByMember(), recordsWithFollowUp(),
  ])

  const alerts = {}
  for (const r of followUps) {
    const kind = followUpKind(r.follow_up_on)
    if (kind) (alerts[r.member_id] ??= []).push({ ...r, kind })
  }

  app.innerHTML = `
    <button class="btn" id="new-btn">＋ 新增</button>
    ${members.map(m => {
      const rec = latest[m.id]
      const banners = (alerts[m.id] ?? []).map(a => `
        <div class="banner ${a.kind === 'overdue' ? 'overdue' : ''}">
          ${a.kind === 'overdue' ? '复诊日期已过' : '近期复诊'}：${fmtDate(a.follow_up_on)}
          ${a.department ? ' · ' + escapeHtml(a.department) : ''}（${escapeHtml(a.illness_name)}）
        </div>`).join('')
      return `${banners}
        <button class="card member-card" data-id="${m.id}">
          <span class="avatar">${escapeHtml(m.avatar)}</span>
          <span>
            <span class="name">${escapeHtml(m.display_name)}</span>
            ${m.role === 'admin' ? '<span class="tag">管理员</span>' : ''}
            <br><span class="sub">${rec
              ? `最近：${escapeHtml(rec.illness_name)} · ${fmtDate(rec.occurred_on)}`
              : '还没有记录'}</span>
          </span>
        </button>`
    }).join('')}
    ${members.length ? '' : '<div class="empty">还没有家庭成员，请先运行 scripts/create-users.mjs</div>'}`

  app.querySelector('#new-btn').addEventListener('click', () => go('/new'))
  app.querySelectorAll('.member-card').forEach(el =>
    el.addEventListener('click', () => go(`/member/${el.dataset.id}`)))
}
```

- [ ] **Step 3: 本地起服务并人工验证**

```bash
python3 -m http.server 5173
```

浏览器打开 http://localhost:5173 ，用你的管理员账号登录。
Expected: 登录成功后看到四张成员卡片（你的带「管理员」标签）、顶部「＋ 新增」按钮；控制台无报错。密码故意输错时显示「邮箱或密码不对，请再试一次」。

- [ ] **Step 4: Commit**

```bash
git add js/views/login.js js/views/home.js
git commit -m "feat: 登录页与成员门户首页（含近期复诊横幅）"
```

---

### Task 12: 成员时间线页

**Files:**
- Create: `js/views/timeline.js`

- [ ] **Step 1: 写 `js/views/timeline.js`**

```js
// js/views/timeline.js — 某成员的病历时间线（倒序卡片列表）
import { getMember, listRecords } from '../api.js'
import { escapeHtml, fmtDate, followUpKind, STATUS } from '../utils.js'
import { setTitle, go } from '../router.js'
import { canWrite } from '../db.js'

export default async function timelineView(app, [memberId]) {
  const [member, records, writable] = await Promise.all([
    getMember(memberId), listRecords(memberId), canWrite(memberId),
  ])
  setTitle(`${member.avatar} ${member.display_name}`, { back: true })

  app.innerHTML = `
    ${writable ? '<button class="btn" id="new-btn">＋ 新增</button>' : ''}
    ${records.length ? records.map(r => {
      const st = STATUS[r.status]
      const fu = followUpKind(r.follow_up_on)
      return `<button class="card" data-id="${r.id}">
        <div style="font-size:20px;font-weight:600">${escapeHtml(r.illness_name)}</div>
        <div class="field-label">${fmtDate(r.occurred_on)}${r.hospital ? ' · ' + escapeHtml(r.hospital) : ''}</div>
        <div>
          <span class="tag ${st.cls}">${st.label}</span>
          ${r.medications.length ? `<span class="tag">💊 用药 ${r.medications.length}</span>` : ''}
          ${r.attachments.length ? `<span class="tag">📎 附件 ${r.attachments.length}</span>` : ''}
          ${fu ? `<span class="tag ${fu === 'overdue' ? '' : 'st-ongoing'}">📅 复诊 ${fmtDate(r.follow_up_on)}</span>` : ''}
        </div>
      </button>`
    }).join('') : `<div class="empty">还没有病历记录${writable ? '，点上面的「＋ 新增」记第一条' : ''}</div>`}`

  app.querySelector('#new-btn')?.addEventListener('click', () => go(`/new/${memberId}`))
  app.querySelectorAll('.card[data-id]').forEach(el =>
    el.addEventListener('click', () => go(`/record/${el.dataset.id}`)))
}
```

- [ ] **Step 2: 人工验证**

在 http://localhost:5173 点任一成员卡片。
Expected: 进入该成员时间线；自己的页面有「＋ 新增」，别人的页面没有（管理员在所有人页面都有）；无记录时显示空态文案；顶栏出现返回箭头且可返回首页。

- [ ] **Step 3: Commit**

```bash
git add js/views/timeline.js
git commit -m "feat: 成员时间线页（状态/用药/附件/复诊标签，按权限显示新增）"
```

---

### Task 13: 新增/编辑表单（含附件上传）

**Files:**
- Create: `js/views/form.js`

适老化关键页：必填只有病名 + 日期，其余全部折叠。

- [ ] **Step 1: 写 `js/views/form.js`**

```js
// js/views/form.js — 新增/编辑病历。路由三形态：/new（选成员）、/new/:memberId、/edit/:recordId
import { listMembers, getRecord, createRecord, updateRecord, saveMedications,
         uploadAttachment, signedUrl, deleteAttachment } from '../api.js'
import { escapeHtml, STATUS } from '../utils.js'
import { setTitle, go, render } from '../router.js'
import { currentMember, canWrite } from '../db.js'
import { compressImage } from '../compress.js'

const today = () => new Date().toLocaleDateString('sv')  // sv 语言环境给出 YYYY-MM-DD

export default async function formView(app, params) {
  const hash = location.hash.slice(1)
  const editing = hash.startsWith('/edit/')
  const me = await currentMember()
  const record = editing ? await getRecord(params[0]) : null
  if (editing && !(await canWrite(record.member_id))) {
    app.innerHTML = '<div class="msg msg-error">你没有权限编辑这条记录</div>'
    return
  }
  const members = await listMembers()
  const defaultMember = record?.member_id ?? (hash.startsWith('/new/') ? params[0] : me.id)
  const canPickMember = !editing && me.role === 'admin'
  setTitle(editing ? '编辑病历' : '新增病历', { back: true })
  const v = (x) => escapeHtml(x ?? '')

  app.innerHTML = `
  <form id="rec-form" class="card" style="cursor:default">
    ${canPickMember ? `<label for="member_id">记给谁</label>
      <select id="member_id">${members.map(m =>
        `<option value="${m.id}"${m.id === defaultMember ? ' selected' : ''}>${escapeHtml(m.avatar + ' ' + m.display_name)}</option>`).join('')}</select>`
      : `<input type="hidden" id="member_id" value="${defaultMember}">`}

    <label for="illness_name">得了什么病 <span class="muted">（必填）</span></label>
    <input id="illness_name" required placeholder="如：感冒发烧 / 高血压" value="${v(record?.illness_name)}">

    <label for="occurred_on">哪一天 <span class="muted">（必填）</span></label>
    <input id="occurred_on" type="date" required value="${record?.occurred_on ?? today()}">

    <label for="files">拍照或选择图片 / PDF</label>
    <input id="files" type="file" accept="image/*,application/pdf" multiple>
    <div id="upload-status" class="muted"></div>
    <div id="existing-atts" class="thumbs" style="margin-top:10px"></div>

    <details ${editing ? 'open' : ''}>
      <summary>展开更多（诊断、用药、忌口、费用、复诊）</summary>

      <label for="status">现在情况</label>
      <select id="status">${Object.entries(STATUS).map(([k, s]) =>
        `<option value="${k}"${(record?.status ?? 'ongoing') === k ? ' selected' : ''}>${s.label}</option>`).join('')}</select>

      <label for="diagnosis">医生怎么说（诊断）</label>
      <textarea id="diagnosis">${v(record?.diagnosis)}</textarea>

      <label for="hospital">哪个医院</label>
      <input id="hospital" value="${v(record?.hospital)}">
      <label for="department">哪个科室</label>
      <input id="department" value="${v(record?.department)}">
      <label for="doctor_name">哪位医生</label>
      <input id="doctor_name" value="${v(record?.doctor_name)}">

      <div class="section">用药</div>
      <div id="meds"></div>
      <button type="button" class="btn btn-secondary" id="add-med">＋ 加一种药</button>

      <label for="cause">怎么得的（起因）</label>
      <textarea id="cause">${v(record?.cause)}</textarea>
      <label for="dietary_restrictions">要忌口什么</label>
      <textarea id="dietary_restrictions">${v(record?.dietary_restrictions)}</textarea>
      <label for="prevention">以后怎么预防</label>
      <textarea id="prevention">${v(record?.prevention)}</textarea>
      <label for="notes">其他备注</label>
      <textarea id="notes">${v(record?.notes)}</textarea>

      <label for="cost">花了多少钱（元）</label>
      <input id="cost" type="number" min="0" step="0.01" value="${record?.cost ?? ''}">
      <label for="insurance_note">医保/报销情况</label>
      <input id="insurance_note" value="${v(record?.insurance_note)}">
      <label for="follow_up_on">下次复诊日期</label>
      <input id="follow_up_on" type="date" value="${record?.follow_up_on ?? ''}">
    </details>

    <button class="btn" type="submit">保 存</button>
    <div id="form-msg"></div>
  </form>`

  // 用药行（编辑时预填已有用药）
  const medsBox = app.querySelector('#meds')
  const addMedRow = (m = {}) => {
    const row = document.createElement('div')
    row.className = 'med-row'
    row.innerHTML = `<input class="med-name" placeholder="药名" value="${escapeHtml(m.drug_name ?? '')}">
      <input class="med-dosage" placeholder="用法用量" value="${escapeHtml(m.dosage ?? '')}">
      <button type="button" class="icon-btn" aria-label="删除这一行">✕</button>`
    row.querySelector('button').addEventListener('click', () => row.remove())
    medsBox.append(row)
  }
  ;(record?.medications ?? []).forEach(addMedRow)
  app.querySelector('#add-med').addEventListener('click', () => addMedRow())

  // 已有附件：展示 + 删除
  const attBox = app.querySelector('#existing-atts')
  async function paintAtts() {
    const atts = record?.attachments ?? []
    attBox.innerHTML = ''
    for (const a of atts) {
      const wrap = document.createElement('div')
      if (a.file_type === 'image') {
        const url = await signedUrl(a.storage_path)
        wrap.innerHTML = `<img src="${url}" alt="附件">`
      } else wrap.innerHTML = '<div class="pdf-thumb">📄 PDF</div>'
      const del = document.createElement('button')
      del.type = 'button'; del.className = 'btn btn-danger'; del.style.minHeight = '40px'
      del.textContent = '删除'
      del.addEventListener('click', async () => {
        if (!confirm('确定删除这个附件吗？')) return
        await deleteAttachment(a)
        record.attachments = record.attachments.filter(x => x.id !== a.id)
        paintAtts()
      })
      wrap.append(del); attBox.append(wrap)
    }
  }
  if (editing) paintAtts()

  const form = app.querySelector('#rec-form')
  const msg = app.querySelector('#form-msg')
  const status = app.querySelector('#upload-status')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button[type=submit]')
    btn.disabled = true; btn.textContent = '保存中…'; msg.innerHTML = ''
    const num = (s) => (s === '' ? null : Number(s))
    const txt = (s) => (s.trim() === '' ? null : s.trim())
    const fields = {
      member_id: form.member_id.value,
      illness_name: form.illness_name.value.trim(),
      occurred_on: form.occurred_on.value,
      status: form.status.value,
      diagnosis: txt(form.diagnosis.value), hospital: txt(form.hospital.value),
      department: txt(form.department.value), doctor_name: txt(form.doctor_name.value),
      cause: txt(form.cause.value), dietary_restrictions: txt(form.dietary_restrictions.value),
      prevention: txt(form.prevention.value), notes: txt(form.notes.value),
      cost: num(form.cost.value), insurance_note: txt(form.insurance_note.value),
      follow_up_on: form.follow_up_on.value || null,
    }
    try {
      const saved = editing ? await updateRecord(record.id, fields) : await createRecord(fields)
      await saveMedications(saved.id, [...medsBox.querySelectorAll('.med-row')].map(r => ({
        drug_name: r.querySelector('.med-name').value,
        dosage: r.querySelector('.med-dosage').value,
      })))
      const files = [...form.files.files]
      for (const [i, file] of files.entries()) {
        status.textContent = `正在上传第 ${i + 1}/${files.length} 个附件…`
        const isPdf = file.type === 'application/pdf'
        if (isPdf && file.size > 20 * 1024 * 1024) throw new Error(`「${file.name}」超过 20MB，请压缩后再传`)
        const blob = isPdf ? file : await compressImage(file)
        await uploadAttachment(fields.member_id, saved.id, blob, isPdf ? 'pdf' : 'jpg', isPdf ? 'pdf' : 'image')
      }
      status.textContent = ''
      go(`/record/${saved.id}`); await render()
    } catch (err) {
      // 表单内容保留不丢：只提示错误，不清空、不跳转
      msg.innerHTML = `<div class="msg msg-error">保存失败：${escapeHtml(err.message)}<br>内容已保留，检查网络后可再点保存。</div>`
      status.textContent = ''
      btn.disabled = false; btn.textContent = '保 存'
    }
  })
}
```

- [ ] **Step 2: 人工验证最短路径（爸妈用法）**

在 http://localhost:5173 点「＋ 新增」→ 只填病名 → 选一张手机照片 → 保存。
Expected: 保存成功并跳到详情页；Supabase Dashboard → Storage → attachments 桶里出现 `<member_id>/<record_id>/xxx.jpg`，文件大小明显小于原图（压缩生效）；「展开更多」默认折叠。

- [ ] **Step 3: 人工验证完整字段与编辑**

再新增一条，展开更多，填诊断、两种用药、忌口、费用 128.5、复诊日期设为今天起 7 天后 → 保存 → 回首页。
Expected: 首页该成员卡片上方出现「近期复诊」黄色横幅；时间线卡片有 💊/📅 标签。再进编辑页，字段全部预填，改动后保存生效。

- [ ] **Step 4: Commit**

```bash
git add js/views/form.js
git commit -m "feat: 新增/编辑表单——两项必填、其余折叠、附件压缩上传、失败保留内容"
```

---

### Task 14: 病历详情页

**Files:**
- Create: `js/views/detail.js`

- [ ] **Step 1: 写 `js/views/detail.js`**

```js
// js/views/detail.js — 病历详情：分块展示 + 附件查看 + 按权限显示编辑/删除
import { getRecord, getMember, signedUrl, deleteRecord } from '../api.js'
import { escapeHtml, fmtDate, STATUS } from '../utils.js'
import { setTitle, go, render } from '../router.js'
import { canWrite } from '../db.js'

export default async function detailView(app, [recordId]) {
  const r = await getRecord(recordId)
  const [member, writable] = await Promise.all([getMember(r.member_id), canWrite(r.member_id)])
  setTitle('病历详情', { back: true })
  const st = STATUS[r.status]
  const block = (label, value) => value
    ? `<div style="margin:10px 0"><div class="field-label">${label}</div><div>${escapeHtml(value)}</div></div>` : ''

  app.innerHTML = `
    <div class="card" style="cursor:default">
      <div class="field-label">${escapeHtml(member.avatar + ' ' + member.display_name)}</div>
      <h2 style="margin:6px 0">${escapeHtml(r.illness_name)}</h2>
      <div class="field-label">${fmtDate(r.occurred_on)}</div>
      <div><span class="tag ${st.cls}">${st.label}</span>
        ${r.follow_up_on ? `<span class="tag st-ongoing">📅 复诊 ${fmtDate(r.follow_up_on)}</span>` : ''}</div>
    </div>

    ${r.diagnosis ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">医生诊断</div>
      <div>${escapeHtml(r.diagnosis)}</div>
      ${block('医院', r.hospital)}${block('科室', r.department)}${block('医生', r.doctor_name)}
    </div>` : (r.hospital || r.department || r.doctor_name ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">就诊信息</div>
      ${block('医院', r.hospital)}${block('科室', r.department)}${block('医生', r.doctor_name)}
    </div>` : '')}

    ${r.medications.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">用药</div>
      ${r.medications.map(m => `<div style="margin:8px 0">💊 <b>${escapeHtml(m.drug_name)}</b>
        ${m.dosage ? `<span class="muted"> · ${escapeHtml(m.dosage)}</span>` : ''}</div>`).join('')}
    </div>` : ''}

    ${(r.cause || r.dietary_restrictions || r.prevention || r.notes) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">病情说明</div>
      ${block('起因', r.cause)}${block('忌口', r.dietary_restrictions)}
      ${block('预防注意', r.prevention)}${block('其他备注', r.notes)}
    </div>` : ''}

    ${(r.cost != null || r.insurance_note) ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">费用</div>
      ${r.cost != null ? block('花费', `¥${r.cost}`) : ''}${block('医保/报销', r.insurance_note)}
    </div>` : ''}

    ${r.attachments.length ? `<div class="card" style="cursor:default">
      <div class="section" style="margin-top:0">附件（${r.attachments.length}）</div>
      <div class="thumbs" id="atts"></div>
    </div>` : ''}

    ${writable ? `<button class="btn btn-secondary" id="edit-btn">编辑这条记录</button>
      <button class="btn btn-danger" id="del-btn">删除这条记录</button>` : ''}`

  const attsBox = app.querySelector('#atts')
  if (attsBox) for (const a of r.attachments) {
    const url = await signedUrl(a.storage_path)
    const link = document.createElement('a')
    link.href = url; link.target = '_blank'; link.rel = 'noopener'
    link.innerHTML = a.file_type === 'image'
      ? `<img src="${url}" alt="附件">`
      : '<div class="pdf-thumb">📄 PDF<br>点击查看</div>'
    attsBox.append(link)
  }

  app.querySelector('#edit-btn')?.addEventListener('click', () => go(`/edit/${r.id}`))
  app.querySelector('#del-btn')?.addEventListener('click', async () => {
    if (!confirm('确定删除这条病历吗？附件也会一起删除，无法恢复。')) return
    try {
      await deleteRecord(r)
      go(`/member/${r.member_id}`); await render()
    } catch (e) {
      alert(`删除失败：${e.message}`)
    }
  })
}
```

- [ ] **Step 2: 人工验证**

打开一条完整记录的详情页。
Expected: 诊断/用药/病情说明/费用/附件分块展示，空字段整块不出现；点图片附件在新标签打开原图（签名链接可访问）；自己的记录有编辑+删除按钮，别人的没有（管理员都有）；删除时弹出二次确认，取消则不删。

- [ ] **Step 3: 验证越权路径被拦截**

复制别人一条记录的地址 `#/edit/<recordId>`，用非管理员账号直接访问（换浏览器隐私窗口登录 mom 账号试）。
Expected: 显示「你没有权限编辑这条记录」；即使绕过界面直接 PATCH，RLS 也会拒绝（已由 Task 4 测试覆盖）。

- [ ] **Step 4: Commit**

```bash
git add js/views/detail.js
git commit -m "feat: 病历详情页——分块展示、附件签名链接、按权限编辑删除"
```

---

### Task 15: PWA（清单、图标、Service Worker）

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon.svg`, `icons/icon-180.png`, `icons/icon-512.png`

- [ ] **Step 1: 写 `manifest.webmanifest`**

```json
{
  "name": "家庭病例档案",
  "short_name": "家庭病例",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f7faf8",
  "theme_color": "#3a7d5c",
  "lang": "zh-CN",
  "icons": [
    { "src": "icons/icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: 写 `icons/icon.svg` 并转成 PNG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#3a7d5c"/>
  <rect x="150" y="120" width="212" height="272" rx="24" fill="#ffffff"/>
  <rect x="214" y="96" width="84" height="48" rx="16" fill="#e8f3ed"/>
  <rect x="236" y="196" width="40" height="140" rx="12" fill="#3a7d5c"/>
  <rect x="186" y="246" width="140" height="40" rx="12" fill="#3a7d5c"/>
</svg>
```

```bash
sips -s format png --resampleHeightWidth 512 512 icons/icon.svg --out icons/icon-512.png
sips -s format png --resampleHeightWidth 180 180 icons/icon.svg --out icons/icon-180.png
ls -la icons/
```

Expected: 两个 PNG 生成成功。（sips 不支持 SVG 时的备选：用 `qlmanage -t` 或在浏览器里截图另存，属人工步骤。）

- [ ] **Step 3: 写 `sw.js`（只缓存应用外壳，数据请求一律走网络）**

```js
// sw.js — 缓存应用外壳，让断网也能打开界面（看到明确的网络提示）；数据与文件请求不缓存
const CACHE = 'fhr-v1'
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'vendor/supabase.js', 'js/app.js', 'js/router.js', 'js/db.js', 'js/api.js',
  'js/utils.js', 'js/config.js', 'js/compress.js',
  'js/views/login.js', 'js/views/home.js', 'js/views/timeline.js',
  'js/views/detail.js', 'js/views/form.js', 'icons/icon-180.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return  // Supabase 请求不拦截
  e.respondWith(
    fetch(e.request)
      .then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res.clone()
      })
      .catch(() => caches.match(e.request).then(hit => hit ?? caches.match('index.html')))
  )
})
```

- [ ] **Step 4: 本地验证 PWA 可安装**

在 http://localhost:5173 打开 Chrome DevTools → Application。
Expected: Manifest 无错误、图标正常显示；Service Workers 显示 activated；Cache Storage 里有 `fhr-v1` 且包含 shell 文件。

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest sw.js icons/
git commit -m "feat: PWA——清单、药房绿图标、应用外壳 Service Worker"
```

---

### Task 16: 部署到 GitHub Pages

**Files:** 无新文件（仓库设置 + 推送）

- [ ] **Step 1: 创建远端仓库并推送**

```bash
cd /Users/chuchu/Documents/Project/family-health-record
git status --short          # 必须干净，且 .env.local / family.local.json 未被跟踪
gh repo create family-health-record --private --source=. --remote=origin --push
```

Expected: 仓库创建成功并推送。**私有仓库**——虽然代码不含密钥，私有减少一层暴露面。

⚠️ 私有仓库的 GitHub Pages 需要付费方案。若 `gh repo view --json visibility` 为 private 且下一步 Pages 报错要求升级，改为公开：`gh repo edit --visibility public --accept-visibility-change-consequences`。代码公开是安全的（无密钥，隐私靠登录+RLS），这也是 spec 里的既定设计。

- [ ] **Step 2: 开启 Pages**

```bash
gh api -X POST repos/:owner/family-health-record/pages -f source.branch=main -f source.path=/ 2>/dev/null \
  || gh api -X PUT repos/:owner/family-health-record/pages -f source.branch=main -f source.path=/
gh api repos/:owner/family-health-record/pages --jq '.html_url, .status'
```

Expected: 输出站点 URL（形如 `https://chuchu-tian.github.io/family-health-record/`）和 built 状态（首次可能需等 1-2 分钟）。

- [ ] **Step 3: 线上冒烟验证**

```bash
SITE=$(gh api repos/:owner/family-health-record/pages --jq .html_url)
curl -sI "$SITE" | head -3
curl -s "$SITE" | grep -q "家庭病例档案" && echo "首页 OK"
```

浏览器打开该 URL，登录、看首页、进一条记录详情、看一张附件图。
Expected: 全部正常（HTTPS 由 Pages 提供，PWA 安装条件满足）。

- [ ] **Step 4: Commit（如有 README 等改动）**

```bash
git add -A && git commit -m "chore: 部署上线到 GitHub Pages" --allow-empty
git push
```

---

### Task 17: 上线安全自查（隐私底线复核）

**Files:** 无

- [ ] **Step 1: 重跑全部自动化测试**

```bash
node --test tests/utils.test.mjs
node --env-file=.env.local --test tests/rls.test.mjs
```

Expected: 两个测试文件全部 PASS。任何失败必须先修复。

- [ ] **Step 2: 未登录直连数据库接口，必须被拒**

```bash
source .env.local
echo "--- 无 key:"; curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/rest/v1/records?select=*"
echo "--- 仅 anon key:"; curl -s "$SUPABASE_URL/rest/v1/records?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
echo "--- members 表:"; curl -s "$SUPABASE_URL/rest/v1/members?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: 无 key 返回 401；仅 anon key 两次均返回 `[]`（空数组，不是数据）。若返回任何真实数据，**立即停止并修复 RLS**。

- [ ] **Step 3: 未登录直取存储文件，必须被拒**

```bash
source .env.local
P=$(curl -s "$SUPABASE_URL/rest/v1/attachments?select=storage_path&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['storage_path'] if d else '')")
echo "测试路径: $P"
curl -s -o /dev/null -w "公开URL: %{http_code}\n" "$SUPABASE_URL/storage/v1/object/public/attachments/$P"
curl -s -o /dev/null -w "anon 认证URL: %{http_code}\n" "$SUPABASE_URL/storage/v1/object/attachments/$P" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: 两个都是 4xx（400/401/403/404），绝不能是 200。

- [ ] **Step 4: 确认仓库里没有任何密钥**

```bash
git ls-files | grep -E "env.local|family.local" && echo "⚠️ 危险：密钥文件被跟踪了" || echo "OK: 无密钥文件"
git grep -nE "service_role|SERVICE_KEY|sk-|jdcloud" -- . ':!docs' ':!.env.example' && echo "⚠️ 检查上面命中" || echo "OK: 无密钥字符串"
git log --all --stat | grep -E "env.local|family.local" && echo "⚠️ 历史提交里有密钥文件" || echo "OK: 历史干净"
```

Expected: 三项都是 OK。（若历史里有密钥，需 `git filter-repo` 清理并轮换密钥——高风险操作，先向用户报告。）

- [ ] **Step 5: 记录自查结果**

把四步的实际输出贴给用户确认，不要只说「已检查」。

---

### Task 18: 交付文档与真机验收

**Files:**
- Create: `docs/USAGE.md`, `docs/DEVELOPING.md`

- [ ] **Step 1: 写 `docs/USAGE.md`（给家人看，无代码）**

内容必须包含：
1. **打开方式**——站点网址；iPhone Safari「分享 → 添加到主屏幕」步骤；安卓 Chrome「菜单 → 添加到主屏幕」；Windows 直接用浏览器收藏。
2. **登录**——各人用自己的邮箱和密码，一次登录长期有效；忘记密码找管理员重置。
3. **爸妈版超简教程（三步记一条病历）**——① 点绿色「＋ 新增」；② 填「得了什么病」和日期（日期默认今天，不用改）；③ 点「拍照或选择图片」拍下化验单/病历本，点「保 存」。就完事了，其他都不用填。
4. **看别人的病历**——首页点谁的头像看谁的；只能改自己的，管理员可以帮全家改。
5. **复诊提醒**——填了「下次复诊日期」，首页会在 14 天内提醒；这是打开应用才看到的提醒，不会发手机通知。
6. **隐私说明**——必须登录才能看，任何人拿到网址但没有账号密码都看不到任何内容。
7. **常见问题**——照片传不上去（检查网络，重新点保存，内容不会丢）；PDF 最大 20MB；删除不可恢复。

- [ ] **Step 2: 写 `docs/DEVELOPING.md`（给开发者/未来的你）**

内容必须包含：
1. **架构概览**——静态前端（GitHub Pages）+ Supabase（Auth/Postgres/Storage），指向 spec 文件路径。
2. **本地开发**——`python3 -m http.server 5173`；为什么不需要构建步骤（原生 ES Modules）。
3. **环境变量**——`.env.example` 各项含义；anon key 可公开 vs service key 绝不可提交的区别。
4. **数据库迁移**——`psql "$SUPABASE_DB_URL" -f supabase/migrations/00X_*.sql`；迁移按序号累加，不改已应用的文件。
5. **账号管理**——`node --env-file=.env.local scripts/create-users.mjs`（幂等）；改角色为管理员的 SQL：`update members set role='admin' where display_name='阿伟';`。
6. **测试**——`node --test tests/utils.test.mjs`（纯函数）、`node --env-file=.env.local --test tests/rls.test.mjs`（权限边界，改动 RLS 后必跑）。
7. **部署**——推 main 即自动发布；`sw.js` 里的 `CACHE` 版本号在改前端文件后要 +1，否则家人拿到旧缓存。
8. **M2/M3 接入点**——AI 识别走 Edge Function（京东云 Claude 网关，token 存 Supabase Secrets，前端永不接触）；metrics 表在 M2 迁移中创建；搜索在 M2 上线后放开首页搜索框。

- [ ] **Step 3: 真机验收清单（逐项在真实设备上勾）**

- [ ] iPhone（Safari）：登录 → 添加到主屏幕 → 从图标启动 → 新增一条带照片记录 → 查看
- [ ] 安卓手机：登录 → 添加到主屏幕 → 新增带照片记录 → 查看
- [ ] Windows 浏览器：登录 → 查看全家记录 → 编辑自己的记录
- [ ] Mac 浏览器：管理员登录 → 替爸爸新增一条记录（「记给谁」下拉可选）→ 编辑妈妈的记录成功
- [ ] 权限：用妈妈账号登录，爸爸的记录详情页**没有**编辑/删除按钮
- [ ] 复诊提醒：填 7 天后复诊 → 首页出现黄色「近期复诊」横幅
- [ ] 断网：飞行模式下从图标启动，界面能打开；点保存显示网络错误提示且**表单内容不丢**
- [ ] 父母独立操作：请爸妈自己完成「新增 → 病名 → 拍照 → 保存」，不给提示。**这是 spec 的核心验收标准**，如果卡住，记录卡在哪一步并简化该处

- [ ] **Step 4: Commit**

```bash
git add docs/USAGE.md docs/DEVELOPING.md
git commit -m "docs: 使用手册（含父母版超简教程）与开发指南"
git push
```

- [ ] **Step 5: 向用户汇报 M1 完成**

汇报内容：站点网址、四人账号已建、安全自查四项实际输出、真机验收清单结果（哪些已勾、哪些待家人配合）、以及爸妈实测中发现的问题。**未经真机验收不得声称 M1 完成。**

---

## M2 / M3 预览（本计划不实施，验收 M1 后各自单独立计划）

**M2 · AI 识别 + 搜索**：`supabase/functions/extract/index.ts`（Deno Edge Function，调京东云 Claude 网关，token 存 Supabase Secrets）、`003_metrics.sql`（metrics 表 + RLS）、`js/views/review.js`（识别核对页）、`js/views/search.js` + 首页放开搜索框。

**M3 · 指标趋势**：`js/views/metrics.js`（成员页「健康指标」标签，SVG 折线图，正常范围底色，异常点高亮）。

---

## 计划自审记录

**Spec 覆盖核对**（spec 各节 → 对应任务）：
- 登录/账号统一创建 → Task 3、11 ｜ 成员门户首页 → Task 11 ｜ 时间线 → Task 12
- 病历字段（含描述栏/就诊/费用医保/复诊）→ Task 2、13 ｜ 用药 → Task 2、13
- 附件上传压缩/查看/删除 → Task 8、9、13、14 ｜ 权限（成员/管理员）→ Task 5（RLS）+ 界面显隐
- 药房绿 UI + 适老化（18px/48px）→ Task 10 ｜ PWA → Task 15 ｜ 部署 → Task 16
- 错误处理：网络失败保留表单（Task 13）、大文件限制（Task 13）、误删二次确认（Task 14）、忘记密码（Task 18 文档）
- 测试策略：RLS 自动化（Task 4-5）、纯函数单测（Task 6）、真机清单（Task 18）、安全自查（Task 17）
- 交付文档 → Task 18 ｜ 不含 M2/M3 内容（AI 识别、搜索、metrics、趋势图均已排除）

**类型/命名一致性核对**：`current_member_id()`/`is_admin()`/`can_write_member()`/`can_write_record()` 在 002 中定义并被各策略引用；`canWrite(memberId)` 前端命名统一；`followUpKind` 在 utils/home/timeline 用法一致；`STATUS` 三键与数据库 check 约束一致；`storage_path` 首段为 member_id，与 Storage 策略 `foldername(name)[1]` 匹配。

**已知人工依赖**（无法自动化，需用户配合）：Task 0 建 Supabase 项目取密钥；Task 15 图标转 PNG 的 sips 备选；Task 16 仓库可见性选择；Task 18 家人真机测试。

