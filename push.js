import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { getCanonicalDeviceId } from './tealium';
import { getDeviceId } from './deviceId';

const PROJECT_ID = 'e0b60245-0625-41bc-a4b5-248e50f54c91';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Order notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: true,
  });
}

export async function registerPushToken(arcLocationId = null) {
  console.log('🔔 [Push] Starting registration...');
  try {
    // Android 8+ requires a channel before FCM will reliably issue a token
    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('❌ [Push] Permission not granted');
      return false;
    }

    let tokenData;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
        break;
      } catch (fcmErr) {
        if (attempt === 4) throw fcmErr;
        const delay = attempt * 3000;
        console.warn(`⚠️ [Push] FCM attempt ${attempt} failed, retrying in ${delay / 1000}s…`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
    const token = tokenData.data;
    console.log('✅ [Push] Token received:', token);

    const tealiumUuid = getCanonicalDeviceId();
    const fallbackUuid = await getDeviceId();
    const deviceId = tealiumUuid || fallbackUuid;

    if (!deviceId) {
      console.warn('❌ [Push] No device ID available, skipping registration');
      return false;
    }

    const upsertData = {
      device_id: deviceId,
      push_token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    };
    if (arcLocationId) upsertData.arc_location_id = arcLocationId;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(upsertData, { onConflict: 'device_id' });

    if (error) {
      console.error('❌ [Push] Supabase error:', error);
      return false;
    }

    console.log('✅ [Push] Token registered for device_id:', deviceId);
    return true;
  } catch (e) {
    console.error('❌ [Push] Registration failed:', e.message);
    return false;
  }
}
