// js/router.js — hash 路由 + 登录守卫 + 云端未配置引导
import { getSession } from './db.js'
import { CLOUD_READY } from './config.js'

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
  if (!CLOUD_READY()) {
    document.getElementById('topbar').hidden = true
    const setup = routes.find(r => r.pattern === '/setup')
    return setup.handler(app, [])
  }
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
        app.innerHTML = `<div class="msg msg-error">出错了：${e.message}<br>请检查网络后刷新重试。</div>`
        return
      }
    }
  }
  app.innerHTML = '<div class="empty">页面不存在</div>'
}

window.addEventListener('hashchange', render)
