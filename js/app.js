// js/app.js — 入口：注册路由、绑定顶栏、注册 Service Worker
import { route, render, go } from './router.js'
import { logout } from './db.js'
import setupView from './views/setup.js'
import loginView from './views/login.js'
import homeView from './views/home.js'
import timelineView from './views/timeline.js'
import detailView from './views/detail.js'
import formView from './views/form.js'

route('/setup', setupView)
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
