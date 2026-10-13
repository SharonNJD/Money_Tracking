import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, normalizeState } from '../js/logic.js';
import { classify, dictionaryMatch, learn } from '../js/classify.js';

const s = defaultState();
const names = (result) => {
  if (!result) return null;
  const c = s.categories.find((x) => x.id === result.categoryId);
  return `${c.name} / ${c.types.find((t) => t.id === result.typeId)?.name ?? '-'}`;
};

test('everyday words and brands go to the right category and type', () => {
  const cases = {
    coffee: 'Eating out / Coffee',
    'Starbucks #1234': 'Eating out / Coffee',
    'pizza with friends': 'Eating out / Fast food',
    'sushi dinner': 'Eating out / Restaurants',
    'WOLT TEL AVIV': 'Eating out / Delivery',
    'uber to work': 'Transport / Taxi & rides',
    'Shell station 4': 'Transport / Fuel',
    'gas bill': 'Home & bills / Electricity & water',
    gas: 'Transport / Fuel',
    rent: 'Home & bills / Rent & mortgage',
    Netflix: 'Fun / Subscriptions',
    'cinema city': 'Fun / Movies & shows',
    'booking.com hotel': 'Fun / Travel',
    'IKEA NETANYA': 'Shopping / Home & furniture',
    'new sneakers': 'Shopping / Clothes & shoes',
    'AMAZON MKTPLACE': 'Shopping / Online orders',
    'Super-Pharm': 'Health / Pharmacy',
    'gym membership': 'Health / Gym & sport',
    'birthday gift for mom': 'Other / Gifts',
    'ATM fee': 'Other / Bank fees',
    'Shufersal Deal': 'Groceries / Supermarket',
    'croissants': 'Groceries / Bakery',
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(names(classify(s, text)), expected, text);
});

test('Hebrew, including words with attached prefixes', () => {
  assert.equal(names(classify(s, 'קפה')), 'Eating out / Coffee');
  assert.equal(names(classify(s, 'בשופרסל')), 'Groceries / Supermarket');
  assert.equal(names(classify(s, 'ארוחת ערב עם דן')), 'Eating out / Restaurants');
  assert.equal(names(classify(s, 'מונית הביתה')), 'Transport / Taxi & rides');
  assert.equal(names(classify(s, 'חשבון חשמל')), 'Home & bills / Electricity & water');
  assert.equal(names(classify(s, 'פז דלק')), 'Transport / Fuel');
});

test('short words only match whole words', () => {
  assert.equal(classify(s, 'BPM records'), null);
  assert.equal(names(classify(s, 'bar mitzvah gift')), 'Other / Gifts'); // "gift" (4) beats "bar" (3)
  assert.equal(dictionaryMatch('barber').target, 'shopping/beauty');
});

test('corrections are learned and beat the dictionary; no rule when nothing changes', () => {
  const st = defaultState();
  const fun = st.categories.find((c) => c.key === 'fun');
  const climbing = { id: 'climb', name: 'Climbing', emoji: '🧗' };
  fun.types.push(climbing);
  // Your own type names match even without a rule.
  assert.deepEqual(classify(st, 'climbing gym day pass'), { categoryId: fun.id, typeId: 'climb', from: 'name' });

  const health = st.categories.find((c) => c.key === 'health');
  learn(st, 'Yoga Studio TLV', fun.id, null);
  assert.equal(st.rules.length, 1);
  assert.equal(classify(st, 'YOGA STUDIO TLV').from, 'rule');
  learn(st, 'coffee', st.categories.find((c) => c.key === 'eating').id, st.categories.find((c) => c.key === 'eating').types[0].id);
  assert.equal(st.rules.length, 1, 'matches the dictionary already, so nothing stored');
  // Changing it back to what the dictionary says removes the rule again.
  learn(st, 'yoga studio tlv', health.id, health.types.find((t) => t.key === 'fitness').id);
  assert.equal(st.rules.length, 0);
  assert.deepEqual(classify(st, 'yoga studio tlv'), { categoryId: health.id, typeId: health.types.find((t) => t.key === 'fitness').id, from: 'keyword' });
});

test('hidden categories are never suggested', () => {
  const st = defaultState();
  st.categories.find((c) => c.key === 'eating').archived = true;
  assert.equal(classify(st, 'coffee'), null);
});

test('old data without types gets the default types for known category names', () => {
  const old = defaultState();
  for (const c of old.categories) {
    delete c.types;
    delete c.key;
  }
  old.categories.push({ id: 'mine', name: 'Climbing', emoji: '🧗', color: 2, budget: null, archived: false });
  const n = normalizeState(JSON.parse(JSON.stringify(old)));
  const eating = n.categories.find((c) => c.name === 'Eating out');
  assert.equal(eating.key, 'eating');
  assert.ok(eating.types.some((t) => t.key === 'coffee'));
  assert.deepEqual(n.categories.find((c) => c.id === 'mine').types, []);
  assert.equal(n.categories.find((c) => c.id === classify(n, 'latte').categoryId).name, 'Eating out');
});
