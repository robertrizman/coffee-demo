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
    reasons: [
      'The velvety finish of your drink is a natural match for something buttery and fresh',
      'Creamy drinks open up beautifully alongside a flaky pastry or light bite',
      'That silky texture deserves a little something on the side — trust us',
      'A well-made flat white is basically incomplete without a snack to go with it',
      'Your drink\'s gentle sweetness hits differently with a bite of something warm',
    ],
    timeBoost: { morning: 'Morning Tea', afternoon: 'Snacks', evening: 'Snacks' },
  },
  'Espresso': {
    primary: ['Morning Tea', 'Snacks'],
    keywords: ['espresso', 'long black', 'americano', 'ristretto'],
    reasons: [
      'That punchy shot hits harder with something sweet alongside it',
      'Espresso\'s intensity finds its balance in a buttery, flaky bite',
      'Nothing cuts the edge of a long black like a proper morning pastry',
      'A short, sharp coffee calls for a snack that can keep up',
      'The bittersweet depth here is practically made for a caramelised treat',
      'Your espresso is bold — give it something worth pairing with',
      'Strong coffee and a light snack: a combination that just works',
    ],
    timeBoost: { morning: 'Morning Tea', afternoon: 'Snacks', evening: 'Snacks' },
  },
  'Iced & Cold': {
    primary: ['Snacks', 'Lunch'],
    keywords: ['iced', 'cold brew', 'frappé'],
    reasons: [
      'Cold and refreshing pairs perfectly with something to keep the energy going',
      'A chilled drink this good deserves more than just a sip',
      'Your cold brew is practically begging for a snack to go with it',
      'Cool drink, warm bite — the contrast works every time',
      'Iced coffee is a vibe, and so is the right snack alongside it',
      'The smooth finish of a cold brew is lifted by something with a little crunch',
      'You\'re already refreshed — now get satisfied too',
    ],
    timeBoost: { morning: 'Snacks', afternoon: 'Lunch', evening: 'Snacks' },
  },
  'Specialty': {
    primary: ['Morning Tea', 'Lunch'],
    keywords: ['specialty', 'pour over', 'batch brew', 'filter'],
    reasons: [
      'A drink this considered deserves a pairing that matches its character',
      'Delicate and complex — your specialty brew is best savoured alongside something equally thoughtful',
      'Take your time with this one. The right bite makes it even better',
      'Subtle notes like these open up beautifully with a well-chosen snack',
      'Filter coffee is a slow pleasure — pair it with something worth lingering over',
      'Your palate\'s already engaged — let the food take it further',
      'Specialty coffee is about the full experience. Don\'t stop at the cup',
    ],
    timeBoost: { morning: 'Morning Tea', afternoon: 'Lunch', evening: 'Morning Tea' },
  },
  'Tea': {
    primary: ['Morning Tea', 'Snacks'],
    keywords: ['tea', 'chai', 'matcha', 'herbal'],
    reasons: [
      'Tea and a light bite is one of life\'s genuinely good combinations',
      'The warmth here is best shared with something equally comforting',
      'Your brew\'s subtle character comes alive next to the right snack',
      'A proper tea moment needs a proper bite to go with it',
      'Floral, earthy, or spiced — whatever your cup, the pairing makes it complete',
      'Tea time without a snack is just half the experience',
      'The gentle sweetness in your cup is a natural match for something soft and fresh',
    ],
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
    reason: aiResult?.reason ||
      (Array.isArray(pairingRule.reasons)
        ? pairingRule.reasons[Math.floor(Math.random() * pairingRule.reasons.length)]
        : (pairingRule.reason || null)),
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
