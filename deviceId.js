/**
 * deviceId.js
 *
 * Generates a UUID on first launch and persists it in expo-secure-store.
 * The same value is returned on every subsequent launch — this is the
 * device's permanent anonymous identifier, used to link orders to a device
 * without collecting any personal information.
 */

import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'coffee_demo_device_id';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let _cachedDeviceId = null;

export async function getDeviceId() {
  if (_cachedDeviceId) return _cachedDeviceId;

  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = generateUUID().toLowerCase();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    // Always return lowercase — Tealium visitor stitching is case sensitive
    _cachedDeviceId = id.toLowerCase();
    return _cachedDeviceId;
  } catch (err) {
    console.warn('[DeviceId] SecureStore error:', err.message);
    if (!_cachedDeviceId) _cachedDeviceId = generateUUID().toLowerCase();
    return _cachedDeviceId;
  }
}
