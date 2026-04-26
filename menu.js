export const MENU = [
  // ESPRESSO
  { id: 'espresso', name: 'Espresso', description: 'Concentrated shot, intense & bold', category: 'Espresso', defaultEnabled: true },
  { id: 'double-espresso', name: 'Double Espresso', description: 'Two shots, extra strong', category: 'Espresso', defaultEnabled: true },
  { id: 'long-black', name: 'Long Black', description: 'Hot water with espresso on top', category: 'Espresso', defaultEnabled: true },
  { id: 'americano', name: 'Americano', description: 'Espresso with added hot water', category: 'Espresso', defaultEnabled: true },
  { id: 'macchiato', name: 'Macchiato', description: 'Espresso with a dash of milk', category: 'Espresso', defaultEnabled: true },
  { id: 'cortado', name: 'Cortado', description: 'Equal parts espresso and milk', category: 'Espresso', defaultEnabled: true },
  { id: 'piccolo', name: 'Piccolo', description: 'Ristretto in a small latte glass', category: 'Espresso', defaultEnabled: true },

  // MILK-BASED
  { id: 'flat-white', name: 'Flat White', description: 'Velvety microfoam, espresso-forward', category: 'Milk-Based', defaultEnabled: true },
  { id: 'cappuccino', name: 'Cappuccino', description: 'Espresso, steamed milk & froth', category: 'Milk-Based', defaultEnabled: true },
  { id: 'latte', name: 'Latte', description: 'Smooth espresso with lots of milk', category: 'Milk-Based', defaultEnabled: true },
  { id: 'mocha', name: 'Mocha', description: 'Espresso with chocolate & milk', category: 'Milk-Based', defaultEnabled: true },
  { id: 'vienna', name: 'Vienna', description: 'Espresso topped with whipped cream', category: 'Milk-Based', defaultEnabled: true },
  { id: 'affogato', name: 'Affogato', description: 'Espresso poured over vanilla ice cream', category: 'Milk-Based', defaultEnabled: true },

  // ICED & COLD
  { id: 'iced-latte', name: 'Iced Latte', description: 'Latte over ice, refreshing', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'iced-americano', name: 'Iced Americano', description: 'Americano served cold over ice', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'iced-long-black', name: 'Iced Long Black', description: 'Long black chilled over ice', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'iced-cappuccino', name: 'Iced Cappuccino', description: 'Cappuccino shaken cold over ice', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'iced-mocha', name: 'Iced Mocha', description: 'Mocha chilled over ice', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'iced-macchiato', name: 'Iced Macchiato', description: 'Macchiato layered over ice', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'cold-brew', name: 'Cold Brew', description: 'Slow-steeped, smooth & strong', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'cold-brew-latte', name: 'Cold Brew Latte', description: 'Cold brew with cold milk', category: 'Iced & Cold', defaultEnabled: true },
  { id: 'frappe', name: 'Frappe', description: 'Blended iced coffee drink', category: 'Iced & Cold', defaultEnabled: true },

  // SPECIALTY
  { id: 'hot-chocolate', name: 'Hot Chocolate', description: 'Rich dark chocolate steamed milk', category: 'Specialty', defaultEnabled: true },
  { id: 'chai-latte', name: 'Chai Latte', description: 'Spiced tea with steamed milk', category: 'Specialty', defaultEnabled: true },
  { id: 'matcha-latte', name: 'Matcha Latte', description: 'Japanese green tea with milk', category: 'Specialty', defaultEnabled: true },
  { id: 'turmeric-latte', name: 'Turmeric Latte', description: 'Golden milk, anti-inflammatory', category: 'Specialty', defaultEnabled: true },

  // TEA
  { id: 'english-breakfast', name: 'English Breakfast', description: 'Classic black tea, bold & malty', category: 'Tea', defaultEnabled: true },
  { id: 'earl-grey', name: 'Earl Grey', description: 'Black tea with bergamot', category: 'Tea', defaultEnabled: true },
  { id: 'green-tea', name: 'Green Tea', description: 'Light & grassy, served hot', category: 'Tea', defaultEnabled: true },
  { id: 'peppermint-tea', name: 'Peppermint', description: 'Refreshing caffeine-free herbal', category: 'Tea', defaultEnabled: true },
  { id: 'chamomile-tea', name: 'Chamomile', description: 'Gentle floral, great for unwinding', category: 'Tea', defaultEnabled: true },
  { id: 'lemon-ginger', name: 'Lemon & Ginger', description: 'Zesty herbal blend, warming', category: 'Tea', defaultEnabled: true },
  { id: 'oolong-tea', name: 'Oolong', description: 'Semi-oxidised, smooth & complex', category: 'Tea', defaultEnabled: false },
  { id: 'iced-green-tea', name: 'Iced Green Tea', description: 'Green tea chilled over ice', category: 'Tea', defaultEnabled: true },
  { id: 'iced-chai', name: 'Iced Chai', description: 'Spiced chai over ice with milk', category: 'Tea', defaultEnabled: true },
  { id: 'sticky-chai', name: 'Sticky Chai', description: 'Rich syrup-based chai with milk', category: 'Tea', defaultEnabled: true },
];

export const CATEGORIES = ['Milk-Based', 'Espresso', 'Iced & Cold', 'Specialty', 'Tea'];

export const SIZES = ['Small', 'Medium', 'Large'];

export const MILK_OPTIONS = ['Full Cream', 'Half & Half', 'Skim', 'Oat', 'Almond', 'Soy', 'Coconut', 'Macadamia', 'No Milk'];

export const EXTRAS = [
  'Extra shot', 'Decaf', 'Sugar', '1/2 sugar', 'Vanilla syrup', 'Caramel syrup',
  'Hazelnut syrup', 'Chocolate syrup', 'Cinnamon', 'Chocolate sprinkles',
  'Whipped cream', 'Ice', 'Less ice', 'Extra hot', 'Weak',
  '1/2 strength', '1/2 full', '3/4 full',
];
