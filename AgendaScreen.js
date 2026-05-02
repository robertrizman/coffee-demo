import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from './supabase';
import { colors, typography, spacing, radius, shadow, fonts } from './theme';

function parseTimeSlot(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toLowerCase();
  if (period === 'pm' && h !== 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function getCurrentSlotIndex(items) {
  if (!items || items.length === 0) return -1;
  const now = new Date();

  for (let i = 0; i < items.length; i++) {
    const t = parseTimeSlot(items[i].time_slot);
    if (!t || t > now) continue;

    if (i < items.length - 1) {
      // Current if now is between this item and the next
      const next = parseTimeSlot(items[i + 1].time_slot);
      if (next && now < next) return i;
    } else {
      // Last item — infer duration from the gap before it, fallback 1 hour
      let windowMs = 60 * 60 * 1000;
      if (items.length >= 2) {
        const prev = parseTimeSlot(items[items.length - 2].time_slot);
        if (prev) windowMs = t - prev;
      }
      if (now - t < windowMs) return i;
    }
  }
  return -1;
}

export default function AgendaScreen() {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentSlot, setCurrentSlot] = useState(-1);
  const [selectedItem, setSelectedItem] = useState(null);
  const itemsRef = useRef([]);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [itemsRes, configRes] = await Promise.all([
      supabase.from('agenda_items').select('*').order('sort_order', { ascending: true }),
      supabase.from('agenda_config').select('*').eq('id', 1).single(),
    ]);
    const fetched = itemsRes.data || [];
    setItems(fetched);
    setCurrentSlot(getCurrentSlotIndex(fetched));
    if (!configRes.error) setConfig(configRes.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    const id = setInterval(() => {
      setCurrentSlot(getCurrentSlotIndex(itemsRef.current));
    }, 60000);
    return () => clearInterval(id);
  }, [fetchData]));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const eventTitle = config?.event_title || 'Agenda';
  const wifiSSID = config?.wifi_ssid?.trim();
  const wifiPassword = config?.wifi_password?.trim();
  const hasWifi = !!wifiSSID;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Dark header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.eventTitle}>{eventTitle}</Text>
          </View>
          {hasWifi && (
            <View style={styles.wifiCard}>
              <Text style={styles.wifiLabel}>WIFI</Text>
              <Text style={styles.wifiRow}>
                SSID: <Text style={styles.wifiValue}>{wifiSSID}</Text>
              </Text>
              <Text style={styles.wifiRow}>
                PASS: <Text style={styles.wifiValue}>{wifiPassword}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Schedule card */}
        <View style={styles.body}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No agenda items yet.</Text>
          ) : (
            items.map((item, index) => {
              const isCurrent = index === currentSlot;
              const hasDesc = !!item.description;
              const Row = hasDesc ? TouchableOpacity : View;
              return (
                <React.Fragment key={item.id}>
                  <Row
                    style={[styles.row, isCurrent && styles.rowCurrent]}
                    {...(hasDesc ? { onPress: () => setSelectedItem(item), activeOpacity: 0.7 } : {})}
                  >
                    {isCurrent && <View style={styles.currentBar} />}
                    <Text style={[styles.time, isCurrent && styles.timeCurrent]}>
                      {item.time_slot}
                    </Text>
                    <View style={styles.titleWrap}>
                      <Text
                        style={[
                          styles.title,
                          item.is_highlight && styles.titleBold,
                          isCurrent && styles.titleCurrent,
                        ]}
                      >
                        {item.title}
                      </Text>
                      {hasDesc && (
                        <Text style={styles.moreHint}>tap for details</Text>
                      )}
                    </View>
                  </Row>
                  {index < items.length - 1 && (
                    <View style={styles.rowDivider} />
                  )}
                </React.Fragment>
              );
            })
          )}
        </View>
      </ScrollView>
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <TouchableOpacity style={styles.descModal} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.descModalTime}>{selectedItem?.time_slot}</Text>
            <Text style={styles.descModalTitle}>{selectedItem?.title}</Text>
            <View style={styles.descDivider} />
            <Text style={styles.descModalBody}>{selectedItem?.description}</Text>
            <TouchableOpacity style={styles.descCloseBtn} onPress={() => setSelectedItem(null)}>
              <Text style={styles.descCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flexGrow: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl + radius.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flex: 1, marginRight: spacing.md },
  eventTitle: {
    fontSize: 27,
    fontFamily: fonts.extrabold,
    color: '#ffffff',
    letterSpacing: -0.5,
    lineHeight: 34,
  },

  wifiCard: {
    backgroundColor: colors.midnight,
    borderRadius: radius.md,
    padding: 12,
    minWidth: 155,
    borderWidth: 1,
    borderColor: 'rgba(104,216,213,0.3)',
  },
  wifiLabel: {
    fontSize: 12,
    fontFamily: fonts.extrabold,
    color: colors.teal,
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  wifiRow: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 3,
    lineHeight: 16,
  },
  wifiValue: { color: '#ffffff', fontFamily: fonts.bold },

  body: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -(radius.xl),
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: 48,
    minHeight: 500,
  },

  row: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    marginBottom: 8,
    alignItems: 'flex-start',
    position: 'relative',
  },
  rowCurrent: { backgroundColor: colors.primaryLight },
  currentBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  time: {
    width: 68,
    minWidth: 68,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textMid,
    lineHeight: 20,
    flexShrink: 0,
  },
  timeCurrent: { color: colors.primary, fontFamily: fonts.semibold },
  titleWrap: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textDark,
    lineHeight: 20,
    flexShrink: 1,
  },
  titleBold: { fontFamily: fonts.bold, color: colors.midnight, fontSize: 14 },
  titleCurrent: { color: colors.primary },
  moreHint: {
    fontSize: 10,
    color: colors.primary,
    marginTop: 2,
    opacity: 0.7,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 10,
  },
  empty: { ...typography.caption, textAlign: 'center', paddingVertical: 40 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,24,56,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  descModal: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    ...shadow.modal,
  },
  descModalTime: {
    fontSize: 11,
    color: colors.primary,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  descModalTitle: {
    fontSize: 17,
    fontFamily: fonts.extrabold,
    color: colors.midnight,
    lineHeight: 24,
  },
  descDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 14,
  },
  descModalBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textMid,
    lineHeight: 22,
  },
  descCloseBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  descCloseBtnText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
