import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, ActivityIndicator, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from './supabase';
import { useApp } from './AppContext';
import { colors, fonts, spacing, radius } from './theme';

import * as SecureStore from 'expo-secure-store';

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(secs) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.abs(secs) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getScoreLabel(score, total) {
  const pct = total > 0 ? score / total : 0;
  if (pct === 1) return { label: 'Tealium Legend', emoji: '⚡', color: '#B2F94B' };
  if (pct >= 0.7) return { label: 'CDP Champion', emoji: '🏆', color: '#F9A825' };
  if (pct >= 0.4) return { label: 'Data Barista', emoji: '🧑‍💻', color: colors.primary };
  return { label: 'Coffee Curious', emoji: '☕', color: '#B0BEC5' };
}

function computePoints(score, total, timeSecs, maxSecs = 300) {
  if (!total || !maxSecs) return 0;
  const accuracy = score / total;
  const timeRatio = Math.min(1, (timeSecs || 0) / maxSecs);
  return Math.max(0, Math.round(accuracy * 1000 * (1 - timeRatio)));
}

export default function QuizScreen() {
  const navigation = useNavigation();
  const { state } = useApp();

  // Quiz config
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [quizName, setQuizName] = useState('Quiz');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [totalTimerSecs, setTotalTimerSecs] = useState(300);
  const [scoringMaxSecs, setScoringMaxSecs] = useState(300);

  // Intro gate — timers don't start until user taps Let's Start
  const [started, setStarted] = useState(false);

  // Question state
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [quizRound, setQuizRound] = useState(0);

  // Timers
  const [timeLeft, setTimeLeft] = useState(300);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const elapsedRef = useRef(null);
  const startTimeRef = useRef(null);

  // Leaderboard submission
  const [lbModalVisible, setLbModalVisible] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    const [{ data: config }, { data: qRows }] = await Promise.all([
      supabase.from('quiz_config').select('*').eq('id', 'default').single(),
      supabase.from('quiz_questions').select('*').eq('is_active', true).order('sort_order'),
    ]);
    const perQuiz = config?.questions_per_quiz || 10;
    const shuffled = shuffleArray(qRows || []);
    setQuestions(shuffled.slice(0, perQuiz));
    setQuizName(config?.quiz_name || 'Quiz');
    setTimerEnabled(config?.timer_enabled || false);
    setTotalTimerSecs(config?.timer_seconds || 300);
    setTimeLeft(config?.timer_seconds || 300);
    setScoringMaxSecs(config?.scoring_max_seconds || 300);
    setLoading(false);
  }, []);

  // Load on mount
  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  // Pre-fill name from profile
  useEffect(() => {
    if (state.profile?.name) setPlayerName(state.profile.name);
    if (state.profile?.email) setPlayerEmail(state.profile.email);
  }, [state.profile]);

  // Start timers only after user taps Let's Start
  useEffect(() => {
    if (!started || loading || questions.length === 0) return;

    clearInterval(timerRef.current);
    clearInterval(elapsedRef.current);

    const now = Date.now();
    startTimeRef.current = now;

    elapsedRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - now) / 1000));
    }, 1000);

    if (timerEnabled && totalTimerSecs > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            clearInterval(elapsedRef.current);
            const elapsed = startTimeRef.current
              ? Math.floor((Date.now() - startTimeRef.current) / 1000)
              : totalTimerSecs;
            setElapsedSeconds(elapsed);
            setDone(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      clearInterval(timerRef.current);
      clearInterval(elapsedRef.current);
    };
  }, [started, quizRound]);

  const stopTimers = () => {
    clearInterval(timerRef.current);
    clearInterval(elapsedRef.current);
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSelect = (optionIdx) => {
    if (selected !== null) return;
    setSelected(optionIdx);
    const q = questions[idx];
    const correct = optionIdx === q.answer_index;
    if (correct) setScore(s => s + 1);
    else shake();
    setAnswers(prev => [...prev, { correct }]);
  };

  const handleNext = () => {
    if (idx + 1 >= questions.length) {
      stopTimers();
      const elapsed = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : elapsedSeconds;
      setElapsedSeconds(elapsed);
      setDone(true);
    } else {
      setIdx(i => i + 1);
      setSelected(null);
    }
  };

  const handleRestart = async () => {
    stopTimers();
    setStarted(false);
    setDone(false);
    setSubmitted(false);
    setIdx(0);
    setSelected(null);
    setScore(0);
    setAnswers([]);
    setElapsedSeconds(0);
    await loadQuiz();
    setQuizRound(r => r + 1);
  };

  const submitScore = async () => {
    if (!playerName.trim()) { Alert.alert('Required', 'Please enter your name.'); return; }
    setSubmitting(true);
    await supabase.from('quiz_leaderboard').insert({
      player_name: playerName.trim(),
      player_email: playerEmail.trim() || null,
      score,
      total_questions: questions.length,
      time_seconds: elapsedSeconds,
    });
    // Mark prize as unlocked on this device
    await SecureStore.setItemAsync('quiz_prize_completed', 'true');
    setSubmitting(false);
    setSubmitted(true);
    setLbModalVisible(false);
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── No questions ─────────────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centred}>
          <Text style={{ fontSize: 48 }}>❓</Text>
          <Text style={styles.noQTitle}>No questions available</Text>
          <Text style={styles.noQSub}>Ask the admin to add some questions in Settings → Quiz.</Text>
          <TouchableOpacity style={styles.nextBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.nextBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (!started && !done) {
    const n = questions.length;
    const halfCap = Math.round(scoringMaxSecs / 2);
    const ex1 = computePoints(n, n, 30, scoringMaxSecs);
    const ex2 = computePoints(n, n, halfCap, scoringMaxSecs);
    const ex3 = n > 1 ? computePoints(n - 1, n, 30, scoringMaxSecs) : null;

    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.introHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Fun Zone</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.introBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.introEmoji}>☕</Text>
          <Text style={styles.introTitle}>{quizName}</Text>
          <Text style={styles.introSubtitle}>Ready to test your knowledge?</Text>

          <View style={styles.introStatsRow}>
            <View style={styles.introStat}>
              <Text style={styles.introStatValue}>{n}</Text>
              <Text style={styles.introStatLabel}>Questions</Text>
            </View>
            <View style={styles.introStatDivider} />
            <View style={styles.introStat}>
              <Text style={styles.introStatValue}>
                {timerEnabled ? formatTime(totalTimerSecs) : formatTime(scoringMaxSecs)}
              </Text>
              <Text style={styles.introStatLabel}>{timerEnabled ? 'Time Limit' : 'Score Cap'}</Text>
            </View>
          </View>

          <View style={styles.introCard}>
            <Text style={styles.introCardTitle}>⚡ Speed matters</Text>
            <Text style={styles.introCardBody}>
              Answer correctly and quickly to maximise your score. Points drop the longer you take
              {timerEnabled ? ' — finish before time runs out.' : ` — reaching zero at the ${formatTime(scoringMaxSecs)} cap.`}
            </Text>
            <View style={styles.introExamples}>
              <Text style={styles.introExample}>All correct in 30s  →  {ex1} pts</Text>
              <Text style={styles.introExample}>All correct at {formatTime(halfCap)}  →  {ex2} pts</Text>
              {ex3 !== null && (
                <Text style={styles.introExample}>{n - 1}/{n} correct in 30s  →  {ex3} pts</Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={() => setStarted(true)}>
            <Text style={styles.startBtnText}>Let's Start! →</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>‹ Back to Fun Zone</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  if (done) {
    const label = getScoreLabel(score, questions.length);
    const timedOut = timerEnabled && timeLeft === 0 && answers.length < questions.length;
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.resultContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.resultEmoji}>{label.emoji}</Text>
          <Text style={[styles.resultTitle, { color: label.color }]}>{label.label}</Text>
          {timedOut && <Text style={styles.timedOutText}>⏱ Time's up!</Text>}
          <View style={styles.resultPtsRow}>
            <Text style={styles.resultScore}>{computePoints(score, questions.length, elapsedSeconds, scoringMaxSecs)}</Text>
            <Text style={styles.resultPtsLabel}>pts</Text>
          </View>
          <Text style={styles.resultAnswers}>{score} / {questions.length} correct · {formatTime(elapsedSeconds)}</Text>
          <Text style={styles.resultSub}>
            {score === questions.length
              ? 'Perfect score! You know your data inside and out.'
              : score / questions.length >= 0.7
              ? "Impressive! You're clearly across the platform."
              : score / questions.length >= 0.4
              ? 'Good effort — keep learning and keep caffeinating!'
              : 'Every barista starts somewhere. Give it another shot!'}
          </Text>

          <View style={styles.answerRow}>
            {answers.map((a, i) => (
              <View key={i} style={[styles.answerDot, { backgroundColor: a.correct ? '#4CAF50' : '#F44336' }]} />
            ))}
          </View>

          {!submitted ? (
            <TouchableOpacity style={styles.lbSubmitBtn} onPress={() => setLbModalVisible(true)}>
              <Text style={styles.lbSubmitBtnText}>🏆  Submit to Leaderboard</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.submittedBadge}>
              <Text style={styles.submittedText}>✓ Score submitted!</Text>
            </View>
          )}

          <TouchableOpacity style={styles.viewLbBtn} onPress={() => navigation.navigate('Leaderboard')}>
            <Text style={styles.viewLbBtnText}>View Leaderboard →</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
            <Text style={styles.restartBtnText}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>‹ Back to Fun Zone</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Leaderboard submission modal */}
        <Modal
          visible={lbModalVisible}
          animationType="slide"
          presentationStyle="formSheet"
          onRequestClose={() => setLbModalVisible(false)}
        >
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setLbModalVisible(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Submit Score</Text>
                <View style={{ width: 60 }} />
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalScoreLine}>{computePoints(score, questions.length, elapsedSeconds, scoringMaxSecs)} pts</Text>
                <Text style={styles.modalScoreSub}>{score}/{questions.length} correct · {formatTime(elapsedSeconds)}</Text>
                <Text style={styles.modalLabel}>Your Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={playerName}
                  onChangeText={setPlayerName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <Text style={styles.modalLabel}>Email (optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={playerEmail}
                  onChangeText={setPlayerEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.submitBtn} onPress={submitScore} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>Submit to Leaderboard 🏆</Text>
                  }
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Question ─────────────────────────────────────────────────────────────────
  const q = questions[idx];
  const answered = selected !== null;
  const timerWarning = timerEnabled
    ? timeLeft <= 30
    : elapsedSeconds >= scoringMaxSecs * 0.75;
  const progressPct = ((idx + 1) / questions.length) * 100;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Slim header: back + quiz name ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Fun Zone</Text>
        </TouchableOpacity>
        <Text style={styles.quizName}>{quizName}</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* ── HUD: question counter + timer ── */}
      <View style={styles.hud}>
        {/* Question pagination */}
        <View style={styles.hudLeft}>
          <Text style={styles.hudLabel}>QUESTION</Text>
          <View style={styles.hudQRow}>
            <Text style={styles.hudQCurrent}>{idx + 1}</Text>
            <Text style={styles.hudQSep}> of </Text>
            <Text style={styles.hudQTotal}>{questions.length}</Text>
          </View>
        </View>

        {/* Timer */}
        <View style={[styles.hudTimerPill, timerWarning && styles.hudTimerPillWarning]}>
          <Text style={styles.hudTimerLabel}>{timerEnabled ? 'TIME LEFT' : 'ELAPSED'}</Text>
          <Text style={[styles.hudTimerValue, timerWarning && styles.hudTimerValueWarning]}>
            {timerEnabled ? formatTime(timeLeft) : formatTime(elapsedSeconds)}
          </Text>
          {scoringMaxSecs > 0 && (
            <Text style={[styles.hudTimerCap, timerWarning && styles.hudTimerCapWarning]}>
              {timerEnabled
                ? `score cap ${formatTime(scoringMaxSecs)}`
                : `/ ${formatTime(scoringMaxSecs)} cap`}
            </Text>
          )}
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.scoreLabel}>Score: {score}</Text>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Text style={styles.question}>{q.question}</Text>
        </Animated.View>

        <View style={styles.optionsGap}>
          {(q.options || []).map((opt, i) => {
            let optStyle = styles.option;
            let textStyle = styles.optionText;
            if (answered) {
              if (i === q.answer_index) {
                optStyle = [styles.option, styles.optionCorrect];
                textStyle = styles.optionTextCorrect;
              } else if (i === selected) {
                optStyle = [styles.option, styles.optionWrong];
                textStyle = styles.optionTextWhite;
              } else {
                optStyle = [styles.option, styles.optionDimmed];
              }
            }
            return (
              <TouchableOpacity
                key={i}
                style={optStyle}
                onPress={() => handleSelect(i)}
                activeOpacity={answered ? 1 : 0.75}
              >
                <Text style={styles.optionLetter}>{['A', 'B', 'C', 'D'][i]}</Text>
                <Text style={textStyle}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {answered && !!q.fact && (
          <View style={styles.factBox}>
            <Text style={styles.factIcon}>{selected === q.answer_index ? '✓' : '✗'}</Text>
            <Text style={styles.factText}>{q.fact}</Text>
          </View>
        )}

        {answered && (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>
              {idx + 1 >= questions.length ? 'See Results' : 'Next Question →'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  loadingText: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: 14 },
  noQTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.textDark, textAlign: 'center' },
  noQSub: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textMid, width: 80 },
  quizName: { fontSize: 14, fontFamily: fonts.bold, color: colors.textDark, flex: 1, textAlign: 'center' },

  // ── HUD ──────────────────────────────────────────────────────────────────────
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  hudLeft: { flex: 1, gap: 2 },
  hudLabel: {
    fontSize: 9, fontFamily: fonts.bold, color: colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  hudQRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  hudQCurrent: { fontSize: 32, fontFamily: fonts.extrabold, color: colors.textDark, lineHeight: 36 },
  hudQSep: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted },
  hudQTotal: { fontSize: 16, fontFamily: fonts.semibold, color: colors.textMuted },

  hudTimerPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 110,
  },
  hudTimerPillWarning: { backgroundColor: '#FFF3F3', borderColor: '#F44336' },
  hudTimerLabel: {
    fontSize: 9, fontFamily: fonts.bold, color: colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  hudTimerValue: { fontSize: 28, fontFamily: fonts.extrabold, color: colors.textDark, lineHeight: 32 },
  hudTimerValueWarning: { color: '#F44336' },
  hudTimerCap: { fontSize: 10, fontFamily: fonts.medium, color: colors.textMuted, marginTop: 1 },
  hudTimerCapWarning: { color: '#F44336' },

  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    borderRadius: 4,
    marginBottom: spacing.lg,
  },
  progressFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },

  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  scoreLabel: {
    fontSize: 12, fontFamily: fonts.semibold, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  question: { fontSize: 20, fontFamily: fonts.bold, color: colors.textDark, lineHeight: 28 },

  optionsGap: { gap: spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionCorrect: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  optionWrong: { backgroundColor: '#F44336', borderColor: '#F44336' },
  optionDimmed: { opacity: 0.45, borderColor: colors.border, backgroundColor: colors.surface },
  optionLetter: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.border, textAlign: 'center', lineHeight: 24,
    fontSize: 12, fontFamily: fonts.bold, color: colors.textMid, overflow: 'hidden',
  },
  optionText: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.textDark },
  optionTextCorrect: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: '#2E7D32' },
  optionTextWhite: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: '#fff' },

  factBox: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#EEF6FF', borderRadius: radius.lg, padding: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  factIcon: { fontSize: 16, fontFamily: fonts.bold, color: colors.primary },
  factText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: colors.textDark, lineHeight: 19 },

  nextBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },

  // Results
  resultContainer: { alignItems: 'center', padding: spacing.lg, gap: spacing.md, paddingTop: 60 },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 28, fontFamily: fonts.extrabold, textAlign: 'center' },
  resultPtsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  resultScore: { fontSize: 64, fontFamily: fonts.extrabold, color: colors.textDark, lineHeight: 68 },
  resultPtsLabel: { fontSize: 18, fontFamily: fonts.bold, color: colors.textMuted, marginBottom: 10 },
  resultAnswers: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted },
  timedOutText: { fontSize: 14, fontFamily: fonts.semibold, color: '#F44336' },
  resultSub: {
    fontSize: 15, fontFamily: fonts.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22,
  },
  answerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  answerDot: { width: 12, height: 12, borderRadius: 6 },

  lbSubmitBtn: {
    backgroundColor: '#F9A825',
    borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 32,
  },
  lbSubmitBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  submittedBadge: {
    backgroundColor: '#E8F5E9', borderRadius: radius.lg,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  submittedText: { color: '#2E7D32', fontSize: 15, fontFamily: fonts.bold },
  viewLbBtn: { marginTop: 4 },
  viewLbBtnText: { color: colors.primary, fontSize: 14, fontFamily: fonts.semibold },
  restartBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 40,
  },
  restartBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  backLink: { marginTop: 4 },
  backLinkText: { color: colors.textMid, fontSize: 14, fontFamily: fonts.medium },

  // Submission modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalCancel: { fontSize: 16, fontFamily: fonts.regular, color: colors.textMid, width: 60 },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.textDark },
  modalBody: { padding: spacing.lg, gap: spacing.md },
  modalScoreLine: { fontSize: 28, fontFamily: fonts.extrabold, color: colors.primary, textAlign: 'center' },
  modalScoreSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', marginTop: -4 },
  modalLabel: {
    fontSize: 11, fontFamily: fonts.semibold, color: colors.textMid,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  modalInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: 15, fontFamily: fonts.regular, color: colors.textDark,
    backgroundColor: colors.surface,
  },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },

  // Intro screen
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  introBody: {
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: 32,
    gap: spacing.lg,
  },
  introEmoji: { fontSize: 56 },
  introTitle: { fontSize: 26, fontFamily: fonts.extrabold, color: colors.textDark, textAlign: 'center' },
  introSubtitle: {
    fontSize: 15, fontFamily: fonts.regular, color: colors.textMuted,
    textAlign: 'center', marginTop: -8,
  },
  introStatsRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  introStat: { flex: 1, alignItems: 'center', paddingVertical: 20, gap: 4 },
  introStatDivider: { width: 1.5, backgroundColor: colors.border },
  introStatValue: { fontSize: 28, fontFamily: fonts.extrabold, color: colors.primary },
  introStatLabel: {
    fontSize: 11, fontFamily: fonts.semibold, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  introCard: {
    width: '100%',
    backgroundColor: '#EEF6FF',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  introCardTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textDark },
  introCardBody: {
    fontSize: 13, fontFamily: fonts.regular, color: colors.textMid, lineHeight: 19,
  },
  introExamples: { gap: 4, marginTop: 4 },
  introExample: { fontSize: 12, fontFamily: fonts.medium, color: colors.textMuted },
  startBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
});
