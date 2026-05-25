import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  ActivityIndicator, Animated, Easing, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from './supabase';
import { colors, fonts, spacing, radius, shadow } from './theme';
import { BrainIcon, MagnifyIcon, LockIcon, CameraIcon } from './CoffeeIcons';
import {
  trackFunZoneView,
  trackFunZoneQuizTap,
  trackFunZoneLeaderboardViewAll,
  trackFunZoneLeaderboardEmptyTakeQuiz,
  trackFunZoneBeastCameraTap,
  trackFunZoneDisclaimerShown,
  trackFunZoneDisclaimerAccepted,
  trackFunZoneDisclaimerCancelled,
  trackFunZoneObjectScanTap,
  trackFunZonePrizeReveal,
} from './tealium';

import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

const PHOTOBOMB_LIMIT      = 6;
const PHOTOBOMB_COUNT_FILE = FileSystem.documentDirectory + 'photobomb_count';

const PRIZE_COMPLETED_KEY    = 'quiz_prize_completed';
const BEAST_REVEALED_KEY     = 'quiz_prize_revealed_beast';
const SCAN_REVEALED_KEY      = 'quiz_prize_revealed_scan';
const BEAST_DISCLAIMER_KEY   = 'beast_disclaimer_accepted';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Fireworks ────────────────────────────────────────────────────────────────

const FW_COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#B2F94B', '#FF9FF3', '#FFA07A', '#FFFFFF',
  '#FF6347', '#00FFFF', '#FF69B4', '#A78BFA',
];

// Four burst origins staggered across the screen
const BURSTS = [
  { cx: SW * 0.50, cy: SH * 0.35, delay: 0   },
  { cx: SW * 0.25, cy: SH * 0.42, delay: 380 },
  { cx: SW * 0.75, cy: SH * 0.30, delay: 700 },
  { cx: SW * 0.55, cy: SH * 0.52, delay: 1050 },
];

function FireworksOverlay({ onDone }) {
  const particles = useRef(
    BURSTS.flatMap(burst =>
      Array.from({ length: 40 }, () => {
        const angle   = Math.random() * Math.PI * 2;
        const speed   = 60 + Math.random() * 180;
        const dur     = 1700 + Math.random() * 600;
        const gravity = 210 + Math.random() * 160;
        const size    = 3 + Math.random() * 8;
        return {
          cx: burst.cx,
          cy: burst.cy,
          x:       new Animated.Value(0),
          y:       new Animated.Value(0),
          opacity: new Animated.Value(0),
          scale:   new Animated.Value(0),
          color:   FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)],
          tx:      Math.cos(angle) * speed,
          ty:      Math.sin(angle) * speed,
          gravity,
          delay:   burst.delay + Math.random() * 160,
          dur,
          size,
        };
      })
    )
  ).current;

  useEffect(() => {
    const anims = particles.map(p =>
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          // X: shoot out with air-resistance deceleration
          Animated.timing(p.x, {
            toValue: p.tx,
            duration: p.dur,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          // Y: two-phase — burst upward/outward, then gravity arc pulls down
          Animated.sequence([
            Animated.timing(p.y, {
              toValue: p.ty * 0.45,
              duration: p.dur * 0.30,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(p.y, {
              toValue: p.ty + p.gravity,
              duration: p.dur * 0.70,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          // Scale: pop then shrink to nothing
          Animated.sequence([
            Animated.timing(p.scale, { toValue: 1.2, duration: 130, useNativeDriver: true }),
            Animated.timing(p.scale, { toValue: 0.2, duration: p.dur - 130, useNativeDriver: true }),
          ]),
          // Opacity: flash in, hold briefly, fade out
          Animated.sequence([
            Animated.timing(p.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.delay(p.dur * 0.38),
            Animated.timing(p.opacity, { toValue: 0, duration: p.dur * 0.57, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    Animated.parallel(anims).start(() => onDone?.());
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.cx - p.size / 2,
            top:  p.cy - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
          }}
        />
      ))}
    </View>
  );
}

// ── Prize tile wrapper ────────────────────────────────────────────────────────

function PrizeTile({ children, completed, overlayOpacity, onReveal }) {
  return (
    <View>
      {children}
      {/* Outer plain View owns pointerEvents — Animated.View alone doesn't forward it reliably */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={completed ? 'box-none' : 'none'}
      >
        <Animated.View style={[styles.prizeOverlay, { opacity: overlayOpacity }]}>
          {completed ? (
            <View style={styles.prizeRevealBox}>
              <Text style={styles.prizeRevealTitle}>You've unlocked a prize!</Text>
              <Text style={styles.prizeRevealSub}>Complete the quiz to reveal hidden features</Text>
              <TouchableOpacity style={styles.prizeRevealBtn} onPress={onReveal} activeOpacity={0.8}>
                <Text style={styles.prizeRevealBtnText}>✨  Click to Reveal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.prizeLockBox}>
              <LockIcon size={40} color="#fff" />
              <Text style={styles.prizeLockTitle}>Prize Hidden</Text>
              <Text style={styles.prizeLockSub}>Complete the quiz{'\n'}to reveal your prize</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function computePoints(score, total, timeSecs, maxSecs = 300) {
  if (!total || !maxSecs) return 0;
  const accuracy = score / total;
  const timeRatio = Math.min(1, (timeSecs || 0) / maxSecs);
  return Math.max(0, Math.round(accuracy * 1000 * (1 - timeRatio)));
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FunZoneScreen() {
  const navigation = useNavigation();

  // Leaderboard
  const [lbEntries,     setLbEntries]     = useState([]);
  const [lbLoading,     setLbLoading]     = useState(true);
  const [quizName,      setQuizName]      = useState('');
  const [scoringMaxSecs, setScoringMaxSecs] = useState(300);

  // Prize
  const [prizeMode,      setPrizeMode]      = useState(false);
  const [quizCompleted,  setQuizCompleted]  = useState(false);
  const [beastRevealed,  setBeastRevealed]  = useState(false);
  const [scanRevealed,   setScanRevealed]   = useState(false);
  const [showFireworks,  setShowFireworks]  = useState(false);
  const [fireworksKey,   setFireworksKey]   = useState(0);

  // Truman Photo Bomb
  const [photoBombCount, setPhotoBombCount] = useState(0);

  // Truman Photo Bomb disclaimer
  const [beastDisclaimerAccepted, setBeastDisclaimerAccepted] = useState(false);
  const [disclaimerVisible,       setDisclaimerVisible]       = useState(false);
  const [disclaimerChecked,       setDisclaimerChecked]       = useState(false);
  const beastOverlayOpacity = useRef(new Animated.Value(1)).current;
  const scanOverlayOpacity  = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;

      trackFunZoneView();

      const load = async () => {
        setLbLoading(true);

        const [{ data: config }, { data: rows }] = await Promise.all([
          supabase.from('quiz_config').select('quiz_name, prize_mode_enabled').eq('id', 'default').single(),
          supabase
            .from('quiz_leaderboard')
            .select('id, player_name, score, total_questions, time_seconds')
            .order('score', { ascending: false })
            .order('time_seconds', { ascending: true })
            .limit(5),
        ]);

        if (!active) return;

        if (config?.quiz_name) setQuizName(config.quiz_name);
        const maxSecs = config?.scoring_max_seconds || 300;
        setScoringMaxSecs(maxSecs);
        const sorted = (rows || []).sort((a, b) =>
          computePoints(b.score, b.total_questions, b.time_seconds, maxSecs) -
          computePoints(a.score, a.total_questions, a.time_seconds, maxSecs)
        );
        setLbEntries(sorted);
        setLbLoading(false);

        const pm = config?.prize_mode_enabled || false;
        setPrizeMode(pm);

        const disclaimerVal = await SecureStore.getItemAsync(BEAST_DISCLAIMER_KEY);
        if (active) setBeastDisclaimerAccepted(disclaimerVal === 'true');

        const countInfo = await FileSystem.getInfoAsync(PHOTOBOMB_COUNT_FILE);
        if (active) {
          const n = countInfo.exists
            ? parseInt(await FileSystem.readAsStringAsync(PHOTOBOMB_COUNT_FILE), 10) || 0
            : 0;
          setPhotoBombCount(n);
        }

        if (pm) {
          const [completed, beastRev, scanRev] = await Promise.all([
            SecureStore.getItemAsync(PRIZE_COMPLETED_KEY),
            SecureStore.getItemAsync(BEAST_REVEALED_KEY),
            SecureStore.getItemAsync(SCAN_REVEALED_KEY),
          ]);
          const isBeastRevealed = beastRev === 'true';
          const isScanRevealed  = scanRev === 'true';
          setQuizCompleted(completed === 'true');
          setBeastRevealed(isBeastRevealed);
          setScanRevealed(isScanRevealed);
          beastOverlayOpacity.setValue(isBeastRevealed ? 0 : 1);
          scanOverlayOpacity.setValue(isScanRevealed ? 0 : 1);
        }
      };

      load();
      return () => { active = false; };
    }, [])
  );

  const handleReveal = (tileId) => {
    trackFunZonePrizeReveal(tileId);
    const opacity     = tileId === 'beast' ? beastOverlayOpacity : scanOverlayOpacity;
    const setRevealed = tileId === 'beast' ? setBeastRevealed : setScanRevealed;
    const key         = tileId === 'beast' ? BEAST_REVEALED_KEY : SCAN_REVEALED_KEY;

    setFireworksKey(k => k + 1);
    setShowFireworks(true);

    Animated.sequence([
      Animated.delay(300),
      Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ]).start(async () => {
      setRevealed(true);
      await SecureStore.setItemAsync(key, 'true');
    });
  };

  const handleFireworksDone = () => {
    setShowFireworks(false);
  };

  const handleBeastPress = () => {
    trackFunZoneBeastCameraTap({ disclaimerAlreadyAccepted: beastDisclaimerAccepted });
    if (!beastDisclaimerAccepted) {
      trackFunZoneDisclaimerShown();
      setDisclaimerChecked(false);
      setDisclaimerVisible(true);
    } else {
      navigation.navigate('BeastCamera');
    }
  };

  const handleDisclaimerAccept = async () => {
    trackFunZoneDisclaimerAccepted();
    await SecureStore.setItemAsync(BEAST_DISCLAIMER_KEY, 'true');
    setBeastDisclaimerAccepted(true);
    setDisclaimerVisible(false);
    navigation.navigate('BeastCamera');
  };

  const showBeastPrize = prizeMode && !beastRevealed;
  const showScanPrize  = prizeMode && !scanRevealed;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fun Zone</Text>
        <Text style={styles.subtitle}>Powered by Tealium + AI</Text>
      </View>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Quiz card */}
        <TouchableOpacity
          style={[styles.card, styles.cardQuiz]}
          activeOpacity={0.88}
          onPress={() => { trackFunZoneQuizTap(); navigation.navigate('Quiz'); }}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardLeft}>
              <View style={[styles.cardBadge, styles.cardBadgeQuiz]}>
                <Text style={styles.cardBadgeText}>QUIZ</Text>
              </View>
              <Text style={styles.cardTitle}>Tealium Trivia</Text>
              <Text style={styles.cardDesc}>
                Test your Tealium platform knowledge. Can you beat the leaderboard?
              </Text>
              <View style={[styles.cta, styles.ctaQuiz]}>
                <Text style={styles.ctaText}>Start Quiz →</Text>
              </View>
            </View>
            <View style={styles.quizIconWrap}>
              <View style={styles.quizIconCircle}>
                <BrainIcon size={40} color="#B2F94B" />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Inline Leaderboard */}
        <View style={styles.lbSection}>
          <View style={styles.lbHeader}>
            <View style={styles.lbHeaderLeft}>
              <Text style={styles.lbTrophy}>🏆</Text>
              <View>
                <Text style={styles.lbTitle}>Leaderboard</Text>
                {!!quizName && <Text style={styles.lbSub}>{quizName}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => { trackFunZoneLeaderboardViewAll(); navigation.navigate('Leaderboard'); }}>
              <Text style={styles.lbViewAll}>View all →</Text>
            </TouchableOpacity>
          </View>

          {lbLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : lbEntries.length === 0 ? (
            <View style={styles.lbEmpty}>
              <Text style={styles.lbEmptyEmoji}>🎯</Text>
              <Text style={styles.lbEmptyText}>No scores yet — be the first to play!</Text>
              <TouchableOpacity
                style={styles.lbEmptyBtn}
                onPress={() => { trackFunZoneLeaderboardEmptyTakeQuiz(); navigation.navigate('Quiz'); }}
              >
                <Text style={styles.lbEmptyBtnText}>Take the Quiz</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.lbList}>
              {lbEntries.map((e, i) => (
                <View key={e.id} style={[styles.lbRow, i > 0 && styles.lbRowBorder]}>
                  <Text style={styles.lbRankText}>{i + 1}</Text>
                  {i < 3 && <Text style={styles.lbMedal}>{['🥇','🥈','🥉'][i]}</Text>}
                  <Text style={styles.lbName} numberOfLines={1}>{e.player_name}</Text>
                  <View style={styles.lbRight}>
                    <View style={styles.lbPtsRow}>
                      <Text style={styles.lbScore}>{computePoints(e.score, e.total_questions, e.time_seconds, scoringMaxSecs)}</Text>
                      <Text style={styles.lbPtsLabel}>pts</Text>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.lbFullBtn}
                onPress={() => { trackFunZoneLeaderboardViewAll(); navigation.navigate('Leaderboard'); }}
              >
                <Text style={styles.lbFullBtnText}>View Full Leaderboard →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Beast Camera card — wrapped when prize mode active */}
        {showBeastPrize ? (
          <PrizeTile
            completed={quizCompleted}
            overlayOpacity={beastOverlayOpacity}
            onReveal={() => handleReveal('beast')}
          >
            <View style={styles.card} pointerEvents="none">
              <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>AI PHOTO</Text>
                  </View>
                  <Text style={styles.cardTitle}>Truman Photo Bomb</Text>
                  <Text style={styles.cardDesc}>
                    Take a photo and our mascot Truman will blend into the scene.
                  </Text>
                </View>
                <Image
                  source={require('./assets/images/truman-approved.png')}
                  style={styles.cardImg}
                  resizeMode="contain"
                />
              </View>
            </View>
          </PrizeTile>
        ) : (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.88}
            onPress={handleBeastPress}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText}>AI PHOTO</Text>
                </View>
                <Text style={styles.cardTitle}>Truman Photo Bomb</Text>
                <Text style={styles.cardDesc}>
                  Take a photo and our mascot Truman will blend into the scene - mimicking your pose and joining the party.
                </Text>
                <View style={styles.photoBombMeta}>
                  <CameraIcon size={13} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.photoBombCounter}>
                    {photoBombCount} / {PHOTOBOMB_LIMIT} photos used
                  </Text>
                </View>
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Open Camera →</Text>
                </View>
              </View>
              <Image
                source={require('./assets/images/truman-approved.png')}
                style={styles.quizIconCircle}
                size={30}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Object Scanner card — wrapped when prize mode active */}
        {showScanPrize ? (
          <PrizeTile
            completed={quizCompleted}
            overlayOpacity={scanOverlayOpacity}
            onReveal={() => handleReveal('scan')}
          >
            <View style={[styles.card, styles.cardScan]} pointerEvents="none">
              <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <View style={[styles.cardBadge, styles.cardBadgeScan]}>
                    <Text style={styles.cardBadgeText}>AI SCAN</Text>
                  </View>
                  <Text style={styles.cardTitle}>Object Identifier</Text>
                  <Text style={styles.cardDesc}>
                    Point your camera at anything - AI will tell you what it is.
                  </Text>
                </View>
                <View style={styles.scanIconWrap}>
                  <View style={styles.scanIconCircle}>
                    <MagnifyIcon size={40} color="#69F0AE" />
                  </View>
                </View>
              </View>
            </View>
          </PrizeTile>
        ) : (
          <TouchableOpacity
            style={[styles.card, styles.cardScan]}
            activeOpacity={0.88}
            onPress={() => { trackFunZoneObjectScanTap(); navigation.navigate('ObjectScan'); }}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={[styles.cardBadge, styles.cardBadgeScan]}>
                  <Text style={styles.cardBadgeText}>AI SCAN</Text>
                </View>
                <Text style={styles.cardTitle}>Object Identifier</Text>
                <Text style={styles.cardDesc}>
                  Point your camera at anything - AI will tell you what it is, share fun facts and describe the scene.
                </Text>
                <View style={[styles.cta, styles.ctaScan]}>
                  <Text style={styles.ctaText}>Open Scanner →</Text>
                </View>
              </View>
              <View style={styles.scanIconWrap}>
                <View style={styles.scanIconCircle}>
                  <MagnifyIcon size={40} color="#B2F94B" />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Bottom blurb */}
        <View style={styles.blurb}>
          <Text style={styles.blurbText}>
            Every interaction here is tracked in real-time via the Tealium PRISM SDK - live data collection in action.
          </Text>
        </View>
      </ScrollView>

      {/* Truman Photo Bomb disclaimer modal */}
      <Modal
        visible={disclaimerVisible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setDisclaimerVisible(false)}
      >
        <SafeAreaView style={styles.disclaimerSafe} edges={['top', 'bottom']}>
          <View style={styles.disclaimerHeader}>
            <TouchableOpacity onPress={() => { trackFunZoneDisclaimerCancelled(); setDisclaimerVisible(false); }}>
              <Text style={styles.disclaimerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.disclaimerTitle}>Privacy Notice</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={styles.disclaimerBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.disclaimerEmoji}>📸</Text>
            <Text style={styles.disclaimerHeading}>Truman Photo Bomb</Text>
            <Text style={styles.disclaimerText}>
              To create your photo, the image you take will be sent to{' '}
              <Text style={styles.disclaimerBold}>Kontext AI</Text> for processing. This is an external
              third-party service.
            </Text>
            <Text style={styles.disclaimerText}>
              Any image data transmitted will be{' '}
              <Text style={styles.disclaimerBold}>automatically purged within 30 days</Text>, unless
              you choose to save the result to your device.
            </Text>
            <Text style={styles.disclaimerText}>
              By proceeding, you consent to your photo being processed externally for the purpose of
              generating this feature.
            </Text>

            <TouchableOpacity
              style={styles.checkRow}
              activeOpacity={0.7}
              onPress={() => setDisclaimerChecked(v => !v)}
            >
              <View style={[styles.checkbox, disclaimerChecked && styles.checkboxChecked]}>
                {disclaimerChecked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I understand my photo will be processed externally by Kontext AI and agree to proceed.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.disclaimerProceedBtn, !disclaimerChecked && styles.disclaimerProceedDisabled]}
              activeOpacity={disclaimerChecked ? 0.8 : 1}
              onPress={disclaimerChecked ? handleDisclaimerAccept : undefined}
            >
              <Text style={styles.disclaimerProceedText}>Continue to Photo Bomb →</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fireworks — rendered above everything */}
      {showFireworks && (
        <FireworksOverlay key={fireworksKey} onDone={handleFireworksDone} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 25, fontFamily: fonts.bold, color: colors.textDark },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },

  body: { padding: spacing.lg, gap: spacing.md },

  card: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl || 20,
    overflow: 'hidden',
    ...shadow.md,
  },
  cardQuiz: { backgroundColor: '#1A237E' },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardLeft: { flex: 1, gap: 8 },

  cardBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.teal,
    borderRadius: 100,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  cardBadgeQuiz: { backgroundColor: '#B2F94B' },
  cardBadgeText: {
    fontSize: 9, fontFamily: fonts.bold, color: colors.midnight,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  cardTitle: { fontSize: 20, fontFamily: fonts.bold, color: '#fff' },
  cardDesc: { fontSize: 13, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.65)', lineHeight: 19 },

  cta: {
    marginTop: 4, alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 100, backgroundColor: colors.teal,
  },
  ctaQuiz: { backgroundColor: '#B2F94B' },
  ctaText: { fontSize: 13, fontFamily: fonts.bold, color: colors.midnight },

  cardScan: { backgroundColor: '#004D40' },
  cardBadgeScan: { backgroundColor: '#69F0AE' },
  ctaScan: { backgroundColor: '#69F0AE' },

  quizIconWrap: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  quizIconCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(178,249,75,0.15)',
    borderWidth: 1, borderColor: 'rgba(178,249,75,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanIconWrap: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  scanIconCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(105,240,174,0.15)',
    borderWidth: 1, borderColor: 'rgba(105,240,174,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardImg: { width: 90, height: 90 },

  photoBombMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  photoBombCounter: {
    fontSize: 11, fontFamily: fonts.semibold,
    color: 'rgba(255,255,255,0.5)',
  },

  // ── Inline Leaderboard ──────────────────────────────────────────────────────
  lbSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl || 20,
    overflow: 'hidden',
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  lbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  lbHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lbTrophy: { fontSize: 22 },
  lbTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textDark },
  lbSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 1 },
  lbViewAll: { fontSize: 13, fontFamily: fonts.semibold, color: colors.primary },

  lbEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  lbEmptyEmoji: { fontSize: 36 },
  lbEmptyText: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' },
  lbEmptyBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 8, paddingHorizontal: 20, marginTop: 4,
  },
  lbEmptyBtnText: { fontSize: 13, fontFamily: fonts.bold, color: '#fff' },

  lbList: { paddingBottom: spacing.sm },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    gap: spacing.sm,
  },
  lbRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  lbRankText: { fontSize: 13, width: 24, textAlign: 'center', fontFamily: fonts.bold, color: colors.textMuted },
  lbMedal: { fontSize: 17 },
  lbName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  lbRight: { alignItems: 'flex-end', gap: 1 },
  lbPtsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  lbScore: { fontSize: 14, fontFamily: fonts.bold, color: colors.primary },
  lbPtsLabel: { fontSize: 9, fontFamily: fonts.semibold, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },

  lbFullBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  lbFullBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },

  // ── Prize overlay ───────────────────────────────────────────────────────────
  prizeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,24,56,0.92)',
    borderRadius: radius.xl || 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  prizeLockBox: { alignItems: 'center', gap: 10 },
  prizeLockTitle: { fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
  prizeLockSub: {
    fontSize: 13, fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 19,
  },

  prizeRevealBox: { alignItems: 'center', gap: 10 },
  prizeGiftEmoji: { fontSize: 44 },
  prizeRevealTitle: { fontSize: 17, fontFamily: fonts.bold, color: '#B2F94B' },
  prizeRevealSub: {
    fontSize: 13, fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 18,
  },
  prizeRevealBtn: {
    marginTop: 6,
    backgroundColor: '#B2F94B',
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  prizeRevealBtnText: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight },

  blurb: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  blurbText: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMid, lineHeight: 18 },

  // ── Disclaimer modal ─────────────────────────────────────────────────────────
  disclaimerSafe: { flex: 1, backgroundColor: colors.background },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  disclaimerCancel: { fontSize: 16, fontFamily: fonts.regular, color: colors.textMid, width: 60 },
  disclaimerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.textDark },

  disclaimerBody: {
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  disclaimerEmoji: { fontSize: 52, marginBottom: 4 },
  disclaimerHeading: {
    fontSize: 22, fontFamily: fonts.bold, color: colors.textDark, textAlign: 'center',
  },
  disclaimerText: {
    fontSize: 14, fontFamily: fonts.regular, color: colors.textMid,
    lineHeight: 22, textAlign: 'center',
  },
  disclaimerBold: { fontFamily: fonts.bold, color: colors.textDark },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontFamily: fonts.bold },
  checkLabel: {
    flex: 1, fontSize: 13, fontFamily: fonts.regular,
    color: colors.textDark, lineHeight: 20,
  },

  disclaimerProceedBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: spacing.sm,
    width: '100%',
  },
  disclaimerProceedDisabled: { opacity: 0.35 },
  disclaimerProceedText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
});
