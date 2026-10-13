import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  applyRecurring,
  budgetLevel,
  budgetStatuses,
  checkinDate,
  checkinStreak,
  daysBetween,
  defaultState,
  dueWeekEnd,
  escalations,
  goalProgress,
  isISODate,
  monthEndFor,
  nextOccurrence,
  normalizeState,
  occurrencesBetween,
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

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-10-13', FRI), 3);
  assert.equal(daysBetween(FRI, '2026-10-13'), -3);
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
});

test('check-in streak counts consecutive logged weeks with a grace week', () => {
  const s = stateWith();
  s.checkins = { '2026-09-25': 'x', '2026-10-02': 'x', '2026-10-09': 'x' };
  assert.equal(checkinStreak(s, '2026-10-13'), 3); // week ending 9 Oct is the latest due
  assert.equal(checkinStreak(s, FRI), 3); // today's check-in not done yet: still 3
  assert.equal(checkinStreak(s, '2026-10-20'), 3); // 16 Oct missed but 23 Oct not due yet
  assert.equal(checkinStreak(s, '2026-10-24'), 0); // two Fridays missed
  s.checkins[FRI] = 'x';
  assert.equal(checkinStreak(s, FRI), 4);
  delete s.checkins['2026-10-02'];
  assert.equal(checkinStreak(s, FRI), 2);
});

test('recurring payments: monthly clamps to month end, weekly on a weekday', () => {
  const rent = { frequency: 'month', day: 31 };
  assert.deepEqual(occurrencesBetween(rent, '2026-01-15', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const gym = { frequency: 'week', day: 1 }; // Mondays
  assert.deepEqual(occurrencesBetween(gym, '2026-10-01', '2026-10-20'), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(occurrencesBetween(gym, '2026-10-20', '2026-10-01'), []);
});

test('applyRecurring adds each due payment once, from the start date on', () => {
  const s = stateWith();
  s.recurring = [
    { id: 'r1', name: 'Netflix', categoryId: 'out', amountCents: 4990, frequency: 'month', day: 5, startDate: '2026-08-10', lastAdded: null, active: true },
    { id: 'r2', name: 'Paused', categoryId: 'out', amountCents: 100, frequency: 'month', day: 1, startDate: '2026-01-01', lastAdded: null, active: false },
  ];
  const added = applyRecurring(s, '2026-10-13', 'now');
  assert.deepEqual(added.map((a) => a.date), ['2026-09-05', '2026-10-05']); // not Aug 5: before the start date
  assert.equal(s.recurring[0].lastAdded, '2026-10-05');
  assert.equal(s.expenses.length, 2);
  assert.equal(s.expenses[0].source, 'recurring');
  assert.equal(s.expenses[0].note, 'Netflix');
  assert.equal(applyRecurring(s, '2026-10-13').length, 0); // idempotent
  assert.equal(nextOccurrence(s.recurring[0], '2026-10-13'), '2026-11-05');
  assert.equal(nextOccurrence({ ...s.recurring[0], lastAdded: null, startDate: '2026-10-13' }, '2026-10-13'), '2026-11-05');
});

test('goal progress: saved, remaining and weekly amount needed', () => {
  const goal = { targetCents: 500000, deadline: '2026-12-31', deposits: [{ cents: 100000 }, { cents: 50000 }, { cents: -20000 }] };
  const p = goalProgress(goal, '2026-10-13');
  assert.equal(p.savedCents, 130000);
  assert.equal(p.remainingCents, 370000);
  assert.equal(p.weeksLeft, 12);
  assert.equal(p.perWeekCents, 30900); // 3083.33 rounded up to whole units
  assert.ok(!p.reached);
  assert.ok(goalProgress({ ...goal, deadline: '2026-10-01' }, '2026-10-13').overdue);
  assert.ok(goalProgress({ ...goal, deposits: [{ cents: 500000 }] }, '2026-10-13').reached);
});

test('normalizeState keeps valid rules, recurring and goals and drops broken ones', () => {
  const s = stateWith();
  s.rules = [{ id: 'a', pattern: 'Starbucks', categoryId: 'out' }, { pattern: 'x', categoryId: 'out' }, { pattern: 'shell', categoryId: 'gone' }];
  s.recurring = [
    { id: 'r', name: 'Rent', categoryId: 'food', amountCents: 300000, frequency: 'month', day: 1, startDate: '2026-10-01', lastAdded: null, active: true },
    { name: 'Bad', categoryId: 'food', amountCents: 5, frequency: 'year', day: 1, startDate: '2026-10-01' },
  ];
  s.goals = [{ id: 'g', name: 'Trip', emoji: '✈️', targetCents: 100, deadline: null, deposits: [{ id: 'd', date: FRI, cents: 50 }, { date: 'bad', cents: 1 }], createdAt: FRI }, { targetCents: 0 }];
  const n = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(n.rules, [{ id: 'a', pattern: 'starbucks', categoryId: 'out' }]);
  assert.equal(n.recurring.length, 1);
  assert.equal(n.goals.length, 1);
  assert.equal(n.goals[0].deposits.length, 1);
  // Old backups without these collections still load.
  const old = JSON.parse(JSON.stringify(s));
  delete old.rules;
  delete old.recurring;
  delete old.goals;
  assert.deepEqual(normalizeState(old).goals, []);
});
