import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://4e6117809a12ae2fb88d7c5c2f1860bd@o4511272638873600.ingest.us.sentry.io/4511272642543616',
  tracesSampleRate: 0.2,
});

import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, Platform, AppState, PermissionsAndroid, Modal, View, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
try { Geolocation.setRNConfiguration({ skipPermissionRequests: false, authorizationLevel: 'whenInUse' }); } catch (e) { console.warn('[Geolocation] setRNConfiguration failed:', e.message); }
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AppProvider, useApp } from './AppContext';
import { AuthProvider } from './AuthContext';
import AppNavigator from './AppNavigator';
import OnboardingScreen from './OnboardingScreen';
import SplashLoadingScreen from './SplashLoadingScreen';
import { trackAppOpen, initTealium, trackInstallReferrer, getCanonicalDeviceId, setEmailForMoments } from './tealium';
import { registerPushToken } from './push';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { LogBox, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ── App Store URLs — update once the app is live ──────────────────────────────
// iOS: replace with your App Store URL once the app is published
// e.g. 'https://apps.apple.com/app/id1234567890'
const IOS_STORE_URL = 'https://apps.apple.com/au/app/architect-arc-cafe/id6762507451';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tealium.coffeecafe';

function isVersionOutdated(current, minimum) {
  const parse = v => (v || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const [cA, cB, cC] = parse(current);
  const [mA, mB, mC] = parse(minimum);
  if (cA !== mA) return cA < mA;
  if (cB !== mB) return cB < mB;
  return cC < mC;
}
LogBox.ignoreAllLogs(false);

// Apply Montserrat globally to every <Text> and <TextInput>.
// theme.js typography overrides per-weight (700→Bold, 800→ExtraBold etc).
// Inline styles that only set fontWeight without fontFamily get Regular as base.
if (!Text.defaultProps) Text.defaultProps = {};
Text.defaultProps.style = [{ fontFamily: 'Montserrat_400Regular' }];
if (!TextInput.defaultProps) TextInput.defaultProps = {};
TextInput.defaultProps.style = [{ fontFamily: 'Montserrat_400Regular' }];

console.log('🎬 [App.js] File loaded successfully');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


function Root() {
  console.log('🎬 [Root] Component called');
  const { state, dispatch } = useApp();
  const { profileLoaded, profile } = state;
  const [ready, setReady] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    console.log('🚀 [App] Initializing...');
    
    let tealiumReady = false;
    
    initTealium().then(() => {
      console.log('📊 [Tealium] Initialized');
      tealiumReady = true;
      trackAppOpen();
      trackInstallReferrer(); // Android — reads Play Store referrer via Install Referrer API
      // Seed email so Moments API queries work on first open for returning users
      if (profile?.email) setEmailForMoments(profile.email);
    }).catch((e) => {
      console.error('❌ [Tealium] Init failed:', e);
      tealiumReady = true; // Continue even if Tealium fails
    });

    const t = setTimeout(() => {
      console.log('⏰ [App] 5s splash complete, setting ready');
      setReady(true);
    }, 5000);

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) {
      console.log('✅ [App] Ready state achieved');
      
      // Wait a bit longer to ensure Tealium UUID is available
      setTimeout(async () => {
        const tealiumUuid = getCanonicalDeviceId();
        console.log('📱 [App] Tealium UUID before push registration:', tealiumUuid);

        // Only refresh the token if permission was already granted — never trigger
        // the OS dialog here. The user is likely on the onboarding screen and would
        // accidentally dismiss it. Permission is requested explicitly via the opt-in
        // checkbox on the order page or the My Account toggle.
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          registerPushToken(profile?.arc_location_id || null);
        } else {
          console.log('📵 [App] Push permission not granted — skipping silent registration');
        }

        requestLocationSilently();
      }, 3000); // Increased from 2s to 3s to give Tealium more time

      // Re-check location when user returns from Settings
      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          requestLocationSilently();
        }
      });
      return () => sub.remove();
    }
  }, [ready]);

  // Version gate — runs once on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('menu_config')
          .select('description')
          .eq('category', '_config')
          .eq('name', 'minimum_version')
          .single();
        const minimum = data?.description;
        if (!minimum) return;
        const current = Constants.expoConfig?.version || '0.0.0';
        console.log(`[Version] current=${current} minimum=${minimum}`);
        if (isVersionOutdated(current, minimum)) {
          console.warn('[Version] App is outdated — showing update modal');
          setUpdateRequired(true);
        }
      } catch (e) {
        console.warn('[Version] Check failed:', e.message);
      }
    })();
  }, []);

  const locationWatchRef = useRef(null);
  const lastLocationRef = useRef(null);

  const requestLocationSilently = async () => {
    console.log('[Location] requestLocationSilently called, platform:', Platform.OS);
    if (!Geolocation) {
      console.log('[Location] geolocation not available');
      return;
    }
    console.log('[Location] geolocation available');

    // Android requires explicit runtime permission request
    if (Platform.OS === 'android') {
      try {
        const already = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        console.log('[Location] Android already granted:', already);
        if (!already) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Access',
              message: 'We need your location to confirm you are at the venue.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }
          );
          console.log('[Location] Android permission result:', granted);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: { granted: false, denied: true } });
            console.log('[Location] Android permission denied');
            return;
          }
        }
      } catch (e) {
        console.warn('[Location] Android permission error:', e.message);
        return;
      }
    }

    // iOS: explicitly request authorisation before getting position
    if (Platform.OS === 'ios') {
      Geolocation.requestAuthorization();
    }

    console.log('[Location] Calling getCurrentPosition...');
    const onPosition = (position) => {
      const { latitude, longitude } = position.coords;
      const last = lastLocationRef.current;
      if (!last || last.latitude !== latitude || last.longitude !== longitude || !last.granted) {
        const payload = { latitude, longitude, granted: true, denied: false };
        lastLocationRef.current = payload;
        dispatch({ type: 'SET_CUSTOMER_LOCATION', payload });
        console.log(`[Location] ✅ Got position: ${latitude}, ${longitude}`);
      }
    };

    // Try GPS first; on timeout (code 3) fall back to network/cell location
    Geolocation.getCurrentPosition(
      onPosition,
      (error) => {
        console.log('[Location] ❌ GPS error code:', error.code, 'message:', error.message);
        if (error.code === 3) {
          console.log('[Location] GPS timed out — retrying with network location...');
          Geolocation.getCurrentPosition(
            onPosition,
            (err2) => {
              console.log('[Location] ❌ Network location also failed:', err2.message);
              dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: { granted: false, denied: true } });
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        } else {
          dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: { granted: false, denied: true } });
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    // Watch — use network accuracy on Android to avoid GPS timeouts
    if (locationWatchRef.current !== null) {
      Geolocation.clearWatch(locationWatchRef.current);
    }
    locationWatchRef.current = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const last = lastLocationRef.current;
        if (!last || last.latitude !== latitude || last.longitude !== longitude) {
          const payload = { latitude, longitude, granted: true, denied: false };
          lastLocationRef.current = payload;
          dispatch({ type: 'SET_CUSTOMER_LOCATION', payload });
          console.log(`[Location] Watch update: ${latitude}, ${longitude}`);
        }
      },
      (error) => {
        console.log('[Location] Watch error code:', error.code, 'message:', error.message);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000, distanceFilter: 50 }
    );
  };

  const storeUrl = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;

  let mainContent;
  if (!ready || !fontsLoaded) {
    console.log('⏳ [App] Showing splash screen');
    mainContent = <SplashLoadingScreen />;
  } else if (!profile) {
    console.log('👤 [App] No profile, showing onboarding');
    mainContent = (
      <OnboardingScreen
        onComplete={(profileData) => {
          console.log('✅ [Onboarding] Complete, updating profile');
          dispatch({ type: 'UPDATE_PROFILE', payload: profileData });
        }}
      />
    );
  } else {
    console.log('🏠 [App] Showing main navigator');
    mainContent = <AppNavigator />;
  }

  return (
    <>
      {mainContent}
      <Modal
        visible={updateRequired}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={updateStyles.overlay}>
          <View style={updateStyles.card}>
            <Text style={updateStyles.emoji}>🚀</Text>
            <Text style={updateStyles.title}>Update Available</Text>
            <Text style={updateStyles.body}>
              A new version of the app is available. Please update to access the latest features.
            </Text>
            <TouchableOpacity
              style={updateStyles.btn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(storeUrl).catch(() => {})}
            >
              <Text style={updateStyles.btnText}>Update Now →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const updateStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  emoji: { fontSize: 52 },
  title: { fontSize: 22, fontFamily: 'Montserrat_700Bold', color: '#0A1628', textAlign: 'center' },
  body: {
    fontSize: 14, fontFamily: 'Montserrat_400Regular', color: '#64748B',
    textAlign: 'center', lineHeight: 21,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#00B2BE',
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 36,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontFamily: 'Montserrat_700Bold' },
});

function App() {
  console.log('🎬 [App] Component START');
  
  useEffect(() => {
    console.log('🎬 [App] useEffect START');
    if (Platform.OS === 'android') {
      const setNavigationBar = async () => {
        try {
          const NavigationBar = require('expo-navigation-bar');
          await NavigationBar.setBackgroundColorAsync('#f0fafb');
          await NavigationBar.setButtonStyleAsync('dark');
        } catch (e) {
          console.log('Navigation bar styling not available:', e.message);
        }
      };
      setNavigationBar();
    }
    console.log('🎬 [App] useEffect END');
  }, []);
  
  console.log('🎬 [App] About to return JSX');
  
  return (
    <SafeAreaProvider>
      <StatusBar
        translucent={false}
        backgroundColor="#f0fafb"
        barStyle="dark-content"
      />
      <AuthProvider>
        <AppProvider>
          <Root />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
