// Auto-sorting: decides the category and type for "coffee", "Shufersal Deal", "uber to work"…
// Order: your own corrections (rules) → names of types you created → the built-in dictionary below.
import { merchantKey } from './importer.js';

// "categoryKey/typeKey" → words and brands. Matched at the start of words, longest match wins,
// so "gas bill" beats "gas", and "restaurants" still finds "restaurant".
const DICTIONARY = {
  'groceries/supermarket': ['groceries', 'grocery', 'supermarket', 'super market', 'walmart', 'tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'kroger', 'safeway', 'whole foods', 'trader joe', 'costco', 'carrefour', 'rewe', 'edeka', 'shufersal', 'rami levy', 'victory', 'yochananof', 'osher ad', 'hatzi hinam', 'milk', 'eggs', 'cheese', 'cereal', 'rice', 'pasta', 'chicken', 'meat', 'סופר', 'סופרמרקט', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד', 'חצי חינם', 'קניות', 'מכולת', 'חלב', 'ביצים', 'גבינה', 'עוף', 'בשר'],
  'groceries/bakery': ['bakery', 'bread', 'croissant', 'bagel', 'pastry', 'challah', 'מאפייה', 'מאפיה', 'לחם', 'חלה', 'קרואסון', 'בורקס'],
  'groceries/produce': ['vegetables', 'veggies', 'fruit', 'produce', 'farmers market', 'greengrocer', 'שוק', 'ירקות', 'פירות', 'ירקן'],
  'groceries/drinks': ['wine', 'liquor', 'alcohol', 'water bottles', 'soda', 'יין', 'אלכוהול', 'משקאות'],
  'groceries/convenience': ['7 eleven', 'seven eleven', 'am pm', 'ampm', 'convenience', 'kiosk', 'tiv taam', 'yellow', 'קיוסק', 'פיצוציה', 'טיב טעם', 'אם פם'],

  'eating/coffee': ['coffee', 'cafe', 'café', 'latte', 'cappuccino', 'espresso', 'americano', 'starbucks', 'costa', 'dunkin', 'tim hortons', 'blue bottle', 'aroma', 'cofix', 'arcaffe', 'greg', 'landwer', 'קפה', 'אספרסו', 'הפוך', 'ארומה', 'קופיקס', 'ארקפה', 'גרג', 'לנדוור'],
  'eating/fastfood': ['pizza', 'burger', 'mcdonald', 'kfc', 'subway', 'burger king', 'wendy', 'taco bell', 'domino', 'papa john', 'five guys', 'shawarma', 'falafel', 'hummus', 'sabich', 'toast', 'sandwich', 'hot dog', 'fries', 'פיצה', 'המבורגר', 'בורגר', 'מקדונלד', 'שווארמה', 'שוארמה', 'פלאפל', 'חומוס', 'סביח', 'טוסט', 'כריך', 'דומינוס', 'פיצה האט'],
  'eating/restaurant': ['restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'sushi', 'ramen', 'steak', 'bistro', 'diner', 'meal', 'eating out', 'מסעדה', 'מסעדת', 'ארוחה', 'ארוחת', 'סושי', 'בראנץ', 'צהריים'],
  'eating/delivery': ['wolt', '10bis', 'ten bis', 'cibus', 'uber eats', 'ubereats', 'deliveroo', 'doordash', 'grubhub', 'just eat', 'postmates', 'delivery', 'takeaway', 'take away', 'takeout', 'וולט', 'תן ביס', 'סיבוס', 'משלוח', 'טייק אווי'],
  'eating/bars': ['beer', 'bar', 'pub', 'cocktail', 'drinks', 'brewery', 'club', 'בירה', 'בר', 'פאב', 'קוקטייל', 'מועדון'],

  'transport/fuel': ['fuel', 'gas', 'gasoline', 'petrol', 'diesel', 'shell', 'bp', 'esso', 'chevron', 'exxon', 'texaco', 'mobil', 'paz', 'delek', 'sonol', 'dor alon', 'tapuz', 'charging', 'ev charge', 'דלק', 'בנזין', 'סולר', 'תדלוק', 'פז', 'סונול', 'דור אלון', 'טעינה'],
  'transport/public': ['bus', 'train', 'metro', 'tram', 'light rail', 'rav kav', 'ravkav', 'moovit', 'oyster', 'mta', 'transit', 'רב קו', 'רבקו', 'רכבת', 'אוטובוס', 'רכבת קלה', 'מוביט', 'אגד'],
  'transport/taxi': ['taxi', 'cab', 'uber', 'lyft', 'gett', 'bolt', 'yango', 'מונית', 'יאנגו'],
  'transport/parking': ['parking', 'pango', 'cellopark', 'easypark', 'toll', 'highway 6', 'חניה', 'חנייה', 'חניון', 'פנגו', 'סלופארק', 'כביש 6', 'אגרה'],
  'transport/car': ['car wash', 'mechanic', 'garage', 'tires', 'tyres', 'oil change', 'car service', 'car insurance', 'vehicle', 'driving license', 'drivers license', 'מוסך', 'צמיגים', 'שטיפת רכב', 'טסט', 'רישיון', 'טיפול לרכב', 'ביטוח רכב'],

  'home/rent': ['rent', 'mortgage', 'landlord', 'שכירות', 'שכר דירה', 'משכנתא', 'משכנתה'],
  'home/utilities': ['electric', 'electricity', 'water bill', 'gas bill', 'utilities', 'heating', 'חשמל', 'חברת החשמל', 'חשבון מים', 'תאגיד מים', 'חשבון גז', 'גז'],
  'home/phone': ['phone bill', 'internet', 'wifi', 'broadband', 'mobile', 'cellcom', 'partner', 'pelephone', 'hot mobile', 'bezeq', 'golan telecom', 'vodafone', 'verizon', 'at t', 't mobile', 'comcast', 'xfinity', 'סלקום', 'פרטנר', 'פלאפון', 'בזק', 'הוט', 'גולן טלקום', 'אינטרנט', 'סלולר'],
  'home/insurance': ['insurance', 'harel', 'migdal', 'clal', 'menora', 'phoenix', 'ביטוח', 'הראל', 'מגדל', 'כלל ביטוח', 'מנורה', 'הפניקס'],
  'home/taxes': ['arnona', 'property tax', 'council tax', 'tax', 'vaad bayit', 'hoa', 'ארנונה', 'מס', 'ועד בית', 'עירייה', 'עיריית'],
  'home/supplies': ['cleaning', 'detergent', 'toilet paper', 'repair', 'plumber', 'electrician', 'handyman', 'hardware', 'ace hardware', 'home depot', 'ניקיון', 'אינסטלטור', 'חשמלאי', 'תיקון', 'נייר טואלט', 'אייס', 'הום סנטר'],

  'shopping/clothes': ['clothes', 'clothing', 'shirt', 'shoes', 'sneakers', 'pants', 'jeans', 'dress', 'jacket', 'zara', 'h m', 'hm', 'uniqlo', 'primark', 'gap', 'nike', 'adidas', 'castro', 'fox', 'renuar', 'terminal x', 'shein', 'בגדים', 'חולצה', 'נעליים', 'מכנסיים', 'שמלה', 'מעיל', 'זארה', 'קסטרו', 'פוקס', 'רנואר', 'טרמינל איקס'],
  'shopping/electronics': ['electronics', 'laptop', 'computer', 'headphones', 'earbuds', 'charger', 'cable', 'iphone', 'ipad', 'apple store', 'best buy', 'ksp', 'ivory', 'bug', 'samsung', 'מחשב', 'אוזניות', 'מטען', 'כבל', 'אייבורי', 'באג', 'מחסני חשמל'],
  'shopping/homegoods': ['ikea', 'furniture', 'home goods', 'homegoods', 'bed bath', 'decor', 'kitchenware', 'איקאה', 'רהיטים', 'ריהוט', 'כלי בית', 'עצמל'],
  'shopping/beauty': ['haircut', 'barber', 'hair salon', 'salon', 'nails', 'manicure', 'cosmetics', 'makeup', 'perfume', 'sephora', 'מספרה', 'תספורת', 'ציפורניים', 'מניקור', 'קוסמטיקה', 'איפור', 'בושם'],
  'shopping/online': ['amazon', 'aliexpress', 'ali express', 'ebay', 'temu', 'etsy', 'asos', 'אמזון', 'עלי אקספרס', 'עליאקספרס', 'טמו'],

  'fun/subscriptions': ['netflix', 'spotify', 'disney', 'hbo', 'youtube premium', 'youtube', 'apple music', 'apple tv', 'icloud', 'google one', 'prime video', 'chatgpt', 'subscription', 'yes', 'nextv', 'נטפליקס', 'ספוטיפיי', 'דיסני', 'מנוי'],
  'fun/movies': ['cinema', 'movie', 'movies', 'film', 'theater', 'theatre', 'yes planet', 'cinema city', 'lev cinema', 'amc', 'סינמה', 'קולנוע', 'סרט', 'יס פלאנט', 'סינמה סיטי', 'תיאטרון'],
  'fun/hobbies': ['game', 'games', 'steam', 'playstation', 'xbox', 'nintendo', 'lego', 'books', 'book', 'hobby', 'music', 'guitar', 'משחק', 'משחקים', 'ספר', 'ספרים', 'סטימצקי', 'צומת ספרים', 'לגו'],
  'fun/travel': ['hotel', 'airbnb', 'booking com', 'flight', 'flights', 'airline', 'el al', 'ryanair', 'wizz', 'easyjet', 'israir', 'arkia', 'vacation', 'trip', 'hostel', 'מלון', 'טיסה', 'טיסות', 'אל על', 'ישראייר', 'ארקיע', 'חופשה', 'צימר', 'טיול'],
  'fun/events': ['concert', 'tickets', 'ticket', 'show', 'museum', 'zoo', 'amusement', 'escape room', 'bowling', 'festival', 'party', 'הופעה', 'כרטיסים', 'כרטיס', 'מוזיאון', 'גן חיות', 'חדר בריחה', 'באולינג', 'פסטיבל', 'מסיבה', 'לונה פארק'],

  'health/pharmacy': ['pharmacy', 'chemist', 'drugstore', 'medicine', 'pills', 'vitamins', 'super pharm', 'superpharm', 'be pharm', 'good pharm', 'cvs', 'walgreens', 'boots', 'בית מרקחת', 'סופר פארם', 'סופרפארם', 'בי פארם', 'גוד פארם', 'תרופות', 'תרופה', 'ויטמינים'],
  'health/doctor': ['doctor', 'dentist', 'dental', 'clinic', 'hospital', 'therapy', 'therapist', 'physio', 'medical', 'maccabi', 'clalit', 'meuhedet', 'leumit', 'רופא', 'רופאה', 'רופא שיניים', 'מרפאה', 'בית חולים', 'טיפול', 'פסיכולוג', 'פיזיותרפיה', 'מכבי', 'כללית', 'מאוחדת', 'לאומית'],
  'health/fitness': ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'holmes place', 'sport', 'swimming pool', 'personal trainer', 'חדר כושר', 'כושר', 'יוגה', 'פילאטיס', 'הולמס פלייס', 'בריכה', 'מאמן'],
  'health/optics': ['glasses', 'optic', 'optician', 'lenses', 'contact lenses', 'משקפיים', 'אופטיקה', 'עדשות'],

  'other/gifts': ['gift', 'present', 'birthday', 'wedding', 'flowers', 'מתנה', 'מתנות', 'יום הולדת', 'חתונה', 'פרחים'],
  'other/education': ['course', 'class', 'lesson', 'tuition', 'school', 'university', 'college', 'udemy', 'coursera', 'קורס', 'שיעור', 'שכר לימוד', 'בית ספר', 'אוניברסיטה', 'מכללה'],
  'other/pets': ['vet', 'pet', 'dog', 'cat', 'pet food', 'pet shop', 'וטרינר', 'כלב', 'חתול', 'חיות', 'מזון לכלב'],
  'other/kids': ['kindergarten', 'daycare', 'babysitter', 'nanny', 'toys', 'diapers', 'stroller', 'גן ילדים', 'מעון', 'בייביסיטר', 'מטפלת', 'צעצועים', 'חיתולים', 'ילדים'],
  'other/fees': ['bank fee', 'fee', 'fees', 'commission', 'atm', 'interest', 'overdraft', 'עמלה', 'עמלות', 'דמי כרטיס', 'ריבית', 'כספומט'],
  'other/donations': ['donation', 'charity', 'tzedakah', 'תרומה', 'צדקה'],
};

// Flattened and sorted longest-first, so the first hit is the most specific.
const ENTRIES = Object.entries(DICTIONARY)
  .flatMap(([target, words]) => words.map((word) => ({ target, word: normalize(word) })))
  .filter((e) => e.word)
  .sort((a, b) => b.word.length - a.word.length);

export function normalize(text) {
  return merchantKey(text);
}

// Hebrew attaches small words to the front ("בשופרסל" = at Shufersal): also try each word without them.
const HEBREW_PREFIX = /^[בלהוכמש](?=[֐-׿]{2,})/;

function haystacks(key) {
  const words = key.split(' ');
  const stripped = words.map((w) => w.replace(HEBREW_PREFIX, ''));
  const out = [` ${key} `];
  if (stripped.some((w, i) => w !== words[i])) out.push(` ${stripped.join(' ')} `);
  return out;
}

function contains(hay, word) {
  // Short words must be whole words ("bp" mustn't match "bpm"); longer ones may start a longer word.
  return word.length <= 3 ? hay.includes(` ${word} `) : hay.includes(` ${word}`);
}

export function dictionaryMatch(text) {
  const hays = haystacks(normalize(text));
  for (const entry of ENTRIES) {
    if (hays.some((hay) => contains(hay, entry.word))) return entry;
  }
  return null;
}

// Longest remembered pattern contained in the text wins.
export function matchRule(rules, key) {
  let best = null;
  for (const r of rules) {
    if (key.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

// Types and categories you created yourself (no built-in key) match by their own name.
function customNameMatch(categories, key) {
  const hays = haystacks(key);
  let best = null;
  const consider = (categoryId, typeId, name) => {
    for (const word of normalize(name).split(' ')) {
      if (word.length < 3 || ['and', 'the'].includes(word)) continue;
      if (hays.some((hay) => contains(hay, word)) && (!best || word.length > best.len)) best = { categoryId, typeId, len: word.length };
    }
  };
  for (const c of categories) {
    if (!c.key) consider(c.id, null, c.name);
    for (const t of c.types) if (!t.key) consider(c.id, t.id, t.name);
  }
  return best && { categoryId: best.categoryId, typeId: best.typeId };
}

/**
 * → { categoryId, typeId, from: 'rule' | 'name' | 'keyword' } or null when nothing fits.
 * Hidden categories are never suggested.
 */
export function classify(state, text) {
  const key = normalize(text);
  if (!key) return null;
  const active = state.categories.filter((c) => !c.archived);
  const byId = new Map(active.map((c) => [c.id, c]));

  const rule = matchRule(state.rules ?? [], key);
  if (rule && byId.has(rule.categoryId)) {
    const typeOk = byId.get(rule.categoryId).types.some((t) => t.id === rule.typeId);
    return { categoryId: rule.categoryId, typeId: typeOk ? rule.typeId : null, from: 'rule' };
  }

  const custom = customNameMatch(active, key);
  if (custom) return { ...custom, from: 'name' };

  const hit = dictionaryMatch(key);
  if (hit) {
    const [catKey, typeKey] = hit.target.split('/');
    const c = active.find((x) => x.key === catKey);
    if (c) return { categoryId: c.id, typeId: c.types.find((t) => t.key === typeKey)?.id ?? null, from: 'keyword' };
  }
  return null;
}

// Remember a correction: next time text containing `pattern` goes to this category and type.
// Nothing is stored when the built-in dictionary would already pick the same.
export function learn(state, text, categoryId, typeId) {
  const pattern = normalize(text);
  if (pattern.length < 3) return;
  const builtIn = classify({ ...state, rules: [] }, pattern);
  state.rules = state.rules.filter((r) => r.pattern !== pattern);
  if (builtIn && builtIn.categoryId === categoryId && (builtIn.typeId ?? null) === (typeId ?? null)) return;
  state.rules.push({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${pattern}`, pattern, categoryId, ...(typeId ? { typeId } : {}) });
}
