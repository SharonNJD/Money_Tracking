// Import purchases from the Apple Pay Shortcuts log or a bank/card statement (CSV).
import * as store from './store.js';
import { budgetStatuses, escalations, newId, todayISO, weekEndFor } from './logic.js';
import {
  analyzeStatement,
  decodeText,
  detectDateOrder,
  detectExpenseSign,
  isApplePayLog,
  merchantKey,
  parseApplePayLog,
  parseCSV,
  statementTransactions,
  suggestCategory,
  withImportKeys,
} from './importer.js';
import { fill, h, money, REGION, weekdayDayMonth } from './dom.js';
import { afterSave, choice, closeSheet, emptyState, fieldRow, openSheet, pickFile, segmented, select, toast } from './ui.js';
import { icon } from './icons.js';

export const LOG_FILE = 'money-tracker-applepay.txt';
const MAX_ROWS = 500;
const LEGACY_ENCODINGS = { IL: 'windows-1255', RU: 'windows-1251', UA: 'windows-1251', GR: 'windows-1253', TR: 'windows-1254', PL: 'windows-1250', CZ: 'windows-1250', HU: 'windows-1250' };
const defaultDateOrder = () => (REGION === 'US' ? 'mdy' : 'dmy');

export function openImportSheet({ onDone } = {}) {
  const body = h('div', { class: 'stack' });
  let finished = false;
  const cur = store.get().settings.currency;

  function showChoose(error) {
    fill(body,
      h('p', { class: 'sheet-lead' }, 'Bring in purchases from Apple Pay or from a bank or credit-card statement. You check each one’s category before anything is saved.'),
      choice('Choose a file', 'Your Apple Pay log (.txt) or a statement (.csv)', 'upload', chooseFile),
      choice('Log Apple Pay automatically', 'One-time setup in the Shortcuts app', 'wallet', () => openApplePaySetup({ back: () => openImportSheet({ onDone }) })),
      error ? h('p', { class: 'form-error', role: 'alert' }, error) : null,
      h('p', { class: 'field-hint' }, 'Bank statement: download it as CSV from your bank’s website or app. If you only get an Excel file, open it in Numbers and use Share → Export → CSV.'),
    );
  }

  async function chooseFile() {
    const file = await pickFile('.csv,.txt,text/csv,text/plain,text/comma-separated-values');
    if (!file) return;
    let text;
    try {
      text = decodeText(await file.arrayBuffer(), LEGACY_ENCODINGS[REGION] ?? 'windows-1252');
    } catch {
      showChoose('Couldn’t read that file.');
      return;
    }
    if (isApplePayLog(text)) {
      const dates = text.split(/\r?\n/).map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        return parts[0]?.toUpperCase() === 'MT' ? parts[1] : parts[0];
      });
      showReview(parseApplePayLog(text, detectDateOrder(dates) ?? defaultDateOrder()));
      return;
    }
    const rows = parseCSV(text);
    if (rows.length < 2) {
      showChoose('That file doesn’t look like a statement. Try a CSV export from your bank.');
      return;
    }
    showMapping(rows);
  }

  function showMapping(rows) {
    const analysis = analyzeStatement(rows);
    const config = { ...analysis };
    const dataRows = rows.slice(config.headerRow + 1);
    config.dateOrder = detectDateOrder(dataRows.map((r) => r[config.date])) ?? defaultDateOrder();
    config.expenseSign = detectExpenseSign(rows, config);

    const width = Math.max(...rows.map((r) => r.length));
    const header = config.headerRow >= 0 ? rows[config.headerRow] : null;
    const columnOptions = [...Array(width).keys()].map((i) => ({
      value: String(i),
      label: header?.[i] || `Column ${i + 1}${dataRows[0]?.[i] ? ` (${dataRows[0][i].slice(0, 16)})` : ''}`,
    }));

    const preview = h('div', { class: 'card list-card' });
    const status = h('p', { class: 'field-hint' });
    const continueBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => showReview(statementTransactions(rows, config)) }, 'Continue');

    const refresh = () => {
      const txns = statementTransactions(rows, config);
      const purchases = txns.filter((t) => t.isExpense);
      fill(preview,
        ...(txns.length
          ? txns.slice(0, 4).map((t) =>
              h(
                'div',
                { class: 'preview-row' },
                h('span', { class: 'preview-date' }, weekdayDayMonth(t.date)),
                h('span', { class: 'preview-merchant' }, t.merchant),
                h('span', { class: ['preview-amount', !t.isExpense && 'is-income'] }, t.isExpense ? money(t.amountCents, cur) : `+${money(t.amountCents, cur)}`),
              ),
            )
          : [emptyState({ title: 'No rows could be read', text: 'Try different columns or date format.' })]),
      );
      const other = txns.length - purchases.length;
      status.textContent = `${purchases.length} purchase${purchases.length === 1 ? '' : 's'} found${other ? ` · ${other} refund${other === 1 ? '' : 's'} or money in (skipped)` : ''}`;
      continueBtn.disabled = purchases.length === 0;
    };

    const columnSelect = (label, key) =>
      fieldRow(
        label,
        select({
          label,
          className: 'select select-inline',
          value: String(config[key]),
          options: columnOptions,
          onchange: (e) => {
            config[key] = Number(e.target.value);
            if (key === 'date') config.dateOrder = detectDateOrder(dataRows.map((r) => r[config.date])) ?? config.dateOrder;
            if (key === 'amount') config.expenseSign = detectExpenseSign(rows, config);
            refresh();
          },
        }),
      );

    fill(body,
      h('p', { class: 'sheet-lead' }, 'Check that the columns are right. The preview shows the first rows.'),
      h(
        'div',
        { class: 'card form-card' },
        columnSelect('Date', 'date'),
        columnSelect('Shop', 'description'),
        columnSelect('Amount', 'amount'),
        fieldRow(
          'Date format',
          select({
            label: 'Date format',
            className: 'select select-inline',
            value: config.dateOrder,
            options: [
              { value: 'dmy', label: 'Day/Month/Year' },
              { value: 'mdy', label: 'Month/Day/Year' },
            ],
            onchange: (e) => {
              config.dateOrder = e.target.value;
              refresh();
            },
          }),
        ),
      ),
      h(
        'div',
        { class: 'form-section' },
        h('span', { class: 'field-label' }, 'Purchases in this file are'),
        segmented({
          label: 'Purchases are shown as',
          value: config.expenseSign,
          options: [
            { value: 'positive', label: 'Positive (50)' },
            { value: 'negative', label: 'Negative (−50)' },
          ],
          onChange: (v) => {
            config.expenseSign = v;
            refresh();
          },
        }),
      ),
      h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Preview'), preview),
      status,
      continueBtn,
      h('button', { type: 'button', class: 'btn btn-quiet btn-block', onclick: () => showChoose() }, 'Choose a different file'),
    );
    refresh();
  }

  function showReview(transactions) {
    const state = store.get();
    const imported = new Set(state.expenses.map((e) => e.importKey).filter(Boolean));
    // Weeks where a check-in already recorded amounts: importing them too would count twice.
    const loggedWeeks = new Set(state.expenses.filter((e) => e.source === 'checkin' && e.amountCents > 0).map((e) => weekEndFor(e.date)));
    const purchases = withImportKeys(transactions.filter((t) => t.isExpense)).sort((a, b) => b.date.localeCompare(a.date));
    const skipped = transactions.length - purchases.length;
    if (!purchases.length) {
      showChoose('No purchases found in that file.');
      return;
    }

    const active = store.activeCategories();
    if (!active.length) {
      showChoose('Add a category first (Settings → Categories & budgets).');
      return;
    }
    const fallback = active.find((c) => c.name.toLowerCase() === 'other') ?? active.at(-1);
    const items = purchases.slice(0, MAX_ROWS).map((t) => {
      const suggestion = suggestCategory(state, t.merchant);
      const duplicate = imported.has(t.key);
      const inLoggedWeek = loggedWeeks.has(weekEndFor(t.date));
      return { ...t, mkey: merchantKey(t.merchant), categoryId: suggestion?.categoryId ?? fallback.id, guessed: !suggestion, duplicate, inLoggedWeek, include: !duplicate && !inLoggedWeek, manual: false };
    });

    const summary = h('p', { class: 'review-summary' });
    const importBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => doImport() });
    const remember = h('input', { type: 'checkbox', class: 'check', checked: true });

    const refresh = () => {
      const chosen = items.filter((i) => i.include);
      const total = chosen.reduce((s, i) => s + i.amountCents, 0);
      summary.textContent = `${chosen.length} of ${items.length} selected · ${money(total, cur)}`;
      importBtn.textContent = chosen.length ? `Import ${chosen.length} purchase${chosen.length === 1 ? '' : 's'}` : 'Nothing selected';
      importBtn.disabled = !chosen.length;
    };

    const rowEls = items.map((item) => {
      item.checkbox = h('input', {
        type: 'checkbox',
        class: 'check',
        checked: item.include,
        'aria-label': `Import ${item.merchant}, ${money(item.amountCents, cur)}`,
        onchange: (e) => {
          item.include = e.target.checked;
          refresh();
        },
      });
      item.guessTag = item.guessed ? h('span', { class: 'tag tag-warn' }, 'Check category') : null;
      item.select = select({
        label: `Category for ${item.merchant}`,
        className: 'select select-pill select-sm',
        value: item.categoryId,
        options: active.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
        onchange: (e) => {
          item.categoryId = e.target.value;
          item.manual = true;
          item.guessTag?.remove();
          // Other purchases from the same shop follow, unless changed by hand.
          for (const other of items) {
            if (other !== item && other.mkey === item.mkey && !other.manual) {
              other.categoryId = item.categoryId;
              other.select.value = item.categoryId;
              other.guessTag?.remove();
            }
          }
        },
      });
      return h(
        'div',
        { class: 'review-row' },
        h('label', { class: 'review-check' }, item.checkbox),
        h(
          'div',
          { class: 'review-main' },
          h('span', { class: 'review-merchant' }, item.merchant),
          h(
            'span',
            { class: 'review-meta' },
            weekdayDayMonth(item.date),
            item.duplicate ? h('span', { class: 'tag' }, 'Already imported') : null,
            !item.duplicate && item.inLoggedWeek ? h('span', { class: 'tag' }, 'Week already logged') : null,
            item.guessTag,
          ),
          item.select,
        ),
        h('span', { class: 'review-amount' }, money(item.amountCents, cur)),
      );
    });

    const duplicates = items.filter((i) => i.duplicate).length;
    const inLogged = items.filter((i) => !i.duplicate && i.inLoggedWeek).length;
    const notes = [
      purchases.length > MAX_ROWS ? `Showing the newest ${MAX_ROWS} purchases.` : null,
      duplicates ? `${duplicates} already imported earlier — unticked.` : null,
      inLogged ? `${inLogged} fall in weeks you already logged with a check-in — unticked so they aren’t counted twice.` : null,
      skipped ? `${skipped} refund${skipped === 1 ? '' : 's'} or incoming payment${skipped === 1 ? '' : 's'} skipped.` : null,
    ].filter(Boolean);

    const setAll = (value) => {
      for (const i of items) {
        i.include = value;
        i.checkbox.checked = value;
      }
      refresh();
    };

    fill(body,
      h('div', { class: 'review-head' }, summary, h('span', { class: 'review-actions' }, h('button', { type: 'button', class: 'link-btn', onclick: () => setAll(true) }, 'All'), h('button', { type: 'button', class: 'link-btn', onclick: () => setAll(false) }, 'None'))),
      notes.length ? h('div', { class: 'note note-info' }, icon('check', 16), h('span', null, notes.join(' '))) : null,
      h('div', { class: 'card list-card' }, rowEls),
      h('label', { class: 'check-row' }, remember, h('span', null, 'Remember each shop’s category for next time')),
      importBtn,
    );
    refresh();

    function doImport() {
      const chosen = items.filter((i) => i.include);
      if (!chosen.length) return;
      const today = todayISO();
      const before = budgetStatuses(store.get(), today);
      const now = new Date().toISOString();
      store.update((s) => {
        for (const t of chosen) {
          s.expenses.push({ id: newId(), categoryId: t.categoryId, amountCents: t.amountCents, date: t.date, note: t.merchant, merchant: t.merchant, source: 'import', importKey: t.key, createdAt: now });
        }
        if (!remember.checked) return;
        for (const t of chosen) {
          if (t.mkey.length < 3) continue;
          // Only remember what the built-in shop list wouldn't have guessed anyway.
          const builtIn = suggestCategory({ ...s, rules: [] }, t.merchant)?.categoryId;
          const rule = s.rules.find((r) => r.pattern === t.mkey);
          if (t.categoryId === builtIn) {
            if (rule) s.rules = s.rules.filter((r) => r !== rule);
          } else if (rule) {
            rule.categoryId = t.categoryId;
          } else {
            s.rules.push({ id: newId(), pattern: t.mkey, categoryId: t.categoryId });
          }
        }
      });
      finished = true;
      closeSheet();
      afterSave(escalations(before, budgetStatuses(store.get(), today)), `Imported ${chosen.length} purchase${chosen.length === 1 ? '' : 's'}`, onDone);
    }
  }

  showChoose();
  openSheet({
    title: 'Import purchases',
    body,
    onClose: () => {
      if (!finished) onDone?.();
    },
  });
}

// ---------------------------------------------------------------------------
// Apple Pay → Shortcuts setup guide

export function openApplePaySetup({ back } = {}) {
  const step = (n, ...content) => h('li', { class: 'setup-step' }, h('span', { class: 'setup-num', 'aria-hidden': 'true' }, String(n)), h('div', null, ...content));
  const b = (text) => h('strong', null, text);
  const code = (text) => h('code', { class: 'code' }, text);

  const body = h(
    'div',
    { class: 'stack' },
    h('p', { class: 'sheet-lead' }, 'Your iPhone can write every Apple Pay purchase to a file. Set it up once in the Shortcuts app, then import that file in your Friday check-in.'),
    h(
      'ol',
      { class: 'setup-steps' },
      step(1, 'Open the ', b('Shortcuts'), ' app → ', b('Automation'), ' tab → ', b('+'), ' → ', b('Transaction'), '.'),
      step(2, 'Pick your cards, choose ', b('Run Immediately'), ', tap ', b('Next'), ', then ', b('New Blank Automation'), '.'),
      step(3, 'Add the action ', b('Append to Text File'), '.'),
      step(
        4,
        'In its text box type ',
        code('MT|'),
        ' then insert ',
        b('Current Date'),
        ', type ',
        code('|'),
        ', insert ',
        b('Merchant'),
        ', type ',
        code('|'),
        ', insert ',
        b('Amount'),
        '.',
        h('span', { class: 'step-hint' }, 'Merchant and Amount are under Shortcut Input. Tap Current Date → Date Format → ISO 8601.'),
      ),
      step(5, 'Set the file path to ', code(LOG_FILE), ', turn on ', b('Make New Line'), ' and tap ', b('Done'), '.'),
    ),
    h('div', { class: 'card example' }, h('span', { class: 'field-hint' }, 'Each purchase becomes a line like:'), code('MT|2026-10-16T13:05:00+03:00|Blue Bottle|₪18.00')),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-quiet btn-block',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(LOG_FILE);
            toast('File name copied');
          } catch {
            toast(LOG_FILE);
          }
        },
      },
      'Copy file name',
    ),
    h(
      'p',
      { class: 'field-hint' },
      `To import, tap Import purchases and pick ${LOG_FILE} from iCloud Drive → Shortcuts. Anything you imported before is skipped, so keep using the same file. Only Apple Pay taps are logged, not your physical card or card numbers typed online.`,
    ),
  );
  openSheet({ title: 'Log Apple Pay purchases', body, cancelLabel: back ? 'Back' : 'Close', onClose: back });
}

// ---------------------------------------------------------------------------
// Remembered shop → category rules

export function openRulesSheet() {
  const list = h('div', { class: 'stack' });
  const render = () => {
    const state = store.get();
    const rules = [...state.rules].sort((a, b) => a.pattern.localeCompare(b.pattern));
    if (!rules.length) {
      fill(list, h('div', { class: 'card' }, emptyState({ title: 'No shops remembered yet', text: 'When you import purchases and pick a category, the app remembers it for that shop.' })));
      return;
    }
    fill(list,
      h('p', { class: 'sheet-lead' }, 'Imported purchases from these shops get their category automatically.'),
      h(
        'div',
        { class: 'card list-card' },
        rules.map((r) => {
          const c = store.category(r.categoryId);
          return h(
            'div',
            { class: 'rule-row' },
            h('span', { class: 'rule-pattern' }, r.pattern),
            h('span', { class: 'rule-cat' }, c ? `${c.emoji} ${c.name}` : '—'),
            h(
              'button',
              {
                type: 'button',
                class: 'rule-remove',
                'aria-label': `Forget ${r.pattern}`,
                onclick: () => {
                  store.update((s) => {
                    s.rules = s.rules.filter((x) => x.id !== r.id);
                  });
                  render();
                },
              },
              icon('trash', 16),
            ),
          );
        }),
      ),
    );
  };
  render();
  openSheet({ title: 'Shop categories', body: list, cancelLabel: 'Close' });
}
