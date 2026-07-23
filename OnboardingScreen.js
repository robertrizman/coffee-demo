import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, Linking, Modal, ActivityIndicator,
  Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveProfile } from './userProfile';
import { supabase } from './supabase';
import { colors, typography, spacing, radius, fonts } from './theme';
import { UserIcon, EmailIcon } from './CoffeeIcons';
import { trackCustomerRegistration } from './tealium';
import * as Location from 'expo-location';


export default function OnboardingScreen({ onComplete }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);

  const [userLocation, setUserLocation] = useState(null);
  const webViewRef = useRef(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    loadLocations();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, delay: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, delay: 150, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from('arc_locations')
        .select('*')
        .order('venue_name', { ascending: true });
      if (error) console.warn('[Onboarding] Locations query error:', error.message);
      setLocations(data || []);
    } catch (err) {
      console.warn('[Onboarding] Locations fetch threw:', err.message);
    }
    setLoadingLocations(false);
  };

  // Realtime: keep locations state in sync with DB changes
  useEffect(() => {
    const channel = supabase
      .channel('arc_locations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'arc_locations' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setLocations(prev => prev.map(l => l.id === payload.new.id ? payload.new : l));
            // Keep selected location data fresh; deselect if it just became inactive
            setSelectedLocation(prev => {
              if (!prev || prev.id !== payload.new.id) return prev;
              const today = new Date();
              const stillActive =
                payload.new.enabled &&
                (!payload.new.start_date || new Date(payload.new.start_date) <= today) &&
                (!payload.new.end_date || new Date(payload.new.end_date) >= today);
              return stillActive ? payload.new : null;
            });
          } else if (payload.eventType === 'INSERT') {
            setLocations(prev =>
              [...prev, payload.new].sort((a, b) => a.venue_name.localeCompare(b.venue_name))
            );
          } else if (payload.eventType === 'DELETE') {
            setLocations(prev => prev.filter(l => l.id !== payload.old.id));
            setSelectedLocation(prev => (prev?.id === payload.old.id ? null : prev));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-select the sole active location whenever the list changes (initial load or realtime)
  useEffect(() => {
    if (locations.length === 0) return;
    const today = new Date();
    const active = locations.filter(l =>
      l.enabled &&
      (!l.start_date || new Date(l.start_date) <= today) &&
      (!l.end_date || new Date(l.end_date) >= today)
    );
    if (active.length === 1) {
      setSelectedLocation(prev => prev ?? active[0]);
    }
  }, [locations]);

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  // Build Leaflet HTML each time locations or selected location changes
  const mapHtml = useMemo(() => {
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
    const selectedId = selectedLocation?.id ?? null;

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
  .popup-venue {
    font-size: 15px; font-weight: bold; color: #1a3a5c; margin-bottom: 4px;
  }
  .popup-address {
    font-size: 12px; color: #555; margin-bottom: 10px; line-height: 1.5;
  }
  .popup-btn {
    background: #0c3867; color: #fff; border: none;
    padding: 9px 0; border-radius: 8px; font-size: 13px;
    font-weight: bold; cursor: pointer; width: 100%;
  }
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
  @keyframes user-pulse {
    0%   { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(3.2); opacity: 0;   }
  }
  #locateBtn {
    position: absolute; top: 10px; right: 10px; z-index: 1000;
    width: 36px; height: 36px; border-radius: 8px;
    background: white; border: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
  }
  #locateBtn.searching { background: #e8f0fe; }
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
  var selId = ${JSON.stringify(selectedId)};

  var map = L.map('map', { zoomControl: true, attributionControl: false });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
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

    var icon = L.divIcon({
      html: svg,
      className: '',
      iconSize: [34, 46],
      iconAnchor: [17, 46],
      popupAnchor: [0, -48],
    });

    if (loc.geo_radius_meters) {
      var ringColor = loc.enabled ? '#68d8d5' : '#cccccc';
      var borderColor = loc.enabled ? '#0c3867' : '#999999';
      // Static boundary circle
      L.circle([loc.latitude, loc.longitude], {
        radius: loc.geo_radius_meters,
        stroke: false,
        fillColor: ringColor,
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(map);
      // Expanding blip ring — starts invisible, grows outward
      var ring = L.circle([loc.latitude, loc.longitude], {
        radius: 1,
        color: ringColor,
        fill: false,
        weight: 3,
        opacity: 0,
        interactive: false,
      }).addTo(map);
      // Stagger start so multiple locations don't pulse in lockstep
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

  // Outward blip: each ring expands from pin centre to geo boundary then resets
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

  if (activeLocs.length === 1) {
    map.setView(activeBounds[0], 16);
  } else if (activeBounds.length > 1) {
    map.fitBounds(activeBounds, { padding: [60, 60] });
  } else if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [60, 60] });
  } else {
    map.setView([-25.2744, 133.7751], 4);
  }

  // Event delegation — avoids inline onclick quoting issues
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
  map.on('click', function() {
    document.getElementById('attrPanel').style.display = 'none';
  });

  // Blue dot — driven from React Native via injectJavaScript
  var userMarker = null;
  var userDotHtml =
    '<div style="position:relative;width:20px;height:20px;">' +
      '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(66,133,244,0.28);animation:user-pulse 1.9s ease-out infinite;"></div>' +
      '<div style="position:absolute;top:3px;left:3px;right:3px;bottom:3px;border-radius:50%;background:#4285F4;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.38);"></div>' +
    '</div>';
  var userIcon = L.divIcon({ html: userDotHtml, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });

  function zoomToClosest(lat, lng) {
    if (hasAutoZoomed) return;
    var active = locs.filter(function(l) { return l.enabled && l.latitude != null; });
    if (active.length === 0) return;
    var userLL = L.latLng(lat, lng);
    var closest = null;
    var closestDist = Infinity;
    active.forEach(function(loc) {
      var dist = map.distance(userLL, L.latLng(loc.latitude, loc.longitude));
      if (dist < closestDist) { closest = loc; closestDist = dist; }
    });
    if (!closest) return;
    hasAutoZoomed = true;
    map.flyTo([closest.latitude, closest.longitude], 16, { animate: true, duration: 1.0 });
    setTimeout(function() {
      if (markerMap[closest.id]) markerMap[closest.id].openPopup();
    }, 900);
  }

  function checkProximity(lat, lng) {
    var userLL = L.latLng(lat, lng);
    var closest = null;
    var closestDist = Infinity;
    locs.forEach(function(loc) {
      if (!loc.enabled || !loc.geo_radius_meters || loc.latitude == null) return;
      var dist = map.distance(userLL, L.latLng(loc.latitude, loc.longitude));
      if (dist <= loc.geo_radius_meters && dist < closestDist) {
        closest = loc;
        closestDist = dist;
      }
    });
    if (closest) {
      if (openedForLocation !== closest.id && markerMap[closest.id]) {
        openedForLocation = closest.id;
        markerMap[closest.id].openPopup();
      }
    } else {
      openedForLocation = null;
    }
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

  // Show dot immediately if RN already has a location when the map loaded
  var initLat = ${JSON.stringify(userLocation?.latitude ?? null)};
  var initLng = ${JSON.stringify(userLocation?.longitude ?? null)};
  if (initLat !== null) { window.updateUserLocation(initLat, initLng); }

  document.getElementById('locateBtn').addEventListener('click', function() {
    var btn = this;
    if (userMarker) {
      map.flyTo(userMarker.getLatLng(), 16, { animate: true, duration: 0.8 });
      return;
    }
    btn.classList.add('searching');
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'locate_request' }));
    }
  });
</script>
</body>
</html>`;
  }, [locations, selectedLocation, userLocation]);

  const handleMapMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'select' && data.location?.id) {
        const loc = locations.find(l => l.id === data.location.id);
        if (loc) {
          setSelectedLocation(loc);
          setErrors(e => ({ ...e, location: null }));
          setLocationPickerVisible(false);
        }
      } else if (data.type === 'locate_request') {
        handleLocateRequest();
      }
    } catch (err) {
      console.warn('[Onboarding] Map message error:', err);
    }
  };

  const handleLocateRequest = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setUserLocation(loc.coords);
      webViewRef.current?.injectJavaScript(
        `document.getElementById('locateBtn').classList.remove('searching');
         window.flyToUser(${latitude}, ${longitude}); true;`
      );
    } catch (e) {
      console.warn('[Onboarding] Location error:', e.message);
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

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Please enter your name';
    if (!email.trim()) e.email = 'Please enter your email';
    else if (!email.includes('@') || !email.includes('.')) e.email = 'Please enter a valid email';
    if (!consentAccepted) e.consent = 'Please accept the privacy policy to continue';
    if (!selectedLocation) e.location = 'Please select your Arc location';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setSaving(true);
    const profile = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      arc_location_id: selectedLocation?.id || null,
      arc_location_name: selectedLocation ? `${selectedLocation.venue_name}, ${selectedLocation.state}` : null,
    };
    await saveProfile(profile);
    setSaving(false);
    trackCustomerRegistration(profile);
    onComplete(profile);
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://tealium.com/privacy/');
  };

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.bg}>
          <Video
            source={require('./assets/videos/onboarding-bg.mp4')}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
            useNativeControls={false}
          />
          <View style={styles.overlay} />

          <SafeAreaView style={styles.safe}>
            <ScrollView
              contentContainerStyle={[styles.inner, { paddingTop: Math.max(insets.top + spacing.lg, spacing.xl) }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                {/* Title */}
                <View style={styles.logoArea}>
                  <Text style={styles.appName}>Coffee Ordering</Text>
                  <View style={styles.dividerLine} />
                  <Text style={styles.tagline}>COURTESY OF TEALIUM</Text>
                </View>

                {/* Glass card */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Welcome!</Text>
                  <Text style={styles.cardSubtitle}>
                    Tell us your name and email so we can track your orders and let you know when they're ready.
                  </Text>

                  {/* Name */}
                  <Text style={styles.fieldLabel}>YOUR NAME</Text>
                  <View style={[styles.inputRow, errors.name && styles.inputRowError]}>
                    <UserIcon size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Alex"
                      placeholderTextColor={colors.textMuted}
                      value={name}
                      onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: null })); }}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

                  {/* Email */}
                  <Text style={styles.fieldLabel}>YOUR EMAIL</Text>
                  <View style={[styles.inputRow, errors.email && styles.inputRowError]}>
                    <EmailIcon size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textMuted}
                      value={email}
                      onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: null })); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleContinue}
                    />
                  </View>
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

                  <View style={styles.privacyNote}>
                    <Text style={styles.privacyNoteText}>
                      🔒 Your details are stored only on this device and used to track your orders. We don't share them with anyone.
                    </Text>
                  </View>

                  {/* Arc Location */}
                  <Text style={styles.fieldLabel}>LOCATION</Text>
                  <TouchableOpacity
                    style={[styles.locationPicker, errors.location && styles.inputRowError]}
                    onPress={openLocationPicker}
                    activeOpacity={0.7}
                  >
                    {loadingLocations ? (
                      <ActivityIndicator size="small" color={colors.teal} />
                    ) : selectedLocation ? (
                      <View style={{ flex: 1 }}>
                        <Text style={styles.locationPickerSelected}>{selectedLocation.venue_name}</Text>
                        <Text style={styles.locationPickerSub}>{selectedLocation.address}, {selectedLocation.state}</Text>
                      </View>
                    ) : (
                      <Text style={styles.locationPickerPlaceholder}>Select your location</Text>
                    )}
                    <Text style={styles.locationPickerChevron}>›</Text>
                  </TouchableOpacity>
                  {errors.location && <Text style={styles.errorText}>{errors.location}</Text>}

                  {/* Privacy Policy Consent */}
                  <TouchableOpacity
                    style={[styles.consentRow, errors.consent && styles.consentRowError]}
                    onPress={() => {
                      setConsentAccepted(!consentAccepted);
                      setErrors((e) => ({ ...e, consent: null }));
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
                      {consentAccepted && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.consentText}>
                      I agree to Tealium's{' '}
                      <Text
                        style={styles.privacyLink}
                        onPress={(e) => {
                          e.stopPropagation();
                          openPrivacyPolicy();
                        }}
                      >
                        Privacy Policy
                      </Text>
                    </Text>
                  </TouchableOpacity>
                  {errors.consent && <Text style={styles.errorText}>{errors.consent}</Text>}

                  <TouchableOpacity
                    style={[styles.continueBtn, (saving || !consentAccepted) && styles.continueBtnDisabled]}
                    onPress={handleContinue}
                    disabled={saving || !consentAccepted}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.continueBtnText}>
                      {saving ? 'Saving...' : 'Start ordering →'}
                    </Text>
                  </TouchableOpacity>
                </View>

              </Animated.View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>

      {/* Location Map Modal */}
      <Modal
        visible={locationPickerVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📍 Select Location</Text>
            <TouchableOpacity onPress={() => setLocationPickerVisible(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingLocations ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={colors.teal} />
              <Text style={styles.mapLoadingText}>Loading locations…</Text>
            </View>
          ) : (
            <>
              <WebView
                ref={webViewRef}
                source={{ html: mapHtml }}
                style={styles.mapWebView}
                onMessage={handleMapMessage}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                mixedContentMode="always"
                allowFileAccess
              />
              <View style={styles.mapHint}>
                <Text style={styles.mapHintText}>Tap a pin to see venue details · Active locations shown in navy</Text>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.midnight },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 24, 56, 0.48)',
  },
  safe: { flex: 1 },
  inner: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xl,
  },
  content: { gap: spacing.xl, alignItems: 'center' },

  // Title
  logoArea: { alignItems: 'center', gap: spacing.md, marginTop: 200 },
  appName: {
    fontSize: 34, fontFamily: fonts.extrabold, color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(104, 216, 213, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  dividerLine: {
    width: 36, height: 2,
    backgroundColor: colors.teal, borderRadius: 2, opacity: 0.8,
  },
  tagline: {
    fontSize: 10, fontFamily: fonts.bold,
    color: 'rgba(104, 216, 213, 0.75)', letterSpacing: 3,
  },

  // Card
  card: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.93)',
    borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.midnight,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.textDark },
  cardSubtitle: {
    fontSize: 13, fontFamily: fonts.regular,
    color: colors.textLight, lineHeight: 20, marginTop: -4,
  },

  // Fields
  fieldLabel: {
    fontSize: 10, fontFamily: fonts.bold,
    color: colors.primary, letterSpacing: 1,
    marginBottom: -4,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputRowError: { borderColor: '#c0392b' },
  input: { flex: 1, height: 52, fontSize: 15, color: colors.textDark, fontFamily: fonts.regular },
  errorText: { fontSize: 12, color: '#c0392b', marginTop: -6 },

  privacyNote: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  privacyNoteText: { fontSize: 11, color: colors.textMuted, lineHeight: 18 },

  // Location picker trigger
  locationPicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 52,
  },
  locationPickerSelected: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  locationPickerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationPickerPlaceholder: { flex: 1, fontSize: 15, color: colors.textMuted },
  locationPickerChevron: { fontSize: 22, color: colors.textMuted, marginLeft: spacing.sm },

  // Consent
  consentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  consentRowError: { borderColor: '#c0392b' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontFamily: fonts.bold },
  consentText: { flex: 1, fontSize: 13, color: colors.textDark, lineHeight: 20 },
  privacyLink: {
    color: colors.primary, fontFamily: fonts.semibold, textDecorationLine: 'underline',
  },

  // Button
  continueBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing.xs,
    borderWidth: 1, borderColor: 'rgba(104, 216, 213, 0.35)',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold, letterSpacing: 0.3 },

  // Map modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 13, color: colors.textDark, fontFamily: fonts.semibold },
  mapWebView: { flex: 1 },
  mapLoading: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  mapLoadingText: { fontSize: 14, color: colors.textMuted, fontFamily: fonts.regular },
  mapHint: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  mapHintText: {
    fontSize: 11, color: colors.textMuted,
    fontFamily: fonts.regular, textAlign: 'center',
  },
});
