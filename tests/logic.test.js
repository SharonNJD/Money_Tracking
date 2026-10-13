import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  budgetLevel,
  budgetStatuses,
  checkinDate,
  defaultState,
  dueWeekEnd,
  escalations,
  isISODate,
  monthEndFor,
  normalizeState,
  parseAmount,
  pendingCheckins,
  periodRange,
  periodSeries,
  shiftPeriod,
  sumExpenses,
  toCSV,
  totalsByCategory,
  weekEndFor,
  weekStartFor,
} from '../js/logic.js';

// 2026-10-16 is a Friday.
const FRI = '2026-10-16';

function stateWith(expenses = [], tweak = (s) => s) {
  const s = defaultState({ today: '2026-10-01', currency: 'USD' });
  s.categories[0].id = 'food';
  s.categories[1].id = 'out';
  s.expenses = expenses.map((e, i) => ({ id: `e${i}`, note: '', source: 'single', createdAt: `t${i}`, ...e }));
  return tweak(s);
}

test('weeks run Saturday to Friday', () => {
  assert.equal(weekEndFor('2026-10-10'), FRI); // Saturday
  assert.equal(weekEndFor('2026-10-13'), FRI); // Tuesday
  assert.equal(weekEndFor(FRI), FRI);
  assert.equal(weekEndFor('2026-10-17'), '2026-10-23'); // next Saturday starts a new week
  assert.equal(weekStartFor('2026-10-13'), '2026-10-10');
});

test('date helpers cross month, year and DST boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(monthEndFor('2028-02-10'), '2028-02-29');
  assert.equal(monthEndFor('2026-12-05'), '2026-12-31');
  assert.deepEqual(periodRange('month', '2026-10-13'), { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(shiftPeriod('month', '2026-01-31', -1), '2025-12-01');
  assert.equal(shiftPeriod('week', '2026-10-13', -1), '2026-10-09');
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.ok(!isISODate('yesterday'));
});

test('parseAmount understands phone keypad input', () => {
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('.99'), 99);
  assert.equal(parseAmount('12.'), 1200);
  assert.equal(parseAmount('1,500'), 150000);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('₪ 40'), 4000);
  assert.equal(parseAmount('$0'), 0);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.2.3,456'), null);
  assert.equal(parseAmount(19.99), 1999);
});

test('sums and per-category totals respect the date range', () => {
  const s = stateWith([
    { categoryId: 'food', amountCents: 1000, date: '2026-10-09' },
    { categoryId: 'food', amountCents: 2500, date: '2026-10-10' },
    { categoryId: 'out', amountCents: 4000, date: FRI },
  ]);
  const week = periodRange('week', FRI);
  assert.equal(sumExpenses(s.expenses, week), 6500);
  assert.equal(sumExpenses(s.expenses, { ...week, categoryId: 'food' }), 2500);
  assert.deepEqual([...totalsByCategory(s.expenses, week)], [['food', 2500], ['out', 4000]]);
});

test('periodSeries returns oldest-first totals ending at the current period', () => {
  const s = stateWith([
    { categoryId: 'food', amountCents: 1000, date: '2026-10-02' },
    { categoryId: 'food', amountCents: 300, date: FRI },
  ]);
  const series = periodSeries(s.expenses, { period: 'week', count: 3, refISO: '2026-10-13' });
  assert.deepEqual(
    series.map((p) => [p.end, p.cents]),
    [['2026-10-02', 1000], ['2026-10-09', 0], [FRI, 300]],
  );
});

test('budget levels: ok, warn at the threshold, over at 100%', () => {
  assert.equal(budgetLevel(7900, 10000, 0.8), 'ok');
  assert.equal(budgetLevel(8000, 10000, 0.8), 'warn');
  assert.equal(budgetLevel(10000, 10000, 0.8), 'over');
  assert.equal(budgetLevel(5000, 0, 0.8), 'ok');
});

test('budgetStatuses covers category and overall budgets, with previews', () => {
  const s = stateWith(
    [
      { categoryId: 'food', amountCents: 30000, date: '2026-10-03' },
      { categoryId: 'out', amountCents: 9000, date: '2026-10-12' },
    ],
    (st) => {
      st.categories[0].budget = { amountCents: 40000, period: 'month' };
      st.categories[1].budget = { amountCents: 10000, period: 'week' };
      st.settings.totalBudget = { amountCents: 100000, period: 'month' };
      return st;
    },
  );
  const now = budgetStatuses(s, FRI);
  const byKey = Object.fromEntries(now.map((x) => [x.key, x]));
  assert.equal(byKey.food.level, 'ok'); // 75%
  assert.equal(byKey.out.level, 'warn'); // 90%
  assert.equal(byKey.total.spentCents, 39000);
  assert.equal(byKey.out.start, '2026-10-10');

  const preview = budgetStatuses(s, FRI, new Map([['food', 2000], ['out', 1500]]));
  const raised = escalations(now, preview).map((x) => x.key);
  assert.deepEqual(raised, ['food', 'out']); // 80% → warn, 105% → over
  assert.equal(preview.find((x) => x.key === 'out').remainingCents, -500);
  assert.equal(preview.find((x) => x.key === 'total').spentCents, 42500);
});

test('archived categories have no budget status', () => {
  const s = stateWith([], (st) => {
    st.categories[0].budget = { amountCents: 100, period: 'week' };
    st.categories[0].archived = true;
    return st;
  });
  assert.equal(budgetStatuses(s, FRI).length, 0);
});

test('check-ins are due each Friday and missed weeks are listed', () => {
  assert.equal(dueWeekEnd(FRI), FRI);
  assert.equal(dueWeekEnd('2026-10-15'), '2026-10-09');
  assert.equal(dueWeekEnd('2026-10-17'), FRI);

  const s = stateWith([], (st) => ({ ...st, createdAt: '2026-09-30' }));
  assert.deepEqual(pendingCheckins(s, '2026-10-15'), ['2026-10-09', '2026-10-02']);
  s.checkins['2026-10-09'] = 'done';
  assert.deepEqual(pendingCheckins(s, FRI), [FRI, '2026-10-02']);
  // Nothing is due before the first Friday after setup.
  assert.deepEqual(pendingCheckins({ ...s, createdAt: '2026-10-13' }, '2026-10-14'), []);

  assert.equal(checkinDate(FRI, '2026-10-20'), FRI);
  assert.equal(checkinDate(FRI, '2026-10-14'), '2026-10-14');
});

test('normalizeState accepts a round trip and rejects broken backups', () => {
  const s = stateWith([{ categoryId: 'food', amountCents: 1234, date: FRI }], (st) => {
    st.categories[0].budget = { amountCents: 5000, period: 'week' };
    st.checkins[FRI] = '2026-10-16T18:00:00.000Z';
    return st;
  });
  const copy = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(copy, s);

  assert.throws(() => normalizeState(null), /not a Money Tracker backup/);
  assert.throws(() => normalizeState({ categories: [] }), /missing/);
  assert.throws(
    () => normalizeState({ ...s, expenses: [{ categoryId: 'nope', amountCents: 1, date: FRI }] }),
    /Expense #1/,
  );
  const fixed = normalizeState({ ...s, settings: { currency: 'bad', warnAt: 7 } });
  assert.equal(fixed.settings.currency, 'USD');
  assert.equal(fixed.settings.warnAt, 0.8);
});

test('CSV export quotes text and neutralises formulas', () => {
  const s = stateWith([
    { categoryId: 'food', amountCents: 1250, date: FRI, note: 'milk, eggs' },
    { categoryId: 'out', amountCents: 99, date: '2026-10-10', note: '=HYPERLINK("x")', source: 'checkin' },
  ]);
  const lines = toCSV(s).split('\r\n');
  assert.equal(lines[0], 'Date,Category,Amount,Currency,Note,Type');
  assert.equal(lines[1], `2026-10-10,Eating out,0.99,USD,"'=HYPERLINK(""x"")",Weekly check-in`);
  assert.equal(lines[2], `${FRI},Groceries,12.50,USD,"milk, eggs",Expense`);
});
