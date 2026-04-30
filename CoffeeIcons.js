/**
 * CoffeeIcons.js
 *
 * Reusable icon components using @expo/vector-icons.
 * MaterialCommunityIcons (MCI) and Ionicons cover all our coffee/UI needs.
 *
 * Usage:
 *   import { CupIcon, BaristaIcon, OrdersIcon } from './CoffeeIcons';
 *   <CupIcon size={24} color={colors.primary} />
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { MaterialCommunityIcons as MCI } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';

// ── Menu / drink icons ──────────────────────────────────

/** Hot espresso / short black */
export const EspressoIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="coffee" size={size} color={color} />
);

/** Latte, flat white, cappuccino */
export const LatteIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="coffee-outline" size={size} color={color} />
);

/** Iced / cold drinks */
export const IcedCupIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="cup-outline" size={size} color={color} />
);

/** Hot chocolate / mocha */
export const HotChocIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="cup-water" size={size} color={color} />
);

/** Chai / specialty */
export const ChaiIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="tea-outline" size={size} color={color} />
);

/** Tea */
export const TeaIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="tea" size={size} color={color} />
);

/** Takeaway cup — used for Order tab */
export const TakeawayCupIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="coffee-to-go-outline" size={size} color={color} />
);

// ── Navigation icons ────────────────────────────────────

/** Orders & Profile tab */
export const ReceiptIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="receipt" size={size} color={color} />
);

/** Barista tab */
export const BaristaIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="chef-hat" size={size} color={color} />
);

// ── Operator / settings icons ───────────────────────────

/** Printer */
export const PrinterIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="printer-outline" size={size} color={color} />
);

/** Settings gear */
export const SettingsIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="cog-outline" size={size} color={color} />
);

/** WiFi / network scan */
export const WifiIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="wifi" size={size} color={color} />
);

/** QR scanner */
export const QrScanIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="qrcode-scan" size={size} color={color} />
);

/** Logout */
export const LogoutIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="logout" size={size} color={color} />
);

/** Menu / items */
export const MenuIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="menu" size={size} color={color} />
);

/** Toggle / switch */
export const ToggleIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="toggle-switch-outline" size={size} color={color} />
);

// ── Form / profile icons ────────────────────────────────

/** User / person */
export const UserIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="account-outline" size={size} color={color} />
);

/** Email */
export const EmailIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="email-outline" size={size} color={color} />
);

/** Lock / password */
export const LockIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="lock-outline" size={size} color={color} />
);

/** Eye — show password */
export const EyeIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="eye-outline" size={size} color={color} />
);

/** Eye off — hide password */
export const EyeOffIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="eye-off-outline" size={size} color={color} />
);

/** Location pin */
export const LocationPinIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="map-marker-outline" size={size} color={color} />
);

/** Trash / delete */
export const TrashIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="trash-can-outline" size={size} color={color} />
);

/** Bell / notification */
export const BellIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="bell-outline" size={size} color={color} />
);

/** Check / complete */
export const CheckIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="check-circle-outline" size={size} color={color} />
);

/** Add / plus */
export const AddIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="plus-circle-outline" size={size} color={color} />
);

/** Edit / pencil */
export const EditIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="pencil-outline" size={size} color={color} />
);

/** Coffee beans */
export const BeansIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="seed-outline" size={size} color={color} />
);

/** Analytics / chart */
export const AnalyticsIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="chart-bar" size={size} color={color} />
);

/** Leaf — dietary requirements */
export const LeafIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="leaf" size={size} color={color} />
);

/** Shield lock — privacy */
export const ShieldIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="shield-lock-outline" size={size} color={color} />
);

/** Back arrow */
export const BackIcon = ({ size = 24, color = '#006D80' }) => (
  <Ionicons name="chevron-back" size={size} color={color} />
);

/** Forward / chevron */
export const ChevronIcon = ({ size = 24, color = '#006D80' }) => (
  <Ionicons name="chevron-forward" size={size} color={color} />
);

/** Handshake / partnership */
export const HandshakeIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="handshake-outline" size={size} color={color} />
);

/** Group / people */
export const PeopleIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="account-group-outline" size={size} color={color} />
);

/** Clock / timer */
export const ClockIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="clock-outline" size={size} color={color} />
);

/** Star / interest */
export const StarIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="star-four-points-outline" size={size} color={color} />
);

/** Copy / clipboard */
export const CopyIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="content-copy" size={size} color={color} />
);

/** Tag / offers / promotions */
export const TagIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="tag-outline" size={size} color={color} />
);

/** Morning tea / pastry */
export const MorningTeaIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="food-croissant" size={size} color={color} />
);

/** Lunch / meal */
export const LunchIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="food" size={size} color={color} />
);

/** Snacks */
export const SnacksIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="food-variant" size={size} color={color} />
);

/** Magnify / search */
export const MagnifyIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="magnify" size={size} color={color} />
);

/** Lightning bolt / API / speed */
export const LightningBoltIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="lightning-bolt" size={size} color={color} />
);

/** Lightbulb — tips and suggestions */
export const LightbulbIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="lightbulb-outline" size={size} color={color} />
);

/** Agenda / calendar — used for Agenda tab */
export const AgendaIcon = ({ size = 24, color = '#006D80' }) => (
  <MCI name="calendar-clock" size={size} color={color} />
);

/** Animated AI spark — pulsing ✦ for AI-powered features */
export function AiSparkIcon({ size = 22, color = '#fff' }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.3,  duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(opacity, { toValue: 0.45, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.0,  duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(opacity, { toValue: 1.0,  duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
        Animated.delay(400),
      ])
    ).start();
  }, []);

  return (
    <Animated.Text style={{ fontSize: size, lineHeight: size + 4, color, transform: [{ scale }], opacity }}>
      ✦
    </Animated.Text>
  );
}
