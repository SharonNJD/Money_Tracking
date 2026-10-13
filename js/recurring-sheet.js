// Recurring payments (rent, subscriptions…): added to spending automatically when they fall due.
import * as store from './store.js';
import { addDays, applyRecurring, dueRecurring, newId, nextOccurrence, parseAmount, todayISO } from './logic.js';
import { centsToInput, h, money, ordinal, weekdayDayMonth, weekdayName } from './dom.js';
import { amountInput, categoryDot, closeSheet, emptyState, fieldRow, openSheet, segmented, select, toast } from './ui.js';
import { categoryPicker } from './sheets.js';
import { icon } from './icons.js';

export function scheduleText(item) {
  return item.frequency === 'week' ? `Every ${weekdayName(item.day)}` : `Monthly on the ${ordinal(item.day)}`;
}

// Adds whatever has fallen due. Returns the number of payments added.
export function runRecurring() {
  const today = todayISO();
  const state = store.get();
  if (!dueRecurring(state, today).length) return 0;
  let added = [];
  store.update((s) => {
    added = applyRecurring(s, today);
  });
  if (added.length === 1) toast(`Added ${added[0].item.name} · ${money(added[0].item.amountCents, state.settings.currency)}`);
  else if (added.length > 1) toast(`Added ${added.length} recurring payments`);
  return added.length;
}

export function openRecurringList() {
  const body = h('div', { class: 'stack' });
  const state = store.get();
  const cur = state.settings.currency;
  const today = todayISO();
  const items = [...state.recurring].sort((a, b) => a.name.localeCompare(b.name));
  const monthly = items.filter((r) => r.active).reduce((sum, r) => sum + (r.frequency === 'week' ? Math.round((r.amountCents * 52) / 12) : r.amountCents), 0);

  body.append(
    h('p', { class: 'sheet-lead' }, 'Rent, subscriptions, the gym… they’re added to your spending automatically when they’re due, so you don’t type them in the check-in.'),
    items.length
      ? h(
          'div',
          { class: 'card list-card' },
          items.map((r) => {
            const c = store.category(r.categoryId);
            const next = r.active ? nextOccurrence(r, today) : null;
            return h(
              'button',
              { type: 'button', class: 'settings-row', onclick: () => openRecurringSheet(r) },
              c ? categoryDot(c) : null,
              h('span', { class: 'settings-title' }, r.name, h('small', { class: 'row-sub' }, r.active ? `${scheduleText(r)} · next ${next ? weekdayDayMonth(next) : '—'}` : 'Paused')),
              h('span', { class: 'settings-detail' }, money(r.amountCents, cur)),
              icon('chevronRight', 18),
            );
          }),
        )
      : h('div', { class: 'card' }, emptyState({ title: 'No recurring payments yet', text: 'Add the bills and subscriptions you pay every month or week.' })),
    items.length ? h('p', { class: 'field-hint' }, `About ${money(monthly, cur)} a month in total.`) : null,
    h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => openRecurringSheet() }, icon('plus', 18), 'Add recurring payment'),
  );
  openSheet({ title: 'Recurring payments', body, cancelLabel: 'Close' });
}

export function openRecurringSheet(item) {
  const state = store.get();
  const cur = state.settings.currency;
  const editing = Boolean(item);
  let categoryId = item?.categoryId ?? store.activeCategories().find((c) => c.name === 'Home & bills')?.id ?? store.activeCategories()[0]?.id;
  let frequency = item?.frequency ?? 'month';
  let day = item?.day ?? Number(todayISO().slice(8));
  let active = item?.active ?? true;

  const name = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Netflix', value: item?.name ?? '', 'aria-label': 'Name' });
  const { field: amountField, input: amount } = amountInput({ currency: cur, value: centsToInput(item?.amountCents), label: 'Amount' });
  amountField.classList.add('amount-field-lg');
  const dayHost = h('div');
  const error = h('p', { class: 'form-error', role: 'alert' });

  const renderDay = () => {
    const options =
      frequency === 'week'
        ? [...Array(7).keys()].map((d) => ({ value: String(d), label: weekdayName(d) }))
        : [...Array(31).keys()].map((i) => ({ value: String(i + 1), label: `${ordinal(i + 1)}${i + 1 > 28 ? ' (or last day)' : ''}` }));
    if (frequency === 'week' && day > 6) day = 5;
    if (frequency === 'month' && day < 1) day = 1;
    dayHost.replaceChildren(
      h(
        'div',
        { class: 'card form-card' },
        fieldRow(
          frequency === 'week' ? 'Every' : 'On the',
          select({ label: 'Day', className: 'select select-inline', value: String(day), options, onchange: (e) => (day = Number(e.target.value)) }),
        ),
      ),
    );
  };
  renderDay();

  const body = h(
    'div',
    { class: 'stack' },
    amountField,
    h('div', { class: 'card form-card' }, fieldRow('Name', name)),
    h(
      'div',
      { class: 'form-section' },
      h('span', { class: 'field-label' }, 'Repeats'),
      segmented({
        label: 'Repeats',
        value: frequency,
        options: [
          { value: 'month', label: 'Monthly' },
          { value: 'week', label: 'Weekly' },
        ],
        onChange: (v) => {
          frequency = v;
          renderDay();
        },
      }),
    ),
    dayHost,
    h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Category'), categoryPicker(categoryId, (id) => (categoryId = id), editing ? store.category(item.categoryId) : null)),
    editing
      ? h(
          'label',
          { class: 'check-row' },
          h('input', { type: 'checkbox', class: 'check', checked: active, onchange: (e) => (active = e.target.checked) }),
          h('span', null, 'Active (untick to pause)'),
        )
      : h('p', { class: 'field-hint' }, 'The first payment is added on its next date from today.'),
    error,
    editing
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-danger btn-block',
            onclick: () => {
              if (!confirm(`Delete “${item.name}”? Payments already added stay in your history.`)) return;
              store.update((s) => {
                s.recurring = s.recurring.filter((r) => r.id !== item.id);
              });
              closeSheet();
              toast('Recurring payment deleted');
            },
          },
          icon('trash', 18),
          'Delete',
        )
      : null,
  );

  openSheet({
    title: editing ? 'Edit recurring' : 'New recurring payment',
    body,
    primaryLabel: editing ? 'Save' : 'Add',
    onPrimary: () => {
      const cents = parseAmount(amount.value);
      if (!name.value.trim()) {
        error.textContent = 'Give it a name.';
        return false;
      }
      if (!cents) {
        error.textContent = 'Enter an amount greater than zero.';
        return false;
      }
      const today = todayISO();
      const fields = { name: name.value.trim(), amountCents: cents, categoryId, frequency, day, active };
      store.update((s) => {
        if (editing) {
          const r = s.recurring.find((x) => x.id === item.id);
          Object.assign(r, fields);
          // After an edit or a resume, only dates from today on count; nothing is back-filled.
          const yesterday = addDays(today, -1);
          if (!r.lastAdded || r.lastAdded < yesterday) r.lastAdded = yesterday;
        } else {
          s.recurring.push({ id: newId(), ...fields, startDate: today, lastAdded: null });
        }
      });
      if (!runRecurring()) toast(editing ? 'Saved' : `${fields.name} added`);
      return true;
    },
  });
}
