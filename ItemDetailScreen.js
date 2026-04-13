import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, Alert, StatusBar, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SIZES, MILK_OPTIONS, EXTRAS } from './menu';
import { useApp } from './AppContext';
import { trackAddToOrder, trackCustomisation } from './tealium';
import { colors, typography, spacing, radius, shadow } from './theme';

export default function ItemDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { item } = route.params;
  const { dispatch, state } = useApp();
  const isClosed = !state.storeOpen;

  const isTea = item.category === 'Tea';

  const [size, setSize] = useState('Medium');
  const [milk, setMilk] = useState(isTea ? 'No Milk' : 'Full Cream');
  const [extras, setExtras] = useState([]);
  const [specialRequest, setSpecialRequest] = useState('');

  // Only show sizes the admin has enabled
  const availableSizes = SIZES.filter((s) => state.menuEnabled['size-' + s.toLowerCase()] !== false);

  // If current size selection got disabled, switch to first available
  const effectiveSize = availableSizes.includes(size) ? size : (availableSizes[0] || size);

  // Filter milk options by menuEnabled (id: 'milk-full-cream' etc)
  const availableMilk = MILK_OPTIONS.filter((m) => {
    const id = 'milk-' + m.toLowerCase().replace(/\s/g, '-');
    return state.menuEnabled[id] !== false;
  });

  // If current milk selection got disabled, switch to first available
  const effectiveMilk = availableMilk.includes(milk) ? milk : (availableMilk[0] || milk);

  // Filter static extras by menuEnabled, then append enabled custom extras
  const customExtraItems = state.customItems?.Extras || [];
  const allExtras = [
    ...EXTRAS.filter((name) => {
      const id = 'extra-' + name.toLowerCase().replace(/\s/g, '-');
      return state.menuEnabled[id] !== false;
    }),
    ...customExtraItems
      .filter((i) => state.menuEnabled[i.id] !== false)
      .map((i) => i.name),
  ];

  const toggleExtra = (extra) => {
    setExtras((prev) =>
      prev.includes(extra) ? prev.filter((e) => e !== extra) : [...prev, extra]
    );
    trackCustomisation(item, { type: 'extra', value: extra });
  };

  const handleSize = (s) => {
    setSize(s);
    trackCustomisation(item, { type: 'size', value: s });
  };

  const handleMilk = (m) => {
    setMilk(m);
    trackCustomisation(item, { type: 'milk', value: m });
  };

  const handleAddToOrder = () => {
    const orderItem = {
      id: item.id,
      name: item.name,
      category: item.category,
      size: effectiveSize,
      milk: effectiveMilk,
      extras,
      specialRequest,
    };
    dispatch({ type: 'ADD_ITEM', payload: orderItem });
    trackAddToOrder(item, orderItem);
    navigation.navigate('OrderSummary');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.subtitle}>{item.description}</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Menu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* SIZE */}
        <Text style={styles.sectionLabel}>SIZE</Text>
        <View style={styles.sizeRow}>
          {availableSizes.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sizeBtn, effectiveSize === s && styles.sizeBtnActive]}
              onPress={() => handleSize(s)}
            >
              <Text style={[styles.sizeBtnText, effectiveSize === s && styles.sizeBtnTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MILK — tea shows simplified milk/no milk options */}
        <Text style={styles.sectionLabel}>{isTea ? 'MILK (OPTIONAL)' : 'MILK'}</Text>
        <View style={styles.chipWrap}>
          {(isTea ? ['No Milk', ...availableMilk.filter(m => m !== 'No Milk')] : availableMilk).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, effectiveMilk === m && styles.chipActive]}
              onPress={() => handleMilk(m)}
            >
              <Text style={[styles.chipText, effectiveMilk === m && styles.chipTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* EXTRAS — hidden for tea */}
        {!isTea && (
          <>
            <Text style={styles.sectionLabel}>EXTRAS</Text>
            <View style={styles.chipWrap}>
              {allExtras.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.chip, extras.includes(e) && styles.chipActive]}
                  onPress={() => toggleExtra(e)}
                >
                  <Text style={[styles.chipText, extras.includes(e) && styles.chipTextActive]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* SPECIAL REQUESTS */}
        <Text style={styles.sectionLabel}>SPECIAL REQUESTS</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Anything else? (optional)"
          placeholderTextColor={colors.textMuted}
          value={specialRequest}
          onChangeText={setSpecialRequest}
          multiline
          numberOfLines={3}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add to Order CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddToOrder} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>⊕  Add to order</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerLeft: { flex: 1 },
  title: { ...typography.heading1, fontSize: 26 },
  subtitle: { ...typography.subtitle, marginTop: 4 },
  backBtn: {
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  backText: { fontSize: 14, fontWeight: '600', color: colors.textMid },
  divider: { height: 1, backgroundColor: colors.border },

  body: { padding: spacing.lg, gap: spacing.md },
  sectionLabel: { ...typography.label, marginBottom: -4 },

  sizeRow: { flexDirection: 'row', gap: spacing.sm },
  sizeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  sizeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sizeBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  sizeBtnTextActive: { color: '#fff' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textMid },
  chipTextActive: { color: '#fff' },

  textInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textDark,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: 34,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: colors.border,
  },
  addBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.midnight,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  closedBannerIcon: { fontSize: 20 },
  closedBannerText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
});