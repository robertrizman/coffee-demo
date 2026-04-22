import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, ActivityIndicator, Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './supabase';
import { colors, spacing, radius, typography } from './theme';

const SUPABASE_URL = 'https://zdgmqmamohrybxwhgwby.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZ21xbWFtb2hyeWJ4d2hnd2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzUyODgsImV4cCI6MjA5MDk1MTI4OH0.imhhaa0OBB69u_igWA52b1Hx0Hhyv4do6YLENifAXRo';

export default function PushBroadcastScreen({ onBack }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [sending, setSending] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);

  useEffect(() => {
    loadBroadcasts();
    loadLocations();
  }, []);

  const loadLocations = async () => {
    const { data } = await supabase
      .from('arc_locations')
      .select('id, venue_name, state, enabled, start_date, end_date')
      .order('venue_name');
    setLocations(data || []);
  };

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  const loadBroadcasts = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('push_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    setBroadcasts(data || []);
    setLoadingHistory(false);
  };

  const handleSend = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a notification title.'); return; }
    if (!message.trim()) { Alert.alert('Message required', 'Please enter a notification message.'); return; }

    let scheduledAt = null;
    if (isScheduled) {
      if (!scheduleDate.trim() || !scheduleTime.trim()) {
        Alert.alert('Schedule required', 'Please enter both date and time.');
        return;
      }
      // Parse date (DD/MM/YYYY) and time (HH:MM)
      const [day, month, year] = scheduleDate.split('/').map(Number);
      const [hour, min] = scheduleTime.replace('.', ':').split(':').map(Number);
      if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(min)) {
        Alert.alert('Invalid format', 'Use DD/MM/YYYY for date and HH:MM for time.');
        return;
      }
      scheduledAt = new Date(year, month - 1, day, hour, min).toISOString();
      if (new Date(scheduledAt) < new Date()) {
        Alert.alert('Invalid time', 'Scheduled time must be in the future.');
        return;
      }
    }

    setSending(true);
    try {
      // Save broadcast to DB
      const { data: broadcast, error } = await supabase
        .from('push_broadcasts')
        .insert({
          title: title.trim(),
          message: message.trim(),
          scheduled_at: scheduledAt,
          status: scheduledAt ? 'scheduled' : 'pending',
          arc_location_id: selectedLocationId || null,
        })
        .select()
        .single();

      if (error) throw error;

      if (!scheduledAt) {
        // Send immediately via Edge Function
        const res = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({ broadcast_id: broadcast.id }),
        });
        const result = await res.json();
        Alert.alert('✅ Sent!', `Notification sent to ${result.sent || 0} device(s).`);
      } else {
        Alert.alert('✅ Scheduled!', `Notification scheduled for ${scheduleDate} at ${scheduleTime}.`);
      }

      setTitle('');
      setMessage('');
      setScheduleDate('');
      setScheduleTime('');
      setIsScheduled(false);
      loadBroadcasts();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setSending(false);
  };

  const handleCancel = async (id) => {
    Alert.alert('Cancel broadcast', 'Are you sure you want to cancel this scheduled notification?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel it', style: 'destructive', onPress: async () => {
          await supabase.from('push_broadcasts').update({ status: 'cancelled' }).eq('id', id);
          loadBroadcasts();
        }
      },
    ]);
  };

  const statusColor = (status) => {
    if (status === 'sent') return '#22c55e';
    if (status === 'scheduled') return colors.primary;
    if (status === 'cancelled') return colors.stone;
    return colors.pending;
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Compose */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📣 New Broadcast</Text>

        <Text style={styles.fieldLabel}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Happy Hour! ☕"
          placeholderTextColor={colors.textMuted}
          maxLength={50}
        />
        <Text style={styles.charCount}>{title.length}/50</Text>

        <Text style={styles.fieldLabel}>MESSAGE</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={message}
          onChangeText={setMessage}
          placeholder="e.g. Get 20% off all drinks for the next hour!"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          maxLength={200}
        />
        <Text style={styles.charCount}>{message.length}/200</Text>

        {/* Schedule toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Schedule for later</Text>
            <Text style={styles.toggleSub}>Otherwise sends immediately</Text>
          </View>
          <Switch
            value={isScheduled}
            onValueChange={(v) => {
              setIsScheduled(v);
              if (v) {
                const now = new Date();
                const dd = String(now.getDate()).padStart(2, '0');
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const yyyy = now.getFullYear();
                const hh = String(now.getHours()).padStart(2, '0');
                const min = String(now.getMinutes()).padStart(2, '0');
                setScheduleDate(`${dd}/${mm}/${yyyy}`);
                setScheduleTime(`${hh}:${min}`);
              }
            }}
            trackColor={{ false: '#e0e0e0', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {isScheduled && (
          <View style={styles.scheduleRow}>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>DATE</Text>
              <TextInput
                style={styles.input}
                value={scheduleDate}
                onChangeText={setScheduleDate}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>TIME (24H)</Text>
              <TextInput
                style={styles.input}
                value={scheduleTime}
                onChangeText={(v) => setScheduleTime(v.replace('.', ':'))}
                placeholder="14:30"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        {/* Location filter */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>📍 Location filter</Text>
            <Text style={styles.toggleSub}>
              {selectedLocation ? `Sending to: ${selectedLocation.venue_name}` : 'Send to all locations'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.locationPickerBtn}
          onPress={() => setLocationPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.locationPickerBtnText}>
            {selectedLocation ? `📍 ${selectedLocation.venue_name}, ${selectedLocation.state}` : '🌏 All locations'}
          </Text>
          <Text style={{ color: colors.textMuted }}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={sending}
          activeOpacity={0.85}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.sendBtnText}>{isScheduled ? '⏰ Schedule Notification' : '📣 Send Now'}</Text>
          }
        </TouchableOpacity>
      </View>

      {/* History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Broadcast History</Text>
        {loadingHistory ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : broadcasts.length === 0 ? (
          <Text style={styles.emptyText}>No broadcasts yet</Text>
        ) : (
          <ScrollView
            style={styles.historyScroll}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {broadcasts.map(b => (
              <View key={b.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View style={styles.historyTitleRow}>
                    <Text style={styles.historyTitle}>{b.title}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(b.status) + '22' }]}>
                      <Text style={[styles.statusText, { color: statusColor(b.status) }]}>{b.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.historyMsg} numberOfLines={2}>{b.message}</Text>
                  <Text style={styles.historyTime}>
                    {b.status === 'scheduled'
                      ? `Scheduled: ${new Date(b.scheduled_at).toLocaleString()}`
                      : b.sent_at
                      ? `Sent: ${new Date(b.sent_at).toLocaleString()}`
                      : `Created: ${new Date(b.created_at).toLocaleString()}`}
                  </Text>
                </View>
                {b.status === 'scheduled' && (
                  <TouchableOpacity onPress={() => handleCancel(b.id)} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Location Picker Modal */}
    <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>📍 Filter by Location</Text>
          <TouchableOpacity onPress={() => setLocationPickerVisible(false)} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.md, gap: spacing.sm }}>
          {/* All locations option */}
          <TouchableOpacity
            style={[styles.locationItem, !selectedLocationId && styles.locationItemSelected]}
            onPress={() => { setSelectedLocationId(null); setLocationPickerVisible(false); }}
          >
            <Text style={styles.locationItemName}>🌏 All locations</Text>
            <Text style={styles.locationItemAddress}>Send to every registered device</Text>
            {!selectedLocationId && <Text style={styles.locationItemCheck}>✓</Text>}
          </TouchableOpacity>
          {locations.map(loc => {
            const active = isLocationActive(loc);
            const isSelected = selectedLocationId === loc.id;
            return (
              <TouchableOpacity
                key={loc.id}
                style={[styles.locationItem, isSelected && styles.locationItemSelected, !active && styles.locationItemDisabled]}
                onPress={() => { if (!active) return; setSelectedLocationId(loc.id); setLocationPickerVisible(false); }}
                activeOpacity={active ? 0.7 : 1}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.locationItemName, !active && { color: colors.textMuted }]}>{loc.venue_name}</Text>
                    <View style={active ? styles.locationBadgeActive : styles.locationBadgeInactive}>
                      <Text style={active ? styles.locationBadgeActiveText : styles.locationBadgeInactiveText}>
                        {active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.locationItemAddress}>{loc.address}, {loc.state}</Text>
                </View>
                {isSelected && <Text style={styles.locationItemCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 0, paddingVertical: 0, gap: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  cardTitle: { ...typography.heading3, marginBottom: 4 },
  fieldLabel: { ...typography.label, marginTop: spacing.sm },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, color: colors.textDark, backgroundColor: colors.surface,
  },
  inputMulti: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  charCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  toggleSub: { fontSize: 12, color: colors.textMuted },
  scheduleRow: { flexDirection: 'row', gap: spacing.sm },
  scheduleField: { flex: 1 },
  sendBtn: {
    backgroundColor: colors.midnight, borderRadius: radius.full,
    padding: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  historyScroll: { maxHeight: 400 },
  historyRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight,
    gap: spacing.sm,
  },
  historyLeft: { flex: 1, gap: 3 },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyTitle: { fontSize: 14, fontWeight: '700', color: colors.textDark, flex: 1 },
  historyMsg: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  historyTime: { fontSize: 11, color: colors.textMuted },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  locationPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  locationPickerBtnText: { fontSize: 14, fontWeight: '600', color: colors.textDark },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, color: colors.textDark, fontWeight: '600' },
  locationItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  locationItemSelected: { borderColor: colors.primary },
  locationItemDisabled: { opacity: 0.5 },
  locationItemName: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  locationItemAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  locationItemCheck: { fontSize: 18, color: colors.primary, fontWeight: '700', marginLeft: spacing.sm },
  locationBadgeActive: { backgroundColor: '#dcfce7', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeActiveText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  locationBadgeInactive: { backgroundColor: '#f1f5f9', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  locationBadgeInactiveText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
});