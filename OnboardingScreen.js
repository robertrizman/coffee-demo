import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, Linking,
} from 'react-native';
import { saveProfile } from './userProfile';
import { colors, typography, spacing, radius, shadow } from './theme';
import { TakeawayCupIcon, UserIcon, LockIcon, EmailIcon } from './CoffeeIcons';
import { trackCustomerRegistration } from './tealium';

export default function OnboardingScreen({ onComplete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Please enter your name';
    if (!email.trim()) e.email = 'Please enter your email';
    else if (!email.includes('@') || !email.includes('.')) e.email = 'Please enter a valid email';
    if (!consentAccepted) e.consent = 'Please accept the privacy policy to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setSaving(true);
    const profile = { name: name.trim(), email: email.trim().toLowerCase() };
    await saveProfile(profile);
    setSaving(false);
    trackCustomerRegistration(profile);
    onComplete(profile);
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://tealium.com/privacy/');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <TakeawayCupIcon size={36} color="#fff" />
            </View>
            <Text style={styles.appName}>Coffee Ordering App</Text>
            <Text style={styles.tagline}>Order your favourite coffee courtesy of Tealium Arc.</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome!</Text>
            <Text style={styles.cardSubtitle}>
              Tell us your name and email so we can track your orders and let you know when they're ready.
            </Text>

            <Text style={styles.fieldLabel}>YOUR NAME</Text>
            <View style={[styles.inputRow, errors.name && styles.inputRowError]}>
              <UserIcon size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: null })); }}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

            <Text style={styles.fieldLabel}>YOUR EMAIL</Text>
            <View style={[styles.inputRow, errors.email && styles.inputRowError]}>
              <EmailIcon size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: null })); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

            <Text style={styles.privacyNote}>
              🔒 Your details are stored only on this device and used to track your orders. We don't share them with anyone.
            </Text>

            {/* Privacy Policy Consent */}
            <TouchableOpacity 
              style={[styles.consentRow, errors.consent && styles.consentRowError]}
              onPress={() => {
                setConsentAccepted(!consentAccepted);
                setErrors((e) => ({ ...e, consent: null }));
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
                {consentAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>
                I agree to Tealium's{' '}
                <Text 
                  style={styles.privacyLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    openPrivacyPolicy();
                  }}
                >
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>
            {errors.consent && <Text style={styles.errorText}>{errors.consent}</Text>}

            <TouchableOpacity
              style={[styles.continueBtn, (saving || !consentAccepted) && styles.continueBtnDisabled]}
              onPress={handleContinue}
              disabled={saving || !consentAccepted}
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>
                {saving ? 'Saving...' : 'Start ordering →'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },

  logoArea: { alignItems: 'center', gap: spacing.sm },
  logoCircle: {
    width: 80, height: 80, borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoEmoji: { fontSize: 36 },
  appName: { ...typography.heading1, fontSize: 30 },
  tagline: { ...typography.subtitle },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.card,
  },
  cardTitle: { ...typography.heading2 },
  cardSubtitle: { ...typography.caption, lineHeight: 20, marginTop: -4 },

  fieldLabel: { ...typography.label, marginBottom: -4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputRowError: { borderColor: '#c0392b' },
  inputIcon: { fontSize: 16, marginRight: spacing.sm, color: colors.textMuted },
  input: { flex: 1, height: 52, fontSize: 16, color: colors.textDark },
  errorText: { fontSize: 13, color: '#c0392b', marginTop: -8 },

  privacyNote: {
    fontSize: 12, color: colors.textMuted, lineHeight: 18,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md, borderRadius: radius.md,
  },

  // Consent checkbox
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  consentRowError: { borderColor: '#c0392b' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  consentText: {
    flex: 1,
    fontSize: 14,
    color: colors.textDark,
    lineHeight: 20,
  },
  privacyLink: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  continueBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm,
  },
  continueBtnDisabled: { opacity: 0.5 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});