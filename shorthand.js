/**
 * shorthand.js
 *
 * Artisti Coffee Roasters shorthand notation.
 * Maps full drink/milk/extra names → barista abbreviations.
 *
 * Label order follows the Artisti workflow (top to bottom on cup):
 *   Bean Type → Strength → Syrup/Sugar → Coffee Type → Milk → Temperature → Name
 */

// Beverage name → shorthand
export const BEVERAGE_MAP = {
  'Espresso':           'SB',
  'Double Espresso':    'SB×2',
  'Long Black':         'LB',
  'Americano':          'LB',
  'Macchiato':          'MAC',
  'Cortado':            'MAC',
  'Piccolo':            'PIC',
  'Flat White':         'FW',
  'Cappuccino':         'C',
  'Latte':              'L',
  'Mocha':              'M',
  'Vienna':             'VIE',
  'Affogato':           'AFF',
  'Iced Latte':         'ICE L',
  'Iced Americano':     'ICE LB',
  'Iced Long Black':    'ICE LB',
  'Iced Cappuccino':    'ICE C',
  'Iced Mocha':         'ICE M',
  'Iced Macchiato':     'ICE MAC',
  'Cold Brew':          'CB',
  'Cold Brew Latte':    'CB L',
  'Frappe':             'FRAP',
  'Hot Chocolate':      'HC',
  'Chai Latte':         'CHAI',
  'Matcha Latte':       'MATCHA',
  'Turmeric Latte':     'TUR',
  // Tea
  'English Breakfast':  'EB',
  'Earl Grey':          'EG',
  'Green Tea':          'GT',
  'Peppermint':         'MINT',
  'Chamomile':          'CHAMO',
  'Lemon & Ginger':     'L&G',
  'Oolong':             'OOLONG',
  'Iced Green Tea':     'ICE GT',
  'Iced Chai':          'ICE CHAI',
  'Sticky Chai':        'S CHAI',
};

// Milk → shorthand
export const MILK_MAP = {
  'Full Cream':   'FC',
  'Skim':         'SK',
  'Oat':          'OAT',
  'Almond':       'ALM',
  'Soy':          'SOY',
  'Coconut':      'COCO',
  'Macadamia':    'MACA',
  'No Milk':      'NO MILK',
};

// Extras → shorthand
export const EXTRAS_MAP = {
  'Extra shot':         'ST',
  'Decaf':              'D',
  'Sugar':              '1s',
  'Vanilla syrup':      'VAN',
  'Caramel syrup':      'CAR',
  'Hazelnut syrup':     'HAZ',
  'Chocolate syrup':    'CHOC',
  'Cinnamon':           'CIN',
  'Chocolate sprinkles':'CHOC SP',
  'Whipped cream':      'WHC',
  'Ice':                'ICE',
  'Less ice':           'LESS ICE',
  'Extra hot':          'HOT',
  'Weak':               'WK',
};

// Size → shorthand prefix (used when shorthand mode is on)
export const SIZE_MAP = {
  'Small':  'S',
  'Medium': 'M',
  'Large':  'L',
};

/**
 * Convert a full order item to shorthand lines.
 * Returns an array of strings in the correct barista workflow order:
 * [beverage, milk, extras..., size, special]
 */
export function toShorthandLines(item) {
  const lines = [];

  // Coffee type (main beverage)
  const bev = BEVERAGE_MAP[item.name] || item.name?.toUpperCase() || '?';
  const size = SIZE_MAP[item.size] || item.size || '';
  lines.push(`${size} ${bev}`.trim());

  // Milk
  if (item.milk && item.milk !== 'No Milk') {
    lines.push(MILK_MAP[item.milk] || item.milk.toUpperCase());
  }

  // Extras (each on its own line)
  if (item.extras?.length) {
    item.extras.forEach((extra) => {
      lines.push(EXTRAS_MAP[extra] || extra.toUpperCase());
    });
  }

  // Special request — keep as-is, barista needs to read it
  if (item.specialRequest) {
    lines.push(`"${item.specialRequest}"`);
  }

  return lines;
}

/**
 * Build a single compact shorthand string for display (e.g. order screen).
 * e.g. "M FW · OAT · CAR"
 */
export function toShorthandSummary(item) {
  return toShorthandLines(item).join(' · ');
}
