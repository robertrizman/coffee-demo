import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, Platform, Modal, Animated, Easing, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useApp, generateOrderId, generateSequentialOrderId } from './AppContext';
import { trackRemoveFromOrder, trackEmailEntered, trackOrderPlaced, track } from './tealium';
import { colors, typography, spacing, radius, shadow } from './theme';
import { LocationPinIcon } from './CoffeeIcons';
import { supabase } from './supabase';
import Geolocation from '@react-native-community/geolocation';

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function OrderSummaryScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const { currentOrder } = state;

  const [name, setName] = useState(state.profile?.name || currentOrder.name || '');
  const [email, setEmail] = useState(state.profile?.email || currentOrder.email || '');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [geoWarning, setGeoWarning] = useState(null); // null | 'outside' | 'denied' | 'ok'
  const [locationName, setLocationName] = useState('');
  const [brewingVisible, setBrewingVisible] = useState(false);
  const geoChannelRef = useRef(null);

  useEffect(() => {
    const locationId = state.profile?.arc_location_id;
    const customerLoc = state.customerLocation;

    // iOS: trigger location permission prompt if not yet granted
    if (Platform.OS === 'ios' && (!customerLoc || (!customerLoc.granted && !customerLoc.denied))) {
      Geolocation.getCurrentPosition(
        (position) => {
          dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            granted: true,
            denied: false,
          }});
        },
        () => {
          dispatch({ type: 'SET_CUSTOMER_LOCATION', payload: { granted: false, denied: true } });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    const runGeoCheck = async () => {
      if (!locationId) return;
      try {
        const { data: loc } = await supabase
          .from('arc_locations')
          .select('venue_name, latitude, longitude, geo_check_enabled, geo_radius_meters')
          .eq('id', locationId)
          .single();

        if (!loc || !loc.geo_check_enabled || !loc.latitude || !loc.longitude) {
          setGeoWarning(null);
          return;
        }

        setLocationName(loc.venue_name);

        if (!customerLoc || customerLoc.denied) {
          setGeoWarning('denied');
          return;
        }

        if (!customerLoc.granted) return;

        const dist = getDistanceMeters(
          customerLoc.latitude, customerLoc.longitude,
          loc.latitude, loc.longitude
        );
        const radius = loc.geo_radius_meters || 1000;
        console.log(`[Geo] Distance to ${loc.venue_name}: ${Math.round(dist)}m (limit: ${radius}m)`);
        setGeoWarning(dist > radius ? 'outside' : 'ok');
      } catch (e) {
        console.warn('[Geo] Check failed:', e.message);
      }
    };

    runGeoCheck();

    if (!locationId) return;

    // Remove existing channel before creating new one
    if (geoChannelRef.current) {
      supabase.removeChannel(geoChannelRef.current);
      geoChannelRef.current = null;
    }

    // Real-time — re-check when admin updates arc_locations
    const channel = supabase
      .channel(`geo-loc-${locationId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'arc_locations',
        filter: `id=eq.${locationId}`,
      }, () => {
        console.log('[Geo] Location settings updated by admin');
        runGeoCheck();
      })
      .subscribe();

    geoChannelRef.current = channel;

    return () => {
      if (geoChannelRef.current) {
        supabase.removeChannel(geoChannelRef.current);
        geoChannelRef.current = null;
      }
    };
  }, [state.customerLocation, state.profile?.arc_location_id]);

  // Animation values
  const fillAnim = useRef(new Animated.Value(0)).current;   // coffee fill 0→1
  const steam1 = useRef(new Animated.Value(0)).current;
  const steam2 = useRef(new Animated.Value(0)).current;
  const steam3 = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const startBrewingAnimation = () => {
    // Reset
    fillAnim.setValue(0);
    scaleAnim.setValue(0.8);
    fadeAnim.setValue(0);
    [steam1, steam2, steam3, dot1, dot2, dot3].forEach((a) => a.setValue(0));

    // Card entrance
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Coffee fill
    Animated.timing(fillAnim, {
      toValue: 1, duration: 2800, delay: 300,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();

    // Steam loops
    const steamLoop = (anim, delay) => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
        ),
      ]).start();
    };
    steamLoop(steam1, 800);
    steamLoop(steam2, 1100);
    steamLoop(steam3, 1400);

    // Bouncing dots
    const dotLoop = (anim, delay) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 350, useNativeDriver: true }),
            Animated.delay(400),
          ])
        ),
      ]).start();
    };
    dotLoop(dot1, 600);
    dotLoop(dot2, 800);
    dotLoop(dot3, 1000);
  };

  const handleEmailBlur = () => {
    if (email && email.includes('@') && !emailSubmitted) {
      dispatch({ type: 'SET_EMAIL', payload: email });
      trackEmailEntered(email);
      setEmailSubmitted(true);
    }
  };

  const handleRemove = (index) => {
    const item = currentOrder.items[index];
    dispatch({ type: 'REMOVE_ITEM', payload: index });
    trackRemoveFromOrder(item);
  };

  // Validate then open confirmation sheet
  const handlePlaceOrderPress = () => {
    if (!name) { Alert.alert('Name required', 'Please enter your name.'); return; }
    if (!email || !email.includes('@')) { Alert.alert('Email required', 'Please enter your email address.'); return; }
    if (currentOrder.items.length === 0) { Alert.alert('No items', 'Please add at least one drink.'); return; }

    // Log and track customer location on review
    const loc = state.customerLocation;
    if (loc?.granted) {
      console.log(`[Order] Review pressed — location: lat=${loc.latitude}, lng=${loc.longitude}`);
    } else {
      console.log('[Order] Review pressed — location not available');
    }
    track('order_review', {
      tealium_event: 'order_review',
      customer_name: name,
      customer_email: email,
      customer_latitude: loc?.latitude || '',
      customer_longitude: loc?.longitude || '',
      customer_location_granted: loc?.granted ? 'true' : 'false',
      arc_location_id: state.profile?.arc_location_id || '',
      arc_location_name: state.profile?.arc_location_name || '',
      item_count: currentOrder.items.length,
    });

    setConfirmVisible(true);
  };

  // Confirmed — actually place the order
  const handleConfirm = async () => {
    setConfirmVisible(false);
    dispatch({ type: 'SET_NAME', payload: name });
    dispatch({ type: 'SET_EMAIL', payload: email });

    const orderId = await generateSequentialOrderId();

    // Log customer location
    const loc = state.customerLocation;
    if (loc?.granted) {
      console.log(`[Order] Customer location: lat=${loc.latitude}, lng=${loc.longitude}`);
    } else {
      console.log('[Order] Customer location: not available');
    }
    dispatch({ type: 'PLACE_ORDER', payload: { station: null, orderId } });
    trackOrderPlaced({
      id: orderId,
      name,
      email,
      items: currentOrder.items,
      customerLocation: state.customerLocation || null,
      arc_location_id: state.profile?.arc_location_id || '',
      arc_location_name: state.profile?.arc_location_name || '',
    });

    // Show brewing animation, then navigate
    setBrewingVisible(true);
    startBrewingAnimation();
    setTimeout(() => {
      setBrewingVisible(false);
      navigation.navigate('Orders & Profile');
    }, 4200);
  };

  const formatItemSummary = (item) => {
    const title = [item.size, item.name].filter(Boolean).join(' ');
    const details = [];
    if (item.milk && item.milk !== 'No Milk') details.push(item.milk);
    if (item.extras && item.extras.length) details.push(item.extras.join(', '));
    return { title, detail: details.join(' · ') };
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Your order</Text>
            <Text style={styles.subtitle}>
              {currentOrder.items.length} item{currentOrder.items.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Menu')}>
            <Text style={styles.backText}>‹ Menu</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          <Text style={styles.sectionLabel}>YOUR NAME</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <Text style={styles.sectionLabel}>YOUR EMAIL</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>✉</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              onBlur={handleEmailBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.sectionLabel}>ITEMS</Text>
          {currentOrder.items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No items yet. Go back to the menu to add drinks.</Text>
            </View>
          ) : (
            currentOrder.items.map((item, index) => {
              const { title, detail } = formatItemSummary(item);
              return (
                <View key={index} style={styles.itemCard}>
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>{index + 1}</Text>
                  </View>
                  <View style={styles.itemText}>
                    <Text style={styles.itemName}>{title}</Text>
                    {detail ? <Text style={styles.itemDetail}>{detail}</Text> : null}
                    {item.specialRequest ? (
                      <Text style={styles.itemSpecial}>"{item.specialRequest}"</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => handleRemove(index)} style={styles.deleteBtn}>
                    <Text style={styles.deleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          <TouchableOpacity style={styles.addMoreBtn} onPress={() => navigation.navigate('Menu')}>
            <Text style={styles.addMoreText}>+  Add another drink</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.placeBtn, (currentOrder.items.length === 0 || !name || !email) && styles.placeBtnDisabled]}
            onPress={handlePlaceOrderPress}
            activeOpacity={0.85}
          >
            <Text style={styles.placeBtnText}>☕  Review & Place Order</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Confirmation bottom sheet ── */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            <View style={styles.modalHeader}>
              <View style={styles.dragHandle} />
              <Text style={styles.modalTitle}>Confirm your order</Text>
              <Text style={styles.modalSubtitle}>
                Check everything looks right before we send it to the barista.
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 0 }} showsVerticalScrollIndicator={false}>
              {/* Who is ordering */}
              <View style={styles.confirmSection}>
                <Text style={styles.confirmSectionLabel}>ORDERING FOR</Text>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailIcon}>👤</Text>
                  <Text style={styles.confirmDetailText}>{name}</Text>
                </View>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailIcon}>✉</Text>
                  <Text style={styles.confirmDetailText}>{email}</Text>
                </View>
              </View>

              <View style={styles.confirmDivider} />

              {/* Items */}
              <View style={styles.confirmSection}>
                <Text style={styles.confirmSectionLabel}>
                  {currentOrder.items.length} ITEM{currentOrder.items.length !== 1 ? 'S' : ''}
                </Text>
                {currentOrder.items.map((item, i) => {
                  const { title, detail } = formatItemSummary(item);
                  return (
                    <View key={i} style={styles.confirmItem}>
                      <View style={styles.confirmItemBullet} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.confirmItemName}>{title}</Text>
                        {detail ? <Text style={styles.confirmItemDetail}>{detail}</Text> : null}
                        {item.specialRequest ? (
                          <Text style={styles.confirmItemSpecial}>"{item.specialRequest}"</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.confirmDivider} />

              {/* Note */}
              <View style={styles.confirmNoteWrap}>
                <Text style={styles.confirmNoteText}>
                  Once confirmed, your order is sent straight to the barista and you'll be notified when it's ready for pickup.
                </Text>
              </View>
            </ScrollView>

            {/* Geo Warning */}
            {(geoWarning === 'outside' || geoWarning === 'denied') && (
              <View style={styles.geoWarning}>
                <LocationPinIcon size={20} color="#92400e" />
                <View style={{ flex: 1 }}>
                  {geoWarning === 'outside' && (
                    <>
                      <Text style={styles.geoWarningTitle}>You're a bit far from {locationName}</Text>
                      <Text style={styles.geoWarningText}>
                        Orders can only be placed when you're close to the venue. Please try again when closer to {locationName} to continue.
                      </Text>
                    </>
                  )}
                  {geoWarning === 'denied' && (
                    <>
                      <Text style={styles.geoWarningTitle}>Location access required</Text>
                      <Text style={styles.geoWarningText}>
                        Please enable location services to place an order at {locationName || 'this venue'}.{' '}
                        <Text style={styles.geoWarningLink} onPress={() => Linking.openSettings()}>
                          Open Settings →
                        </Text>
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.editBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (geoWarning === 'outside' || geoWarning === 'denied') && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                activeOpacity={0.85}
                disabled={geoWarning === 'outside' || geoWarning === 'denied'}
              >
                <Text style={styles.confirmBtnText}>Confirm ☕</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ── Brewing Animation Modal ── */}
      <Modal visible={brewingVisible} transparent animationType="fade">
        <View style={styles.brewOverlay}>
          <Animated.View style={[styles.brewCard, { transform: [{ scale: scaleAnim }], opacity: fadeAnim }]}>

            {/* Cup scene */}
            <View style={styles.cupScene}>
              {/* Steam strands */}
              {[steam1, steam2, steam3].map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.steam,
                    { left: 52 + i * 20 },
                    {
                      opacity: anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.7, 0.3, 0] }),
                      transform: [{
                        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }),
                      }, {
                        scaleX: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }),
                      }],
                    },
                  ]}
                />
              ))}

              {/* Cup body */}
              <View style={styles.cupBody}>
                {/* Coffee fill animates upward */}
                <Animated.View style={[
                  styles.coffeeFill,
                  { height: fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 64] }) },
                ]} />
              </View>
              <View style={styles.cupHandle} />
              <View style={styles.cupSaucer} />
            </View>

            {/* Message */}
            <Text style={styles.brewTitle}>Order placed!</Text>
            <Text style={styles.brewSubtitle}>
              Sit back and relax — your barista is on it. We'll notify you when your order is ready for pickup.
            </Text>

            {/* Bouncing dots */}
            <View style={styles.dotsRow}>
              {[dot1, dot2, dot3].map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[styles.dot, {
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
                    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                  }]}
                />
              ))}
            </View>

            {/* Notification pill */}
            <View style={styles.notifyPill}>
              <Text style={styles.notifyPillText}>🔔  You'll be notified when ready</Text>
            </View>

          </Animated.View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  title: { ...typography.heading1 },
  subtitle: { ...typography.subtitle, marginTop: 2 },
  backBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginLeft: spacing.md, marginTop: 6,
  },
  backText: { fontSize: 14, fontWeight: '600', color: colors.textMid },
  divider: { height: 1, backgroundColor: colors.border },

  body: { padding: spacing.lg, gap: spacing.md },
  sectionLabel: { ...typography.label, marginBottom: -4 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  inputIcon: { fontSize: 18, marginRight: spacing.sm, color: colors.textMuted },
  input: { flex: 1, height: 52, fontSize: 16, color: colors.textDark },

  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, ...shadow.card,
  },
  itemBadge: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemBadgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  itemText: { flex: 1 },
  itemName: { ...typography.heading3, fontSize: 15 },
  itemDetail: { ...typography.caption, marginTop: 2 },
  itemSpecial: { ...typography.caption, fontStyle: 'italic', color: colors.textLight, marginTop: 2 },
  deleteBtn: { padding: spacing.sm },
  deleteIcon: { fontSize: 18 },

  addMoreBtn: {
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  addMoreText: { fontSize: 15, fontWeight: '600', color: colors.textMid },

  placeBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center',
  },
  placeBtnDisabled: { opacity: 0.4 },
  placeBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  emptyState: {
    padding: spacing.lg, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  emptyText: { ...typography.caption, textAlign: 'center' },

  // ── Modal ──────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalTitle: { ...typography.heading2 },
  modalSubtitle: { ...typography.caption, marginTop: 4, lineHeight: 20 },

  confirmSection: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  confirmSectionLabel: { ...typography.label, marginBottom: 4 },
  confirmDivider: { height: 1, backgroundColor: colors.borderLight },

  confirmDetailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confirmDetailIcon: { fontSize: 15, width: 24, color: colors.textMuted },
  confirmDetailText: { fontSize: 15, color: colors.textDark, fontWeight: '500' },

  confirmItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  confirmItemBullet: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.primary, marginTop: 6, flexShrink: 0,
  },
  confirmItemName: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  confirmItemDetail: { ...typography.caption, marginTop: 2 },
  confirmItemSpecial: { ...typography.caption, fontStyle: 'italic', color: colors.textLight, marginTop: 2 },

  confirmNoteWrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  confirmNoteText: { fontSize: 13, color: colors.textMid, lineHeight: 20 },

  modalActions: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 40,  // Lift buttons above navigation bar
  },
  editBtn: {
    flex: 1, paddingVertical: 11, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  confirmBtn: {
    flex: 2, paddingVertical: 11, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: colors.textMuted, opacity: 0.6 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  geoWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#fcd34d',
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  geoWarningTitle: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  geoWarningText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
  geoWarningLink: { fontWeight: '700', textDecorationLine: 'underline' },

  // ── Brewing modal ──────────────────────────────────────
  brewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13,43,43,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brewCard: {
    backgroundColor: colors.background,
    borderRadius: 28,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    gap: spacing.md,
  },

  // Cup
  cupScene: { width: 140, height: 160, position: 'relative', marginBottom: spacing.sm },
  steam: {
    position: 'absolute',
    width: 7,
    height: 30,
    borderRadius: 4,
    backgroundColor: colors.primary,
    bottom: 124,
  },
  cupBody: {
    position: 'absolute', bottom: 14, left: 10,
    width: 120, height: 110,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    borderWidth: 2.5, borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  coffeeFill: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#6b3a2a',
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  cupEmoji: { fontSize: 28, zIndex: 2 },
  cupHandle: {
    position: 'absolute', bottom: 44, right: 2,
    width: 26, height: 34,
    borderWidth: 2.5, borderColor: colors.primary,
    borderLeftWidth: 0,
    borderTopRightRadius: 14, borderBottomRightRadius: 14,
  },
  cupSaucer: {
    position: 'absolute', bottom: 0, left: 0,
    width: 140, height: 14,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },

  brewTitle: { fontSize: 24, fontWeight: '800', color: colors.textDark, textAlign: 'center' },
  brewSubtitle: { fontSize: 15, color: colors.textLight, textAlign: 'center', lineHeight: 24 },

  dotsRow: { flexDirection: 'row', gap: 8, marginVertical: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },

  notifyPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    marginTop: spacing.sm,
  },
  notifyPillText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});