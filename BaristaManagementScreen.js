import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, Alert, Modal,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from './supabase';
import { colors, typography, spacing, radius, shadow } from './theme';
import { UserIcon, AddIcon, TrashIcon, LockIcon, PrinterIcon } from './CoffeeIcons';

export default function BaristaManagementScreen() {
  const navigation = useNavigation();
  const [baristas, setBaristas] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [selectedBarista, setSelectedBarista] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState('');

  const fetchData = useCallback(async () => {
    const [baristasRes, printersRes] = await Promise.all([
      supabase
        .from('baristas')
        .select('id, name, username, role, station, active, created_at, printer_id')
        .order('created_at', { ascending: true }),
      supabase
        .from('printers')
        .select('id, name, ip, port, model')
        .order('created_at', { ascending: true }),
    ]);

    setLoading(false);
    setRefreshing(false);
    if (!baristasRes.error) setBaristas(baristasRes.data || []);
    if (!printersRes.error) setPrinters(printersRes.data || []);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async () => {
    const name = newName.trim();
    const username = newUsername.trim().toLowerCase();
    const password = newPassword.trim();

    if (!name) { setFormError('Please enter a name.'); return; }
    if (!username) { setFormError('Please enter a username.'); return; }
    if (!password) { setFormError('Please enter a password.'); return; }
    if (password.length < 4) { setFormError('Password must be at least 4 characters.'); return; }

    setSaving(true);
    setFormError('');

    // Default printer_id to first available printer
    const defaultPrinterId = printers.length > 0 ? printers[0].id : null;

    const { error } = await supabase.from('baristas').insert({
      name, username, password,
      role: 'barista',
      active: true,
      printer_id: defaultPrinterId,
    });

    setSaving(false);

    if (error) {
      setFormError(error.message.includes('unique') ? 'That username is already taken.' : 'Could not add barista: ' + error.message);
      return;
    }

    setModalVisible(false);
    setNewName(''); setNewUsername(''); setNewPassword('');
    fetchData();
  };

  const handleToggleActive = (b) => {
    const action = b.active ? 'Deactivate' : 'Activate';
    Alert.alert(`${action} ${b.name}?`, b.active ? `${b.name} will no longer be able to sign in.` : `${b.name} will be able to sign in again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: b.active ? 'destructive' : 'default', onPress: async () => {
        await supabase.from('baristas').update({ active: !b.active }).eq('id', b.id);
        fetchData();
      }},
    ]);
  };

  const handleDelete = (b) => {
    if (b.role === 'owner') { Alert.alert('Cannot delete', 'The owner account cannot be deleted.'); return; }
    Alert.alert(`Delete ${b.name}?`, 'This permanently removes their account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('baristas').delete().eq('id', b.id);
        fetchData();
      }},
    ]);
  };

  const handleAssignPrinter = (b) => {
    setSelectedBarista(b);
    setPrinterModalVisible(true);
  };

  const handleSelectPrinter = async (printer) => {
    if (!selectedBarista) return;
    await supabase.from('baristas')
      .update({ printer_id: printer ? printer.id : null })
      .eq('id', selectedBarista.id);
    setPrinterModalVisible(false);
    setSelectedBarista(null);
    fetchData();
  };

  const getPrinterForBarista = (b) => printers.find((p) => p.id === b.printer_id);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Barista accounts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setFormError(''); setModalVisible(true); }}>
          <AddIcon size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.centred}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}
        >
          {printers.length === 0 && (
            <View style={styles.noPrintersHint}>
              <PrinterIcon size={20} color={colors.textMuted} />
              <Text style={styles.noPrintersText}>No printers found. Scan for printers in Settings first.</Text>
            </View>
          )}

          <Text style={styles.hint}>Note: Printer assignments are now device-specific. Each device remembers its own printer when logged in as the same barista. The printer shown here is from the legacy system and may not reflect the current device assignment.</Text>

          <View style={styles.list}>
            {baristas.map((b, i) => {
              const assignedPrinter = getPrinterForBarista(b);
              return (
                <View key={b.id} style={[styles.row, i < baristas.length - 1 && styles.rowBorder]}>
                  <View style={[styles.avatar, !b.active && styles.avatarInactive]}>
                    <Text style={styles.avatarText}>{b.name.charAt(0).toUpperCase()}</Text>
                  </View>

                  <View style={styles.rowInfo}>
                    <View style={styles.rowNameRow}>
                      <Text style={[styles.rowName, !b.active && styles.rowNameInactive]}>{b.name}</Text>
                      {b.role === 'owner' && <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>Owner</Text></View>}
                      {!b.active && <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>Inactive</Text></View>}
                    </View>
                    <Text style={styles.rowUsername}>@{b.username}</Text>
                    {b.station && <Text style={styles.rowStation}>📍 {b.station}</Text>}
                    {/* Printer assignment */}
                    <TouchableOpacity style={styles.printerRow} onPress={() => handleAssignPrinter(b)}>
                      <PrinterIcon size={13} color={assignedPrinter ? colors.primary : colors.textMuted} />
                      <Text style={[styles.printerLabel, !assignedPrinter && styles.printerLabelEmpty]}>
                        {assignedPrinter ? `${assignedPrinter.name} (${assignedPrinter.ip})` : 'No printer assigned — tap to assign'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {b.role !== 'owner' && (
                    <View style={styles.rowActions}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleActive(b)}>
                        <Text style={[styles.actionBtnText, b.active && styles.actionBtnDeactivate]}>
                          {b.active ? 'Deactivate' : 'Activate'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(b)}>
                        <TrashIcon size={16} color="#c0392b" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Add Barista Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add barista</Text>
            <Text style={styles.modalSubtitle}>They'll be able to sign in to the Barista tab.</Text>

            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <View style={styles.inputRow}>
              <UserIcon size={16} color={colors.textMuted} />
              <TextInput style={styles.input} placeholder="e.g. Sarah" placeholderTextColor={colors.textMuted} value={newName} onChangeText={setNewName} autoCapitalize="words" autoFocus />
            </View>

            <Text style={styles.fieldLabel}>USERNAME</Text>
            <View style={styles.inputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput style={styles.input} placeholder="e.g. sarah" placeholderTextColor={colors.textMuted} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" autoCorrect={false} />
            </View>

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.inputRow}>
              <LockIcon size={16} color={colors.textMuted} />
              <TextInput style={styles.input} placeholder="At least 4 characters" placeholderTextColor={colors.textMuted} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
            </View>

            {printers.length > 0 && (
              <Text style={styles.defaultPrinterNote}>
                🖨 Will be assigned to: {printers[0].name} by default
              </Text>
            )}

            {formError ? <View style={styles.errorBox}><Text style={styles.errorText}>{formError}</Text></View> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]} onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Add barista</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Printer Assignment Modal */}
      <Modal visible={printerModalVisible} transparent animationType="slide" onRequestClose={() => setPrinterModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Assign printer</Text>
            <Text style={styles.sheetSubtitle}>
              {selectedBarista?.name} will use this printer for auto-print.
            </Text>

            {printers.length === 0 ? (
              <View style={styles.sheetEmptyState}>
                <Text style={styles.sheetEmptyText}>No printers found. Scan for printers in Settings first.</Text>
              </View>
            ) : (
              <View style={styles.actionSheetGroup}>
                {printers.map((p, idx) => {
                  const isAssigned = selectedBarista?.printer_id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.actionSheetRow, idx < printers.length - 1 && styles.actionSheetRowBorder]}
                      onPress={() => handleSelectPrinter(p)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.actionSheetRowLeft}>
                        <PrinterIcon size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.actionSheetRowTitle}>{p.name}</Text>
                          <Text style={styles.actionSheetRowMeta}>{p.ip}{p.model ? ` · ${p.model}` : ''}</Text>
                        </View>
                      </View>
                      {isAssigned && <Text style={styles.actionSheetCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity style={styles.destructiveSheetBtn} onPress={() => handleSelectPrinter(null)} activeOpacity={0.8}>
              <Text style={styles.destructiveSheetBtnText}>Remove printer assignment</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setPrinterModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, color: colors.textDark, fontWeight: '300' },
  title: { ...typography.heading2 },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.md },
  hint: { ...typography.caption, color: colors.primary, paddingHorizontal: spacing.sm },

  noPrintersHint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  noPrintersText: { ...typography.caption, flex: 1, color: colors.textMuted },

  list: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, gap: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },

  avatar: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarInactive: { backgroundColor: colors.border },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },

  rowInfo: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  rowNameInactive: { color: colors.textMuted },
  rowUsername: { ...typography.caption, marginTop: 2 },
  rowStation: { fontSize: 11, color: colors.primary, marginTop: 2 },

  printerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  printerLabel: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  printerLabelEmpty: { color: colors.textMuted, fontWeight: '400' },

  ownerBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.primaryMid },
  ownerBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  inactiveBadge: { backgroundColor: '#f5f5f5', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  inactiveBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },

  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  actionBtnDeactivate: { color: colors.pending },
  deleteBtn: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: '#fef0ee', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f0c0b8' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  modalTitle: { ...typography.heading2 },
  modalSubtitle: { ...typography.caption, marginTop: -8 },
  fieldLabel: { ...typography.label, marginBottom: -4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md },
  atSign: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  input: { flex: 1, height: 48, fontSize: 16, color: colors.textDark },
  defaultPrinterNote: { fontSize: 12, color: colors.primary, backgroundColor: colors.primaryLight, padding: spacing.sm, borderRadius: radius.md },
  errorBox: { backgroundColor: '#fef0ee', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#f0c0b8' },
  errorText: { fontSize: 13, color: '#c0392b' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Action sheet / printer assignment
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#f2f2f7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 34,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d1d6',
    marginBottom: spacing.sm,
  },
  sheetTitle: { ...typography.heading2 },
  sheetSubtitle: { ...typography.caption, color: colors.textMid, marginTop: -4, marginBottom: spacing.xs },
  sheetEmptyState: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  sheetEmptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  actionSheetGroup: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  actionSheetRow: {
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  actionSheetRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ededf0' },
  actionSheetRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, paddingRight: spacing.sm },
  actionSheetRowTitle: { fontSize: 16, fontWeight: '600', color: colors.textDark },
  actionSheetRowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  actionSheetCheck: { fontSize: 22, color: colors.primary, fontWeight: '700', marginLeft: spacing.sm },
  destructiveSheetBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    marginTop: spacing.xs,
  },
  destructiveSheetBtnText: { fontSize: 16, fontWeight: '600', color: '#d70015' },
  sheetCancelBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    marginTop: spacing.xs,
  },
  sheetCancelBtnText: { fontSize: 17, fontWeight: '700', color: colors.textDark },
});
