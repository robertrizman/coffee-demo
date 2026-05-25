import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from './supabase';
import { colors, fonts, spacing, radius, shadow } from './theme';

import * as SecureStore from 'expo-secure-store';

const PRIZE_COMPLETED_KEY = 'quiz_prize_completed';
const BEAST_REVEALED_KEY  = 'quiz_prize_revealed_beast';
const SCAN_REVEALED_KEY   = 'quiz_prize_revealed_scan';

export default function QuizManagementScreen() {
  const navigation = useNavigation();

  const [quizName, setQuizName] = useState('');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState('5');
  const [questionsPerQuiz, setQuestionsPerQuiz] = useState('10');
  const [prizeModeEnabled, setPrizeModeEnabled] = useState(false);
  const [scoringMaxMinutes, setScoringMaxMinutes] = useState('5');
  const [savingConfig, setSavingConfig] = useState(false);

  // Debug state
  const [debugCompleted, setDebugCompleted] = useState(false);
  const [debugRevealed, setDebugRevealed] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState(['', '', '', '']);
  const [editAnswerIdx, setEditAnswerIdx] = useState(0);
  const [editFact, setEditFact] = useState('');
  const [savingQuestion, setSavingQuestion] = useState(false);

  useEffect(() => {
    loadConfig();
    loadQuestions();
    loadDebugState();
  }, []);

  const loadConfig = async () => {
    const { data: qc } = await supabase.from('quiz_config').select('*').eq('id', 'default').single();
    if (qc) {
      setQuizName(qc.quiz_name || '');
      setTimerEnabled(qc.timer_enabled || false);
      setTimerMinutes(String(Math.round((qc.timer_seconds || 300) / 60)));
      setQuestionsPerQuiz(String(qc.questions_per_quiz || 10));
      setPrizeModeEnabled(qc.prize_mode_enabled || false);
      setScoringMaxMinutes(String(Math.round((qc.scoring_max_seconds || 300) / 60)));
    }
  };

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    const { data } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('sort_order', { ascending: true });
    setQuestions(data || []);
    setLoadingQuestions(false);
  };

  const loadDebugState = async () => {
    const [c, br, sr] = await Promise.all([
      SecureStore.getItemAsync(PRIZE_COMPLETED_KEY),
      SecureStore.getItemAsync(BEAST_REVEALED_KEY),
      SecureStore.getItemAsync(SCAN_REVEALED_KEY),
    ]);
    setDebugCompleted(c === 'true');
    setDebugRevealed(br === 'true' || sr === 'true');
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    const mins = Math.max(1, parseInt(timerMinutes) || 5);
    const perQuiz = Math.max(1, parseInt(questionsPerQuiz) || 10);
    const scoringMins = Math.max(1, parseInt(scoringMaxMinutes) || 5);
    await supabase.from('quiz_config').update({
      quiz_name: quizName.trim() || 'Tealium Quiz',
      timer_enabled: timerEnabled,
      timer_seconds: mins * 60,
      questions_per_quiz: perQuiz,
      prize_mode_enabled: prizeModeEnabled,
      scoring_max_seconds: scoringMins * 60,
    }).eq('id', 'default');
    setSavingConfig(false);
    Alert.alert('Saved', 'Quiz settings updated.');
  };

  const debugSimulateComplete = async () => {
    await SecureStore.setItemAsync(PRIZE_COMPLETED_KEY, 'true');
    await SecureStore.deleteItemAsync(BEAST_REVEALED_KEY);
    await SecureStore.deleteItemAsync(SCAN_REVEALED_KEY);
    setDebugCompleted(true);
    setDebugRevealed(false);
    Alert.alert('Debug', 'Prize state set to: completed, not yet revealed.\n\nOpen the Fun Zone tab to see "Click to Reveal".');
  };

  const debugResetPrize = async () => {
    await SecureStore.deleteItemAsync(PRIZE_COMPLETED_KEY);
    await SecureStore.deleteItemAsync(BEAST_REVEALED_KEY);
    await SecureStore.deleteItemAsync(SCAN_REVEALED_KEY);
    setDebugCompleted(false);
    setDebugRevealed(false);
    Alert.alert('Debug', 'Prize state reset. Fun Zone tiles will show as locked again.');
  };

  const openAddQuestion = () => {
    setEditingQuestion(null);
    setEditQText('');
    setEditOptions(['', '', '', '']);
    setEditAnswerIdx(0);
    setEditFact('');
    setEditModalVisible(true);
  };

  const openEditQuestion = (q) => {
    setEditingQuestion(q);
    setEditQText(q.question || '');
    setEditOptions([...(q.options || []), '', '', '', ''].slice(0, 4));
    setEditAnswerIdx(q.answer_index ?? 0);
    setEditFact(q.fact || '');
    setEditModalVisible(true);
  };

  const saveQuestion = async () => {
    if (!editQText.trim()) { Alert.alert('Required', 'Question text is required.'); return; }
    if (editOptions.some(o => !o.trim())) { Alert.alert('Required', 'All 4 options are required.'); return; }
    setSavingQuestion(true);
    const payload = {
      question: editQText.trim(),
      options: editOptions.map(o => o.trim()),
      answer_index: editAnswerIdx,
      fact: editFact.trim() || null,
      sort_order: editingQuestion?.sort_order ?? questions.length + 1,
      is_active: editingQuestion?.is_active ?? true,
    };
    if (editingQuestion) {
      await supabase.from('quiz_questions').update(payload).eq('id', editingQuestion.id);
    } else {
      await supabase.from('quiz_questions').insert(payload);
    }
    setSavingQuestion(false);
    setEditModalVisible(false);
    loadQuestions();
  };

  const toggleQuestion = async (q) => {
    const next = !q.is_active;
    await supabase.from('quiz_questions').update({ is_active: next }).eq('id', q.id);
    setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, is_active: next } : item));
  };

  const deleteQuestion = (q) => {
    Alert.alert('Delete question', 'Remove this question?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('quiz_questions').delete().eq('id', q.id);
        loadQuestions();
      }},
    ]);
  };

  const activeCount = questions.filter(q => q.is_active).length;
  const perQuizNum = Math.max(1, parseInt(questionsPerQuiz) || 10);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Quiz Management</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Settings */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⚙️  Quiz Settings</Text>

          <Text style={styles.label}>Quiz Name</Text>
          <TextInput
            style={styles.input}
            value={quizName}
            onChangeText={setQuizName}
            placeholder="e.g. Tealium Trivia Challenge"
            placeholderTextColor={colors.textMuted}
          />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Quiz Timer</Text>
              <Text style={styles.rowSub}>Countdown for the whole quiz</Text>
            </View>
            <Switch
              value={timerEnabled}
              onValueChange={setTimerEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {timerEnabled && (
            <View style={{ gap: 4 }}>
              <Text style={styles.label}>Timer Duration (minutes)</Text>
              <TextInput
                style={[styles.input, { width: 120 }]}
                value={timerMinutes}
                onChangeText={setTimerMinutes}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )}

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>🎁  Prize Mode</Text>
              <Text style={styles.rowSub}>Hides feature tiles until quiz is completed</Text>
            </View>
            <Switch
              value={prizeModeEnabled}
              onValueChange={setPrizeModeEnabled}
              trackColor={{ false: colors.border, true: '#F9A825' }}
              thumbColor="#fff"
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Scoring Time Cap (minutes)</Text>
            <Text style={styles.rowSub}>Points drop to 0 at this time. Shorter = more speed pressure.</Text>
            <TextInput
              style={[styles.input, { width: 120 }]}
              value={scoringMaxMinutes}
              onChangeText={setScoringMaxMinutes}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Questions per quiz (pool: {questions.length} total)</Text>
            <TextInput
              style={[styles.input, { width: 120 }]}
              value={questionsPerQuiz}
              onChangeText={setQuestionsPerQuiz}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.textMuted}
            />
            {perQuizNum > activeCount && activeCount > 0 && (
              <Text style={styles.warningText}>⚠️ Only {activeCount} active questions — quiz will use all of them.</Text>
            )}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveConfig} disabled={savingConfig}>
            {savingConfig
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Settings</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Questions */}
        <View style={styles.card}>
          <View style={styles.questionHeader}>
            <Text style={styles.sectionTitle}>
              ❓  Questions ({activeCount} active / {questions.length} total)
            </Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAddQuestion}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {loadingQuestions ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : questions.length === 0 ? (
            <Text style={styles.emptyText}>No questions yet. Tap + Add to get started.</Text>
          ) : (
            questions.map((q, i) => (
              <View key={q.id} style={[styles.questionRow, !q.is_active && styles.questionRowInactive]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.questionText, !q.is_active && { color: colors.textMuted }]} numberOfLines={2}>
                    {i + 1}. {q.question}
                  </Text>
                  <Text style={styles.questionAnswer}>
                    ✓ {['A', 'B', 'C', 'D'][q.answer_index]}: {(q.options || [])[q.answer_index]}
                  </Text>
                </View>
                <View style={styles.questionActions}>
                  <Switch
                    value={!!q.is_active}
                    onValueChange={() => toggleQuestion(q)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                  <TouchableOpacity onPress={() => openEditQuestion(q)} style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteQuestion(q)} style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Debug card — prize mode only */}
        {prizeModeEnabled && (
          <View style={[styles.card, styles.debugCard]}>
            <Text style={styles.sectionTitle}>🐛  Prize Debug</Text>
            <Text style={styles.debugSubtitle}>
              Test the prize reveal flow on this device. These actions only affect your local device state.
            </Text>

            <View style={styles.debugStateRow}>
              <View style={styles.debugPill}>
                <Text style={styles.debugPillLabel}>Quiz completed</Text>
                <Text style={[styles.debugPillValue, { color: debugCompleted ? '#4CAF50' : colors.textMuted }]}>
                  {debugCompleted ? 'YES' : 'NO'}
                </Text>
              </View>
              <View style={styles.debugPill}>
                <Text style={styles.debugPillLabel}>Prize revealed</Text>
                <Text style={[styles.debugPillValue, { color: debugRevealed ? '#4CAF50' : colors.textMuted }]}>
                  {debugRevealed ? 'YES' : 'NO'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.debugBtn} onPress={debugSimulateComplete}>
              <Text style={styles.debugBtnText}>🎯  Simulate Quiz Completion</Text>
              <Text style={styles.debugBtnSub}>Sets state to "completed, not yet revealed" → Fun Zone shows Reveal button</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.debugBtn, styles.debugBtnReset]} onPress={debugResetPrize}>
              <Text style={[styles.debugBtnText, { color: '#c0392b' }]}>🔄  Reset Prize State</Text>
              <Text style={[styles.debugBtnSub, { color: '#c0392b' }]}>Clears all flags → Fun Zone shows locked tiles</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit / Add Question Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'left', 'right', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingQuestion ? 'Edit Question' : 'New Question'}</Text>
              <TouchableOpacity onPress={saveQuestion} disabled={savingQuestion}>
                {savingQuestion
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={styles.modalSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Question</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={editQText}
                onChangeText={setEditQText}
                multiline
                placeholder="Enter the question..."
                placeholderTextColor={colors.textMuted}
              />

              {['A', 'B', 'C', 'D'].map((letter, idx) => (
                <View key={idx}>
                  <Text style={styles.label}>Option {letter}</Text>
                  <TextInput
                    style={styles.input}
                    value={editOptions[idx]}
                    onChangeText={v => setEditOptions(prev => {
                      const next = [...prev]; next[idx] = v; return next;
                    })}
                    placeholder={`Option ${letter}`}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              ))}

              <Text style={styles.label}>Correct Answer</Text>
              <View style={styles.answerSelector}>
                {['A', 'B', 'C', 'D'].map((letter, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.answerOption, editAnswerIdx === idx && styles.answerOptionSelected]}
                    onPress={() => setEditAnswerIdx(idx)}
                  >
                    <Text style={[styles.answerOptionText, editAnswerIdx === idx && styles.answerOptionTextSelected]}>
                      {letter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Fun Fact (shown after answering)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                value={editFact}
                onChangeText={setEditFact}
                multiline
                placeholder="Optional explanation revealed after the player answers..."
                placeholderTextColor={colors.textMuted}
              />

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backIcon: { fontSize: 28, color: colors.primary, lineHeight: 32 },
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.textDark },

  body: { padding: spacing.md, gap: spacing.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.textDark },

  label: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textDark,
    backgroundColor: colors.background,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.textDark },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 1 },

  warningText: { fontSize: 12, fontFamily: fonts.regular, color: '#e07b39' },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },

  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: '#fff' },

  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: 16,
  },

  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  questionRowInactive: { opacity: 0.55 },
  questionText: { fontSize: 13, fontFamily: fonts.medium, color: colors.textDark, lineHeight: 18 },
  questionAnswer: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
  questionActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconBtn: { padding: 6 },
  iconBtnText: { fontSize: 16 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancel: { fontSize: 16, fontFamily: fonts.regular, color: colors.textMid, width: 60 },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.textDark },
  modalSaveText: { fontSize: 16, fontFamily: fonts.bold, color: colors.primary, width: 60, textAlign: 'right' },
  modalBody: { padding: spacing.md, gap: spacing.sm },

  debugCard: { borderWidth: 1.5, borderColor: '#F9A825', backgroundColor: '#FFFDE7' },
  debugSubtitle: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 17 },
  debugStateRow: { flexDirection: 'row', gap: spacing.sm },
  debugPill: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  debugPillLabel: { fontSize: 10, fontFamily: fonts.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  debugPillValue: { fontSize: 15, fontFamily: fonts.bold, marginTop: 2 },
  debugBtn: {
    backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: 3,
  },
  debugBtnReset: { borderColor: '#F44336' },
  debugBtnText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  debugBtnSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },

  answerSelector: { flexDirection: 'row', gap: spacing.sm },
  answerOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  answerOptionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  answerOptionText: { fontSize: 16, fontFamily: fonts.bold, color: colors.textMid },
  answerOptionTextSelected: { color: '#fff' },
});
