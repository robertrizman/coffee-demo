import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from './supabase';
import { useApp } from './AppContext';
import { colors, typography, spacing, radius, shadow, fonts } from './theme';

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55'];
const PERIODS = ['am','pm'];

function TimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [period, setPeriod] = useState('');

  useEffect(() => {
    if (!value) { setHour(''); setMinute(''); setPeriod(''); return; }
    const m = value.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (!m) return;
    setHour(m[1]);
    setMinute(m[2]);
    setPeriod(m[3].toLowerCase());
  }, [value]);

  const emit = (h, m, p) => onChange(`${h}:${m}${p}`);

  const pickHour = (h) => {
    setHour(h);
    const m = minute || '00';
    const p = period || 'am';
    if (!minute) setMinute('00');
    if (!period) setPeriod('am');
    emit(h, m, p);
  };

  const pickMinute = (m) => {
    setMinute(m);
    const h = hour || '8';
    const p = period || 'am';
    if (!hour) setHour('8');
    if (!period) setPeriod('am');
    emit(h, m, p);
  };

  const pickPeriod = (p) => {
    setPeriod(p);
    const h = hour || '8';
    const m = minute || '00';
    if (!hour) setHour('8');
    if (!minute) setMinute('00');
    emit(h, m, p);
  };

  return (
    <View>
      <TouchableOpacity style={styles.timeBtn} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Text style={[styles.timeBtnText, !value && styles.timeBtnPlaceholder]}>
          {value || 'Select time'}
        </Text>
        <Text style={styles.timeBtnChevron}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.pickerContainer}>
          {/* Hour */}
          <View style={styles.pickerCol}>
            <Text style={styles.pickerColLabel}>Hour</Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {HOURS.map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.pickerItem, hour === h && styles.pickerItemSelected]}
                  onPress={() => pickHour(h)}
                >
                  <Text style={[styles.pickerItemText, hour === h && styles.pickerItemTextSelected]}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Minute */}
          <View style={styles.pickerCol}>
            <Text style={styles.pickerColLabel}>Min</Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {MINUTES.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pickerItem, minute === m && styles.pickerItemSelected]}
                  onPress={() => pickMinute(m)}
                >
                  <Text style={[styles.pickerItemText, minute === m && styles.pickerItemTextSelected]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* AM / PM */}
          <View style={styles.pickerCol}>
            <Text style={styles.pickerColLabel}>AM/PM</Text>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.pickerItem, period === p && styles.pickerItemSelected]}
                onPress={() => pickPeriod(p)}
              >
                <Text style={[styles.pickerItemText, period === p && styles.pickerItemTextSelected]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function AgendaManagementScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const agendaEnabled = state.agendaEnabled;

  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ event_title: '', wifi_ssid: '', wifi_password: '' });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formTimeSlot, setFormTimeSlot] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsHighlight, setFormIsHighlight] = useState(false);
  const [formError, setFormError] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const fetchData = useCallback(async () => {
    const [itemsRes, configRes] = await Promise.all([
      supabase.from('agenda_items').select('*').order('sort_order', { ascending: true }),
      supabase.from('agenda_config').select('*').eq('id', 1).single(),
    ]);
    setLoading(false);
    if (!itemsRes.error) setItems(itemsRes.data || []);
    if (!configRes.error && configRes.data) setConfig(configRes.data);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleAgenda = async (value) => {
    dispatch({ type: 'SET_STORE_CONFIG', payload: { agenda_enabled: value } });
    await supabase.from('store_config').update({ agenda_enabled: value }).eq('id', 'default');
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const { error } = await supabase.from('agenda_config').upsert({
      id: 1,
      event_title: config.event_title.trim() || 'Agenda',
      wifi_ssid: config.wifi_ssid.trim(),
      wifi_password: config.wifi_password.trim(),
      updated_at: new Date().toISOString(),
    });
    setSavingConfig(false);
    if (error) Alert.alert('Error', 'Failed to save settings.');
    else Alert.alert('Saved', 'Agenda settings updated.');
  };

  const openAdd = () => {
    setEditingItem(null);
    setFormTimeSlot('');
    setFormTitle('');
    setFormDescription('');
    setFormIsHighlight(false);
    setFormError('');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormTimeSlot(item.time_slot);
    setFormTitle(item.title);
    setFormDescription(item.description || '');
    setFormIsHighlight(item.is_highlight);
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    const title = formTitle.trim();
    if (!formTimeSlot) { setFormError('Please select a time.'); return; }
    if (!title) { setFormError('Title is required.'); return; }

    setSavingItem(true);
    let error;
    const description = formDescription.trim() || null;
    if (editingItem) {
      ({ error } = await supabase.from('agenda_items')
        .update({ time_slot: formTimeSlot, title, description, is_highlight: formIsHighlight })
        .eq('id', editingItem.id));
    } else {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
      ({ error } = await supabase.from('agenda_items')
        .insert({ time_slot: formTimeSlot, title, description, is_highlight: formIsHighlight, sort_order: maxOrder }));
    }
    setSavingItem(false);
    if (error) {
      setFormError('Failed to save. Please try again.');
    } else {
      setModalVisible(false);
      fetchData();
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Item', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('agenda_items').delete().eq('id', item.id);
          if (error) Alert.alert('Error', 'Failed to delete.');
          else fetchData();
        },
      },
    ]);
  };

  const reorder = async (index, direction) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    setReordering(true);
    const next = [...items];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    const updates = next.map((item, i) => ({ id: item.id, sort_order: i }));
    await Promise.all(updates.map(u =>
      supabase.from('agenda_items').update({ sort_order: u.sort_order }).eq('id', u.id)
    ));
    setItems(next.map((item, i) => ({ ...item, sort_order: i })));
    setReordering(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agenda</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Visibility Toggle ── */}
        <View style={styles.section}>
          <View style={styles.toggleBlock}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Show Agenda Tab</Text>
              <Text style={styles.toggleSub}>
                {agendaEnabled ? 'Visible to all attendees' : 'Hidden from attendees'}
              </Text>
            </View>
            <Switch
              value={!!agendaEnabled}
              onValueChange={toggleAgenda}
              trackColor={{ false: colors.borderLight, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── Event & WiFi Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event & WiFi</Text>
          <Text style={styles.fieldLabel}>Event Title</Text>
          <TextInput
            style={styles.input}
            value={config.event_title}
            onChangeText={v => setConfig(c => ({ ...c, event_title: v }))}
            placeholder="Arc Agenda"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>WiFi SSID</Text>
          <TextInput
            style={styles.input}
            value={config.wifi_ssid}
            onChangeText={v => setConfig(c => ({ ...c, wifi_ssid: v }))}
            placeholder="Network name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>WiFi Password</Text>
          <TextInput
            style={styles.input}
            value={config.wifi_password}
            onChangeText={v => setConfig(c => ({ ...c, wifi_password: v }))}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveConfig} disabled={savingConfig}>
            <Text style={styles.primaryBtnText}>{savingConfig ? 'Saving…' : 'Save Settings'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Schedule Items ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 && (
            <Text style={styles.empty}>No items yet. Tap + Add to get started.</Text>
          )}

          {items.map((item, index) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.arrows}>
                <TouchableOpacity
                  onPress={() => reorder(index, -1)}
                  disabled={index === 0 || reordering}
                  style={[styles.arrowBtn, index === 0 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrow}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => reorder(index, 1)}
                  disabled={index === items.length - 1 || reordering}
                  style={[styles.arrowBtn, index === items.length - 1 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrow}>↓</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemTime}>{item.time_slot}</Text>
                <Text style={[styles.itemTitle, item.is_highlight && styles.itemTitleBold]} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!item.description && (
                  <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                )}
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Add / Edit Modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setModalVisible(false)} />
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'New Item'}</Text>

              <Text style={styles.fieldLabel}>Time</Text>
              <TimePicker value={formTimeSlot} onChange={setFormTimeSlot} />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Title</Text>
              <TextInput
                style={[styles.input, { minHeight: 56 }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Session title"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Description <Text style={styles.optionalLabel}>(optional)</Text></Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Add more detail about this session…"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={styles.toggleRow}>
                <Text style={[styles.fieldLabel, { flex: 1, marginBottom: 0, marginRight: 12 }]}>Key session (bold)</Text>
                <Switch
                  value={formIsHighlight}
                  onValueChange={setFormIsHighlight}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {!!formError && <Text style={styles.errorText}>{formError}</Text>}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                  onPress={handleSaveItem}
                  disabled={savingItem}
                >
                  <Text style={styles.primaryBtnText}>{savingItem ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 16, color: colors.primary, fontFamily: fonts.semibold },
  headerTitle: { flex: 1, textAlign: 'center', ...typography.heading3 },
  scroll: { padding: spacing.md, paddingBottom: 48 },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { ...typography.heading3, marginBottom: 12 },
  fieldLabel: { ...typography.label, marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: colors.background,
    minHeight: 44,
    marginBottom: 4,
  },

  // Time picker
  timeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.background,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  timeBtnText: { fontSize: 14, color: colors.textDark },
  timeBtnPlaceholder: { color: colors.textMuted },
  timeBtnChevron: { fontSize: 11, color: colors.textMuted },
  pickerContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginTop: 2,
    overflow: 'hidden',
  },
  pickerCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  pickerColLabel: {
    ...typography.label,
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerScroll: { maxHeight: 180 },
  pickerItem: {
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  pickerItemSelected: { backgroundColor: colors.primaryLight },
  pickerItemText: { fontSize: 14, color: colors.textDark },
  pickerItemTextSelected: { color: colors.primary, fontFamily: fonts.bold },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },

  addBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addBtnText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },

  empty: { ...typography.caption, textAlign: 'center', paddingVertical: 24 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  arrows: { marginRight: 6 },
  arrowBtn: { padding: 4 },
  arrowDisabled: { opacity: 0.25 },
  arrow: { fontSize: 17, color: colors.textMuted, lineHeight: 22 },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTime: { fontSize: 11, color: colors.textLight, marginBottom: 2 },
  itemTitle: { fontSize: 13, color: colors.textDark, lineHeight: 19, flexShrink: 1 },
  itemTitleBold: { fontFamily: fonts.bold, color: colors.primary },
  itemDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 16, flexShrink: 1 },
  optionalLabel: { fontFamily: fonts.regular, color: colors.textMuted },
  itemActions: { flexDirection: 'row', gap: 6 },
  editBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editBtnText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteBtnText: { color: colors.error, fontFamily: fonts.bold, fontSize: 12 },

  toggleBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleTitle: { ...typography.body, fontFamily: fonts.bold },
  toggleSub: { ...typography.caption, marginTop: 2 },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 2,
  },
  errorText: { color: colors.error, fontSize: 12, marginTop: 8 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    flexDirection: 'column',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 48,
  },
  modalTitle: { ...typography.heading2, marginBottom: spacing.md },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: { color: colors.textDark, fontFamily: fonts.semibold, fontSize: 14 },
});
