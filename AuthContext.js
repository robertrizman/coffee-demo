/**
 * AuthContext — multi-barista authentication via Supabase
 *
 * - Credentials checked against the `baristas` table
 * - Station auto-assigned on first login (Cart 1, Cart 2, etc.)
 * - Session tracked in `barista_sessions` table
 * - Session lives in memory — logout or restart clears it
 * - Printer assignment is now DEVICE-SPECIFIC via `barista_device_printers` table
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { saveDefaultPrinter, saveBluetoothPrinter, saveAutoCut } from './printerConfig';
import { getDeviceId } from './deviceId';
import { warmupBluetoothConnection } from './brotherPrinter';
import { flushPrintQueue } from './AppContext';

const AuthContext = createContext(null);

const STATION_NAMES = [
  'Cart 1', 'Cart 2', 'Cart 3', 'Cart 4', 'Cart 5',
  'Cart 6', 'Cart 7', 'Cart 8', 'Cart 9', 'Cart 10',
];

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [barista, setBarista] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const baristaRef = useRef(null);

  // Keep ref in sync so the AppState listener always sees current barista state
  useEffect(() => { baristaRef.current = barista; }, [barista]);

  // Flush print queue when app comes to foreground — only if a barista is logged in
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && baristaRef.current) {
        flushPrintQueue().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const login = async (username, password) => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const { data, error } = await supabase
        .from('baristas')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('password', password)
        .eq('active', true)
        .single();

      if (error || !data) {
        setAuthError('Incorrect username or password.');
        setAuthLoading(false);
        return false;
      }

      // Auto-assign station if not already set
      let station = data.station;
      if (!station) {
        station = await assignStation(data.id);
      }

      // Load printer assigned to this barista account (shared across all devices)
      const { data: baristaWithPrinter } = await supabase
        .from('baristas')
        .select(`
          printer_id,
          printers (
            id, name, ip, port, model, printer_type, supports_auto_cut,
            bluetooth_address, connection_type, mac_address
          )
        `)
        .eq('id', data.id)
        .single();

      if (baristaWithPrinter?.printers) {
        const printer = baristaWithPrinter.printers;
        if (printer.connection_type === 'bluetooth' && printer.bluetooth_address) {
          await saveBluetoothPrinter({
            name: printer.name,
            address: printer.bluetooth_address,
            bluetoothAddress: printer.bluetooth_address,
            connectionType: 'bluetooth',
            model: printer.model || null,
            printer_type: printer.printer_type || null,
            supports_auto_cut: printer.supports_auto_cut === true,
          });
          if (printer.supports_auto_cut) await saveAutoCut(true);
          // Backfill mac_address from bluetooth_address if missing
          if (!printer.mac_address) {
            await supabase
              .from('printers')
              .update({ mac_address: printer.bluetooth_address })
              .eq('id', printer.id);
          }
          console.log('[Auth] Loaded barista Bluetooth printer:', printer.name, printer.bluetooth_address);
          // Silently warm up the BT connection in the background so the first print is instant
          warmupBluetoothConnection(printer.bluetooth_address)
            .then((ok) => console.log('[Auth] BT warmup:', ok ? 'connected' : 'not reachable'))
            .catch(() => {});
        } else if (printer.ip) {
          await saveDefaultPrinter({
            id: printer.id,
            ip: printer.ip,
            port: printer.port || 9100,
            name: printer.name,
            model: printer.model || null,
            printer_type: printer.printer_type || null,
            supports_auto_cut: printer.supports_auto_cut === true,
          });
          if (printer.supports_auto_cut) await saveAutoCut(true);
          console.log('[Auth] Loaded barista WiFi printer:', printer.name, printer.ip);
        }
      } else {
        console.log('[Auth] No printer assigned to this barista account');
      }

      // Record login session
      await supabase.from('barista_sessions').insert({
        barista_id: data.id,
        station,
      });

      const baristaData = { ...data, station };
      setBarista(baristaData);
      setIsAdmin(true);
      setAuthLoading(false);

      // Flush any orders that arrived while no barista was logged in
      flushPrintQueue().catch(() => {});

      return true;

    } catch (err) {
      console.warn('[Auth] Login error:', err.message);
      setAuthError('Login failed. Please check your connection.');
      setAuthLoading(false);
      return false;
    }
  };

  const logout = async () => {
    if (barista?.id) {
      await supabase
        .from('barista_sessions')
        .update({ logged_out_at: new Date().toISOString() })
        .eq('barista_id', barista.id)
        .is('logged_out_at', null);

      // Clear station assignment so it can be reused
      await supabase
        .from('baristas')
        .update({ station: null })
        .eq('id', barista.id);
    }
    setIsAdmin(false);
    setBarista(null);
    setAuthError('');
  };

  return (
    <AuthContext.Provider value={{
      isAdmin, barista,
      isOwner: barista?.role === 'owner' || barista?.username === 'admin',
      login, logout,
      authError, authLoading, setAuthError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

async function assignStation(baristaId) {
  try {
    const { data: activeSessions } = await supabase
      .from('barista_sessions')
      .select('station')
      .is('logged_out_at', null);

    const taken = new Set((activeSessions || []).map((s) => s.station));
    const station = STATION_NAMES.find((s) => !taken.has(s)) || `Cart ${Date.now()}`;

    await supabase.from('baristas').update({ station }).eq('id', baristaId);
    return station;
  } catch {
    return 'Cart 1';
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}