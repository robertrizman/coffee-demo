import React, { useState, useEffect, useRef } from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Platform,
  Animated, Easing, Switch, Image, Modal, TextInput,
  ActivityIndicator, FlatList, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import { trackSettingsOpen, trackPrinterTest, getTealiumConfig, reinitTealium } from './tealium';
import { setOpenAIKey } from './foodPairingAI';
import { buildLabelsHtml, buildQrDebugHtml } from './printing';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';
import { saveDefaultPrinter, loadDefaultPrinter, clearDefaultPrinter, saveAutoPrint, loadAutoPrint, saveShorthand, loadShorthand, saveAutoCut, loadAutoCut, saveBluetoothPrinter, loadBluetoothPrinter, clearBluetoothPrinter, saveConnectionType, loadConnectionType } from './printerConfig';
import { scanForPrinters, getDeviceIP, deriveSubnet } from './printerScanner';
import StoreHoursManager from './StoreHoursManager';
import PushBroadcastScreen from './PushBroadcastScreen';
import { colors, typography, spacing, radius, shadow } from './theme';
import Svg, { Path } from 'react-native-svg';

function TealiumTabIcon({ active }) {
  const fill = active ? '#fff' : colors.textMuted;
  return (
    <Svg viewBox="0 0 99 23.8" width={28} height={7} style={{ marginBottom: 3 }}>
      <Path fill={fill} d="m3.82,8.22c-.02-1-.51-1.81-1.09-1.8-.58.01-1.04.83-1.02,1.84.02,1,.51,1.8,1.09,1.79.58-.01,1.04-.83,1.02-1.83Z"/>
      <Path fill={fill} d="m1.72,5.51c-.02-.89-.41-1.61-.89-1.6C.36,3.92-.02,4.65,0,5.55c.02.89.42,1.61.89,1.6.47,0,.85-.74.83-1.63Z"/>
      <Path fill={fill} d="m8.72,5.19c.9.27,1.33,1.51.96,2.79-.37,1.28-1.41,2.1-2.31,1.84-.91-.27-1.33-1.51-.97-2.79.38-1.28,1.42-2.1,2.32-1.84Z"/>
      <Path fill={fill} d="m5.45,2.25c.71.19,1.04,1.28.72,2.42-.31,1.14-1.14,1.91-1.85,1.72-.71-.19-1.03-1.27-.72-2.42.31-1.14,1.15-1.91,1.85-1.71Z"/>
      <Path fill={fill} d="m2.97,0c.5.11.71,1.07.48,2.16-.23,1.09-.82,1.89-1.32,1.78-.49-.1-.71-1.07-.48-2.16C1.89.7,2.48-.09,2.97,0Z"/>
      <Path fill={fill} d="m6.3,11.95c-.02,1.13-.67,2.04-1.46,2.03-.78-.01-1.4-.95-1.38-2.08.02-1.14.67-2.05,1.46-2.03.78.01,1.4.95,1.38,2.08Z"/>
      <Path fill={fill} d="m3.82,15.58c-.02,1-.51,1.81-1.09,1.8-.58-.01-1.04-.83-1.02-1.84.02-1,.51-1.8,1.09-1.79.58.01,1.04.83,1.02,1.83Z"/>
      <Path fill={fill} d="m1.72,18.28c-.02.89-.41,1.61-.89,1.6-.47,0-.85-.74-.83-1.63.02-.89.42-1.61.89-1.6.47,0,.85.74.83,1.63Z"/>
      <Path fill={fill} d="m14.54,11.95c-.03,1.42-1.2,2.55-2.62,2.53-1.42-.03-2.55-1.2-2.53-2.62.03-1.42,1.2-2.55,2.62-2.53,1.42.03,2.55,1.2,2.53,2.62Z"/>
      <Path fill={fill} d="m8.72,18.6c.9-.27,1.33-1.51.96-2.79-.37-1.28-1.41-2.1-2.31-1.84-.91.27-1.33,1.51-.97,2.79.38,1.28,1.42,2.1,2.32,1.84Z"/>
      <Path fill={fill} d="m5.45,21.54c.71-.19,1.04-1.28.72-2.42-.31-1.14-1.14-1.91-1.85-1.72-.71.19-1.03,1.27-.72,2.42.31,1.14,1.15,1.91,1.85,1.71Z"/>
      <Path fill={fill} d="m2.97,23.79c.5-.11.71-1.07.48-2.16-.23-1.09-.82-1.89-1.32-1.78-.49.1-.71,1.07-.48,2.16.23,1.09.82,1.88,1.32,1.78Z"/>
      <Path fill={fill} d="m28.48,9.02h-4.13v7.11h-2.3v-7.11h-4.08v-1.89h10.51v1.89Z"/>
      <Path fill={fill} d="m39.59,16.13h-8.92V7.12h8.92v1.89h-6.62v1.71h5.84v1.79h-5.84v1.78h6.62v1.82Z"/>
      <Path fill={fill} d="m53.34,16.13h-2.45l-.88-1.82h-5.48l-.91,1.82h-2.38l4.61-9.01h2.85l4.64,9.01Zm-4.15-3.49l-1.9-3.62-1.92,3.62h3.82Z"/>
      <Path fill={fill} d="m62.92,16.13h-8.14V7.12h2.3v7.02h5.85v1.99Z"/>
      <Path fill={fill} d="m67.11,16.13h-2.3V7.12h2.3v9.01Z"/>
      <Path fill={fill} d="m80.4,12.36c0,2.98-1.4,3.92-5.53,3.92s-5.4-.8-5.4-3.92v-5.24h2.25v5.09c0,1.91,1.1,2.11,3.16,2.11,1.93,0,3.27-.34,3.27-2.11v-5.09h2.26v5.24Z"/>
      <Path fill={fill} d="m97.12,16.13h-2.45l-1.11-7-2.81,7h-2.61l-2.75-7-1.13,7h-2.37l1.58-9.01h3.41l2.55,6.6,2.71-6.6h3.38l1.61,9.01Z"/>
    </Svg>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { barista, isOwner, updateBaristaFields } = useAuth();

  const [defaultPrinter, setDefaultPrinter] = useState(null);
  const [bluetoothPrinter, setBluetoothPrinter] = useState(null);
  const [bluetoothPrinters, setBluetoothPrinters] = useState([]);
  const [scanningBluetooth, setScanningBluetooth] = useState(false);
  const [pairingAddress, setPairingAddress] = useState(null);
  const [manualMac, setManualMac] = useState('');
  const [connectionType, setConnectionType] = useState('wifi'); // 'wifi' | 'bluetooth'
  const [deviceIP, setDeviceIP] = useState(null);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [shorthandEnabled, setShorthandEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState('hours');
  const [autoCutEnabled, setAutoCutEnabled] = useState(false);

  // Tealium credentials state
  const [tealiumEditMode, setTealiumEditMode] = useState(false);
  const [tealiumSaving, setTealiumSaving] = useState(false);
  const [tAccount, setTAccount] = useState('');
  const [tProfile, setTProfile] = useState('');
  const [tEnv, setTEnv] = useState('');
  const [tIosKey, setTIosKey] = useState('');
  const [tAndroidKey, setTAndroidKey] = useState('');
  const [tOpenAIKey, setTOpenAIKey] = useState('');

  // Location management state
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locVenueName, setLocVenueName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locState, setLocState] = useState('');
  const [locEnabled, setLocEnabled] = useState(true);
  const [locStartDate, setLocStartDate] = useState('');
  const [locEndDate, setLocEndDate] = useState('');
  const [locSortOrder, setLocSortOrder] = useState('0');
  const [locLat, setLocLat] = useState('');
  const [locLng, setLocLng] = useState('');
  const [locGeoEnabled, setLocGeoEnabled] = useState(false);
  const [locGeoRadius, setLocGeoRadius] = useState('1000');
  const [detectingCoords, setDetectingCoords] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(254);
  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [foundPrinters, setFoundPrinters] = useState([]);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanError, setScanError] = useState(null);
  const scanSignal = useRef({ cancelled: false });

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    trackSettingsOpen();
    loadDefaultPrinter().then(setDefaultPrinter);
    loadBluetoothPrinter().then(setBluetoothPrinter);
    loadConnectionType().then(setConnectionType);
    loadAutoPrint().then(setAutoPrintEnabled);
    loadShorthand().then(setShorthandEnabled);
    loadAutoCut().then(setAutoCutEnabled);
    getDeviceIP().then(setDeviceIP);
    loadLocations();
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    const { data } = await supabase.from('arc_locations').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setLocations(data || []);
    setLoadingLocations(false);
  };

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  const openAddLocation = () => {
    setEditingLocation(null);
    setLocVenueName(''); setLocAddress(''); setLocState('');
    setLocEnabled(true); setLocStartDate(''); setLocEndDate('');
    setLocSortOrder(String(locations.length));
    setLocLat(''); setLocLng('');
    setLocGeoEnabled(false); setLocGeoRadius('1000');
    setLocationModalVisible(true);
  };

  const openEditLocation = (loc) => {
    setEditingLocation(loc);
    setLocVenueName(loc.venue_name || '');
    setLocAddress(loc.address || '');
    setLocState(loc.state || '');
    setLocEnabled(loc.enabled !== false);
    setLocStartDate(loc.start_date || '');
    setLocEndDate(loc.end_date || '');
    setLocSortOrder(String(loc.sort_order ?? 0));
    setLocLat(loc.latitude ? String(loc.latitude) : '');
    setLocLng(loc.longitude ? String(loc.longitude) : '');
    setLocGeoEnabled(loc.geo_check_enabled === true);
    setLocGeoRadius(String(loc.geo_radius_meters || 1000));
    setLocationModalVisible(true);
  };

  const detectCoords = async () => {
    setDetectingCoords(true);
    try {
      const { status } = await new Promise((resolve) => {
        if (Platform.OS === 'android') {
          const { PermissionsAndroid } = require('react-native');
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
            .then(result => resolve({ status: result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied' }));
        } else {
          resolve({ status: 'granted' }); // iOS prompts automatically via Geolocation
        }
      });
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access to detect coordinates.');
        setDetectingCoords(false);
        return;
      }
      Geolocation.getCurrentPosition(
        (position) => {
          setLocLat(String(position.coords.latitude.toFixed(6)));
          setLocLng(String(position.coords.longitude.toFixed(6)));
          setDetectingCoords(false);
        },
        (error) => {
          Alert.alert('Error', 'Could not detect location: ' + error.message);
          setDetectingCoords(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      return; // early return since Geolocation is callback-based
    } catch (e) {
      Alert.alert('Error', 'Could not detect location: ' + e.message);
    }
    setDetectingCoords(false);
  };

  const saveLocation = async () => {
    if (!locVenueName.trim()) { Alert.alert('Required', 'Please enter a venue name.'); return; }
    setSavingLocation(true);
    const payload = {
      venue_name: locVenueName.trim(),
      address: locAddress.trim() || null,
      state: locState.trim() || null,
      enabled: locEnabled,
      start_date: locStartDate.trim() || null,
      end_date: locEndDate.trim() || null,
      sort_order: parseInt(locSortOrder) || 0,
      latitude: locLat ? parseFloat(locLat) : null,
      longitude: locLng ? parseFloat(locLng) : null,
      geo_check_enabled: locGeoEnabled,
      geo_radius_meters: parseInt(locGeoRadius) || 1000,
    };
    if (editingLocation) {
      await supabase.from('arc_locations').update(payload).eq('id', editingLocation.id);
    } else {
      await supabase.from('arc_locations').insert(payload);
    }
    setSavingLocation(false);
    setLocationModalVisible(false);
    loadLocations();
  };

  const deleteLocation = (loc) => {
    Alert.alert('Delete location', `Remove ${loc.venue_name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('arc_locations').delete().eq('id', loc.id);
        loadLocations();
      }},
    ]);
  };

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: scanTotal > 0 ? scanProgress / scanTotal : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [scanProgress, scanTotal]);

  const startBluetoothScan = async () => {
    if (Platform.OS === 'android') {
      const { PermissionsAndroid } = require('react-native');
      try {
        // Android 12+ (API 31+) needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT as runtime permissions.
        // Android < 12 only needs ACCESS_FINE_LOCATION — BLUETOOTH/BLUETOOTH_ADMIN are
        // manifest-only permissions on those versions and must NOT be requested at runtime.
        const permissionsToRequest = Platform.Version >= 31
          ? [
              'android.permission.BLUETOOTH_SCAN',
              'android.permission.BLUETOOTH_CONNECT',
            ]
          : [
              'android.permission.ACCESS_FINE_LOCATION',
            ];

        const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        const allGranted = Object.values(granted).every(
          v => v === PermissionsAndroid.RESULTS.GRANTED
        );
        if (!allGranted) {
          Alert.alert(
            'Permission Required',
            'Bluetooth and location permissions are needed to discover nearby printers. Please allow them in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { const { Linking } = require('react-native'); Linking.openSettings(); } },
            ]
          );
          return;
        }
      } catch (e) {
        console.warn('[BT] Permission error:', e.message);
      }
    }

    setScanningBluetooth(true);
    setBluetoothPrinters([]);

    try {
      const { NativeModules } = require('react-native');
      const BrotherPrinter = NativeModules.BrotherPrinter;
      if (!BrotherPrinter) {
        Alert.alert(
          'Not available',
          Platform.OS === 'ios'
            ? 'Bluetooth printing requires an Xcode build with the Brother SDK. Make sure you are running the native app, not Expo Go.'
            : 'Bluetooth printing requires the Android native app build.'
        );
        return;
      }

      if (Platform.OS === 'ios') {
        // iOS: printer must already be paired in Settings > Bluetooth.
        // EAAccessoryManager only returns accessories that are already connected.
        console.log('[BT] iOS: checking connected MFi accessories...');
        const printers = await BrotherPrinter.discoverBluetoothPrinters();
        console.log('[BT] iOS discovery complete. Found:', JSON.stringify(printers));
        setBluetoothPrinters(printers || []);
        if (!printers || printers.length === 0) {
          Alert.alert(
            'No printer found',
            'On iPhone, the printer must be paired in iOS Settings first:\n\n1. Open Settings > Bluetooth\n2. Power on the Brother printer\n3. Tap the printer name to pair\n4. Return here and tap "Find paired printers"'
          );
        }
      } else {
        // Android: actively scans for nearby devices (~12s)
        console.log('[BT] Starting active Bluetooth discovery (~12s)...');
        const printers = await BrotherPrinter.discoverBluetoothPrinters();
        console.log('[BT] Discovery complete. Found:', JSON.stringify(printers));
        setBluetoothPrinters(printers || []);
        if (!printers || printers.length === 0) {
          Alert.alert(
            'No devices found',
            'Make sure:\n• Bluetooth is enabled on this device\n• Brother printer is powered on and in range (~10m)\n• Printer is in discoverable/pairing mode'
          );
        }
      }
    } catch (e) {
      console.warn('[BT] Discovery error:', e.message);
      Alert.alert('Bluetooth Error', e.message);
    } finally {
      setScanningBluetooth(false);
    }
  };

  const handleSetBluetoothPrinter = async (printer) => {
    // Ensure device is bonded before saving — Brother SDK requires a paired connection
    const { NativeModules } = require('react-native');
    const BrotherPrinter = NativeModules.BrotherPrinter;
    if (BrotherPrinter) {
      setPairingAddress(printer.address);
      try {
        const result = await BrotherPrinter.pairBluetoothDevice(printer.address);
        if (!result?.alreadyPaired) {
          console.log('[BT] Paired successfully with', printer.name);
        }
      } catch (e) {
        setPairingAddress(null);
        const pairingHelp = Platform.OS === 'ios'
          ? '\n\nMake sure the printer is powered on and paired in Settings > Bluetooth, then try again.'
          : '\n\nTo pair the QL-820NWB:\n1. Press and hold the Bluetooth button for 3 seconds until the LED flashes blue\n2. Tap the printer in the list again';
        Alert.alert('Pairing Failed', (e.message || 'Could not pair with the printer.') + pairingHelp);
        return;
      }
      setPairingAddress(null);
    }

    // Extract QL model from printer name e.g. "QL-820NWB6138" → "QL-820NWB"
    const modelMatch = (printer.name || '').match(/QL-\d+[A-Z]*/i);
    const model = modelMatch ? modelMatch[0].toUpperCase() : null;
    const isQL = !!model;

    const saved = {
      ...printer,
      bluetoothAddress: printer.address,
      connectionType: 'bluetooth',
      model: model || null,
      printer_type: isQL ? 'brother_ql' : null,
      supports_auto_cut: isQL,
    };
    await saveBluetoothPrinter(saved);

    // Bluetooth takes precedence — clear WiFi printer so only one is active
    await clearDefaultPrinter();
    setDefaultPrinter(null);

    setBluetoothPrinter(saved);
    setConnectionType('bluetooth');
    await saveConnectionType('bluetooth');

    // Save to Supabase printers table
    try {
      const payload = {
        name: printer.name,
        ip: null,
        bluetooth_address: printer.address,
        mac_address: printer.address,
        connection_type: 'bluetooth',
        model: model || null,
        printer_type: isQL ? 'brother_ql' : 'generic',
        supports_auto_cut: isQL,
        last_seen_at: new Date().toISOString(),
      };

      // Step 1: check if a row exists for this bluetooth_address
      const { data: existing, error: lookupError } = await supabase
        .from('printers')
        .select('id')
        .eq('bluetooth_address', printer.address)
        .maybeSingle();

      if (lookupError) {
        console.warn('[Settings] Lookup error:', lookupError.message, lookupError.code);
        throw new Error(`Lookup failed: ${lookupError.message} (${lookupError.code})`);
      }

      let printerId;
      if (existing) {
        const { error: updateError } = await supabase
          .from('printers').update(payload).eq('id', existing.id);
        if (updateError) throw new Error(`Update failed: ${updateError.message}`);
        printerId = existing.id;
        console.log('[Settings] Updated Bluetooth printer in DB:', existing.id);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('printers').insert(payload).select('id').single();
        if (insertError) throw new Error(`Insert failed: ${insertError.message} (${insertError.code})`);
        printerId = inserted.id;
        console.log('[Settings] Inserted Bluetooth printer in DB:', printerId);
      }

      // Link to barista account
      if (barista?.id && printerId) {
        const { error: linkError } = await supabase
          .from('baristas').update({ printer_id: printerId }).eq('id', barista.id);
        if (linkError) console.warn('[Settings] Could not link printer to barista:', linkError.message);
        else console.log('[Settings] Linked Bluetooth printer to barista:', barista.name);
      }
    } catch (err) {
      console.warn('[Settings] Could not save Bluetooth printer to DB:', err.message);
    }

    Alert.alert('Bluetooth printer set', `${printer.name} is now the active printer.`);
  };

  const handleManualMacSave = () => {
    const mac = manualMac.trim().toUpperCase();
    const valid = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac);
    if (!valid) {
      Alert.alert('Invalid address', 'Enter a MAC address in the format XX:XX:XX:XX:XX:XX');
      return;
    }
    handleSetBluetoothPrinter({ name: 'QL-820NWB', address: mac });
    setManualMac('');
  };

  const handleClearBluetoothPrinter = async () => {
    await clearBluetoothPrinter();
    setBluetoothPrinter(null);
    setConnectionType('wifi');
    await saveConnectionType('wifi');
    // Clear auto-cut — no QL printer is active
    setAutoCutEnabled(false);
    await saveAutoCut(false);
    // Unlink printer from barista account in Supabase
    if (barista?.id) {
      try {
        await supabase.from('baristas').update({ printer_id: null, auto_cut: false }).eq('id', barista.id);
        console.log('[Settings] Unlinked printer from barista account');
      } catch (err) {
        console.warn('[Settings] Could not unlink printer from DB:', err.message);
      }
    }
  };

  const startScan = async () => {
    setScanning(true);
    setScanProgress(0);
    setScanComplete(false);
    setScanError(null);
    setFoundPrinters([]);
    progressAnim.setValue(0);
    scanSignal.current = { cancelled: false };

    try {
      await scanForPrinters(
        (scanned, total) => {
          setScanProgress(scanned);
          setScanTotal(total);
        },
        (printer) => {
          setFoundPrinters((prev) => {
            // Keep preferred (Brother QL) at the top
            const updated = [...prev, printer];
            return updated.sort((a, b) => (b.isPreferred ? 1 : 0) - (a.isPreferred ? 1 : 0));
          });
        },
        scanSignal.current,
      );
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
      setScanComplete(true);
    }
  };

  const stopScan = () => {
    scanSignal.current.cancelled = true;
    setScanning(false);
    setScanComplete(true);
  };

  const handleSetDefault = async (printer) => {
    const normalizedPrinter = {
      ...printer,
      printer_type: printer.printer_type || (printer.model?.toLowerCase().includes('ql-') ? 'brother_ql' : printer.model?.toLowerCase().includes('mfc-') ? 'brother_mfc' : 'generic'),
      supports_auto_cut: printer.supports_auto_cut === true || printer.model?.toLowerCase().includes('ql-'),
    };

    await saveDefaultPrinter(normalizedPrinter);
    setDefaultPrinter(normalizedPrinter);

    try {
      const payload = {
        name: normalizedPrinter.name,
        ip: normalizedPrinter.ip,
        port: normalizedPrinter.port || 9100,
        model: normalizedPrinter.model || null,
        mac_address: normalizedPrinter.mac || null,
        printer_type: normalizedPrinter.printer_type || null,
        supports_auto_cut: normalizedPrinter.supports_auto_cut === true,
        last_seen_at: new Date().toISOString(),
      };

      // Upsert on ip — handles both first-add and re-add cleanly
      const { data: upsertedPrinter, error: upsertError } = await supabase
        .from('printers')
        .upsert(payload, { onConflict: 'ip' })
        .select('id')
        .single();

      if (upsertError) throw upsertError;

      // Link to barista account
      if (barista?.id && upsertedPrinter?.id) {
        await supabase.from('baristas')
          .update({ printer_id: upsertedPrinter.id })
          .eq('id', barista.id);
        console.log('[Settings] Saved printer to barista account:', barista.name, upsertedPrinter.id);
      }
    } catch (err) {
      console.warn('[Settings] Could not save printer to DB:', err.message);
    }

    Alert.alert(
      '✓ Default printer set',
      `${normalizedPrinter.name} (${normalizedPrinter.ip}) will be used on this device when reachable.`,
    );
  };

  const handleClearDefault = () => {
    Alert.alert('Remove default printer', 'Print jobs will use the native dialog instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await clearDefaultPrinter();
          setDefaultPrinter(null);
          // Clear auto-cut — no QL printer is active
          setAutoCutEnabled(false);
          await saveAutoCut(false);
          // Unlink printer from barista account in Supabase
          if (barista?.id) {
            try {
              await supabase.from('baristas').update({ printer_id: null, auto_cut: false }).eq('id', barista.id);
              console.log('[Settings] Unlinked printer from barista account');
            } catch (err) {
              console.warn('[Settings] Could not unlink printer from DB:', err.message);
            }
          }
        },
      },
    ]);
  };

  const handleShorthandToggle = async (value) => {
    setShorthandEnabled(value);
    await saveShorthand(value);
  };

  const handleAutoPrintToggle = async (value) => {
    if (value && !defaultPrinter && !bluetoothPrinter) {
      Alert.alert(
        'No printer configured',
        'Please set a WiFi or Bluetooth printer before enabling auto-print.',
      );
      return;
    }
    setAutoPrintEnabled(value);
    await saveAutoPrint(value);
    if (barista?.id) {
      supabase.from('baristas').update({ auto_print: value }).eq('id', barista.id)
        .then(({ error }) => { if (error) console.warn('[Settings] auto_print sync error:', error.message); });
    }
  };

  const handleTestPrint = async () => {
    trackPrinterTest('wifi-scan');
    try {
      const html = await buildLabelsHtml({
        id: '#TEST',
        name: 'Test Print',
        email: 'test@example.com',
        placedAt: Date.now(),
        items: [{ name: 'Flat White', size: 'Medium', milk: 'Oat', extras: [], specialRequest: '' }],
      }, 'test-visitor');
      await Print.printAsync({ html });
    } catch (err) {
      Alert.alert('Test failed', err.message);
    }
  };

  const handleQrDebug = async () => {
    try {
      const html = buildQrDebugHtml();
      await Print.printAsync({ html });
    } catch (err) {
      Alert.alert('QR debug failed', err.message);
    }
  };

  const subnet = deviceIP ? deriveSubnet(deviceIP) : null;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const TABS = [
    { id: 'hours',     icon: '🕐', label: 'Hours & Locations' },
    { id: 'push',      icon: '🔔', label: 'Push' },
    { id: 'users',     icon: '👤', label: 'User Access' },
    { id: 'printer',   icon: '🖨', label: 'Printer' },
    { id: 'shorthand', icon: '☕', label: 'Shorthand' },
    { id: 'tealium',   icon: null,  label: 'Tealium' },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Horizontal tab nav */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabNav}
        contentContainerStyle={styles.tabNavContent}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(t.id)}
          >
            {t.icon
              ? <Text style={styles.tabBtnIcon}>{t.icon}</Text>
              : <TealiumTabIcon active={activeTab === t.id} />
            }
            <Text style={[styles.tabBtnLabel, activeTab === t.id && styles.tabBtnLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Coffee Hours ── */}
        {activeTab === 'hours' && (
          <View style={styles.section}>
            <StoreHoursManager />

            {/* ── Arc Locations ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardIcon}>📍</Text>
                <Text style={styles.cardTitle}>Arc Locations</Text>
              </View>
              <Text style={styles.cardBody}>Manage event locations. Customers select their location during onboarding and push notifications can be filtered by location.</Text>

              {loadingLocations ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
              ) : locations.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>No locations added yet.</Text>
              ) : (
                locations.map(loc => {
                  const active = isLocationActive(loc);
                  return (
                    <View key={loc.id} style={styles.locationRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.locationRowName}>{loc.venue_name}</Text>
                          <View style={[styles.locationBadge, { backgroundColor: active ? '#dcfce7' : '#f1f5f9' }]}>
                            <Text style={[styles.locationBadgeText, { color: active ? '#16a34a' : colors.textMuted }]}>
                              {active ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>
                        {loc.address ? <Text style={styles.locationRowAddress}>{loc.address}, {loc.state}</Text> : null}
                        {loc.start_date ? (
                          <Text style={styles.locationRowDates}>
                            {new Date(loc.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {loc.end_date ? ` – ${new Date(loc.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => openEditLocation(loc)} style={styles.locationEditBtn}>
                          <Text style={styles.locationEditBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteLocation(loc)} style={styles.locationDeleteBtn}>
                          <Text style={styles.locationDeleteBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              <TouchableOpacity style={styles.addLocationBtn} onPress={openAddLocation} activeOpacity={0.8}>
                <Text style={styles.addLocationBtnText}>+ Add Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Push Notifications ── */}
        {activeTab === 'push' && (
          <View style={styles.section}>
            <PushBroadcastScreen />
          </View>
        )}

        {/* ── User Access ── */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            {/* ── Signed in as ── */}
        {barista && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>👤</Text>
              <Text style={styles.cardTitle}>Signed in as</Text>
            </View>
            <View style={styles.userInfoRow}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{barista.name?.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{barista.name}</Text>
                <Text style={styles.userMeta}>@{barista.username} · {barista.station || 'No station'}</Text>
                {isOwner && <Text style={styles.userRole}>Owner</Text>}
              </View>
            </View>
            {isOwner && (
              <TouchableOpacity
                style={styles.manageBaristasBtn}
                onPress={() => navigation.navigate('BaristaManagement')}
              >
                <Text style={styles.manageBaristasText}>👥  Manage baristas</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
          </View>
        )}

        {/* ── Printer Setup ── */}
        {activeTab === 'printer' && (
          <View style={styles.section}>
            {/* ── Current Default Printer ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🖨</Text>
            <Text style={styles.cardTitle}>Print station</Text>
          </View>

          {defaultPrinter ? (
            <View style={styles.defaultPrinterBox}>
              <View style={styles.defaultPrinterLeft}>
                <View style={styles.preferredBadgeRow}>
                  <Text style={styles.defaultPrinterName}>{defaultPrinter.name}</Text>
                  {defaultPrinter.isPreferred && (
                    <View style={styles.qlBadge}>
                      <Text style={styles.qlBadgeText}>QL Label</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.defaultPrinterIp}>{defaultPrinter.ip}:{defaultPrinter.port}</Text>
              </View>
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearDefault}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noPrinterBox}>
              <Text style={styles.noPrinterText}>
                No default set — will use native print dialog (AirPrint / Mopria)
              </Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>📡</Text>
            <Text style={styles.cardTitle}>Scan for printers</Text>
          </View>

          {deviceIP ? (
            <View style={styles.networkInfo}>
              <Text style={styles.networkInfoText}>
                📶 Connected — scanning{' '}
                <Text style={styles.networkInfoHighlight}>{subnet}.1 – {subnet}.254</Text>
                {' '}on ports 631 & 9100
              </Text>
            </View>
          ) : (
            <View style={styles.noWifiBox}>
              <Text style={styles.noWifiText}>
                ⚠️ Not connected to WiFi. Connect first then scan.
              </Text>
            </View>
          )}

          {/* Scan button */}
          {!scanning ? (
            <TouchableOpacity
              style={[styles.scanBtn, !deviceIP && styles.scanBtnDisabled]}
              onPress={startScan}
              disabled={!deviceIP}
              activeOpacity={0.85}
            >
              <Text style={styles.scanBtnText}>
                {scanComplete && foundPrinters.length === 0 ? '🔄 Scan again' : '🔍 Scan network'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopBtn} onPress={stopScan} activeOpacity={0.85}>
              <Text style={styles.stopBtnText}>⏹ Stop scan</Text>
            </TouchableOpacity>
          )}

          {/* Progress bar */}
          {(scanning || (scanComplete && scanProgress > 0)) && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              </View>
              <Text style={styles.progressLabel}>
                {scanning
                  ? `Scanning ${scanProgress} / ${scanTotal}…`
                  : `Scanned ${scanProgress} hosts`}
              </Text>
            </View>
          )}

          {/* Scan error */}
          {scanError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {scanError}</Text>
            </View>
          )}

          {/* Results */}
          {foundPrinters.length > 0 && (
            <View style={styles.resultsWrap}>
              <Text style={styles.resultsLabel}>
                {foundPrinters.length} printer{foundPrinters.length !== 1 ? 's' : ''} found
              </Text>
              {foundPrinters.map((printer, i) => {
                const isDefault = defaultPrinter?.ip === printer.ip;
                return (
                  <View
                    key={printer.ip}
                    style={[
                      styles.printerResult,
                      printer.isPreferred && styles.printerResultPreferred,
                      i < foundPrinters.length - 1 && styles.printerResultBorder,
                    ]}
                  >
                    <View style={styles.printerResultLeft}>
                      <View style={styles.printerResultNameRow}>
                        <Text style={styles.printerResultName}>{printer.name}</Text>
                        {printer.isPreferred && (
                          <View style={styles.qlBadge}>
                            <Text style={styles.qlBadgeText}>QL Label</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.printerResultIp}>{printer.ip}:{printer.port}</Text>
                    </View>
                    {isDefault ? (
                      <View style={styles.defaultTag}>
                        <Text style={styles.defaultTagText}>Default</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.setDefaultBtn}
                        onPress={() => handleSetDefault(printer)}
                      >
                        <Text style={styles.setDefaultBtnText}>Set default</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* No printers found after scan */}
          {scanComplete && foundPrinters.length === 0 && !scanError && !scanning && (
            <View style={styles.noneFoundBox}>
              <Text style={styles.noneFoundText}>
                No printers found on {subnet}.x{'\n'}
                Make sure your printer is on and connected to the same WiFi.
              </Text>
            </View>
          )}
        </View>

            {/* ── Connection Type ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🔌</Text>
            <Text style={styles.cardTitle}>Connection Type</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm }}>
            Select how the barista phone connects to the printer.
          </Text>
          <View style={styles.connectionTypeRow}>
            <TouchableOpacity
              style={[styles.connectionTypeBtn, connectionType === 'wifi' && styles.connectionTypeBtnActive]}
              onPress={async () => {
                setConnectionType('wifi');
                await saveConnectionType('wifi');
                if (defaultPrinter) {
                  const updated = { ...defaultPrinter, connectionType: 'wifi' };
                  await saveDefaultPrinter(updated);
                  setDefaultPrinter(updated);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.connectionTypeBtnText, connectionType === 'wifi' && styles.connectionTypeBtnTextActive]}>
                📡  WiFi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.connectionTypeBtn, connectionType === 'bluetooth' && styles.connectionTypeBtnActive]}
              onPress={async () => {
                setConnectionType('bluetooth');
                await saveConnectionType('bluetooth');
                if (defaultPrinter) {
                  const updated = { ...defaultPrinter, connectionType: 'bluetooth' };
                  await saveDefaultPrinter(updated);
                  setDefaultPrinter(updated);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.connectionTypeBtnText, connectionType === 'bluetooth' && styles.connectionTypeBtnTextActive]}>
                📶  Bluetooth
              </Text>
            </TouchableOpacity>
          </View>
        </View>

            {/* ── Bluetooth Printer ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>📶</Text>
            <Text style={styles.cardTitle}>Bluetooth Printer</Text>
          </View>

          {bluetoothPrinter ? (
            <View style={styles.btPrinterRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.btPrinterName}>{bluetoothPrinter.name}</Text>
                <Text style={styles.btPrinterAddress}>{bluetoothPrinter.address}</Text>
              </View>
              <TouchableOpacity onPress={handleClearBluetoothPrinter} style={styles.btClearBtn}>
                <Text style={styles.btClearBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.noPrinterText}>No Bluetooth printer paired</Text>
          )}

          {Platform.OS === 'ios' && (
            <View style={styles.iosBluetoothNote}>
              <Text style={styles.iosBluetoothNoteText}>
                On iPhone, pair the printer first:{'\n'}
                Settings {'>'} Bluetooth {'>'} tap your Brother printer.{'\n'}
                Then tap Find below to detect it.
              </Text>
              <TouchableOpacity
                onPress={() => { const { Linking } = require('react-native'); Linking.openURL('App-Prefs:Bluetooth'); }}
                style={styles.iosSettingsLink}
              >
                <Text style={styles.iosSettingsLinkText}>Open Bluetooth Settings →</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.scanBtn, scanningBluetooth && styles.scanBtnDisabled]}
            onPress={startBluetoothScan}
            disabled={scanningBluetooth}
            activeOpacity={0.85}
          >
            <Text style={styles.scanBtnText}>
              {scanningBluetooth
                ? (Platform.OS === 'ios' ? '🔍 Searching...' : '🔍 Discovering... (~12s)')
                : (Platform.OS === 'ios' ? '📶 Find paired printers' : '📶 Discover Bluetooth printers')
              }
            </Text>
          </TouchableOpacity>

          {/* Manual MAC entry — fallback for already-paired devices */}
          <View style={styles.manualMacRow}>
            <TextInput
              style={styles.manualMacInput}
              placeholder="Enter MAC address  e.g. AC:4D:16:EE:92:23"
              placeholderTextColor={colors.textMuted}
              value={manualMac}
              onChangeText={setManualMac}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.manualMacBtn, !manualMac.trim() && { opacity: 0.4 }]}
              onPress={handleManualMacSave}
              disabled={!manualMac.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.manualMacBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          {bluetoothPrinters.length > 0 && (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {bluetoothPrinters.map((printer) => {
                const isPairing = pairingAddress === printer.address;
                const isActive = bluetoothPrinter?.address === printer.address;
                return (
                  <TouchableOpacity
                    key={printer.address}
                    style={[styles.printerRow, isActive && styles.printerRowActive, isPairing && { opacity: 0.7 }]}
                    onPress={() => !pairingAddress && handleSetBluetoothPrinter(printer)}
                    activeOpacity={0.8}
                    disabled={!!pairingAddress}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.printerName}>{printer.name}</Text>
                      <Text style={styles.printerIP}>{printer.address}</Text>
                    </View>
                    {isPairing
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : isActive
                      ? <Text style={{ color: colors.primary, fontWeight: '700' }}>✓</Text>
                      : null
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

            {/* ── Auto-Print Service ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>⚡</Text>
            <Text style={styles.cardTitle}>Auto-print service</Text>
          </View>

          <View style={styles.autoPrintRow}>
            <View style={styles.autoPrintLeft}>
              <Text style={styles.autoPrintLabel}>Print on new order</Text>
              <Text style={styles.autoPrintSub}>
                Automatically prints a label as soon as a customer places an order
              </Text>
            </View>
            <Switch
              value={autoPrintEnabled}
              onValueChange={handleAutoPrintToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {autoPrintEnabled && (bluetoothPrinter || defaultPrinter) && (
            <View style={styles.autoPrintActive}>
              <Text style={styles.autoPrintActiveText}>
                ✓ Active — printing to {bluetoothPrinter ? `${bluetoothPrinter.name} (Bluetooth)` : `${defaultPrinter.name} (${defaultPrinter.ip})`}
              </Text>
            </View>
          )}

          {autoPrintEnabled && !defaultPrinter && !bluetoothPrinter && (
            <View style={styles.autoPrintWarning}>
              <Text style={styles.autoPrintWarningText}>
                ⚠️ No printer set — scan for a WiFi or Bluetooth printer above first
              </Text>
            </View>
          )}

          {!autoPrintEnabled && (
            <Text style={styles.cardBody}>
              When disabled, the barista must tap the print button manually on each order.
            </Text>
          )}
        </View>
            {/* Auto-cut for Brother QL — shown for both WiFi and Bluetooth QL printers */}
            {(defaultPrinter?.model?.toLowerCase().includes('ql') || bluetoothPrinter?.model?.toLowerCase().includes('ql')) && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardIcon}>✂️</Text>
                  <Text style={styles.cardTitle}>Auto-cut</Text>
                </View>
                <Text style={styles.cardBody}>Automatically cut the label tape after printing. Requires Brother QL-820NWB or compatible model.</Text>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Cut after print</Text>
                  <Switch
                    value={autoCutEnabled}
                    onValueChange={async (v) => {
                      setAutoCutEnabled(v);
                      await saveAutoCut(v);
                      if (barista?.id) {
                        supabase.from('baristas').update({ auto_cut: v }).eq('id', barista.id)
                          .then(({ error }) => { if (error) console.warn('[Settings] auto_cut sync error:', error.message); });
                      }
                    }}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}
            {/* ── Test Print ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🧪</Text>
            <Text style={styles.cardTitle}>Test print</Text>
          </View>
          <Text style={styles.cardBody}>
            Sends a sample label to your default printer, or opens the native print dialog if no default is set.
          </Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleTestPrint}>
            <Text style={styles.secondaryBtnText}>🖨 Print test label</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleQrDebug}>
            <Text style={styles.secondaryBtnText}>⠿ Print QR debug</Text>
          </TouchableOpacity>
        </View>
          </View>
        )}

        {/* ── Coffee Shorthand ── */}
        {activeTab === 'shorthand' && (
          <View style={styles.section}>
            {/* ── Label Format ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🏷</Text>
            <Text style={styles.cardTitle}>Label format</Text>
          </View>

          <View style={styles.autoPrintRow}>
            <View style={styles.autoPrintLeft}>
              <Text style={styles.autoPrintLabel}>Shorthand notation</Text>
              <Text style={styles.autoPrintSub}>
                Uses Artisti Coffee abbreviations on printed labels — FW, OAT, CAR — instead of full text
              </Text>
            </View>
            <Switch
              value={shorthandEnabled}
              onValueChange={handleShorthandToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.shorthandPreview}>
            <View style={styles.shorthandCol}>
              <Text style={styles.shorthandColLabel}>Full text</Text>
              <Text style={styles.shorthandExample}>Medium Flat White{'\n'}Oat Milk{'\n'}Caramel syrup</Text>
            </View>
            <Text style={styles.shorthandArrow}>→</Text>
            <View style={styles.shorthandCol}>
              <Text style={styles.shorthandColLabel}>Shorthand</Text>
              <Text style={[styles.shorthandExample, styles.shorthandExampleActive]}>M FW{'\n'}OAT{'\n'}CAR</Text>
            </View>
          </View>
        </View>
          </View>
        )}

        {/* ── Tealium ── */}
        {activeTab === 'tealium' && (
          <View style={styles.section}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Image
                  source={{ uri: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSbhZ0mXjyDpaKqKQZJhCFsXaTfjmxmSHiBw&s' }}
                  style={{ width: 28, height: 28, borderRadius: 6 }}
                  resizeMode="contain"
                />
                <Text style={styles.cardTitle}>Tealium Profile</Text>
                {isOwner && !tealiumEditMode && (
                  <TouchableOpacity
                    style={styles.tealiumEditBtn}
                    onPress={() => {
                      const cfg = getTealiumConfig();
                      setTAccount(barista?.account || cfg.account);
                      setTProfile(barista?.profile || cfg.profile);
                      setTEnv(barista?.environment || cfg.env);
                      setTIosKey(barista?.ios_key || cfg.iosKey);
                      setTAndroidKey(barista?.android_key || cfg.androidKey);
                      setTOpenAIKey(barista?.openai_key || '');
                      setTealiumEditMode(true);
                    }}
                  >
                    <Text style={styles.tealiumEditBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!tealiumEditMode ? (
                <View style={styles.tealiumRows}>
                  {(() => {
                    const cfg = getTealiumConfig();
                    const oaiKey = barista?.openai_key;
                    const oaiDisplay = oaiKey ? `${oaiKey.slice(0, 10)}••••••••` : 'Not set';
                    return [
                      ['Account',     barista?.account     || cfg.account],
                      ['Profile',     barista?.profile     || cfg.profile],
                      ['Environment', barista?.environment || cfg.env],
                      ['iOS Key',     barista?.ios_key     || cfg.iosKey],
                      ['Android Key', barista?.android_key || cfg.androidKey],
                      ['OpenAI Key',  oaiDisplay],
                    ].map(([label, value]) => (
                      <View key={label} style={styles.tealiumRow}>
                        <Text style={styles.tealiumLabel}>{label}</Text>
                        <Text style={styles.tealiumValue}>{value}</Text>
                      </View>
                    ));
                  })()}
                </View>
              ) : (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {[
                    ['ACCOUNT',     tAccount,     setTAccount,     false],
                    ['PROFILE',     tProfile,     setTProfile,     false],
                    ['ENVIRONMENT', tEnv,         setTEnv,         false],
                    ['IOS KEY',     tIosKey,      setTIosKey,      false],
                    ['ANDROID KEY', tAndroidKey,  setTAndroidKey,  false],
                  ].map(([label, val, setter]) => (
                    <View key={label}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      <TextInput
                        style={styles.inputField}
                        value={val}
                        onChangeText={setter}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  ))}
                  <View>
                    <Text style={styles.fieldLabel}>OPENAI KEY (AI PAIRING)</Text>
                    <TextInput
                      style={styles.inputField}
                      value={tOpenAIKey}
                      onChangeText={setTOpenAIKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      placeholder="sk-..."
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                    <TouchableOpacity
                      style={styles.tealiumCancelBtn}
                      onPress={() => setTealiumEditMode(false)}
                    >
                      <Text style={styles.tealiumCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tealiumSaveBtn, tealiumSaving && { opacity: 0.5 }]}
                      disabled={tealiumSaving}
                      onPress={async () => {
                        if (!barista?.id) return;
                        setTealiumSaving(true);
                        try {
                          await supabase.from('baristas').update({
                            account:     tAccount     || null,
                            profile:     tProfile     || null,
                            environment: tEnv         || null,
                            ios_key:     tIosKey      || null,
                            android_key: tAndroidKey  || null,
                            openai_key:  tOpenAIKey   || null,
                          }).eq('id', barista.id);
                          // Mirror key to menu_config so customers (anon) can load it
                          await supabase.from('menu_config').upsert(
                            { category: '_config', name: 'openai_key', description: tOpenAIKey || '' },
                            { onConflict: 'category,name' }
                          );
                          await reinitTealium({
                            account:    tAccount,
                            profile:    tProfile,
                            env:        tEnv,
                            iosKey:     tIosKey,
                            androidKey: tAndroidKey,
                          });
                          setOpenAIKey(tOpenAIKey || null);
                          updateBaristaFields({
                            account:     tAccount     || null,
                            profile:     tProfile     || null,
                            environment: tEnv         || null,
                            ios_key:     tIosKey      || null,
                            android_key: tAndroidKey  || null,
                            openai_key:  tOpenAIKey   || null,
                          });
                          setTealiumEditMode(false);
                        } catch (err) {
                          Alert.alert('Error', err.message);
                        }
                        setTealiumSaving(false);
                      }}
                    >
                      <Text style={styles.tealiumSaveBtnText}>{tealiumSaving ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.tealiumHint}>
                    Changes are saved to this account and applied to the PRISM SDK immediately.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Broadcast Modal */}
      <Modal visible={broadcastVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📣 Broadcast</Text>
            <TouchableOpacity onPress={() => setBroadcastVisible(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <PushBroadcastScreen onBack={() => setBroadcastVisible(false)} />
        </SafeAreaView>
      </Modal>

      {/* Location Add/Edit Modal */}
      <Modal visible={locationModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalHeader, { paddingTop: spacing.xl, paddingBottom: spacing.md }]}>
            <Text style={styles.modalTitle}>{editingLocation ? '✏️ Edit Location' : '📍 Add Location'}</Text>
            <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>VENUE NAME *</Text>
            <TextInput
              style={styles.inputField}
              value={locVenueName}
              onChangeText={setLocVenueName}
              placeholder="e.g. Saltbox Café"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>ADDRESS</Text>
            <TextInput
              style={styles.inputField}
              value={locAddress}
              onChangeText={setLocAddress}
              placeholder="e.g. 123 George St, Sydney"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>STATE</Text>
            <TextInput
              style={styles.inputField}
              value={locState}
              onChangeText={setLocState}
              placeholder="e.g. NSW"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Enabled</Text>
                <Text style={styles.toggleSub}>Location visible to customers</Text>
              </View>
              <Switch
                value={locEnabled}
                onValueChange={setLocEnabled}
                trackColor={{ false: '#e0e0e0', true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            <Text style={styles.fieldLabel}>START DATE (optional)</Text>
            <TextInput
              style={styles.inputField}
              value={locStartDate}
              onChangeText={setLocStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.fieldLabel}>END DATE (optional)</Text>
            <TextInput
              style={styles.inputField}
              value={locEndDate}
              onChangeText={setLocEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 16 }}>
              💡 If start/end dates are set, the location auto-enables/disables based on today's date. Leave blank to use the Enabled toggle only.
            </Text>

            {/* ── Geo Check ── */}
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionHeading}>📍 Geo Verification</Text>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Enable geo check</Text>
                <Text style={styles.toggleSub}>Warn customers outside the radius</Text>
              </View>
              <Switch
                value={locGeoEnabled}
                onValueChange={setLocGeoEnabled}
                trackColor={{ false: '#e0e0e0', true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {locGeoEnabled && (
              <>
                <Text style={styles.fieldLabel}>RADIUS (METERS)</Text>
                <TextInput
                  style={styles.inputField}
                  value={locGeoRadius}
                  onChangeText={setLocGeoRadius}
                  placeholder="1000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />

                <Text style={styles.fieldLabel}>LATITUDE</Text>
                <TextInput
                  style={styles.inputField}
                  value={locLat}
                  onChangeText={setLocLat}
                  placeholder="-33.891635"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />

                <Text style={styles.fieldLabel}>LONGITUDE</Text>
                <TextInput
                  style={styles.inputField}
                  value={locLng}
                  onChangeText={setLocLng}
                  placeholder="151.212044"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />

                <TouchableOpacity
                  style={[styles.detectCoordsBtn, detectingCoords && { opacity: 0.6 }]}
                  onPress={detectCoords}
                  disabled={detectingCoords}
                  activeOpacity={0.8}
                >
                  {detectingCoords
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.detectCoordsBtnText}>📡 Use my current location</Text>
                  }
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 15 }}>
                  Tap the button while at the venue to auto-fill coordinates.
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[styles.saveLocationBtn, savingLocation && { opacity: 0.6 }]}
              onPress={saveLocation}
              disabled={savingLocation}
            >
              {savingLocation
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveLocationBtnText}>{editingLocation ? 'Save Changes' : 'Add Location'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabNav: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  tabNavContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  tabBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.lg, backgroundColor: colors.background,
    height: 52,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabBtnIcon: { fontSize: 20, marginBottom: 2 },
  tabBtnLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  tabBtnLabelActive: { color: '#fff' },
  section: { gap: spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, color: colors.textDark, fontWeight: '300' },
  title: { ...typography.heading2 },

  body: { padding: spacing.lg, gap: spacing.lg },
  bodyNoPadding: { gap: spacing.lg },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight,
    gap: spacing.md, ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: { fontSize: 22 },
  cardTitle: { ...typography.heading3 },
  cardBody: { ...typography.caption, lineHeight: 20 },

  // Default printer
  defaultPrinterBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.primaryMid,
  },
  defaultPrinterLeft: { flex: 1 },
  preferredBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  defaultPrinterName: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  defaultPrinterIp: { ...typography.caption, marginTop: 2, fontFamily: 'monospace' },
  clearBtn: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: '#fef0ee', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#f0c0b8',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: '#c0392b' },
  noPrinterBox: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  noPrinterText: { ...typography.caption, lineHeight: 20 },

  qlBadge: {
    backgroundColor: '#fff3e0', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#e07b39',
  },
  qlBadgeText: { fontSize: 10, fontWeight: '700', color: '#e07b39' },

  // Network info
  networkInfo: {
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.primaryMid,
  },
  networkInfoText: { fontSize: 13, color: colors.textMid, lineHeight: 20 },
  networkInfoHighlight: { fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  noWifiBox: {
    backgroundColor: '#fff8f0', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#f0c0b8',
  },
  noWifiText: { fontSize: 13, color: '#c0392b', lineHeight: 20 },

  // Scan buttons
  scanBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 11, alignItems: 'center',
  },
  scanBtnDisabled: { opacity: 0.4 },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btPrinterRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.primaryMid,
    marginBottom: spacing.sm,
  },
  btPrinterName: { fontSize: 14, fontWeight: '700', color: colors.textDark },
  btPrinterAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  btClearBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  btClearBtnText: { fontSize: 13, color: colors.textMid, fontWeight: '600' },
  noPrinterText: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  manualMacRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.sm,
  },
  manualMacInput: {
    flex: 1, height: 42, fontSize: 13, color: colors.textDark,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  manualMacBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  manualMacBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  iosBluetoothNote: {
    backgroundColor: '#f0f7ff', borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: '#c5dff8',
  },
  iosBluetoothNoteText: { fontSize: 13, color: '#1a4e7a', lineHeight: 19 },
  iosSettingsLink: { marginTop: 6 },
  iosSettingsLinkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  connectionTypeRow: { flexDirection: 'row', gap: spacing.sm },
  connectionTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center',
  },
  connectionTypeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  connectionTypeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textMid },
  connectionTypeBtnTextActive: { color: '#fff' },
  stopBtn: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    paddingVertical: 11, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  stopBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },

  // Progress
  progressWrap: { gap: spacing.sm },
  progressTrack: {
    height: 6, backgroundColor: colors.borderLight,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressLabel: { ...typography.caption, color: colors.primary, textAlign: 'center' },

  // Error
  errorBox: {
    backgroundColor: '#fef0ee', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#f0c0b8',
  },
  errorText: { fontSize: 13, color: '#c0392b', lineHeight: 20 },

  // Results
  resultsWrap: {
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.borderLight, overflow: 'hidden',
  },
  resultsLabel: {
    ...typography.label, color: colors.primary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
  },
  printerResult: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  printerResultPreferred: { backgroundColor: '#fffbf0' },
  printerResultBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  printerResultLeft: { flex: 1 },
  printerResultNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  printerResultName: { fontSize: 14, fontWeight: '600', color: colors.textDark },
  printerResultIp: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  setDefaultBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.primary,
  },
  setDefaultBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  defaultTag: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.primaryLight,
    borderWidth: 1, borderColor: colors.primaryMid,
  },
  defaultTagText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  noneFoundBox: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  noneFoundText: { fontSize: 13, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },

  // User info card
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  userAvatar: {
    width: 48, height: 48, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  userName: { fontSize: 16, fontWeight: '700', color: colors.textDark },
  userMeta: { ...typography.caption, marginTop: 2 },
  userRole: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 2 },
  manageBaristasBtn: {
    backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.primaryMid,
  },
  manageBaristasText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Auto-print
  autoPrintRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  autoPrintLeft: { flex: 1 },
  autoPrintLabel: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  autoPrintSub: { ...typography.caption, marginTop: 2, lineHeight: 18 },
  autoPrintActive: {
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.primaryMid,
  },
  autoPrintActiveText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  autoPrintWarning: {
    backgroundColor: '#fff8f0', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#f0c0b8',
  },
  autoPrintWarningText: { fontSize: 13, color: '#c0392b' },

  // Shorthand preview
  shorthandPreview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
    gap: spacing.md,
  },
  shorthandCol: { flex: 1 },
  shorthandColLabel: { ...typography.label, marginBottom: spacing.sm },
  shorthandExample: {
    fontSize: 13, color: colors.textMid, lineHeight: 20,
    fontFamily: 'monospace',
  },
  shorthandExampleActive: {
    fontSize: 15, fontWeight: '700', color: colors.primary,
    letterSpacing: 0.5,
  },
  shorthandArrow: { fontSize: 18, color: colors.textMuted },

  // Test print
  secondaryBtn: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: 15,
    alignItems: 'center', backgroundColor: colors.surfaceAlt,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 14, color: colors.textMid },

  // Tealium
  tealiumRows: { gap: spacing.sm },
  tealiumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tealiumLabel: { ...typography.caption, fontWeight: '600' },
  tealiumValue: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  tealiumEditBtn: {
    marginLeft: 'auto', paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary,
  },
  tealiumEditBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  tealiumHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  tealiumCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.surface,
  },
  tealiumCancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  tealiumSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  tealiumSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  broadcastBtn: {
    backgroundColor: colors.midnight, borderRadius: radius.xl,
    padding: spacing.lg, alignItems: 'center', gap: 4,
  },
  broadcastBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  broadcastBtnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.lightGray, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, color: colors.textDark, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: spacing.sm,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  toggleSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  inputField: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, color: colors.textDark, backgroundColor: colors.surface,
  },
  addLocationBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm,
  },
  addLocationBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveLocationBtn: {
    backgroundColor: colors.midnight, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.md,
  },
  saveLocationBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  sectionHeading: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
  detectCoordsBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center',
  },
  detectCoordsBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  locationRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.sm,
  },
  locationRowInfo: { flex: 1 },
  locationRowName: { fontSize: 14, fontWeight: '700', color: colors.textDark },
  locationRowAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationRowDates: { fontSize: 11, color: colors.teal, marginTop: 2, fontWeight: '600' },
  locationEditBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.md, backgroundColor: colors.primaryLight,
  },
  locationEditBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  locationDeleteBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.md, backgroundColor: '#fee2e2',
  },
  locationDeleteBtnText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  locationActiveBadge: { backgroundColor: '#dcfce7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  locationActiveBadgeText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  locationInactiveBadge: { backgroundColor: '#f1f5f9', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  locationInactiveBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
});