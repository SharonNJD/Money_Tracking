// Tiny DOM builder plus locale-aware formatting. All text goes in as text nodes, never HTML.
import { parseISODate, weekStartFor } from './logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Keys set as DOM properties rather than attributes.
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'textContent', 'htmlFor', 'multiple']);

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function applyProps(el, props, isSvg) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v != null) el.style.setProperty(prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), v);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (!isSvg && PROPS.has(key)) {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
}

// Children are appended before props so a <select>'s `value` can match its options.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  appendChildren(el, children);
  applyProps(el, props, false);
  return el;
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  appendChildren(el, children);
  applyProps(el, props, true);
  return el;
}

// ---------------------------------------------------------------------------
// Locale: English text with the phone's regional formats (e.g. he-IL → en-IL).

function pickLocale() {
  try {
    const region = new Intl.Locale(navigator.language || 'en-US').maximize().region;
    const candidate = region ? `en-${region}` : 'en-US';
    return Intl.NumberFormat.supportedLocalesOf([candidate]).length ? candidate : 'en-US';
  } catch {
    return 'en-US';
  }
}

export const LOCALE = pickLocale();
export const REGION = LOCALE.split('-')[1] ?? 'US';

const EURO_REGIONS = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
const REGION_CURRENCY = {
  US: 'USD', IL: 'ILS', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY', CH: 'CHF',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY', ZA: 'ZAR',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', AE: 'AED', SA: 'SAR', SG: 'SGD', HK: 'HKD',
  CN: 'CNY', KR: 'KRW', TH: 'THB', PH: 'PHP', ID: 'IDR', MY: 'MYR', UA: 'UAH', EG: 'EGP', NG: 'NGN',
};

export function guessCurrency() {
  if (EURO_REGIONS.includes(REGION)) return 'EUR';
  return REGION_CURRENCY[REGION] ?? 'USD';
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'JPY', 'INR'];

export function currencyOptions() {
  let all = COMMON_CURRENCIES;
  try {
    all = Intl.supportedValuesOf('currency');
  } catch {
    /* older Safari: the common list is enough */
  }
  let names = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'currency' });
  } catch {
    /* fall back to codes */
  }
  const label = (code) => (names ? `${code} — ${names.of(code)}` : code);
  const rest = all.filter((c) => !COMMON_CURRENCIES.includes(c));
  return [...COMMON_CURRENCIES, ...rest].map((code) => ({ code, label: label(code) }));
}

// ---------------------------------------------------------------------------
// Money

const moneyFormats = new Map();
function moneyFormat(currency, variant) {
  const key = `${currency}|${variant}`;
  if (!moneyFormats.has(key)) {
    const base = { style: 'currency', currency };
    const options = {
      whole: { ...base, minimumFractionDigits: 0, maximumFractionDigits: 0 },
      cents: { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 },
      compact: { ...base, notation: 'compact', maximumFractionDigits: 1 },
    }[variant];
    moneyFormats.set(key, new Intl.NumberFormat(LOCALE, options));
  }
  return moneyFormats.get(key);
}

export function money(cents, currency, { compact = false } = {}) {
  if (compact && Math.abs(cents) >= 100000) return moneyFormat(currency, 'compact').format(cents / 100);
  return moneyFormat(currency, cents % 100 === 0 ? 'whole' : 'cents').format(cents / 100);
}

export function currencySymbol(currency) {
  const part = moneyFormat(currency, 'whole').formatToParts(0).find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

// Plain number for prefilling inputs: 1250 → "12.5", 1200 → "12".
export function centsToInput(cents) {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function percent(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

// ---------------------------------------------------------------------------
// Dates

const dateFormats = new Map();
export function fmtDate(iso, options) {
  const key = JSON.stringify(options);
  if (!dateFormats.has(key)) dateFormats.set(key, new Intl.DateTimeFormat(LOCALE, options));
  return dateFormats.get(key).format(parseISODate(iso));
}

export const dayMonth = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });
export const weekdayDayMonth = (iso) => fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
export const monthName = (iso) => fmtDate(iso, { month: 'long' });
export const monthShort = (iso) => fmtDate(iso, { month: 'short' });
export const monthYear = (iso) => fmtDate(iso, { month: 'long', year: 'numeric' });

export function weekRange(weekEnd) {
  return `${dayMonth(weekStartFor(weekEnd))} – ${dayMonth(weekEnd)}`;
}

export function periodWord(period) {
  return period === 'week' ? 'week' : 'month';
}

export function perPeriod(period) {
  return period === 'week' ? '/week' : '/month';
}

export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
