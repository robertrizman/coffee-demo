/**
 * userProfile.js
 *
 * Persists the user's name and email in expo-secure-store.
 * Called on first launch to save onboarding data, and from
 * the Profile screen when the user updates their details.
 */

import * as SecureStore from 'expo-secure-store';

const PROFILE_KEY = 'coffee_demo_user_profile';

export async function saveProfile({ name, email, arc_location_id = null, arc_location_name = null, dietary_requirements = null }) {
  try {
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify({ name, email, arc_location_id, arc_location_name, dietary_requirements }));
  } catch (err) {
    console.warn('[Profile] Save error:', err.message);
  }
}

export async function loadProfile() {
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Profile] Load error:', err.message);
    return null;
  }
}

export async function clearProfile() {
  try {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  } catch (err) {
    console.warn('[Profile] Clear error:', err.message);
  }
}