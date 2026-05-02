import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import { colors, typography, spacing, radius, shadow, fonts } from './theme';
import { UserIcon, LockIcon } from './CoffeeIcons';

function EyeIcon({ size = 18, color = '#006D80' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
    </Svg>
  );
}

function EyeOffIcon({ size = 18, color = '#006D80' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M1 1l22 22" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </Svg>
  );
}

export default function LoginScreen() {
  const { login, authError, authLoading, setAuthError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setAuthError('');
    await login(username.trim(), password);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Svg viewBox="0 0 99 23.8" width={88} height={42} fill="#fff">
                <Path d="m3.82,8.22c-.02-1-.51-1.81-1.09-1.8-.58.01-1.04.83-1.02,1.84.02,1,.51,1.8,1.09,1.79.58-.01,1.04-.83,1.02-1.83Z"/>
                <Path d="m1.72,5.51c-.02-.89-.41-1.61-.89-1.6C.36,3.92-.02,4.65,0,5.55c.02.89.42,1.61.89,1.6.47,0,.85-.74.83-1.63Z"/>
                <Path d="m8.72,5.19c.9.27,1.33,1.51.96,2.79-.37,1.28-1.41,2.1-2.31,1.84-.91-.27-1.33-1.51-.97-2.79.38-1.28,1.42-2.1,2.32-1.84Z"/>
                <Path d="m5.45,2.25c.71.19,1.04,1.28.72,2.42-.31,1.14-1.14,1.91-1.85,1.72-.71-.19-1.03-1.27-.72-2.42.31-1.14,1.15-1.91,1.85-1.71Z"/>
                <Path d="m2.97,0c.5.11.71,1.07.48,2.16-.23,1.09-.82,1.89-1.32,1.78-.49-.1-.71-1.07-.48-2.16C1.89.7,2.48-.09,2.97,0Z"/>
                <Path d="m6.3,11.95c-.02,1.13-.67,2.04-1.46,2.03-.78-.01-1.4-.95-1.38-2.08.02-1.14.67-2.05,1.46-2.03.78.01,1.4.95,1.38,2.08Z"/>
                <Path d="m3.82,15.58c-.02,1-.51,1.81-1.09,1.8-.58-.01-1.04-.83-1.02-1.84.02-1,.51-1.8,1.09-1.79.58.01,1.04.83,1.02,1.83Z"/>
                <Path d="m1.72,18.28c-.02.89-.41,1.61-.89,1.6-.47,0-.85-.74-.83-1.63.02-.89.42-1.61.89-1.6.47,0,.85.74.83,1.63Z"/>
                <Path d="m14.54,11.95c-.03,1.42-1.2,2.55-2.62,2.53-1.42-.03-2.55-1.2-2.53-2.62.03-1.42,1.2-2.55,2.62-2.53,1.42.03,2.55,1.2,2.53,2.62Z"/>
                <Path d="m8.72,18.6c.9-.27,1.33-1.51.96-2.79-.37-1.28-1.41-2.1-2.31-1.84-.91.27-1.33,1.51-.97,2.79.38,1.28,1.42,2.1,2.32,1.84Z"/>
                <Path d="m5.45,21.54c.71-.19,1.04-1.28.72-2.42-.31-1.14-1.14-1.91-1.85-1.72-.71.19-1.03,1.27-.72,2.42.31,1.14,1.15,1.91,1.85,1.71Z"/>
                <Path d="m2.97,23.79c.5-.11.71-1.07.48-2.16-.23-1.09-.82-1.89-1.32-1.78-.49.1-.71,1.07-.48,2.16.23,1.09.82,1.88,1.32,1.78Z"/>
                <Path d="m28.48,9.02h-4.13v7.11h-2.3v-7.11h-4.08v-1.89h10.51v1.89Z"/>
                <Path d="m39.59,16.13h-8.92V7.12h8.92v1.89h-6.62v1.71h5.84v1.79h-5.84v1.78h6.62v1.82Z"/>
                <Path d="m53.34,16.13h-2.45l-.88-1.82h-5.48l-.91,1.82h-2.38l4.61-9.01h2.85l4.64,9.01Zm-4.15-3.49l-1.9-3.62-1.92,3.62h3.82Z"/>
                <Path d="m62.92,16.13h-8.14V7.12h2.3v7.02h5.85v1.99Z"/>
                <Path d="m67.11,16.13h-2.3V7.12h2.3v9.01Z"/>
                <Path d="m80.4,12.36c0,2.98-1.4,3.92-5.53,3.92s-5.4-.8-5.4-3.92v-5.24h2.25v5.09c0,1.91,1.1,2.11,3.16,2.11,1.93,0,3.27-.34,3.27-2.11v-5.09h2.26v5.24Z"/>
                <Path d="m97.12,16.13h-2.45l-1.11-7-2.81,7h-2.61l-2.75-7-1.13,7h-2.37l1.58-9.01h3.41l2.55,6.6,2.71-6.6h3.38l1.61,9.01Z"/>
              </Svg>
            </View>
            <Text style={styles.appName}>Architect Arc</Text>
            <Text style={styles.tagline}>Admin/Barista Sign In</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardSubtitle}>Barista & operator access</Text>

            <Text style={styles.fieldLabel}>USERNAME</Text>
            <View style={styles.inputRow}>
              <UserIcon size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!authLoading}
              />
            </View>

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.inputRow}>
              <LockIcon size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!authLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.6}
              >
                {showPassword
                  ? <EyeOffIcon size={18} color={colors.textMuted} />
                  : <EyeIcon size={18} color={colors.textMuted} />
                }
              </TouchableOpacity>
            </View>

            {authError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{authError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.loginBtn, (authLoading || !username || !password) && styles.loginBtnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={authLoading || !username || !password}
            >
              {authLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.loginBtnText}>Sign in →</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            This area is for barista staff only.{'\n'}Customers can order via the Order tab.
          </Text>

          <View style={styles.aboutSection}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutText}>
              This is a demonstration app built for Tealium event tracking and analytics purposes. It is not intended for commercial use, resale. All data collected is used solely for Tealium platform demonstration purposes.
            </Text>
            <Text style={styles.aboutVersion}>Architect Arc · Powered by Tealium PRISM SDK</Text>
            <Text style={styles.buildVersion}>
              v{Constants.expoConfig?.version ?? '—'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.xl },
  logoArea: { alignItems: 'center', gap: spacing.sm },
  logoCircle: {
    width: 160, height: 56, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  appName: { ...typography.heading1, fontSize: 27 },
  tagline: { ...typography.subtitle },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadow.card,
  },
  cardTitle: { ...typography.heading2, fontFamily: fonts.bold },
  cardSubtitle: { ...typography.caption, marginTop: -8 },
  fieldLabel: { ...typography.label, marginBottom: -8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  input: { flex: 1, height: 48, fontSize: 15, color: colors.textDark },
  eyeBtn: { padding: 6 },
  errorBox: {
    backgroundColor: '#fef0ee', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#f0c0b8',
  },
  errorText: { fontSize: 13, color: '#c0392b', fontFamily: fonts.semibold },
  loginBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  loginBtnDisabled: { opacity: 0.4 },
  loginBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold, letterSpacing: 0.3 },
  hint: { ...typography.caption, textAlign: 'center', color: colors.textMuted, lineHeight: 20 },
  aboutSection: {
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    paddingTop: spacing.md, gap: spacing.xs, alignItems: 'center',
  },
  aboutTitle: { fontSize: 9, fontFamily: fonts.bold, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  aboutText: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 16, opacity: 0.8 },
  aboutVersion: { fontSize: 9, color: colors.teal, fontFamily: fonts.semibold, letterSpacing: 0.5, marginTop: 20 },
  buildVersion: { fontSize: 13, color: colors.textMuted, opacity: 0.5, marginTop: 5, fontWeight:'bold' },
});