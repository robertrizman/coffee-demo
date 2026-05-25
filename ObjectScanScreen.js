/**
 * ObjectScanScreen
 *
 * On-device detection: @tensorflow/tfjs-react-native + @tensorflow-models/coco-ssd
 *   → uses CoreML delegate on iOS (Apple Neural Engine)
 *   → uses TFLite + NNAPI on Android (hardware accelerators)
 *   → graceful fallback to GPT-only if model isn't loaded yet
 *
 * Required installs (then rebuild):
 *   npx expo install expo-gl
 *   npm install @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow-models/coco-ssd
 *   npx expo run:ios
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Dimensions, Animated, Easing, Platform, NativeModules,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, spacing, radius } from './theme';

// ── Native on-device classifier ───────────────────────────────────────────────
// iOS: VNClassifyImageRequest → Apple Neural Engine (A12+)
// Android: ML Kit Image Labeling → NNAPI/NPU (Snapdragon, Tensor, Dimensity)
// Android devices without NPU: module resolves null → JS falls back to GPT-4o-mini
const { ObjectClassifierModule } = NativeModules;

const { width: W, height: H } = Dimensions.get('window');
const PHOTO_W = W - spacing.lg * 2;
const PHOTO_H = PHOTO_W * 0.75;
const BOX_COLOR = '#69F0AE';
const CORNER_DIM = 20;
const CORNER_BORDER = 3;

const PERSON_TERMS = [
  'person', 'human', 'man', 'woman', 'face', 'people',
  'child', 'girl', 'boy', 'portrait', 'selfie', 'individual',
];
function looksLikePerson(name = '') {
  const l = name.toLowerCase();
  return PERSON_TERMS.some(t => l.includes(t));
}

// ── On-device detection — available when native module is registered ──────────
const nativeClassifierAvailable = !!ObjectClassifierModule;

async function runOnDevice(uri) {
  if (!nativeClassifierAvailable) return null;
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  // Returns { label, confidence, isPerson, engine } or null
  return await ObjectClassifierModule.classify(b64);
}

// ── OpenAI key ────────────────────────────────────────────────────────────────
async function getOpenAIKey() {
  try {
    const { supabase } = require('./supabase');
    const { data } = await supabase
      .from('menu_config').select('description')
      .eq('category', '_config').eq('name', 'openai_key').single();
    return data?.description || null;
  } catch { return null; }
}

// ── GPT enrichment ────────────────────────────────────────────────────────────
// When on-device gives us a label, GPT only needs to enrich (no identification).
// When on-device fails, GPT does full identification + bbox.
async function fetchGPTData(uri, detectedLabel, apiKey) {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const needsBbox = !detectedLabel;

  const prompt = detectedLabel
    ? `The device identified this as "${detectedLabel}". Provide rich info. Return ONLY valid JSON — no markdown:\n` +
      '{"emoji":"...","tagline":"...","description":"...","facts":["...","...","..."],"others":["...","..."]}\n' +
      '- tagline: punchy, max 12 words\n' +
      '- description: 2–3 engaging sentences\n' +
      '- facts: exactly 3 interesting facts\n' +
      '- others: up to 3 other notable items visible'
    : 'Identify the main non-human object. Return ONLY valid JSON — no markdown:\n' +
      '{"name":"...","emoji":"...","tagline":"...","description":"...","facts":["...","...","..."],' +
      '"bbox":{"x":0.0,"y":0.0,"w":1.0,"h":1.0},"others":["...","..."]}\n' +
      '- tagline: punchy, max 12 words\n' +
      '- bbox: normalized 0–1 around the primary object\n' +
      '- others: up to 3 other items visible';

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: detectedLabel ? 450 : 700,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: needsBbox ? 'high' : 'low' } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const json = await resp.json();
  const raw = json.choices[0].message.content.trim();
  const clean = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}

// ── Tealium quips ─────────────────────────────────────────────────────────────
const TEALIUM_QUIPS = {
  hand: [
    "Hands like these are basically the ultimate Tealium use case machine. Just saying.",
    "Fun fact: the hand holding this phone is already generating a live Tealium use case. Meta.",
    "Whoever owns this hand clearly has great taste — and probably builds killer Tealium use cases.",
  ],
  laptop: [
    "Spotted a laptop? That's basically a Tealium use case factory. Treat it well.",
    "Laptops and Tealium go together like data and decisions. Coincidence? We think not.",
    "If there's a laptop in the room, there's someone who can build a Tealium use case. We see you.",
  ],
  phone: [
    "A phone in the wild — and somewhere, a Tealium use case is being born.",
    "Mobile moments are Tealium's playground. You're already in it.",
  ],
};

function getTealiumQuip(name = '') {
  const l = name.toLowerCase();
  if (['hand', 'finger', 'palm', 'fist', 'wrist', 'thumb'].some(t => l.includes(t)))
    return TEALIUM_QUIPS.hand[Math.floor(Math.random() * TEALIUM_QUIPS.hand.length)];
  if (['laptop', 'computer', 'macbook', 'notebook', 'keyboard', 'monitor', 'screen'].some(t => l.includes(t)))
    return TEALIUM_QUIPS.laptop[Math.floor(Math.random() * TEALIUM_QUIPS.laptop.length)];
  if (['phone', 'mobile', 'smartphone', 'iphone', 'android'].some(t => l.includes(t)))
    return TEALIUM_QUIPS.phone[Math.floor(Math.random() * TEALIUM_QUIPS.phone.length)];
  return null;
}

// ── Bbox math (resizeMode="contain") ─────────────────────────────────────────
function computeBoxRect(bbox, photoW, photoH) {
  const scale = Math.min(PHOTO_W / photoW, PHOTO_H / photoH);
  const rW = photoW * scale;
  const rH = photoH * scale;
  const ox = (PHOTO_W - rW) / 2;
  const oy = (PHOTO_H - rH) / 2;
  return {
    left: ox + bbox.x * rW,
    top: oy + bbox.y * rH,
    width: bbox.w * rW,
    height: bbox.h * rH,
  };
}

// ── BboxOverlay ───────────────────────────────────────────────────────────────
function BboxOverlay({ bbox, photoW, photoH, opacity }) {
  if (!bbox || !photoW || !photoH) return null;
  const r = computeBoxRect(bbox, photoW, photoH);
  const corners = [
    { top: r.top,                  left: r.left,                  borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER },
    { top: r.top,                  left: r.left + r.width - CORNER_DIM, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER },
    { top: r.top + r.height - CORNER_DIM, left: r.left,           borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER },
    { top: r.top + r.height - CORNER_DIM, left: r.left + r.width - CORNER_DIM, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER },
  ];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <View style={{
        position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height,
        backgroundColor: `${BOX_COLOR}16`,
      }} />
      {corners.map((s, i) => (
        <View key={i} style={[{ position: 'absolute', width: CORNER_DIM, height: CORNER_DIM, borderColor: BOX_COLOR }, s]} />
      ))}
    </Animated.View>
  );
}

// ── Decorative ScannerViewfinder (no API calls, purely animated) ──────────────
function ScannerViewfinder() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    return () => { pulse.stopAnimation(); };
  }, []);

  const VF = 210;
  const B = 28;
  const T = 2.5;
  const bStyle = { position: 'absolute', width: B, height: B, borderColor: BOX_COLOR };

  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      <Animated.View style={{ width: VF, height: VF, transform: [{ scale: pulse }] }}>
        <View style={[bStyle, { top: 0, left: 0,  borderTopWidth: T,    borderLeftWidth: T    }]} />
        <View style={[bStyle, { top: 0, right: 0, borderTopWidth: T,    borderRightWidth: T   }]} />
        <View style={[bStyle, { bottom: 0, left: 0,  borderBottomWidth: T, borderLeftWidth: T    }]} />
        <View style={[bStyle, { bottom: 0, right: 0, borderBottomWidth: T, borderRightWidth: T   }]} />
      </Animated.View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ObjectScanScreen() {
  const navigation = useNavigation();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');

  const [phase, setPhase] = useState('camera'); // camera | scanning | result | rejected | error
  const [photoUri, setPhotoUri] = useState(null);
  const [photoSize, setPhotoSize] = useState(null);
  const [deviceResult, setDeviceResult] = useState(null);
  const [gptResult, setGptResult] = useState(null);
  const [error, setError] = useState(null);

  const bboxOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(0)).current;
  const scanLoopRef = useRef(null);

  // No pre-loading needed — Vision framework is always available on-device

  const startScanLine = () => {
    scanLineY.setValue(0);
    scanLoopRef.current = Animated.loop(
      Animated.timing(scanLineY, { toValue: H, duration: 1800, useNativeDriver: true })
    );
    scanLoopRef.current.start();
  };

  const revealOverlays = () => {
    Animated.parallel([
      Animated.timing(bboxOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      setPhotoUri(photo.uri);
      setPhotoSize({ width: photo.width, height: photo.height });
      setDeviceResult(null);
      setGptResult(null);
      bboxOpacity.setValue(0);
      labelOpacity.setValue(0);
      setPhase('scanning');
      startScanLine();

      const apiKey = await getOpenAIKey();

      // ── Phase 1: on-device detection (Apple Vision / ANE) ────────────────────
      let device = null;
      try {
        device = await runOnDevice(photo.uri);
        if (device?.isPerson) {
          scanLoopRef.current?.stop();
          setPhase('rejected');
          return;
        }
        if (device) {
          setDeviceResult(device);
          revealOverlays();
        }
      } catch (e) {
        console.warn('[ObjectScan] on-device failed, GPT fallback:', e.message);
      }

      // ── Phase 2: GPT enrichment (cloud, runs while scan animation continues) ──
      if (!apiKey) {
        // No cloud key — show whatever on-device found
        if (!device) { setError('No API key and on-device model not loaded yet.'); setPhase('error'); return; }
        scanLoopRef.current?.stop();
        revealOverlays();
        setPhase('result');
        return;
      }

      let gpt = null;
      try {
        gpt = await fetchGPTData(photo.uri, device?.label, apiKey);
        if (!device && looksLikePerson(gpt?.name)) {
          scanLoopRef.current?.stop();
          setPhase('rejected');
          return;
        }
        setGptResult(gpt);
      } catch (e) {
        console.warn('[ObjectScan] GPT enrichment failed:', e.message);
      }

      if (!device && !gpt) {
        setError('Could not identify this object. Try another!');
        scanLoopRef.current?.stop();
        setPhase('error');
        return;
      }

      scanLoopRef.current?.stop();
      if (!device) revealOverlays(); // device didn't find anything; GPT bbox now available
      setPhase('result');
    } catch (e) {
      console.warn('[ObjectScan] error:', e);
      scanLoopRef.current?.stop();
      setError(e.message || 'Something went wrong');
      setPhase('error');
    }
  };

  const reset = () => {
    scanLoopRef.current?.stop();
    bboxOpacity.setValue(0);
    labelOpacity.setValue(0);
    setPhase('camera');
    setPhotoUri(null);
    setPhotoSize(null);
    setDeviceResult(null);
    setGptResult(null);
    setError(null);
  };

  // Derived display values
  const displayName   = deviceResult?.label || gptResult?.name || '';
  const displayEmoji  = gptResult?.emoji || '📦';
  const displayBbox   = deviceResult?.bbox || gptResult?.bbox;
  const displayPhotoW = photoSize?.width;
  const displayPhotoH = photoSize?.height;

  // ── Permissions ────────────────────────────────────────────────────────────
  if (!permission) return <View style={styles.safe} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centreBox}>
          <Text style={styles.centreEmoji}>📷</Text>
          <Text style={styles.centreTitle}>Camera Access</Text>
          <Text style={styles.centreDesc}>We need camera access to scan and identify objects.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant Access</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.ghostBtnText}>‹ Back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Rejected (person detected) ─────────────────────────────────────────────
  if (phase === 'rejected') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centreBox}>
          <Text style={styles.centreEmoji}>🙈</Text>
          <Text style={styles.centreTitle}>People are off limits!</Text>
          <Text style={styles.centreDesc}>
            We can only identify objects, not people. Point your camera at something interesting — a product, plant, building, food or gadget — and try again.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={reset}><Text style={styles.primaryBtnText}>Try Again</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.ghostBtnText}>‹ Fun Zone</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centreBox}>
          <Text style={styles.centreEmoji}>⚠️</Text>
          <Text style={styles.centreTitle}>Something went wrong</Text>
          <Text style={styles.centreDesc}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={reset}><Text style={styles.primaryBtnText}>Try Again</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>

          {/* Photo with bbox + summary label written directly on image */}
          <View style={styles.photoContainer}>
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />

            {/* Bounding box corners */}
            <BboxOverlay
              bbox={displayBbox}
              photoW={displayPhotoW}
              photoH={displayPhotoH}
              opacity={bboxOpacity}
            />

            {/* AI model pill — top of image */}
            <Animated.View style={[styles.aiModelPill, { opacity: labelOpacity }]} pointerEvents="none">
              <Text style={styles.onDevicePillText}>
                {deviceResult ? (deviceResult.engine || 'Apple Vision · ANE') : 'GPT-4o-mini'}
              </Text>
            </Animated.View>

            {/* Summary label written on the image */}
            <Animated.View style={[styles.onImageLabel, { opacity: labelOpacity }]}>
              <Text style={styles.onImageEmoji}>{displayEmoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.onImageNameRow}>
                  <Text style={styles.onImageName} numberOfLines={1}>{displayName}</Text>
                  {deviceResult?.confidence ? (
                    <View style={styles.confidencePill}>
                      <Text style={styles.confidenceText}>{deviceResult.confidence}%</Text>
                    </View>
                  ) : null}
                </View>
                {gptResult?.tagline ? (
                  <Text style={styles.onImageTagline} numberOfLines={2}>{gptResult.tagline}</Text>
                ) : null}
              </View>
            </Animated.View>
          </View>

          {/* Info cards — only shown if GPT enrichment is available */}
          {gptResult?.description ? (
            <View style={styles.primaryCard}>
              <Text style={styles.primaryEmoji}>{displayEmoji}</Text>
              <Text style={styles.primaryName}>{displayName}</Text>
              <Text style={styles.primaryTagline}>{gptResult.tagline}</Text>
              <View style={styles.cardDivider} />
              <Text style={styles.primaryDesc}>{gptResult.description}</Text>
              {(() => { const q = getTealiumQuip(displayName); return q ? (
                <Text style={styles.quipLine}>{q}</Text>
              ) : null; })()}
            </View>
          ) : null}

          {gptResult?.facts?.length ? (
            <View style={styles.factsCard}>
              <Text style={styles.sectionLabel}>DID YOU KNOW?</Text>
              {gptResult.facts.map((fact, i) => (
                <View key={i} style={styles.factRow}>
                  <Text style={styles.factBullet}>•</Text>
                  <Text style={styles.factText}>{fact}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {gptResult?.others?.length ? (
            <View style={styles.othersCard}>
              <Text style={styles.sectionLabel}>ALSO IN FRAME</Text>
              <View style={styles.chipsRow}>
                {gptResult.others.map((item, i) => (
                  <View key={i} style={styles.otherChip}>
                    <Text style={styles.otherChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
            <Text style={styles.primaryBtnText}>Scan Another Object</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.ghostBtnText}>‹ Fun Zone</Text>
          </TouchableOpacity>
          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Scanning ───────────────────────────────────────────────────────────────
  if (phase === 'scanning') {
    return (
      <SafeAreaView style={styles.darkSafe} edges={['top', 'bottom']}>
        <View style={styles.darkHeader}>
          <Text style={styles.camTitle}>
            {deviceResult ? 'Enriching with AI...' : 'Identifying...'}
          </Text>
          {deviceResult ? (
            <Text style={styles.scanSubtitle}>{displayEmoji} {displayName} detected on-device</Text>
          ) : null}
        </View>
        <View style={styles.scanContainer}>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />

          {/* Show bbox as soon as on-device result arrives */}
          <BboxOverlay
            bbox={displayBbox}
            photoW={displayPhotoW}
            photoH={displayPhotoH}
            opacity={bboxOpacity}
          />

          {/* Scan line only while waiting for on-device */}
          {!deviceResult && (
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} pointerEvents="none" />
          )}

          {/* Static corner brackets */}
          {[
            { top: 8,  left: 8,  borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER },
            { top: 8,  right: 8, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER },
            { bottom: 8, left: 8,  borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER },
            { bottom: 8, right: 8, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER },
          ].map((s, i) => (
            <View key={i} style={[{ position: 'absolute', width: CORNER_DIM, height: CORNER_DIM, borderColor: BOX_COLOR }, s]} />
          ))}
        </View>
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <Text style={styles.scanningLabel}>
            {deviceResult ? 'Adding details...' : 'Detecting object...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.darkSafe}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      <ScannerViewfinder />

      <SafeAreaView edges={['top']} style={styles.camHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.camTitle}>Object Scanner</Text>
          <Text style={styles.camSubtitle}>
            {nativeClassifierAvailable
              ? (Platform.OS === 'ios' ? '⚡ Apple Vision · ANE' : '⚡ ML Kit · NNAPI')
              : 'Cloud AI'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>⇄</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.hintBox} pointerEvents="none">
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>Point at any object</Text>
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.shutterRow}>
        <TouchableOpacity style={styles.shutter} onPress={takePicture} activeOpacity={0.8}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  darkSafe: { flex: 1, backgroundColor: '#000' },

  centreBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  centreEmoji: { fontSize: 52 },
  centreTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.textDark, textAlign: 'center' },
  centreDesc: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMid, textAlign: 'center', lineHeight: 21 },

  camHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  darkHeader: { alignItems: 'center', paddingVertical: spacing.md, gap: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: '#fff', fontSize: 20, fontFamily: fonts.bold },
  camTitle: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  camSubtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: fonts.medium },
  scanSubtitle: { color: BOX_COLOR, fontSize: 12, fontFamily: fonts.semibold },

  hintBox: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.lg },
  hintPill: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.full, paddingVertical: 8, paddingHorizontal: 20 },
  hintText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: fonts.medium },

  shutterRow: { alignItems: 'center', paddingBottom: spacing.xl },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  scanContainer: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: BOX_COLOR, opacity: 0.85 },
  scanningLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: fonts.medium },

  // Result
  resultScroll: { padding: spacing.lg, gap: spacing.md },
  photoContainer: {
    width: PHOTO_W, height: PHOTO_H, backgroundColor: '#000',
    borderRadius: radius.xl, overflow: 'hidden',
  },

  // ── Label written directly on the image ──────────────────────────────────
  onImageLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(5,24,56,0.80)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  onImageEmoji: { fontSize: 28 },
  onImageNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onImageName: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
  onImageTagline: { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.65)', lineHeight: 15, marginTop: 2 },
  confidencePill: {
    backgroundColor: BOX_COLOR, borderRadius: radius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  confidenceText: { fontSize: 10, fontFamily: fonts.bold, color: '#051838' },
  onDevicePill: {
    backgroundColor: 'rgba(105,240,174,0.2)', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: BOX_COLOR,
  },
  onDevicePillText: { fontSize: 9, fontFamily: fonts.bold, color: BOX_COLOR, letterSpacing: 0.5 },
  aiModelPill: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(105,240,174,0.15)', borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: BOX_COLOR,
  },

  // Info cards
  primaryCard: { backgroundColor: colors.midnight, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  primaryEmoji: { fontSize: 36 },
  primaryName: { fontSize: 24, fontFamily: fonts.extrabold, color: '#fff' },
  primaryTagline: { fontSize: 13, fontFamily: fonts.medium, color: colors.teal, lineHeight: 19 },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  primaryDesc: { fontSize: 13, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.72)', lineHeight: 20 },

  factsCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  sectionLabel: { fontSize: 10, fontFamily: fonts.bold, color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  factRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  factBullet: { fontSize: 14, color: colors.primary, lineHeight: 21 },
  factText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: colors.textDark, lineHeight: 20 },

  othersCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  otherChip: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 14 },
  otherChipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.primary },

  quipLine: { fontSize: 12, fontFamily: fonts.medium, fontStyle: 'italic', color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginTop: 6 },

  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  ghostBtn: { alignItems: 'center', paddingVertical: 8 },
  ghostBtnText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium },
});
