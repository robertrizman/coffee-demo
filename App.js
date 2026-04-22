import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, Platform, AppState, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
try { Geolocation.setRNConfiguration({ skipPermissionRequests: false, authorizationLevel: 'whenInUse' }); } catch (e) { console.warn('[Geolocation] setRNConfiguration failed:', e.message); }
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AppProvider, useApp } from './AppContext';
import { AuthProvider } from './AuthContext';
import AppNavigator from './AppNavigator';
import OnboardingScreen from './OnboardingScreen';
import SplashLoadingScreen from './SplashLoadingScreen';
import { trackAppOpen, initTealium, getCanonicalDeviceId } from './tealium';
import { supabase } from './supabase';
import { getDeviceId } from './deviceId';
import { LogBox } from 'react-native';
LogBox.ignoreAllLogs(false);

console.log('🎬 [App.js] File loaded successfully');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken(arcLocationId = null) {
  console.log('🔔 [Push] Starting registration...');
  
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('📱 [Push] Existing permission status:', existingStatus);
    
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('📱 [Push] New permission status:', finalStatus);
    }
    
    if (finalStatus !== 'granted') {
      console.warn('❌ [Push] Permission denied');
      return;
    }
    
    console.log('🎫 [Push] Getting Expo push token...');
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'e0b60245-0625-41bc-a4b5-248e50f54c91',
    });
    const token = tokenData.data;
    console.log('✅ [Push] Token received:', token);
    
    // CRITICAL FIX: Use Tealium customer_uuid (from PRISM), not local device ID
    // This must match what's stored in orders.teal_app_uuid / orders.device_id
    const tealiumUuid = getCanonicalDeviceId();
    const fallbackUuid = await getDeviceId();
    const deviceId = tealiumUuid || fallbackUuid;
    
    console.log('📱 [Push] Tealium UUID:', tealiumUuid);
    console.log('📱 [Push] Fallback UUID:', fallbackUuid);
    console.log('📱 [Push] Using device_id for push_tokens:', deviceId);
    
    const upsertData = {
      device_id: deviceId,
      push_token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    };

    // Only include arc_location_id if provided
    if (arcLocationId) upsertData.arc_location_id = arcLocationId;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(upsertData, { onConflict: 'device_id' });
    
    if (error) {
      console.error('❌ [Push] Supabase error:', error);
      throw error;
    }
    
    console.log('✅ [Push] Token registered successfully with device_id:', deviceId);
    
  } catch (e) {
    console.error('❌ [Push] Registration failed:', e.message);
    console.error('❌ [Push] Stack:', e.stack);
  }
}

function Root() {
  console.log('🎬 [Root] Component called');
  const { state, dispatch } = useApp();
  const { profileLoaded, profile } = state;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.log('🚀 [App] Initializing...');
    
    let tealiumReady = false;
    
    initTealium().then(() => {
      console.log('📊 [Tealium] Initialized');
      tealiumReady = true;
      trackAppOpen();
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
      setTimeout(() => {
        const tealiumUuid = getCanonicalDeviceId();
        console.log('📱 [App] Tealium UUID before push registration:', tealiumUuid);
        
        registerPushToken(profile?.arc_location_id || null);
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
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const last = lastLocationRef.current;
        if (!last || last.latitude !== latitude || last.longitude !== longitude || !last.granted) {
          const payload = { latitude, longitude, granted: true, denied: false };
          lastLocationRef.current = payload;
          dispatch({ type: 'SET_CUSTOMER_LOCATION', payload });
          console.log(`[Location] ✅ Got position: ${latitude}, ${longitude}`);
        }
      },
      (error) => {
        console.log('[Location] ❌ getCurrentPosition error code:', error.code, 'message:', error.message);
        dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: { granted: false, denied: true } });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Also watch for ongoing updates — clear previous watcher first
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000, distanceFilter: 50 }
    );
  };

  if (!ready) {
    console.log('⏳ [App] Showing splash screen');
    return <SplashLoadingScreen />;
  }

  if (!profile) {
    console.log('👤 [App] No profile, showing onboarding');
    return (
      <OnboardingScreen
        onComplete={(profileData) => {
          console.log('✅ [Onboarding] Complete, updating profile');
          dispatch({ type: 'UPDATE_PROFILE', payload: profileData });
        }}
      />
    );
  }

  console.log('🏠 [App] Showing main navigator');
  return <AppNavigator />;
}

export default function App() {
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
