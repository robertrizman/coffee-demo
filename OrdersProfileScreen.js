import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, Alert, Modal, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './AppContext';
import { getOrderInsight } from './foodPairingAI';
import { supabase } from './supabase';
import { trackProfileTab, trackEditProfile, trackProfileUpdated, trackUuidCopy, trackDietaryRequirementsUpdated, joinTrace, leaveTrace, getCanonicalDeviceId } from './tealium';
import { colors, typography, spacing, radius, shadow } from './theme';
import { UserIcon, EmailIcon, LocationPinIcon, TakeawayCupIcon, CheckIcon, CopyIcon, EditIcon, AiSparkIcon, LightbulbIcon, MagnifyIcon, LightningBoltIcon } from './CoffeeIcons';

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

  // Location state
  const [locations, setLocations] = useState([]);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(profile?.arc_location_id || null);
  const [selectedLocationName, setSelectedLocationName] = useState(profile?.arc_location_name || null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Extra historical orders from Supabase not yet in local state
  // (e.g. from a previous app session before Supabase loaded)
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');
  const [traceId, setTraceId] = useState('');
  const [traceActive, setTraceActive] = useState(false);
  const [traceStatus, setTraceStatus] = useState('');
  const [momentsData, setMomentsData] = useState(null);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const [momentsUrl, setMomentsUrl] = useState('');
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [momentsUnlocked, setMomentsUnlocked] = useState(false);
  const [tealiumUuid, setTealiumUuid] = useState(null);
  const [editDietary, setEditDietary] = useState(profile?.dietary_requirements || '');
  const [orderInsight, setOrderInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Listen for Tealium UUID to be ready
  useEffect(() => {
    const checkTealiumUuid = () => {
      const uuid = getCanonicalDeviceId();
      if (uuid && uuid !== tealiumUuid) {
        console.log('[Profile] Tealium UUID updated:', uuid);
        setTealiumUuid(uuid);
      }
    };
    
    // Check immediately
    checkTealiumUuid();
    
    // Check again after 2 seconds (Tealium should be ready)
    const timer = setTimeout(checkTealiumUuid, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // Filter global orders down to only this user's orders
  const myOrders = state.orders.filter((o) => {
    if (deviceId && (o.deviceId === deviceId || o.tealAppUuid === deviceId)) return true;
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
    loadLocations();
  }, [fetchRemoteOrders]);

  const insightFetched = useRef(false);
  useEffect(() => {
    if (!mergedOrders.length || insightFetched.current) return;
    insightFetched.current = true;
    setInsightLoading(true);
    getOrderInsight({ orders: mergedOrders })
      .then(result => { setOrderInsight(result); setInsightLoading(false); })
      .catch(() => setInsightLoading(false));
  }, [mergedOrders.length]);

  useEffect(() => {
    if (activeTab !== 'profile' || momentsData) return;
    const deviceIdForMoments = getCanonicalDeviceId() || state.deviceId;
    if (!deviceIdForMoments) return;
    const url = `https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39?attributeId=5120&attributeValue=${encodeURIComponent(deviceIdForMoments.toLowerCase())}`;
    fetch(url, { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(data => {
        setMomentsData(data);
        const momentsDietary = data?.properties?.['Dietary Requirements'];
        if (momentsDietary && !profile?.dietary_requirements) {
          dispatch({
            type: 'UPDATE_PROFILE',
            payload: { ...profile, dietary_requirements: momentsDietary },
          });
        }
      })
      .catch(() => {});
  }, [activeTab]);

  const loadLocations = async () => {
    const { data } = await supabase.from('arc_locations').select('*').order('venue_name');
    setLocations(data || []);
  };

  useEffect(() => {
    const channel = supabase
      .channel('arc-locations-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_locations' }, () => {
        loadLocations();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  const currentLocationActive = locations.length > 0 && selectedLocationId
    ? isLocationActive(locations.find(l => l.id === selectedLocationId) || {})
    : true;

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
    const dietary = editDietary.trim() || null;
    const updatedProfile = {
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      arc_location_id: selectedLocationId,
      arc_location_name: selectedLocationName,
      dietary_requirements: dietary,
    };
    dispatch({ type: 'UPDATE_PROFILE', payload: updatedProfile });
    trackProfileUpdated(updatedProfile);
    if (dietary !== (profile?.dietary_requirements || null)) {
      trackDietaryRequirementsUpdated(dietary);
    }
    setEditMode(false);
    // Also update push token with new location
    if (deviceId) {
      supabase.from('push_tokens')
        .update({ arc_location_id: selectedLocationId, updated_at: new Date().toISOString() })
        .eq('device_id', deviceId)
        .then(() => console.log('[Profile] Push token location updated'));
    }
    showToast('✓ Profile saved');
  };

  const handleSelectLocation = (loc) => {
    setSelectedLocationId(loc?.id || null);
    setSelectedLocationName(loc ? `${loc.venue_name}, ${loc.state}` : null);
    setLocationPickerVisible(false);
    // Immediately update push token
    if (deviceId) {
      supabase.from('push_tokens')
        .update({ arc_location_id: loc?.id || null, updated_at: new Date().toISOString() })
        .eq('device_id', deviceId)
        .then(() => console.log('[Profile] Push token location updated to:', loc?.venue_name));
    }
    showToast(`📍 Location set to ${loc?.venue_name || 'none'}`);
  };

  const pendingCount = mergedOrders.filter((o) => o.status === 'pending').length;

  const handleJoinTrace = async () => {
    if (!traceId.trim()) return;
    try {
      await joinTrace(traceId.trim());
      setTraceActive(true);
      setTraceStatus(`✅ Trace started: ${traceId.trim()}`);
      console.log('[Debug] Joined trace:', traceId.trim());
      // Auto-hide after 3 seconds
      setTimeout(() => setTraceStatus(''), 3000);
    } catch (e) {
      setTraceStatus(`❌ Error: ${e.message}`);
      setTimeout(() => setTraceStatus(''), 3000);
    }
  };

  const handleLeaveTrace = async () => {
    try {
      await leaveTrace();
      setTraceActive(false);
      setTraceId('');
      setTraceStatus('✅ Trace stopped');
      console.log('[Debug] Left trace and ended session');
      // Auto-hide after 3 seconds
      setTimeout(() => setTraceStatus(''), 3000);
    } catch (e) {
      setTraceStatus(`❌ Error: ${e.message}`);
      setTimeout(() => setTraceStatus(''), 3000);
    }
  };

  const handleQueryMoments = async () => {
    const deviceId = getCanonicalDeviceId() || state.deviceId;
    if (!deviceId) { setTraceStatus('No device ID available'); return; }
    const url = `https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39?attributeId=5120&attributeValue=${encodeURIComponent(deviceId.toLowerCase())}`;
    setMomentsUrl(url);
    setMomentsLoading(true);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setMomentsData(data);
      console.log('[Debug] Moments API response:', JSON.stringify(data));
    } catch (e) {
      setMomentsData({ error: e.message });
    }
    setMomentsLoading(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      {/* Toast notification */}
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
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
        <TouchableOpacity 
          style={styles.tabWrap} 
          onPress={() => { 
            setActiveTab('debug'); 
            trackProfileTab('debug');
            // Increment tap counter
            const newCount = debugTapCount + 1;
            setDebugTapCount(newCount);
            if (newCount >= 10 && !momentsUnlocked) {
              setMomentsUnlocked(true);
              showToast('🎉 Moments API unlocked!');
            }
          }}
        >
          <Text style={[styles.tabText, activeTab === 'debug' && styles.tabTextActive]}>Debug</Text>
          {activeTab === 'debug' && <View style={styles.tabUnderline} />}
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
            {/* AI intake insight card */}
            {(insightLoading || orderInsight) && (
              <View style={styles.insightCard}>
                {insightLoading ? (
                  <View style={styles.insightLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.insightLoadingText}>Analysing your order history...</Text>
                  </View>
                ) : (
                  <>
                    {/* Title row with AI badge floated right */}
                    <View style={styles.insightHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AiSparkIcon size={14} color={colors.primary} />
                        <Text style={styles.insightTitle}>Your Café Intake</Text>
                      </View>
                      <View style={styles.insightAiBadge}>
                        <Text style={styles.insightAiBadgeText}>AI Suggestion</Text>
                      </View>
                    </View>

                    {/* LLM name */}
                    <Text style={styles.insightEngine}>{orderInsight.engine}</Text>

                    {/* kJ chips */}
                    <View style={styles.insightKjRow}>
                      <View style={styles.insightKjChip}>
                        <Text style={styles.insightKjValue}>{orderInsight.kj_total?.toLocaleString()}</Text>
                        <Text style={styles.insightKjLabel}>total kJ</Text>
                      </View>
                      <View style={styles.insightKjChip}>
                        <Text style={styles.insightKjValue}>{orderInsight.kj_per_visit?.toLocaleString()}</Text>
                        <Text style={styles.insightKjLabel}>avg per visit</Text>
                      </View>
                    </View>

                    {orderInsight.insight ? <Text style={styles.insightText}>{orderInsight.insight}</Text> : null}

                    {/* Tip row with icon */}
                    {orderInsight.tip ? (
                      <View style={styles.insightTipRow}>
                        <LightbulbIcon size={16} color={colors.teal} />
                        <Text style={styles.insightTip}>{orderInsight.tip}</Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )}

            {mergedOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <TakeawayCupIcon size={56} color={colors.border} />
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
                      {order.fulfilledAt && (Date.now() - order.fulfilledAt) > 30 * 60 * 1000
                        ? <><CheckIcon size={14} color={colors.primary} /><Text style={styles.readyText}>Collected</Text></>
                        : <><TakeawayCupIcon size={14} color={colors.primary} /><Text style={styles.readyText}>Ready for pickup!</Text></>
                      }
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
                  <UserIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>NAME</Text>
                    <Text style={styles.profileValue}>{profile?.name || '—'}</Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <EmailIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>EMAIL</Text>
                    <Text style={styles.profileValue}>{profile?.email || '—'}</Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <Text style={styles.dietaryIcon}>🌿</Text>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>DIETARY REQUIREMENTS</Text>
                    <Text style={[styles.profileValue, !profile?.dietary_requirements && { color: colors.textMuted }]}>
                      {profile?.dietary_requirements || 'Not set'}
                    </Text>
                  </View>
                </View>
                <View style={styles.profileDivider} />
                <View style={styles.profileRow}>
                  <LocationPinIcon size={22} color={colors.textMid} />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileLabel}>ARC LOCATION</Text>
                    {selectedLocationName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.profileValue, !currentLocationActive && { color: colors.textMuted }]}>
                          {selectedLocationName}
                        </Text>
                        {!currentLocationActive && (
                          <View style={styles.locationInactiveBadge}>
                            <Text style={styles.locationInactiveBadgeText}>⚠️ Needs update</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.profileValue, { color: colors.textMuted }]}>Not set</Text>
                    )}
                  </View>
                </View>
                {!currentLocationActive && selectedLocationId && (
                  <View style={styles.locationWarning}>
                    <Text style={styles.locationWarningText}>
                      Your Arc location is no longer active. Please update your location to continue receiving relevant notifications.
                    </Text>
                    <TouchableOpacity
                      style={styles.locationUpdateBtn}
                      onPress={() => setLocationPickerVisible(true)}
                    >
                      <Text style={styles.locationUpdateBtnText}>Update location →</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    setEditName(profile?.name || '');
                    setEditEmail(profile?.email || '');
                    setEditDietary(profile?.dietary_requirements || '');
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
                  <UserIcon size={16} color={colors.textMuted} />
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
                  <EmailIcon size={16} color={colors.textMuted} />
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
                <Text style={styles.fieldLabel}>DIETARY REQUIREMENTS</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.dietaryIcon}>🌿</Text>
                  <TextInput
                    style={styles.input}
                    value={editDietary}
                    onChangeText={setEditDietary}
                    placeholder="e.g. Vegan, Gluten-free, Nut allergy"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={styles.fieldLabel}>ARC LOCATION</Text>
                <TouchableOpacity
                  style={styles.inputRow}
                  onPress={() => setLocationPickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <LocationPinIcon size={16} color={colors.textMuted} />
                  <Text style={[styles.input, { paddingVertical: 0, lineHeight: 48, color: selectedLocationName ? colors.textDark : colors.textMuted }]}>
                    {selectedLocationName || 'Select location'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 18, marginRight: 4 }}>›</Text>
                </TouchableOpacity>
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
            <Text style={styles.uuidLabel}>CUSTOMER UUID (TEALIUM)</Text>
            <View style={styles.uuidRow}>
              <Text style={styles.uuidValue} numberOfLines={1} ellipsizeMode="middle">
                {tealiumUuid || deviceId || '—'}
              </Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => {
                  const uuidToCopy = tealiumUuid || deviceId;
                  if (uuidToCopy) {
                    Clipboard.setString(uuidToCopy);
                    trackUuidCopy({
                      uuid: uuidToCopy,
                      email: profile?.email || '',
                      name: profile?.name || '',
                    });
                    showToast('UUID copied to clipboard');
                  }
                }}
              >
                <CopyIcon size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Location Picker Modal */}
      <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}><LocationPinIcon size={20} color={colors.midnight} /><Text style={styles.modalTitle}>Select Arc Location</Text></View>
            <TouchableOpacity onPress={() => setLocationPickerVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
            {locations.map(loc => {
              const active = isLocationActive(loc);
              const isSelected = selectedLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.locationItem,
                    isSelected && styles.locationItemSelected,
                    !active && styles.locationItemDisabled,
                  ]}
                  onPress={() => { if (!active) return; handleSelectLocation(loc); }}
                  activeOpacity={active ? 0.7 : 1}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.locationItemName, !active && { color: colors.textMuted }]}>
                        {loc.venue_name}
                      </Text>
                      <View style={active ? styles.locationBadgeActive : styles.locationBadgeInactive}>
                        <Text style={active ? styles.locationBadgeActiveText : styles.locationBadgeInactiveText}>
                          {active ? 'Active' : 'Unavailable'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.locationItemAddress}>{loc.address}, {loc.state}</Text>
                    {loc.start_date && (
                      <Text style={styles.locationItemDates}>
                        {new Date(loc.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {loc.end_date ? ` – ${new Date(loc.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Debug Tab ── */}
      {activeTab === 'debug' && (
        <ScrollView contentContainerStyle={styles.debugContent} showsVerticalScrollIndicator={false}>

          {/* Trace Section */}
          <View style={styles.debugCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MagnifyIcon size={18} color={colors.midnight} />
              <Text style={styles.debugCardTitle}>Tealium Trace</Text>
            </View>
            <Text style={styles.debugCardDesc}>
              Enter a Trace ID from Tealium iQ to begin a live trace session. All events will include the trace ID for real-time monitoring.
            </Text>

            <Text style={styles.debugLabel}>TRACE ID</Text>
            <View style={styles.debugInputRow}>
              <TextInput
                style={styles.debugInput}
                placeholder="Enter trace ID"
                placeholderTextColor={colors.textMuted}
                value={traceId}
                onChangeText={setTraceId}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!traceActive}
              />
            </View>

            <View style={styles.debugBtnRow}>
              <TouchableOpacity
                style={[styles.debugBtn, (!traceId.trim() || traceActive) && styles.debugBtnDisabled]}
                onPress={handleJoinTrace}
                disabled={!traceId.trim() || traceActive}
                activeOpacity={0.8}
              >
                <Text style={styles.debugBtnText}>Start Trace</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.debugBtn, styles.debugBtnDanger, !traceActive && styles.debugBtnDisabled]}
                onPress={handleLeaveTrace}
                disabled={!traceActive}
                activeOpacity={0.8}
              >
                <Text style={styles.debugBtnText}>Stop Trace</Text>
              </TouchableOpacity>
            </View>

            {traceStatus ? (
              <View style={[styles.debugStatusBadge, traceActive && styles.debugStatusBadgeActive]}>
                <Text style={[styles.debugStatusText, traceActive && styles.debugStatusTextActive]}>{traceStatus}</Text>
              </View>
            ) : null}
          </View>

          {/* Moments API Section */}
          {momentsUnlocked && (
            <View style={styles.debugCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LightningBoltIcon size={18} color={colors.midnight} />
                <Text style={styles.debugCardTitle}>Moments API</Text>
              </View>
              <Text style={styles.debugCardDesc}>Query the Moments API engine for this visitor's current profile data.</Text>

              <Text style={styles.debugLabel}>CUSTOMER UUID (TEALIUM)</Text>
              <Text style={styles.debugMono}>{(tealiumUuid || state.deviceId || '—').toLowerCase()}</Text>

              <Text style={styles.debugLabel}>ENDPOINT</Text>
              <Text style={styles.debugMono} numberOfLines={3}>
                {`https://personalization-api.ap-southeast-2.prod.tealiumapis.com/personalization/accounts/success-robert-rizman/profiles/coffee-demo/engines/aaa7abe0-9023-49c8-8858-5fe2dbb18c39?attributeId=5120&attributeValue=${(tealiumUuid || state.deviceId || '').toLowerCase()}`}
              </Text>

              <TouchableOpacity
                style={[styles.debugBtn, styles.debugBtnPrimary, momentsLoading && styles.debugBtnDisabled]}
                onPress={handleQueryMoments}
                disabled={momentsLoading}
                activeOpacity={0.8}
              >
                {momentsLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.debugBtnText}>Query Moments API</Text>
                }
              </TouchableOpacity>

              {momentsData && (
                <View style={styles.debugResponseWrap}>
                  <Text style={styles.debugLabel}>RESPONSE</Text>
                  <Text style={styles.debugMono}>{JSON.stringify(momentsData, null, 2)}</Text>
                </View>
              )}
            </View>
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
    paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.primaryMid,
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
  insightCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.primaryMid,
    padding: spacing.md, gap: spacing.sm, ...shadow.card,
  },
  insightLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  insightLoadingText: { ...typography.caption, color: colors.primary },
  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightTitle: { fontSize: 15, fontWeight: '700', color: colors.midnight },
  insightAiBadge: {
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  insightAiBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  insightEngine: { fontSize: 11, fontWeight: '600', color: colors.textMid },
  insightKjRow: { flexDirection: 'row', gap: spacing.sm },
  insightKjChip: {
    flex: 1, backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.primaryMid,
  },
  insightKjValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  insightKjLabel: { fontSize: 11, color: colors.textMid, fontWeight: '600', marginTop: 2 },
  insightText: { fontSize: 13, color: colors.textMid, lineHeight: 20 },
  insightTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: colors.tealLight, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.tealMid },
  insightTip: { flex: 1, fontSize: 12, color: colors.textMid, fontWeight: '600', lineHeight: 18 },
  dietaryIcon: { fontSize: 20, width: 22, textAlign: 'center' },
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
  locationPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceAlt,
  },
  locationPickerBtnText: { fontSize: 15, color: colors.textDark, flex: 1 },
  locationInactiveBadge: {
    backgroundColor: '#fef3c7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2,
  },
  locationInactiveBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
  locationWarning: {
    backgroundColor: '#fef3c7', borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: '#fcd34d',
  },
  locationWarningText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
  locationUpdateBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 8, alignItems: 'center',
  },
  locationUpdateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 14, color: colors.textDark, fontWeight: '600' },
  locationItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight, marginBottom: spacing.sm,
  },
  locationItemSelected: { borderColor: colors.primary },
  locationItemDisabled: { opacity: 0.5 },
  locationItemName: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  locationItemAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  locationItemDates: { fontSize: 11, color: colors.teal, marginTop: 3, fontWeight: '600' },
  locationBadgeActive: { backgroundColor: '#dcfce7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeActiveText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  locationBadgeInactive: { backgroundColor: '#f1f5f9', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeInactiveText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  toast: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    zIndex: 999, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 8, elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── Debug tab ──
  debugContent: { padding: spacing.lg, gap: spacing.md },
  debugCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  debugCardTitle: { fontSize: 16, fontWeight: '700', color: colors.midnight },
  debugCardDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  debugLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.sm },
  debugInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  debugInput: { flex: 1, height: 44, fontSize: 15, color: colors.textDark, fontFamily: 'monospace' },
  debugBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  debugBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    backgroundColor: colors.midnight, alignItems: 'center',
  },
  debugBtnPrimary: { backgroundColor: colors.primary },
  debugBtnDanger: { backgroundColor: '#dc2626' },
  debugBtnDisabled: { opacity: 0.35 },
  debugBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  debugStatusBadge: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.sm, marginTop: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  debugStatusBadgeActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  debugStatusText: { fontSize: 13, color: colors.textMid, fontWeight: '600' },
  debugStatusTextActive: { color: '#16a34a' },
  debugMono: {
    fontSize: 11, color: colors.textMid, fontFamily: 'monospace',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    padding: spacing.sm, lineHeight: 16,
  },
  debugResponseWrap: { marginTop: spacing.sm, gap: spacing.xs },
});