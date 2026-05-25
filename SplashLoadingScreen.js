import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Easing,
  Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFonts, Montserrat_300Light, Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { colors, fonts } from './theme';

const { width: W, height: H } = Dimensions.get('window');

export default function SplashLoadingScreen() {
  useFonts({ Montserrat_300Light, Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });

  const topFade  = useRef(new Animated.Value(0)).current;
  const topSlide = useRef(new Animated.Value(10)).current;
  const midFade  = useRef(new Animated.Value(0)).current;
  const midSlide = useRef(new Animated.Value(10)).current;
  const botFade  = useRef(new Animated.Value(0)).current;
  const botSlide = useRef(new Animated.Value(10)).current;
  const btmLineFade = useRef(new Animated.Value(0)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const blinkAnim   = useRef(new Animated.Value(1)).current;
  const stream1X    = useRef(new Animated.Value(-W)).current;
  const stream2X    = useRef(new Animated.Value(-W)).current;
  const stream3X    = useRef(new Animated.Value(-W)).current;

  useEffect(() => {
    const riseIn = (fade, slide, duration, delay) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(fade,  { toValue: 1, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ]);

    Animated.parallel([
      riseIn(topFade, topSlide, 700, 100),
      riseIn(midFade, midSlide, 800, 400),
      riseIn(botFade, botSlide, 700, 1100),
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(btmLineFade, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.15, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1,    duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    const animateStream = (anim, duration, delay) => {
      anim.setValue(-W * 0.6);
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: W * 2.2, duration, easing: Easing.linear, useNativeDriver: true }),
        ])
      ).start();
    };
    animateStream(stream1X, 5500, 500);
    animateStream(stream2X, 7000, 2200);
    animateStream(stream3X, 6500, 1400);
  }, []);

  return (
    <View style={styles.container}>
      {/* Corner glow */}
      <View style={styles.cornerGlow} />

      {/* Wave SVG — bottom half */}
      <Svg style={styles.waves} viewBox="0 0 300 260" preserveAspectRatio="none">
        <Path d="M-40 190 Q80 130 200 170 Q280 200 360 140" stroke="#68D8D5" strokeWidth="0.8" fill="none" />
        <Path d="M-40 208 Q80 148 200 188 Q280 218 360 158" stroke="#68D8D5" strokeWidth="0.7" fill="none" />
        <Path d="M-40 226 Q80 166 200 206 Q280 236 360 176" stroke="#68D8D5" strokeWidth="0.5" fill="none" />
        <Path d="M-40 244 Q80 184 200 224 Q280 254 360 194" stroke="#68D8D5" strokeWidth="0.4" fill="none" />
        <Path d="M-40 258 Q80 198 200 238 Q280 268 360 208" stroke="#68D8D5" strokeWidth="0.3" fill="none" />
        <Path d="M-40 175 Q80 115 200 155 Q280 185 360 125" stroke="#006D80" strokeWidth="0.7" fill="none" />
        <Path d="M-40 160 Q80 100 200 140 Q280 170 360 110" stroke="#006D80" strokeWidth="0.5" fill="none" />
      </Svg>

      {/* Streaming data lines */}
      <Animated.View style={[styles.stream, { top: H * 0.28, width: W * 0.52, transform: [{ translateX: stream1X }] }]} />
      <Animated.View style={[styles.stream, { top: H * 0.50, width: W * 0.38, transform: [{ translateX: stream2X }] }]} />
      <Animated.View style={[styles.stream, { top: H * 0.20, width: W * 0.42, transform: [{ translateX: stream3X }] }]} />

      {/* Corner brackets */}
      <View style={[styles.bracket, styles.brTL]} />
      <View style={[styles.bracket, styles.brTR]} />
      <View style={[styles.bracket, styles.brBL]} />
      <View style={[styles.bracket, styles.brBR]} />

      {/* Bottom accent line */}
      <Animated.View style={[styles.btmLine, { opacity: btmLineFade }]} />

      {/* TOP — Tealium logo */}
      <Animated.View style={[styles.topSec, { opacity: topFade, transform: [{ translateY: topSlide }] }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Image
            source={require('./assets/images/Tealium_Logo-White.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* MID — event title + slogan */}
      <Animated.View style={[styles.midSec, { opacity: midFade, transform: [{ translateY: midSlide }] }]}>
        <Text style={styles.eventTitle}>ARCHITECT{'\n'}<Text style={styles.arcWord}>ARC</Text></Text>
        <View style={styles.limeBar} />
        <View style={styles.sloganPill}>
          <Animated.View style={[styles.liveDot, { opacity: blinkAnim }]} />
          <Text style={styles.sloganText}>Real-time data, served.</Text>
        </View>
      </Animated.View>

      {/* BOTTOM — tags + powered by + home bar */}
      <Animated.View style={[styles.botSec, { opacity: botFade, transform: [{ translateY: botSlide }] }]}>
        <View style={styles.tagsRow}>
          <Text style={[styles.tag, styles.tagTeal]}>AI Pairing</Text>
          <Text style={[styles.tag, styles.tagOutline]}>Context Streaming</Text>
        </View>
        <Text style={styles.venueLine}>
          Powered by{'  '}<Text style={styles.prismText}>PRISM</Text>
        </Text>
        <View style={styles.homeBar} />
      </Animated.View>
    </View>
  );
}

const BRACKET_SIZE = 18;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.midnight,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 56,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },

  // Background elements
  cornerGlow: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#006D80',
    opacity: 0.18,
  },
  waves: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '50%',
    opacity: 0.11,
  },
  stream: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#68D8D5',
    opacity: 0.35,
  },
  bracket: {
    position: 'absolute',
    width: BRACKET_SIZE,
    height: BRACKET_SIZE,
    borderColor: '#68D8D5',
    borderStyle: 'solid',
    opacity: 0.3,
  },
  brTL: { top: 56,        left: 24,        borderTopWidth: 1,    borderLeftWidth: 1 },
  brTR: { top: 56,        right: 24,       borderTopWidth: 1,    borderRightWidth: 1 },
  brBL: { bottom: 24,     left: 24,        borderBottomWidth: 1, borderLeftWidth: 1 },
  brBR: { bottom: 24,     right: 24,       borderBottomWidth: 1, borderRightWidth: 1 },
  btmLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#68D8D5',
    opacity: 0.6,
  },

  // TOP section
  topSec: {
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 46,
  },

  // MID section
  midSec: {
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 40,
    fontWeight: '800',
    fontFamily: fonts.extrabold,
    lineHeight: 38,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
  },
  arcWord: {
    color: colors.teal,
  },
  limeBar: {
    width: 36,
    height: 3,
    backgroundColor: '#B2F94B',
    borderRadius: 100,
    marginTop: 14,
    marginBottom: 14,
  },
  sloganPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#006D80',
    borderRadius: 100,
    backgroundColor: 'rgba(0,109,128,0.2)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B2F94B',
  },
  sloganText: {
    fontSize: 11,
    fontFamily: 'Montserrat_300Light',
    fontStyle: 'italic',
    color: '#B0E2E2',
    letterSpacing: 0.2,
  },

  // BOTTOM section
  botSec: {
    alignItems: 'center',
    gap: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 100,
    overflow: 'hidden',
  },
  tagTeal: {
    color: colors.midnight,
    backgroundColor: colors.teal,
  },
  tagOutline: {
    color: colors.teal,
    borderWidth: 1,
    borderColor: '#006D80',
  },
  venueLine: {
    fontSize: 9,
    fontFamily: fonts.regular,
    letterSpacing: 2,
    color: colors.teal,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  prismText: {
    fontFamily: fonts.bold,
    color: '#B2F94B',
    letterSpacing: 3,
    opacity: 1,
  },
  homeBar: {
    width: '28%',
    height: 3,
    backgroundColor: '#006D80',
    borderRadius: 100,
    opacity: 0.5,
  },
});
