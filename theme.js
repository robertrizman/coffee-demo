export const colors = {
  // Tealium Brand — Primary
  primary: '#006D80',        // Deep Teal
  primaryDark: '#005566',    // Darker Deep Teal
  primaryLight: '#e8f6f8',   // Very light teal bg
  primaryMid: '#b3dde3',     // Mid teal for borders/dividers

  // Tealium Brand — Midnight (dark navy)
  midnight: '#051838',
  midnightMid: '#0a2a5e',
  midnightLight: '#e8eaf0',

  // Tealium Brand — Teal (light)
  teal: '#68D8D5',
  tealLight: '#e0f8f7',
  tealMid: '#a8e8e6',

  // Tealium Accents
  mint: '#9FD8D5',           // Mint accent
  lime: '#AADB1E',           // Lime accent

  // Text — based on Midnight
  textDark: '#051838',       // Midnight
  textMid: '#006D80',        // Deep Teal
  textLight: '#4a7a85',      // Muted teal
  textMuted: '#8ab0b8',      // Light muted

  // Backgrounds
  background: '#f0fafb',     // Very light teal-white
  surface: '#ffffff',
  surfaceAlt: '#f5fbfc',

  // Status
  success: '#006D80',
  pending: '#e07b39',
  error: '#c0392b',

  // Neutrals
  border: '#b3dde3',
  borderLight: '#d6eff2',
  shadow: 'rgba(0,109,128,0.12)',
};

export const typography = {
  heading1: { fontSize: 30, fontWeight: '800', color: colors.textDark, letterSpacing: -0.5 },
  heading2: { fontSize: 22, fontWeight: '700', color: colors.textDark },
  heading3: { fontSize: 17, fontWeight: '700', color: colors.textDark },
  subtitle: { fontSize: 14, color: colors.textLight },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMid, letterSpacing: 1, textTransform: 'uppercase' },
  body: { fontSize: 15, color: colors.textDark },
  caption: { fontSize: 13, color: colors.textLight },
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};

export const shadow = {
  card: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};