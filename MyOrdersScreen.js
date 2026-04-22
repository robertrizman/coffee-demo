import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './AppContext';
import { supabase } from './supabase';
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

function StatusBadge({ status }) {
  const isPending = status === 'pending';
  return (
    <View style={[styles.badge, isPending ? styles.badgePending : styles.badgeDone]}>
      <View style={[styles.badgeDot, isPending ? styles.badgeDotPending : styles.badgeDotDone]} />
      <Text style={[styles.badgeText, isPending ? styles.badgeTextPending : styles.badgeTextDone]}>
        {isPending ? 'Being prepared' : 'Ready for pickup!'}
      </Text>
    </View>
  );
}

export default function MyOrdersScreen() {
  const { state } = useApp();
  const { deviceId } = state;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!deviceId) return;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('device_id', deviceId)
      .order('placed_at', { ascending: false })
      .limit(30);
    setLoading(false);
    setRefreshing(false);
    if (!error) setOrders(data || []);
  }, [deviceId]);

  // Fetch on mount and when deviceId is ready
  useEffect(() => {
    if (deviceId) fetchOrders();
  }, [deviceId, fetchOrders]);

  // Real-time: update status when barista marks order complete
  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel('my-orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.new.device_id === deviceId) {
          setOrders((prev) =>
            prev.map((o) => o.id === payload.new.id ? { ...o, ...payload.new, placedAt: payload.new.placed_at, fulfilledAt: payload.new.fulfilled_at } : o)
          );
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [deviceId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My orders</Text>
          <Text style={styles.subtitle}>
            {loading ? 'Loading...' : pendingCount > 0 ? `${pendingCount} order${pendingCount > 1 ? 's' : ''} being prepared` : 'Order history'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading your orders...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {orders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>☕</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Your orders will appear here once you place one</Text>
            </View>
          ) : (
            orders.map((order) => (
              <View
                key={order.id}
                style={[styles.orderCard, order.status === 'complete' && styles.orderCardDone]}
              >
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderId}>{order.id}</Text>
                    <Text style={styles.orderTime}>{timeAgo(order.placed_at)}</Text>
                  </View>
                  <StatusBadge status={order.status} />
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
                          <Text style={styles.itemName}>
                            {[item.size, item.name].filter(Boolean).join(' ')}
                          </Text>
                          {mods.length > 0 && (
                            <Text style={styles.itemMods}>{mods.join(' · ')}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {order.status === 'complete' && (
                  <View style={styles.readyBanner}>
                    <Text style={styles.readyText}>☕ Ready for pickup!</Text>
                  </View>
                )}
              </View>
            ))
          )}
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
    paddingBottom: spacing.md,
  },
  title: { ...typography.heading1 },
  subtitle: { ...typography.subtitle, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.caption, color: colors.primary },

  body: { padding: spacing.md, gap: spacing.md },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { ...typography.heading2 },
  emptySubtitle: { ...typography.caption, textAlign: 'center', lineHeight: 22 },

  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.pending,
    overflow: 'hidden',
    ...shadow.card,
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
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeDotPending: { backgroundColor: colors.pending },
  badgeDotDone: { backgroundColor: colors.primary },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextPending: { color: colors.pending },
  badgeTextDone: { color: colors.primary },

  orderItems: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    paddingTop: spacing.sm, gap: 8,
  },
  orderItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemBullet: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.primary, marginTop: 6, flexShrink: 0,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  itemMods: { ...typography.caption, marginTop: 2 },

  readyBanner: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.primaryMid,
  },
  readyText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
