import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './AppContext';
import { colors, spacing, radius, fonts } from './theme';
import { track } from './tealium';
import { HandshakeIcon, PeopleIcon, ClockIcon, StarIcon, CheckIcon, AgendaIcon, ShieldIcon } from './CoffeeIcons';

const AI_URL  = 'https://tealium.com/ai-accelerator/?utm_source=Architect_Arc_Coffee_app';
const EDU_URL = 'https://university.tealium.com/learn';

export default function OffersScreen() {
  const { state } = useApp();
  const profile = state.profile;

  const scrollRef = useRef(null);
  const [activeTab, setActiveTab] = useState('ai');
  const sectionY = useRef({ ai: 0, edu: 0 });

  const handleScroll = useCallback(({ nativeEvent }) => {
    const y = nativeEvent.contentOffset.y;
    setActiveTab(y >= sectionY.current.edu - 80 ? 'edu' : 'ai');
  }, []);

  const scrollToSection = (section) => {
    scrollRef.current?.scrollTo({ y: sectionY.current[section], animated: true });
    setActiveTab(section);
  };

  const handleInterested = () => {
    track('offer_cta_clicked', {
      tealium_event: 'offer_cta_clicked',
      offer_name: 'AI Accelerator',
      offer_url: AI_URL,
      button_text: "I'm Interested",
      customer_name: profile?.name || '',
      customer_email: profile?.email || '',
    });
    Linking.openURL(AI_URL);
  };

  const handleExploreCourses = () => {
    track('offer_cta_clicked_education', {
      tealium_event: 'offer_cta_clicked_education',
      offer_name: 'Education',
      offer_url: EDU_URL,
      button_text: 'Explore Courses',
      customer_name: profile?.name || '',
      customer_email: profile?.email || '',
    });
    Linking.openURL(EDU_URL);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>

      {/* ── Sticky tab bar ── */}
      <View style={styles.tabBar}>
        {[
          { key: 'ai',  label: 'AI Accelerator' },
          { key: 'edu', label: 'Education' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => scrollToSection(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* ══════════════════════════════════════════
            SECTION 1 — AI Accelerator
        ══════════════════════════════════════════ */}
        <View onLayout={e => { sectionY.current.ai = e.nativeEvent.layout.y; }}>

          <View style={styles.header}>
            <View style={styles.badge}>
              <ClockIcon size={16} color="#856404" />
              <Text style={styles.badgeText}>Limited-time offer</Text>
            </View>
            <Text style={styles.title}>AI Accelerator</Text>
            <Text style={styles.subtitle}>Jump‑start your next AI initiative with Tealium</Text>
          </View>

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

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <HandshakeIcon size={20} color={colors.midnight} />
              <Text style={styles.cardTitle}>Hands-on Expert Support</Text>
            </View>
            <Text style={styles.cardBody}>
              Tealium experts by your side at no extra cost to help design, implement and prove value from your AI use case.
            </Text>
            <View style={styles.checkList}>
              {['Design your use case', 'Optimize its implementation', 'Get your initiative live'].map(item => (
                <View key={item} style={styles.checkRow}>
                  <View style={styles.checkIconSmall}><CheckIcon size={11} color="#fff" /></View>
                  <Text style={styles.checkTextSmall}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

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

          <Text style={styles.tcs}>
            Eligibility criteria applies. Full details will be agreed with your Tealium account team.
          </Text>

          <TouchableOpacity style={styles.ctaBtn} onPress={handleInterested} activeOpacity={0.85}>
            <StarIcon size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>I'm Interested</Text>
          </TouchableOpacity>

        </View>

        {/* Section divider */}
        <View style={styles.sectionDivider} />

        {/* ══════════════════════════════════════════
            SECTION 2 — Education
        ══════════════════════════════════════════ */}
        <View onLayout={e => { sectionY.current.edu = e.nativeEvent.layout.y; }}>

          <View style={styles.header}>
            <View style={[styles.badge, styles.badgeEdu]}>
              <Text style={[styles.badgeText, styles.badgeEduText]}>Free self-paced learning</Text>
            </View>
            <Text style={styles.title}>Tealium Education</Text>
            <Text style={styles.subtitle}>
              Courses designed to help you become a certified Tealium expert
            </Text>
          </View>

          <View style={[styles.heroCard, styles.heroCardEdu]}>
            <Text style={styles.heroTitle}>Learn Your Way</Text>
            <Text style={styles.heroDesc}>
              Training available across multiple formats, languages, levels, and regional schedules to fit how you work.
            </Text>
            <View style={styles.checkList}>
              {[
                'In-Person Instructor-Led',
                'Virtual Instructor-Led',
                'Self-Paced eLearning - free, 24/7',
              ].map(item => (
                <View key={item} style={styles.checkRow}>
                  <View style={[styles.checkIcon, styles.checkIconEdu]}><CheckIcon size={14} color="#fff" /></View>
                  <Text style={styles.checkText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <AgendaIcon size={20} color={colors.midnight} />
              <Text style={styles.cardTitle}>Course Types</Text>
            </View>
            <Text style={styles.cardBody}>
              Whatever your level, there's a learning path built for you.
            </Text>
            <View style={styles.checkList}>
              {[
                'Overview - platform features & functionality',
                'Core Product - deep dives with certification paths',
                'Specialty - targeted advanced training',
                'Custom Classes - tailored group instruction',
              ].map(item => (
                <View key={item} style={styles.checkRow}>
                  <View style={styles.checkIconSmall}><CheckIcon size={11} color="#fff" /></View>
                  <Text style={styles.checkTextSmall}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <ShieldIcon size={20} color={colors.midnight} />
              <Text style={styles.cardTitle}>Get Certified</Text>
            </View>
            <Text style={styles.cardBody}>
              Product certifications are valid for 2 years and demonstrate applied expertise through structured courses, rigorous exams, and real-world practical assessments.
            </Text>
            <View style={styles.checkList}>
              {[
                'Structured courses per product',
                'Rigorous knowledge exams',
                'Hands-on practical assessments',
              ].map(item => (
                <View key={item} style={styles.checkRow}>
                  <View style={styles.checkIconSmall}><CheckIcon size={11} color="#fff" /></View>
                  <Text style={styles.checkTextSmall}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.tcs}>
            Self-paced eLearning is free and available 24/7 at university.tealium.com
          </Text>

          <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnEdu]} onPress={handleExploreCourses} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>Explore Courses →</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // ── Tab bar ────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },

  // ── Shared layout ──────────────────────────────────────────────────────────
  content: { padding: spacing.lg, gap: 20 },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  header: { alignItems: 'center', paddingVertical: spacing.lg, gap: 8 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff3cd', borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: '#ffc107',
  },
  badgeText: { fontSize: 12, fontFamily: fonts.bold, color: '#856404' },
  badgeEdu: { backgroundColor: '#e8f5f6', borderColor: colors.teal },
  badgeEduText: { color: '#00707A' },

  title: { fontSize: 29, fontFamily: fonts.extrabold, color: colors.midnight, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, color: '#4a6070', textAlign: 'center', lineHeight: 22 },

  // ── Hero cards ─────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg + 8,
    gap: spacing.sm,
    marginVertical: 4,
  },
  heroCardEdu: { backgroundColor: '#004D56' },
  heroTitle: { fontSize: 19, fontFamily: fonts.extrabold, color: '#fff' },
  heroDesc: { fontSize: 14, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },
  heroHighlight: { color: colors.teal, fontFamily: fonts.bold },

  // ── White cards ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg + 8,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginVertical: 4,
  },
  cardTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { fontSize: 12, fontFamily: fonts.regular, color: '#3a5260', lineHeight: 20 },

  // ── Check lists ────────────────────────────────────────────────────────────
  checkList: { gap: 8, marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
  },
  checkIconEdu: { backgroundColor: '#00A0AA' },
  checkText: { fontSize: 14, fontFamily: fonts.semibold, color: '#fff', flex: 1 },
  checkIconSmall: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkTextSmall: { fontSize: 12, fontFamily: fonts.regular, color: '#3a5260', flex: 1 },

  // ── T&Cs + CTAs ────────────────────────────────────────────────────────────
  tcs: { fontSize: 11, fontFamily: fonts.regular, color: '#4a6070', textAlign: 'center', lineHeight: 18 },
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
  ctaBtnEdu: { backgroundColor: '#00707A' },
  ctaBtnText: { color: '#fff', fontSize: 14, fontFamily: fonts.extrabold, letterSpacing: 0.3 },
});
