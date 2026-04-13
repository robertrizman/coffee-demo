import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Modal } from 'react-native';
import { colors, spacing, radius } from './theme';
import { formatTime } from './storeUtils';

export default function StoreClosedOverlay({ message, breaks = [], visible }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const activeBreaks = breaks.filter(b => b.active);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>☕</Text>
          <Text style={styles.title}>Back Soon!</Text>
          <Text style={styles.message}>{message}</Text>

          {activeBreaks.length > 0 && (
            <View style={styles.hoursSection}>
              <Text style={styles.hoursTitle}>Today's Break Times</Text>
              {activeBreaks.map((b) => (
                <View key={b.id} style={styles.breakRow}>
                  <Text style={styles.breakLabel}>{b.label || 'Break'}</Text>
                  <Text style={styles.breakTime}>{formatTime(b.start_time)} – {formatTime(b.end_time)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.brand}>
            <Text style={styles.brandText}>✦ Tealium Coffee Demo</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 24, 56, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: 36,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 12,
  },
  icon: { fontSize: 56, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.midnight },
  message: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
  hoursSection: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: 8,
    gap: 8,
  },
  hoursTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakLabel: { fontSize: 14, fontWeight: '600', color: colors.midnight },
  breakTime: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  brand: { marginTop: 8 },
  brandText: { fontSize: 11, color: colors.textMuted, letterSpacing: 1 },
});
