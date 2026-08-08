// js/views/setup.js — 云端尚未开通时的引导页（js/config.js 填好后自动消失）
export default function setupView(app) {
  app.innerHTML = `
    <h2 style="text-align:center;margin:28px 0 8px">🏥 家庭病例档案</h2>
    <div class="card" style="cursor:default">
      <p><b>云端还没开通</b>，应用暂时无法使用。</p>
      <p>管理员请按仓库里的 <b>docs/SETUP-CLOUD.md</b> 完成四步设置（约 10 分钟）：</p>
      <ol style="padding-left:22px">
        <li>创建 Supabase 项目（免费）</li>
        <li>填写 .env.local 并应用数据库迁移</li>
        <li>运行脚本创建家庭账号</li>
        <li>把项目地址填进 js/config.js 并重新发布</li>
      </ol>
      <p class="muted">家人看到这个页面：说明网站还在准备中，请等管理员通知。</p>
    </div>`
}
