/**
 * foodPairingAI.js
 *
 * On-device AI food pairing using Core ML (iOS Neural Engine)
 * with fallback to rules-based recommendations.
 *
 * iOS:  Core ML → Apple Neural Engine (A-series chip)
 * Android: MediaPipe LLM → Gemini Nano (Pixel 8+, Samsung S24+/S25+, Motorola Razr 50 Ultra/Edge 50 Ultra, Xiaomi 14T/MIX Flip, Realme GT 6)
 */

import { NativeModules, Platform } from 'react-native';

const FoodPairingModule = NativeModules.FoodPairingModule || null;
console.log('[FoodPairingAI] Module available:', !!FoodPairingModule, Platform.OS);
console.log('[FoodPairingAI] generateText available:', !!FoodPairingModule?.generateText);

let _openAIKey = null;
// Pre-seed from native constants (set synchronously at module init by the native side).
// true  = on-device LLM confirmed (ANE / Gemini Nano)
// false = module present but no on-device LLM (Random Forest only)
// null  = old build without constants — discovered on first call
let _nativeLLMAvailable = FoodPairingModule != null
  ? (FoodPairingModule.llmAvailable === true ? true
  : FoodPairingModule.llmAvailable === false ? false
  : null)
  : null;
let _nativeTextAvailable = _nativeLLMAvailable; // mirror initial state for generateText flag
let _keyFetchPromise = null;

export function setOpenAIKey(key) { _openAIKey = key || null; }

// Lazy-loads the OpenAI key from Supabase if it hasn't been set yet.
// Guards against the race where getAIPairing/getOrderInsight is called before
// AppContext has finished its startup fetch.
async function ensureOpenAIKey() {
  if (_openAIKey) return _openAIKey;
  if (_keyFetchPromise) return _keyFetchPromise;
  try {
    const { supabase } = require('./supabase');
    _keyFetchPromise = supabase
      .from('menu_config').select('description')
      .eq('category', '_config').eq('name', 'openai_key').single()
      .then(({ data }) => {
        if (data?.description) _openAIKey = data.description;
        _keyFetchPromise = null;
        return _openAIKey;
      })
      .catch(() => { _keyFetchPromise = null; return null; });
    return await _keyFetchPromise;
  } catch {
    _keyFetchPromise = null;
    return null;
  }
}
export function getExpectedAIProvider() {
  if (FoodPairingModule && _nativeLLMAvailable !== false) return 'native';
  if (_openAIKey) return 'openai';
  return 'rules';
}

// Returns the on-device engine name ("Apple Intelligence (ANE)", "Gemini Nano (Samsung NPU)", etc.)
// or null if no on-device LLM is available. Safe to call before any AI call is made.
export function getNativeEngineLabel() {
  if (!FoodPairingModule || _nativeLLMAvailable === false) return null;
  const label = FoodPairingModule.engineLabel;
  return (label && label.length > 0) ? label : null;
}

// Returns the "Consulting X…" string for the thinking state — always matches what will actually run.
// "Consulting Apple Intelligence…" | "Consulting Gemini…" | "Consulting OpenAI…"
export function getThinkingLabel() {
  if (getExpectedAIProvider() === 'native') {
    const label = getNativeEngineLabel();
    if (label) {
      const name = label.startsWith('Gemini') ? 'Gemini' : label.split(' (')[0];
      return `Consulting ${name}…`;
    }
  }
  return 'Consulting OpenAI…';
}

async function callOpenAI({ drinkCategory, favouriteDrink, milkType, timeOfDay, dayOfWeek, orderCount, customItems, dietaryRequirements, specialRequests }) {
  if (!_openAIKey) return null;

  const menuItemsText = customItems
    ? Object.entries(customItems)
        .filter(([cat, items]) => ['Morning Tea', 'Lunch', 'Snacks'].includes(cat) && items?.length > 0)
        .map(([cat, items]) => `${cat}: ${items.map(i => i.name || i).join(', ')}`)
        .join('\n')
    : '';

  const tones = [
    'warm and conversational, like a friendly barista chatting with a regular',
    'poetic and sensory, focusing on flavours, textures and aromas',
    'playful and witty, with a light touch of humour',
    'confident and direct, like a sommelier making a bold pairing call',
    'storytelling, painting a brief picture of the moment',
  ];
  const tone = tones[Math.floor(Math.random() * tones.length)];

  const prompt = `You are a barista at a specialty coffee cart. Recommend 2 food items that pair well with the customer's coffee order.

Customer profile:
- Favourite drink: ${favouriteDrink || drinkCategory}
- Preferred milk: ${milkType}
- Time of day: ${timeOfDay} (${dayOfWeek})
- Past orders: ${orderCount}
${dietaryRequirements ? `- Dietary requirements: ${dietaryRequirements}` : ''}
${specialRequests ? `- Customer preferences/special requests: ${specialRequests}` : ''}

Available menu items:
${menuItemsText || 'No items currently available'}

Write the reason field in a ${tone} style. Keep it to 1-2 sentences, specific to their actual drink and the pairing.${specialRequests ? ' If the customer\'s special requests are relevant (e.g. sustainability, dietary preferences), weave a natural reference to how the café accommodates that into the reason.' : ''}

IMPORTANT: item1 and item2 MUST be copied exactly from the available menu items list above. Do not invent or suggest any item not in that list.

Respond with ONLY valid JSON, no markdown:
{"item1":"item name","category1":"category","item2":"item name","category2":"category","reason":"your pairing reason here"}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openAIKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.95,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  return JSON.parse(content);
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 15) return 'afternoon';
  return 'evening';
}

function getDayOfWeek() {
  const day = new Date().getDay();
  return (day === 0 || day === 6) ? 'weekend' : 'weekday';
}

function getDrinkCategory(orders) {
  const counts = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      const cat = item.category || 'Milk-Based';
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  if (!Object.keys(counts).length) return 'Milk-Based';
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getFavouriteDrink(orders) {
  const counts = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.name) counts[item.name] = (counts[item.name] || 0) + 1;
    }
  }
  if (!Object.keys(counts).length) return null;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getSpecialRequests(orders) {
  const seen = new Set();
  const requests = [];
  for (const order of (orders || []).slice(0, 10)) {
    for (const item of order.items || []) {
      if (item.specialRequest && !seen.has(item.specialRequest)) {
        seen.add(item.specialRequest);
        requests.push(item.specialRequest);
      }
    }
  }
  return requests.length ? requests.join('; ') : null;
}

function getMilkType(orders) {
  const counts = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      const milk = item.milk || 'No Milk';
      counts[milk] = (counts[milk] || 0) + 1;
    }
  }
  if (!Object.keys(counts).length) return 'No Milk';
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function pickItemsFromCategory(customItems, category, count = 1) {
  const items = (customItems?.[category] || []).filter(Boolean);
  if (!items.length) return [];
  // Shuffle slightly for variety
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

// kJ lookup table: medium size, full cream milk baseline
const KJ_BASE = {
  'iced mocha': 900, 'hot chocolate': 850, 'mocha': 900,
  'dirty chai': 750, 'iced coffee': 750,
  'chai latte': 700, 'iced chai': 700, 'chai': 700,
  'matcha latte': 600, 'iced matcha': 600,
  'turmeric latte': 550, 'beetroot latte': 580, 'blue latte': 560,
  'iced latte': 670, 'latte': 670,
  'flat white': 630, 'cappuccino': 600,
  'cortado': 300, 'gibraltar': 300, 'piccolo': 160,
  'macchiato': 80,
  'iced long black': 15, 'iced americano': 20,
  'long black': 15, 'short black': 15, 'americano': 20,
  'cold brew': 20, 'ristretto': 10, 'espresso': 15, 'tea': 5,
};

const SIZE_FACTOR = { small: 0.8, medium: 1.0, large: 1.2 };

const MILK_FACTOR = {
  'full cream': 1.0, 'half & half': 0.88,
  'skim': 0.72, 'oat': 0.88, 'almond': 0.65,
  'soy': 0.80, 'coconut': 1.05, 'macadamia': 0.90,
};

export function computeItemKJ(item) {
  const name = (item.name || '').toLowerCase().trim();
  const size = (item.size || 'medium').toLowerCase().trim();
  const milk = (item.milk || '').toLowerCase().trim();

  // Longest key match = most specific
  let base = 400;
  const sorted = Object.entries(KJ_BASE).sort((a, b) => b[0].length - a[0].length);
  for (const [key, kj] of sorted) {
    if (name.includes(key)) { base = kj; break; }
  }

  const sizeMult = SIZE_FACTOR[size] ?? 1.0;

  // Black coffee / tea: no milk scaling
  if (base <= 20) return Math.round(base * sizeMult);

  // No milk selected: only espresso shots remain (~30kJ for 2 shots)
  if (milk === 'no milk') return Math.round(30 * sizeMult);

  const milkMult = MILK_FACTOR[milk] ?? 1.0;
  return Math.round(base * sizeMult * milkMult);
}

export function computeOrdersKJ(orders) {
  if (!orders?.length) return { kj_total: 0, kj_per_visit: 0 };
  let total = 0;
  for (const order of orders) {
    for (const item of order.items || []) total += computeItemKJ(item);
  }
  return {
    kj_total: total,
    kj_per_visit: Math.round(total / orders.length),
  };
}

export async function getOrderInsight({ orders, dietaryRequirements = null }) {
  if (!orders?.length) return null;

  const summary = orders.slice(0, 20).map(o => ({
    items: (o.items || []).map(i => ({
      name: i.name,
      milk: i.milk || null,
      size: i.size || null,
    })),
  }));

  // Pre-compute accurate kJ — overrides any AI-estimated values
  const { kj_total, kj_per_visit } = computeOrdersKJ(orders.slice(0, 20));

  // Try native LLM first (Gemini / Apple Intelligence)
  if (FoodPairingModule?.generateInsight && _nativeLLMAvailable !== false) {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      const result = await Promise.race([
        FoodPairingModule.generateInsight(JSON.stringify(summary)),
        timeout,
      ]);
      if (result) {
        _nativeLLMAvailable = true;
        const engineLabel = Platform.OS === 'ios'
          ? 'Apple Intelligence (ANE)'
          : 'Gemini Nano (On-device AI)';
        return { ...result, engine: result.engine || engineLabel, kj_total, kj_per_visit };
      }
      _nativeLLMAvailable = false;
    } catch (e) {
      if (e.message !== 'timeout') _nativeLLMAvailable = false;
    }
  }

  // OpenAI fallback — ensure key is available even if AppContext hasn't finished loading
  if (!_openAIKey) await ensureOpenAIKey();
  if (_openAIKey) {
    try {
      const orderList = summary.map((o, i) =>
        `Order ${i + 1}: ${o.items.map(it => `${it.size || ''} ${it.name} (${it.milk || 'no milk'})`).join(', ')}`
      ).join('\n');

      const prompt = `You are a nutrition-aware barista assistant. Analyse this customer's café order history and give a personalised insight.

Order history (most recent first):
${orderList}
${dietaryRequirements ? `\nCustomer dietary requirements: ${dietaryRequirements}` : ''}
The kilojoule values have been pre-calculated from a verified nutrition database:
- Total kJ across all ${orders.length} order(s): ${kj_total}kJ
- Average kJ per visit: ${kj_per_visit}kJ
Use these exact values in your response — do not estimate or change them.
${dietaryRequirements ? 'Factor their dietary requirements into both the insight and the tip.' : ''}
Respond with ONLY valid JSON, no markdown:
{"kj_total":${kj_total},"kj_per_visit":${kj_per_visit},"insight":"2 sentence personalised observation about their drinking habits","tip":"1 practical health or lifestyle tip tailored to their orders and dietary needs","engine":"GPT-4o mini"}`;

      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const fetchInsight = fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openAIKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250,
          temperature: 0.7,
        }),
      }).then(async r => {
        if (!r.ok) throw new Error(`OpenAI ${r.status}`);
        const json = await r.json();
        return JSON.parse(json.choices?.[0]?.message?.content?.trim());
      });

      const result = await Promise.race([fetchInsight, timeout]);
      if (result?.insight) return { ...result, kj_total, kj_per_visit };
    } catch (e) {
      console.warn('[OrderInsight] OpenAI failed:', e.message);
    }
  }

  return null;
}

// Snap an AI-suggested item name to a real item in customItems.
// Tries exact → partial match within the suggested category first, then other categories.
// Falls back to the first available real item if nothing matches.
function resolveToRealItem(suggestedName, suggestedCat, customItems) {
  const FOOD_CATS = ['Morning Tea', 'Lunch', 'Snacks'];
  const name = (suggestedName || '').toLowerCase().trim();
  const catsToCheck = [suggestedCat, ...FOOD_CATS.filter(c => c !== suggestedCat)];
  for (const cat of catsToCheck) {
    const items = customItems?.[cat] || [];
    const exact = items.find(i => (i.name || i).toLowerCase() === name);
    if (exact) return { name: exact.name || exact, cat };
    const partial = items.find(i => {
      const n = (i.name || i).toLowerCase();
      return n.includes(name) || name.includes(n);
    });
    if (partial) return { name: partial.name || partial, cat };
  }
  for (const cat of catsToCheck) {
    const items = customItems?.[cat] || [];
    if (items.length) return { name: items[0].name || items[0], cat };
  }
  return null;
}

export async function getAIPairing({ orders, customItems, dietaryRequirements = null }) {
  const timeOfDay = getTimeOfDay();
  const dayOfWeek = getDayOfWeek();
  const drinkCategory = getDrinkCategory(orders);
  const favouriteDrink = getFavouriteDrink(orders);
  const milkType = getMilkType(orders);
  const orderCount = orders.length;
  const specialRequests = getSpecialRequests(orders);

  // Build context string for LLM prompt — menu items + optional dietary requirements + special requests
  const menuItemsJson = customItems
    ? Object.entries(customItems)
        .filter(([cat, items]) => ['Morning Tea', 'Lunch', 'Snacks'].includes(cat) && items?.length > 0)
        .map(([cat, items]) => `${cat}: ${items.map(i => i.name || i).join(', ')}`)
        .join(' | ')
    : '';
  const contextJson = [
    menuItemsJson,
    dietaryRequirements ? `Dietary requirements: ${dietaryRequirements}` : '',
    specialRequests ? `Customer special requests: ${specialRequests}` : '',
  ].filter(Boolean).join(' | ');

  // Try native module (Gemini Nano on supported Android devices / Apple Intelligence on iOS)
  if (FoodPairingModule && _nativeLLMAvailable !== false) {
    try {
      console.log('[FoodPairingAI] Calling native module with:', { drinkCategory, milkType, timeOfDay, dayOfWeek, dietaryRequirements });
      const predictionPromise = FoodPairingModule.predict(
        drinkCategory, milkType, timeOfDay, dayOfWeek,
        contextJson
      );

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      );
      const result = await Promise.race([predictionPromise, timeoutPromise]);

      // Only trust the result if it's a real LLM (Gemini Nano / Apple Intelligence)
      const isLLM = result.source === 'on-device-llm' || result.engine?.toLowerCase().includes('gemini') || result.engine?.toLowerCase().includes('intelligence');
      if (isLLM) {
        _nativeLLMAvailable = true;

        // Android (Gemini) returns item1/item2 directly
        // iOS (Apple Intelligence) returns category1/category2 — pick items from those categories
        let items;
        if (result.item1 && result.item2) {
          const ri1 = resolveToRealItem(result.item1, result.category1, customItems);
          const ri2 = resolveToRealItem(result.item2, result.category2, customItems);
          items = [ri1, ri2].filter(Boolean);
        } else {
          const cat1 = result.category1 || 'Morning Tea';
          const cat2 = result.category2 || 'Snacks';
          const picked1 = pickItemsFromCategory(customItems, cat1, 1);
          const picked2 = cat1 === cat2
            ? pickItemsFromCategory(customItems, cat2, 2).slice(1)
            : pickItemsFromCategory(customItems, cat2, 1);
          items = [...picked1, ...picked2].slice(0, 2);
        }

        return {
          items,
          categories: [result.category1, result.category2],
          reason: result.reason || null,
          confidence: result.avgConfidence || 95,
          source: 'on-device-llm',
          engine: result.engine,
          inputs: { drinkCategory, favouriteDrink, milkType, timeOfDay, orderCount, dayOfWeek },
        };
      }
      // Native module returned a non-LLM result (decision tree fallback) — disable for session
      _nativeLLMAvailable = false;
    } catch (err) {
      // On timeout, leave _nativeLLMAvailable as-is so the next call retries (model may be cold-starting).
      // Only mark unavailable on explicit module errors.
      if (err.message !== 'timeout') _nativeLLMAvailable = false;
    }
  }

  // OpenAI cloud fallback — ensure key is available even if AppContext hasn't finished loading
  if (!_openAIKey) await ensureOpenAIKey();
  if (_openAIKey) {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      const result = await Promise.race([
        callOpenAI({ drinkCategory, favouriteDrink, milkType, timeOfDay, dayOfWeek, orderCount, customItems, dietaryRequirements, specialRequests }),
        timeout,
      ]);
      if (result?.item1 && result?.item2) {
        console.log('[FoodPairingAI] OpenAI result:', result.item1, result.item2);
        const r1 = resolveToRealItem(result.item1, result.category1, customItems);
        let r2 = resolveToRealItem(result.item2, result.category2, customItems);
        // Ensure two distinct items
        if (r1 && r2 && r1.name === r2.name) {
          const FOOD_CATS = ['Morning Tea', 'Lunch', 'Snacks'];
          for (const cat of FOOD_CATS) {
            const alt = (customItems?.[cat] || []).find(i => (i.name || i) !== r1.name);
            if (alt) { r2 = { name: alt.name || alt, cat }; break; }
          }
        }
        if (r1 && r2) {
          return {
            items: [r1, r2],
            categories: [r1.cat, r2.cat],
            reason: result.reason || null,
            confidence: 90,
            source: 'openai',
            engine: 'GPT-4o mini',
            inputs: { drinkCategory, favouriteDrink, milkType, timeOfDay, orderCount, dayOfWeek },
          };
        }
      }
    } catch (err) {
      console.warn('[FoodPairingAI] OpenAI error:', err.message);
      const isConnectivityError = err.message === 'Network request failed'
        || err.message === 'timeout'
        || err.message?.includes('network')
        || err.message?.includes('connect')
        || err.message?.includes('fetch');
      if (isConnectivityError) {
        return {
          source: 'offline', items: [], reason: null,
          engine: 'GPT-4o mini',
          inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek },
        };
      }
    }
  }

  // Rules-based fallback
  return getRulesPairing({ drinkCategory, milkType, timeOfDay, orderCount, customItems });
}

function getRulesPairing({ drinkCategory, milkType, timeOfDay, orderCount, customItems }) {
  const RULES = {
    'Milk-Based': { morning: ['Morning Tea', 'Snacks'], afternoon: ['Snacks', 'Lunch'], evening: ['Snacks', 'Morning Tea'] },
    'Espresso':   { morning: ['Morning Tea', 'Snacks'], afternoon: ['Snacks', 'Lunch'], evening: ['Snacks', 'Morning Tea'] },
    'Iced & Cold':{ morning: ['Snacks', 'Morning Tea'], afternoon: ['Lunch', 'Snacks'], evening: ['Snacks', 'Lunch'] },
    'Specialty':  { morning: ['Morning Tea', 'Snacks'], afternoon: ['Lunch', 'Morning Tea'], evening: ['Snacks', 'Morning Tea'] },
    'Tea':        { morning: ['Morning Tea', 'Snacks'], afternoon: ['Snacks', 'Lunch'], evening: ['Snacks', 'Morning Tea'] },
  };

  const cats = RULES[drinkCategory]?.[timeOfDay] || ['Morning Tea', 'Snacks'];
  const item1 = pickItemsFromCategory(customItems, cats[0], 1);
  const item2 = pickItemsFromCategory(customItems, cats[1], 1);

  const allItems = cats[0] === cats[1]
    ? pickItemsFromCategory(customItems, cats[0], 2)
    : [...item1, ...item2];

  return {
    items: allItems.slice(0, 2),
    categories: cats,
    confidence: null,
    source: 'rules',
    engine: Platform.OS === 'android' ? 'Rules (TFLite coming soon)' : 'Rules fallback',
    inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek: getDayOfWeek() },
  };
}

export async function getOrderPersonality(orders) {
  if (!orders?.length) return null;

  const drinkCounts = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.name) drinkCounts[item.name] = (drinkCounts[item.name] || 0) + 1;
    }
  }

  const uniqueDrinks = Object.entries(drinkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!uniqueDrinks.length) return null;

  const totalDrinks = Object.values(drinkCounts).reduce((a, b) => a + b, 0);
  const drinkList = uniqueDrinks
    .map(([name, count]) => (count > 1 ? `${name} (${count}x)` : name))
    .join(', ');

  const basePrompt = `Write 2-3 warm, fun, positive sentences describing the personality and vibe of someone who orders these café drinks: ${drinkList}. Be uplifting, specific to each drink, and celebratory. Never be negative, condescending, offensive, harmful, or sexual. Keep it under 60 words.`;

  // Try native LLM (Apple Intelligence / ANE on iOS, Gemini Nano on Android)
  if (FoodPairingModule?.generateText && _nativeTextAvailable !== false) {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000));
      const result = await Promise.race([
        FoodPairingModule.generateText(basePrompt + ' Return plain text only.'),
        timeout,
      ]);
      if (result?.text) {
        _nativeTextAvailable = true;
        return {
          text: result.text,
          totalDrinks,
          uniqueDrinks: uniqueDrinks.length,
          engine: result.engine || (Platform.OS === 'ios' ? 'Apple Intelligence (ANE)' : 'On-device AI'),
        };
      }
    } catch (e) {
      if (e?.message !== 'timeout') _nativeTextAvailable = false;
    }
  }

  // OpenAI fallback
  if (!_openAIKey) await ensureOpenAIKey();
  if (_openAIKey) {
    try {
      const prompt = basePrompt + ' Respond with ONLY valid JSON, no markdown:\n{"text":"your text here","engine":"GPT-4o mini"}';
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const result = await Promise.race([
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openAIKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.85,
          }),
        }).then(async r => {
          if (!r.ok) throw new Error(`OpenAI ${r.status}`);
          const json = await r.json();
          return JSON.parse(json.choices?.[0]?.message?.content?.trim());
        }),
        timeout,
      ]);
      if (result?.text) {
        return { text: result.text, totalDrinks, uniqueDrinks: uniqueDrinks.length, engine: result.engine || 'GPT-4o mini' };
      }
    } catch (e) {
      console.warn('[OrderPersonality] OpenAI failed:', e.message);
    }
  }

  return null;
}

export async function getCoffeeOrigin(drinkName) {
  if (!drinkName) return null;

  // Try native LLM (Apple Intelligence / ANE on iOS, Gemini Nano on Android)
  if (FoodPairingModule?.generateText && _nativeTextAvailable !== false) {
    try {
      const nativePrompt = `Write a short, engaging paragraph (3-5 sentences) about the origin and history of a ${drinkName}. Focus on where it came from, who invented it, and what makes it distinctive. Write in a warm, conversational tone for a café app. Return plain text only, no JSON, no bullet points.`;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000));
      const result = await Promise.race([FoodPairingModule.generateText(nativePrompt), timeout]);
      if (result?.text) {
        _nativeTextAvailable = true;
        return { text: result.text, engine: result.engine || (Platform.OS === 'ios' ? 'Apple Intelligence (ANE)' : 'On-device AI') };
      }
      // Empty result: method works, leave _nativeTextAvailable as-is so next call retries
    } catch (e) {
      // Timeout means the model is busy — leave flag as-is so next call retries.
      // Only mark unavailable on a definitive rejection (module error).
      if (e?.message !== 'timeout') _nativeTextAvailable = false;
    }
  }

  // OpenAI fallback
  if (!_openAIKey) await ensureOpenAIKey();
  if (_openAIKey) {
    try {
      const prompt = `Write a short, engaging paragraph (3-5 sentences) about the origin and history of a ${drinkName}. Focus on where it came from, who invented it, and what makes it distinctive. Write in a warm, conversational tone for a café app. Respond with ONLY valid JSON, no markdown:\n{"text":"your paragraph here","engine":"GPT-4o mini"}`;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const result = await Promise.race([
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openAIKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.7,
          }),
        }).then(async r => {
          if (!r.ok) throw new Error(`OpenAI ${r.status}`);
          const json = await r.json();
          return JSON.parse(json.choices?.[0]?.message?.content?.trim());
        }),
        timeout,
      ]);
      if (result?.text) return result;
    } catch (e) {
      console.warn('[CoffeeOrigin] OpenAI failed:', e.message);
    }
  }

  return null;
}
