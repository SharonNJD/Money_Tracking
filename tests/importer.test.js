import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeStatement,
  cleanMerchant,
  decodeText,
  detectDateOrder,
  detectDelimiter,
  detectExpenseSign,
  isApplePayLog,
  merchantKey,
  parseApplePayLog,
  parseCSV,
  parseDate,
  parseSignedAmount,
  statementTransactions,
  withImportKeys,
} from '../js/importer.js';

test('parseCSV handles quotes, escaped quotes, CRLF and blank lines', () => {
  const text = 'Date,Description,Amount\r\n2026-10-01,"Coffee, large",4.50\r\n\r\n2026-10-02,"Say ""hi""",-3\n';
  assert.deepEqual(parseCSV(text), [
    ['Date', 'Description', 'Amount'],
    ['2026-10-01', 'Coffee, large', '4.50'],
    ['2026-10-02', 'Say "hi"', '-3'],
  ]);
  assert.equal(detectDelimiter('a;b;c\n1;2,5;3\n'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2\n'), '\t');
});

test('decodeText falls back to a legacy encoding for non-UTF-8 files', () => {
  const hebrew = Uint8Array.from([0xf9, 0xe5, 0xf4, 0xf8, 0xf1, 0xec]); // "שופרסל" in windows-1255
  assert.equal(decodeText(hebrew.buffer, 'windows-1255'), 'שופרסל');
  const utf8 = new TextEncoder().encode('﻿café');
  assert.equal(decodeText(utf8.buffer), 'café');
});

test('signed amounts', () => {
  assert.equal(parseSignedAmount('-12.50'), -1250);
  assert.equal(parseSignedAmount('12.50-'), -1250);
  assert.equal(parseSignedAmount('(12.50)'), -1250);
  assert.equal(parseSignedAmount('−7,20 €'), -720);
  assert.equal(parseSignedAmount('₪ 1,234.00'), 123400);
  assert.equal(parseSignedAmount(''), null);
  assert.equal(parseSignedAmount('n/a'), null);
});

test('dates in common bank formats', () => {
  assert.equal(parseDate('2026-10-12T13:45:00+03:00'), '2026-10-12');
  assert.equal(parseDate('12/10/2026'), '2026-10-12');
  assert.equal(parseDate('10/12/2026', 'mdy'), '2026-10-12');
  assert.equal(parseDate('12.10.26'), '2026-10-12');
  assert.equal(parseDate('12 Oct 2026'), '2026-10-12');
  assert.equal(parseDate('Oct 12, 2026 at 1:45 PM'), '2026-10-12');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('Total'), null);
  assert.equal(detectDateOrder(['01/02/2026', '25/02/2026']), 'dmy');
  assert.equal(detectDateOrder(['02/25/2026']), 'mdy');
  assert.equal(detectDateOrder(['01/02/2026']), null);
});

test('analyzeStatement skips title lines and finds the columns', () => {
  const rows = parseCSV(
    [
      'Account statement,,,',
      'Card ending 1234,,,',
      'Transaction Date,Merchant Name,Original Amount,Charge Amount',
      '05/10/2026,STARBUCKS #1234,4.50,4.50',
      '06/10/2026,AMAZON MKTPLACE,35.00,35.00',
      '07/10/2026,REFUND AMAZON,-10.00,-10.00',
      ',Total,,29.50',
    ].join('\n'),
  );
  const a = analyzeStatement(rows);
  assert.deepEqual(a, { headerRow: 2, date: 0, description: 1, amount: 3 });
  assert.equal(detectExpenseSign(rows, a), 'positive');
  const txns = statementTransactions(rows, { ...a, dateOrder: 'dmy', expenseSign: 'positive' });
  assert.deepEqual(
    txns.map((t) => [t.date, t.merchant, t.amountCents, t.isExpense]),
    [
      ['2026-10-05', 'Starbucks #1234', 450, true],
      ['2026-10-06', 'Amazon Mktplace', 3500, true],
      ['2026-10-07', 'Refund Amazon', 1000, false],
    ],
  );
});

test('Hebrew card statement headers prefer the charged amount', () => {
  const rows = [
    ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'סכום חיוב'],
    ['12/10/2026', 'שופרסל דיל', '100', '100'],
  ];
  assert.deepEqual(analyzeStatement(rows), { headerRow: 0, date: 0, description: 1, amount: 3 });
});

test('statements without a header are read by content; bank debits are negative', () => {
  const rows = parseCSV('2026-10-01;Salary;2500,00\n2026-10-02;Tesco Metro;-45,20\n2026-10-03;Shell 123;-60,00\n');
  const a = analyzeStatement(rows);
  assert.equal(a.headerRow, -1);
  assert.equal(a.date, 0);
  assert.equal(a.amount, 2);
  assert.equal(a.description, 1);
  assert.equal(detectExpenseSign(rows, a), 'negative');
  const expenses = statementTransactions(rows, { ...a, expenseSign: 'negative' }).filter((t) => t.isExpense);
  assert.deepEqual(expenses.map((t) => t.amountCents), [4520, 6000]);
});

test('Apple Pay Shortcuts log', () => {
  const log = 'MT|2026-10-12T08:01:00+03:00|Blue Bottle Coffee|₪18.00\nMT|2026-10-12T13:30:00+03:00|Wolt|₪62.90|Visa\n\nMT|bad|x|1\nMT|2026-10-13T09:00:00+03:00|Zara|-₪120.00\n';
  assert.ok(isApplePayLog(log));
  assert.ok(!isApplePayLog('Date,Amount\n2026-10-01,5\n'));
  const txns = parseApplePayLog(log);
  assert.deepEqual(
    txns.map((t) => [t.date, t.merchant, t.amountCents, t.isExpense]),
    [
      ['2026-10-12', 'Blue Bottle Coffee', 1800, true],
      ['2026-10-12', 'Wolt', 6290, true],
      ['2026-10-13', 'Zara', 12000, false],
    ],
  );
});

test('merchant keys and display names', () => {
  assert.equal(merchantKey('SQ *BLUE BOTTLE #123'), 'blue bottle');
  assert.equal(merchantKey("McDonald's 4471"), 'mcdonald s');
  assert.equal(merchantKey('שופרסל דיל 123'), 'שופרסל דיל');
  assert.equal(cleanMerchant('  STARBUCKS   STORE 5 '), 'Starbucks Store 5');
  assert.equal(cleanMerchant('Blue Bottle'), 'Blue Bottle');
  assert.equal(cleanMerchant(''), 'Unknown');
});

test('import keys tell identical same-day purchases apart', () => {
  const t = { date: '2026-10-12', amountCents: 450, merchant: 'Starbucks #1' };
  const keyed = withImportKeys([t, { ...t, merchant: 'STARBUCKS #2' }, { ...t, amountCents: 500 }]);
  assert.deepEqual(keyed.map((k) => k.key), ['2026-10-12|450|starbucks|1', '2026-10-12|450|starbucks|2', '2026-10-12|500|starbucks|1']);
});
