import * as store from '../store.js';
import { defaultState, normalizeState, todayISO, toCSV } from '../logic.js';
import { currencyOptions, h, money, perPeriod, weekdayDayMonth } from '../dom.js';
import { pickFile, select, shareFile, toast } from '../ui.js';
import { categoryDot, fmtTime, openCategorySheet, openReminderSheet, openTotalBudgetSheet } from '../sheets.js';
import { icon } from '../icons.js';
import { topbar } from './common.js';

const WARN_LEVELS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

function row({ title, detail, onclick, leading, danger = false }) {
  return h(
    'button',
    { type: 'button', class: ['settings-row', danger && 'is-danger'], onclick },
    leading ?? null,
    h('span', { class: 'settings-title' }, title),
    detail ? h('span', { class: 'settings-detail' }, detail) : null,
    danger ? null : icon('chevronRight', 18),
  );
}

function controlRow(title, control) {
  return h('label', { class: 'settings-row is-control' }, h('span', { class: 'settings-title' }, title), control);
}

function group(title, rows, footer) {
  return h('section', { class: 'section' }, title ? h('h2', { class: 'group-title' }, title) : null, h('div', { class: 'card list-card' }, rows), footer ? h('p', { class: 'group-footer' }, footer) : null);
}

function budgetText(budget, cur) {
  return budget ? `${money(budget.amountCents, cur)}${perPeriod(budget.period)}` : 'No budget';
}

async function exportBackup() {
  const state = store.get();
  const stamp = todayISO();
  const ok = await shareFile(`money-tracker-backup-${stamp}.json`, 'application/json', JSON.stringify(state, null, 2));
  if (ok) {
    store.update((s) => {
      s.settings.lastBackup = new Date().toISOString();
    });
    toast('Backup ready');
  }
}

async function exportCSV() {
  await shareFile(`money-tracker-${todayISO()}.csv`, 'text/csv', toCSV(store.get()));
}

async function importBackup() {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  try {
    const next = normalizeState(JSON.parse(await file.text()));
    next.settings.onboarded = true;
    const n = next.expenses.length;
    if (!confirm(`Replace everything on this device with this backup (${n} ${n === 1 ? 'entry' : 'entries'})?`)) return;
    store.replace(next);
    toast('Backup restored');
  } catch (err) {
    alert(`Couldn’t import that file: ${err.message}`);
  }
}

function eraseAll() {
  if (!confirm('Erase all entries, categories and budgets on this device? This can’t be undone.')) return;
  if (!confirm('Are you sure? Consider exporting a backup first.')) return;
  const fresh = defaultState({ currency: store.get().settings.currency });
  fresh.settings.onboarded = true;
  store.replace(fresh);
  toast('All data erased');
}

export function renderSettings() {
  const state = store.get();
  const cur = state.settings.currency;
  const active = state.categories.filter((c) => !c.archived);
  const hidden = state.categories.filter((c) => c.archived);

  const warnSelect = select({
    label: 'Warn me at',
    className: 'select select-inline',
    value: String(state.settings.warnAt),
    options: WARN_LEVELS.map((v) => ({ value: String(v), label: `${Math.round(v * 100)}% of budget` })),
    onchange: (e) =>
      store.update((s) => {
        s.settings.warnAt = Number(e.target.value);
      }),
  });

  const currencySelect = select({
    label: 'Currency',
    className: 'select select-inline',
    value: cur,
    options: currencyOptions().map((c) => ({ value: c.code, label: c.code })),
    onchange: (e) => {
      const next = e.target.value;
      if (state.expenses.length && !confirm(`Show amounts in ${next}? Existing amounts are relabelled, not converted.`)) {
        e.target.value = cur;
        return;
      }
      store.update((s) => {
        s.settings.currency = next;
      });
    },
  });

  return [
    topbar('Settings'),
    h(
      'div',
      { class: 'content' },
      group(
        'Reminder',
        [row({ title: 'Friday reminder', detail: state.settings.reminderAdded ? fmtTime(state.settings.reminderTime) : 'Not set', onclick: openReminderSheet, leading: h('span', { class: 'row-icon' }, icon('bell', 18)) })],
        'Adds a repeating event to your iPhone Calendar so you get an alert every Friday.',
      ),
      group(
        'Categories & budgets',
        [
          ...active.map((c) => row({ title: c.name, detail: budgetText(c.budget, cur), onclick: () => openCategorySheet(c), leading: categoryDot(c) })),
          row({ title: 'Add category', onclick: () => openCategorySheet(), leading: h('span', { class: 'row-icon is-accent' }, icon('plus', 18)) }),
        ],
        'Tap a category to rename it or set a weekly or monthly budget.',
      ),
      hidden.length
        ? group(
            'Hidden categories',
            hidden.map((c) =>
              row({
                title: c.name,
                detail: 'Restore',
                leading: categoryDot(c),
                onclick: () => {
                  store.update((s) => {
                    s.categories.find((x) => x.id === c.id).archived = false;
                  });
                  toast(`${c.name} restored`);
                },
              }),
            ),
          )
        : null,
      group('Budget warnings', [
        row({ title: 'Overall budget', detail: budgetText(state.settings.totalBudget, cur), onclick: openTotalBudgetSheet, leading: h('span', { class: 'row-icon' }, icon('wallet', 18)) }),
        controlRow('Warn me at', warnSelect),
      ]),
      group('General', [controlRow('Currency', currencySelect)]),
      group(
        'Backup',
        [
          row({ title: 'Export backup', detail: state.settings.lastBackup ? `Last: ${weekdayDayMonth(state.settings.lastBackup.slice(0, 10))}` : 'Never', onclick: exportBackup, leading: h('span', { class: 'row-icon' }, icon('download', 18)) }),
          row({ title: 'Restore from backup', onclick: importBackup, leading: h('span', { class: 'row-icon' }, icon('upload', 18)) }),
          row({ title: 'Export spreadsheet (CSV)', onclick: exportCSV, leading: h('span', { class: 'row-icon' }, icon('table', 18)) }),
        ],
        'Your data lives only on this iPhone. Save a backup to Files or iCloud Drive now and then.',
      ),
      group(null, [row({ title: 'Erase all data', onclick: eraseAll, danger: true })]),
      h('p', { class: 'about' }, 'Money Tracker · works offline · no account, no tracking'),
    ),
  ];
}
