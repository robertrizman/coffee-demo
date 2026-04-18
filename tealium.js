/**
 * tealium.js
 *
 * Routes analytics through the Tealium PRISM native SDK when available
 * (dev build), falls back to HTTP Collect API (Expo Go / web).
 *
 * PRISM gives us:
 *  - Automatic lifecycle events (app open, foreground, background)
 *  - Device data (model, OS, screen size)
 *  - Connectivity data (wifi/cellular)
 *  - Visitor stitching
 *  - Trace tool support
 *  - Persistent data layer
 */

import { NativeModules, Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────
const ACCOUNT  = 'success-robert-rizman';
const PROFILE  = 'coffee-demo';
const ENV      = 'dev';
const DATASOURCE = Platform.OS === 'ios' ? 'xbjzdx' : 'd9mo8k';
const COLLECT_URL = `https://collect.tealiumiq.com/event`;

// ── PRISM native module (only available in dev build) ─────
const PrismModule = NativeModules.TealiumPrismModule || null;
let prismReady = false;

/**
 * Initialise PRISM. Call once at app startup (App.js).
 * Safe to call in Expo Go — will silently skip.
 */
export async function initTealium() {
  if (!PrismModule) {
    console.log('[Tealium] PRISM module not available — using HTTP Collect fallback');
    return;
  }
  try {
    await PrismModule.initialize(ACCOUNT, PROFILE, ENV, DATASOURCE);
    prismReady = true;
    console.log('[Tealium] PRISM initialized');

    // Store our device ID for use in all events as customer_uuid
    const { getDeviceId } = await import('./deviceId');
    const deviceId = await getDeviceId();
    const lowerUuid = deviceId.toLowerCase();
    setDeviceIdForMoments(lowerUuid);
    setCanonicalDeviceId(lowerUuid);
    console.log('[Tealium] ✅ customer_uuid set to:', lowerUuid);
  } catch (err) {
    console.warn('[Tealium] PRISM init error:', err.message);
  }
}

// ── Core track function ───────────────────────────────────

export async function track(eventName, data = {}) {
  const payload = {
    tealium_account: ACCOUNT,
    tealium_profile: PROFILE,
    tealium_datasource: DATASOURCE,
    tealium_event: eventName,
    platform: Platform.OS,
    customer_uuid: _deviceId || '',
    ...data,
  };

  if (prismReady && PrismModule) {
    // Route through PRISM native SDK
    try {
      await PrismModule.track(eventName, payload);
    } catch (err) {
      console.warn('[Tealium] PRISM track error:', err.message);
    }
    return;
  }

  // Fallback: HTTP Collect API
  try {
    await fetch(COLLECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[Tealium] Collect fallback error:', err.message);
  }
}

async function trackView(screenName, data = {}) {
  if (prismReady && PrismModule) {
    try {
      await PrismModule.trackView(screenName, {
        tealium_account: ACCOUNT,
        tealium_profile: PROFILE,
        screen_name: screenName,
        platform: Platform.OS,
        ...data,
      });
    } catch (err) {
      console.warn('[Tealium] PRISM trackView error:', err.message);
    }
    return;
  }
  // Fallback via regular track
  await track(screenName, { tealium_event_type: 'view', screen_name: screenName, ...data });
}

// ── Data layer ────────────────────────────────────────────

export async function setUserDataLayer(profile) {
  if (!profile) return;
  const data = {
    customer_name: profile.name || '',
    customer_email: profile.email || '',
  };
  if (prismReady && PrismModule) {
    try { await PrismModule.setDataLayer(data); } catch {}
  }
}

// ── Trace ─────────────────────────────────────────────────

export async function joinTrace(traceId) {
  if (!prismReady || !PrismModule) {
    console.warn('[Tealium] PRISM not ready — cannot join trace');
    return;
  }
  try {
    await PrismModule.joinTrace(traceId);
    console.log('[Tealium] Joined trace:', traceId);
  } catch (err) {
    console.warn('[Tealium] Join trace error:', err.message);
  }
}

export async function leaveTrace() {
  if (!prismReady || !PrismModule) return;
  try { await PrismModule.leaveTrace(); } catch {}
}

// ── App events ────────────────────────────────────────────

export function trackCustomerRegistration(profile) {
  track('customer_registration', {
    customer_name: profile.name,
    customer_email: profile.email,
    registration_method: 'onboarding',
    privacy_policy_accepted: true,
    privacy_policy_accepted_at: new Date().toISOString(),
    privacy_policy_url: 'https://tealium.com/privacy/',
  });
  setUserDataLayer(profile);
}

export function trackAppOpen() {
  track('app_open', { event_category: 'app' });
}

// ── Menu events ───────────────────────────────────────────

export function trackMenuView(category) {
  trackView('menu_view', { menu_category: category });
}

export function trackItemView(item, category) {
  track('item_view', {
    item_id: item.id,
    item_name: item.name,
    item_category: category,
  });
}

// ── Order events ──────────────────────────────────────────

export function trackAddToOrder(item, customisation) {
  track('add_to_order', {
    item_id: item.id,
    item_name: item.name,
    item_category: item.category,
    item_size: customisation?.size,
    item_milk: customisation?.milk,
    item_extras: customisation?.extras?.join(','),
  });
}

export function trackCustomisation(item, change) {
  track('customisation', {
    item_id: item.id,
    item_name: item.name,
    customisation_type: change.type,
    customisation_value: change.value,
  });
}

export function trackEmailEntered(email) {
  track('email_entered', { customer_email: email });
}

export function trackRemoveFromOrder(item) {
  track('remove_from_order', {
    item_id: item.id,
    item_name: item.name,
    item_category: item.category,
  });
}

export function trackPrinterTest(printerIp) {
  track('printer_test', { printer_ip: printerIp });
}

export function trackOrderPlaced(order) {
  const items = order.items || [];
  const hour = new Date().getHours();
  const timeOfDay = hour < 11 ? 'morning' : hour < 15 ? 'afternoon' : 'evening';

  items.forEach((item) => {
    // Build concatenated drink string e.g. "Oat_Latte_Medium_Sugar"
    const drinkParts = [
      item.category || null,
      item.milk && item.milk !== 'No Milk' ? item.milk : null,
      item.name,
      item.size,
      ...(item.extras || []),
    ].filter(Boolean).map((p) => p.trim().replace(/\s+/g, '_'));
    const drinkSummary = drinkParts.join('_');

    track('order_placed', {
      order_id: order.id,
      order_item_count: items.length,
      customer_name: order.name,
      customer_email: order.email,
      station: order.station,
      item_name: item.name,
      item_category: item.category || '',
      item_size: item.size || '',
      item_milk: item.milk || '',
      item_extras: (item.extras || []).join(', '),
      drink_summary: drinkSummary,
      time_of_day: timeOfDay,
      customer_latitude: order.customerLocation?.latitude || '',
      customer_longitude: order.customerLocation?.longitude || '',
      customer_location_granted: order.customerLocation?.granted ? 'true' : 'false',
      arc_location_id: order.arc_location_id || '',
      arc_location_name: order.arc_location_name || '',
    });
  });
}

export function trackOrderComplete(order) {
  track('order_complete', {
    order_id: order.id,
    customer_name: order.name,
    customer_email: order.email,
    station: order.station,
    fulfillment_time_ms: order.fulfilledAt
      ? order.fulfilledAt - order.placedAt
      : null,
  });
}

export function trackOrderReady(order, customerDeviceId) {
  const customerVisitorId = customerDeviceId
    ? `__${ACCOUNT}_${PROFILE}__5120_${customerDeviceId.toLowerCase()}__`
    : null;

  // Calculate fulfillment time
  const now = Date.now();
  const placedAt = order.placedAt || 0;
  const fulfilledAt = order.fulfilledAt || now;
  const totalMs = fulfilledAt - placedAt;
  const totalMins = Math.round(totalMs / 60000);
  const fulfillmentTime = totalMins < 1 ? '< 1min'
    : totalMins < 60 ? `${totalMins}min`
    : `${(totalMins / 60).toFixed(1)}hr`;

  const payload = {
    tealium_account: ACCOUNT,
    tealium_profile: PROFILE,
    tealium_datasource: DATASOURCE,
    tealium_event: 'order_ready',
    customer_uuid: customerDeviceId || '',
    tealium_visitor_id: customerVisitorId || '',
    customer_name: order.name,
    order_id: order.id,
    drink_summary: order.drink_summary || '',
    station: order.station,
    platform: 'barista_scan',
    fulfillment_time: fulfillmentTime,
    fulfillment_time_ms: totalMs,
  };

  console.log('[trackOrderReady] Sending HTTP Collect:', JSON.stringify(payload));
  fetch('https://collect.tealiumiq.com/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(r => console.log('[trackOrderReady] Collect status:', r.status))
    .catch(e => console.warn('[trackOrderReady] Collect error:', e.message));
}

// ── Barista events ────────────────────────────────────────

export function trackBaristaLogin(barista) {
  track('barista_login', {
    barista_name: barista.name,
    barista_username: barista.username,
    barista_station: barista.station,
    barista_role: barista.role,
  });
}

export function trackBaristaLogout(barista) {
  track('barista_logout', {
    barista_name: barista?.name,
    barista_station: barista?.station,
  });
}

// ── Settings events ───────────────────────────────────────

export function trackSettingsOpen() {
  trackView('settings_view');
}

export function trackMenuToggle(itemId, enabled) {
  track('menu_toggle', { item_id: itemId, enabled });
}

export function trackTabNavigation(tabName) {
  track('tab_navigation', { tab_name: tabName, tealium_event: 'tab_navigation' });
}

export function trackProfileTab(subTab) {
  track('profile_tab_view', { sub_tab: subTab });
}

export function trackEditProfile() {
  track('edit_profile_clicked', { tealium_event: 'edit_profile_clicked' });
}

export function trackProfileUpdated({ name, email, arc_location_id, arc_location_name }) {
  track('profile_updated', {
    tealium_event: 'profile_updated',
    customer_name: name || '',
    customer_email: email || '',
    arc_location_id: arc_location_id || '',
    arc_location_name: arc_location_name || '',
  });
}

export function trackDietaryRequirementsUpdated(dietaryRequirements) {
  track('dietary_requirements_updated', {
    tealium_event: 'dietary_requirements_updated',
    dietary_requirements: dietaryRequirements || '',
  });
}

export function trackUuidCopy({ uuid, email, name }) {
  track('uuid_copy', {
    tealium_event: 'uuid_copy',
    teal_app_uuid: uuid || '',
    customer_email: email || '',
    customer_name: name || '',
  });
}

export function trackAIPairingOpened() {
  track('ai_pairing_opened', {
    tealium_event: 'ai_pairing_opened',
    carousel_position: 1,
    carousel_name: 'llm_profile_pairing',
  });
}

export function trackAIPairingCarousel(slideIndex) {
  const carouselNames = ['llm_profile_pairing', 'connector_pairing'];
  track('ai_pairing_carousel', {
    tealium_event: 'ai_pairing_carousel',
    carousel_position: slideIndex + 1,
    carousel_name: carouselNames[slideIndex] || `slide_${slideIndex + 1}`,
  });
}

export function trackAIPairingResult(recommendation) {
  track('ai_pairing_result', {
    tealium_event: 'ai_pairing_result',
    favourite_drink: recommendation?.favouriteDrink || '',
    food_suggestion_1: recommendation?.suggestions?.[0]?.name || '',
    food_suggestion_2: recommendation?.suggestions?.[1]?.name || '',
    food_category_1: recommendation?.suggestions?.[0]?.cat || recommendation?.suggestions?.[0]?.category || '',
    food_category_2: recommendation?.suggestions?.[1]?.cat || recommendation?.suggestions?.[1]?.category || '',
    pairing_reason: recommendation?.reason || '',
    data_source: recommendation?.dataSource || '',
    ai_engine: recommendation?.aiEngine || '',
    confidence: recommendation?.aiConfidence || '',
    orders_count: recommendation?.totalOrders || '',
    loyalty_tier: recommendation?.loyaltyTier || '',
  });
}

// ── Moments API ───────────────────────────────────────────

const MOMENTS_ENGINE =
  'https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39';

export async function queryMomentsAPI() {
  const deviceId = _deviceId;
  if (!deviceId) {
    console.warn('[Moments] No device ID available');
    return null;
  }
  try {
    const url = `${MOMENTS_ENGINE}?attributeId=5120&attributeValue=${encodeURIComponent(deviceId.toLowerCase())}`;
    console.log('[Moments] Querying:', url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[Moments] API error:', res.status);
      return null;
    }
    const data = await res.json();
    console.log('[Moments] Response:', JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn('[Moments] Fetch error:', err.message);
    return null;
  }
}

// ── Visitor ID (for stitching in fallback mode) ───────────

let _visitorId = null;
export function getVisitorId() { return _visitorId; }
export function setVisitorId(id) {
  _visitorId = id;
  if (prismReady && PrismModule) {
    PrismModule.setDataLayer({ tealium_visitor_id: id }).catch(() => {});
  }
}

// ── Device ID (canonical — matches PRISM app_uuid) ────────

let _deviceId = null;
let _onDeviceIdReady = null;
export function getCanonicalDeviceId() { return _deviceId; }
export function setDeviceIdForMoments(id) { _deviceId = id; }
export function setCanonicalDeviceId(id) {
  _deviceId = id;
  if (_onDeviceIdReady) _onDeviceIdReady(id);
}
export function onPrismDeviceIdReady(cb) { _onDeviceIdReady = cb; }
