import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDate, parseFreeText } from '../js/freetext.js';

const today = '2026-10-16'; // a Friday
const parse = (text, opts = {}) => parseFreeText(text, { today, ...opts }).map((t) => [t.date, t.merchant, t.amountCents, t.isExpense]);

test('quick notes: one or many purchases, any order, with day words', () => {
  assert.deepEqual(parse('coffee 18'), [[today, 'coffee', 1800, true]]);
  assert.deepEqual(parse('45 pizza with friends'), [[today, 'pizza friends', 4500, true]]);
  assert.deepEqual(parse('uber 32.50 yesterday, pizza 45'), [['2026-10-15', 'uber', 3250, true], [today, 'pizza', 4500, true]]);
  assert.deepEqual(parse('yesterday: coffee 18, uber 32').map((r) => r[0]), ['2026-10-15', '2026-10-15']);
  assert.deepEqual(parse('groceries 230\nfuel 250 on monday'), [[today, 'groceries', 23000, true], ['2026-10-12', 'fuel', 25000, true]]);
  assert.deepEqual(parse('1,200 rent'), [[today, 'rent', 120000, true]]);
  assert.deepEqual(parse('2 coffees 30'), [[today, 'coffees', 3000, true]]);
  assert.deepEqual(parse('₪18 קפה ו-45 פיצה אתמול').map((r) => r[2]), [1800, 4500]);
  assert.deepEqual(parse('קפה 18 ופיצה 45'), [[today, 'קפה', 1800, true], [today, 'פיצה', 4500, true]]);
  assert.deepEqual(parse('no numbers here'), []);
});

test('bank and card text messages (English and Hebrew)', () => {
  assert.deepEqual(parse('Chase: A $45.00 transaction at STARBUCKS was made on your credit card ending in 1234 on Oct 12, 2026.'), [['2026-10-12', 'Starbucks', 4500, true]]);
  assert.deepEqual(parse('You spent $12.50 at Blue Bottle Coffee.'), [[today, 'Blue Bottle Coffee', 1250, true]]);
  assert.deepEqual(parse('עסקה בסך 45.90 ש"ח בכרטיס המסתיים ב-1234 בבית העסק שופרסל דיל אושרה'), [[today, 'שופרסל דיל', 4590, true]]);
  assert.deepEqual(parse('חיוב בסך 120.00 ₪ בכרטיס 1234\nב-WOLT 12/10/26'), [['2026-10-12', 'Wolt', 12000, true]]);
  assert.deepEqual(parse('Refund of $20.00 from AMAZON has been credited to your card.'), [[today, 'Refund Amazon', 2000, false]]);
  // Several messages pasted together, separated by blank lines.
  assert.equal(parse('Purchase of USD 30.00 at TARGET approved.\n\nPurchase of USD 8.25 at SUBWAY approved.').length, 2);
});

test('receipts read with Live Text: the total, the shop name, the date', () => {
  const receipt = ['CAFE NOIR', 'Rothschild Blvd 43', '12/10/2026 13:05', 'Shakshuka 58.00', 'Lemonade 18.00', 'Subtotal 76.00', 'TOTAL 76.00', 'Visa ****1234'].join('\n');
  assert.deepEqual(parse(receipt), [['2026-10-12', 'Cafe Noir', 7600, true]]);
  const hebrew = ['סופר פארם', 'סניף דיזנגוף', 'קרם ידיים 29.90', 'סה"כ לתשלום 29.90'].join('\n');
  assert.deepEqual(parse(hebrew), [[today, 'סופר פארם', 2990, true]]);
});

test('text copied from a bank-app screenshot: names and dates on their own lines', () => {
  const list = ['Shufersal Deal', '15 Oct', '-₪212.40', 'Wolt', '14 Oct', '-₪62.90', 'Salary', '10 Oct', '+₪9,500.00'].join('\n');
  assert.deepEqual(parse(list), [
    ['2026-10-15', 'Shufersal Deal', 21240, true],
    ['2026-10-14', 'Wolt', 6290, true],
    ['2026-10-10', 'Salary', 950000, false],
  ]);
  const sameLine = 'Aroma Espresso Bar 24.00\n13/10 Pango parking 12.50';
  assert.deepEqual(parse(sameLine), [[today, 'Aroma Espresso Bar', 2400, true], ['2026-10-13', 'Pango parking', 1250, true]]);
});

test('dates: US order, future dates roll back a year, ignored card digits and times', () => {
  assert.equal(findDate('10/12/2026', { today, dateOrder: 'mdy' }), '2026-10-12');
  assert.equal(findDate('25/12', { today }), '2025-12-25');
  assert.equal(findDate('last fri', { today }), today);
  assert.equal(findDate('Sun Bar', { today }), null);
  assert.equal(findDate('ביום שני', { today }), '2026-10-12');
  assert.deepEqual(parse('Paid 32.00 at 13:45 with card ending 9876'), [[today, 'Purchase', 3200, true]]);
});
