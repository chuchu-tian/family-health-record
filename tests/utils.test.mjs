// tests/utils.test.mjs — 运行: node --test tests/utils.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtDate, followUpKind, escapeHtml, escapeLike, isAbnormal, METRIC_LABELS, STATUS } from '../js/utils.js'

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

// escapeLike：ilike 通配符与 PostgREST 引号值的转义（搜索正确性依赖它）
test('escapeLike: 普通中文原样通过', () => assert.equal(escapeLike('血糖'), '血糖'))
test('escapeLike: % 被转义（否则搜「100%」会变成任意匹配）', () =>
  assert.equal(escapeLike('100%'), '100\\%'))
test('escapeLike: _ 被转义（否则会命中任意单字符）', () =>
  assert.equal(escapeLike('a_b'), 'a\\_b'))
test('escapeLike: 双引号被转义（否则截断 or= 的引号值）', () =>
  assert.equal(escapeLike('他说"好"'), '他说\\"好\\"'))
test('escapeLike: 反斜杠先转义，不产生二次转义错乱', () =>
  assert.equal(escapeLike('a\\b'), 'a\\\\b'))
test('escapeLike: 空值安全', () => assert.equal(escapeLike(null), ''))

// isAbnormal：M3 异常判定（趋势图高亮与列表 ⚠️ 都依赖它）
test('isAbnormal: 超出参考范围上限为异常', () =>
  assert.equal(isAbnormal({ value: 160 }, METRIC_LABELS.blood_pressure_systolic), true))
test('isAbnormal: 低于参考范围下限为异常', () =>
  assert.equal(isAbnormal({ value: 80 }, METRIC_LABELS.blood_pressure_systolic), true))
test('isAbnormal: 范围内为正常', () =>
  assert.equal(isAbnormal({ value: 120 }, METRIC_LABELS.blood_pressure_systolic), false))
test('isAbnormal: 边界值算正常（含端点）', () => {
  assert.equal(isAbnormal({ value: 139 }, METRIC_LABELS.blood_pressure_systolic), false)
  assert.equal(isAbnormal({ value: 90 }, METRIC_LABELS.blood_pressure_systolic), false)
})
test('isAbnormal: 无参考范围的指标（体重）不判异常', () =>
  assert.equal(isAbnormal({ value: 999 }, METRIC_LABELS.weight), false))
test('isAbnormal: 已标 is_abnormal 的优先为异常（尊重化验单自带范围）', () =>
  assert.equal(isAbnormal({ value: 120, is_abnormal: true }, METRIC_LABELS.blood_pressure_systolic), true))
test('isAbnormal: 字符串数值也能比较（Postgres numeric 返回字符串）', () =>
  assert.equal(isAbnormal({ value: '7.2' }, METRIC_LABELS.blood_glucose), true))
test('每个指标的参考范围都是 下限<上限', () => {
  for (const [key, meta] of Object.entries(METRIC_LABELS)) {
    if (meta.range) assert.ok(meta.range[0] < meta.range[1], `${key} 范围颠倒`)
  }
})
