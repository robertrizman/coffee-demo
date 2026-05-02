import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './AppContext';
import { colors, spacing, radius, fonts } from './theme';
import { track } from './tealium';
import { HandshakeIcon, PeopleIcon, ClockIcon, StarIcon, CheckIcon } from './CoffeeIcons';

const OFFER_URL = 'https://tealium.com/ai-accelerator/?utm_source=Architect_Arc_Coffee_app';

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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <ClockIcon size={16} color="#856404" />
            <Text style={styles.badgeText}>Limited-time offer</Text>
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
                <View style={styles.checkIcon}><CheckIcon size={14} color="#fff" /></View>
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Expert support card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <HandshakeIcon size={20} color={colors.midnight} />
            <Text style={styles.cardTitle}>Hands-on Expert Support</Text>
          </View>
          <Text style={styles.cardBody}>Tealium experts by your side at no extra cost to help design, implement and prove value from your AI use case.</Text>
          <View style={styles.checkList}>
            {['Design your use case', 'Optimize its implementation', 'Get your initiative live'].map(item => (
              <View key={item} style={styles.checkRow}>
                <View style={styles.checkIconSmall}><CheckIcon size={11} color="#fff" /></View>
                <Text style={styles.checkTextSmall}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Who is it for */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <PeopleIcon size={20} color={colors.midnight} />
            <Text style={styles.cardTitle}>Who is this for?</Text>
          </View>
          {[
            'Existing and new Tealium customers',
            'Teams looking to prove value from AI quickly',
            'Organizations with a data cloud or AI investment',
          ].map(item => (
            <View key={item} style={styles.checkRow}>
              <View style={styles.checkIconSmall}><CheckIcon size={11} color="#fff" /></View>
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
          <StarIcon size={18} color="#fff" />
          <Text style={styles.ctaBtnText}>I'm Interested</Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff3cd', borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: '#ffc107',
  },
  badgeText: { fontSize: 12, fontFamily: fonts.bold, color: '#856404' },
  title: { fontSize: 29, fontFamily: fonts.extrabold, color: colors.midnight, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  heroCard: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: { fontSize: 19, fontFamily: fonts.extrabold, color: '#fff' },
  heroDesc: { fontSize: 14, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },
  heroHighlight: { color: colors.teal, fontFamily: fonts.bold },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 20 },

  checkList: { gap: 8, marginTop: 4},
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10},
  checkIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
  },
  checkText: { fontSize: 14, fontFamily: fonts.semibold, color: '#fff', flex: 1 },
  checkIconSmall: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkTextSmall: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, flex: 1 },

  tcs: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  ctaBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  ctaBtnText: { color: '#fff', fontSize: 14, fontFamily: fonts.extrabold, letterSpacing: 0.3 },
});
