// Understands what people type or paste: "coffee 18", "uber 32 yesterday, pizza 45",
// bank and card text messages, receipts, and text copied from a bank-app screenshot (iPhone Live Text).
// Pure functions; returns transactions for the review step. No lookbehind regexes: older iOS can't parse them.
import { addDays, isISODate, parseAmount, parseISODate, toISODate } from './logic.js';
import { cleanMerchant } from './importer.js';

const HEB = '\\u0590-\\u05FF';
const CURRENCY_SYMBOL = /[$€£₪¥]/;
const CODE_BEFORE = /(?:^|[^a-z])(ils|nis|usd|eur|gbp)\s*$/i;
const AFTER_CURRENCY = /^\s*(?:[$€£₪¥]|ils\b|nis\b|usd\b|eur\b|gbp\b|ש["״׳']?ח|שקל(?:ים)?|dollars?\b|euros?\b|bucks\b)/i;
const AMOUNT_HINT = /(amount|total|charged?|purchase|spent|paid|payment|transaction|withdrawal|סכום|בסך|סך|חיוב|לתשלום|סה["״]?כ|עסקה)[\s:of]*$/i;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

const MONTH_WORD = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
// "12.50" is an amount, so dotted dates only count with a year (12.10.26); slashes and dashes always do.
const DATE_PATTERNS = [
  /\b\d{4}-\d{1,2}-\d{1,2}(?:T[\d:.+-]+Z?)?/g, // 2026-10-12 / ISO with time
  /\b\d{1,2}[/-]\d{1,2}(?:[./-]\d{2,4})?\b/g, // 12/10, 12/10/26
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, // 12.10.2026
  new RegExp(`\\b\\d{1,2}\\s+${MONTH_WORD}(?:,?\\s+\\d{2,4})?\\b`, 'gi'), // 12 Oct 2026
  new RegExp(`\\b${MONTH_WORD}\\s+\\d{1,2}(?:,?\\s+\\d{4})?\\b`, 'gi'), // Oct 12, 2026
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // times
];
const CARD_DIGITS = /(?:ending(?:\s+in)?|card|כרטיס(?:\s+המסתיים)?|המסתיים|\*{2,}|x{3,}|•{2,})\s*(?:ב-?|in\s+)?(\d{4})\b/gi;

const REFUND = /\b(refund(?:ed)?|credited|deposit(?:ed)?|salary|cashback|money received)\b|זיכוי|החזר|משכורת|הפקדה|התקבל/i;
const RECEIPT_TOTAL = /(?:^|\s)(total|amount due|balance due|grand total|to pay|סה["״]?כ(?:\s+לתשלום)?|סך הכל|לתשלום|סכום לתשלום)(?:\s|:|$)/i;
const SUBTOTAL = /sub\s*-?total|ביניים|לפני מע["״]?מ|מע["״]?מ\s*\d/i;
const MESSAGE_WORDS = /\b(card|transaction|purchase|charged|approved|spent|debit)\b|כרטיס|עסקה|חיוב|אושרה|בוצעה|בבית העסק/i;

const FILLER = new Set([
  'spent', 'paid', 'pay', 'bought', 'buy', 'got', 'for', 'on', 'at', 'the', 'a', 'an', 'my', 'from', 'to', 'into', 'by', 'credited', 'debited', 'today', 'yesterday', 'transaction', 'purchase', 'card', 'ending', 'in', 'approved', 'was', 'made', 'your', 'of', 'amount', 'total', 'charged', 'charge', 'with', 'using', 'has', 'been',
  'קניתי', 'שילמתי', 'על', 'עבור', 'היום', 'אתמול', 'שלשום', 'עסקה', 'בסך', 'סך', 'סכום', 'חיוב', 'בכרטיס', 'כרטיס', 'המסתיים', 'אושרה', 'בוצעה', 'שח', 'ב', 'ב-', 'של',
]);

const WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const HEB_WEEKDAYS = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Replaces matches with spaces so indexes stay put.
function blank(text, regex, group = 0, collect) {
  return text.replace(regex, (...m) => {
    const whole = m[0];
    const part = m[group];
    if (collect) collect.push(whole);
    if (group === 0) return ' '.repeat(whole.length);
    const at = whole.lastIndexOf(part);
    return whole.slice(0, at) + ' '.repeat(part.length) + whole.slice(at + part.length);
  });
}

function mostRecent(weekday, today) {
  const diff = (parseISODate(today).getDay() - weekday + 7) % 7;
  return addDays(today, -diff);
}

// Dates written in the text: explicit (12/10, 2026-10-12, 12 Oct) or words (yesterday, אתמול, on monday).
export function findDate(text, { today, dateOrder = 'dmy' }) {
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    if (isISODate(d)) return d;
  }
  const dm = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[./-](\d{2,4}))?\b/) ?? text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (dm) {
    let [a, b] = [Number(dm[1]), Number(dm[2])];
    if (dateOrder === 'mdy') [a, b] = [b, a];
    const explicitYear = dm[3] ? (Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3])) : null;
    let year = explicitYear ?? Number(today.slice(0, 4));
    let d = `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    if (isISODate(d)) {
      if (!explicitYear && d > today) d = `${year - 1}${d.slice(4)}`;
      return d;
    }
  }
  for (const named of text.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?\b|\b([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi)) {
    const day = Number(named[1] ?? named[5]);
    const month = MONTHS[(named[2] ?? named[4]).slice(0, 3).toLowerCase()];
    if (!month) continue;
    const explicitYear = named[3] ?? named[6];
    const year = Number(explicitYear ?? today.slice(0, 4));
    const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isISODate(d)) return !explicitYear && d > today ? `${year - 1}${d.slice(4)}` : d;
  }
  const lower = text.toLowerCase();
  if (/\byesterday\b|אתמול/.test(lower)) return addDays(today, -1);
  if (/שלשום/.test(lower)) return addDays(today, -2);
  if (/\btoday\b|היום/.test(lower)) return today;
  // Full day names anywhere; short ones ("fri") only after "on"/"last" so shop names like "Sun Bar" don't count.
  const en = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(?:on|last)\s+(sun|mon|tues?|wed|thu(?:rs)?|fri|sat)\b/);
  if (en) return mostRecent(WEEKDAYS[en[1] ?? en[2]], today);
  const he = text.match(new RegExp(`יום\\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי)|(?:^|[^${HEB}])ב?(שבת)(?:[^${HEB}]|$)`));
  if (he) return mostRecent(HEB_WEEKDAYS[he[1] ?? he[2]], today);
  return null;
}

// Every amount in the text with a score: currency signs and words like "total" make a number likelier.
export function findAmounts(text) {
  let masked = text;
  for (const re of DATE_PATTERNS) masked = blank(masked, re);
  masked = blank(masked, CARD_DIGITS, 1);
  masked = blank(masked, /\b\d+(?:[.,]\d+)?\s*%/g);
  masked = blank(masked, /\+?\d[\d -]{8,}\d/g); // phone numbers

  const found = [];
  for (const m of masked.matchAll(NUMBER)) {
    const start = m.index;
    let end = start + m[0].length;
    const before = masked.slice(Math.max(0, start - 4), start);
    const after = masked.slice(end, end + 10);
    const afterCurrency = after.match(AFTER_CURRENCY);
    const currency = CURRENCY_SYMBOL.test(before) || CODE_BEFORE.test(before) || Boolean(afterCurrency);
    if (afterCurrency) end += afterCurrency[0].length;
    let tokenStart = start;
    const symbolBefore = before.match(/([$€£₪¥]|ils|nis|usd|eur|gbp)\s*$/i);
    if (symbolBefore) tokenStart -= symbolBefore[0].length;
    const prev = masked[tokenStart - 1] ?? '';
    const beforePrev = masked[tokenStart - 2] ?? '';
    const negative = ([...'-−'].includes(prev) && !/[\p{L}\d]/u.test(beforePrev)) || [...'-−'].includes(masked[end] ?? '') || prev === '(';
    const hint = AMOUNT_HINT.test(masked.slice(Math.max(0, tokenStart - 25), tokenStart));
    const cents = parseAmount(m[0]);
    if (!cents) continue;
    found.push({ start: tokenStart, end, cents, negative, score: (currency ? 2 : 0) + (hint ? 1 : 0) });
  }
  return { amounts: found, masked };
}

function pickAmount(amounts) {
  if (!amounts.length) return null;
  return [...amounts].sort((a, b) => b.score - a.score || b.cents - a.cents)[0];
}

const HEB_MERCHANT_END = '\\s+(?:בתאריך|בסך|בסכום|על סך|בכרטיס|אושרה|בוצעה|ב-)|\\s{2,}|[.,;\\n]|$';
// Most specific first: an explicit label, then English "at", then Hebrew forms.
const MERCHANT_PATTERNS = [
  /(?:merchant|store|payee|שם בית העסק|בית העסק|בית עסק)\s*[:：-]\s*(.+?)(?=\s{2,}|[.,;\n]|$)/i,
  /\b(?:at|@)\s+(.+?)(?=\s+(?:on|for|with|using|was|is|has|card|ending|approved|declined|in)\b|\s{2,}|[.,;\n]|$)/i,
  new RegExp(`(?:בבית העסק|בבית עסק|בבית-עסק|אצל)\\s*(.+?)(?=${HEB_MERCHANT_END})`),
  new RegExp(`ב-(?=\\S)(.+?)(?=${HEB_MERCHANT_END})`),
];

// Words left after removing the amount, dates and filler: "uber to work" from "uber 32 to work yesterday".
function describe(masked, amount, isMessage) {
  let text = masked;
  if (amount) text = text.slice(0, amount.start) + ' '.repeat(amount.end - amount.start) + text.slice(amount.end);
  // Short notes like "lunch at Dana's 45" keep all their words; bank messages are cut down to the shop.
  for (const re of isMessage ? MERCHANT_PATTERNS : []) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
      const name = m[1].replace(/\s+/g, ' ').trim();
      if (/\p{L}{2,}/u.test(name)) return tidy(name);
    }
  }
  return tidy(text);
}

function tidy(text) {
  const words = text
    .replace(/[$€£₪¥]/g, ' ')
    .replace(/\b(?:yesterday|today|last|on)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(new RegExp(`יום\\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)`, 'g'), ' ')
    .replace(/["״]/g, '')
    .replace(new RegExp(`(^|\\s)[בלהו]-(?=[${HEB}])`, 'g'), '$1')
    .split(/[\s,;:|()[\]{}]+/)
    .map((w) => w.replace(/^[-–.*#]+|[-–.*#]+$/g, ''))
    .filter((w) => w && !FILLER.has(w.toLowerCase()) && /\p{L}/u.test(w));
  return words.join(' ').slice(0, 60);
}

// One purchase from a short piece of text.
function parseEntry(text, ctx) {
  const { amounts, masked } = findAmounts(text);
  const amount = pickAmount(amounts);
  if (!amount) return null;
  return {
    amountCents: amount.cents,
    negative: amount.negative,
    refund: REFUND.test(text),
    description: describe(masked, amount, MESSAGE_WORDS.test(text) || text.length > 60),
    date: findDate(text, ctx),
  };
}

// "coffee 18, pizza 45" → two pieces; "1,200 rent" stays one.
function splitSegments(line) {
  if (findAmounts(line).amounts.length < 2) return [line];
  const parts = line.split(new RegExp(`\\s*[;,]\\s+|\\s+(?:and|&|\\+)\\s+|\\s+ו-?(?=[\\d₪$€£${HEB}])`, 'i')).filter((p) => p.trim());
  return parts.length > 1 ? parts : [line];
}

function parseReceipt(lines, ctx) {
  let best = null;
  for (const line of lines) {
    if (!RECEIPT_TOTAL.test(line) || SUBTOTAL.test(line)) continue;
    const amount = pickAmount(findAmounts(line).amounts);
    if (amount && (!best || amount.cents >= best.cents)) best = amount;
  }
  if (!best) return null;
  const merchantLine = lines.find((l) => /\p{L}{3,}/u.test(l) && !/receipt|invoice|tax|קבלה|חשבונית|מס|תאריך|date|tel|טל/i.test(l) && !RECEIPT_TOTAL.test(l));
  return {
    amountCents: best.cents,
    negative: false,
    refund: false,
    description: merchantLine ? tidy(merchantLine) : 'Receipt',
    date: findDate(lines.join(' '), ctx),
  };
}

/**
 * → [{ date, merchant, amountCents, isExpense }]. `today` is 'YYYY-MM-DD'; `dateOrder` 'dmy' | 'mdy'.
 */
export function parseFreeText(text, { today, dateOrder = 'dmy' }) {
  const ctx = { today, dateOrder };
  const entries = [];
  const blocks = String(text ?? '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);

  for (const lines of blocks) {
    const joined = lines.join(' ');
    if (lines.length >= 3 && lines.some((l) => RECEIPT_TOTAL.test(l) && !SUBTOTAL.test(l))) {
      const receipt = parseReceipt(lines, ctx);
      if (receipt) {
        entries.push(receipt);
        continue;
      }
    }
    const amountLines = lines.filter((l) => findAmounts(l).amounts.length);
    // A single message spread over several lines.
    if (amountLines.length === 1 && lines.length > 1 && MESSAGE_WORDS.test(joined)) {
      const entry = parseEntry(joined, ctx);
      if (entry) entries.push(entry);
      continue;
    }
    // Line by line. A shop name or a date on its own line belongs to the nearest amount.
    let pendingText = '';
    let pendingDate = null;
    let last = null;
    for (const line of lines) {
      const lineDate = findDate(line, ctx);
      if (!findAmounts(line).amounts.length) {
        if (tidy(findAmounts(line).masked)) pendingText = line;
        else if (lineDate) {
          if (last && !last.date) last.date = lineDate;
          else pendingDate = lineDate;
        }
        continue;
      }
      // A day written before the first amount ("yesterday: coffee 18, uber 32") covers the whole line;
      // otherwise each piece keeps its own ("coffee 18, uber 32 yesterday" → only the uber was yesterday).
      const firstAmount = findAmounts(line).amounts.reduce((min, a) => Math.min(min, a.start), Infinity);
      const leadDate = findDate(line.slice(0, firstAmount), ctx);
      for (const segment of splitSegments(line)) {
        const entry = parseEntry(segment, ctx);
        if (!entry) continue;
        if (!entry.description && pendingText) entry.description = tidy(findAmounts(pendingText).masked);
        if (!entry.date) entry.date = leadDate ?? pendingDate ?? (pendingText ? findDate(pendingText, ctx) : null);
        entries.push(entry);
        last = entry;
      }
      pendingText = '';
      pendingDate = null;
    }
  }

  // When most amounts are negative (bank-app lists), negative means money out.
  const negatives = entries.filter((e) => e.negative).length;
  const negativeMeansSpent = negatives > entries.length - negatives;
  return entries.map((e) => ({
    date: e.date ?? today,
    merchant: cleanMerchant(e.description || 'Purchase'),
    amountCents: e.amountCents,
    isExpense: !e.refund && (negativeMeansSpent ? e.negative : !e.negative),
  }));
}

export function todayFrom(date = new Date()) {
  return toISODate(date);
}
