import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, Alert, Clipboard,
} from 'react-native';
import { useApp } from './AppContext';
import { supabase } from './supabase';
import { trackProfileTab, trackEditProfile } from './tealium';
import { colors, typography, spacing, radius, shadow } from './theme';

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function StatusBadge({ status, fulfilledAt }) {
  const isPending = status === 'pending';
  const isCancelled = status === 'cancelled';
  const isCollected = status === 'complete' && fulfilledAt && (Date.now() - fulfilledAt) > 30 * 60 * 1000;
  const label = isPending ? 'Being prepared'
    : isCancelled ? 'Cancelled'
    : isCollected ? 'Collected'
    : 'Ready for pickup!';
  return (
    <View style={[styles.badge,
      isPending ? styles.badgePending
      : isCancelled ? styles.badgeCancelled
      : styles.badgeDone
    ]}>
      <View style={[styles.badgeDot, isPending ? styles.badgeDotPending : styles.badgeDotDone]} />
      <Text style={[styles.badgeText,
        isPending ? styles.badgeTextPending
        : isCancelled ? styles.badgeTextCancelled
        : styles.badgeTextDone
      ]}>
        {label}
      </Text>
    </View>
  );
}

export default function OrdersProfileScreen() {
  const { state, dispatch } = useApp();
  const { deviceId, profile } = state;

  // Profile edit state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [editEmail, setEditEmail] = useState(profile?.email || '');

  // Extra historical orders from Supabase not yet in local state
  // (e.g. from a previous app session before Supabase loaded)
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');

  // Filter global orders down to only this user's orders
  const myOrders = state.orders.filter((o) => {
    if (deviceId && o.deviceId === deviceId) return true;
    if (profile?.email && o.email === profile.email) return true;
    return false;
  });

  // Merge with any remote-only orders, deduplicated
  const localIds = new Set(myOrders.map((o) => o.id));
  const mergedOrders = [
    ...myOrders,
    ...remoteOrders.filter((o) => !localIds.has(o.id)),
  ].sort((a, b) => (b.placedAt || b.placed_at) - (a.placedAt || a.placed_at));

  const fetchRemoteOrders = useCallback(async () => {
    if (!deviceId && !profile?.email) { setLoading(false); return; }
    let query = supabase.from('orders').select('*').order('placed_at', { ascending: false }).limit(30);
    if (deviceId && profile?.email) {
      query = query.or(`device_id.eq.${deviceId},email.eq.${profile.email}`);
    } else if (deviceId) {
      query = query.eq('device_id', deviceId);
    } else if (profile?.email) {
      query = query.eq('email', profile.email);
    }
    const { data, error } = await query;
    setLoading(false);
    setRefreshing(false);
    if (!error) setRemoteOrders(data || []);
  }, [deviceId, profile?.email]);

  useEffect(() => {
    fetchRemoteOrders();
  }, [fetchRemoteOrders]);

  // Real-time: update status when barista marks order complete
  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel('orders-profile-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        // Update both sources
        dispatch({ type: 'REALTIME_ORDER_UPDATED', payload: { id: payload.new.id, status: payload.new.status, fulfilledAt: payload.new.fulfilled_at } });
        setRemoteOrders((prev) =>
          prev.map((o) => o.id === payload.new.id ? { ...o, ...payload.new } : o)
        );
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [deviceId]);

  const handleSaveProfile = () => {
    if (!editName.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    if (!editEmail.trim() || !editEmail.includes('@')) { Alert.alert('Email required', 'Please enter a valid email.'); return; }
    dispatch({ type: 'UPDATE_PROFILE', payload: { name: editName.trim(), email: editEmail.trim().toLowerCase() } });
    setEditMode(false);
    Alert.alert('✓ Saved', 'Your profile has been updated.');
  };

  const pendingCount = mergedOrders.filter((o) => o.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {activeTab === 'orders' ? 'My orders' : 'My profile'}
          </Text>
          <Text style={styles.subtitle}>
            {activeTab === 'orders'
              ? (loading ? 'Loading...' : pendingCount > 0 ? `${pendingCount} order${pendingCount > 1 ? 's' : ''} in progress` : `${mergedOrders.length} total orders`)
              : profile?.name || ''}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={styles.tabWrap} onPress={() => { setActiveTab('orders'); trackProfileTab('orders'); }}>
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Orders</Text>
          {activeTab === 'orders' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabWrap} onPress={() => { setActiveTab('profile'); trackProfileTab('profile'); }}>
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Profile</Text>
          {activeTab === 'profile' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading your orders...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRemoteOrders(); }} tintColor={colors.primary} />}
          >
            {mergedOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>☕</Text>
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptySubtitle}>Your orders will appear here once you place one</Text>
              </View>
            ) : (
              mergedOrders.map((order) => (
                <View key={order.id} style={[
                  styles.orderCard,
                  order.status === 'complete' && styles.orderCardDone,
                  order.status === 'cancelled' && styles.orderCardCancelled,
                ]}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderId}>{order.id}</Text>
                      <Text style={styles.orderTime}>{timeAgo(order.placedAt || order.placed_at)}</Text>
                    </View>
                    <StatusBadge status={order.status} fulfilledAt={order.fulfilledAt} />
                  </View>
                  <View style={styles.orderItems}>
                    {(order.items || []).map((item, i) => {
                      const mods = [];
                      if (item.milk && item.milk !== 'No Milk') mods.push(item.milk);
                      if (item.extras?.length) mods.push(item.extras.join(', '));
                      if (item.specialRequest) mods.push(`"${item.specialRequest}"`);
                      return (
                        <View key={i} style={styles.orderItem}>
                          <View style={styles.itemBullet} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName}>{[item.size, item.name].filter(Boolean).join(' ')}</Text>
                            {mods.length > 0 && <Text style={styles.itemMods}>{mods.join(' · ')}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {order.status === 'complete' && (
                    <View style={styles.readyBanner}>
                      <Text style={styles.readyText}>
                        {order.fulfilledAt && (Date.now() - order.fulfilledAt) > 30 * 60 * 1000
                          ? '✓ Collected'
                          : '☕ Ready for pickup!'}
                      </Text>
                    </View>
                  )}
                  {order.status === 'cancelled' && (
                    <View style={styles.cancelledBanner}>
                      <Text style={styles.cancelledBannerText}>✕ This order was cancelled</Text>
                    </View>
                  )}
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        )
      )}

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          <View style={styles.profileCard}>
            {!editMode ? (
              <>
                <View style={styles.profileRow}>
                  <Text style={styles.profileIcon}>👤</Text>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>NAME</Text>
                    <Text style={styles.profileValue}>{profile?.name || '—'}</Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileIcon}>✉</Text>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>EMAIL</Text>
                    <Text style={styles.profileValue}>{profile?.email || '—'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    setEditName(profile?.name || '');
                    setEditEmail(profile?.email || '');
                    setEditMode(true);
                    trackEditProfile();
                  }}
                >
                  <Text style={styles.editBtnText}>Edit profile</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Edit profile</Text>
                <Text style={styles.fieldLabel}>NAME</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.inputIcon}>👤</Text>
                  <TextInput
                    style={styles.input}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.inputIcon}>✉</Text>
                  <TextInput
                    style={styles.input}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditMode(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>🔒 Privacy</Text>
            <Text style={styles.infoText}>
              Your name and email are stored securely on this device and used only to link your orders. We don't share your details with anyone.
            </Text>
          </View>

          <View style={styles.uuidCard}>
            <Text style={styles.uuidLabel}>DEVICE UUID</Text>
            <View style={styles.uuidRow}>
              <Text style={styles.uuidValue} numberOfLines={1} ellipsizeMode="middle">{deviceId || '—'}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => {
                  if (deviceId) {
                    Clipboard.setString(deviceId);
                    Alert.alert('Copied', 'UUID copied to clipboard.');
                  }
                }}
              >
                <Text style={styles.copyIcon}>⎘</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.heading1 },
  subtitle: { ...typography.subtitle, marginTop: 2 },

  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.lg, marginTop: spacing.sm },
  tabWrap: { paddingBottom: spacing.sm },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.textLight },
  tabTextActive: { fontWeight: '700', color: colors.primary },
  tabUnderline: { height: 2, backgroundColor: colors.primary, borderRadius: 2, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.caption, color: colors.primary },

  body: { padding: spacing.md, gap: spacing.md },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { ...typography.heading2 },
  emptySubtitle: { ...typography.caption, textAlign: 'center', lineHeight: 22 },

  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight,
    borderLeftWidth: 4, borderLeftColor: colors.pending,
    overflow: 'hidden', ...shadow.card,
  },
  orderCardDone: { borderLeftColor: colors.primary },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.md, paddingBottom: spacing.sm,
  },
  orderId: { fontSize: 18, fontWeight: '800', color: colors.textDark },
  orderTime: { ...typography.caption, marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1,
  },
  badgePending: { backgroundColor: '#fff8f0', borderColor: colors.pending },
  badgeDone: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  badgeCancelled: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeDotPending: { backgroundColor: colors.pending },
  badgeDotDone: { backgroundColor: colors.primary },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextPending: { color: colors.pending },
  badgeTextDone: { color: colors.primary },
  badgeTextCancelled: { color: '#dc2626' },
  orderCardCancelled: { opacity: 0.6, borderColor: '#fca5a5', borderWidth: 1 },
  cancelledBanner: {
    backgroundColor: '#fee2e2', paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#fca5a5',
  },
  cancelledBannerText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },

  orderItems: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    paddingTop: spacing.sm, gap: 8,
  },
  orderItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemBullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6, flexShrink: 0 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  itemMods: { ...typography.caption, marginTop: 2 },
  readyBanner: {
    backgroundColor: colors.primaryLight, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.primaryMid,
  },
  readyText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Profile tab
  profileCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.borderLight,
    overflow: 'hidden', ...shadow.card,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  profileDivider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: spacing.lg },
  profileIcon: { fontSize: 22 },
  profileInfo: { flex: 1 },
  profileLabel: { ...typography.label, marginBottom: 2 },
  profileValue: { fontSize: 16, color: colors.textDark, fontWeight: '600' },
  editBtn: {
    margin: spacing.lg, marginTop: spacing.md,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center',
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },

  cardTitle: { ...typography.heading3, padding: spacing.lg, paddingBottom: 0 },
  fieldLabel: { ...typography.label, marginBottom: 6, marginTop: 12, marginHorizontal: spacing.lg },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
  },
  inputIcon: { fontSize: 16, marginRight: spacing.sm, color: colors.textMuted },
  input: { flex: 1, height: 52, fontSize: 16, color: colors.textDark },
  editActions: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingTop: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  infoCard: {
    backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.primaryMid, gap: spacing.sm,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.primary },
  infoText: { fontSize: 12, color: colors.textMid, lineHeight: 18 },
  uuidCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, gap: 6,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  uuidLabel: { ...typography.label },
  uuidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uuidValue: { flex: 1, fontSize: 12, color: colors.textMuted },
  copyBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  copyIcon: { fontSize: 16, color: colors.primary },
});
