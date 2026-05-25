// Per-item drink images. Null entries fall back to the category icon in both
// MenuScreen and ItemDetailScreen.
const DRINK_IMAGES = {
  // Espresso
  'espresso':        require('./assets/images/drinks/espresso.png'),
  'double-espresso': require('./assets/images/drinks/double-espresso.png'),
  'long-black':      require('./assets/images/drinks/long-black.png'),
  'americano':       require('./assets/images/drinks/americano.png'),
  'macchiato':       require('./assets/images/drinks/macchiato.png'),
  'cortado':         require('./assets/images/drinks/cortado.png'),
  'piccolo':         require('./assets/images/drinks/piccolo.png'),

  // Milk-Based
  'flat-white':      require('./assets/images/drinks/flat-white.png'),
  'cappuccino':      require('./assets/images/drinks/cappucino.png'),
  'latte':           require('./assets/images/drinks/latte.png'),
  'mocha':           require('./assets/images/drinks/mocha.png'),
  'vienna':          require('./assets/images/drinks/vienna.png'),
  'affogato':        require('./assets/images/drinks/Affogato.png'),
  'melbourne-magic': require('./assets/images/drinks/melbourne-magic.png'),

  // Iced & Cold
  'iced-latte':      require('./assets/images/drinks/iced-latte.png'),
  'iced-americano':  require('./assets/images/drinks/iced-americano.png'),
  'iced-long-black': require('./assets/images/drinks/iced-long-black.png'),
  'iced-cappuccino': require('./assets/images/drinks/iced-cuppacino.png'),
  'iced-mocha':      require('./assets/images/drinks/iced-mocha.png'),
  'iced-macchiato':  require('./assets/images/drinks/iced-macchiato.png'),
  'cold-brew':       require('./assets/images/drinks/cold-brew.png'),
  'cold-brew-latte': require('./assets/images/drinks/cold-brew-latte.png'),
  'frappe':          require('./assets/images/drinks/frappe.png'),

  // Specialty
  'hot-chocolate':   require('./assets/images/drinks/hot-chocolate.png'),
  'chai-latte':      require('./assets/images/drinks/chai-latte.png'),
  'matcha-latte':    require('./assets/images/drinks/matcha-latte.png'),
  'turmeric-latte':  require('./assets/images/drinks/turmeric-latte.png'),
  'orange-juice':    null,
  'pineapple-juice': null,

  // Tea
  'english-breakfast': require('./assets/images/drinks/english-breakfast.png'),
  'earl-grey':         require('./assets/images/drinks/earl-grey.png'),
  'green-tea':         require('./assets/images/drinks/green-tea.png'),
  'peppermint-tea':    require('./assets/images/drinks/peppermint.png'),
  'chamomile-tea':     require('./assets/images/drinks/chamomile.png'),
  'lemon-ginger':      require('./assets/images/drinks/lemon-ginger.png'),
  'oolong-tea':        require('./assets/images/drinks/oolong.png'),
  'iced-green-tea':    require('./assets/images/drinks/iced-green-tea.png'),
  'iced-chai':         require('./assets/images/drinks/iced-chai-latte.png'),
  'sticky-chai':       null,
};

export default DRINK_IMAGES;
