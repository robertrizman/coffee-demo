import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, Alert, Modal, Clipboard, Platform, AppState, Linking,
  PermissionsAndroid,
} from 'react-native';
import DRINK_IMAGES from './drinkImages';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import Geolocation from '@react-native-community/geolocation';
import { registerPushToken } from './push';
import { getDeviceId } from './deviceId';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './AppContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';
import { getOrderPersonality } from './foodPairingAI';
import { trackProfileTab, trackEditProfile, trackProfileUpdated, trackUuidCopy, trackDietaryRequirementsUpdated, joinTrace, leaveTrace, getCanonicalDeviceId, getVisitorId, fetchVisitorIdFromPrism, setEmailForMoments } from './tealium';
import { colors, typography, spacing, radius, shadow, fonts } from './theme';
import { UserIcon, EmailIcon, LocationPinIcon, TakeawayCupIcon, CheckIcon, CopyIcon, EditIcon, AiSparkIcon, LightbulbIcon, MagnifyIcon, LightningBoltIcon, LeafIcon, ShieldIcon, AnalyticsIcon, SettingsIcon } from './CoffeeIcons';

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function StatusBadge({ status, fulfilledAt }) {
  const isPending = status === 'pending';
  const isCancelled = status === 'cancelled';
  const isCollected = status === 'complete' && fulfilledAt && (Date.now() - fulfilledAt) > 30 * 60 * 1000;
  const label = isPending ? 'Being prepared'
    : isCancelled ? 'Cancelled'
    : isCollected ? 'Collected'
    : 'Ready for pickup!';
  return (
    <View style={[styles.badge,
      isPending ? styles.badgePending
      : isCancelled ? styles.badgeCancelled
      : styles.badgeDone
    ]}>
      <View style={[styles.badgeDot, isPending ? styles.badgeDotPending : styles.badgeDotDone]} />
      <Text style={[styles.badgeText,
        isPending ? styles.badgeTextPending
        : isCancelled ? styles.badgeTextCancelled
        : styles.badgeTextDone
      ]}>
        {label}
      </Text>
    </View>
  );
}

export default function OrdersProfileScreen() {
  const { state, dispatch } = useApp();
  const { isAdmin } = useAuth();
  const { deviceId, profile } = state;
  const navigation = useNavigation();


  // Profile edit state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [editEmail, setEditEmail] = useState(profile?.email || '');

  // Location state
  const [locations, setLocations] = useState([]);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(profile?.arc_location_id || null);
  const [selectedLocationName, setSelectedLocationName] = useState(profile?.arc_location_name || null);
  const [userLocation, setUserLocation] = useState(null);
  const mapWebViewRef = useRef(null);
  const [toast, setToast] = useState(null);

  // Permission toggles
  const [notifPermission, setNotifPermission] = useState(null);
  const [hasPushToken, setHasPushToken] = useState(false);
  const [locationPermission, setLocationPermission] = useState(null);

  const checkPushTokenInDb = useCallback(async () => {
    const deviceId = getCanonicalDeviceId() || state.deviceId || (await getDeviceId());
    if (!deviceId) { setHasPushToken(false); return; }
    const { data } = await supabase
      .from('push_tokens')
      .select('device_id')
      .eq('device_id', deviceId)
      .maybeSingle();
    setHasPushToken(!!data);
  }, [state.deviceId]);

  const checkPermissions = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifPermission(status);
    if (status === 'granted') {
      await checkPushTokenInDb();
    } else {
      setHasPushToken(false);
    }

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      setLocationPermission(granted);
    } else {
      Geolocation.getCurrentPosition(
        () => setLocationPermission(true),
        (err) => setLocationPermission(err.code !== 1),
        { timeout: 500, maximumAge: Infinity, enableHighAccuracy: false },
      );
    }
  }, [checkPushTokenInDb]);

  useEffect(() => {
    checkPermissions();
    // Re-check when app comes to foreground from background
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkPermissions();
    });
    // Re-check every time this screen gets focus (e.g. navigating from order page)
    const focusSub = navigation.addListener('focus', checkPermissions);
    return () => {
      appStateSub.remove();
      focusSub();
    };
  }, [checkPermissions, navigation]);

  const handleNotifToggle = async () => {
    if (notifPermission === 'granted' && hasPushToken) {
      // Currently ON — send to Settings to disable
      Alert.alert(
        'Turn off notifications',
        'To disable push notifications, turn them off in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // Check current OS permission before requesting
    const { status: currentStatus } = await Notifications.getPermissionsAsync();

    if (currentStatus === 'denied') {
      // Android won't re-prompt after denial — must go to Settings
      Alert.alert(
        'Notifications blocked',
        'Notifications were previously denied. To enable them, open your device settings and turn on notifications for this app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // Undetermined or granted-but-no-token — request/re-register
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermission(status);
    if (status === 'granted') {
      const ok = await registerPushToken(profile?.arc_location_id || null);
      if (ok) {
        setHasPushToken(true);
      } else {
        Alert.alert(
          'Registration failed',
          'Notifications are allowed but we could not register this device. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } else {
      Alert.alert(
        'Notifications blocked',
        'To receive order updates, open your device settings and enable notifications for this app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const handleLocationToggle = async () => {
    if (locationPermission) {
      Linking.openSettings();
    } else if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: 'Location', message: "Used to confirm you're at the venue." },
      );
      setLocationPermission(result === PermissionsAndroid.RESULTS.GRANTED);
    } else {
      Linking.openSettings();
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Extra historical orders from Supabase not yet in local state
  // (e.g. from a previous app session before Supabase loaded)
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');
  const [traceId, setTraceId] = useState('');
  const [traceActive, setTraceActive] = useState(false);
  const [traceStatus, setTraceStatus] = useState('');
  const [momentsData, setMomentsData] = useState(null);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const [momentsRefreshing, setMomentsRefreshing] = useState(false);
  const [momentsUrl, setMomentsUrl] = useState('');
  const [mobileSettingsData, setMobileSettingsData] = useState(null);
  const [mobileSettingsLoading, setMobileSettingsLoading] = useState(false);
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [momentsUnlocked, setMomentsUnlocked] = useState(false);
  const [tealiumUuid, setTealiumUuid] = useState(null);
  const [visitorId, setVisitorId] = useState(() => getVisitorId());
  const [missedYouVisible, setMissedYouVisible] = useState(false);
  const [missedYouOrder, setMissedYouOrder] = useState(null);
  const missedYouChecked = useRef(false);
  const [editDietary, setEditDietary] = useState(profile?.dietary_requirements || '');
  const [personalityData, setPersonalityData] = useState(null);
  const [personalityLoading, setPersonalityLoading] = useState(false);
  const personalityFetched = useRef(false);

  // Listen for Tealium UUID and visitor ID to be ready
  useEffect(() => {
    const checkIds = () => {
      const uuid = getCanonicalDeviceId();
      if (uuid) setTealiumUuid(uuid);
      const vid = getVisitorId();
      if (vid) setVisitorId(vid);
    };
    checkIds();
    // PRISM resolves visitor ID asynchronously; poll a few times to catch it
    const t1 = setTimeout(checkIds, 2000);
    const t2 = setTimeout(checkIds, 5000);
    const t3 = setTimeout(checkIds, 10000);
    const t4 = setTimeout(checkIds, 20000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  // Filter global orders down to only this user's orders
  const myOrders = state.orders.filter((o) => {
    if (deviceId && (o.deviceId === deviceId || o.tealAppUuid === deviceId)) return true;
    if (profile?.email && o.email === profile.email) return true;
    return false;
  });

  // Merge with any remote-only orders, deduplicated
  const localIds = new Set(myOrders.map((o) => o.id));
  const mergedOrders = [
    ...myOrders,
    ...remoteOrders.filter((o) => !localIds.has(o.id)),
  ].sort((a, b) => (b.placedAt || b.placed_at) - (a.placedAt || a.placed_at));

  const fetchRemoteOrders = useCallback(async () => {
    if (!deviceId && !profile?.email) { setLoading(false); return []; }
    let query = supabase.from('orders').select('*').order('placed_at', { ascending: false }).limit(30);
    if (deviceId && profile?.email) {
      query = query.or(`device_id.eq.${deviceId},email.eq.${profile.email}`);
    } else if (deviceId) {
      query = query.eq('device_id', deviceId);
    } else if (profile?.email) {
      query = query.eq('email', profile.email);
    }
    const { data, error } = await query;
    setLoading(false);
    setRefreshing(false);
    const fetched = error ? [] : (data || []);
    if (!error) setRemoteOrders(fetched);
    return fetched;
  }, [deviceId, profile?.email]);

  useEffect(() => {
    fetchRemoteOrders();
    loadLocations();
  }, [fetchRemoteOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPersonalityData(null);
    const freshRemote = await fetchRemoteOrders();
    const localIds = new Set(myOrders.map(o => o.id));
    const fresh = [
      ...myOrders,
      ...freshRemote.filter(o => !localIds.has(o.id)),
    ].sort((a, b) => (b.placedAt || b.placed_at) - (a.placedAt || a.placed_at));
    setRefreshing(false);
    if (!isAdmin) {
      const ordersForPersonality = fresh.length ? fresh : mergedOrders;
      if (ordersForPersonality.length) {
        personalityFetched.current = true;
        setPersonalityLoading(true);
        getOrderPersonality(ordersForPersonality, profile?.name)
          .then(result => { setPersonalityData(result); setPersonalityLoading(false); })
          .catch(() => setPersonalityLoading(false));
      }
    }
  }, [fetchRemoteOrders, myOrders, mergedOrders, isAdmin]);

  useEffect(() => {
    if (isAdmin || !mergedOrders.length || personalityFetched.current) return;
    personalityFetched.current = true;
    setPersonalityLoading(true);
    getOrderPersonality(mergedOrders, profile?.name)
      .then(result => { setPersonalityData(result); setPersonalityLoading(false); })
      .catch(() => setPersonalityLoading(false));
  }, [mergedOrders.length, isAdmin]);

  // When debug tab opens, ask PRISM directly for the visitor ID
  useEffect(() => {
    if (activeTab !== 'debug') return;
    fetchVisitorIdFromPrism().then(vid => { if (vid) setVisitorId(vid); });
  }, [activeTab]);

  const MOMENTS_BASE = 'https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39';

  // "We missed you" check — runs once visitor ID is known and orders have loaded,
  // but at most once every 7 days (persisted across app restarts via SecureStore).
  useEffect(() => {
    if (!visitorId || loading || missedYouChecked.current) return;
    missedYouChecked.current = true;
    SecureStore.getItemAsync('missed_you_last_shown').then(storedTs => {
      const lastShownMs = storedTs ? parseInt(storedTs, 10) : 0;
      const daysSinceShown = (Date.now() - lastShownMs) / 86400000;
      if (daysSinceShown < 7) return;
      fetch(`${MOMENTS_BASE}/visitors/${visitorId}`, { headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => {
          const dates = data?.dates || {};
          // Find last visit epoch — try known keys then fall back to first available
          const epoch = dates['Last Visit Date'] ?? dates['last_visit_date'] ?? dates['last_visit']
            ?? (Object.keys(dates).length > 0 ? Object.values(dates)[0] : null);
          if (!epoch) return;
          // Normalise: Moments API returns epoch in ms; if < 1e12 it's seconds
          const lastVisitMs = epoch > 1e12 ? epoch : epoch * 1000;
          const diffDays = (Date.now() - lastVisitMs) / 86400000;
          const shouldShow = diffDays >= 7;
          if (shouldShow && mergedOrders.length > 0) {
            SecureStore.setItemAsync('missed_you_last_shown', String(Date.now())).catch(() => {});
            setMissedYouOrder(mergedOrders[0]);
            setMissedYouVisible(true);
          }
        })
        .catch(() => {});
    }).catch(() => {});
  }, [visitorId, loading]);

  // Pick up the "Show modal" trigger set from Settings → Tealium Profile
  useFocusEffect(useCallback(() => {
    SecureStore.getItemAsync('demo_trigger_missed_you').then(val => {
      if (val === '1' && mergedOrders.length > 0) {
        SecureStore.deleteItemAsync('demo_trigger_missed_you').catch(() => {});
        missedYouChecked.current = false;
        setMissedYouOrder(mergedOrders[0]);
        setMissedYouVisible(true);
      }
    }).catch(() => {});
  }, [mergedOrders]));

  useEffect(() => {
    if (activeTab !== 'profile' || momentsData) return;
    const email = profile?.email;
    if (!email) return;
    if (email) setEmailForMoments(email);
    const url = `https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39?attributeId=5549&attributeValue=${encodeURIComponent(email.trim().toLowerCase())}`;
    fetch(url, { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(data => {
        setMomentsData(data);
        const momentsDietary = data?.properties?.['Dietary Requirements'];
        if (momentsDietary && !profile?.dietary_requirements) {
          dispatch({
            type: 'UPDATE_PROFILE',
            payload: { ...profile, dietary_requirements: momentsDietary },
          });
        }
      })
      .catch(() => {});
  }, [activeTab]);

  const locationMapHtml = useMemo(() => {
    const today = new Date();
    const locationsJson = JSON.stringify(
      locations.map(loc => ({
        id: loc.id,
        venue_name: loc.venue_name,
        address: loc.address,
        state: loc.state,
        latitude: loc.latitude,
        longitude: loc.longitude,
        geo_radius_meters: loc.geo_radius_meters || null,
        enabled:
          loc.enabled &&
          (!loc.start_date || new Date(loc.start_date) <= today) &&
          (!loc.end_date || new Date(loc.end_date) >= today),
      }))
    );
    const selId = selectedLocationId ?? null;
    const initLat = userLocation?.latitude ?? null;
    const initLng = userLocation?.longitude ?? null;

    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  #map { width: 100%; height: 100%; }
  .popup-venue { font-size: 15px; font-weight: bold; color: #1a3a5c; margin-bottom: 4px; }
  .popup-address { font-size: 12px; color: #555; margin-bottom: 10px; line-height: 1.5; }
  .popup-btn { background: #0c3867; color: #fff; border: none; padding: 9px 0; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; width: 100%; }
  .popup-btn.selected { background: #16a34a; }
  .popup-inactive { font-size: 11px; color: #999; text-align: center; padding: 4px 0; }
  #infoBtn {
    position: absolute; bottom: 18px; left: 10px; z-index: 1000;
    width: 22px; height: 22px; border-radius: 50%;
    background: rgba(255,255,255,0.92); border: 1.5px solid #bbb;
    font-size: 12px; font-style: italic; font-family: Georgia, serif;
    line-height: 19px; text-align: center; cursor: pointer;
    color: #444; box-shadow: 0 1px 5px rgba(0,0,0,0.28); padding: 0;
  }
  #attrPanel {
    display: none; position: absolute; bottom: 46px; left: 10px; z-index: 1000;
    background: rgba(255,255,255,0.93); border-radius: 5px;
    padding: 5px 9px; font-size: 10px; color: #555; white-space: nowrap;
    box-shadow: 0 1px 5px rgba(0,0,0,0.22);
  }
  #attrPanel a { color: #0066cc; text-decoration: none; }
  #locateBtn {
    position: absolute; top: 10px; right: 10px; z-index: 1000;
    width: 36px; height: 36px; border-radius: 8px;
    background: white; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;
  }
  #locateBtn.searching { background: #e8f0fe; }
  @keyframes user-pulse {
    0%   { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(3.2); opacity: 0; }
  }
</style>
</head>
<body>
<div id="map"></div>
<button id="locateBtn">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="6" stroke="#4285F4" stroke-width="2"/>
    <circle cx="12" cy="12" r="2.5" fill="#4285F4"/>
    <line x1="12" y1="2" x2="12" y2="7" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="17" x2="12" y2="22" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
    <line x1="2" y1="12" x2="7" y2="12" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
    <line x1="17" y1="12" x2="22" y2="12" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
  </svg>
</button>
<button id="infoBtn">i</button>
<div id="attrPanel">
  © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors
  © <a href="https://carto.com/attributions" target="_blank">CARTO</a>
</div>
<script>
  var locs = ${locationsJson};
  var selId = ${JSON.stringify(selId)};
  var map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, subdomains: 'abcd',
  }).addTo(map);

  var bounds = [];
  var pulseRings = [];
  var ringIndex = 0;
  var markerMap = {};
  var openedForLocation = null;
  var hasAutoZoomed = false;

  locs.forEach(function(loc) {
    if (loc.latitude == null || loc.longitude == null) return;
    var isSel = loc.id === selId;
    var pinColor = isSel ? '#68d8d5' : (loc.enabled ? '#0c3867' : '#aaaaaa');
    var ringColor = isSel ? '#0c3867' : 'white';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">' +
        '<path d="M17 0C7.6 0 0 7.6 0 17c0 11.7 17 29 17 29S34 28.7 34 17C34 7.6 26.4 0 17 0z" fill="' + pinColor + '"/>' +
        '<circle cx="17" cy="17" r="8" fill="' + ringColor + '" opacity="0.95"/>' +
      '</svg>';
    var icon = L.divIcon({ html: svg, className: '', iconSize: [34, 46], iconAnchor: [17, 46], popupAnchor: [0, -48] });

    if (loc.geo_radius_meters) {
      L.circle([loc.latitude, loc.longitude], {
        radius: loc.geo_radius_meters, stroke: false,
        fillColor: loc.enabled ? '#68d8d5' : '#cccccc', fillOpacity: 0.07, interactive: false,
      }).addTo(map);
      var ring = L.circle([loc.latitude, loc.longitude], {
        radius: 1, color: loc.enabled ? '#68d8d5' : '#cccccc',
        fill: false, weight: 3, opacity: 0, interactive: false,
      }).addTo(map);
      pulseRings.push({ ring: ring, max: loc.geo_radius_meters, t: (ringIndex * 0.45) % 1 });
      ringIndex++;
    }

    var marker = L.marker([loc.latitude, loc.longitude], { icon: icon }).addTo(map);
    markerMap[loc.id] = marker;
    bounds.push([loc.latitude, loc.longitude]);

    var vn = loc.venue_name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var addr = (loc.address + ', ' + loc.state).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var popupHtml =
      '<div style="min-width:200px; padding:4px 0;">' +
        '<div class="popup-venue">' + vn + '</div>' +
        '<div class="popup-address">' + addr + '</div>';
    if (loc.enabled) {
      var btnCls = isSel ? 'popup-btn selected' : 'popup-btn';
      var btnLbl = isSel ? '✓ Selected' : 'Select this location';
      popupHtml += '<button class="' + btnCls + '" data-id="' + loc.id + '">' + btnLbl + '</button>';
    } else {
      popupHtml += '<div class="popup-inactive">Currently unavailable</div>';
    }
    popupHtml += '</div>';
    marker.bindPopup(popupHtml, { maxWidth: 270 });
  });

  if (pulseRings.length > 0) {
    setInterval(function() {
      pulseRings.forEach(function(p) {
        p.t += 0.022;
        if (p.t >= 1) p.t = 0;
        p.ring.setRadius(Math.max(p.max * p.t, 1));
        p.ring.setStyle({ opacity: 0.85 * (1 - p.t) });
      });
    }, 40);
  }

  var activeLocs = locs.filter(function(l) { return l.enabled && l.latitude != null; });
  var activeBounds = activeLocs.map(function(l) { return [l.latitude, l.longitude]; });
  if (activeLocs.length === 1) { map.setView(activeBounds[0], 16); }
  else if (activeBounds.length > 1) { map.fitBounds(activeBounds, { padding: [60, 60] }); }
  else if (bounds.length > 0) { map.fitBounds(bounds, { padding: [60, 60] }); }
  else { map.setView([-25.2744, 133.7751], 4); }

  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('popup-btn')) {
      var id = e.target.getAttribute('data-id');
      var loc = locs.find(function(l) { return l.id === id; });
      if (loc && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', location: loc }));
      }
    }
  });

  document.getElementById('infoBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    var p = document.getElementById('attrPanel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
  });
  map.on('click', function() { document.getElementById('attrPanel').style.display = 'none'; });

  var userMarker = null;
  var userDotHtml =
    '<div style="position:relative;width:20px;height:20px;">' +
      '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(66,133,244,0.28);animation:user-pulse 1.9s ease-out infinite;"></div>' +
      '<div style="position:absolute;top:3px;left:3px;right:3px;bottom:3px;border-radius:50%;background:#4285F4;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.38);"></div>' +
    '</div>';
  var userIcon = L.divIcon({ html: userDotHtml, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });

  function zoomToClosest(lat, lng) {
    if (hasAutoZoomed) return;
    if (activeLocs.length === 0) return;
    var userLL = L.latLng(lat, lng);
    var closest = null; var closestDist = Infinity;
    activeLocs.forEach(function(loc) {
      var dist = map.distance(userLL, L.latLng(loc.latitude, loc.longitude));
      if (dist < closestDist) { closest = loc; closestDist = dist; }
    });
    if (!closest) return;
    hasAutoZoomed = true;
    map.flyTo([closest.latitude, closest.longitude], 16, { animate: true, duration: 1.0 });
    setTimeout(function() { if (markerMap[closest.id]) markerMap[closest.id].openPopup(); }, 900);
  }

  function checkProximity(lat, lng) {
    var userLL = L.latLng(lat, lng);
    var closest = null; var closestDist = Infinity;
    locs.forEach(function(loc) {
      if (!loc.enabled || !loc.geo_radius_meters || loc.latitude == null) return;
      var dist = map.distance(userLL, L.latLng(loc.latitude, loc.longitude));
      if (dist <= loc.geo_radius_meters && dist < closestDist) { closest = loc; closestDist = dist; }
    });
    if (closest) {
      if (openedForLocation !== closest.id && markerMap[closest.id]) {
        openedForLocation = closest.id;
        markerMap[closest.id].openPopup();
      }
    } else { openedForLocation = null; }
  }

  window.updateUserLocation = function(lat, lng) {
    var ll = [lat, lng];
    if (userMarker) { userMarker.setLatLng(ll); }
    else { userMarker = L.marker(ll, { icon: userIcon, zIndexOffset: 2000 }).addTo(map); }
    zoomToClosest(lat, lng);
    checkProximity(lat, lng);
  };

  window.flyToUser = function(lat, lng) {
    window.updateUserLocation(lat, lng);
    map.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
  };

  var initLat = ${JSON.stringify(initLat)};
  var initLng = ${JSON.stringify(initLng)};
  if (initLat !== null) { window.updateUserLocation(initLat, initLng); }

  document.getElementById('locateBtn').addEventListener('click', function() {
    if (userMarker) { map.flyTo(userMarker.getLatLng(), 16, { animate: true, duration: 0.8 }); return; }
    this.classList.add('searching');
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'locate_request' }));
    }
  });
</script>
</body>
</html>`;
  }, [locations, selectedLocationId, userLocation]);

  const handleLocationMapMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'select' && data.location?.id) {
        const loc = locations.find(l => l.id === data.location.id);
        if (loc) handleSelectLocation(loc);
      } else if (data.type === 'locate_request') {
        handleLocateRequest();
      }
    } catch (e) {
      console.warn('[Profile] Map message error:', e.message);
    }
  };

  const handleLocateRequest = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setUserLocation(loc.coords);
      mapWebViewRef.current?.injectJavaScript(
        `document.getElementById('locateBtn').classList.remove('searching');
         window.flyToUser(${latitude}, ${longitude}); true;`
      );
    } catch (e) {
      console.warn('[Profile] Location error:', e.message);
    }
  };

  const openLocationPicker = async () => {
    setLocationPickerVisible(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation(loc.coords);
    } catch (e) {}
  };

  const loadLocations = async () => {
    const { data, error } = await supabase.from('arc_locations').select('*').order('venue_name');
    if (error) console.warn('[Profile] Locations query error:', error.message, error.code);
    setLocations(data || []);
  };

  useEffect(() => {
    const channel = supabase
      .channel('arc-locations-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_locations' }, () => {
        loadLocations();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  const currentLocationActive = locations.length > 0 && selectedLocationId
    ? isLocationActive(locations.find(l => l.id === selectedLocationId) || {})
    : true;

  // Real-time: update status when barista marks order complete
  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel('orders-profile-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        // Update both sources
        dispatch({ type: 'REALTIME_ORDER_UPDATED', payload: { id: payload.new.id, status: payload.new.status, fulfilledAt: payload.new.fulfilled_at } });
        setRemoteOrders((prev) =>
          prev.map((o) => o.id === payload.new.id ? { ...o, ...payload.new } : o)
        );
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [deviceId]);

  const handleSaveProfile = () => {
    if (!editName.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    if (!editEmail.trim() || !editEmail.includes('@')) { Alert.alert('Email required', 'Please enter a valid email.'); return; }
    const dietary = editDietary.trim() || null;
    const updatedProfile = {
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      arc_location_id: selectedLocationId,
      arc_location_name: selectedLocationName,
      dietary_requirements: dietary,
    };
    dispatch({ type: 'UPDATE_PROFILE', payload: updatedProfile });
    trackProfileUpdated(updatedProfile);
    if (dietary !== (profile?.dietary_requirements || null)) {
      trackDietaryRequirementsUpdated(dietary);
    }
    setEditMode(false);
    // Also update push token with new location
    if (deviceId) {
      supabase.from('push_tokens')
        .update({ arc_location_id: selectedLocationId, updated_at: new Date().toISOString() })
        .eq('device_id', deviceId)
        .then(() => console.log('[Profile] Push token location updated'));
    }
    showToast('✓ Profile saved');
  };

  const handleSelectLocation = (loc) => {
    const newId = loc?.id || null;
    const newName = loc ? `${loc.venue_name}, ${loc.state}` : null;
    setSelectedLocationId(newId);
    setSelectedLocationName(newName);
    setLocationPickerVisible(false);
    // Persist to SecureStore immediately so the change survives a restart
    dispatch({ type: 'UPDATE_PROFILE', payload: { ...profile, arc_location_id: newId, arc_location_name: newName } });
    // Also update push token with new location
    if (deviceId) {
      supabase.from('push_tokens')
        .update({ arc_location_id: newId, updated_at: new Date().toISOString() })
        .eq('device_id', deviceId)
        .then(() => console.log('[Profile] Push token location updated to:', loc?.venue_name));
    }
    showToast(`📍 Location set to ${loc?.venue_name || 'none'}`);
  };

  const pendingCount = mergedOrders.filter((o) => o.status === 'pending').length;

  const handleJoinTrace = async () => {
    if (!traceId.trim()) return;
    try {
      await joinTrace(traceId.trim());
      setTraceActive(true);
      setTraceStatus(`✅ Trace started: ${traceId.trim()}`);
      console.log('[Debug] Joined trace:', traceId.trim());
      // Auto-hide after 3 seconds
      setTimeout(() => setTraceStatus(''), 3000);
    } catch (e) {
      setTraceStatus(`❌ Error: ${e.message}`);
      setTimeout(() => setTraceStatus(''), 3000);
    }
  };

  const handleLeaveTrace = async () => {
    try {
      await leaveTrace();
      setTraceActive(false);
      setTraceId('');
      setTraceStatus('✅ Trace stopped');
      console.log('[Debug] Left trace and ended session');
      // Auto-hide after 3 seconds
      setTimeout(() => setTraceStatus(''), 3000);
    } catch (e) {
      setTraceStatus(`❌ Error: ${e.message}`);
      setTimeout(() => setTraceStatus(''), 3000);
    }
  };

  const handleMissedYouReorder = () => {
    if (!missedYouOrder) return;
    (missedYouOrder.items || []).forEach(item => {
      dispatch({ type: 'ADD_ITEM', payload: item });
    });
    setMissedYouVisible(false);
    navigation.navigate('Order', { screen: 'OrderSummary' });
  };

  const handleQueryMoments = async ({ isRefresh = false } = {}) => {
    if (!visitorId) {
      setTraceStatus('Visitor ID not yet available — try again in a moment');
      setTimeout(() => setTraceStatus(''), 3000);
      return;
    }
    const url = `https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39/visitors/${visitorId}`;
    setMomentsUrl(url);
    if (isRefresh) setMomentsRefreshing(true); else setMomentsLoading(true);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setMomentsData(data);
      console.log('[Debug] Moments API response:', JSON.stringify(data));
    } catch (e) {
      setMomentsData({ error: e.message });
    }
    if (isRefresh) setMomentsRefreshing(false); else setMomentsLoading(false);
  };

  const handleQueryMobileSettings = async () => {
    const url = `https://tags.tiqcdn.com/dle/success-robert-rizman/coffee-demo/mobile_settings_dev.json?cb=${Math.floor(Math.random() * 900000) + 100000}`;
    setMobileSettingsLoading(true);
    try {
      const res = await fetch(url);
      const data = await res.json();
      setMobileSettingsData(data);
      console.log('[Debug] Mobile settings response:', JSON.stringify(data));
    } catch (e) {
      setMobileSettingsData({ error: e.message });
    }
    setMobileSettingsLoading(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      {/* Toast notification */}
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {activeTab === 'orders' ? 'My Account' : 'My profile'}
          </Text>
          <Text style={styles.subtitle}>
            {activeTab === 'orders'
              ? (loading ? 'Loading...' : pendingCount > 0 ? `${pendingCount} order${pendingCount > 1 ? 's' : ''} in progress` : `${mergedOrders.length} total orders`)
              : profile?.name || ''}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={styles.tabWrap} onPress={() => { setActiveTab('orders'); trackProfileTab('orders'); }}>
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Orders</Text>
          {activeTab === 'orders' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabWrap} onPress={() => { setActiveTab('profile'); trackProfileTab('profile'); }}>
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Profile</Text>
          {activeTab === 'profile' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.tabWrap} 
          onPress={() => { 
            setActiveTab('debug'); 
            trackProfileTab('debug');
            // Increment tap counter
            const newCount = debugTapCount + 1;
            setDebugTapCount(newCount);
            if (newCount >= 10 && !momentsUnlocked) {
              setMomentsUnlocked(true);
              showToast('🎉 Moments API unlocked!');
            }
          }}
        >
          <Text style={[styles.tabText, activeTab === 'debug' && styles.tabTextActive]}>Debug</Text>
          {activeTab === 'debug' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading your orders...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {/* Coffee personality card */}
            {!isAdmin && (personalityLoading || personalityData) && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AiSparkIcon size={14} color={colors.primary} />
                    <Text style={styles.insightTitle}>Your Coffee Personality</Text>
                  </View>
                  {personalityLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : personalityData?.engine ? (
                    <View style={styles.insightAiBadge}>
                      <Text style={styles.insightAiBadgeText}>{personalityData.engine}</Text>
                    </View>
                  ) : null}
                </View>
                {!personalityLoading && personalityData && (
                  <>
                    <View style={styles.insightKjRow}>
                      <View style={styles.insightKjChip}>
                        <Text style={styles.insightKjValue}>{personalityData.totalDrinks}</Text>
                        <Text style={styles.insightKjLabel}>drinks ordered</Text>
                      </View>
                      <View style={styles.insightKjChip}>
                        <Text style={styles.insightKjValue}>{personalityData.uniqueDrinks}</Text>
                        <Text style={styles.insightKjLabel}>drink types</Text>
                      </View>
                    </View>
                    <Text style={styles.insightText}>{personalityData.text}</Text>
                  </>
                )}
              </View>
            )}

            {mergedOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <TakeawayCupIcon size={56} color={colors.border} />
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptySubtitle}>Your orders will appear here once you place one</Text>
              </View>
            ) : (
              mergedOrders.map((order) => {
                const fulfilledAt = order.fulfilledAt ?? (order.fulfilled_at ? new Date(order.fulfilled_at).getTime() : null);
                return (
                <View key={order.id} style={[
                  styles.orderCard,
                  order.status === 'complete' && styles.orderCardDone,
                  order.status === 'cancelled' && styles.orderCardCancelled,
                ]}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderId}>{order.id}</Text>
                      <Text style={styles.orderTime}>{timeAgo(order.placedAt || order.placed_at)}</Text>
                    </View>
                    <StatusBadge status={order.status} fulfilledAt={fulfilledAt} />
                  </View>
                  <View style={styles.orderItems}>
                    {(order.items || []).map((item, i) => {
                      const mods = [];
                      if (item.milk && item.milk !== 'No Milk') mods.push(item.milk);
                      if (item.extras?.length) mods.push(item.extras.join(', '));
                      if (item.specialRequest) mods.push(`"${item.specialRequest}"`);
                      return (
                        <View key={i} style={styles.orderItem}>
                          {DRINK_IMAGES[item.id]
                            ? <Image source={DRINK_IMAGES[item.id]} style={styles.orderItemImage} resizeMode="contain" />
                            : <View style={styles.itemBullet} />
                          }
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName}>{[item.size, item.name].filter(Boolean).join(' ')}</Text>
                            {mods.length > 0 && <Text style={styles.itemMods}>{mods.join(' · ')}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {order.status === 'complete' && !(fulfilledAt && (Date.now() - fulfilledAt) > 30 * 60 * 1000) && (
                    <View style={styles.readyBanner}>
                      <TakeawayCupIcon size={14} color={colors.primary} />
                      <Text style={styles.readyText}>Ready for pickup!</Text>
                    </View>
                  )}
                  {order.status === 'cancelled' && (
                    <View style={styles.cancelledBanner}>
                      <Text style={styles.cancelledBannerText}>✕ This order was cancelled</Text>
                    </View>
                  )}
                </View>
              );})
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        )
      )}

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          <View style={styles.profileCard}>
            {!editMode ? (
              <>
                <View style={styles.profileRow}>
                  <UserIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>NAME</Text>
                    <Text style={styles.profileValue}>{profile?.name || '—'}</Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <EmailIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>EMAIL</Text>
                    <Text style={styles.profileValue}>{profile?.email || '—'}</Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <LeafIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>DIETARY REQUIREMENTS</Text>
                    <Text style={[styles.profileValue, !profile?.dietary_requirements && { color: colors.textMuted }]}>
                      {profile?.dietary_requirements || 'Not set'}
                    </Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <LocationPinIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>LOCATION</Text>
                    {selectedLocationName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.profileValue, !currentLocationActive && { color: colors.textMuted }]}>
                          {selectedLocationName}
                        </Text>
                        {!currentLocationActive && (
                          <View style={styles.locationInactiveBadge}>
                            <Text style={styles.locationInactiveBadgeText}>⚠️ Needs update</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.profileValue, { color: colors.textMuted }]}>Not set</Text>
                    )}
                  </View>
                </View>
                {!currentLocationActive && selectedLocationId && (
                  <View style={styles.locationWarning}>
                    <Text style={styles.locationWarningText}>
                      Your Arc location is no longer active. Please update your location to continue receiving relevant notifications.
                    </Text>
                    <TouchableOpacity
                      style={styles.locationUpdateBtn}
                      onPress={openLocationPicker}
                    >
                      <Text style={styles.locationUpdateBtnText}>Update location →</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    setEditName(profile?.name || '');
                    setEditEmail(profile?.email || '');
                    setEditDietary(profile?.dietary_requirements || '');
                    setEditMode(true);
                    trackEditProfile();
                  }}
                >
                  <Text style={styles.editBtnText}>Edit profile</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Edit profile</Text>
                <Text style={styles.fieldLabel}>NAME</Text>
                <View style={styles.inputRow}>
                  <UserIcon size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, opacity: 0.6 }]}>
                  <EmailIcon size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.textMuted }]}
                    value={editEmail}
                    editable={false}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={styles.fieldLabel}>DIETARY REQUIREMENTS</Text>
                <View style={styles.inputRow}>
                  <LeafIcon size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={editDietary}
                    onChangeText={setEditDietary}
                    placeholder="e.g. Vegan, Gluten-free, Nut allergy"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={styles.fieldLabel}>ARC LOCATION</Text>
                <TouchableOpacity
                  style={styles.inputRow}
                  onPress={openLocationPicker}
                  activeOpacity={0.7}
                >
                  <LocationPinIcon size={16} color={colors.textMuted} />
                  <Text style={[styles.input, { paddingVertical: 0, lineHeight: 48, color: selectedLocationName ? colors.textDark : colors.textMuted }]}>
                    {selectedLocationName || 'Select location'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 18, marginRight: 4 }}>›</Text>
                </TouchableOpacity>
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditMode(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.permissionsCard}>
            <Text style={styles.permissionsTitle}>PERMISSIONS</Text>
            <View style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionLabel}>Push Notifications</Text>
                <Text style={styles.permissionSub}>Get notified when your order is ready</Text>
              </View>
              <Switch
                value={notifPermission === 'granted' && hasPushToken}
                onValueChange={handleNotifToggle}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.permissionDivider} />
            <View style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionLabel}>Location Services</Text>
                <Text style={styles.permissionSub}>Confirms you're at the venue to order</Text>
              </View>
              <Switch
                value={locationPermission === true}
                onValueChange={handleLocationToggle}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={styles.uuidCard}>
            <Text style={styles.uuidLabel}>CUSTOMER UUID (TEALIUM)</Text>
            <View style={styles.uuidRow}>
              <Text style={styles.uuidValue} numberOfLines={1} ellipsizeMode="middle">
                {tealiumUuid || deviceId || '—'}
              </Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => {
                  const uuidToCopy = tealiumUuid || deviceId;
                  if (uuidToCopy) {
                    Clipboard.setString(uuidToCopy);
                    trackUuidCopy({
                      uuid: uuidToCopy,
                      email: profile?.email || '',
                      name: profile?.name || '',
                    });
                    showToast('UUID copied to clipboard');
                  }
                }}
              >
                <CopyIcon size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldIcon size={15} color={colors.primary} />
              <Text style={styles.infoTitle}>Privacy</Text>
            </View>
            <Text style={styles.infoText}>
              Your name and email are stored securely on this device and used only to link your orders. We don't share your details with anyone.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Location Picker Modal */}
      <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <LocationPinIcon size={20} color={colors.midnight} />
              <Text style={styles.modalTitle}>Select Location</Text>
            </View>
            <TouchableOpacity onPress={() => setLocationPickerVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            ref={mapWebViewRef}
            source={{ html: locationMapHtml }}
            style={{ flex: 1 }}
            onMessage={handleLocationMapMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            allowFileAccess
          />
          <View style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center' }}>
              Tap a pin to see venue details · Active locations shown in navy
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Debug Tab ── */}
      {activeTab === 'debug' && (
        <ScrollView
          contentContainerStyle={styles.debugContent}
          showsVerticalScrollIndicator={false}
          refreshControl={momentsUnlocked ? (
            <RefreshControl
              refreshing={momentsRefreshing}
              onRefresh={() => handleQueryMoments({ isRefresh: true })}
              tintColor={colors.primary}
            />
          ) : undefined}
        >

          {/* Trace Section */}
          <View style={styles.debugCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MagnifyIcon size={18} color={colors.midnight} />
              <Text style={styles.debugCardTitle}>Tealium Trace</Text>
            </View>
            <Text style={styles.debugCardDesc}>
              Enter a Trace ID from Tealium iQ to begin a live trace session. All events will include the trace ID for real-time monitoring.
            </Text>

            <Text style={styles.debugLabel}>TRACE ID</Text>
            <View style={styles.debugInputRow}>
              <TextInput
                style={styles.debugInput}
                placeholder="Enter trace ID"
                placeholderTextColor={colors.textMuted}
                value={traceId}
                onChangeText={setTraceId}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!traceActive}
              />
            </View>

            <View style={styles.debugBtnRow}>
              <TouchableOpacity
                style={[styles.debugBtn, (!traceId.trim() || traceActive) && styles.debugBtnDisabled]}
                onPress={handleJoinTrace}
                disabled={!traceId.trim() || traceActive}
                activeOpacity={0.8}
              >
                <Text style={styles.debugBtnText}>Start Trace</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.debugBtn, styles.debugBtnDanger, !traceActive && styles.debugBtnDisabled]}
                onPress={handleLeaveTrace}
                disabled={!traceActive}
                activeOpacity={0.8}
              >
                <Text style={styles.debugBtnText}>Stop Trace</Text>
              </TouchableOpacity>
            </View>

            {traceStatus ? (
              <View style={[styles.debugStatusBadge, traceActive && styles.debugStatusBadgeActive]}>
                <Text style={[styles.debugStatusText, traceActive && styles.debugStatusTextActive]}>{traceStatus}</Text>
              </View>
            ) : null}
          </View>

          {/* Moments API Section */}
          {momentsUnlocked && (
            <View style={styles.debugCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LightningBoltIcon size={18} color={colors.midnight} />
                <Text style={styles.debugCardTitle}>Moments API</Text>
              </View>
              <Text style={styles.debugCardDesc}>Query the Moments API engine for this visitor's current profile data.</Text>

              <Text style={styles.debugLabel}>CUSTOMER EMAIL</Text>
              <Text style={styles.debugMono}>{profile?.email || '—'}</Text>

              <Text style={styles.debugLabel}>TEALIUM VISITOR ID</Text>
              <Text style={[styles.debugMono, !visitorId && { color: colors.textMuted, fontStyle: 'italic' }]}>
                {visitorId || 'Resolving from PRISM…'}
              </Text>

              <Text style={styles.debugLabel}>ENDPOINT</Text>
              <Text style={styles.debugMono} numberOfLines={3}>
                {visitorId
                  ? `https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39/visitors/${visitorId}`
                  : 'Visitor ID required'}
              </Text>

              <TouchableOpacity
                style={[styles.debugBtn, styles.debugBtnPrimary, (momentsLoading || !visitorId) && styles.debugBtnDisabled]}
                onPress={handleQueryMoments}
                disabled={momentsLoading || !visitorId}
                activeOpacity={0.8}
              >
                {momentsLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.debugBtnText}>Query Moments API</Text>
                }
              </TouchableOpacity>

              {momentsData && (
                <View style={styles.debugResponseWrap}>
                  <Text style={styles.debugLabel}>RESPONSE</Text>
                  <Text style={styles.debugMono}>{JSON.stringify(momentsData, null, 2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Attribution Section */}
          {momentsUnlocked && (momentsData?.properties || momentsData?.metrics) && (() => {
            const aggregate = momentsData.properties?.['Web Pillar - Input Data - Aggregate'];
            const aggregateItems = aggregate
              ? (String(aggregate).includes(',') ? String(aggregate).split(',').map(s => s.trim()).filter(Boolean) : [String(aggregate).trim()])
              : [];
            const metricsObj = momentsData.metrics || {};
            const metrics = [
              ['Identity Resolution', metricsObj['Web Pillar - Identity Resolution - Count']],
              ['First-Party Data', metricsObj['Web Pillar - First-Party Data - Count']],
              ['Real-Time Activation', metricsObj['Web Pillar - Real-Time Activation - Count']],
            ].filter(([, value]) => value !== undefined && value !== null && value !== '');

            if (aggregateItems.length === 0 && metrics.length === 0) return null;

            return (
              <View style={styles.debugCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AnalyticsIcon size={18} color={colors.midnight} />
                  <Text style={styles.debugCardTitle}>Attribution</Text>
                </View>
                <Text style={styles.debugCardDesc}>Web Pillar attribution signals returned by the Moments API for this visitor.</Text>

                {aggregateItems.length > 0 && (
                  <>
                    <Text style={styles.debugLabel}>WEB PILLAR - INPUT DATA - AGGREGATE</Text>
                    <View style={styles.attrPillRow}>
                      {aggregateItems.map((item, i) => (
                        <View key={i} style={styles.attrPill}>
                          <Text style={styles.attrPillText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {metrics.length > 0 && (
                  <>
                    <Text style={styles.debugLabel}>WEB PILLAR METRICS</Text>
                    <View style={styles.attrPillRow}>
                      {metrics.map(([label, value]) => (
                        <View key={label} style={styles.attrMetricPill}>
                          <Text style={styles.attrMetricPillLabel}>{label}</Text>
                          <Text style={styles.attrMetricPillValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            );
          })()}

          {/* Mobile Settings Section */}
          <View style={styles.debugCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SettingsIcon size={18} color={colors.midnight} />
              <Text style={styles.debugCardTitle}>Mobile Settings</Text>
            </View>
            <Text style={styles.debugCardDesc}>Fetch and inspect the remote Tealium prism settings JSON hosted for this profile.</Text>

            <TouchableOpacity
              style={[styles.debugBtn, styles.debugBtnPrimary, mobileSettingsLoading && styles.debugBtnDisabled]}
              onPress={handleQueryMobileSettings}
              disabled={mobileSettingsLoading}
              activeOpacity={0.8}
            >
              {mobileSettingsLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.debugBtnText}>Query Mobile JSON Settings</Text>
              }
            </TouchableOpacity>

            {mobileSettingsData && (
              <View style={styles.debugResponseWrap}>
                <Text style={styles.debugLabel}>RESPONSE</Text>
                <Text style={styles.debugMono}>{JSON.stringify(mobileSettingsData, null, 2)}</Text>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── We Missed You Modal ── */}
      <Modal visible={missedYouVisible} transparent animationType="fade">
        <View style={styles.missedYouOverlay}>
          <View style={styles.missedYouSheet}>
            {/* Header */}
            <View style={styles.missedYouHeader}>
              <TakeawayCupIcon size={32} color={colors.primary} />
              <Text style={styles.missedYouTitle}>We missed you!</Text>
              <Text style={styles.missedYouSubtitle}>
                Ready to re-order your last visit?
              </Text>
            </View>

            {/* Last order items */}
            {(missedYouOrder?.items || []).map((item, i) => {
              const mods = [];
              if (item.milk && item.milk !== 'No Milk') mods.push(item.milk);
              if (item.extras?.length) mods.push(item.extras.join(', '));
              return (
                <View key={i} style={styles.missedYouItem}>
                  {DRINK_IMAGES[item.id] ? (
                    <Image
                      source={DRINK_IMAGES[item.id]}
                      style={styles.missedYouItemImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.missedYouItemImagePlaceholder} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.missedYouItemName}>
                      {[item.size, item.name].filter(Boolean).join(' ')}
                    </Text>
                    {mods.length > 0 && (
                      <Text style={styles.missedYouItemMods}>{mods.join(' · ')}</Text>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Actions */}
            <TouchableOpacity
              style={styles.missedYouReorderBtn}
              onPress={handleMissedYouReorder}
              activeOpacity={0.85}
            >
              <Text style={styles.missedYouReorderBtnText}>Re-order now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.missedYouDismissBtn}
              onPress={() => setMissedYouVisible(false)}
            >
              <Text style={styles.missedYouDismissText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.heading1 },
  subtitle: { ...typography.subtitle, marginTop: 2 },

  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.lg, marginTop: spacing.sm },
  tabWrap: { paddingBottom: spacing.sm },
  tabText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textLight },
  tabTextActive: { fontFamily: fonts.bold, color: colors.primary },
  tabUnderline: { height: 2, backgroundColor: colors.primary, borderRadius: 2, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.caption, color: colors.primary },

  body: { padding: spacing.md, gap: spacing.md },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { ...typography.heading2 },
  emptySubtitle: { ...typography.caption, textAlign: 'center', lineHeight: 22 },

  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight,
    borderLeftWidth: 4, borderLeftColor: colors.pending,
    overflow: 'hidden', ...shadow.card,
  },
  orderCardDone: { borderLeftColor: colors.primary },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.md, paddingBottom: spacing.sm,
  },
  orderId: { fontSize: 17, fontFamily: fonts.extrabold, color: colors.textDark },
  orderTime: { ...typography.caption, marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1,
  },
  badgePending: { backgroundColor: '#fff8f0', borderColor: colors.pending },
  badgeDone: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  badgeCancelled: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeDotPending: { backgroundColor: colors.pending },
  badgeDotDone: { backgroundColor: colors.primary },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },
  badgeTextPending: { color: colors.pending },
  badgeTextDone: { color: colors.primary },
  badgeTextCancelled: { color: '#dc2626' },
  orderCardCancelled: { opacity: 0.6, borderColor: '#fca5a5', borderWidth: 1 },
  cancelledBanner: {
    backgroundColor: '#fee2e2', paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#fca5a5',
  },
  cancelledBannerText: { fontSize: 13, fontFamily: fonts.bold, color: '#dc2626' },

  orderItems: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    paddingTop: spacing.sm, gap: 8,
  },
  orderItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderItemImage: { width: 38, height: 38, borderRadius: 19 },
  itemBullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6, flexShrink: 0 },
  itemName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  itemMods: { ...typography.caption, marginTop: 2 },
  readyBanner: {
    backgroundColor: colors.primaryLight, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.primaryMid,
  },
  readyText: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },

  // Profile tab
  profileCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.borderLight,
    overflow: 'hidden', ...shadow.card,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  profileDivider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: spacing.lg },
  profileIcon: { fontSize: 22 },
  profileInfo: { flex: 1 },
  profileLabel: { ...typography.label, fontSize: 12, marginBottom: 2 },
  profileValue: { fontSize: 13, color: colors.textDark, fontFamily: fonts.semibold },
  editBtn: {
    margin: spacing.lg, marginTop: spacing.md,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center',
  },
  editBtnText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textMid },

  cardTitle: { ...typography.heading3, padding: spacing.lg, paddingBottom: 0 },
  fieldLabel: { ...typography.label, marginBottom: 6, marginTop: 12, marginHorizontal: spacing.lg },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
  },
  inputIcon: { fontSize: 16, marginRight: spacing.sm, color: colors.textMuted },
  input: { flex: 1, height: 52, fontSize: 15, color: colors.textDark },
  editActions: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingTop: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textMid },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: fonts.bold, color: '#fff' },

  infoCard: {
    backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.primaryMid, gap: spacing.sm,
  },
  infoTitle: { fontSize: 12, fontFamily: fonts.bold, color: colors.primary },
  infoText: { fontSize: 11, color: colors.textMid, lineHeight: 18 },
  permissionsCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  permissionsTitle: {
    fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted,
    letterSpacing: 0.8, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  permissionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  permissionInfo: { flex: 1, gap: 2 },
  permissionLabel: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  permissionSub: { fontSize: 11, color: colors.textMuted },
  permissionDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  insightCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.primaryMid,
    padding: spacing.md, gap: spacing.sm, ...shadow.card,
  },
  insightLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  insightLoadingText: { ...typography.caption, color: colors.primary },
  insightHeader: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  insightTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.midnight },
  insightAiBadge: {
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  insightAiBadgeText: { fontSize: 9, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 0.5 },
  insightChevron: { fontSize: 10, color: colors.textMuted, fontFamily: fonts.semibold },
  insightEngine: { fontSize: 10, fontFamily: fonts.semibold, color: colors.textMid },
  insightKjRow: { flexDirection: 'row', gap: spacing.sm },
  insightKjChip: {
    flex: 1, backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.primaryMid,
  },
  insightKjValue: { fontSize: 21, fontFamily: fonts.extrabold, color: colors.primary },
  insightKjLabel: { fontSize: 10, color: colors.textMid, fontFamily: fonts.semibold, marginTop: 2 },
  insightText: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMid, lineHeight: 20 },
  insightTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: colors.tealLight, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.tealMid },
  insightTip: { flex: 1, fontSize: 11, color: colors.textMid, fontFamily: fonts.semibold, lineHeight: 18 },
  uuidCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, gap: 6,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  uuidLabel: { ...typography.label },
  uuidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uuidValue: { flex: 1, fontSize: 11, color: colors.textMuted },
  copyBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  copyIcon: { fontSize: 16, color: colors.primary },
  locationPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceAlt,
  },
  locationPickerBtnText: { fontSize: 15, color: colors.textDark, flex: 1 },
  locationInactiveBadge: {
    backgroundColor: '#fef3c7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2,
  },
  locationInactiveBadgeText: { fontSize: 9, fontFamily: fonts.bold, color: '#92400e' },
  locationWarning: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: '#fcd34d',
  },
  locationWarningText: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  locationUpdateBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 8, alignItems: 'center',
  },
  locationUpdateBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 13, color: colors.textDark, fontFamily: fonts.semibold },
  locationItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight, marginBottom: spacing.sm,
  },
  locationItemSelected: { borderColor: colors.primary },
  locationItemDisabled: { opacity: 0.5 },
  locationItemName: { fontSize: 14, fontFamily: fonts.bold, color: colors.textDark },
  locationItemAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationItemDates: { fontSize: 10, color: colors.teal, marginTop: 3, fontFamily: fonts.semibold },
  locationBadgeActive: { backgroundColor: '#dcfce7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeActiveText: { fontSize: 9, fontFamily: fonts.bold, color: '#16a34a' },
  locationBadgeInactive: { backgroundColor: '#f1f5f9', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeInactiveText: { fontSize: 9, fontFamily: fonts.bold, color: colors.textMuted },
  toast: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    zIndex: 999, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 8, elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 13, fontFamily: fonts.semibold },

  // ── Debug tab ──
  debugContent: { padding: spacing.lg, gap: spacing.md },
  debugCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  debugCardTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight },
  debugCardDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  debugLabel: { fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.sm },
  debugInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  debugInput: { flex: 1, height: 44, fontSize: 14, color: colors.textDark, fontFamily: 'monospace' },
  debugBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  debugBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    backgroundColor: colors.midnight, alignItems: 'center',
  },
  debugBtnPrimary: { backgroundColor: colors.primary },
  debugBtnDanger: { backgroundColor: '#dc2626' },
  debugBtnDisabled: { opacity: 0.35 },
  debugBtnText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },
  debugStatusBadge: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.sm, marginTop: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  debugStatusBadgeActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  debugStatusText: { fontSize: 12, color: colors.textMid, fontFamily: fonts.semibold },
  debugStatusTextActive: { color: '#16a34a' },
  debugMono: {
    fontSize: 10, color: colors.textMid, fontFamily: 'monospace',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    padding: spacing.sm, lineHeight: 16,
  },
  debugResponseWrap: { marginTop: spacing.sm, gap: spacing.xs },
  attrPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  attrPill: {
    backgroundColor: colors.tealLight, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.tealMid,
  },
  attrPillText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.midnight },
  attrMetricPill: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
    minWidth: 90,
  },
  attrMetricPillLabel: { fontSize: 8, fontFamily: fonts.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  attrMetricPillValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight, marginTop: 2 },

  // ── We Missed You Modal ──
  missedYouOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  missedYouSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: spacing.lg, paddingHorizontal: spacing.lg,
    paddingBottom: 40, gap: spacing.md,
  },
  missedYouHeader: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
  missedYouTitle: {
    fontSize: 26, fontFamily: fonts.extrabold, color: colors.midnight, textAlign: 'center',
  },
  missedYouSubtitle: {
    fontSize: 14, color: colors.textMid, textAlign: 'center', lineHeight: 20,
  },
  missedYouItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  missedYouItemImage: {
    width: 72, height: 72, borderRadius: 14,
  },
  missedYouItemImagePlaceholder: {
    width: 72, height: 72, borderRadius: 14,
    backgroundColor: colors.primaryLight,
  },
  missedYouItemName: {
    fontSize: 16, fontFamily: fonts.bold, color: colors.textDark,
  },
  missedYouItemMods: {
    fontSize: 12, color: colors.textMuted, marginTop: 3,
  },
  missedYouReorderBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  missedYouReorderBtnText: {
    color: '#fff', fontSize: 16, fontFamily: fonts.bold, letterSpacing: 0.3,
  },
  missedYouDismissBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  missedYouDismissText: {
    fontSize: 13, color: colors.textMuted, fontFamily: fonts.medium,
  },

});