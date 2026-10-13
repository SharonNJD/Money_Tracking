// Pure insight calculations: month-end forecast, weekly recap, and the category that changed most.
import { addDays, checkinStreak, daysBetween, occurrencesBetween, periodRange, sumExpenses, totalsByCategory, weekStartFor } from './logic.js';

const HISTORY_DAYS = 56; // look-back for the "usual" daily spend
const MIN_HISTORY_DAYS = 14;

function firstActivity(state) {
  return [state.createdAt, ...state.expenses.map((e) => e.date)].sort()[0];
}

// Spending so far this month plus: the usual daily spend (excluding recurring payments) for the days left,
// and recurring payments still to come. Null until there's two weeks of history.
export function monthForecast(state, todayIso) {
  const { start, end } = periodRange('month', todayIso);
  const historyStart = [addDays(todayIso, -(HISTORY_DAYS - 1)), firstActivity(state)].sort().at(-1);
  const historyDays = daysBetween(historyStart, todayIso) + 1;
  if (historyDays < MIN_HISTORY_DAYS) return null;

  const usual = sumExpenses(
    state.expenses.filter((e) => e.source !== 'recurring'),
    { start: historyStart, end: todayIso },
  );
  const perDayCents = usual / historyDays;
  const daysLeft = daysBetween(todayIso, end);
  let upcomingRecurringCents = 0;
  for (const item of state.recurring ?? []) {
    if (!item.active) continue;
    const from = [addDays(todayIso, 1), item.startDate, item.lastAdded ? addDays(item.lastAdded, 1) : ''].sort().at(-1);
    upcomingRecurringCents += occurrencesBetween(item, from, end).length * item.amountCents;
  }
  const spentCents = sumExpenses(state.expenses, { start, end });
  const forecastCents = Math.round((spentCents + perDayCents * daysLeft + upcomingRecurringCents) / 100) * 100;

  const budget = state.settings.totalBudget?.period === 'month' ? state.settings.totalBudget.amountCents : null;
  return {
    spentCents,
    forecastCents,
    upcomingRecurringCents,
    budgetCents: budget,
    overByCents: budget ? forecastCents - budget : null,
  };
}

function weekTotals(state, weekEnd, weeks) {
  const out = [];
  for (let i = 1; i <= weeks; i++) {
    const end = addDays(weekEnd, -7 * i);
    const start = weekStartFor(end);
    if (end < firstActivity(state)) break;
    out.push({ start, end, total: sumExpenses(state.expenses, { start, end }), byCategory: totalsByCategory(state.expenses, { start, end }) });
  }
  return out;
}

const wholeUnits = (cents) => Math.round(cents / 100) * 100;

// The category furthest from its 4-week average in the given week, if the change is meaningful.
// Drops only count for categories spent on every week; otherwise a monthly bill (rent) would look like a saving.
export function biggestChange(state, weekEnd) {
  const prior = weekTotals(state, weekEnd, 4);
  if (prior.length < 2) return null;
  const range = { start: weekStartFor(weekEnd), end: weekEnd };
  const current = totalsByCategory(state.expenses, range);
  const avgTotal = prior.reduce((s, w) => s + w.total, 0) / prior.length;
  let best = null;
  for (const c of state.categories) {
    const avg = prior.reduce((s, w) => s + (w.byCategory.get(c.id) ?? 0), 0) / prior.length;
    const now = current.get(c.id) ?? 0;
    const diff = now - avg;
    // Ignore small wobbles: at least 25% of the category's usual and 10% of a usual week overall.
    if (Math.abs(diff) < Math.max(avg * 0.25, avgTotal * 0.1, 1)) continue;
    if (diff < 0 && !prior.every((w) => (w.byCategory.get(c.id) ?? 0) > 0)) continue;
    if (!best || Math.abs(diff) > Math.abs(best.diffCents)) {
      best = { categoryId: c.id, nowCents: now, avgCents: wholeUnits(avg), diffCents: Math.round(diff), ratio: avg ? diff / avg : null };
    }
  }
  return best;
}

export function weeklyRecap(state, weekEnd, todayIso) {
  const range = { start: weekStartFor(weekEnd), end: weekEnd };
  const totalCents = sumExpenses(state.expenses, range);
  const prior = weekTotals(state, weekEnd, 4);
  const avgCents = prior.length >= 2 ? wholeUnits(prior.reduce((s, w) => s + w.total, 0) / prior.length) : null;
  const byCategory = [...totalsByCategory(state.expenses, range)].sort((a, b) => b[1] - a[1]);
  const top = byCategory[0] && totalCents ? { categoryId: byCategory[0][0], cents: byCategory[0][1], share: byCategory[0][1] / totalCents } : null;
  return {
    weekEnd,
    totalCents,
    avgCents,
    top,
    change: biggestChange(state, weekEnd),
    streak: checkinStreak(state, todayIso),
  };
}
