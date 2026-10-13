// Bottom-sheet forms: weekly check-in, single expense, categories & budgets, reminder, onboarding.
import * as store from './store.js';
import {
  addDays,
  budgetStatuses,
  checkinDate,
  escalations,
  isISODate,
  newId,
  PALETTE_SIZE,
  parseAmount,
  pendingCheckins,
  sumExpenses,
  todayISO,
  weekEndFor,
  weekStartFor,
} from './logic.js';
import { centsToInput, currencyOptions, guessCurrency, h, isIOS, isStandalone, LOCALE, money, percent, weekRange, weekdayDayMonth } from './dom.js';
import { amountInput, budgetMessage, closeSheet, fieldRow, levelIcon, meter, openSheet, segmented, select, toast } from './ui.js';
import { icon } from './icons.js';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

function currency() {
  return store.get().settings.currency;
}

function categoryDot(category) {
  return h('span', { class: 'cat-dot', style: { '--cat': `var(--c${category.color})` }, 'aria-hidden': 'true' }, category.emoji);
}

// Runs after the current sheet has finished closing.
function afterSave(raised, message) {
  setTimeout(() => {
    if (raised.length) openBudgetAlert(raised);
    else toast(message);
  }, 280);
}

// ---------------------------------------------------------------------------
// Budget warning

export function openBudgetAlert(statuses) {
  const cur = currency();
  const sorted = [...statuses].sort((a, b) => b.ratio - a.ratio);
  const anyOver = sorted.some((s) => s.level === 'over');
  const body = h(
    'div',
    { class: 'stack' },
    h('p', { class: 'sheet-lead' }, anyOver ? 'You’ve gone past a budget.' : 'You’re getting close to a budget.'),
    sorted.map((s) =>
      h(
        'div',
        { class: `alert-card level-${s.level}` },
        h('div', { class: 'alert-head' }, h('span', { class: 'alert-icon' }, levelIcon(s.level, 18)), h('strong', null, `${s.emoji} ${s.label}`)),
        h('p', { class: 'alert-text' }, budgetMessage(s, cur)),
        meter(s),
      ),
    ),
  );
  openSheet({ title: 'Budget warning', body, primaryLabel: 'Got it', onPrimary: () => true, dismissible: false });
}

// ---------------------------------------------------------------------------
// Weekly check-in

export function openCheckinSheet(initialWeekEnd) {
  const today = todayISO();
  const latestWeek = weekEndFor(today);
  let weekEnd = initialWeekEnd ?? pendingCheckins(store.get(), today)[0] ?? latestWeek;
  const container = h('div', { class: 'stack' });
  let rows = [];

  function render() {
    const state = store.get();
    const cur = state.settings.currency;
    const date = checkinDate(weekEnd, today);
    const start = weekStartFor(weekEnd);
    const doneAt = state.checkins[weekEnd];
    const categories = store.activeCategories();
    const totalEl = h('strong');

    const update = () => {
      const extra = new Map();
      for (const row of rows) {
        const cents = parseAmount(row.input.value);
        if (cents) extra.set(row.category.id, cents);
      }
      const statuses = new Map(budgetStatuses(store.get(), date, extra).map((s) => [s.key, s]));
      let total = sumExpenses(store.get().expenses, { start, end: weekEnd });
      for (const row of rows) {
        const cents = extra.get(row.category.id) ?? 0;
        total += cents;
        const parts = [];
        if (row.logged) parts.push(h('span', null, `Logged so far ${money(row.logged, cur)}`));
        const st = statuses.get(row.category.id);
        if (st) {
          parts.push(h('span', { class: `inline-status level-${st.level}` }, st.level !== 'ok' ? levelIcon(st.level, 13) : null, `${percent(st.ratio)} of ${st.period}ly budget`));
        }
        row.hint.replaceChildren(...parts.flatMap((p, i) => (i ? [' · ', p] : [p])));
        row.input.toggleAttribute('aria-invalid', row.input.value.trim() !== '' && parseAmount(row.input.value) === null);
      }
      totalEl.textContent = money(total, cur);
    };

    rows = categories.map((category) => {
      const logged = sumExpenses(state.expenses, { start, end: weekEnd, categoryId: category.id });
      const { field, input } = amountInput({ currency: cur, label: `${category.name} this week`, oninput: update });
      const hint = h('span', { class: 'checkin-hint' });
      const el = h(
        'div',
        { class: 'checkin-row' },
        categoryDot(category),
        h('div', { class: 'checkin-text' }, h('span', { class: 'checkin-name' }, category.name), hint),
        field,
      );
      return { category, input, hint, logged, el };
    });

    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous week', onclick: () => go(-7) }, icon('chevronLeft', 20));
    const next = h(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': 'Next week', disabled: weekEnd >= latestWeek, onclick: () => go(7) },
      icon('chevronRight', 20),
    );

    container.replaceChildren(
      h(
        'div',
        { class: 'week-nav' },
        prev,
        h('div', { class: 'week-nav-label' }, h('strong', null, weekRange(weekEnd)), h('span', null, weekEnd === latestWeek ? 'This week' : `Week ending ${weekdayDayMonth(weekEnd)}`)),
        next,
      ),
      doneAt
        ? h('p', { class: 'note note-good' }, icon('check', 16), 'Already logged. Amounts you add now go on top of what’s there.')
        : h('p', { class: 'sheet-lead' }, 'How much did you spend in each category this week? Leave blank if nothing.'),
      h('div', { class: 'card list-card' }, rows.map((r) => r.el)),
      h('div', { class: 'checkin-total' }, h('span', null, 'Week total'), totalEl),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: save }, 'Save week'),
    );
    update();
  }

  function go(days) {
    const typed = rows.some((r) => r.input.value.trim());
    if (typed && !confirm('Switch week? The amounts you typed will be cleared.')) return;
    weekEnd = addDays(weekEnd, days);
    render();
  }

  function save() {
    const bad = rows.find((r) => r.input.value.trim() && parseAmount(r.input.value) === null);
    if (bad) {
      toast(`Check the amount for ${bad.category.name}.`);
      bad.input.focus();
      return false;
    }
    const entries = rows.map((r) => ({ categoryId: r.category.id, amountCents: parseAmount(r.input.value) ?? 0 })).filter((e) => e.amountCents > 0);
    if (!entries.length && !confirm('No amounts entered. Mark this week as logged anyway?')) return false;

    const date = checkinDate(weekEnd, todayISO());
    const before = budgetStatuses(store.get(), date);
    const now = new Date().toISOString();
    store.update((s) => {
      for (const e of entries) s.expenses.push({ id: newId(), ...e, date, note: '', source: 'checkin', createdAt: now });
      s.checkins[weekEnd] = now;
    });
    const total = entries.reduce((sum, e) => sum + e.amountCents, 0);
    closeSheet();
    afterSave(escalations(before, budgetStatuses(store.get(), date)), entries.length ? `Week saved · ${money(total, currency())}` : 'Week marked as logged');
    return true;
  }

  render();
  openSheet({ title: 'Weekly check-in', body: container, primaryLabel: 'Save', onPrimary: save });
}

// ---------------------------------------------------------------------------
// Single expense (add or edit)

function categoryPicker(selectedId, onPick, extra) {
  const categories = store.activeCategories();
  if (extra && !categories.includes(extra)) categories.push(extra);
  const buttons = categories.map((c) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        role: 'radio',
        'aria-checked': String(c.id === selectedId),
        style: { '--cat': `var(--c${c.color})` },
        onclick: () => {
          for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.id === c.id));
          onPick(c.id);
        },
        dataset: { id: c.id },
      },
      h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, c.emoji),
      h('span', { class: 'chip-label' }, c.name),
    ),
  );
  return h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Category' }, buttons);
}

export function openExpenseSheet({ expense, categoryId } = {}) {
  const cur = currency();
  const editing = Boolean(expense);
  let catId = expense?.categoryId ?? categoryId ?? store.activeCategories()[0]?.id;
  const { field, input } = amountInput({ currency: cur, value: centsToInput(expense?.amountCents), label: 'Amount' });
  field.classList.add('amount-field-lg');
  const date = h('input', { class: 'input', type: 'date', value: expense?.date ?? todayISO(), 'aria-label': 'Date' });
  const note = h('input', { class: 'input', type: 'text', maxlength: 200, placeholder: 'Optional', value: expense?.note ?? '', 'aria-label': 'Note' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const remove = editing
    ? h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger btn-block',
          onclick: () => {
            if (!confirm('Delete this entry?')) return;
            store.update((s) => {
              s.expenses = s.expenses.filter((e) => e.id !== expense.id);
            });
            closeSheet();
            toast('Deleted');
          },
        },
        icon('trash', 18),
        'Delete entry',
      )
    : null;

  const body = h(
    'div',
    { class: 'stack' },
    field,
    h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Category'), categoryPicker(catId, (id) => (catId = id), editing ? store.category(expense.categoryId) : null)),
    h('div', { class: 'card form-card' }, fieldRow('Date', date), fieldRow('Note', note)),
    expense?.source === 'checkin' ? h('p', { class: 'field-hint' }, 'Part of a weekly check-in.') : null,
    error,
    remove,
  );

  openSheet({
    title: editing ? 'Edit entry' : 'Add expense',
    body,
    primaryLabel: editing ? 'Save' : 'Add',
    initialFocus: editing ? null : input,
    onPrimary: () => {
      const cents = parseAmount(input.value);
      if (!cents) {
        error.textContent = 'Enter an amount greater than zero.';
        input.focus();
        return false;
      }
      if (!isISODate(date.value)) {
        error.textContent = 'Pick a date.';
        return false;
      }
      if (!catId) {
        error.textContent = 'Pick a category.';
        return false;
      }
      const before = budgetStatuses(store.get(), date.value);
      store.update((s) => {
        const fields = { categoryId: catId, amountCents: cents, date: date.value, note: note.value.trim() };
        if (editing) Object.assign(s.expenses.find((e) => e.id === expense.id), fields);
        else s.expenses.push({ id: newId(), ...fields, source: 'single', createdAt: new Date().toISOString() });
      });
      afterSave(escalations(before, budgetStatuses(store.get(), date.value)), editing ? 'Saved' : `Added ${money(cents, cur)}`);
      return true;
    },
  });
}

// Chooser behind the big + button.
export function openAddChooser() {
  const option = (title, text, iconName, onclick) =>
    h('button', { type: 'button', class: 'choice', onclick }, h('span', { class: 'choice-icon' }, icon(iconName, 22)), h('span', { class: 'choice-text' }, h('strong', null, title), h('span', null, text)), icon('chevronRight', 18));
  const body = h(
    'div',
    { class: 'stack' },
    option('Weekly check-in', 'Fill in this week’s spending for every category at once.', 'calendar', () => openCheckinSheet()),
    option('Single expense', 'Add one purchase with a date and note.', 'wallet', () => openExpenseSheet()),
  );
  openSheet({ title: 'Add spending', body, cancelLabel: 'Close' });
}

// ---------------------------------------------------------------------------
// Categories & budgets

const EMOJI_CHOICES = ['🛒', '🍽️', '☕️', '🚗', '⛽️', '🚌', '🏠', '💡', '📱', '🛍️', '👕', '🎉', '🎮', '🎬', '✈️', '💊', '🏋️', '💇', '🐶', '👶', '📚', '🎁', '🍺', '🧾', '📦'];

function budgetFields(budget, cur) {
  const { field, input } = amountInput({ currency: cur, value: centsToInput(budget?.amountCents), label: 'Budget amount', placeholder: 'No budget' });
  let period = budget?.period ?? 'month';
  const control = segmented({ options: PERIOD_OPTIONS, value: period, onChange: (v) => (period = v), label: 'Budget period' });
  return {
    el: h('div', { class: 'stack-sm' }, field, control),
    read() {
      const raw = input.value.trim();
      if (!raw) return { budget: null };
      const cents = parseAmount(raw);
      if (!cents) return { error: 'Enter a budget amount above zero, or leave it empty for no budget.' };
      return { budget: { amountCents: cents, period } };
    },
  };
}

export function openCategorySheet(category) {
  const state = store.get();
  const cur = state.settings.currency;
  const editing = Boolean(category);
  const usedColors = new Set(store.activeCategories().map((c) => c.color));
  let color = category?.color ?? [...Array(PALETTE_SIZE).keys()].find((i) => !usedColors.has(i)) ?? state.categories.length % PALETTE_SIZE;

  const emoji = h('input', { class: 'input emoji-input', type: 'text', value: category?.emoji ?? '🏷️', maxlength: 16, 'aria-label': 'Emoji' });
  const name = h('input', { class: 'input', type: 'text', value: category?.name ?? '', maxlength: 40, placeholder: 'e.g. Coffee', 'aria-label': 'Name' });
  const emojiRow = h(
    'div',
    { class: 'emoji-grid' },
    EMOJI_CHOICES.map((e) => h('button', { type: 'button', class: 'emoji-btn', 'aria-label': `Use ${e}`, onclick: () => (emoji.value = e) }, e)),
  );
  const swatches = [...Array(PALETTE_SIZE).keys()].map((i) =>
    h('button', {
      type: 'button',
      class: 'swatch',
      role: 'radio',
      'aria-checked': String(i === color),
      'aria-label': `Color ${i + 1}`,
      style: { '--cat': `var(--c${i})` },
      onclick: () => {
        color = i;
        swatches.forEach((s, j) => s.setAttribute('aria-checked', String(j === i)));
      },
    }),
  );
  const budget = budgetFields(category?.budget, cur);
  const error = h('p', { class: 'form-error', role: 'alert' });

  const count = editing ? state.expenses.filter((e) => e.categoryId === category.id).length : 0;
  const remove = editing
    ? h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger btn-block',
          onclick: () => {
            if (count) {
              if (!confirm(`“${category.name}” has ${count} ${count === 1 ? 'entry' : 'entries'}. It will be hidden from new entries but kept in your history. Continue?`)) return;
              store.update((s) => {
                s.categories.find((c) => c.id === category.id).archived = true;
              });
              toast('Category hidden');
            } else {
              if (!confirm(`Delete “${category.name}”?`)) return;
              store.update((s) => {
                s.categories = s.categories.filter((c) => c.id !== category.id);
              });
              toast('Category deleted');
            }
            closeSheet();
          },
        },
        icon('trash', 18),
        count ? 'Hide category' : 'Delete category',
      )
    : null;

  const body = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'card form-card' }, fieldRow('Name', name), fieldRow('Emoji', emoji)),
    emojiRow,
    h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Color'), h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, swatches)),
    h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Budget'), budget.el, h('p', { class: 'field-hint' }, `You’ll be warned at ${percent(state.settings.warnAt)} and when you go over.`)),
    error,
    remove,
  );

  openSheet({
    title: editing ? 'Edit category' : 'New category',
    body,
    primaryLabel: editing ? 'Save' : 'Add',
    onPrimary: () => {
      const nameValue = name.value.trim();
      if (!nameValue) {
        error.textContent = 'Give the category a name.';
        return false;
      }
      const result = budget.read();
      if (result.error) {
        error.textContent = result.error;
        return false;
      }
      const fields = { name: nameValue, emoji: emoji.value.trim() || '🏷️', color, budget: result.budget };
      store.update((s) => {
        if (editing) Object.assign(s.categories.find((c) => c.id === category.id), fields);
        else s.categories.push({ id: newId(), ...fields, archived: false });
      });
      toast(editing ? 'Saved' : 'Category added');
      return true;
    },
  });
}

export function openTotalBudgetSheet() {
  const state = store.get();
  const budget = budgetFields(state.settings.totalBudget, state.settings.currency);
  const error = h('p', { class: 'form-error', role: 'alert' });
  const body = h(
    'div',
    { class: 'stack' },
    h('p', { class: 'sheet-lead' }, 'A cap for all categories together. Leave empty for none.'),
    budget.el,
    error,
  );
  openSheet({
    title: 'Overall budget',
    body,
    onPrimary: () => {
      const result = budget.read();
      if (result.error) {
        error.textContent = result.error;
        return false;
      }
      store.update((s) => {
        s.settings.totalBudget = result.budget;
      });
      toast(result.budget ? 'Overall budget saved' : 'Overall budget removed');
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Friday reminder (a repeating Calendar event, so iOS notifies even when the app is closed)

const REMINDER_HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 … 22:00

export function fmtTime(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 7, hh, mm));
}

export function reminderHref(hhmm) {
  return `reminders/friday-${hhmm.replace(':', '')}.ics`;
}

export function openReminderSheet() {
  const state = store.get();
  let time = REMINDER_HOURS.map((hr) => `${String(hr).padStart(2, '0')}:00`).includes(state.settings.reminderTime) ? state.settings.reminderTime : '18:00';
  const link = h(
    'a',
    {
      class: 'btn btn-primary btn-block',
      href: reminderHref(time),
      target: '_blank',
      rel: 'noopener',
      onclick: () => {
        store.update((s) => {
          s.settings.reminderTime = time;
          s.settings.reminderAdded = true;
        });
      },
    },
    icon('calendar', 18),
    'Add to Calendar',
  );
  const timeSelect = select({
    label: 'Reminder time',
    className: 'select select-inline',
    value: time,
    options: REMINDER_HOURS.map((hr) => {
      const value = `${String(hr).padStart(2, '0')}:00`;
      return { value, label: fmtTime(value) };
    }),
    onchange: (e) => {
      time = e.target.value;
      link.href = reminderHref(time);
    },
  });

  const body = h(
    'div',
    { class: 'stack' },
    h('p', { class: 'sheet-lead' }, 'Your iPhone’s Calendar will alert you every Friday to log what you spent — even when this app is closed.'),
    h('div', { class: 'card form-card' }, fieldRow('Every Friday at', timeSelect)),
    link,
    h(
      'ol',
      { class: 'steps' },
      h('li', null, 'Tap ', h('strong', null, 'Add to Calendar'), '.'),
      h('li', null, 'On the next screen tap ', h('strong', null, 'Add All'), ' (or ', h('strong', null, 'Add to Calendar'), ').'),
      h('li', null, 'Done! The alert links back to this app.'),
    ),
    h('p', { class: 'field-hint' }, 'To change the time later, edit “Log this week’s spending” in the Calendar app. On Fridays the app also shows a check-in card on the Home screen.'),
  );
  openSheet({ title: 'Friday reminder', body, cancelLabel: 'Close' });
}

// ---------------------------------------------------------------------------
// First run

export function openOnboarding() {
  const currencySelect = select({
    label: 'Currency',
    className: 'select select-inline',
    value: guessCurrency(),
    options: currencyOptions().map((c) => ({ value: c.code, label: c.label })),
  });
  const point = (iconName, title, text) => h('li', { class: 'intro-point' }, h('span', { class: 'intro-icon' }, icon(iconName, 20)), h('div', null, h('strong', null, title), h('span', null, text)));

  const body = h(
    'div',
    { class: 'stack' },
    h('p', { class: 'sheet-lead' }, 'Keep an eye on where your money goes — a few taps a week.'),
    h(
      'ul',
      { class: 'intro-points' },
      point('calendar', 'Friday check-in', 'Each Friday, enter what you spent in each category.'),
      point('warn', 'Budgets that warn you', 'Set limits and get a heads-up before you hit them.'),
      point('chart', 'Clear charts', 'See weekly and monthly trends and where it all went.'),
    ),
    isIOS() && !isStandalone()
      ? h(
          'div',
          { class: 'note note-warn' },
          icon('share', 18),
          h('span', null, 'For the best experience, first tap ', h('strong', null, 'Share'), ' → ', h('strong', null, 'Add to Home Screen'), ', then open Money from your Home Screen. Data entered here in Safari stays in Safari.'),
        )
      : null,
    h('div', { class: 'card form-card' }, fieldRow('Currency', currencySelect)),
    h('p', { class: 'field-hint' }, 'Everything stays on this device. Nothing is uploaded.'),
  );

  openSheet({
    title: 'Welcome',
    body,
    primaryLabel: 'Start',
    dismissible: false,
    onPrimary: () => {
      store.update((s) => {
        s.settings.currency = currencySelect.value;
        s.settings.onboarded = true;
      });
      return true;
    },
  });
}

export { categoryDot };
