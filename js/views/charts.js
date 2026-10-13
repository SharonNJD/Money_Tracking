import * as store from '../store.js';
import { periodRange, periodSeries, todayISO, totalsByCategory } from '../logic.js';
import { dayMonth, h, money, monthShort, monthYear, percent, periodWord, weekRange } from '../dom.js';
import { budgetBadge, emptyState, segmented, select } from '../ui.js';
import { columnChart, donutChart } from '../charts.js';
import { icon } from '../icons.js';
import { chartWidth, topbar } from './common.js';
import { expenseRow } from './home.js';

const COUNT = 12; // periods shown in the trend chart
const MAX_SEGMENTS = 6; // donut: top 5 + "Other"

const view = { period: 'week', categoryId: 'all', selected: null, table: false };

function setView(changes) {
  Object.assign(view, changes);
  store.refresh();
}

function periodLabel(period, p) {
  return period === 'week' ? weekRange(p.end) : monthYear(p.start);
}

function deltaLine(current, previous, period) {
  if (!previous) return null;
  if (previous.cents === 0) {
    return current.cents ? h('span', { class: 'delta' }, `Nothing spent the ${periodWord(period)} before`) : null;
  }
  const change = (current.cents - previous.cents) / previous.cents;
  if (Math.abs(change) < 0.005) return h('span', { class: 'delta' }, `Same as the ${periodWord(period)} before`);
  const up = change > 0;
  // Spending more is the bad direction.
  return h('span', { class: ['delta', up ? 'delta-bad' : 'delta-good'] }, `${up ? '▲' : '▼'} ${percent(Math.abs(change))} ${up ? 'more' : 'less'} than the ${periodWord(period)} before`);
}

function breakdown(state, range, cur) {
  const totals = [...totalsByCategory(state.expenses, range)].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
  const sum = totals.reduce((s, [, cents]) => s + cents, 0);
  if (!sum) return h('div', { class: 'card chart-card' }, h('h2', { class: 'card-title' }, 'Where it went'), emptyState({ title: 'Nothing spent in this period' }));

  const fold = totals.length > MAX_SEGMENTS;
  const head = fold ? totals.slice(0, MAX_SEGMENTS - 1) : totals;
  const tail = fold ? totals.slice(MAX_SEGMENTS - 1) : [];
  const segments = head.map(([id, cents]) => {
    const c = store.category(id);
    return { key: id, label: c?.name ?? 'Unknown', cents, color: `var(--c${c?.color ?? 0})` };
  });
  if (tail.length) segments.push({ key: 'other', label: 'Other', cents: tail.reduce((s, [, cents]) => s + cents, 0), color: 'var(--other)' });

  const legendRow = (id, cents, color, nested = false) => {
    const c = store.category(id);
    return h(
      'button',
      { type: 'button', class: ['legend-row', nested && 'is-nested'], onclick: () => setView({ categoryId: id }) },
      h('span', { class: 'legend-swatch', style: { background: color } }),
      h('span', { class: 'legend-name' }, `${c?.emoji ?? ''} ${c?.name ?? 'Unknown'}`),
      h('span', { class: 'legend-value' }, money(cents, cur)),
      h('span', { class: 'legend-pct' }, percent(cents / sum)),
    );
  };

  return h(
    'div',
    { class: 'card chart-card' },
    h('h2', { class: 'card-title' }, 'Where it went'),
    h(
      'div',
      { class: 'donut-wrap' },
      donutChart({
        segments,
        centerValue: money(sum, cur, { compact: true }),
        centerLabel: 'total',
        ariaLabel: `Spending by category: ${segments.map((s) => `${s.label} ${money(s.cents, cur)}`).join(', ')}`,
        onSelect: (key) => key !== 'other' && setView({ categoryId: key }),
      }),
    ),
    h(
      'div',
      { class: 'legend' },
      head.map(([id, cents]) => legendRow(id, cents, `var(--c${store.category(id)?.color ?? 0})`)),
      tail.length
        ? [
            h('div', { class: 'legend-row legend-group' }, h('span', { class: 'legend-swatch', style: { background: 'var(--other)' } }), h('span', { class: 'legend-name' }, 'Other'), h('span', { class: 'legend-value' }, money(segments.at(-1).cents, cur)), h('span', { class: 'legend-pct' }, percent(segments.at(-1).cents / sum))),
            tail.map(([id, cents]) => legendRow(id, cents, 'var(--other)', true)),
          ]
        : null,
    ),
    h('p', { class: 'field-hint' }, 'Tap a category to see its trend.'),
  );
}

export function renderCharts() {
  const state = store.get();
  const cur = state.settings.currency;
  const today = todayISO();
  const used = new Set(state.expenses.map((e) => e.categoryId));
  const categories = state.categories.filter((c) => !c.archived || used.has(c.id));
  if (view.categoryId !== 'all' && !categories.some((c) => c.id === view.categoryId)) view.categoryId = 'all';

  const { period } = view;
  const category = view.categoryId === 'all' ? null : store.category(view.categoryId);
  const series = periodSeries(state.expenses, { period, count: COUNT, refISO: today, categoryId: category?.id });
  const sel = view.selected == null || view.selected >= COUNT ? COUNT - 1 : view.selected;
  const current = series[sel];
  const previous = series[sel - 1];
  const budget = category ? category.budget : state.settings.totalBudget;
  const budgetCents = budget?.period === period ? budget.amountCents : null;

  const earliest = [state.createdAt, ...state.expenses.map((e) => e.date)].sort()[0];
  const firstEnd = periodRange(period, earliest).end;
  const active = series.filter((p) => p.end >= firstEnd);
  const average = active.length ? Math.round(active.reduce((s, p) => s + p.cents, 0) / active.length / 100) * 100 : 0;
  const highest = series.reduce((best, p) => (p.cents > best.cents ? p : best), series[0]);

  const filters = h(
    'div',
    { class: 'filter-row' },
    segmented({
      label: 'Group by',
      value: period,
      options: [
        { value: 'week', label: 'Weekly' },
        { value: 'month', label: 'Monthly' },
      ],
      onChange: (v) => setView({ period: v, selected: null }),
    }),
    select({
      label: 'Category',
      className: 'select select-pill',
      value: view.categoryId,
      options: [{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))],
      onchange: (e) => setView({ categoryId: e.target.value }),
    }),
  );

  const budgetStatus = budgetCents
    ? { level: current.cents >= budgetCents ? 'over' : current.cents >= budgetCents * state.settings.warnAt ? 'warn' : 'ok', ratio: current.cents / budgetCents, remainingCents: budgetCents - current.cents }
    : null;

  const readout = h(
    'div',
    { class: 'card readout' },
    h('span', { class: 'readout-label' }, `${category ? `${category.emoji} ${category.name} · ` : ''}${sel === COUNT - 1 ? `This ${periodWord(period)} so far` : periodLabel(period, current)}`),
    h('span', { class: 'readout-value' }, money(current.cents, cur)),
    deltaLine(current, previous, period),
    budgetStatus ? h('div', { class: 'readout-budget' }, budgetBadge(budgetStatus, cur), h('span', { class: 'muted' }, `Budget ${money(budgetCents, cur)}${period === 'week' ? '/week' : '/month'}`)) : null,
  );

  const kpis = h(
    'div',
    { class: 'kpis' },
    h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, `Average per ${periodWord(period)}`), h('span', { class: 'kpi-value' }, money(average, cur))),
    h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, `Highest ${periodWord(period)}`), h('span', { class: 'kpi-value' }, money(highest.cents, cur)), highest.cents ? h('span', { class: 'kpi-sub' }, periodLabel(period, highest)) : null),
  );

  const tickLabel = (p) => (period === 'week' ? dayMonth(p.end) : monthShort(p.start));
  const trend = view.table
    ? h(
        'table',
        { class: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, period === 'week' ? 'Week' : 'Month'), h('th', null, 'Spent'), budgetCents ? h('th', null, 'Budget') : null)),
        h(
          'tbody',
          null,
          [...series].reverse().map((p) => h('tr', null, h('td', null, periodLabel(period, p)), h('td', null, money(p.cents, cur)), budgetCents ? h('td', null, percent(p.cents / budgetCents)) : null)),
        ),
      )
    : columnChart({
        data: series.map((p) => ({ label: periodLabel(period, p), tickLabel: tickLabel(p), cents: p.cents })),
        width: chartWidth(),
        color: category ? `var(--c${category.color})` : 'var(--c0)',
        selected: sel,
        onSelect: (i) => setView({ selected: i }),
        budgetCents,
        formatValue: (cents) => money(cents, cur, { compact: true }),
        formatTick: (cents) => money(cents, cur, { compact: true }),
        ariaLabel: `Spending per ${periodWord(period)}, last ${COUNT}`,
      });

  const trendCard = h(
    'div',
    { class: 'card chart-card' },
    h(
      'div',
      { class: 'card-title-row' },
      h('h2', { class: 'card-title' }, `Last ${COUNT} ${periodWord(period)}s`),
      h('button', { type: 'button', class: 'link-btn', 'aria-pressed': String(view.table), onclick: () => setView({ table: !view.table }) }, icon(view.table ? 'chart' : 'table', 16), view.table ? 'Chart' : 'Table'),
    ),
    h('div', { class: 'chart-host' }, trend),
    view.table ? null : h('p', { class: 'field-hint' }, `Tap a ${period === 'week' ? 'week' : 'month'} to see its details.`),
  );

  const range = { start: current.start, end: current.end };
  let detail;
  if (category) {
    const items = state.expenses
      .filter((e) => e.categoryId === category.id && e.date >= range.start && e.date <= range.end)
      .sort((a, b) => b.date.localeCompare(a.date));
    detail = h(
      'div',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, periodLabel(period, current)), h('button', { type: 'button', class: 'link-btn', onclick: () => setView({ categoryId: 'all' }) }, 'All categories')),
      items.length ? h('div', { class: 'card list-card' }, items.map((e) => expenseRow(e, cur))) : h('div', { class: 'card' }, emptyState({ title: `No ${category.name.toLowerCase()} spending in this ${periodWord(period)}` })),
    );
  } else {
    detail = breakdown(state, range, cur);
  }

  if (!state.expenses.length) {
    return [
      topbar('Charts'),
      h('div', { class: 'content' }, h('div', { class: 'card' }, emptyState({ title: 'No data yet', text: 'Your charts will appear after your first check-in.' }))),
    ];
  }

  return [topbar('Charts'), h('div', { class: 'content' }, filters, readout, trendCard, kpis, detail)];
}
