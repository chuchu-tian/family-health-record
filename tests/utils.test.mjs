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
