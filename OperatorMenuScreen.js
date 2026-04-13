import React, { useState } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MENU, CATEGORIES, EXTRAS, SIZES, MILK_OPTIONS } from './menu';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { trackMenuToggle } from './tealium';
import { colors, typography, spacing, radius } from './theme';
import { SettingsIcon, LogoutIcon } from './CoffeeIcons';

const ALL_CATEGORIES = [...CATEGORIES, 'Extras'];
const FOOD_CATEGORIES = ['Morning Tea', 'Lunch', 'Snacks'];

export default function OperatorMenuScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const { logout } = useAuth();

  const [modalVisible, setModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Espresso');

  const handleToggle = (id, name, category, value) => {
    dispatch({ type: 'TOGGLE_MENU_ITEM', payload: { id, name, category, enabled: value } });
    trackMenuToggle(name, value);
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const openAddModal = (category) => {
    setNewItemCategory(category);
    setNewItemName('');
    setNewItemDesc('');
    setModalVisible(true);
  };

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a name.'); return; }
    dispatch({ type: 'ADD_CUSTOM_ITEM', payload: { category: newItemCategory, name, description: newItemDesc.trim() } });
    setModalVisible(false);
  };

  const handleDeleteItem = (item) => {
    Alert.alert('Delete item', `Remove "${item.name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_CUSTOM_ITEM', payload: { id: item.id, category: item.category } }) },
    ]);
  };

  const renderRow = (id, name, category, isCustom, customItem, isLast) => {
    // Explicitly check: if the key exists use it, otherwise default true
    const enabled = id in state.menuEnabled ? state.menuEnabled[id] : true;
    return (
      <View key={id} style={[styles.row, !isLast && styles.rowBorder]}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowText, !enabled && styles.rowTextOff]}>{name}</Text>
          {isCustom && <Text style={styles.customBadge}>Custom</Text>}
        </View>
        <View style={styles.rowRight}>
          {isCustom && (
            <TouchableOpacity onPress={() => handleDeleteItem(customItem)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          <Switch
            value={enabled}
            onValueChange={(val) => handleToggle(id, name, category, val)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.operatorLabel}>OPERATOR · ADMIN</Text>
          <Text style={styles.title}>Menu</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <SettingsIcon size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.logoutBtn]} onPress={handleLogout}>
            <LogoutIcon size={20} color="#c0392b" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow}>
        {['All', 'Pending', 'Complete'].map((t) => (
          <TouchableOpacity key={t} style={styles.tabWrap} onPress={() => navigation.navigate('OperatorOrders')}>
            <Text style={styles.tabText}>{t}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.tabWrap}>
          <Text style={[styles.tabText, styles.tabTextActive]}>Menu</Text>
          <View style={styles.tabUnderline} />
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.hint}>Toggle on/off · + Add item · ✕ Delete custom item</Text>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {CATEGORIES.map((cat) => {
          const staticItems = MENU.filter((item) => item.category === cat);
          const customItems = state.customItems?.[cat] || [];
          const allItems = [...staticItems, ...customItems];
          return (
            <View key={cat}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{cat.toUpperCase()}</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => openAddModal(cat)}>
                  <Text style={styles.addBtnText}>+ Add item</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.group}>
                {allItems.map((item, i) => {
                  const isCustom = !!(state.customItems?.[cat]?.find((c) => c.id === item.id));
                  return renderRow(item.id, item.name, cat, isCustom, item, i === allItems.length - 1);
                })}
              </View>
            </View>
          );
        })}

        {/* Extras */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>EXTRAS</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => openAddModal('Extras')}>
              <Text style={styles.addBtnText}>+ Add item</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.group}>
            {(() => {
              const customExtras = state.customItems?.Extras || [];
              const allExtras = [
                ...EXTRAS.map((name) => ({ id: 'extra-' + name.toLowerCase().replace(/\s/g, '-'), name, isStatic: true })),
                ...customExtras.map((i) => ({ ...i, isStatic: false })),
              ];
              return allExtras.map((e, i) =>
                renderRow(e.id, e.name, 'Extras', !e.isStatic, e.isStatic ? null : { ...e, category: 'Extras' }, i === allExtras.length - 1)
              );
            })()}
          </View>
        </View>

        {/* Milk options */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>MILK OPTIONS</Text>
            <Text style={styles.sectionHint}>Control which milks customers can choose</Text>
          </View>
          <View style={styles.group}>
            {MILK_OPTIONS.map((milk, i) => {
              const id = 'milk-' + milk.toLowerCase().replace(/\s/g, '-');
              return renderRow(id, milk, 'Milk', false, null, i === MILK_OPTIONS.length - 1);
            })}
          </View>
        </View>

        {/* Sizes */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>SIZES</Text>
            <Text style={styles.sectionHint}>Control which sizes customers can choose</Text>
          </View>
          <View style={styles.group}>
            {SIZES.map((size, i) => {
              const id = 'size-' + size.toLowerCase();
              return renderRow(id, size, 'Sizes', false, null, i === SIZES.length - 1);
            })}
          </View>
        </View>

        {/* Food Menu — Morning Tea, Lunch, Snacks */}
        <View style={styles.foodHeader}>
          <Text style={styles.foodSectionTitle}>FOOD MENU</Text>
          <Text style={styles.sectionHint}>Add items for morning tea, lunch and snacks</Text>
        </View>

        {FOOD_CATEGORIES.map((cat) => {
          const items = state.customItems?.[cat] || [];
          return (
            <View key={cat}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{cat.toUpperCase()}</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => openAddModal(cat)}>
                  <Text style={styles.addBtnText}>+ Add item</Text>
                </TouchableOpacity>
              </View>
              {items.length > 0 ? (
                <View style={styles.group}>
                  {items.map((item, i) =>
                    renderRow(item.id, item.name, cat, true, item, i === items.length - 1)
                  )}
                </View>
              ) : (
                <View style={styles.emptyFood}>
                  <Text style={styles.emptyFoodText}>No {cat.toLowerCase()} items yet — tap + to add</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Item Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add item</Text>

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48 }} contentContainerStyle={{ gap: spacing.sm, alignItems: 'center', paddingVertical: 4 }}>
                {[...ALL_CATEGORIES, ...FOOD_CATEGORIES].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, newItemCategory === cat && styles.catChipActive]}
                    onPress={() => setNewItemCategory(cat)}
                  >
                    <Text style={[styles.catChipText, newItemCategory === cat && styles.catChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Oat Flat White"
                placeholderTextColor={colors.textMuted}
                value={newItemName}
                onChangeText={setNewItemName}
                autoFocus
              />

              <Text style={styles.fieldLabel}>DESCRIPTION (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Flat white made with oat milk"
                placeholderTextColor={colors.textMuted}
                value={newItemDesc}
                onChangeText={setNewItemDesc}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, !newItemName.trim() && styles.confirmBtnDisabled]}
                  onPress={handleAddItem}
                  disabled={!newItemName.trim()}
                >
                  <Text style={styles.confirmBtnText}>Add item</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  operatorLabel: { ...typography.label, color: colors.primary },
  title: { ...typography.heading1 },
  headerIcons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primaryMid, alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { backgroundColor: '#fef0ee' },
  operatorLabel: { ...typography.label, color: colors.teal },

  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.lg },
  tabWrap: { paddingBottom: spacing.sm },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.textLight },
  tabTextActive: { fontWeight: '700', color: colors.primary },
  tabUnderline: { height: 2, backgroundColor: colors.primary, borderRadius: 2, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border },
  hint: { ...typography.caption, color: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sectionLabel: { ...typography.label, color: colors.primary },
  sectionHint: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', flexShrink: 1, textAlign: 'right' },
  foodHeader: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: spacing.xs },
  foodSectionTitle: { ...typography.label, color: colors.midnight || colors.textDark, marginBottom: 2 },
  emptyFood: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed',
    paddingVertical: spacing.md, alignItems: 'center',
  },
  emptyFoodText: { ...typography.caption, color: colors.textMuted },
  addBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { fontSize: 15, color: colors.textDark },
  rowTextOff: { color: colors.textMuted },
  customBadge: { fontSize: 10, fontWeight: '700', color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  deleteBtn: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: '#fef0ee', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f0c0b8' },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: '#c0392b' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  modalTitle: { ...typography.heading2 },
  fieldLabel: { ...typography.label, marginBottom: -4 },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: 13, fontWeight: '600', color: colors.textMid },
  catChipTextActive: { color: '#fff' },
  modalInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md, height: 52, fontSize: 15, color: colors.textDark },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  confirmBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});