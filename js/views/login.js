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
