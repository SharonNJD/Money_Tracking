// The Add screen: type or paste anything ("coffee 18", a bank text, a scanned receipt) and it's sorted for you.
import * as store from './store.js';
import { addDays, budgetStatuses, escalations, newId, todayISO } from './logic.js';
import { parseFreeText } from './freetext.js';
import { classify, learn, normalize } from './classify.js';
import { fill, h, money, REGION, weekdayDayMonth } from './dom.js';
import { afterSave, choice, closeSheet, openSheet, toast } from './ui.js';
import { groupedSelect, itemLabel } from './pickers.js';
import { openCheckinSheet, openExpenseSheet } from './sheets.js';
import { openImportSheet } from './import-sheet.js';
import { icon } from './icons.js';

const EXAMPLES = ['coffee 18', 'groceries 230', 'uber 32 yesterday', 'pizza 45, cinema 70'];

function fallbackCategory() {
  const active = store.activeCategories();
  return active.find((c) => c.key === 'other') ?? active.find((c) => c.name.toLowerCase() === 'other') ?? active.at(-1);
}

function dayText(date, today) {
  if (date === today) return null;
  if (date === addDays(today, -1)) return 'Yesterday';
  return weekdayDayMonth(date);
}

export function openAddSheet({ text = '' } = {}) {
  const cur = store.get().settings.currency;
  const overrides = new Map(); // what you chose by hand, per description
  const includes = new Map(); // ticked/unticked by hand, per row
  let items = [];
  let timer = null;

  const input = h('textarea', {
    class: 'smart-input',
    rows: 3,
    placeholder: 'What did you spend on?\ne.g. coffee 18 · uber 32 yesterday',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'What did you spend on? Type or paste',
    oninput: () => {
      clearTimeout(timer);
      timer = setTimeout(parse, 150);
    },
  });
  input.value = text;

  const list = h('div', { class: 'smart-list', 'aria-live': 'polite' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => save() });
  const scanTip = h(
    'div',
    { class: 'note note-info', hidden: true },
    icon('camera', 18),
    h(
      'span',
      null,
      h('strong', null, 'Receipt or bank app: '),
      'tap the box above, then tap ',
      h('strong', null, 'Scan Text'),
      ' (the camera icon above the keyboard, or long-press the box → Scan Text) and point your camera at it. ',
      h('strong', null, 'Screenshot: '),
      'open it in Photos, long-press the text → Select All → Copy, then tap Paste.',
    ),
  );

  async function paste() {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) {
        toast('Nothing copied yet');
        return;
      }
      input.value = input.value.trim() ? `${input.value.trim()}\n\n${clip}` : clip;
      parse();
    } catch {
      toast('Long-press the box and tap Paste');
      input.focus();
    }
  }

  function parse() {
    const state = store.get();
    const today = todayISO();
    const fallback = fallbackCategory();
    items = parseFreeText(input.value, { today, dateOrder: REGION === 'US' ? 'mdy' : 'dmy' }).map((t, i) => {
      const key = normalize(t.merchant);
      const id = `${i}|${key}|${t.amountCents}`;
      const mine = overrides.get(key);
      const auto = mine ? null : classify(state, t.merchant);
      const pick = mine ?? (auto ? { categoryId: auto.categoryId, typeId: auto.typeId } : { categoryId: fallback?.id, typeId: null });
      return { ...t, key, id, ...pick, from: mine ? 'you' : auto ? 'auto' : null, include: includes.has(id) ? includes.get(id) : t.isExpense };
    });
    render(today);
  }

  function render(today) {
    const chosen = items.filter((i) => i.include);
    const total = chosen.reduce((s, i) => s + i.amountCents, 0);
    saveBtn.disabled = !chosen.length;
    saveBtn.textContent = !chosen.length ? 'Add' : chosen.length === 1 ? `Add ${money(total, cur)}` : `Add ${chosen.length} items · ${money(total, cur)}`;

    if (!items.length) {
      fill(
        list,
        input.value.trim()
          ? h('p', { class: 'field-hint' }, 'Add an amount, like “coffee 18”.')
          : h(
              'div',
              { class: 'examples' },
              h('span', { class: 'field-hint' }, 'Try:'),
              EXAMPLES.map((ex) =>
                h('button', { type: 'button', class: 'example-chip', onclick: () => {
                  input.value = input.value.trim() ? `${input.value.trim()}\n${ex}` : ex;
                  parse();
                } }, ex),
              ),
            ),
      );
      return;
    }

    fill(
      list,
      h(
        'div',
        { class: 'card list-card' },
        items.map((item) => {
          const tag =
            !item.isExpense ? h('span', { class: 'tag' }, 'Money in')
            : item.from === 'auto' ? h('span', { class: 'tag tag-auto' }, icon('sparkle', 11), 'Auto-sorted')
            : item.from === null ? h('span', { class: 'tag tag-warn' }, 'Check category')
            : null;
          return h(
            'div',
            { class: 'review-row' },
            h(
              'label',
              { class: 'review-check' },
              h('input', {
                type: 'checkbox',
                class: 'check',
                checked: item.include,
                'aria-label': `Add ${item.merchant}`,
                onchange: (e) => {
                  includes.set(item.id, e.target.checked);
                  item.include = e.target.checked;
                  render(today);
                },
              }),
            ),
            h(
              'div',
              { class: 'review-main' },
              h('span', { class: 'review-merchant' }, item.merchant),
              h('span', { class: 'review-meta' }, dayText(item.date, today), tag),
              groupedSelect({
                categoryId: item.categoryId,
                typeId: item.typeId,
                label: `Category for ${item.merchant}`,
                onChange: (pick) => {
                  overrides.set(item.key, pick);
                  parse();
                },
              }),
            ),
            h('span', { class: 'review-amount' }, money(item.amountCents, cur)),
          );
        }),
      ),
    );
  }

  function save() {
    const chosen = items.filter((i) => i.include);
    if (!chosen.length) {
      input.focus();
      return false;
    }
    const today = todayISO();
    const before = budgetStatuses(store.get(), today);
    const now = new Date().toISOString();
    store.update((s) => {
      for (const t of chosen) {
        s.expenses.push({ id: newId(), categoryId: t.categoryId, amountCents: t.amountCents, date: t.date, note: t.merchant, source: 'single', createdAt: now, ...(t.typeId ? { typeId: t.typeId } : {}) });
        // Your corrections teach the auto-sort for next time.
        if (t.from === 'you') learn(s, t.merchant, t.categoryId, t.typeId);
      }
    });
    const total = chosen.reduce((sum, t) => sum + t.amountCents, 0);
    closeSheet();
    afterSave(
      escalations(before, budgetStatuses(store.get(), today)),
      chosen.length === 1 ? `Added ${money(total, cur)} · ${itemLabel(chosen[0].categoryId, chosen[0].typeId)}` : `Added ${chosen.length} items · ${money(total, cur)}`,
    );
    return true;
  }

  const body = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'smart-box' }, input, h('div', { class: 'smart-actions' }, h('button', { type: 'button', class: 'pill-btn', onclick: paste }, icon('clipboard', 16), 'Paste'), h('button', { type: 'button', class: 'pill-btn', onclick: () => (scanTip.hidden = !scanTip.hidden) }, icon('camera', 16), 'Scan'))),
    scanTip,
    list,
    saveBtn,
    h('h3', { class: 'group-title' }, 'More ways to add'),
    choice('Weekly check-in', 'This week’s total for each category at once.', 'calendar', () => openCheckinSheet()),
    choice('Import a file', 'Apple Pay log or a bank statement (.csv).', 'upload', () => openImportSheet()),
    choice('Detailed form', 'Pick the date, category and note yourself.', 'wallet', () => openExpenseSheet()),
  );

  parse();
  openSheet({ title: 'Add spending', body, primaryLabel: 'Add', onPrimary: save, initialFocus: input });
}
