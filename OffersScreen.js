import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { useApp } from './AppContext';
import { colors, spacing, radius } from './theme';
import { track } from './tealium';

const OFFER_URL = 'https://tealium.com/ai-accelerator/';

export default function OffersScreen() {
  const { state } = useApp();
  const profile = state.profile;

  const handleInterested = () => {
    track('offer_cta_clicked', {
      tealium_event: 'offer_cta_clicked',
      offer_name: 'AI Accelerator',
      offer_url: OFFER_URL,
      button_text: "I'm Interested",
      customer_name: profile?.name || '',
      customer_email: profile?.email || '',
    });
    Linking.openURL(OFFER_URL);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⏳ Limited-time offer</Text>
          </View>
          <Text style={styles.title}>AI Accelerator</Text>
          <Text style={styles.subtitle}>Jump‑start your next AI initiative with Tealium</Text>
        </View>

        {/* Hero offer card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Free Tealium AI Volume</Text>
          <Text style={styles.heroDesc}>
            Up to <Text style={styles.heroHighlight}>3 months</Text> or{' '}
            <Text style={styles.heroHighlight}>50 million events</Text>
            {' '}(whichever comes first), dedicated to new AI initiatives.
          </Text>

          <View style={styles.checkList}>
            {['Agents', 'Next-best-experience', 'AI-powered personalization', 'Decisioning'].map(item => (
              <View key={item} style={styles.checkRow}>
                <View style={styles.checkIcon}><Text style={styles.checkMark}>✓</Text></View>
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Expert support card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🤝 Hands-on Expert Support</Text>
          <Text style={styles.cardBody}>Tealium experts by your side at no extra cost to help design, implement and prove value from your AI use case.</Text>
          <View style={styles.checkList}>
            {['Design your use case', 'Optimize its implementation', 'Get your initiative live'].map(item => (
              <View key={item} style={styles.checkRow}>
                <View style={styles.checkIconSmall}><Text style={styles.checkMarkSmall}>✓</Text></View>
                <Text style={styles.checkTextSmall}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Who is it for */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Who is this for?</Text>
          {[
            'Existing and new Tealium customers',
            'Teams looking to prove value from AI quickly',
            'Organizations with a data cloud or AI investment',
          ].map(item => (
            <View key={item} style={styles.checkRow}>
              <View style={styles.checkIconSmall}><Text style={styles.checkMarkSmall}>✓</Text></View>
              <Text style={styles.checkTextSmall}>{item}</Text>
            </View>
          ))}
        </View>

        {/* T&Cs note */}
        <Text style={styles.tcs}>
          Eligibility criteria applies. Full details will be agreed with your Tealium account team.
        </Text>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handleInterested} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>✦  I'm Interested</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { alignItems: 'center', paddingVertical: spacing.lg, gap: 8 },
  badge: {
    backgroundColor: '#fff3cd', borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: '#ffc107',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#856404' },
  title: { fontSize: 30, fontWeight: '800', color: colors.midnight, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  heroCard: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroDesc: { fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },
  heroHighlight: { color: colors.teal, fontWeight: '700' },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.midnight },
  cardBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },

  checkList: { gap: 8, marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkText: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  checkIconSmall: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkMarkSmall: { color: '#fff', fontSize: 11, fontWeight: '800' },
  checkTextSmall: { fontSize: 14, color: colors.textMuted, flex: 1 },

  tcs: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  ctaBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
});
