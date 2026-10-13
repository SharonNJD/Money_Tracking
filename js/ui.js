// Shared UI pieces: bottom sheets, toasts, form controls, budget badges, file export.
import { currencySymbol, h, money, percent, periodWord } from './dom.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------------------
// Bottom sheet (one at a time)

let activeSheet = null;

function syncKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv || !activeSheet) return;
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  activeSheet.el.style.setProperty('--kb', `${inset}px`);
}
window.visualViewport?.addEventListener('resize', syncKeyboardInset);

export function closeSheet() {
  if (!activeSheet) return;
  const { el, onClose } = activeSheet;
  activeSheet = null;
  document.documentElement.classList.remove('sheet-open');
  el.classList.remove('open');
  setTimeout(() => el.remove(), 260);
  onClose?.();
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Node|Node[]} opts.body
 * @param {string} [opts.primaryLabel]
 * @param {() => (boolean|void|Promise<boolean|void>)} [opts.onPrimary] return false to keep the sheet open
 * @param {string} [opts.cancelLabel]
 * @param {boolean} [opts.dismissible]
 * @param {HTMLElement} [opts.initialFocus] focused synchronously so iOS opens the keyboard
 */
export function openSheet({ title, body, primaryLabel = 'Save', onPrimary, cancelLabel = 'Cancel', dismissible = true, initialFocus, onClose }) {
  if (activeSheet) {
    activeSheet.el.remove();
    activeSheet = null;
  }

  const primary = onPrimary
    ? h(
        'button',
        {
          class: 'sheet-btn primary',
          type: 'button',
          onclick: async () => {
            primary.disabled = true;
            try {
              if ((await onPrimary()) !== false) closeSheet();
            } finally {
              primary.disabled = false;
            }
          },
        },
        primaryLabel,
      )
    : h('span');

  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h(
      'header',
      { class: 'sheet-header' },
      dismissible ? h('button', { class: 'sheet-btn', type: 'button', onclick: closeSheet }, cancelLabel) : h('span'),
      h('h2', { class: 'sheet-title' }, title),
      primary,
    ),
    h('div', { class: 'sheet-body' }, body),
  );
  const backdrop = h(
    'div',
    {
      class: 'sheet-backdrop',
      onclick: (e) => {
        if (e.target === backdrop && dismissible) closeSheet();
      },
    },
    sheet,
  );

  document.body.append(backdrop);
  document.documentElement.classList.add('sheet-open');
  activeSheet = { el: backdrop, onClose };
  initialFocus?.focus({ preventScroll: true });
  requestAnimationFrame(() => backdrop.classList.add('open'));
  syncKeyboardInset();
  return { close: closeSheet, el: sheet };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeSheet) closeSheet();
});

// ---------------------------------------------------------------------------
// Toast

let toastTimer = null;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------------
// Form controls

export function segmented({ options, value, onChange, label }) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((opt) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'segment',
        'aria-checked': String(opt.value === value),
        onclick: () => {
          for (const b of buttons) b.setAttribute('aria-checked', String(b === buttonFor(opt.value)));
          onChange(opt.value);
        },
      },
      opt.label,
    ),
  );
  const buttonFor = (v) => buttons[options.findIndex((o) => o.value === v)];
  wrap.append(...buttons);
  return wrap;
}

export function amountInput({ currency, value = '', label, oninput, placeholder = '0' }) {
  const input = h('input', {
    class: 'amount-input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    enterkeyhint: 'done',
    placeholder,
    value,
    'aria-label': label,
    oninput,
  });
  const field = h('div', { class: 'amount-field', onclick: () => input.focus() }, h('span', { class: 'amount-symbol' }, currencySymbol(currency)), input);
  return { field, input };
}

export function fieldRow(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function select({ options, value, onchange, label, className = 'select' }) {
  return h(
    'select',
    { class: className, value, onchange, 'aria-label': label },
    options.map((o) => h('option', { value: o.value }, o.label)),
  );
}

export function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'empty-text' }, text) : null, action ?? null);
}

// ---------------------------------------------------------------------------
// Budget display

export function levelIcon(level, size = 16) {
  if (level === 'over') return icon('over', size);
  if (level === 'warn') return icon('warn', size);
  return icon('check', size);
}

// "92% used" / "Over by ₪40" with an icon, so status never relies on color alone.
export function budgetBadge(status, currency) {
  let text = `${percent(status.ratio)} used`;
  if (status.level === 'over') {
    text = status.remainingCents === 0 ? 'Budget used up' : `Over by ${money(-status.remainingCents, currency)}`;
  }
  return h('span', { class: `badge level-${status.level}` }, levelIcon(status.level, 14), text);
}

export function budgetMessage(status, currency) {
  const scope = status.key === 'total' ? `your overall ${periodWord(status.period)}ly budget` : `the ${periodWord(status.period)}ly budget`;
  if (status.level === 'over') {
    return status.remainingCents === 0
      ? `You've used all of ${scope} (${money(status.budgetCents, currency)}).`
      : `You're ${money(-status.remainingCents, currency)} over ${scope} of ${money(status.budgetCents, currency)}.`;
  }
  return `You've used ${percent(status.ratio)} of ${scope} — ${money(status.remainingCents, currency)} left of ${money(status.budgetCents, currency)}.`;
}

export function meter(status) {
  const pct = Math.min(Math.max(status.ratio, 0), 1) * 100;
  return h(
    'div',
    {
      class: `meter level-${status.level}`,
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(status.ratio * 100),
      'aria-label': `${status.label}: ${percent(status.ratio)} of budget`,
    },
    h('div', { class: 'meter-fill', style: { width: `${pct}%` } }),
  );
}

// ---------------------------------------------------------------------------
// Files

// iOS: the share sheet offers "Save to Files", AirDrop, Mail… Elsewhere: a normal download.
export async function shareFile(filename, mime, text) {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
