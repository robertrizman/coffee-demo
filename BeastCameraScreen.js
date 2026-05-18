import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  Animated, Easing,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, spacing, radius } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 160;
const RING_R = 68;
const RING_CIRC = 2 * Math.PI * RING_R;

const TRUMAN_ASSET = require('./assets/images/truman-approved.png');
let _trumanRefUrlCache = null; // module-level cache — survives Try Again without re-uploading

async function getFalKey() {
  try {
    const { supabase } = require('./supabase');
    const { data } = await supabase
      .from('menu_config')
      .select('description')
      .eq('category', '_config')
      .eq('name', 'fal_key')
      .single();
    return data?.description || null;
  } catch {
    return null;
  }
}

async function uploadTrumanReference(falKey) {
  if (_trumanRefUrlCache) {
    console.log('[fal] Truman reference (cached):', _trumanRefUrlCache.slice(0, 60));
    return _trumanRefUrlCache;
  }
  try {
    const { Asset } = require('expo-asset');
    const [asset] = await Asset.loadAsync(TRUMAN_ASSET);
    if (!asset.localUri) throw new Error('no localUri');
    const url = await uploadToFal(asset.localUri, falKey, 'image/png');
    _trumanRefUrlCache = url;
    console.log('[fal] Truman reference uploaded:', url.slice(0, 60));
    return url;
  } catch (e) {
    console.warn('[fal] Truman reference upload failed:', e.message);
    return null;
  }
}

function _crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function _adler32(buf) {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < buf.length; i++) {
    s1 = (s1 + buf[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function _u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function _u16le(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function _pngChunk(type, data) {
  const t = [...type].map(c => c.charCodeAt(0));
  const crc = _crc32(new Uint8Array([...t, ...data]));
  return new Uint8Array([..._u32be(data.length), ...t, ...data, ..._u32be(crc)]);
}

function buildMaskPng(W, H, { x: rx, y: ry, w: rw, h: rh }) {
  const rowLen = W + 1;
  const rows = new Uint8Array(rowLen * H);

  for (let y = 0; y < H; y++) {
    rows[y * rowLen] = 0;
    for (let x = 0; x < W; x++) {
      rows[y * rowLen + 1 + x] =
        x >= rx && x < rx + rw && y >= ry && y < ry + rh ? 255 : 0;
    }
  }

  const BLOCK = 65535;
  const deflate = [];

  for (let off = 0; off < rows.length; off += BLOCK) {
    const len = Math.min(BLOCK, rows.length - off);
    const b = new Uint8Array(5 + len);
    b[0] = off + len >= rows.length ? 1 : 0;
    b.set(_u16le(len), 1);
    b.set(_u16le((~len) & 0xffff), 3);
    b.set(rows.subarray(off, off + len), 5);
    deflate.push(b);
  }

  const blen = deflate.reduce((s, b) => s + b.length, 0);
  const idat = new Uint8Array(2 + blen + 4);
  idat[0] = 0x78;
  idat[1] = 0x01;

  let p = 2;
  for (const b of deflate) {
    idat.set(b, p);
    p += b.length;
  }
  idat.set(_u32be(_adler32(rows)), p);

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array([..._u32be(W), ..._u32be(H), 8, 0, 0, 0, 0]);
  const chunks = [_pngChunk('IHDR', ihdr), _pngChunk('IDAT', idat), _pngChunk('IEND', new Uint8Array(0))];

  const total = sig.length + chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  out.set(sig);

  let q = sig.length;
  for (const c of chunks) {
    out.set(c, q);
    q += c.length;
  }

  return out;
}

async function uploadMask(maskPng, falKey) {
  let str = '';
  for (let i = 0; i < maskPng.length; i += 8192) {
    str += String.fromCharCode(...maskPng.subarray(i, Math.min(i + 8192, maskPng.length)));
  }

  const path = FileSystem.cacheDirectory + 'truman_mask_' + Date.now() + '.png';
  await FileSystem.writeAsStringAsync(path, btoa(str), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uploadToFal(path, falKey, 'image/png');
}

const MAX_PHOTO_PX = 1024;

async function resizePhoto(uri, width, height) {
  const scale = Math.min(MAX_PHOTO_PX / width, MAX_PHOTO_PX / height, 1);
  if (scale >= 1) return { uri, width, height };

  let ImageManipulator;
  try {
    ImageManipulator = require('expo-image-manipulator');
  } catch {
    throw new Error('expo-image-manipulator is not installed.\nRun: npx expo install expo-image-manipulator');
  }

  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: newW, height: newH } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { uri: result.uri, width: result.width, height: result.height };
}

async function uploadToFal(photoUri, falKey, contentType = 'image/jpeg') {
  const fileName = contentType === 'image/png' ? 'reference.png' : 'photo.jpg';

  const initResp = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
  });

  const initText = await initResp.text();
  if (!initResp.ok) throw new Error(`fal storage init ${initResp.status}: ${initText}`);

  const { upload_url, file_url } = JSON.parse(initText);

  const upload = await FileSystem.uploadAsync(upload_url, photoUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType },
  });

  if (upload.status >= 300) throw new Error(`fal upload ${upload.status}: ${upload.body}`);

  return file_url;
}

async function analyzeScene(imageUrl, falKey) {
  try {
    const resp = await fetch('https://fal.run/fal-ai/moondream/batched', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'vikhyatk/moondream2',
        inputs: [
          {
            image_url: imageUrl,
            question: "Describe the person's body pose in 2-3 words. Are they standing, sitting, or leaning?",
          },
          {
            image_url: imageUrl,
            question: "What hand gesture is the person making? Say 'no gesture' if none.",
          },
          {
            image_url: imageUrl,
            question: 'Where is the main light source — left, right, above, or behind? One word.',
          },
          {
            image_url: imageUrl,
            question: "How much of the frame does the person take up? Answer exactly one of: close-up (face fills most of frame), medium (head to waist visible), full-body (whole body visible), group (multiple people).",
          },
          {
            image_url: imageUrl,
            question: "Is the person's face in the left third, middle third, or right third of the image? Answer only: left, middle, or right.",
          },
          {
            image_url: imageUrl,
            question: "Is the person's face in the top half or bottom half of the image? Answer only: top or bottom.",
          },
          {
            image_url: imageUrl,
            question: "Is the leftmost 20% of the image completely free of any person, body parts, or hair? Answer only: yes or no.",
          },
          {
            image_url: imageUrl,
            question: "Is the rightmost 20% of the image completely free of any person, body parts, or hair? Answer only: yes or no.",
          },
        ],
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();

    const pick = i => {
      const o = data?.outputs?.[i];
      if (!o) return null;
      if (typeof o === 'string') return o;
      if (typeof o?.answer === 'string') return o.answer;
      return null;
    };

    // Moondream often ignores "one word / yes or no" instructions and returns paragraphs.
    // short() accepts only brief answers; kw() extracts the relevant keyword from a paragraph.
    const short = (v, max) => (v && v.length <= max) ? v : null;
    const kw = (text, words) => {
      if (!text) return null;
      const t = text.toLowerCase();
      for (const w of words) if (t.includes(w.toLowerCase())) return w;
      return null;
    };

    const rawPose      = pick(0);
    const rawGesture   = pick(1);
    const rawLight     = pick(2);
    const rawProximity = pick(3);
    const rawFaceH     = pick(4);
    const rawFaceV     = pick(5);
    const rawEmptyL    = pick(6);
    const rawEmptyR    = pick(7);

    const pose    = short(rawPose, 80)    || kw(rawPose,    ['standing', 'sitting', 'seated', 'leaning', 'crouching']);
    const gesture = short(rawGesture, 80) || kw(rawGesture, ['peace sign', 'thumbs up', 'thumbs-up', 'wave', 'waving', 'pointing']);
    const light   = short(rawLight, 20)   || kw(rawLight,   ['right', 'left', 'above', 'behind']);

    // Proximity: keyword first, then infer from lower-body clothing/body-part mentions
    const proximity =
      short(rawProximity, 30) ||
      kw(rawProximity, ['close-up', 'full-body', 'group', 'medium']) ||
      (/\b(socks|feet|shoes|pants|trousers|jeans|legs|whole body|full length|head to toe)\b/i.test(rawProximity || '') ? 'full-body' :
       /\bclose[\s-]?up\b|\bface fills\b/i.test(rawProximity || '') ? 'close-up' :
       /\bgroup\b|\bmultiple people\b/i.test(rawProximity || '') ? 'group' : null);

    // faceH: only trust the short answer; for paragraphs, look for person-relative position
    // (avoid matching room-description words like "on the left wall")
    const faceH =
      short(rawFaceH, 20) ||
      (/\b(he|she|man|woman|person|subject|face)\b.{0,60}\bleft\b/i.test(rawFaceH || '') ? 'left' :
       /\b(he|she|man|woman|person|subject|face)\b.{0,60}\bright\b/i.test(rawFaceH || '') ? 'right' :
       null); // null → estimateHumanZone defaults to centre

    const faceV   = short(rawFaceV, 10)   || kw(rawFaceV, ['top', 'bottom']);

    // emptyLeft/Right: "yes" → confirmed clear; any person/body keyword → confirmed occupied
    const emptyLeft  =
      short(rawEmptyL, 10) ||
      (/\byes\b/i.test(rawEmptyL || '') ? 'yes' :
       /\b(person|man|woman|body|face|arm|hand|hair|wearing|standing|sitting|dressed)\b/i.test(rawEmptyL || '') ? 'no' : null);

    const emptyRight =
      short(rawEmptyR, 10) ||
      (/\byes\b/i.test(rawEmptyR || '') ? 'yes' :
       /\b(person|man|woman|body|face|arm|hand|hair|wearing|standing|sitting|dressed)\b/i.test(rawEmptyR || '') ? 'no' : null);

    console.log('[fal] scene analysis:', { pose, gesture, light, proximity, faceH, faceV, emptyLeft, emptyRight });

    return { pose, gesture, light, proximity, faceH, faceV, emptyLeft, emptyRight };
  } catch (e) {
    console.warn('[fal] scene analysis failed:', e.message);
    return null;
  }
}

function estimateHumanZone(scene, imgW, imgH) {
  const faceHRaw = (scene?.faceH || '').toLowerCase();
  const proximityRaw = (scene?.proximity || '').toLowerCase();
  const emptyLeft = /\byes\b/i.test(scene?.emptyLeft || '');
  const emptyRight = /\byes\b/i.test(scene?.emptyRight || '');

  const isCloseUp = /close/i.test(proximityRaw);
  const isFullBody = /full/i.test(proximityRaw);
  const isGroup = /group/i.test(proximityRaw);

  let hx1;
  let hx2;

  if (/left/.test(faceHRaw)) {
    hx1 = 0.0;
    hx2 = 0.52;
  } else if (/right/.test(faceHRaw)) {
    hx1 = 0.48;
    hx2 = 1.0;
  } else {
    hx1 = 0.15;
    hx2 = 0.85;
  }

  if (isCloseUp) {
    hx1 = Math.max(0, hx1 - 0.1);
    hx2 = Math.min(1, hx2 + 0.1);
  }

  if (isGroup) {
    hx1 = 0.02;
    hx2 = 0.98;
  }

  const hy2 = isCloseUp ? 0.88 : isFullBody ? 0.96 : 0.82;

  return {
    px1: Math.round(hx1 * imgW),
    px2: Math.round(hx2 * imgW),
    py1: 0,
    py2: Math.round(hy2 * imgH),
    isCloseUp,
    isFullBody,
    isGroup,
    emptyLeft,
    emptyRight,
    faceH: faceHRaw,
  };
}

function computeMaskRegion(zone, imgW, imgH) {
  const { px1, px2, isCloseUp, isFullBody, emptyLeft, emptyRight } = zone;

  const HUMAN_BUFFER = Math.round(imgW * 0.06);

  const freeLeft = Math.max(0, px1 - HUMAN_BUFFER);
  const freeRight = Math.max(0, imgW - px2 - HUMAN_BUFFER);

  const maxW = Math.round(imgW * (isCloseUp ? 0.09 : 0.12));
  const minW = Math.round(imgW * 0.06);

  const bonus = Math.round(imgW * 0.05);
  const rScore = freeRight + (emptyRight ? bonus : 0);
  const lScore = freeLeft + (emptyLeft ? bonus : 0);

  let side;
  let maskX;
  let maskW;

  if (rScore >= lScore && freeRight >= minW) {
    side = 'right';
    maskW = Math.min(freeRight, maxW);
    maskX = imgW - maskW;
  } else if (freeLeft >= minW) {
    side = 'left';
    maskW = Math.min(freeLeft, maxW);
    maskX = 0;
  } else {
    side = freeRight >= freeLeft ? 'right' : 'left';
    maskW = Math.round(imgW * 0.08);
    maskX = side === 'right' ? imgW - maskW : 0;
  }

  let maskY;
  let maskH;
  let bodyMode = 'cropped'; // default: Truman photobombs with lower body off-frame

  if (isCloseUp) {
    maskY = Math.round(imgH * 0.08);
    maskH = Math.round(imgH * 0.28);
  } else if (isFullBody) {
    // Always floor mode for full-body shots. Even when Moondream reports the
    // side as "not empty" (arm crosses the upper frame edge), the lower portion
    // of the frame edge — where the floor is — is virtually always clear.
    // Mask starts below the typical arm zone (45%) and extends to floor (88%).
    maskY = Math.round(imgH * 0.45);
    maskH = Math.round(imgH * 0.43); // 45%–88%: lower body zone + carpet + shadow
    bodyMode = 'floor';
  } else {
    maskY = Math.round(imgH * 0.15);
    maskH = Math.round(imgH * 0.5);
  }

  return { x: maskX, y: maskY, w: maskW, h: maskH, side, bodyMode };
}

function getRandomTrumanGesture(hasHumanGesture) {
  const gestures = [
    `TRUMAN gives a friendly wave toward the camera.`,
    `TRUMAN makes a playful peace sign toward the camera.`,
    `TRUMAN raises one hand excitedly as if saying hello.`,
    `TRUMAN gives a cheerful thumbs-up toward the viewer.`,
    `TRUMAN leans into the frame with an excited open-handed selfie pose.`,
    `TRUMAN reacts with playful surprised body language while smiling at the camera.`,
    `TRUMAN excitedly photobombs the selfie with expressive body language.`,
  ];

  if (hasHumanGesture) {
    gestures.push(
      `TRUMAN reacts naturally to the human subject's gesture with matching selfie energy.`,
      `TRUMAN joins in on the selfie moment with complementary body language and hand movement.`,
      `TRUMAN playfully responds to the human subject's pose with similar social energy.`
    );
  }

  return gestures[Math.floor(Math.random() * gestures.length)];
}

async function pollFalQueue(statusUrl, responseUrl, falKey, fromPct, toPct, onProgress, label, maxPolls = 90) {
  const startedAt = Date.now();

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });

    const { status } = JSON.parse(await statusResp.text());

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

    onProgress(
      fromPct + (toPct - fromPct) * Math.min((i + 1) / maxPolls, 0.95),
      `${label} ${timeStr}`
    );

    if (status === 'COMPLETED') {
      const res = JSON.parse(
        await (
          await fetch(responseUrl, {
            headers: { Authorization: `Key ${falKey}` },
          })
        ).text()
      );
      return res;
    }

    if (status === 'FAILED') {
      throw new Error(`fal.ai job failed (${label})`);
    }
  }

  throw new Error('Generation timed out — please try again');
}

async function generateWithFal(selfieUri, falKey, onProgress, photoSize = { width: 1080, height: 1440 }) {
  onProgress(0.05, 'Uploading photo…');

  const { uri: resizedUri, width: imgW, height: imgH } = await resizePhoto(
    selfieUri,
    photoSize.width,
    photoSize.height
  );

  console.log(`[fal] photo resized to ${imgW}×${imgH}`);

  const photoUrl = await uploadToFal(resizedUri, falKey, 'image/jpeg');
  console.log('[fal] BEFORE:', photoUrl);

  onProgress(0.15, 'Reading the scene…');

  const [scene, trumanRefUrl] = await Promise.all([
    analyzeScene(photoUrl, falKey),
    uploadTrumanReference(falKey),
  ]);

  const gesture = scene?.gesture || '';
  const light = scene?.light || '';
  const hasGesture = gesture.length > 0 && !/no gesture/i.test(gesture);
  const isSeated = /\bseat\w*\b|\bsitt\w*\b|\btable\b|\bchair\b/i.test(
    (scene?.pose || '').toLowerCase()
  );

  onProgress(0.22, 'Preparing Truman…');

  const zone = estimateHumanZone(scene, imgW, imgH);
  const maskRegion = computeMaskRegion(zone, imgW, imgH);
  const { side: trumanSide, bodyMode: trumanBodyMode, ...maskCoords } = maskRegion;

  const maskPng = buildMaskPng(imgW, imgH, maskCoords);
  const maskUrl = await uploadMask(maskPng, falKey);

  console.log('[fal] human zone:', {
    px1: zone.px1,
    px2: zone.px2,
    isCloseUp: zone.isCloseUp,
    isGroup: zone.isGroup,
  });

  console.log('[fal] mask region:', maskCoords, 'side:', trumanSide, 'bodyMode:', trumanBodyMode, 'trumanRef:', !!trumanRefUrl);

  onProgress(0.32, 'Adding Truman to your photo…');

  const placementHint = zone.isCloseUp
    ? `TRUMAN enters from outside the camera frame on the ${trumanSide} side — only the face and very top of the head are visible, partially cropped by the frame edge.`
    : isSeated
      ? `TRUMAN peeks in from the ${trumanSide} edge at shoulder height — head and partial upper body visible, cropped naturally by the frame. Lower body is out of frame.`
      : trumanBodyMode === 'floor'
        ? `TRUMAN stands on the floor on the ${trumanSide} side of the frame, partially cropped by the ${trumanSide} edge. TRUMAN occupies the LOWER portion of the frame — a small creature whose full height fits in roughly the bottom half of the image. Both short stubby feet rest firmly on the floor with a soft contact shadow directly beneath them. TRUMAN is NOT floating — feet must touch the floor surface.`
        : `TRUMAN photobombs from the ${trumanSide} frame edge — head and upper torso only. TRUMAN's lower body is cropped out of frame by the bottom edge of the mask. Do NOT generate legs or feet for TRUMAN.`;

  const trumanGesture = getRandomTrumanGesture(hasGesture);

  const gestureNote = hasGesture
    ? `The human is making a ${gesture} gesture. ${trumanGesture}`
    : `${trumanGesture} TRUMAN directs full attention to the camera lens, making deliberate, excited eye contact with the viewer.`;

  const poseReaction = scene?.pose
    ? `The human subject appears to be ${scene.pose.toLowerCase()}. TRUMAN should react emotionally to the human's energy, but must not copy the human's clothing, body, fingers, or exact anatomy. Engaging with the same social moment.`
    : '';

  if (trumanRefUrl) {
    const prompt =
      `CRITICAL TASK: Insert TRUMAN only into the masked zone on the ${trumanSide} side of image 1.\n\n` +

      `Image 1 is the source-of-truth photograph. The human subject in image 1 must remain fully visible and pixel-identical in the final image.\n` +
      `Do not remove the human. Do not replace the human. Do not cover the human. Do not transform the human into TRUMAN.\n` +
      `Do not change the human's face, body, pose, clothing, hands, fingers, legs, position, angle, or expression.\n` +
      `Do not redraw the human. Do not reinterpret the human. Do not modify any pixel outside the masked zone.\n\n` +

      `Inside the masked zone only: add TRUMAN from image 2 as a separate small blue furry creature.\n` +
      `TRUMAN must remain separate from the human and must not overlap or touch the human.\n` +
      `TRUMAN enters from the ${trumanSide} edge as a playful photobomb, partially cropped by the frame edge.\n` +
      `TRUMAN stares directly into the camera lens with intense eye contact, a huge happy smile, and wide excited eyes — as if TRUMAN knows the photo is being taken and is determined to be seen.\n\n` +

      (trumanBodyMode === 'floor'
        ? `TRUMAN stands naturally on the floor as a short creature, with only his own short stubby feet touching the carpet and a soft contact shadow beneath him. Do not create human-like legs.\n`
        : `TRUMAN is cropped by the frame edge. Lower body is off-frame. Do not generate legs or feet.\n`) +

      `TRUMAN has no clothing, no pants, no shoes, no sleeves, no human outfit, and no copied anatomy from the human.\n` +
      `Do not copy the human's clothes, pants, pose, fingers, body, or legs onto TRUMAN.\n\n` +

      `Final image requirement: image 1 should look unchanged, with the original human still present, plus TRUMAN added only in the masked side area.\n` +
      `Match scene lighting${light ? ` from ${light.trim().replace(/\.$/, '')}` : ``}, shadows, colour temperature, and film grain.\n` +
      `Photorealistic. Minimal edit. Only generate pixels inside the masked zone.`;

    console.log('[fal] kontext/max/multi, prompt:', prompt.slice(0, 150));

    const kontextResp = await fetch('https://queue.fal.run/fal-ai/flux-pro/kontext/max/multi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${falKey}`,
      },
      body: JSON.stringify({
        image_urls: [photoUrl, trumanRefUrl],
        mask_url: maskUrl,
        prompt,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        enable_safety_checker: false,
      }),
    });

    const kontextText = await kontextResp.text();
    console.log('[fal] kontext:', kontextResp.status, kontextText.slice(0, 120));

    if (kontextResp.ok) {
      const { status_url, response_url } = JSON.parse(kontextText);
      const result = await pollFalQueue(
        status_url,
        response_url,
        falKey,
        0.32,
        0.92,
        onProgress,
        'Adding Truman…'
      );

      const url = result?.images?.[0]?.url;
      if (url) {
        console.log('[fal] kontext result:', url);
        onProgress(0.95, 'Almost there…');
        return url;
      }
    }

    console.warn('[fal] kontext failed, falling back to fill');
  }

  const fillPrompt =
    `Selfie photobomb: insert a blue furry creature (TRUMAN) into the masked zone on the ${trumanSide} side. ` +
    `Sky-blue shaggy fur, round body, large expressive eyes. Photorealistic, not cartoon, not Sulley. ` +
    `TRUMAN is actively joining the selfie — not standing passively beside it. ` +
    `TRUMAN must: lean INTO the frame from the ${trumanSide} edge with body angled toward the camera; ` +
    `look DIRECTLY into the camera lens with full camera awareness and strong eye contact; ` +
    `smile visibly and enthusiastically with open excited eyes; ` +
    `react to and mirror the human subject's social energy. ` +
    `${poseReaction} ` +
    `${gestureNote} ` +
    `${placementHint} ` +
    `TRUMAN may make a friendly wave, peace sign, thumbs-up, excited reaction, or natural playful selfie gesture. ` +
    `Avoid: blank face, passive standing, sideways gaze, neutral posture, malformed hands, extra fingers, duplicate arms, duplicate hands, impossible gestures. ` +
    `TRUMAN is partially cropped by the ${trumanSide} frame edge as if diving in from off-screen. ` +
    `Matches scene lighting${light ? ` from ${light.trim().replace(/\.$/, '')}` : ``}. ` +
    `TRUMAN must NOT touch or overlap the human. Do not modify the human, background, or scene. ` +
    `Only generate pixels inside the masked zone.`;

  console.log('[fal] flux-pro fill fallback, mask:', maskRegion);

  const fillResp = await fetch('https://queue.fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${falKey}`,
    },
    body: JSON.stringify({
      image_url: photoUrl,
      mask_url: maskUrl,
      prompt: fillPrompt,
      num_inference_steps: 35,
      guidance_scale: 3.5,
      enable_safety_checker: false,
    }),
  });

  const fillText = await fillResp.text();
  console.log('[fal] fill:', fillResp.status, fillText.slice(0, 120));

  if (!fillResp.ok) throw new Error(`fal fill ${fillResp.status}: ${fillText}`);

  const { status_url: fillStatus, response_url: fillResponse } = JSON.parse(fillText);

  const fillResult = await pollFalQueue(
    fillStatus,
    fillResponse,
    falKey,
    0.32,
    0.92,
    onProgress,
    'Adding Truman…'
  );

  const resultUrl = fillResult?.images?.[0]?.url;
  if (!resultUrl) throw new Error(`No image in result: ${JSON.stringify(fillResult).slice(0, 200)}`);

  console.log('[fal] fill result:', resultUrl);

  onProgress(0.95, 'Almost there…');
  return resultUrl;
}

export default function BeastCameraScreen() {
  const navigation = useNavigation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState('back');
  const [phase, setPhase] = useState('camera');
  const [capturedUri, setCapturedUri] = useState(null);
  const [photoSize, setPhotoSize] = useState({ width: 1080, height: 1440 });
  const [resultUri, setResultUri] = useState(null);
  const [saved, setSaved] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [readyToReveal, setReadyToReveal] = useState(false);

  const cameraRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === 'generating') {
      progressAnim.setValue(0);
      setStepLabel('');
      setReadyToReveal(false);
    }
  }, [phase]);

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => setProgressPct(Math.round(value * 100)));
    return () => progressAnim.removeListener(id);
  }, []);

  const animateProgress = (toValue, label) => {
    setStepLabel(label);
    Animated.timing(progressAnim, {
      toValue,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  };

  const dashOffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRC, 0],
  });

  if (!cameraPermission) return <View style={styles.safe} />;

  if (!cameraPermission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.permBox}>
          <Text style={styles.permTitle}>Camera Access</Text>
          <Text style={styles.permSub}>We need camera access to take your photo.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestCameraPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>‹ Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setCapturedUri(photo.uri);
      setPhotoSize({ width: photo.width, height: photo.height });
      setPhase('preview');
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  };

  const handleProcess = async () => {
    setPhase('generating');

    try {
      const falKey = await getFalKey();
      if (!falKey) throw new Error('No fal.ai key configured');

      const url = await generateWithFal(capturedUri, falKey, animateProgress, photoSize);

      setResultUri(url);
      setStepLabel("Truman's ready!");

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(() => setReadyToReveal(true));
    } catch (e) {
      console.warn('[BeastCamera] error:', e.message);
      setPhase('preview');
      progressAnim.setValue(0);
      Alert.alert('Oops!', 'Something went wrong. Check your connection and try again.');
    }
  };

  const handleSave = async () => {
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow photo library access to save.');
        return;
      }
    }

    try {
      const localUri = FileSystem.cacheDirectory + 'truman_result_' + Date.now() + '.jpg';
      await FileSystem.downloadAsync(resultUri, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      setSaved(true);
    } catch {
      Alert.alert('Error', 'Could not save to your photo library.');
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setResultUri(null);
    setSaved(false);
    progressAnim.setValue(0);
    setProgressPct(0);
    setReadyToReveal(false);
    setPhase('camera');
  };

  const handleRetry = () => {
    setSaved(false);
    setResultUri(null);
    progressAnim.setValue(0);
    setProgressPct(0);
    setReadyToReveal(false);
    handleProcess();
  };

  if (phase === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

        <SafeAreaView edges={['top']} style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.topBtnText}>✕</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.topBtn} onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}>
            <Text style={styles.topBtnText}>⇄</Text>
          </TouchableOpacity>
        </SafeAreaView>

        <View style={styles.hintPill}>
          <Image source={TRUMAN_ASSET} style={styles.hintThumb} />
          <Text style={styles.hintText}>Truman will join your photo!</Text>
        </View>

        <SafeAreaView edges={['bottom']} style={styles.shutterRow}>
          <TouchableOpacity style={styles.shutterBtn} onPress={handleCapture} activeOpacity={0.8}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (phase === 'preview') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Image source={{ uri: capturedUri }} style={styles.fullImg} resizeMode="contain" />

        <View style={styles.bottomOverlay}>
          <Text style={styles.overlayTitle}>Ready to add Truman?</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.outlineBtn} onPress={handleRetake}>
              <Text style={styles.outlineBtnText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleProcess}>
              <Image source={TRUMAN_ASSET} style={styles.btnIcon} />
              <Text style={styles.primaryBtnText}>Add Truman</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'generating') {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={7}
              fill="none"
            />

            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              stroke={colors.teal}
              strokeWidth={7}
              fill="none"
              strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>

          <View style={styles.ringInner}>
            <Image source={TRUMAN_ASSET} style={styles.ringTruman} resizeMode="contain" />
            <Text style={styles.pctText}>{progressPct}%</Text>
          </View>
        </View>

        <Text style={styles.loadTitle}>{stepLabel || 'Starting…'}</Text>

        {readyToReveal ? (
          <TouchableOpacity style={styles.revealBtn} onPress={() => setPhase('result')} activeOpacity={0.8}>
            <Text style={styles.revealBtnText}>Reveal Truman ✦</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.loadSub}>fal.ai · FLUX Kontext + Truman reference</Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.photoFrame}>
        <Image source={{ uri: resultUri }} style={styles.fullImg} resizeMode="contain" />
      </View>

      <View style={styles.bottomOverlay}>
        <Text style={styles.overlayTitle}>
          {saved ? '✓ Saved to Photos!' : 'Truman joined the party!'}
        </Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleRetake}>
            <Text style={styles.outlineBtnText}>New Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.outlineBtn} onPress={handleRetry}>
            <Text style={styles.outlineBtnText}>Try Again</Text>
          </TouchableOpacity>

          {!saved && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  cameraContainer: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBtnText: { color: '#fff', fontSize: 18, fontFamily: fonts.semibold },

  hintPill: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hintThumb: { width: 28, height: 28, borderRadius: 14 },
  hintText: { color: '#fff', fontSize: 12, fontFamily: fonts.medium },

  shutterRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
  },

  fullImg: { flex: 1, width: '100%' },
  photoFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },

  bottomOverlay: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 24,
    backgroundColor: '#111',
    alignItems: 'center',
    gap: spacing.md,
  },
  overlayTitle: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
  btnRow: { flexDirection: 'row', gap: spacing.md },

  outlineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
  },
  outlineBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.semibold },

  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.semibold },
  btnIcon: { width: 22, height: 22, borderRadius: 11 },

  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: { position: 'absolute' },
  ringInner: { alignItems: 'center', gap: 2 },
  ringTruman: { width: 82, height: 82 },
  pctText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },

  loadTitle: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
  loadSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: fonts.regular },

  revealBtn: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
  },
  revealBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },

  permBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  permTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.textDark,
    marginBottom: 8,
  },
  permSub: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textMid,
    textAlign: 'center',
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  permBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.semibold },
  backLink: { marginTop: 16 },
  backLinkText: { color: colors.textMid, fontSize: 14, fontFamily: fonts.medium },
});