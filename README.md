# 家庭病例档案 Family Health Record

全家人的健康记录本（PWA）：谁生了病、医生诊断、用药、化验单照片/PDF，登录后全家互查，只有本人（和管理员）能改。

**站点**：https://chuchu-tian.github.io/family-health-record/

| 文档 | 给谁看 |
|---|---|
| [使用手册](docs/USAGE.md) | 全家人（含爸妈三步教程、添加到主屏幕） |
| [云端开通指南](docs/SETUP-CLOUD.md) | 管理员（一次性，约 10 分钟） |
| [开发指南](docs/DEVELOPING.md) | 开发者（架构/迁移/测试/部署/M2 M3 路线） |

技术：纯 HTML/CSS/JS PWA（无构建）+ Supabase（Auth / Postgres+RLS / 私有 Storage）+ GitHub Pages。仓库公开但不含任何密钥；隐私由登录 + 行级安全策略保护。
