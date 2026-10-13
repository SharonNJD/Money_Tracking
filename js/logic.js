// Pure, DOM-free logic: dates, money parsing, totals, budgets, check-ins, import/export.
// Dates are local calendar days stored as 'YYYY-MM-DD'. Amounts are integer cents.

export const WEEK_END_DAY = 5; // Friday (0 = Sunday), so weeks run Saturday → Friday.
export const PERIODS = ['week', 'month'];
export const LEVEL_RANK = { ok: 0, warn: 1, over: 2 };
export const PALETTE_SIZE = 8;
export const DEFAULT_WARN_AT = 0.8;
export const SOURCES = ['checkin', 'single', 'import', 'recurring'];
export const SOURCE_LABELS = { checkin: 'Weekly check-in', single: 'Expense', import: 'Imported', recurring: 'Recurring' };

// `key`s stay fixed when you rename things, so auto-sorting keeps working (see classify.js).
export const DEFAULT_CATEGORIES = [
  { key: 'groceries', emoji: '🛒', name: 'Groceries', color: 0, types: [['supermarket', '🛒', 'Supermarket'], ['bakery', '🥖', 'Bakery'], ['produce', '🍎', 'Market & produce'], ['drinks', '🍷', 'Drinks & alcohol'], ['convenience', '🏪', 'Convenience store']] },
  { key: 'eating', emoji: '🍽️', name: 'Eating out', color: 1, types: [['coffee', '☕', 'Coffee'], ['fastfood', '🍔', 'Fast food'], ['restaurant', '🍝', 'Restaurants'], ['delivery', '🛵', 'Delivery'], ['bars', '🍺', 'Bars & drinks']] },
  { key: 'transport', emoji: '🚗', name: 'Transport', color: 2, types: [['fuel', '⛽', 'Fuel'], ['public', '🚌', 'Public transport'], ['taxi', '🚕', 'Taxi & rides'], ['parking', '🅿️', 'Parking & tolls'], ['car', '🔧', 'Car care']] },
  { key: 'home', emoji: '🏠', name: 'Home & bills', color: 3, types: [['rent', '🔑', 'Rent & mortgage'], ['utilities', '💡', 'Electricity & water'], ['phone', '📱', 'Phone & internet'], ['insurance', '🛡️', 'Insurance'], ['taxes', '🧾', 'Taxes & fees'], ['supplies', '🧹', 'Supplies & repairs']] },
  { key: 'shopping', emoji: '🛍️', name: 'Shopping', color: 4, types: [['clothes', '👕', 'Clothes & shoes'], ['electronics', '💻', 'Electronics'], ['homegoods', '🛋️', 'Home & furniture'], ['beauty', '💄', 'Beauty & care'], ['online', '📦', 'Online orders']] },
  { key: 'fun', emoji: '🎉', name: 'Fun', color: 5, types: [['subscriptions', '📺', 'Subscriptions'], ['movies', '🎬', 'Movies & shows'], ['hobbies', '🎮', 'Games & hobbies'], ['travel', '✈️', 'Travel'], ['events', '🎟️', 'Events & outings']] },
  { key: 'health', emoji: '💊', name: 'Health', color: 7, types: [['pharmacy', '💊', 'Pharmacy'], ['doctor', '🩺', 'Doctor & dentist'], ['fitness', '🏋️', 'Gym & sport'], ['optics', '👓', 'Glasses & optics']] },
  { key: 'other', emoji: '📦', name: 'Other', color: 6, types: [['gifts', '🎁', 'Gifts'], ['education', '📚', 'Education'], ['pets', '🐶', 'Pets'], ['kids', '👶', 'Kids'], ['fees', '🏦', 'Bank fees'], ['donations', '❤️', 'Donations']] },
];

export function defaultTypes(categoryKey) {
  const def = DEFAULT_CATEGORIES.find((c) => c.key === categoryKey);
  return def ? def.types.map(([key, emoji, name]) => ({ id: newId(), key, name, emoji })) : [];
}

export function newCategory({ key, emoji, name, color }) {
  return { id: newId(), ...(key ? { key } : {}), name, emoji, color, budget: null, archived: false, types: defaultTypes(key) };
}

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

// Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier).
export function daysBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / 86_400_000);
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

export function totalsByType(expenses, { start, end, categoryId }) {
  const totals = new Map();
  for (const e of expenses) {
    if (e.categoryId !== categoryId || (start && e.date < start) || (end && e.date > end)) continue;
    const key = e.typeId ?? '';
    totals.set(key, (totals.get(key) ?? 0) + e.amountCents);
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

// Consecutive logged weeks. The latest week doesn't break the streak until the next Friday passes.
export function checkinStreak(state, todayIso) {
  let we = dueWeekEnd(todayIso);
  if (!state.checkins[we]) we = addDays(we, -7);
  let streak = 0;
  while (state.checkins[we]) {
    streak += 1;
    we = addDays(we, -7);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Recurring payments

export const FREQUENCIES = ['month', 'week'];
const MAX_CATCH_UP = 60;

// Dates in [fromIso, toIso] when a recurring payment falls. Monthly days past the month's end use its last day.
export function occurrencesBetween(item, fromIso, toIso) {
  const dates = [];
  if (fromIso > toIso) return dates;
  if (item.frequency === 'week') {
    let d = addDays(fromIso, (item.day - parseISODate(fromIso).getDay() + 7) % 7);
    for (; d <= toIso; d = addDays(d, 7)) dates.push(d);
    return dates;
  }
  for (let month = monthStartFor(fromIso); month <= toIso; month = shiftPeriod('month', month, 1)) {
    const last = monthEndFor(month);
    const day = Math.min(item.day, Number(last.slice(8)));
    const d = `${month.slice(0, 8)}${String(day).padStart(2, '0')}`;
    if (d >= fromIso && d <= toIso) dates.push(d);
  }
  return dates;
}

export function nextOccurrence(item, todayIso) {
  let from = todayIso > item.startDate ? todayIso : item.startDate;
  if (item.lastAdded && item.lastAdded >= from) from = addDays(item.lastAdded, 1);
  return occurrencesBetween(item, from, addDays(from, 62))[0] ?? null;
}

// Payments that have fallen due and haven't been added yet.
export function dueRecurring(state, todayIso) {
  const due = [];
  for (const item of state.recurring) {
    if (!item.active) continue;
    const from = item.lastAdded ? addDays(item.lastAdded, 1) : item.startDate;
    const dates = occurrencesBetween(item, from, todayIso).slice(-MAX_CATCH_UP);
    for (const date of dates) due.push({ item, date });
  }
  return due;
}

// Adds due recurring payments to `state` (mutates). Returns what was added.
export function applyRecurring(state, todayIso, now = new Date().toISOString()) {
  const due = dueRecurring(state, todayIso);
  for (const { item, date } of due) {
    state.expenses.push({
      id: newId(),
      categoryId: item.categoryId,
      amountCents: item.amountCents,
      date,
      note: item.name,
      source: 'recurring',
      recurringId: item.id,
      ...(item.typeId ? { typeId: item.typeId } : {}),
      createdAt: now,
    });
    if (!item.lastAdded || date > item.lastAdded) item.lastAdded = date;
  }
  return due;
}

// ---------------------------------------------------------------------------
// Savings goals

export function goalProgress(goal, todayIso) {
  const savedCents = goal.deposits.reduce((sum, d) => sum + d.cents, 0);
  const remainingCents = Math.max(0, goal.targetCents - savedCents);
  const reached = savedCents >= goal.targetCents;
  let perWeekCents = null;
  let weeksLeft = null;
  if (goal.deadline && !reached && goal.deadline >= todayIso) {
    weeksLeft = Math.max(1, Math.ceil((daysBetween(todayIso, goal.deadline) + 1) / 7));
    perWeekCents = Math.ceil(remainingCents / weeksLeft / 100) * 100;
  }
  return {
    savedCents,
    remainingCents,
    ratio: goal.targetCents > 0 ? Math.max(0, savedCents) / goal.targetCents : 0,
    reached,
    overdue: Boolean(goal.deadline && !reached && goal.deadline < todayIso),
    weeksLeft,
    perWeekCents,
  };
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
    categories: DEFAULT_CATEGORIES.map(newCategory),
    expenses: [],
    checkins: {},
    rules: [],
    recurring: [],
    goals: [],
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
    const name = String(c.name ?? '').trim().slice(0, 40) || 'Unnamed';
    // Data from before types existed: default categories (matched by name) get their default types.
    const key = typeof c.key === 'string' && c.key ? c.key : Array.isArray(c.types) ? null : DEFAULT_CATEGORIES.find((d) => d.name === name)?.key;
    const types = Array.isArray(c.types)
      ? c.types
          .filter((t) => isObject(t) && typeof t.id === 'string' && t.id && typeof t.name === 'string' && t.name.trim())
          .map((t) => ({ id: t.id, ...(typeof t.key === 'string' && t.key ? { key: t.key } : {}), name: t.name.trim().slice(0, 40), emoji: typeof t.emoji === 'string' && t.emoji.trim() ? t.emoji.trim().slice(0, 16) : '•' }))
      : defaultTypes(key);
    return {
      id: c.id,
      ...(key ? { key } : {}),
      name,
      emoji: typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim().slice(0, 16) : '🏷️',
      color: Number.isInteger(c.color) ? ((c.color % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE : i % PALETTE_SIZE,
      budget: normalizeBudget(c.budget),
      archived: Boolean(c.archived),
      types,
    };
  });
  const typeIds = new Map(categories.map((c) => [c.id, new Set(c.types.map((t) => t.id))]));
  const validType = (categoryId, typeId) => typeof typeId === 'string' && typeIds.get(categoryId)?.has(typeId);

  const categoryIds = new Set(categories.map((c) => c.id));
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
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
      note: text(e.note, 200),
      source: SOURCES.includes(e.source) ? e.source : 'single',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
      ...(e.merchant ? { merchant: text(e.merchant, 120) } : {}),
      ...(e.importKey ? { importKey: text(e.importKey, 300) } : {}),
      ...(e.recurringId ? { recurringId: text(e.recurringId, 80) } : {}),
      ...(validType(e.categoryId, e.typeId) ? { typeId: e.typeId } : {}),
    };
  });

  // Optional collections: invalid items are dropped rather than failing the whole backup.
  const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
  const rules = list(raw.rules)
    .filter((r) => typeof r.pattern === 'string' && r.pattern.trim().length >= 2 && categoryIds.has(r.categoryId))
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      pattern: r.pattern.trim().toLowerCase().slice(0, 80),
      categoryId: r.categoryId,
      ...(validType(r.categoryId, r.typeId) ? { typeId: r.typeId } : {}),
    }));

  const recurring = list(raw.recurring)
    .filter(
      (r) =>
        categoryIds.has(r.categoryId) &&
        Number.isSafeInteger(r.amountCents) &&
        r.amountCents > 0 &&
        FREQUENCIES.includes(r.frequency) &&
        Number.isInteger(r.day) &&
        (r.frequency === 'week' ? r.day >= 0 && r.day <= 6 : r.day >= 1 && r.day <= 31) &&
        isISODate(r.startDate),
    )
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name: text(r.name, 40).trim() || 'Payment',
      categoryId: r.categoryId,
      amountCents: r.amountCents,
      frequency: r.frequency,
      day: r.day,
      startDate: r.startDate,
      lastAdded: isISODate(r.lastAdded) ? r.lastAdded : null,
      active: r.active !== false,
      ...(validType(r.categoryId, r.typeId) ? { typeId: r.typeId } : {}),
    }));

  const goals = list(raw.goals)
    .filter((g) => Number.isSafeInteger(g.targetCents) && g.targetCents > 0)
    .map((g) => ({
      id: typeof g.id === 'string' && g.id ? g.id : newId(),
      name: text(g.name, 40).trim() || 'Goal',
      emoji: typeof g.emoji === 'string' && g.emoji.trim() ? g.emoji.trim().slice(0, 16) : '🎯',
      targetCents: g.targetCents,
      deadline: isISODate(g.deadline) ? g.deadline : null,
      deposits: list(g.deposits)
        .filter((d) => Number.isSafeInteger(d.cents) && d.cents !== 0 && isISODate(d.date))
        .map((d) => ({ id: typeof d.id === 'string' && d.id ? d.id : newId(), date: d.date, cents: d.cents })),
      createdAt: isISODate(g.createdAt) ? g.createdAt : base.createdAt,
    }));

  const checkins = {};
  if (isObject(raw.checkins)) {
    for (const [weekEnd, at] of Object.entries(raw.checkins)) {
      if (isISODate(weekEnd)) checkins[weekEnd] = String(at);
    }
  }

  return { version: 1, createdAt: base.createdAt, settings, categories, expenses, checkins, rules, recurring, goals };
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
      e.note || e.merchant || '',
      SOURCE_LABELS[e.source] ?? 'Expense',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
