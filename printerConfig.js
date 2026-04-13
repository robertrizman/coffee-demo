/**
 * printerConfig.js
 *
 * Persists the default printer and auto-print toggle to SecureStore.
 */

import * as SecureStore from 'expo-secure-store';

const PRINTER_KEY = 'coffee_demo_default_printer';
const AUTO_PRINT_KEY = 'coffee_demo_auto_print';

export async function saveDefaultPrinter(printer) {
  try {
    await SecureStore.setItemAsync(PRINTER_KEY, JSON.stringify(printer));
  } catch (err) {
    console.warn('[Printer] Save error:', err.message);
  }
}

export async function loadDefaultPrinter() {
  try {
    const raw = await SecureStore.getItemAsync(PRINTER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Printer] Load error:', err.message);
    return null;
  }
}

export async function clearDefaultPrinter() {
  try {
    await SecureStore.deleteItemAsync(PRINTER_KEY);
  } catch (err) {
    console.warn('[Printer] Clear error:', err.message);
  }
}

// Auto-print toggle — defaults to false until explicitly enabled
export async function saveAutoPrint(enabled) {
  try {
    await SecureStore.setItemAsync(AUTO_PRINT_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Printer] Save auto-print error:', err.message);
  }
}

export async function loadAutoPrint() {
  try {
    const val = await SecureStore.getItemAsync(AUTO_PRINT_KEY);
    return val === 'true';
  } catch (err) {
    return false;
  }
}

const SHORTHAND_KEY = 'coffee_demo_shorthand_labels';

// Shorthand label toggle — defaults to false (full text)
export async function saveShorthand(enabled) {
  try {
    await SecureStore.setItemAsync(SHORTHAND_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Printer] Save shorthand error:', err.message);
  }
}

export async function loadShorthand() {
  try {
    const val = await SecureStore.getItemAsync(SHORTHAND_KEY);
    return val === 'true';
  } catch (err) {
    return false;
  }
}

const AUTO_CUT_KEY = 'auto_cut_enabled';

export async function saveAutoCut(enabled) {
  try {
    await SecureStore.setItemAsync(AUTO_CUT_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[printerConfig] saveAutoCut error:', err);
  }
}

export async function loadAutoCut() {
  try {
    const val = await SecureStore.getItemAsync(AUTO_CUT_KEY);
    return val === 'true';
  } catch (err) {
    return false;
  }
}
