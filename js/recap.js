// Weekly recap shown after a check-in: total, streak, how the week compares, and any budget warnings.
import * as store from './store.js';
import { todayISO } from './logic.js';
import { monthForecast, weeklyRecap } from './insights.js';
import { h, money, monthName, percent, weekRange } from './dom.js';
import { budgetAlertCards, openSheet } from './ui.js';

export function streakText(streak) {
  return `🔥 ${streak}-week streak`;
}

function changeText(change, cur) {
  const c = store.category(change.categoryId);
  const name = c ? `${c.emoji} ${c.name}` : 'A category';
  if (change.ratio == null) return `${name}: ${money(change.nowCents, cur)}, more than usual.`;
  const dir = change.diffCents > 0 ? 'up' : 'down';
  return `${name} was ${dir} ${percent(Math.abs(change.ratio))} on your usual (${money(change.nowCents, cur)} vs about ${money(change.avgCents, cur)}).`;
}

export function forecastText(f, today, cur) {
  const base = `On pace for about ${money(f.forecastCents, cur)} in ${monthName(today)}`;
  if (f.budgetCents == null) return `${base}.`;
  if (f.overByCents > 0) return `${base} — ${money(f.overByCents, cur)} over your budget.`;
  return `${base} — ${money(-f.overByCents, cur)} under your budget.`;
}

export function openRecapSheet({ weekEnd, raised = [] }) {
  const state = store.get();
  const cur = state.settings.currency;
  const today = todayISO();
  const r = weeklyRecap(state, weekEnd, today);
  const forecast = monthForecast(state, today);

  let comparison = null;
  if (r.avgCents != null) {
    const diff = r.totalCents - r.avgCents;
    if (Math.abs(diff) <= r.avgCents * 0.05) comparison = h('p', { class: 'delta' }, `About the same as a usual week (${money(r.avgCents, cur)}).`);
    else if (diff < 0) comparison = h('p', { class: 'delta delta-good' }, `▼ ${money(-diff, cur)} less than a usual week`);
    else comparison = h('p', { class: 'delta delta-bad' }, `▲ ${money(diff, cur)} more than a usual week`);
  }

  const topCategory = r.top && store.category(r.top.categoryId);
  const facts = [
    topCategory ? `Most went on ${topCategory.emoji} ${topCategory.name}: ${money(r.top.cents, cur)} (${percent(r.top.share)}).` : null,
    r.change ? changeText(r.change, cur) : null,
    forecast ? forecastText(forecast, today, cur) : null,
  ].filter(Boolean);

  const body = h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'card recap-hero' },
      h('span', { class: 'readout-label' }, `Week of ${weekRange(weekEnd)}`),
      h('span', { class: 'readout-value' }, r.totalCents ? money(r.totalCents, cur) : 'Nothing spent'),
      comparison,
      r.streak >= 2 ? h('span', { class: 'streak' }, streakText(r.streak)) : r.streak === 1 ? h('span', { class: 'streak' }, '🔥 Streak started — log again next Friday') : null,
    ),
    facts.length ? h('ul', { class: 'card fact-list' }, facts.map((f) => h('li', null, f))) : null,
    raised.length ? [h('h3', { class: 'group-title' }, 'Budget warnings'), budgetAlertCards(raised)] : null,
  );
  openSheet({ title: 'Week logged', body, primaryLabel: 'Done', onPrimary: () => true, dismissible: false });
}
