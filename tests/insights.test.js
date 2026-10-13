import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/logic.js';
import { biggestChange, monthForecast, weeklyRecap } from '../js/insights.js';

function state(expenses, createdAt = '2026-08-01') {
  const s = defaultState({ today: createdAt });
  s.categories[0].id = 'food';
  s.categories[1].id = 'out';
  s.expenses = expenses.map((e, i) => ({ id: `e${i}`, note: '', source: 'checkin', createdAt: 't', ...e }));
  return s;
}

// Weekly check-ins on Fridays: groceries 300, eating out 100.
function steadyWeeks(lastFriday, weeks) {
  const out = [];
  const d = new Date(`${lastFriday}T12:00:00`);
  for (let i = 0; i < weeks; i++) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ categoryId: 'food', amountCents: 30000, date: iso }, { categoryId: 'out', amountCents: 10000, date: iso });
    d.setDate(d.getDate() - 7);
  }
  return out;
}

test('monthForecast needs two weeks of history', () => {
  assert.equal(monthForecast(state([], '2026-10-05'), '2026-10-13'), null);
});

test('monthForecast projects the usual daily spend plus upcoming recurring payments', () => {
  const s = state(steadyWeeks('2026-10-09', 8));
  s.recurring = [{ id: 'r', name: 'Netflix', categoryId: 'out', amountCents: 5000, frequency: 'month', day: 20, startDate: '2026-09-01', lastAdded: '2026-09-20', active: true }];
  s.settings.totalBudget = { amountCents: 150000, period: 'month' };
  const f = monthForecast(s, '2026-10-13');
  // 8 weeks × 400 over 56 days ≈ 57.14/day; Oct so far: 2 check-ins = 800; 18 days left ≈ 1028.57; + Netflix 50.
  assert.equal(f.spentCents, 80000);
  assert.equal(f.upcomingRecurringCents, 5000);
  assert.equal(f.forecastCents, 187900);
  assert.equal(f.overByCents, 37900);
});

test('weeklyRecap compares with the 4-week average and names the top category', () => {
  const s = state([...steadyWeeks('2026-10-09', 5), { categoryId: 'out', amountCents: 25000, date: '2026-10-16' }, { categoryId: 'food', amountCents: 30000, date: '2026-10-16' }]);
  s.checkins = { '2026-10-09': 'x', '2026-10-16': 'x' };
  const r = weeklyRecap(s, '2026-10-16', '2026-10-16');
  assert.equal(r.totalCents, 55000);
  assert.equal(r.avgCents, 40000);
  assert.deepEqual(r.top, { categoryId: 'food', cents: 30000, share: 30000 / 55000 });
  assert.equal(r.change.categoryId, 'out');
  assert.equal(r.change.diffCents, 15000);
  assert.equal(r.change.ratio, 1.5);
  assert.equal(r.streak, 2);
});

test('biggestChange ignores small wobbles and needs history', () => {
  const s = state([...steadyWeeks('2026-10-09', 5), { categoryId: 'out', amountCents: 11000, date: '2026-10-16' }, { categoryId: 'food', amountCents: 30000, date: '2026-10-16' }]);
  assert.equal(biggestChange(s, '2026-10-16'), null);
  assert.equal(biggestChange(state(steadyWeeks('2026-10-16', 2), '2026-10-05'), '2026-10-16'), null);
});

test('a monthly bill missing from a week is not reported as a drop', () => {
  // Rent lands in one of the four prior weeks only; this week has none.
  const s = state([...steadyWeeks('2026-10-16', 5), { categoryId: 'food', amountCents: 300000, date: '2026-10-02' }]);
  s.categories[3].id = 'home';
  s.expenses.push({ id: 'rent', categoryId: 'home', amountCents: 320000, date: '2026-10-02', note: '', source: 'checkin', createdAt: 't' });
  const change = biggestChange(s, '2026-10-16');
  assert.notEqual(change?.categoryId, 'home');
});
