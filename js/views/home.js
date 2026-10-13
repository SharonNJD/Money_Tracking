import * as store from '../store.js';
import { budgetStatuses, LEVEL_RANK, pendingCheckins, periodRange, sumExpenses, todayISO, weekEndFor } from '../logic.js';
import { h, isIOS, isStandalone, money, monthName, perPeriod, weekRange, weekdayDayMonth } from '../dom.js';
import { budgetBadge, budgetMessage, emptyState, levelIcon, meter } from '../ui.js';
import { categoryDot, openCategorySheet, openCheckinSheet, openExpenseSheet, openReminderSheet, openTotalBudgetSheet } from '../sheets.js';
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
    ),
    state.settings.reminderAdded
      ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openCheckinSheet(weekEndFor(today)) }, 'Log now')
      : h('button', { type: 'button', class: 'btn btn-quiet', onclick: openReminderSheet }, icon('bell', 16), 'Remind me'),
  );
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
    h('span', { class: 'expense-main' }, h('span', { class: 'expense-name' }, category?.name ?? 'Unknown'), h('small', null, [e.note || (e.source === 'checkin' ? 'Weekly check-in' : ''), showDate ? weekdayDayMonth(e.date) : ''].filter(Boolean).join(' · '))),
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
    h('div', { class: 'content' }, installBanner(), checkinCard(state, today), alertsSection(statuses, cur), budgetsSection(statuses, cur), recentSection(state, cur)),
  ];
}
