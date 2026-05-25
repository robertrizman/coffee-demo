import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from './supabase';
import { colors, fonts, spacing, radius, shadow } from './theme';

function formatTime(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Points = accuracy × 1000, minus 1 pt per second taken.
// 10/10 in 30s = 970 pts  |  10/10 in 120s = 880 pts  |  9/10 in 30s = 870 pts
function computePoints(score, total, timeSecs, maxSecs = 300) {
  if (!total || !maxSecs) return 0;
  const accuracy = score / total;
  const timeRatio = Math.min(1, (timeSecs || 0) / maxSecs);
  return Math.max(0, Math.round(accuracy * 1000 * (1 - timeRatio)));
}

export default function LeaderboardScreen() {
  const navigation = useNavigation();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quizName, setQuizName] = useState('Leaderboard');
  const [scoringMaxSecs, setScoringMaxSecs] = useState(300);

  const load = useCallback(async () => {
    const [{ data: config }, { data: rows }] = await Promise.all([
      supabase.from('quiz_config').select('quiz_name').eq('id', 'default').single(),
      supabase
        .from('quiz_leaderboard')
        .select('id, player_name, score, total_questions, time_seconds, created_at')
        .order('score', { ascending: false })
        .order('time_seconds', { ascending: true })
        .limit(50),
    ]);
    if (config?.quiz_name) setQuizName(config.quiz_name);
    const maxSecs = config?.scoring_max_seconds || 300;
    setScoringMaxSecs(maxSecs);
    const sorted = (rows || []).sort((a, b) =>
      computePoints(b.score, b.total_questions, b.time_seconds, maxSecs) -
      computePoints(a.score, a.total_questions, a.time_seconds, maxSecs)
    );
    setEntries(sorted);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>{quizName}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
        >
          {entries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={styles.emptyTitle}>No scores yet</Text>
              <Text style={styles.emptySub}>
                Be the first to complete the quiz and claim the top spot!
              </Text>
            </View>
          ) : (
            <>
              {/* Podium for top 3 */}
              {entries.length >= 3 && (
                <View style={styles.podium}>
                  <View style={[styles.podiumSlot, styles.podiumSecond]}>
                    <Text style={styles.podiumEmoji}>🥈</Text>
                    <Text style={styles.podiumName} numberOfLines={1}>{entries[1].player_name}</Text>
                    <Text style={styles.podiumScore}>{computePoints(entries[1].score, entries[1].total_questions, entries[1].time_seconds, scoringMaxSecs)}</Text>
                    <Text style={styles.podiumPts}>pts</Text>
                  </View>
                  <View style={[styles.podiumSlot, styles.podiumFirst]}>
                    <Text style={styles.podiumEmoji}>🥇</Text>
                    <Text style={styles.podiumName} numberOfLines={1}>{entries[0].player_name}</Text>
                    <Text style={styles.podiumScore}>{computePoints(entries[0].score, entries[0].total_questions, entries[0].time_seconds, scoringMaxSecs)}</Text>
                    <Text style={styles.podiumPts}>pts</Text>
                  </View>
                  <View style={[styles.podiumSlot, styles.podiumThird]}>
                    <Text style={styles.podiumEmoji}>🥉</Text>
                    <Text style={styles.podiumName} numberOfLines={1}>{entries[2].player_name}</Text>
                    <Text style={styles.podiumScore}>{computePoints(entries[2].score, entries[2].total_questions, entries[2].time_seconds, scoringMaxSecs)}</Text>
                    <Text style={styles.podiumPts}>pts</Text>
                  </View>
                </View>
              )}

              {/* Full ranked list */}
              <View style={styles.listCard}>
                {entries.map((e, i) => (
                  <View key={e.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                    <View style={styles.rankBox}>
                      <Text style={styles.rankNum}>{i + 1}</Text>
                    </View>
                    <View style={styles.nameRow}>
                      {i < 3 && <Text style={styles.listMedal}>{['🥇','🥈','🥉'][i]}</Text>}
                      <Text style={styles.listName} numberOfLines={1}>{e.player_name}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <View style={styles.listPtsRow}>
                        <Text style={styles.listScore}>{computePoints(e.score, e.total_questions, e.time_seconds, scoringMaxSecs)}</Text>
                        <Text style={styles.listPtsLabel}>pts</Text>
                      </View>
                      <Text style={styles.listDate}>{formatDate(e.completed_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backIcon: { fontSize: 28, color: colors.primary, lineHeight: 32 },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.textDark },
  subtitle: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 1 },

  body: { padding: spacing.md, gap: spacing.md },

  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textDark },
  emptySub: {
    fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted,
    textAlign: 'center', lineHeight: 20, maxWidth: 260,
  },

  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  podiumSlot: {
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 3,
    flex: 1,
  },
  podiumFirst: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 20,
    borderWidth: 1.5,
    borderColor: '#F9A825',
  },
  podiumSecond: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#9E9E9E',
  },
  podiumThird: {
    backgroundColor: '#FBE9E7',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#BF360C',
  },
  podiumEmoji: { fontSize: 28 },
  podiumName: { fontSize: 12, fontFamily: fonts.bold, color: colors.textDark, textAlign: 'center' },
  podiumScore: { fontSize: 18, fontFamily: fonts.extrabold, color: colors.primary },
  podiumPts: { fontSize: 10, fontFamily: fonts.semibold, color: colors.primary, marginTop: -4, letterSpacing: 0.5, textTransform: 'uppercase' },
  podiumTime: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  listRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  rankBox: { width: 32, alignItems: 'center' },
  rankNum: { fontSize: 14, fontFamily: fonts.bold, color: colors.textMuted },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  listMedal: { fontSize: 18 },
  listName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.textDark },
  listRight: { alignItems: 'flex-end', gap: 1 },
  listPtsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  listScore: { fontSize: 15, fontFamily: fonts.bold, color: colors.primary },
  listPtsLabel: { fontSize: 10, fontFamily: fonts.semibold, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  listTime: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  listDate: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
});
