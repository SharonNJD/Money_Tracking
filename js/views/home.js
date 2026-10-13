import * as store from '../store.js';
import { budgetStatuses, checkinStreak, dueWeekEnd, LEVEL_RANK, pendingCheckins, periodRange, SOURCE_LABELS, sumExpenses, todayISO, weekEndFor } from '../logic.js';
import { biggestChange, monthForecast } from '../insights.js';
import { goalsSection } from '../goals.js';
import { streakText } from '../recap.js';
import { h, isIOS, isStandalone, money, monthName, percent, perPeriod, weekRange, weekdayDayMonth } from '../dom.js';
import { budgetBadge, budgetMessage, categoryDot, emptyState, levelIcon, meter } from '../ui.js';
import { openCategorySheet, openCheckinSheet, openExpenseSheet, openReminderSheet, openTotalBudgetSheet } from '../sheets.js';
import { navigate } from '../router.js';
import { icon } from '../icons.js';
import { topbar } from './common.js';

let installHidden = false;

function editBudget(status) {
  if (status.key === 'total') openTotalBudgetSheet();
  else openCategorySheet(store.category(status.key));
}

function installBanner() {
  if (installHidden || !isIOS() || isStandalone()) return null;
  return h(
    'div',
    { class: 'note note-info banner' },
    icon('share', 18),
    h('span', null, 'Install: tap ', h('strong', null, 'Share'), ' then ', h('strong', null, 'Add to Home Screen'), '. Open it from there so your data stays in the app.'),
    h('button', { type: 'button', class: 'banner-close', 'aria-label': 'Dismiss', onclick: (e) => { installHidden = true; e.currentTarget.parentElement.remove(); } }, '×'),
  );
}

function checkinCard(state, today) {
  const pending = pendingCheckins(state, today);
  const streak = checkinStreak(state, today);
  if (pending.length) {
    const isToday = pending[0] === today;
    const more = pending.length - 1;
    return h(
      'section',
      { class: 'card checkin-card' },
      h('div', { class: 'checkin-card-icon' }, icon('calendar', 22)),
      h(
        'div',
        { class: 'checkin-card-text' },
        h('strong', null, isToday ? 'It’s Friday — time to check in' : 'A week is waiting to be logged'),
        h('span', null, isToday ? `Log what you spent this week (${weekRange(pending[0])}).` : `Week of ${weekRange(pending[0])}${more ? ` · +${more} earlier` : ''}`),
        streak >= 2 ? h('span', { class: 'streak' }, `🔥 Keep your ${streak}-week streak going`) : null,
      ),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openCheckinSheet(pending[0]) }, isToday ? 'Log week' : 'Log it'),
    );
  }

  const nextFriday = weekEndFor(today) === today ? null : weekEndFor(today);
  return h(
    'section',
    { class: 'card checkin-card is-quiet' },
    h('div', { class: 'checkin-card-icon' }, icon(nextFriday ? 'calendar' : 'check', 22)),
    h(
      'div',
      { class: 'checkin-card-text' },
      h('strong', null, nextFriday ? `Next check-in: ${weekdayDayMonth(nextFriday)}` : 'Week logged — nice!'),
      h('span', null, state.settings.reminderAdded ? 'Your Friday reminder is on.' : 'Get a Friday alert.'),
      streak >= 2 ? h('span', { class: 'streak' }, streakText(streak)) : null,
    ),
    state.settings.reminderAdded
      ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openCheckinSheet(weekEndFor(today)) }, 'Log now')
      : h('button', { type: 'button', class: 'btn btn-quiet', onclick: openReminderSheet }, icon('bell', 16), 'Remind me'),
  );
}

function insight(iconName, title, text, warn = false) {
  return h('div', { class: ['insight', warn && 'is-warn'] }, h('span', { class: 'insight-icon' }, icon(iconName, 18)), h('div', { class: 'insight-text' }, h('strong', null, title), h('span', null, text)));
}

function insightsCard(state, today, cur) {
  const rows = [];
  const forecast = monthForecast(state, today);
  if (forecast) {
    const over = forecast.overByCents > 0;
    let text = `${money(forecast.spentCents, cur)} spent so far`;
    if (forecast.budgetCents != null) {
      text = over ? `That’s ${money(forecast.overByCents, cur)} over your ${money(forecast.budgetCents, cur)} budget` : `${money(-forecast.overByCents, cur)} under your ${money(forecast.budgetCents, cur)} budget`;
    }
    rows.push(insight(over ? 'warn' : 'chart', `On pace for about ${money(forecast.forecastCents, cur)} in ${monthName(today)}`, text, over));
  }
  // Compare the latest logged week with the four before it.
  const week = dueWeekEnd(today);
  const change = state.checkins[week] ? biggestChange(state, week) : null;
  const c = change && store.category(change.categoryId);
  if (c) {
    const when = week === weekEndFor(today) ? 'this week' : 'last week';
    const up = change.diffCents > 0;
    const title = change.ratio == null ? `${c.emoji} ${c.name}: ${money(change.nowCents, cur)} ${when}` : `${c.emoji} ${c.name} ${up ? 'up' : 'down'} ${percent(Math.abs(change.ratio))} ${when}`;
    rows.push(insight(up ? 'trendUp' : 'trendDown', title, `${money(change.nowCents, cur)} vs about ${money(change.avgCents, cur)} in a usual week`));
  }
  if (!rows.length) return null;
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Insights')), h('div', { class: 'card list-card' }, rows));
}

function alertsSection(statuses, cur) {
  const flagged = statuses.filter((s) => s.level !== 'ok').sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.ratio - a.ratio);
  if (!flagged.length) return null;
  return h(
    'section',
    { class: 'section' },
    flagged.map((s) =>
      h(
        'button',
        { type: 'button', class: `alert-card level-${s.level}`, onclick: () => editBudget(s) },
        h('div', { class: 'alert-head' }, h('span', { class: 'alert-icon' }, levelIcon(s.level, 18)), h('strong', null, `${s.emoji} ${s.label}`), h('span', { class: 'alert-pill' }, s.level === 'over' ? 'Over budget' : 'Almost there')),
        h('p', { class: 'alert-text' }, budgetMessage(s, cur)),
      ),
    ),
  );
}

function budgetsSection(statuses, cur) {
  const header = h('div', { class: 'section-head' }, h('h2', null, 'Budgets'), h('button', { type: 'button', class: 'link-btn', onclick: () => navigate('settings') }, 'Edit'));
  if (!statuses.length) {
    return h(
      'section',
      { class: 'section' },
      header,
      h('div', { class: 'card' }, emptyState({ title: 'No budgets yet', text: 'Set a weekly or monthly limit per category and you’ll be warned before you reach it.', action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => navigate('settings') }, 'Set budgets') })),
    );
  }
  return h(
    'section',
    { class: 'section' },
    header,
    h(
      'div',
      { class: 'card list-card' },
      statuses.map((s) =>
        h(
          'button',
          { type: 'button', class: 'budget-row', onclick: () => editBudget(s) },
          h(
            'div',
            { class: 'budget-row-top' },
            s.color == null ? h('span', { class: 'cat-dot cat-dot-total', 'aria-hidden': 'true' }, s.emoji) : categoryDot(store.category(s.key)),
            h('span', { class: 'budget-name' }, s.label, h('small', null, s.period === 'week' ? 'This week' : 'This month')),
            h('span', { class: 'budget-amount' }, h('strong', null, money(s.spentCents, cur)), h('small', null, ` / ${money(s.budgetCents, cur)}`)),
          ),
          meter(s),
          h('div', { class: 'budget-row-bottom' }, budgetBadge(s, cur), s.remainingCents > 0 ? h('span', { class: 'muted' }, `${money(s.remainingCents, cur)} left${perPeriod(s.period)}`) : null),
        ),
      ),
    ),
  );
}

export function expenseRow(e, cur, { showDate = true } = {}) {
  const category = store.category(e.categoryId);
  return h(
    'button',
    { type: 'button', class: 'expense-row', onclick: () => openExpenseSheet({ expense: e }) },
    category ? categoryDot(category) : h('span', { class: 'cat-dot' }, '❔'),
    h('span', { class: 'expense-main' }, h('span', { class: 'expense-name' }, category?.name ?? 'Unknown'), h('small', null, [e.note || (e.source !== 'single' ? SOURCE_LABELS[e.source] : ''), showDate ? weekdayDayMonth(e.date) : ''].filter(Boolean).join(' · '))),
    h('span', { class: 'expense-amount' }, money(e.amountCents, cur)),
  );
}

function recentSection(state, cur) {
  const recent = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  if (!recent.length) {
    return h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Recent')),
      h('div', { class: 'card' }, emptyState({ title: 'Nothing logged yet', text: 'Do your first check-in or add a single expense with the + button.' })),
    );
  }
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Recent'), h('button', { type: 'button', class: 'link-btn', onclick: () => navigate('history') }, 'See all')),
    h('div', { class: 'card list-card' }, recent.map((e) => expenseRow(e, cur))),
  );
}

export function renderHome() {
  const state = store.get();
  const cur = state.settings.currency;
  const today = todayISO();
  const week = periodRange('week', today);
  const month = periodRange('month', today);
  const weekTotal = sumExpenses(state.expenses, week);
  const monthTotal = sumExpenses(state.expenses, month);
  const statuses = budgetStatuses(state, today);
  const total = statuses.find((s) => s.key === 'total');

  return [
    topbar('Money Tracker'),
    h(
      'section',
      { class: 'hero' },
      h('p', { class: 'hero-label' }, `This week · ${weekRange(week.end)}`),
      h('p', { class: 'hero-value' }, money(weekTotal, cur)),
      h(
        'p',
        { class: 'hero-sub' },
        `${monthName(today)} so far `,
        h('strong', null, money(monthTotal, cur)),
        total && total.period === 'month' ? ` of ${money(total.budgetCents, cur)}` : null,
      ),
    ),
    h('div', { class: 'content' }, installBanner(), checkinCard(state, today), alertsSection(statuses, cur), insightsCard(state, today, cur), budgetsSection(statuses, cur), goalsSection(), recentSection(state, cur)),
  ];
}
