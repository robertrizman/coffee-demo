import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  StyleSheet, SafeAreaView, Modal, Alert, TouchableWithoutFeedback,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useApp } from './AppContext';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { trackOrderComplete, trackOrderReady, getVisitorId } from './tealium';
import { printOrderReceipt, buildQrDeepLink } from './printing';
import { colors, typography, spacing, radius, shadow } from './theme';
import { QrScanIcon, SettingsIcon, LogoutIcon, PrinterIcon, UserIcon } from './CoffeeIcons';

const TABS = ['All', 'Pending', 'Complete'];

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

import QRCode from 'qrcode';

// Build self-contained HTML with inline SVG QR — no CDN needed
async function buildQrHtml(url) {
  const svg = await QRCode.toString(url, { type: 'svg', width: 180, margin: 1, color: { dark: '#051838', light: '#ffffff' } });
  return `<!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff}svg{width:180px;height:180px}</style>
    </head><body>${svg}</body></html>`;
}

export default function OperatorOrdersScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const { logout, barista, isOwner } = useAuth();
  const [tab, setTab] = useState('All');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [inlineScannerVisible, setInlineScannerVisible] = useState(false);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scanLabel, setScanLabel] = useState('');
  const [focusPoint, setFocusPoint] = useState(null);
  const [qrVisible, setQrVisible] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState({});
  const cameraRef = useRef(null);
  const lastScan = useRef(null);

  // Keep screen awake when either scanner is active
  const isCameraActive = scannerOpen || inlineScannerVisible;
  useKeepAwake('qr-scanner', { enabled: isCameraActive });

  const filtered = state.orders.filter((o) => {
    if (tab === 'Pending') return o.status === 'pending';
    if (tab === 'Complete') return o.status === 'complete';
    return true; // All tab shows pending, complete and cancelled
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('placed_at', { ascending: false })
        .limit(50);
      if (data) dispatch({ type: 'LOAD_ORDERS', payload: data.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [],
        status: row.status,
        placedAt: row.placed_at,
        fulfilledAt: row.fulfilled_at,
        deviceId: row.device_id,
        tealAppUuid: row.teal_app_uuid || row.device_id,
        station: row.station,
      })) });
    } catch (e) {
      console.warn('[Refresh] Error:', e.message);
    }
    setRefreshing(false);
  };

  const handleToggleQR = async (order) => {
    const isVisible = qrVisible[order.id];
    if (isVisible) {
      setQrVisible((prev) => ({ ...prev, [order.id]: false }));
      return;
    }
    if (!qrDataUrls[order.id]) {
      const url = buildQrDeepLink({ order, visitorId: getVisitorId() });
      const html = await buildQrHtml(url);
      setQrDataUrls((prev) => ({ ...prev, [order.id]: html }));
    }
    setQrVisible((prev) => ({ ...prev, [order.id]: true }));
  };

  const handleCancel = (order) => {
    Alert.alert(
      'Cancel Order',
      `Cancel order ${order.id} for ${order.name}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel Order', style: 'destructive',
          onPress: () => dispatch({ type: 'CANCEL_ORDER', payload: order.id }),
        },
      ]
    );
  };

  const handleComplete = (order) => {
    dispatch({ type: 'COMPLETE_ORDER', payload: order.id });
    const drinkSummary = (order.items || []).map((item) =>
      [item.category, item.milk && item.milk !== 'No Milk' ? item.milk : null, item.name, item.size]
        .filter(Boolean).map((p) => p.replace(/\s+/g, '_')).join('_')
    ).join(',');
    trackOrderReady(
      { ...order, drink_summary: drinkSummary },
      order.tealAppUuid || order.deviceId
    );
    // Call Edge Function to send push notification
    const encodedId = encodeURIComponent(order.id);
    console.log('[Push] Calling edge function with order_id:', order.id, 'encoded:', encodedId);
    fetch(`https://zdgmqmamohrybxwhgwby.supabase.co/functions/v1/order-complete?order_id=${encodedId}&source=barista`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZ21xbWFtb2hyeWJ4d2hnd2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzUyODgsImV4cCI6MjA5MDk1MTI4OH0.imhhaa0OBB69u_igWA52b1Hx0Hhyv4do6YLENifAXRo',
      },
    }).then(r => console.log('[Push] Edge function response:', r.status))
      .catch(e => console.error('[Push] Edge function error:', e.message));
  };

  const handlePrint = (order) => {
    printOrderReceipt(order, getVisitorId(), { silent: true });
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission needed', 'Please allow camera access to scan order QR codes.');
        return;
      }
    }
    setScanning(true);
    setScanFeedback(null);
    setScanLabel('');
    lastScan.current = null;
    setScannerOpen(true);
  };

  const openInlineScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission needed', 'Please allow camera access to scan order QR codes.');
        return;
      }
    }
    setScanning(true);
    setScanFeedback(null);
    setScanLabel('');
    lastScan.current = null;
    setInlineScannerVisible(true);
  };

  const closeScanner = () => {
    setScannerOpen(false);
    setScanning(true);
    setScanFeedback(null);
    setScanLabel('');
    lastScan.current = null;
  };

  const handleBarCodeScanned = ({ data }) => {
    if (!scanning) return;
    if (lastScan.current === data) return;
    lastScan.current = data;
    setScanning(false);
    console.log('[QR] Scanned:', data);

    try {
      const url = new URL(data);
      const params = Object.fromEntries(url.searchParams.entries());
      const orderId = params.order_id;
      const visitorId = params.tealium_visitor_id;
      const email = params.customer_email;
      const deviceId = params.device_id;

      if (!orderId) {
        setScanFeedback('invalid');
        setScanLabel('Not a valid order QR');
        setTimeout(() => { setScanning(true); lastScan.current = null; setScanFeedback(null); }, 2000);
        return;
      }

      const order = state.orders.find((o) => o.id === orderId);

      if (!order) {
        setScanFeedback('not_found');
        setScanLabel(`Order ${orderId} not found`);
        setTimeout(() => { setScanning(true); lastScan.current = null; setScanFeedback(null); }, 2000);
        return;
      }

      if (order.status === 'complete') {
        setScanFeedback('already_done');
        setScanLabel(`${order.name || orderId} — already complete`);
        setTimeout(() => { setScanning(true); lastScan.current = null; setScanFeedback(null); }, 2500);
        return;
      }

      dispatch({ type: 'COMPLETE_ORDER', payload: orderId });
      const drinkSummary = (order.items || []).map((item) =>
        [item.category, item.milk && item.milk !== 'No Milk' ? item.milk : null, item.name, item.size]
          .filter(Boolean).map((p) => p.replace(/\s+/g, '_')).join('_')
      ).join(',');
      trackOrderReady(
        { ...order, drink_summary: drinkSummary },
        order.tealAppUuid || order.deviceId
      );
      setScanFeedback('success');
      setScanLabel(`✓ ${order.name || orderId} — order complete!`);
      setTimeout(() => { setScanning(true); lastScan.current = null; setScanFeedback(null); setScanLabel(''); }, 2500);

    } catch {
      setScanFeedback('invalid');
      setScanLabel('Could not read QR code');
      setTimeout(() => { setScanning(true); lastScan.current = null; setScanFeedback(null); }, 1500);
    }
  };

  const handleCameraTouch = (evt) => {
    const { locationX, locationY, nativeEvent } = evt;
    const x = nativeEvent?.locationX ?? locationX;
    const y = nativeEvent?.locationY ?? locationY;
    setFocusPoint({ x, y });
    // Clear focus indicator after 1.5s
    setTimeout(() => setFocusPoint(null), 1500);
  };

  return (
    <SafeAreaView style={styles.safe}>

      <View style={styles.header}>
        <View>
          <Text style={styles.operatorLabel}>
            {barista?.station ? `OPERATOR · ${barista.station}` : 'OPERATOR'}
          </Text>
          <Text style={styles.title}>Orders</Text>
          {barista?.name && <Text style={styles.baristaName}>{barista.name}</Text>}
        </View>
        <View style={styles.headerIcons}>
          {isOwner && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('BaristaManagement')}>
              <UserIcon size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.iconBtn, inlineScannerVisible && styles.iconBtnActive]} onPress={() => inlineScannerVisible ? setInlineScannerVisible(false) : openInlineScanner()}>
            <QrScanIcon size={20} color={inlineScannerVisible ? '#fff' : colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <SettingsIcon size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.logoutBtn]} onPress={handleLogout}>
            <LogoutIcon size={20} color="#c0392b" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tabWrap}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            {tab === t && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => navigation.navigate('OperatorMenu')} style={styles.tabWrap}>
          <Text style={styles.tabText}>Menu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Inline Scanner */}
      {inlineScannerVisible && cameraPermission?.granted && (
        <View style={styles.inlineScannerCard}>
          <TouchableWithoutFeedback onPress={handleCameraTouch}>
            <View style={styles.inlineCameraWrap}>
              <CameraView
                ref={cameraRef}
                style={styles.inlineCamera}
                facing={cameraFacing}
                active={inlineScannerVisible && !scannerOpen}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
              />
              {/* Scan frame corners */}
              <View style={styles.inlineScanOverlay} pointerEvents="none">
                <View style={[styles.scanCutoutInline, scanFeedback === 'success' && styles.scanCutoutSuccess, scanFeedback && scanFeedback !== 'success' && styles.scanCutoutError]}>
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                </View>
              </View>
              {scanFeedback && (
                <View style={[styles.feedbackBanner, scanFeedback === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>
                  <Text style={styles.feedbackText}>{scanLabel}</Text>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
          {/* Inline scanner footer */}
          <View style={styles.inlineScannerFooter}>
            <Text style={styles.inlineScanHint}>Point at QR code on label</Text>
            <View style={styles.inlineScannerActions}>
              <TouchableOpacity
                style={styles.inlineFlipBtn}
                onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}
              >
                <Text style={styles.inlineFlipBtnText}>⇄ Flip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineFullscreenBtn} onPress={openScanner}>
                <Text style={styles.inlineFullscreenBtnText}>⤢ Fullscreen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <PrinterIcon size={48} color={colors.primaryMid} />
            <Text style={styles.emptyTitle}>No orders</Text>
            <Text style={styles.emptySubtitle}>Customer orders will appear here as they come in</Text>
          </View>
        ) : (
          filtered.map((order) => (
            <View key={order.id} style={[
              styles.orderCard,
              order.status === 'complete' && styles.orderCardDone,
              order.status === 'cancelled' && styles.orderCardCancelled,
            ]}>
              <View style={styles.orderHeader}>
                <View style={styles.orderMeta}>
                  <Text style={styles.orderId}>{order.id}</Text>
                  <Text style={styles.orderEmail}>
                    {order.name ? `${order.name}` : ''}{order.name && order.email ? ' · ' : ''}{order.email}
                  </Text>
                  {order.station && <Text style={styles.orderStation}>📍 {order.station}</Text>}
                </View>
                <View style={[
                  styles.statusBadge,
                  order.status === 'complete' && styles.statusBadgeDone,
                  order.status === 'cancelled' && styles.statusBadgeCancelled,
                ]}>
                  <Text style={[
                    styles.statusText,
                    order.status === 'complete' && styles.statusTextDone,
                    order.status === 'cancelled' && styles.statusTextCancelled,
                  ]}>
                    {order.status === 'pending' ? 'Pending' : order.status === 'cancelled' ? 'Cancelled' : 'Complete'}
                  </Text>
                </View>
              </View>

              <View style={styles.orderItems}>
                {order.items.map((item, i) => (
                  <View key={i} style={styles.orderItem}>
                    <Text style={styles.orderItemDot}>·</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemName}>{item.size} {item.name}</Text>
                      {item.milk && item.milk !== 'No Milk' && <Text style={styles.orderItemDetail}>{item.milk}</Text>}
                      {item.extras?.length > 0 && <Text style={styles.orderItemDetail}>{item.extras.join(', ')}</Text>}
                      {item.specialRequest ? <Text style={styles.orderItemSpecial}>"{item.specialRequest}"</Text> : null}
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.orderFooter}>
                <Text style={styles.orderTime}>{timeAgo(order.placedAt)}</Text>
                <View style={styles.orderActions}>
                  <TouchableOpacity style={styles.printBtn} onPress={() => handlePrint(order)}>
                    <PrinterIcon size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.qrBtn, qrVisible[order.id] && styles.qrBtnActive]}
                    onPress={() => handleToggleQR(order)}
                  >
                    <Text style={[styles.qrBtnText, qrVisible[order.id] && styles.qrBtnTextActive]}>
                      ▦ QR
                    </Text>
                  </TouchableOpacity>
                  {order.status === 'complete' && (
                    <Text style={styles.completedText}>
                      ✓ Done in {(() => {
                        const mins = Math.round(((order.fulfilledAt || Date.now()) - order.placedAt) / 60000);
                        if (mins < 1) return '< 1min';
                        if (mins < 60) return `${mins}min`;
                        return `${(mins / 60).toFixed(1)}hr`;
                      })()}
                    </Text>
                  )}
                </View>
              </View>

              {order.status === 'pending' && (
                <View style={styles.orderButtonRow}>
                  <TouchableOpacity style={styles.cancelOrderBtn} onPress={() => handleCancel(order)}>
                    <Text style={styles.cancelOrderBtnText}>✕ Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(order)}>
                    <Text style={styles.completeBtnText}>✓ Mark complete</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* QR Code display */}
              {qrVisible[order.id] && qrDataUrls[order.id] && (
                <View style={styles.qrContainer}>
                  <Text style={styles.qrLabel}>Scan to complete order</Text>
                  <WebView
                    style={styles.qrWebView}
                    originWhitelist={['*']}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    onError={(e) => console.warn('[QR WebView]', e.nativeEvent.description)}
                    source={{ html: qrDataUrls[order.id] }}
                  />
                  <Text style={styles.qrSubLabel}>{order.name} · {order.id}</Text>
                </View>
              )}
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* QR Scanner Modal — stays open, continuous scanning */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={closeScanner}>
        <SafeAreaView style={styles.scannerSafe}>

          {/* Header */}
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={closeScanner} style={styles.scannerClose}>
              <Text style={styles.scannerCloseText}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan Order Label</Text>
            {/* Camera flip button */}
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={() => setCameraFacing((f) => f === 'back' ? 'front' : 'back')}
            >
              <Text style={styles.flipBtnText}>⇄ Flip</Text>
            </TouchableOpacity>
          </View>

          {/* Camera */}
          <TouchableWithoutFeedback onPress={handleCameraTouch}>
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing={cameraFacing}
                active={scannerOpen}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
              />

              {/* Scan guide overlay */}
              <View style={styles.scanOverlay} pointerEvents="none">
                <View style={[styles.scanCutout, scanFeedback === 'success' && styles.scanCutoutSuccess, scanFeedback && scanFeedback !== 'success' && styles.scanCutoutError]}>
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                </View>
              </View>

              {/* Touch-to-focus indicator */}
              {focusPoint && (
                <View
                  pointerEvents="none"
                  style={[styles.focusIndicator, { top: focusPoint.y - 30, left: focusPoint.x - 30 }]}
                />
              )}

              {/* Inline feedback banner */}
              {scanFeedback && (
                <View style={[styles.feedbackBanner, scanFeedback === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>
                  <Text style={styles.feedbackText}>{scanLabel}</Text>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>

          {/* Footer */}
          <View style={styles.scannerFooter}>
            <Text style={styles.scannerHint}>
              Point at the QR code on the printed label
            </Text>
            <Text style={styles.scannerSubHint}>
              Scanner stays open — scan multiple orders in a row
            </Text>
          </View>

        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  operatorLabel: { ...typography.label, color: colors.teal },
  baristaName: { fontSize: 12, color: colors.textLight, marginTop: 1 },
  title: { ...typography.heading1 },
  headerIcons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  logoutBtn: { backgroundColor: '#fef0ee' },

  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.lg },
  tabWrap: { paddingBottom: spacing.sm },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.textLight },
  tabTextActive: { fontWeight: '700', color: colors.primary },
  tabUnderline: { height: 2, backgroundColor: colors.primary, borderRadius: 2, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border },

  list: { padding: spacing.md, gap: spacing.md },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  emptyTitle: { ...typography.heading3, color: colors.textMuted },
  emptySubtitle: { ...typography.caption, textAlign: 'center', color: colors.textMuted },

  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight,
    overflow: 'hidden', ...shadow.card,
  },
  orderCardDone: { opacity: 0.65 },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.md, paddingBottom: spacing.sm,
  },
  orderMeta: { flex: 1 },
  orderId: { fontSize: 13, fontWeight: '700', color: colors.primary },
  orderEmail: { fontSize: 13, color: colors.textMid, marginTop: 2 },
  orderStation: { fontSize: 11, color: colors.teal, marginTop: 2 },
  statusBadge: {
    backgroundColor: '#fff3e8', borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: '#f0c080',
  },
  statusBadgeDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMid },
  statusText: { fontSize: 11, fontWeight: '700', color: colors.pending },
  statusTextDone: { color: colors.primary },

  orderItems: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  orderItem: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 3 },
  orderItemDot: { color: colors.textMuted, fontSize: 16, lineHeight: 20 },
  orderItemName: { fontSize: 14, fontWeight: '600', color: colors.textDark },
  orderItemDetail: { fontSize: 12, color: colors.textLight },
  orderItemSpecial: { fontSize: 12, color: colors.primary, fontStyle: 'italic' },

  orderFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    backgroundColor: colors.surfaceAlt,
  },
  orderTime: { ...typography.caption },
  orderActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  printBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  qrBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  qrBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  qrBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  qrBtnTextActive: { color: '#fff' },
  qrContainer: {
    alignItems: 'center', paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    backgroundColor: '#fff', gap: spacing.sm,
  },
  qrWebView: { width: 200, height: 200, backgroundColor: '#fff' },
  qrLabel: { fontSize: 13, fontWeight: '700', color: colors.midnight },
  qrSubLabel: { fontSize: 11, color: colors.textMuted },
  completeBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    flex: 1, alignItems: 'center',
  },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  completedText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  cancelOrderBtn: {
    backgroundColor: '#fee2e2', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: '#fca5a5',
    flex: 1, alignItems: 'center',
  },
  cancelOrderBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  orderCardCancelled: { opacity: 0.6, borderColor: '#fca5a5', borderWidth: 1 },
  statusBadgeCancelled: { backgroundColor: '#fee2e2' },
  statusTextCancelled: { color: '#dc2626' },
  orderButtonRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },

  // Scanner
  scannerSafe: { flex: 1, backgroundColor: '#000' },
  iconBtnActive: { backgroundColor: colors.primary },
  inlineScannerCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: '#000',
  },
  inlineCameraWrap: { height: 200, position: 'relative' },
  inlineCamera: { flex: 1 },
  inlineScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  scanCutoutInline: {
    width: 140, height: 140,
    borderColor: 'rgba(255,255,255,0.6)', borderWidth: 0,
    position: 'relative',
  },
  inlineScannerFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.midnight,
  },
  inlineScanHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', flex: 1 },
  inlineScannerActions: { flexDirection: 'row', gap: spacing.sm },
  inlineFlipBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  inlineFlipBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  inlineFullscreenBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, backgroundColor: colors.primary,
  },
  inlineFullscreenBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  scannerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.midnight,
  },
  scannerClose: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  scannerCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  flipBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  flipBtnText: { color: colors.teal, fontSize: 15, fontWeight: '700' },

  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },

  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  scanCutout: {
    width: 240, height: 240,
    borderRadius: 12,
    position: 'relative',
  },
  scanCutoutSuccess: { backgroundColor: 'rgba(0,109,128,0.15)' },
  scanCutoutError: { backgroundColor: 'rgba(192,57,43,0.15)' },
  scanCorner: {
    position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE,
    borderColor: '#fff', borderWidth: CORNER_WIDTH,
  },
  scanCornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  scanCornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  scanCornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  scanCornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },

  focusIndicator: {
    position: 'absolute',
    width: 60, height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: colors.teal,
    backgroundColor: 'transparent',
  },
  feedbackBanner: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    borderRadius: radius.lg, padding: spacing.md, alignItems: 'center',
  },
  feedbackSuccess: { backgroundColor: 'rgba(0,109,128,0.92)' },
  feedbackError: { backgroundColor: 'rgba(30,30,30,0.88)' },
  feedbackText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },

  scannerFooter: {
    backgroundColor: colors.midnight,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center',
  },
  scannerHint: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  scannerSubHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center' },
});
