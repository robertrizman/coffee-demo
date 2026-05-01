import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Platform } from 'react-native';
import { MENU, EXTRAS, SIZES, MILK_OPTIONS } from './menu';
import { supabase } from './supabase';
import { getDeviceId } from './deviceId';
import { loadProfile, saveProfile } from './userProfile';
import { printOrderReceipt } from './printing';
import { AppState } from 'react-native';
import { loadDefaultPrinter, loadAutoPrint, loadBluetoothPrinter } from './printerConfig';
import { warmupBluetoothConnection } from './brotherPrinter';
import { setDeviceIdForMoments, onPrismDeviceIdReady, getCanonicalDeviceId } from './tealium';
import { loadPairingRules } from './recommendations';
import { setOpenAIKey } from './foodPairingAI';

const AppContext = createContext(null);

// Serialises auto-print jobs so two simultaneous orders never hit the printer concurrently.
let _printQueue = Promise.resolve();
function enqueuePrint(fn) {
  _printQueue = _printQueue.then(fn).catch(() => {});
}

// Build initial menuEnabled from static menu.js (used as fallback before DB loads)
function buildDefaultMenuEnabled() {
  const result = {};
  MENU.forEach((item) => { result[item.id] = item.defaultEnabled; });
  EXTRAS.forEach((extra) => {
    result['extra-' + extra.toLowerCase().replace(/\s/g, '-')] = true;
  });
  MILK_OPTIONS.forEach((milk) => {
    result['milk-' + milk.toLowerCase().replace(/\s/g, '-')] = true;
  });
  SIZES.forEach((size) => {
    result['size-' + size.toLowerCase()] = true;
  });
  return result;
}

// Build initial customItems — empty per category
function buildDefaultCustomItems() {
  return {
    Espresso: [], 'Milk-Based': [], 'Iced & Cold': [], Specialty: [], Extras: [], Tea: [],
    'Morning Tea': [], 'Lunch': [], 'Snacks': [],
  };
}

const initialState = {
  currentOrder: { name: '', email: '', items: [] },
  orders: [],
  menuEnabled: buildDefaultMenuEnabled(),
  customItems: buildDefaultCustomItems(),
  customerLocation: null, // { latitude, longitude, granted, denied }
  menuConfigLoaded: false,
  deviceId: null,
  profile: null,
  profileLoaded: false,
  storeOpen: true,
  offersEnabled: true,
  agendaEnabled: false,
  closedTitle: 'Back Soon!',
  closedMessage: "We're taking a short break — check back soon! ☕",
  storeBreaks: [],
};

export function generateOrderId() {
  // Fallback only — sequential IDs are generated in OrderSummaryScreen
  return '#' + (10 + Math.floor(Math.random() * 90));
}

export async function generateSequentialOrderId() {
  try {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .order('placed_at', { ascending: false })
      .limit(20);

    // Find highest numeric order ID
    let max = 9;
    for (const row of data || []) {
      const num = parseInt((row.id || '').replace('#', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return '#' + (max + 1);
  } catch {
    return '#' + (10 + Math.floor(Math.random() * 90));
  }
}

function generateItemId(name) {
  return 'custom-' + name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
}

function reducer(state, action) {
  switch (action.type) {

    case 'SET_NAME':
      return { ...state, currentOrder: { ...state.currentOrder, name: action.payload } };

    case 'SET_EMAIL':
      return { ...state, currentOrder: { ...state.currentOrder, email: action.payload } };

    case 'ADD_ITEM':
      return {
        ...state,
        currentOrder: { ...state.currentOrder, items: [...state.currentOrder.items, action.payload] },
      };

    case 'REMOVE_ITEM':
      return {
        ...state,
        currentOrder: {
          ...state.currentOrder,
          items: state.currentOrder.items.filter((_, i) => i !== action.payload),
        },
      };

    case 'SET_DEVICE_ID':
      return { ...state, deviceId: action.payload };

    case 'SET_CUSTOMER_LOCATION':
      return { ...state, customerLocation: action.payload };

    case 'SET_STORE_CONFIG':
      return {
        ...state,
        storeOpen: action.payload.is_open ?? state.storeOpen,
        closedTitle: action.payload.closed_title ?? state.closedTitle,
        closedMessage: action.payload.closed_message ?? state.closedMessage,
        offersEnabled: action.payload.offers_enabled ?? state.offersEnabled,
        agendaEnabled: action.payload.agenda_enabled ?? state.agendaEnabled,
      };

    case 'SET_STORE_BREAKS':
      return { ...state, storeBreaks: action.payload };

    case 'SET_PROFILE':
      // Called on load — sets profile and pre-fills currentOrder name/email
      return {
        ...state,
        profile: action.payload,
        profileLoaded: true,
        currentOrder: action.payload
          ? { ...state.currentOrder, name: action.payload.name, email: action.payload.email }
          : state.currentOrder,
      };

    case 'UPDATE_PROFILE': {
      const { name, email, arc_location_id = null, arc_location_name = null, dietary_requirements = null } = action.payload;
      saveProfile({ name, email, arc_location_id, arc_location_name, dietary_requirements });
      return {
        ...state,
        profile: { name, email, arc_location_id, arc_location_name, dietary_requirements },
        currentOrder: { ...state.currentOrder, name, email },
      };
    }

    case 'PLACE_ORDER': {
      // Insert is handled by OrderSummaryScreen before this dispatch (with retry on duplicate key).
      // The reducer only updates local state.
      const deviceId = getCanonicalDeviceId() || state.deviceId;
      const newOrder = {
        id: action.payload?.orderId || generateOrderId(),
        name: state.currentOrder.name,
        email: state.currentOrder.email,
        items: state.currentOrder.items,
        status: 'pending',
        placedAt: action.payload?.placedAt || Date.now(),
        deviceId: deviceId,
        station: action.payload?.station || null,
      };
      return {
        ...state,
        orders: [newOrder, ...state.orders],
        currentOrder: { name: '', email: '', items: [] },
      };
    }

    case 'COMPLETE_ORDER': {
      const fulfilledAt = Date.now();
      supabase.from('orders')
        .update({ status: 'complete', fulfilled_at: fulfilledAt })
        .eq('id', action.payload)
        .then(({ error }) => {
          if (error) console.warn('[Supabase] Update order error:', error.message);
        });
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, status: 'complete', fulfilledAt } : o
        ),
      };
    }

    case 'CANCEL_ORDER': {
      supabase.from('orders')
        .update({ status: 'cancelled' })
        .eq('id', action.payload)
        .then(({ error }) => {
          if (error) console.warn('[Supabase] Cancel order error:', error.message);
        });
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, status: 'cancelled' } : o
        ),
      };
    }

    case 'TOGGLE_MENU_ITEM': {
      const { id, enabled, name, category, isCustom } = action.payload;
      const dbOp = isCustom
        // Custom items: only update enabled — never touch is_custom or other fields
        ? supabase.from('menu_config').update({ enabled }).eq('id', id)
        // Standard items: upsert (row may not exist yet for default-enabled items)
        : supabase.from('menu_config').upsert(
            { id, enabled, name: name || id, category: category || 'Uncategorised', is_custom: false },
            { onConflict: 'id' }
          );
      dbOp.then(({ error }) => {
        if (error) console.warn('[Supabase] Toggle error:', error.message);
      });
      return {
        ...state,
        menuEnabled: { ...state.menuEnabled, [id]: enabled },
      };
    }

    case 'ADD_CUSTOM_ITEM': {
      const { category, name, description } = action.payload;
      const id = generateItemId(name);
      const isExtras = category === 'Extras';
      const newItem = { id, name, description: description || '', category };

      // Persist to Supabase
      supabase.from('menu_config').insert({
        id,
        name,
        category,
        description: description || '',
        enabled: true,
        is_custom: true,
      }).then(({ error }) => {
        if (error) console.warn('[Supabase] Add custom item error:', error.message);
      });

      return {
        ...state,
        menuEnabled: { ...state.menuEnabled, [id]: true },
        customItems: {
          ...state.customItems,
          [category]: [...(state.customItems[category] || []), newItem],
        },
      };
    }

    case 'DELETE_CUSTOM_ITEM': {
      const { id, category } = action.payload;
      // Delete from Supabase
      supabase.from('menu_config').delete().eq('id', id)
        .then(({ error }) => {
          if (error) console.warn('[Supabase] Delete item error:', error.message);
        });
      const newEnabled = { ...state.menuEnabled };
      delete newEnabled[id];
      return {
        ...state,
        menuEnabled: newEnabled,
        customItems: {
          ...state.customItems,
          [category]: (state.customItems[category] || []).filter((i) => i.id !== id),
        },
      };
    }

    // Loaded from Supabase on startup
    case 'LOAD_MENU_CONFIG': {
      const { rows } = action.payload;
      const menuEnabled = { ...buildDefaultMenuEnabled() };
      const customItems = buildDefaultCustomItems();
      const CUSTOM_CATS = ['Morning Tea', 'Lunch', 'Snacks', 'Extras'];

      rows.forEach((row) => {
        menuEnabled[row.id] = row.enabled;
        if (row.is_custom) {
          const cat = row.category || 'Specialty';
          if (!customItems[cat]) customItems[cat] = [];
          customItems[cat].push({ id: row.id, name: row.name, description: row.description || '', category: cat });
        }
      });

      return { ...state, menuEnabled, customItems, menuConfigLoaded: true };
    }

    case 'LOAD_ORDERS':
      return { ...state, orders: action.payload };

    case 'REALTIME_ORDER_ADDED':
      if (state.orders.find((o) => o.id === action.payload.id)) return state;
      return { ...state, orders: [action.payload, ...state.orders] };

    case 'REALTIME_ORDER_UPDATED':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload.id ? { ...o, ...action.payload } : o
        ),
      };

    default:
      return state;
  }
}

function rowToOrder(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    items: row.items,
    status: row.status,
    placedAt: row.placed_at,
    fulfilledAt: row.fulfilled_at,
    deviceId: row.device_id,
    tealAppUuid: row.teal_app_uuid || row.device_id,
    station: row.station,
    printed: row.printed ?? false,
  };
}

export async function flushPrintQueue() {
  try {
    const [autoPrintEnabled, defaultPrinter, bluetoothPrinter] = await Promise.all([
      loadAutoPrint(),
      loadDefaultPrinter(),
      loadBluetoothPrinter(),
    ]);
    const hasPrinter = defaultPrinter?.ip || bluetoothPrinter?.bluetoothAddress;
    if (!autoPrintEnabled || !hasPrinter) return;

    if (bluetoothPrinter?.bluetoothAddress) {
      try {
        await warmupBluetoothConnection(bluetoothPrinter.bluetoothAddress);
        await new Promise((r) => setTimeout(r, 1200));
      } catch {}
    }

    console.log('[PrintQueue] Checking for unprinted orders...');
    const { data: unprintedOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('printed', false)
      .eq('status', 'pending')
      .order('placed_at', { ascending: true })
      .limit(20);

    if (error) { console.warn('[PrintQueue] Query error:', error.message); return; }
    if (!unprintedOrders?.length) { console.log('[PrintQueue] No unprinted orders'); return; }

    console.log(`[PrintQueue] 📋 Found ${unprintedOrders.length} unprinted orders`);
    for (const row of unprintedOrders) {
      const order = rowToOrder(row);
      console.log(`[PrintQueue] Printing ${order.id}...`);
      const result = await printOrderReceipt(order, '', { silent: true });
      if (result?.ok) {
        console.log(`[PrintQueue] ✓ ${order.id} printed`);
        await supabase.from('orders')
          .update({ printed: true, printed_at: new Date().toISOString() })
          .eq('id', order.id);
      } else {
        console.log(`[PrintQueue] ✗ ${order.id} failed, will retry on next wake`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('[PrintQueue] ✅ Done');
  } catch (err) {
    console.warn('[PrintQueue] Error:', err.message);
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    // Load device ID and user profile on startup
    getDeviceId().then((id) => {
      const lowerUuid = id.toLowerCase();
      dispatch({ type: 'SET_DEVICE_ID', payload: lowerUuid });
      setDeviceIdForMoments(lowerUuid);
      console.log('[AppContext] deviceId:', lowerUuid);
    });

    loadProfile().then((profile) => {
      dispatch({ type: 'SET_PROFILE', payload: profile });
    });

    supabase.from('menu_config').select('*')
      .then(({ data, error }) => {
        if (error) { console.warn('[Supabase] Load menu config error:', error.message); return; }
        dispatch({ type: 'LOAD_MENU_CONFIG', payload: { rows: data || [] } });
      });

    // Load OpenAI key from public menu_config row (readable by anon, mirrored from barista settings)
    supabase.from('menu_config').select('description')
      .eq('category', '_config').eq('name', 'openai_key').single()
      .then(({ data }) => {
        if (data?.description) setOpenAIKey(data.description);
      });

    // Load orders
    supabase.from('orders').select('*').order('placed_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.warn('[Supabase] Fetch orders error:', error.message); return; }
        dispatch({ type: 'LOAD_ORDERS', payload: (data || []).map(rowToOrder) });
      });

    // Realtime orders
    const channel = supabase.channel('orders-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (p) => {
        const order = rowToOrder(p.new);
        dispatch({ type: 'REALTIME_ORDER_ADDED', payload: order });

        // Auto-print if enabled and a printer is configured (WiFi or Bluetooth).
        // enqueuePrint serialises jobs so simultaneous orders never hit the printer concurrently.
        try {
          const [autoPrintEnabled, defaultPrinter, bluetoothPrinter] = await Promise.all([
            loadAutoPrint(),
            loadDefaultPrinter(),
            loadBluetoothPrinter(),
          ]);
          const hasPrinter = defaultPrinter?.ip || bluetoothPrinter?.bluetoothAddress;
          if (autoPrintEnabled && hasPrinter) {
            enqueuePrint(async () => {
              console.log('[AutoPrint] Printing order', order.id, bluetoothPrinter?.bluetoothAddress ? 'via Bluetooth' : 'to ' + defaultPrinter?.ip);
              // Skip warmup here — checkPrinterConnectivity already warms the link on screen focus,
              // and doing another open/close cycle right before printing causes RFCOMM socket
              // exhaustion on Samsung/Android 9 devices (S9+), making the real print fail silently.
              // The flushPrintQueue path (sleep→wake) handles its own warmup separately.
              const result = await printOrderReceipt(order, '', { silent: true });

              // Mark as printed if successful
              if (result && result.ok) {
                console.log('[AutoPrint] ✓ Print successful, marking as printed');
                await supabase
                  .from('orders')
                  .update({ printed: true, printed_at: new Date().toISOString() })
                  .eq('id', order.id);
              } else {
                console.log('[AutoPrint] ✗ Print failed, leaving printed=false');
              }
            });
          }
        } catch (err) {
          console.warn('[AutoPrint] Error:', err.message);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
        dispatch({ type: 'REALTIME_ORDER_UPDATED', payload: rowToOrder(p.new) });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_config' }, (p) => {
        console.log('[Realtime] store_config updated:', p.new);
        dispatch({ type: 'SET_STORE_CONFIG', payload: p.new });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_breaks' }, () => {
        supabase.from('store_breaks').select('*').order('start_time')
          .then(({ data }) => { if (data) dispatch({ type: 'SET_STORE_BREAKS', payload: data }); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_config' }, () => {
        supabase.from('menu_config').select('*')
          .then(({ data }) => { if (data) dispatch({ type: 'LOAD_MENU_CONFIG', payload: { rows: data } }); });
      })
      .subscribe((status) => {
        console.log('[Supabase] Channel status:', status);
      });

    // Load store config + breaks + pairing rules
    supabase.from('store_config').select('*').eq('id', 'default').single()
      .then(({ data }) => { if (data) dispatch({ type: 'SET_STORE_CONFIG', payload: data }); });
    loadPairingRules();
    supabase.from('store_breaks').select('*').order('start_time')
      .then(({ data, error }) => {
        console.log('[StoreBreaks] Loaded:', data?.length, 'error:', error?.message);
        if (data) dispatch({ type: 'SET_STORE_BREAKS', payload: data });
      });

    // Periodic flush every 60s — catches any orders that failed to print on arrival
    const flushInterval = setInterval(() => {
      flushPrintQueue().catch(() => {});
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(flushInterval);
    };
  }, []);

  // Refetch orders when app comes to foreground after sleep
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        // Refetch orders and store config
        supabase.from('orders').select('*').order('placed_at', { ascending: false }).limit(50)
          .then(({ data }) => {
            if (data) dispatch({ type: 'LOAD_ORDERS', payload: data.map(rowToOrder) });
          });
        supabase.from('store_config').select('*').eq('id', 'default').single()
          .then(({ data }) => { if (data) dispatch({ type: 'SET_STORE_CONFIG', payload: data }); });
        supabase.from('store_breaks').select('*').order('start_time')
          .then(({ data }) => { if (data) dispatch({ type: 'SET_STORE_BREAKS', payload: data }); });
        supabase.from('menu_config').select('*')
          .then(({ data }) => { if (data) dispatch({ type: 'LOAD_MENU_CONFIG', payload: { rows: data } }); });
        // Reprint any labels missed while the app was asleep
        flushPrintQueue().catch(() => {});
      }
    });
    return () => appStateSub.remove();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}