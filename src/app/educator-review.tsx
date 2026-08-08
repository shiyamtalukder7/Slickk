import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadSlickkSession } from '@/services/api-auth';
import {
  loadTrainingReviewQueue,
  submitTrainingReview,
  type TrainingCandidate,
  type TrainingReviewCheck,
} from '@/services/training-reviews';

const CHECKS: { key: TrainingReviewCheck; label: string; help: string }[] = [
  { key: 'factualGrounding', label: 'Factually grounded', help: 'Accurate and supported by the cited source.' },
  { key: 'ageAppropriateness', label: 'Age appropriate', help: 'Language and difficulty fit this learner.' },
  { key: 'teachingQuality', label: 'Teaches well', help: 'Guides thinking instead of only giving an answer.' },
  { key: 'safety', label: 'Safe and respectful', help: 'No harmful, biased, or private information.' },
];

const emptyChecks = (): Record<TrainingReviewCheck, boolean> => ({
  factualGrounding: false,
  ageAppropriateness: false,
  teachingQuality: false,
  safety: false,
});

export default function EducatorReviewScreen() {
  const [items, setItems] = useState<TrainingCandidate[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [checks, setChecks] = useState(emptyChecks);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadQueue = useCallback(async () => {
    try {
      const session = await loadSlickkSession(true);
      setError('');
      if (!['local', 'teacher', 'school-admin'].includes(session.role)) {
        throw new Error('An educator or school administrator access key is required.');
      }
      const queue = await loadTrainingReviewQueue();
      setItems(queue.items);
      setCounts(queue.counts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadQueue);
  }, [loadQueue]);

  const candidate = items[0];
  const allChecksPass = CHECKS.every(({ key }) => checks[key]);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!candidate || saving) return;
    setError('');
    setNotice('');
    if (decision === 'approved' && !allChecksPass) {
      setError('Approval requires all four educator checks.');
      return;
    }
    setSaving(true);
    try {
      await submitTrainingReview(candidate.id, { decision, checks, notes });
      setItems((current) => current.slice(1));
      setChecks(emptyChecks());
      setNotes('');
      setCounts((current) => ({
        ...current,
        'awaiting-reviewed-response': Math.max(0, (current['awaiting-reviewed-response'] ?? 1) - 1),
        [decision === 'approved' ? 'educator-approved' : 'educator-rejected']:
          (current[decision === 'approved' ? 'educator-approved' : 'educator-rejected'] ?? 0) + 1,
      }));
      setNotice(decision === 'approved' ? 'Approved for the governed training dataset.' : 'Rejected and excluded from training.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The review could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void loadQueue(); }} tintColor="#6EE7B7" />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color="#E8F0FF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>EDUCATOR QUALITY GATE</Text>
            <Text style={styles.title}>Review AI lessons</Text>
          </View>
        </View>

        <Text style={styles.intro}>Only educator-approved, openly licensed examples can enter Slickk&apos;s training dataset. Student conversations stay excluded.</Text>

        <View style={styles.stats}>
          <Text style={styles.stat}>{counts['awaiting-reviewed-response'] ?? items.length} waiting</Text>
          <Text style={styles.stat}>{counts['educator-approved'] ?? 0} approved</Text>
          <Text style={styles.stat}>{counts['educator-rejected'] ?? 0} rejected</Text>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        {notice ? <View style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View> : null}

        {loading && !candidate ? <ActivityIndicator size="large" color="#6EE7B7" style={styles.loader} /> : null}

        {!loading && !candidate && !error ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={42} color="#6EE7B7" />
            <Text style={styles.emptyTitle}>Review queue complete</Text>
            <Text style={styles.muted}>There are no generated lessons waiting for an educator.</Text>
          </View>
        ) : null}

        {candidate ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SOURCE</Text>
            <Text style={styles.cardTitle}>{candidate.source?.title ?? 'Untitled learning material'}</Text>
            <Text style={styles.meta}>{[candidate.learnerContext?.curriculum, candidate.learnerContext?.grade, candidate.learnerContext?.subject, candidate.source?.page ? `Page ${candidate.source.page}` : null].filter(Boolean).join(' • ')}</Text>
            <Text style={styles.sourceText}>{candidate.source?.content ?? 'No source excerpt was provided.'}</Text>

            <Text style={styles.cardLabel}>TEACHING GOAL</Text>
            <Text style={styles.body}>{candidate.task?.goal ?? candidate.task?.kind ?? 'Review this generated response.'}</Text>

            <Text style={styles.cardLabel}>AI RESPONSE</Text>
            <Text style={styles.response}>{candidate.generatedResponse}</Text>

            <Text style={styles.sectionTitle}>Required checks</Text>
            {CHECKS.map((check) => (
              <View key={check.key} style={styles.checkRow}>
                <View style={styles.checkCopy}>
                  <Text style={styles.checkLabel}>{check.label}</Text>
                  <Text style={styles.checkHelp}>{check.help}</Text>
                </View>
                <Switch value={checks[check.key]} onValueChange={(value) => setChecks((current) => ({ ...current, [check.key]: value }))} trackColor={{ false: '#344258', true: '#237A63' }} thumbColor={checks[check.key] ? '#6EE7B7' : '#BBC7D8'} />
              </View>
            ))}

            <TextInput
              accessibilityLabel="Educator review notes"
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="Add review notes (recommended when rejecting)"
              placeholderTextColor="#708098"
              style={styles.notes}
            />

            <View style={styles.actions}>
              <Pressable disabled={saving} onPress={() => void decide('rejected')} style={({ pressed }) => [styles.button, styles.reject, pressed && styles.pressed]}>
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
              <Pressable disabled={saving || !allChecksPass} onPress={() => void decide('approved')} style={({ pressed }) => [styles.button, styles.approve, (!allChecksPass || saving) && styles.disabled, pressed && styles.pressed]}>
                {saving ? <ActivityIndicator color="#07101E" /> : <Text style={styles.approveText}>Approve</Text>}
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07101E' },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#142033', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 }, eyebrow: { color: '#6EE7B7', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#F6F8FC', fontSize: 28, fontWeight: '800' },
  intro: { color: '#AAB8CC', fontSize: 15, lineHeight: 22 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { color: '#CFD8E8', backgroundColor: '#142033', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, fontWeight: '700' },
  errorBox: { backgroundColor: '#3B1D29', borderRadius: 12, padding: 12 }, errorText: { color: '#FFB4C2' },
  noticeBox: { backgroundColor: '#12372F', borderRadius: 12, padding: 12 }, noticeText: { color: '#A7F3D0' },
  loader: { marginTop: 60 }, empty: { alignItems: 'center', gap: 8, backgroundColor: '#101B2C', borderRadius: 20, padding: 30 },
  emptyTitle: { color: '#F6F8FC', fontSize: 19, fontWeight: '800' }, muted: { color: '#91A0B7', textAlign: 'center' },
  card: { backgroundColor: '#101B2C', borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: '#22324A' },
  cardLabel: { color: '#6EE7B7', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 6 },
  cardTitle: { color: '#F6F8FC', fontSize: 20, fontWeight: '800' }, meta: { color: '#91A0B7', fontSize: 13 },
  sourceText: { color: '#C6D0DF', lineHeight: 21, backgroundColor: '#0A1422', borderRadius: 12, padding: 13 },
  body: { color: '#DCE4EF', fontSize: 15, lineHeight: 22 }, response: { color: '#F1F5F9', fontSize: 16, lineHeight: 24, backgroundColor: '#17263B', borderRadius: 14, padding: 14 },
  sectionTitle: { color: '#F6F8FC', fontSize: 18, fontWeight: '800', marginTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2B3A50' },
  checkCopy: { flex: 1 }, checkLabel: { color: '#E8EEF7', fontWeight: '700' }, checkHelp: { color: '#8291A8', fontSize: 12, lineHeight: 17, marginTop: 2 },
  notes: { color: '#F6F8FC', minHeight: 92, textAlignVertical: 'top', backgroundColor: '#0A1422', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: '#2B3A50' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 }, button: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reject: { borderWidth: 1, borderColor: '#F28DA4' }, rejectText: { color: '#FFB4C2', fontWeight: '800' },
  approve: { backgroundColor: '#6EE7B7' }, approveText: { color: '#07101E', fontWeight: '900' }, disabled: { opacity: 0.38 }, pressed: { opacity: 0.75 },
});
