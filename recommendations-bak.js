import { supabase } from './supabase';

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 15) return 'afternoon';
  return 'evening';
}

// Fallback rules if DB unavailable
const FALLBACK_RULES = {
  'Milk-Based': {
    primary: ['Morning Tea', 'Snacks'],
    keywords: ['flat white', 'latte', 'cappuccino', 'cortado', 'macchiato', 'mocha', 'hot choc'],
    reason: 'Milk-based coffees pair beautifully with light pastries and snacks',
    timeBoost: { morning: 'Morning Tea', afternoon: 'Snacks', evening: 'Snacks' },
  },
  'Espresso': {
    primary: ['Morning Tea', 'Snacks'],
    keywords: ['espresso', 'long black', 'americano', 'ristretto'],
    reason: 'Bold espresso flavours complement sweet morning bites',
    timeBoost: { morning: 'Morning Tea', afternoon: 'Snacks', evening: 'Snacks' },
  },
  'Iced & Cold': {
    primary: ['Snacks', 'Lunch'],
    keywords: ['iced', 'cold brew', 'frappé'],
    reason: 'Cold drinks go great with a light snack or lunch bite',
    timeBoost: { morning: 'Snacks', afternoon: 'Lunch', evening: 'Snacks' },
  },
  'Specialty': {
    primary: ['Morning Tea', 'Lunch'],
    keywords: ['specialty', 'pour over', 'batch brew', 'filter'],
    reason: 'Specialty coffees are best enjoyed with something to savour',
    timeBoost: { morning: 'Morning Tea', afternoon: 'Lunch', evening: 'Morning Tea' },
  },
  'Tea': {
    primary: ['Morning Tea', 'Snacks'],
    keywords: ['tea', 'chai', 'matcha', 'herbal'],
    reason: 'Tea and light bites are a classic pairing',
    timeBoost: { morning: 'Morning Tea', afternoon: 'Snacks', evening: 'Snacks' },
  },
};

let cachedRules = null;

export async function loadPairingRules() {
  try {
    const { data, error } = await supabase.from('pairing_rules').select('*').eq('active', true);
    if (error || !data?.length) return;
    const rules = {};
    data.forEach(row => {
      rules[row.id] = {
        primary: row.primary_categories,
        keywords: row.keywords,
        reason: row.reason,
        timeBoost: row.time_boost,
      };
    });
    cachedRules = rules;
    console.log('[PairingRules] Loaded from DB:', Object.keys(rules));
  } catch (e) {
    console.warn('[PairingRules] Failed to load from DB, using fallback:', e.message);
  }
}

function getPairingRules() {
  return cachedRules || FALLBACK_RULES;
}

function getDrinkCategory(itemName) {
  const name = (itemName || '').toLowerCase();
  const rules = getPairingRules();
  for (const [category, rule] of Object.entries(rules)) {
    if (rule.keywords.some(k => name.includes(k))) return category;
  }
  return 'Milk-Based';
}

export function buildRecommendation({ orders = [], customItems = {}, momentsData, aiResult }) {
  const rules = getPairingRules();

  // Determine favourite drink from order history or Moments API
  let favouriteDrink = null;
  let topCategory = 'Milk-Based';
  let totalOrders = orders.length;
  let pickupOrders = 0;
  let timeOnSite = 0;

  if (momentsData) {
    const metrics = momentsData.metrics || {};
    const properties = momentsData.properties || {};
    favouriteDrink = properties['Most Popular Drink Ordered (favorite)'] || properties['Most ordered drink'] || null;
    totalOrders = metrics['Total Count of Order IDs'] || metrics['Total number of orders'] || totalOrders;
    pickupOrders = metrics['Pickup - Total Drinks Ordered'] || metrics['Total pickup orders'] || pickupOrders;
    const rawTime = metrics['Total time spent on site in minutes'];
    timeOnSite = rawTime ? Math.round(Number(rawTime)) : 0;
  }

  if (!favouriteDrink && orders.length > 0) {
    const counts = {};
    orders.forEach(o => {
      (o.items || []).forEach(i => {
        const n = i.name || '';
        counts[n] = (counts[n] || 0) + 1;
      });
    });
    favouriteDrink = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  if (favouriteDrink) topCategory = getDrinkCategory(favouriteDrink);

  // Loyalty badges — use from Moments API if available, otherwise derive locally
  const badges = (momentsData?.badges?.length > 0) ? momentsData.badges : [
    ...(totalOrders >= 1 ? ['iOS App User'] : []),
    ...(totalOrders >= 1 ? ['Android App User'] : []),
    ...(totalOrders >= 3 ? ['Regular Drink Consumer'] : []),
  ];

  const pairingRule = rules[topCategory] || rules['Milk-Based'];
  const timeOfDay = getTimeOfDay();
  const boostedFoodCat = pairingRule.timeBoost[timeOfDay];

  let suggestions;
  if (aiResult?.items?.length > 0) {
    suggestions = aiResult.items.slice(0, 2);
  } else {
    const FOOD_CATEGORIES = ['Morning Tea', 'Lunch', 'Snacks'];
    const allFoodItems = [
      ...(customItems?.[boostedFoodCat] || []).map(i => ({ ...i, cat: boostedFoodCat })),
      ...FOOD_CATEGORIES
        .filter(c => c !== boostedFoodCat)
        .flatMap(c => (customItems?.[c] || []).map(i => ({ ...i, cat: c }))),
    ].filter(Boolean);
    suggestions = allFoodItems.slice(0, 2);
  }

  const loyaltyTier = badges.includes('Regular Drink Consumer') ? 'Regular'
    : totalOrders >= 5 ? 'Returning'
    : 'New';

  const aiEngine = aiResult?.engine || null;
  const aiConfidence = aiResult?.confidence || null;
  const aiSource = aiResult?.source || 'rules';

  return {
    favouriteDrink,
    topCategory,
    suggestions,
    reason: pairingRule.reason,
    timeOfDay,
    totalOrders,
    pickupOrders,
    timeOnSite,
    loyaltyTier,
    badges,
    aiEngine,
    aiConfidence,
    aiSource,
    dataSource: momentsData ? 'PRISM Moments API' : 'Local history',
    visitorInsights: {
      totalOrders,
      favouriteDrink,
      loyaltyTier,
      preferredTime: timeOfDay,
      topDrinkCategory: topCategory,
      badges,
      aiEngine,
      dataSource: momentsData ? 'PRISM Moments API' : 'Local history',
    },
  };
}
