import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  TextInput, Alert,
} from 'react-native';
import { colors, spacing, radius } from './theme';
import { supabase } from './supabase';
import { useApp } from './AppContext';
import { formatTime } from './storeUtils';
import { EditIcon } from './CoffeeIcons';

export default function StoreHoursManager() {
  const { state, dispatch } = useApp();
  const { storeOpen, closedTitle, closedMessage, storeBreaks, offersEnabled } = state;

  const [adding, setAdding] = useState(false);
  const [newBreak, setNewBreak] = useState({ label: '', start_time: '10:00', end_time: '11:00' });
  const [saving, setSaving] = useState(false);

  const [editingMessage, setEditingMessage] = useState(false);
  const [editTitle, setEditTitle] = useState(closedTitle || 'Back Soon!');
  const [editMessage, setEditMessage] = useState(closedMessage || '');
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const debounceRef = useRef(null);
  const saveStatusTimer = useRef(null);

  // Keep local edit state in sync if state changes from another device via real-time
  useEffect(() => {
    if (!editingMessage) {
      setEditTitle(closedTitle || 'Back Soon!');
      setEditMessage(closedMessage || '');
    }
  }, [closedTitle, closedMessage]);

  const persistMessage = (title, message) => {
    const t = title.trim() || 'Back Soon!';
    const m = message.trim();
    dispatch({ type: 'SET_STORE_CONFIG', payload: { closed_title: t, closed_message: m } });
    setSaveStatus('saving');
    supabase.from('store_config').update({
      closed_title: t,
      closed_message: m,
      updated_at: new Date().toISOString(),
    }).eq('id', 'default').then(() => {
      setSaveStatus('saved');
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
      saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 2000);
    });
  };

  const onTitleChange = (v) => {
    setEditTitle(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistMessage(v, editMessage), 800);
  };

  const onMessageChange = (v) => {
    setEditMessage(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistMessage(editTitle, v), 800);
  };

  const toggleOffers = async (value) => {
    dispatch({ type: 'SET_STORE_CONFIG', payload: { offers_enabled: value } });
    await supabase.from('store_config').update({ offers_enabled: value }).eq('id', 'default');
  };

  const toggleStore = async (value) => {
    dispatch({ type: 'SET_STORE_CONFIG', payload: { is_open: value } });
    const { error } = await supabase.from('store_config').update({
      is_open: value,
      updated_at: new Date().toISOString(),
    }).eq('id', 'default');
    if (error) console.warn('[StoreHours] toggleStore error:', error.message);
  };

  const toggleBreak = async (b) => {
    dispatch({ type: 'SET_STORE_BREAKS', payload: storeBreaks.map(x => x.id === b.id ? { ...b, active: !b.active } : x) });
    await supabase.from('store_breaks').update({ active: !b.active }).eq('id', b.id);
  };

  const deleteBreak = async (id) => {
    Alert.alert('Delete break?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        dispatch({ type: 'SET_STORE_BREAKS', payload: storeBreaks.filter(x => x.id !== id) });
        await supabase.from('store_breaks').delete().eq('id', id);
      }},
    ]);
  };

  const addBreak = async () => {
    if (!newBreak.start_time || !newBreak.end_time) return;
    setSaving(true);
    const { data, error } = await supabase.from('store_breaks').insert({
      label: newBreak.label || 'Break',
      start_time: newBreak.start_time,
      end_time: newBreak.end_time,
      active: true,
    }).select().single();
    if (!error && data) {
      dispatch({ type: 'SET_STORE_BREAKS', payload: [...storeBreaks, data] });
      setNewBreak({ label: '', start_time: '10:00', end_time: '11:00' });
      setAdding(false);
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>

      {/* Coffee Bar Status + Closed Message */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Coffee Bar Status</Text>
          <TouchableOpacity
            style={[styles.editBtn, editingMessage && styles.editBtnActive]}
            onPress={() => setEditingMessage(v => !v)}
          >
            <EditIcon size={13} color={editingMessage ? '#fff' : colors.primary} />
            <Text style={[styles.editBtnText, editingMessage && styles.editBtnTextActive]}>
              {editingMessage ? 'Done' : 'Edit Message'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>{storeOpen ? '🟢 Open' : '🔴 Closed'}</Text>
            <Text style={styles.toggleSub}>Override — overrides break schedule</Text>
          </View>
          <Switch
            value={storeOpen}
            onValueChange={toggleStore}
            trackColor={{ false: '#e0e0e0', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {editingMessage && (
          <View style={styles.messageEditor}>
            <View style={styles.divider} />
            <View style={styles.messageFieldRow}>
              <Text style={styles.formLabel}>Title</Text>
              {saveStatus === 'saving' && <Text style={styles.saveIndicator}>Saving…</Text>}
              {saveStatus === 'saved' && <Text style={[styles.saveIndicator, styles.saveIndicatorDone]}>✓ Saved</Text>}
            </View>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={onTitleChange}
              placeholder="Back Soon!"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
            <Text style={styles.formLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={editMessage}
              onChangeText={onMessageChange}
              placeholder="We're taking a short break — check back soon!"
              placeholderTextColor={colors.textMuted}
              multiline
              autoCorrect={false}
            />
          </View>
        )}
      </View>

      {/* Offers tab toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Offers Tab</Text>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>{offersEnabled ? '✦ Offers visible' : '✦ Offers hidden'}</Text>
            <Text style={styles.toggleSub}>Show or hide the Offers tab for customers</Text>
          </View>
          <Switch
            value={offersEnabled !== false}
            onValueChange={toggleOffers}
            trackColor={{ false: '#e0e0e0', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Break slots */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Break Schedule</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(!adding)}>
            <Text style={styles.addBtnText}>{adding ? 'Cancel' : '+ Add'}</Text>
          </TouchableOpacity>
        </View>

        {storeBreaks.length === 0 && !adding && (
          <Text style={styles.empty}>No break slots configured</Text>
        )}

        {storeBreaks.map((b) => (
          <View key={b.id} style={styles.breakCard}>
            <View style={styles.breakInfo}>
              <Text style={styles.breakLabel}>{b.label || 'Break'}</Text>
              <Text style={styles.breakTime}>{formatTime(b.start_time)} – {formatTime(b.end_time)}</Text>
            </View>
            <View style={styles.breakActions}>
              <Switch
                value={b.active}
                onValueChange={() => toggleBreak(b)}
                trackColor={{ false: '#e0e0e0', true: colors.primary }}
                thumbColor="#fff"
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
              <TouchableOpacity onPress={() => deleteBreak(b.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {adding && (
          <View style={styles.addForm}>
            <Text style={styles.formLabel}>Label (optional)</Text>
            <TextInput
              style={styles.input}
              value={newBreak.label}
              onChangeText={(v) => setNewBreak(p => ({ ...p, label: v }))}
              placeholder="e.g. Morning Break"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.formLabel}>Start (24h e.g. 10:00)</Text>
                <TextInput
                  style={styles.input}
                  value={newBreak.start_time}
                  onChangeText={(v) => setNewBreak(p => ({ ...p, start_time: v.replace(/\./g, ':') }))}
                  placeholder="10:00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                />
              </View>
              <Text style={styles.timeSep}>–</Text>
              <View style={styles.timeField}>
                <Text style={styles.formLabel}>End (24h e.g. 11:00)</Text>
                <TextInput
                  style={styles.input}
                  value={newBreak.end_time}
                  onChangeText={(v) => setNewBreak(p => ({ ...p, end_time: v.replace(/\./g, ':') }))}
                  placeholder="11:00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={addBreak} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Break'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  section: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  toggleLabel: { fontSize: 16, fontWeight: '700', color: colors.midnight },
  toggleSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary,
  },
  editBtnActive: { backgroundColor: colors.primary },
  editBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  editBtnTextActive: { color: '#fff' },

  divider: { height: 1, backgroundColor: colors.borderLight },
  messageEditor: { gap: spacing.sm },
  messageFieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveIndicator: { fontSize: 11, color: colors.textMuted },
  saveIndicatorDone: { color: colors.primary, fontWeight: '600' },

  formLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: 14, color: colors.midnight, backgroundColor: colors.surface },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },

  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  breakCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  breakInfo: { gap: 2 },
  breakLabel: { fontSize: 15, fontWeight: '600', color: colors.midnight },
  breakTime: { fontSize: 13, color: colors.primary },
  breakActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 12, color: '#e74c3c', fontWeight: '700' },
  addForm: { gap: spacing.sm, paddingTop: spacing.sm },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeField: { flex: 1, gap: 4 },
  timeSep: { fontSize: 18, color: colors.textMuted, marginBottom: 10 },
  saveBtn: { backgroundColor: colors.primary, padding: 12, borderRadius: radius.full, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
