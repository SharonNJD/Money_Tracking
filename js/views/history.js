import * as store from '../store.js';
import { weekEndFor } from '../logic.js';
import { h, money, weekRange } from '../dom.js';
import { emptyState, select } from '../ui.js';
import { openAddSheet } from '../add-sheet.js';
import { icon } from '../icons.js';
import { expenseRow } from './home.js';
import { topbar } from './common.js';

const PAGE = 12; // weeks per page
let filter = 'all';
let shownWeeks = PAGE;

export function renderHistory() {
  const state = store.get();
  const cur = state.settings.currency;
  const used = new Set(state.expenses.map((e) => e.categoryId));
  const categories = state.categories.filter((c) => !c.archived || used.has(c.id));
  if (filter !== 'all' && !categories.some((c) => c.id === filter)) filter = 'all';

  const expenses = state.expenses
    .filter((e) => filter === 'all' || e.categoryId === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const weeks = new Map();
  for (const e of expenses) {
    const we = weekEndFor(e.date);
    if (!weeks.has(we)) weeks.set(we, []);
    weeks.get(we).push(e);
  }
  const weekList = [...weeks.entries()];

  const filterSelect = select({
    label: 'Filter by category',
    className: 'select select-pill',
    value: filter,
    options: [{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}${c.archived ? ' (hidden)' : ''}` }))],
    onchange: (e) => {
      filter = e.target.value;
      shownWeeks = PAGE;
      store.refresh();
    },
  });

  const body = weekList.length
    ? [
        ...weekList.slice(0, shownWeeks).map(([we, items]) =>
          h(
            'section',
            { class: 'section' },
            h(
              'div',
              { class: 'section-head' },
              h('h2', null, weekRange(we), state.checkins[we] ? h('span', { class: 'checked', title: 'Checked in' }, icon('check', 14), 'Logged') : null),
              h('span', { class: 'section-total' }, money(items.reduce((s, e) => s + e.amountCents, 0), cur)),
            ),
            h('div', { class: 'card list-card' }, items.map((e) => expenseRow(e, cur))),
          ),
        ),
        weekList.length > shownWeeks
          ? h('button', { type: 'button', class: 'btn btn-quiet btn-block', onclick: () => { shownWeeks += PAGE; store.refresh(); } }, 'Show earlier weeks')
          : null,
      ]
    : h(
        'div',
        { class: 'card' },
        emptyState({
          title: filter === 'all' ? 'No spending logged yet' : 'Nothing in this category yet',
          text: 'Entries appear here grouped by week (Saturday to Friday).',
          action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openAddSheet() }, 'Add spending'),
        }),
      );

  return [topbar('History'), h('div', { class: 'content' }, h('div', { class: 'filter-row' }, filterSelect), body)];
}
