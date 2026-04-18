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

export async function getOrderInsight({ orders }) {
  if (!FoodPairingModule?.generateInsight || !orders?.length) return null;

  const summary = orders.slice(0, 20).map(o => ({
    items: (o.items || []).map(i => ({
      name: i.name,
      milk: i.milk || null,
      size: i.size || null,
    })),
  }));

  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
    const result = await Promise.race([
      FoodPairingModule.generateInsight(JSON.stringify(summary)),
      timeout,
    ]);
    return result;
  } catch (e) {
    console.warn('[OrderInsight] Failed:', e.message);
    return null;
  }
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
  if (FoodPairingModule) {
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

      // If LLM returned specific items, use them directly
      if (result.item1 && result.item2) {
        return {
          items: [result.item1, result.item2],
          categories: [result.category1, result.category2],
          reason: result.reason || null,
          confidence: result.avgConfidence || 95,
          source: result.source || 'on-device-llm',
          engine: result.engine,
          inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek },
        };
      }

      // Random Forest returned categories — pick items from menu
      const item1 = pickItemsFromCategory(customItems, result.category1, 1);
      const item2 = pickItemsFromCategory(customItems, result.category2, 1);
      const allItems = result.category1 === result.category2
        ? pickItemsFromCategory(customItems, result.category1, 2)
        : [...item1, ...item2];

      return {
        items: allItems.slice(0, 2),
        categories: [result.category1, result.category2],
        reason: result.reason || null,
        confidence: result.avgConfidence || Math.round(((result.confidence1 + result.confidence2) / 2) * 100),
        source: result.source || 'on-device',
        engine: result.engine,
        inputs: { drinkCategory, milkType, timeOfDay, orderCount, dayOfWeek },
      };
    } catch (err) {
      console.warn('[FoodPairingAI] Native module error, falling back:', err.message);
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
