/**
 * foodPairingAI.js
 *
 * On-device AI food pairing using Core ML (iOS Neural Engine)
 * with fallback to rules-based recommendations.
 *
 * iOS:  Core ML → Apple Neural Engine (A-series chip)
 * Android: TFLite → Samsung NPU / Google ML Kit (coming soon)
 */

import { NativeModules, Platform } from 'react-native';

const FoodPairingModule = NativeModules.FoodPairingModule || null;
console.log('[FoodPairingAI] Module available:', !!FoodPairingModule, Platform.OS);

let _openAIKey = null;
let _nativeLLMAvailable = null; // null = untested, true = confirmed LLM, false = unavailable

export function setOpenAIKey(key) { _openAIKey = key || null; }
export function getExpectedAIProvider() {
  if (FoodPairingModule && _nativeLLMAvailable !== false) return 'native';
  if (_openAIKey) return 'openai';
  return 'rules';
}

async function callOpenAI({ drinkCategory, milkType, timeOfDay, dayOfWeek, orderCount, customItems, dietaryRequirements }) {
  if (!_openAIKey) return null;

  const menuItemsText = customItems
    ? Object.entries(customItems)
        .filter(([cat, items]) => ['Morning Tea', 'Lunch', 'Snacks'].includes(cat) && items?.length > 0)
        .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
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
- Favourite drink type: ${drinkCategory}
- Preferred milk: ${milkType}
- Time of day: ${timeOfDay} (${dayOfWeek})
- Past orders: ${orderCount}
${dietaryRequirements ? `- Dietary requirements: ${dietaryRequirements}` : ''}

Available menu items:
${menuItemsText || 'No items currently available'}

Write the reason field in a ${tone} style. Keep it to 1-2 sentences, specific to their drink and the pairing.

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

export async function getOrderInsight({ orders, dietaryRequirements = null }) {
  if (!orders?.length) return null;

  const summary = orders.slice(0, 20).map(o => ({
    items: (o.items || []).map(i => ({
      name: i.name,
      milk: i.milk || null,
      size: i.size || null,
    })),
  }));

  // Try native LLM first (Gemini / Apple Intelligence)
  if (FoodPairingModule?.generateInsight && _nativeLLMAvailable !== false) {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      const result = await Promise.race([
        FoodPairingModule.generateInsight(JSON.stringify(summary)),
        timeout,
      ]);
      if (result) { _nativeLLMAvailable = true; return result; }
      _nativeLLMAvailable = false;
    } catch (e) {
      _nativeLLMAvailable = false;
    }
  }

  // OpenAI fallback
  if (_openAIKey) {
    try {
      const orderList = summary.map((o, i) =>
        `Order ${i + 1}: ${o.items.map(it => `${it.size || ''} ${it.name} (${it.milk || 'no milk'})`).join(', ')}`
      ).join('\n');

      const prompt = `You are a nutrition-aware barista assistant. Analyse this customer's café order history and give a personalised insight.

Order history (most recent first):
${orderList}
${dietaryRequirements ? `\nCustomer dietary requirements: ${dietaryRequirements}` : ''}
Estimate the kilojoule content of each drink based on typical café values (e.g. medium flat white with full cream ~630kJ, oat milk latte ~580kJ, long black ~10kJ, chai latte ~700kJ).
${dietaryRequirements ? 'Factor their dietary requirements into both the insight and the tip.' : ''}
Respond with ONLY valid JSON, no markdown:
{"kj_total":number,"kj_per_visit":number,"insight":"2 sentence personalised observation about their drinking habits","tip":"1 practical health or lifestyle tip tailored to their orders and dietary needs","engine":"GPT-4o mini"}`;

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
      if (result?.insight) return result;
    } catch (e) {
      console.warn('[OrderInsight] OpenAI failed:', e.message);
    }
  }

  return null;
}

export async function getAIPairing({ orders, customItems, dietaryRequirements = null }) {
  const timeOfDay = getTimeOfDay();
  const dayOfWeek = getDayOfWeek();
  const drinkCategory = getDrinkCategory(orders);
  const milkType = getMilkType(orders);
  const orderCount = orders.length;

  // Build context string for LLM prompt — menu items + optional dietary requirements
  const menuItemsJson = customItems
    ? Object.entries(customItems)
        .filter(([cat, items]) => ['Morning Tea', 'Lunch', 'Snacks'].includes(cat) && items?.length > 0)
        .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
        .join(' | ')
    : '';
  const contextJson = [
    menuItemsJson,
    dietaryRequirements ? `Dietary requirements: ${dietaryRequirements}` : '',
  ].filter(Boolean).join(' | ');

  // Try native module (Gemini Nano on S24+ / Apple Intelligence on iOS)
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
      if (isLLM && result.item1 && result.item2) {
        _nativeLLMAvailable = true;
        return {
          items: [result.item1, result.item2],
          categories: [result.category1, result.category2],
          reason: result.reason || null,
          confidence: result.avgConfidence || 95,
          source: 'on-device-llm',
          engine: result.engine,
          inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek },
        };
      }
      _nativeLLMAvailable = false;
    } catch (err) {
      _nativeLLMAvailable = false;
    }
  }

  // OpenAI cloud fallback
  if (_openAIKey) {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      const result = await Promise.race([
        callOpenAI({ drinkCategory, milkType, timeOfDay, dayOfWeek, orderCount, customItems, dietaryRequirements }),
        timeout,
      ]);
      if (result?.item1 && result?.item2) {
        console.log('[FoodPairingAI] OpenAI result:', result.item1, result.item2);
        return {
          items: [
            { name: result.item1, cat: result.category1 },
            { name: result.item2, cat: result.category2 },
          ],
          categories: [result.category1, result.category2],
          reason: result.reason || null,
          confidence: 90,
          source: 'openai',
          engine: 'GPT-4o mini',
          inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek },
        };
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
