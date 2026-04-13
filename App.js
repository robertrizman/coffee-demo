import React, { useEffect, useState } from 'react';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AppProvider, useApp } from './AppContext';
import { AuthProvider } from './AuthContext';
import AppNavigator from './AppNavigator';
import OnboardingScreen from './OnboardingScreen';
import SplashLoadingScreen from './SplashLoadingScreen';
import { trackAppOpen, initTealium } from './tealium';
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
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    console.log('✅ [Push] Token received:', token);
    
    const deviceId = await getDeviceId();
    console.log('📱 [Push] Device ID:', deviceId);
    
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
    
    console.log('✅ [Push] Token registered successfully!');
    
  } catch (e) {
    console.error('❌ [Push] Registration failed:', e.message);
  }
}

function Root() {
  console.log('🎬 [Root] Component called');
  const { state, dispatch } = useApp();
  const { profileLoaded, profile } = state;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.log('🚀 [App] Initializing...');
    initTealium().then(() => {
      console.log('📊 [Tealium] Initialized');
      trackAppOpen();
    }).catch((e) => {
      console.error('❌ [Tealium] Init failed:', e);
    });
    
    const t = setTimeout(() => {
      console.log('⏰ [App] Timeout reached, setting ready');
      setReady(true);
    }, 5000);
    
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (profileLoaded) {
      console.log('👤 [App] Profile loaded, setting ready');
      setReady(true);
    }
  }, [profileLoaded]);

  useEffect(() => {
    if (ready) {
      console.log('✅ [App] Ready state achieved');
      setTimeout(() => {
        console.log('⏰ [App] 2s delay complete, calling registerPushToken');
        registerPushToken(profile?.arc_location_id || null);
      }, 2000);
    }
  }, [ready]);

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
        translucent={true} 
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