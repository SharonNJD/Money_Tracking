// Turns bank/card statements (CSV) and the Apple Pay Shortcuts log into transactions,
// and suggests a category for each from remembered shops and common merchant names. No DOM here.
import { isISODate, parseAmount } from './logic.js';

const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Text decoding: UTF-8 first, then the region's legacy encoding (e.g. Hebrew bank exports).

export function decodeText(buffer, fallbackEncoding = 'windows-1252') {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    try {
      return new TextDecoder(fallbackEncoding).decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

// ---------------------------------------------------------------------------
// CSV

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    // Count per line outside quotes; prefer delimiters that appear on many lines.
    const counts = lines.map((line) => {
      let n = 0;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === d && !quoted) n += 1;
      }
      return n;
    });
    const score = counts.filter((n) => n > 0).length * 1000 + counts.reduce((a, b) => a + b, 0);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function parseCSV(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Amounts and dates

// "-12.50", "(12.50)", "12.50-", "−12,50 €" → negative cents. Null if it isn't an amount.
export function parseSignedAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const cents = parseAmount(s);
  if (cents == null) return null;
  const negative = /[-−]/.test(s) || /^\(.*\)$/.test(s);
  return negative ? -cents : cents;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function buildDate(y, m, d) {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(iso) ? iso : null;
}

const fullYear = (y) => (y < 100 ? 2000 + y : y);
const monthFromName = (name) => MONTHS[name.slice(0, 3).toLowerCase()];

// order: 'dmy' (13/10/2026) or 'mdy' (10/13/2026). ISO and month-name dates work either way.
export function parseDate(raw, order = 'dmy') {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return buildDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    return order === 'mdy' ? buildDate(y, a, b) : buildDate(y, b, a);
  }
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2,4})\b/); // 12 Oct 2026
  if (m && monthFromName(m[2])) return buildDate(fullYear(+m[3]), monthFromName(m[2]), +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/); // Oct 12, 2026
  if (m && monthFromName(m[1])) return buildDate(+m[3], monthFromName(m[1]), +m[2]);
  return null;
}

// 'dmy' or 'mdy' when the values settle it (a part above 12), otherwise null.
export function detectDateOrder(values) {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  if (dmy !== mdy) return dmy ? 'dmy' : 'mdy';
  return null;
}

// ---------------------------------------------------------------------------
// Columns

const HINTS = {
  date: ['date', 'transaction date', 'purchase date', 'posting date', 'posted', 'value date', 'תאריך', 'תאריך עסקה', 'תאריך רכישה', 'datum', 'buchungstag', 'fecha', 'data'],
  description: ['description', 'merchant', 'merchant name', 'payee', 'name', 'details', 'narrative', 'memo', 'transaction', 'שם בית העסק', 'בית עסק', 'תיאור', 'פרטים', 'beschreibung', 'verwendungszweck', 'descripción', 'concepto', 'libellé'],
  amount: ['amount', 'charge amount', 'סכום חיוב', 'חיוב', 'debit', 'withdrawal', 'charge', 'סכום', 'betrag', 'importe', 'montant', 'sum', 'value'],
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

function bestColumn(header, hints, exclude) {
  let best = -1;
  let bestScore = 0;
  header.forEach((cell, col) => {
    if (exclude.includes(col)) return;
    const h = norm(cell);
    if (!h) return;
    hints.forEach((hint, i) => {
      const score = h === hint ? 1000 - i : h.includes(hint) ? 500 - i : 0;
      if (score > bestScore) {
        best = col;
        bestScore = score;
      }
    });
  });
  return best;
}

export function guessColumns(header) {
  const date = bestColumn(header, HINTS.date, []);
  const amount = bestColumn(header, HINTS.amount, [date]);
  const description = bestColumn(header, HINTS.description, [date, amount]);
  return { date, description, amount };
}

// No header row: pick columns by what the values look like.
function guessColumnsByContent(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  const sample = rows.slice(0, 30);
  const share = (col, test) => sample.filter((r) => test(r[col] ?? '')).length / sample.length;
  const cols = [...Array(width).keys()];
  const date = cols.reduce((best, c) => (share(c, (v) => parseDate(v)) > share(best, (v) => parseDate(v)) ? c : best), 0);
  const isAmount = (v) => /\d/.test(v) && !parseDate(v) && parseSignedAmount(v) != null && !/[a-z]{3,}/i.test(v);
  const amount = cols.filter((c) => c !== date).reduce((best, c) => (best < 0 || share(c, isAmount) > share(best, isAmount) ? c : best), -1);
  const textLen = (c) => sample.reduce((n, r) => n + (isAmount(r[c] ?? '') ? 0 : (r[c] ?? '').length), 0);
  const description = cols.filter((c) => c !== date && c !== amount).reduce((best, c) => (best < 0 || textLen(c) > textLen(best) ? c : best), -1);
  return { date, description, amount };
}

// Finds the header row (bank exports often start with title lines) and the likely columns.
export function analyzeStatement(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cols = guessColumns(rows[i]);
    if (cols.date >= 0 && cols.amount >= 0) return { headerRow: i, ...cols };
  }
  return { headerRow: -1, ...guessColumnsByContent(rows) };
}

export function detectExpenseSign(rows, { headerRow, amount }) {
  let negative = 0;
  let positive = 0;
  for (const r of rows.slice(headerRow + 1)) {
    const v = parseSignedAmount(r[amount]);
    if (v < 0) negative += 1;
    else if (v > 0) positive += 1;
  }
  return negative > positive ? 'negative' : 'positive';
}

// expenseSign: are purchases shown as 'negative' (bank accounts) or 'positive' (most card statements)?
export function statementTransactions(rows, { headerRow, date, description, amount, dateOrder = 'dmy', expenseSign = 'positive' }) {
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const d = parseDate(r[date], dateOrder);
    const signed = parseSignedAmount(r[amount]);
    if (!d || !signed) continue;
    out.push({
      date: d,
      merchant: cleanMerchant(r[description] ?? ''),
      amountCents: Math.abs(signed),
      isExpense: expenseSign === 'negative' ? signed < 0 : signed > 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apple Pay log, written by the Shortcuts "Transaction" automation: MT|date|merchant|amount

export function isApplePayLog(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  const piped = lines.filter((l) => l.split('|').length >= 3).length;
  return piped / lines.length >= 0.8;
}

export function parseApplePayLog(text, dateOrder = 'dmy') {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    let parts = line.split('|').map((p) => p.trim());
    if (parts[0]?.toUpperCase() === 'MT') parts = parts.slice(1);
    if (parts.length < 3) continue;
    const [rawDate, merchant, rawAmount] = parts;
    const date = parseDate(rawDate, dateOrder);
    const signed = parseSignedAmount(rawAmount);
    if (!date || !signed) continue;
    out.push({ date, merchant: cleanMerchant(merchant), amountCents: Math.abs(signed), isExpense: signed > 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merchants and categories

// For display: collapse spaces and tame ALL-CAPS card descriptors.
export function cleanMerchant(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (/[a-z]/.test(s) || !/[A-Z]{3}/.test(s)) return s || 'Unknown';
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// For matching: "SQ *BLUE BOTTLE #123" → "blue bottle".
export function merchantKey(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/^(sq|tst|pp|paypal|pos|sumup|zettle|izettle)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// Common merchant words → default category names. Matched on word starts, so "restaurant" finds "restaurants".
const KEYWORDS = {
  Groceries: ['supermarket', 'grocery', 'groceries', 'walmart', 'tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'kroger', 'safeway', 'whole foods', 'trader joe', 'costco', 'carrefour', 'rewe', 'edeka', 'shufersal', 'rami levy', 'yochananof', 'osher ad', 'tiv taam', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד'],
  'Eating out': ['restaurant', 'cafe', 'café', 'coffee', 'starbucks', 'mcdonald', 'burger', 'pizza', 'kfc', 'subway', 'domino', 'sushi', 'bistro', 'wolt', 'deliveroo', 'doordash', 'uber eats', 'ubereats', 'just eat', 'grubhub', 'aroma', 'cofix', 'ארומה', 'קפה', 'מסעדת', 'מסעדה', 'פיצה', 'וולט'],
  Transport: ['uber', 'lyft', 'taxi', 'gett', 'bolt', 'fuel', 'petrol', 'shell', 'bp', 'esso', 'chevron', 'exxon', 'texaco', 'parking', 'railway', 'rail', 'metro', 'pango', 'rav kav', 'sonol', 'dor alon', 'פז', 'דלק', 'סונול', 'חניה', 'חניון', 'רכבת', 'מונית', 'פנגו'],
  'Home & bills': ['electric', 'electricity', 'water', 'internet', 'broadband', 'vodafone', 'verizon', 't mobile', 'comcast', 'partner', 'cellcom', 'pelephone', 'bezeq', 'insurance', 'arnona', 'rent', 'חשמל', 'מים', 'ארנונה', 'בזק', 'סלקום', 'פרטנר', 'פלאפון', 'ביטוח'],
  Shopping: ['amazon', 'ebay', 'aliexpress', 'shein', 'zara', 'h m', 'uniqlo', 'ikea', 'target', 'best buy', 'primark', 'decathlon', 'castro', 'ksp', 'איקאה', 'קסטרו', 'זארה'],
  Fun: ['netflix', 'spotify', 'disney', 'hbo', 'youtube', 'cinema', 'movie', 'theatre', 'theater', 'steam', 'playstation', 'xbox', 'nintendo', 'ticketmaster', 'concert', 'yes planet', 'סינמה', 'נטפליקס', 'ספוטיפיי'],
  Health: ['pharmacy', 'chemist', 'cvs', 'walgreens', 'boots', 'super pharm', 'superpharm', 'be pharm', 'clinic', 'doctor', 'dental', 'dentist', 'hospital', 'optic', 'gym', 'fitness', 'סופר פארם', 'בית מרקחת', 'מרפאה'],
};

function keywordCategoryName(key) {
  const padded = ` ${key}`;
  for (const [name, words] of Object.entries(KEYWORDS)) {
    for (const word of words) {
      // Short words must match whole words ("bp" shouldn't match "bpm").
      if (word.length <= 3 ? ` ${key} `.includes(` ${word} `) : padded.includes(` ${word}`)) return name;
    }
  }
  return null;
}

// Longest remembered pattern contained in the merchant wins.
export function matchRule(rules, key) {
  let best = null;
  for (const r of rules) {
    if (key.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

// → { categoryId, from: 'rule' | 'keyword' } or null.
export function suggestCategory(state, merchant) {
  const key = merchantKey(merchant);
  const active = state.categories.filter((c) => !c.archived);
  const rule = matchRule(state.rules ?? [], key);
  if (rule && active.some((c) => c.id === rule.categoryId)) return { categoryId: rule.categoryId, from: 'rule' };
  const name = keywordCategoryName(key);
  const byName = name && active.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return byName ? { categoryId: byName.id, from: 'keyword' } : null;
}

// Stable keys so importing the same purchases twice is caught. Identical purchases on one day get #1, #2…
export function withImportKeys(transactions) {
  const seen = new Map();
  return transactions.map((t) => {
    const base = `${t.date}|${t.amountCents}|${merchantKey(t.merchant)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...t, key: `${base}|${n}` };
  });
}
