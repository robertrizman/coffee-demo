import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, Linking, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { saveProfile } from './userProfile';
import { supabase } from './supabase';
import { colors, typography, spacing, radius, shadow } from './theme';
import { TakeawayCupIcon, UserIcon, LockIcon, EmailIcon } from './CoffeeIcons';
import { trackCustomerRegistration } from './tealium';

export default function OnboardingScreen({ onComplete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('arc_locations')
        .select('*')
        .order('venue_name', { ascending: true });
      setLocations(data || []);
    } catch (err) {
      console.warn('[Onboarding] Failed to load locations:', err.message);
    }
    setLoadingLocations(false);
  };

  const isLocationActive = (loc) => {
    if (!loc.enabled) return false;
    const today = new Date();
    if (loc.start_date && new Date(loc.start_date) > today) return false;
    if (loc.end_date && new Date(loc.end_date) < today) return false;
    return true;
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Please enter your name';
    if (!email.trim()) e.email = 'Please enter your email';
    else if (!email.includes('@') || !email.includes('.')) e.email = 'Please enter a valid email';
    if (!consentAccepted) e.consent = 'Please accept the privacy policy to continue';
    if (!selectedLocation) e.location = 'Please select your Arc location';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setSaving(true);
    const profile = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      arc_location_id: selectedLocation?.id || null,
      arc_location_name: selectedLocation ? `${selectedLocation.venue_name}, ${selectedLocation.state}` : null,
    };
    await saveProfile(profile);
    setSaving(false);
    trackCustomerRegistration(profile);
    onComplete(profile);
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://tealium.com/privacy/');
  };

  return (
    <>
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

            {/* Arc Location */}
            <Text style={styles.fieldLabel}>ARC LOCATION</Text>
            <TouchableOpacity
              style={[styles.locationPicker, errors.location && styles.inputRowError]}
              onPress={() => setLocationPickerVisible(true)}
              activeOpacity={0.7}
            >
              {loadingLocations ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : selectedLocation ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationPickerSelected}>{selectedLocation.venue_name}</Text>
                  <Text style={styles.locationPickerSub}>{selectedLocation.address}, {selectedLocation.state}</Text>
                </View>
              ) : (
                <Text style={styles.locationPickerPlaceholder}>Select your Arc location</Text>
              )}
              <Text style={styles.locationPickerChevron}>›</Text>
            </TouchableOpacity>
            {errors.location && <Text style={styles.errorText}>{errors.location}</Text>}

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

    {/* Location Picker Modal */}
    <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>📍 Select Arc Location</Text>
          <TouchableOpacity onPress={() => setLocationPickerVisible(false)} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={locations}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
              No locations available
            </Text>
          }
          renderItem={({ item }) => {
            const active = isLocationActive(item);
            const isSelected = selectedLocation?.id === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.locationItem,
                  isSelected && styles.locationItemSelected,
                  !active && styles.locationItemDisabled,
                ]}
                onPress={() => {
                  if (!active) return;
                  setSelectedLocation(item);
                  setErrors(e => ({ ...e, location: null }));
                  setLocationPickerVisible(false);
                }}
                activeOpacity={active ? 0.7 : 1}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={[styles.locationItemName, !active && styles.locationItemNameDisabled]}>
                      {item.venue_name}
                    </Text>
                    {!active && (
                      <View style={styles.locationBadgeInactive}>
                        <Text style={styles.locationBadgeInactiveText}>Unavailable</Text>
                      </View>
                    )}
                    {active && (
                      <View style={styles.locationBadgeActive}>
                        <Text style={styles.locationBadgeActiveText}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.locationItemAddress, !active && { opacity: 0.4 }]}>
                    {item.address}, {item.state}
                  </Text>
                  {item.start_date && (
                    <Text style={styles.locationItemDates}>
                      {new Date(item.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {item.end_date ? ` – ${new Date(item.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </Text>
                  )}
                </View>
                {isSelected && <Text style={styles.locationItemCheck}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
    </>
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

  locationPicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 52,
  },
  locationPickerSelected: { fontSize: 15, fontWeight: '600', color: colors.textDark },
  locationPickerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationPickerPlaceholder: { flex: 1, fontSize: 15, color: colors.textMuted },
  locationPickerChevron: { fontSize: 22, color: colors.textMuted, marginLeft: spacing.sm },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { ...typography.heading3 },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, color: colors.textDark, fontWeight: '600' },
  locationItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight,
  },
  locationItemSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight + '22' },
  locationItemDisabled: { opacity: 0.5 },
  locationItemName: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  locationItemNameDisabled: { color: colors.textMuted },
  locationItemAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  locationItemDates: { fontSize: 11, color: colors.teal, marginTop: 3, fontWeight: '600' },
  locationItemCheck: { fontSize: 18, color: colors.primary, fontWeight: '700', marginLeft: spacing.sm },
  locationBadgeActive: {
    backgroundColor: '#dcfce7', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  locationBadgeActiveText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  locationBadgeInactive: {
    backgroundColor: '#f1f5f9', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  locationBadgeInactiveText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
});