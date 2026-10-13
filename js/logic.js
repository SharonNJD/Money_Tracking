// Pure, DOM-free logic: dates, money parsing, totals, budgets, check-ins, import/export.
// Dates are local calendar days stored as 'YYYY-MM-DD'. Amounts are integer cents.

export const WEEK_END_DAY = 5; // Friday (0 = Sunday), so weeks run Saturday → Friday.
export const PERIODS = ['week', 'month'];
export const LEVEL_RANK = { ok: 0, warn: 1, over: 2 };
export const PALETTE_SIZE = 8;
export const DEFAULT_WARN_AT = 0.8;

export const DEFAULT_CATEGORIES = [
  { emoji: '🛒', name: 'Groceries', color: 0 },
  { emoji: '🍽️', name: 'Eating out', color: 1 },
  { emoji: '🚗', name: 'Transport', color: 2 },
  { emoji: '🏠', name: 'Home & bills', color: 3 },
  { emoji: '🛍️', name: 'Shopping', color: 4 },
  { emoji: '🎉', name: 'Fun', color: 5 },
  { emoji: '💊', name: 'Health', color: 7 },
  { emoji: '📦', name: 'Other', color: 6 },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Dates

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Noon avoids DST edge cases when adding days.
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function isISODate(value) {
  return typeof value === 'string' && ISO_DATE.test(value) && toISODate(parseISODate(value)) === value;
}

export function addDays(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function weekEndFor(iso, weekEndDay = WEEK_END_DAY) {
  const diff = (weekEndDay - parseISODate(iso).getDay() + 7) % 7;
  return addDays(iso, diff);
}

export function weekStartFor(iso, weekEndDay = WEEK_END_DAY) {
  return addDays(weekEndFor(iso, weekEndDay), -6);
}

export function monthStartFor(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEndFor(iso) {
  const d = parseISODate(monthStartFor(iso));
  d.setMonth(d.getMonth() + 1, 0);
  return toISODate(d);
}

export function periodRange(period, iso) {
  if (period === 'week') return { start: weekStartFor(iso), end: weekEndFor(iso) };
  if (period === 'month') return { start: monthStartFor(iso), end: monthEndFor(iso) };
  throw new Error(`Unknown period: ${period}`);
}

// A date inside the period `n` periods away from the one containing `iso`.
export function shiftPeriod(period, iso, n) {
  if (period === 'week') return addDays(weekEndFor(iso), 7 * n);
  const d = parseISODate(monthStartFor(iso));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// Money

// Parses what people type on a phone keypad: "12", "12.5", "12,50", "1,234.56", "1.234,56", "₪ 40".
// Returns integer cents, or null when the input isn't a usable amount.
export function parseAmount(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  }
  const s = String(input ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    // A single separator followed by exactly three digits reads as thousands ("1,500").
    if (occurrences === 1 && digitsAfter !== 3) decimalSep = sep;
  }

  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const i = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, i);
    fracPart = s.slice(i + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (/[.,]/.test(fracPart) || fracPart.length > 2) return null;

  const cents = Number(intPart || '0') * 100 + Number(fracPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

// ---------------------------------------------------------------------------
// Totals

export function sumExpenses(expenses, { start, end, categoryId } = {}) {
  let total = 0;
  for (const e of expenses) {
    if (start && e.date < start) continue;
    if (end && e.date > end) continue;
    if (categoryId && e.categoryId !== categoryId) continue;
    total += e.amountCents;
  }
  return total;
}

export function totalsByCategory(expenses, { start, end } = {}) {
  const totals = new Map();
  for (const e of expenses) {
    if (start && e.date < start) continue;
    if (end && e.date > end) continue;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amountCents);
  }
  return totals;
}

// Totals for the `count` periods ending with the one containing `refISO`, oldest first.
export function periodSeries(expenses, { period, count, refISO, categoryId }) {
  const series = [];
  for (let i = count - 1; i >= 0; i--) {
    const { start, end } = periodRange(period, shiftPeriod(period, refISO, -i));
    series.push({ start, end, cents: sumExpenses(expenses, { start, end, categoryId }) });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Budgets

export function budgetLevel(spentCents, budgetCents, warnAt = DEFAULT_WARN_AT) {
  if (!(budgetCents > 0)) return 'ok';
  const ratio = spentCents / budgetCents;
  if (ratio >= 1) return 'over';
  if (ratio >= warnAt) return 'warn';
  return 'ok';
}

function makeStatus({ key, label, emoji, color, budget, spentCents, warnAt, refISO }) {
  const { start, end } = periodRange(budget.period, refISO);
  return {
    key,
    label,
    emoji,
    color,
    period: budget.period,
    start,
    end,
    budgetCents: budget.amountCents,
    spentCents,
    remainingCents: budget.amountCents - spentCents,
    ratio: spentCents / budget.amountCents,
    level: budgetLevel(spentCents, budget.amountCents, warnAt),
  };
}

// Status of every active budget for the period(s) containing `refISO`.
// `extra` maps categoryId → cents not saved yet, for previews while typing.
export function budgetStatuses(state, refISO, extra = new Map()) {
  const warnAt = state.settings.warnAt ?? DEFAULT_WARN_AT;
  const statuses = [];
  let extraTotal = 0;
  for (const cents of extra.values()) extraTotal += cents;

  for (const c of state.categories) {
    if (c.archived || !c.budget) continue;
    const { start, end } = periodRange(c.budget.period, refISO);
    const spentCents = sumExpenses(state.expenses, { start, end, categoryId: c.id }) + (extra.get(c.id) ?? 0);
    statuses.push(
      makeStatus({ key: c.id, label: c.name, emoji: c.emoji, color: c.color, budget: c.budget, spentCents, warnAt, refISO }),
    );
  }

  const total = state.settings.totalBudget;
  if (total) {
    const { start, end } = periodRange(total.period, refISO);
    const spentCents = sumExpenses(state.expenses, { start, end }) + extraTotal;
    statuses.push(
      makeStatus({ key: 'total', label: 'Overall', emoji: '💰', color: null, budget: total, spentCents, warnAt, refISO }),
    );
  }
  return statuses;
}

// Budgets whose level got worse between two snapshots (ok → warn, warn → over, ...).
export function escalations(before, after) {
  const previous = new Map(before.map((s) => [s.key, s.level]));
  return after.filter((s) => LEVEL_RANK[s.level] > LEVEL_RANK[previous.get(s.key) ?? 'ok']);
}

// ---------------------------------------------------------------------------
// Weekly check-ins

// The most recent week end on or before today: the week that should be logged next.
export function dueWeekEnd(todayIso) {
  const end = weekEndFor(todayIso);
  return end === todayIso ? end : addDays(end, -7);
}

// Week ends (newest first) since the app was set up that have no check-in yet.
export function pendingCheckins(state, todayIso, max = 8) {
  const first = weekEndFor(state.createdAt);
  const pending = [];
  for (let we = dueWeekEnd(todayIso); we >= first && pending.length < max; we = addDays(we, -7)) {
    if (!state.checkins[we]) pending.push(we);
  }
  return pending;
}

// Check-in entries for a week are dated on its Friday, or today if that Friday hasn't come yet.
export function checkinDate(weekEnd, todayIso) {
  return weekEnd > todayIso ? todayIso : weekEnd;
}

// ---------------------------------------------------------------------------
// State, import & export

export function defaultState({ today = todayISO(), currency = 'USD' } = {}) {
  return {
    version: 1,
    createdAt: today,
    settings: {
      currency,
      warnAt: DEFAULT_WARN_AT,
      reminderTime: '18:00',
      reminderAdded: false,
      totalBudget: null,
      lastBackup: null,
      onboarded: false,
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ id: newId(), ...c, budget: null, archived: false })),
    expenses: [],
    checkins: {},
  };
}

function normalizeBudget(budget) {
  if (!isObject(budget)) return null;
  const { amountCents, period } = budget;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !PERIODS.includes(period)) return null;
  return { amountCents, period };
}

// Validates saved or imported data and fills in anything missing. Throws on unusable input.
export function normalizeState(raw) {
  if (!isObject(raw)) throw new Error('This is not a Money Tracker backup.');
  if (!Array.isArray(raw.categories) || !Array.isArray(raw.expenses)) {
    throw new Error('The backup is missing categories or expenses.');
  }

  const base = defaultState({ today: isISODate(raw.createdAt) ? raw.createdAt : todayISO() });
  const s = isObject(raw.settings) ? raw.settings : {};
  const settings = {
    currency: typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency) ? s.currency : 'USD',
    warnAt: Number(s.warnAt) >= 0.1 && Number(s.warnAt) <= 1 ? Number(s.warnAt) : DEFAULT_WARN_AT,
    reminderTime: typeof s.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(s.reminderTime) ? s.reminderTime : '18:00',
    reminderAdded: Boolean(s.reminderAdded),
    totalBudget: normalizeBudget(s.totalBudget),
    lastBackup: typeof s.lastBackup === 'string' ? s.lastBackup : null,
    onboarded: Boolean(s.onboarded),
  };

  const categories = raw.categories.map((c, i) => {
    if (!isObject(c) || typeof c.id !== 'string' || !c.id) throw new Error(`Category #${i + 1} is invalid.`);
    return {
      id: c.id,
      name: String(c.name ?? '').trim().slice(0, 40) || 'Unnamed',
      emoji: typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim().slice(0, 16) : '🏷️',
      color: Number.isInteger(c.color) ? ((c.color % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE : i % PALETTE_SIZE,
      budget: normalizeBudget(c.budget),
      archived: Boolean(c.archived),
    };
  });

  const categoryIds = new Set(categories.map((c) => c.id));
  const expenses = raw.expenses.map((e, i) => {
    const valid =
      isObject(e) &&
      categoryIds.has(e.categoryId) &&
      isISODate(e.date) &&
      Number.isSafeInteger(e.amountCents) &&
      e.amountCents >= 0;
    if (!valid) throw new Error(`Expense #${i + 1} is invalid.`);
    return {
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      categoryId: e.categoryId,
      amountCents: e.amountCents,
      date: e.date,
      note: typeof e.note === 'string' ? e.note.slice(0, 200) : '',
      source: e.source === 'checkin' ? 'checkin' : 'single',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
    };
  });

  const checkins = {};
  if (isObject(raw.checkins)) {
    for (const [weekEnd, at] of Object.entries(raw.checkins)) {
      if (isISODate(weekEnd)) checkins[weekEnd] = String(at);
    }
  }

  return { version: 1, createdAt: base.createdAt, settings, categories, expenses, checkins };
}

function csvCell(value) {
  let s = String(value);
  // Stop spreadsheet apps from treating free text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(state) {
  const categories = new Map(state.categories.map((c) => [c.id, c]));
  const rows = [['Date', 'Category', 'Amount', 'Currency', 'Note', 'Type']];
  const sorted = [...state.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const e of sorted) {
    rows.push([
      e.date,
      categories.get(e.categoryId)?.name ?? 'Unknown',
      (e.amountCents / 100).toFixed(2),
      state.settings.currency,
      e.note ?? '',
      e.source === 'checkin' ? 'Weekly check-in' : 'Expense',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
