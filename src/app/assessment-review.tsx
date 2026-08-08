import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadSlickkSession } from '@/services/api-auth';
import {
  loadAssessmentDraft,
  saveAssessmentHistory,
  submitVerifiedAssessment,
  type AssessmentSubmissionDraft,
} from '@/services/weekly-assessment';

type Decision = 'correct' | 'incorrect' | 'unreviewed';

function subjectKey(subject: string) {
  return subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
}

export default function AssessmentReviewScreen() {
  const [draft, setDraft] = useState<AssessmentSubmissionDraft | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canVerify, setCanVerify] = useState(false);

  useEffect(() => {
    void Promise.all([loadAssessmentDraft(), loadSlickkSession(true)])
      .then(([loaded, session]) => {
        if (!loaded) throw new Error('No assessment submission is waiting for review.');
        setCanVerify(['local', 'teacher', 'school-admin'].includes(session.role));
        setDraft(loaded);
        setDecisions(Object.fromEntries(loaded.assessment.questions.map((question) => [question.id, 'unreviewed'])));
      })
      .catch((problem) => setError(problem instanceof Error ? problem.message : 'The review could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const reviewedCount = useMemo(
    () => Object.values(decisions).filter((decision) => decision !== 'unreviewed').length,
    [decisions]
  );

  const confirm = async () => {
    if (!draft || reviewedCount === 0 || saving || !canVerify) return;
    const unreviewed = draft.assessment.questions.length - reviewedCount;
    if (unreviewed > 0) {
      Alert.alert('Review every question', `${unreviewed} question${unreviewed === 1 ? '' : 's'} still need an educator decision.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const results = draft.assessment.questions.map((question) => ({
        subjectKey: subjectKey(question.subject),
        observation: decisions[question.id] as 'correct' | 'incorrect',
        hintsUsed: 0,
      }));
      await submitVerifiedAssessment(
        draft.assessment.studentId,
        results
      );
      await saveAssessmentHistory(draft.assessment, results);
      Alert.alert('Results verified', 'The Learning Twin and next review schedule were updated from educator-confirmed evidence.', [
        { text: 'Done', onPress: () => router.replace('/learning-plan' as Href) },
      ]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Verified results could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color="#FFFFFF" /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>EDUCATOR VERIFICATION</Text><Text style={styles.title}>Review answer evidence</Text></View>
        </View>

        {loading ? <ActivityIndicator size="large" color="#70F7D4" style={styles.loader} /> : null}
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

        {draft ? (
          <>
            <View style={styles.ocrCard}>
              <View style={styles.ocrHeader}><Ionicons name="scan-outline" size={19} color="#70F7D4" /><Text style={styles.ocrTitle}>OCR evidence</Text></View>
              <Text style={styles.ocrNotice}>OCR is a reading aid, not a grade. Compare this text with the uploaded answer-sheet image before confirming.</Text>
              <Text style={styles.ocrText}>{draft.ocrText || 'No reliable text was extracted. Review the original image manually.'}</Text>
            </View>

            {!canVerify ? (
              <View style={styles.pendingCard}>
                <Ionicons name="time-outline" size={20} color="#E6C66A" />
                <Text style={styles.pendingText}>Submission saved. A teacher or school administrator must sign in on an authorized device to verify marks and update mastery.</Text>
              </View>
            ) : null}

            <View style={styles.progressRow}><Text style={styles.progressText}>{reviewedCount} of {draft.assessment.questions.length} reviewed</Text><Text style={styles.progressText}>{draft.assessment.totalPoints} marks</Text></View>

            {draft.assessment.questions.map((question) => (
              <View key={question.id} style={styles.questionCard}>
                <Text style={styles.questionMeta}>QUESTION {question.number} • {question.subject.toUpperCase()}</Text>
                <Text style={styles.prompt}>{question.prompt}</Text>
                <View style={styles.decisions}>
                  {(['correct', 'incorrect'] as const).map((decision) => (
                    <Pressable
                      key={decision}
                      disabled={!canVerify}
                      accessibilityRole="button"
                      accessibilityState={{ selected: decisions[question.id] === decision }}
                      onPress={() => setDecisions((current) => ({ ...current, [question.id]: decision }))}
                      style={[styles.decisionButton, decisions[question.id] === decision && (decision === 'correct' ? styles.correctSelected : styles.incorrectSelected)]}
                    >
                      <Ionicons name={decision === 'correct' ? 'checkmark-circle-outline' : 'close-circle-outline'} size={18} color={decisions[question.id] === decision ? '#07101E' : decision === 'correct' ? '#70F7D4' : '#FF9CAF'} />
                      <Text style={[styles.decisionText, decisions[question.id] === decision && styles.selectedText]}>{decision === 'correct' ? 'Meets rubric' : 'Needs support'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            <Pressable disabled={saving || reviewedCount === 0 || !canVerify} onPress={() => void confirm()} style={[styles.confirmButton, (saving || reviewedCount === 0 || !canVerify) && styles.disabled]}>
              {saving ? <ActivityIndicator color="#07101E" /> : <><Text style={styles.confirmText}>Confirm verified results</Text><Ionicons name="shield-checkmark" size={20} color="#07101E" /></>}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07101E' }, content: { padding: 20, paddingBottom: 48, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13 }, back: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#122035', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 },
  eyebrow: { color: '#70F7D4', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 }, loader: { marginTop: 50 },
  error: { padding: 13, borderRadius: 14, backgroundColor: '#341C26' }, errorText: { color: '#FFB4C2', lineHeight: 19 },
  pendingCard: { padding: 13, borderRadius: 14, backgroundColor: '#302A19', borderWidth: 1, borderColor: '#66572A', flexDirection: 'row', alignItems: 'center', gap: 10 }, pendingText: { flex: 1, color: '#F2DA94', fontSize: 11, lineHeight: 17 },
  ocrCard: { padding: 15, borderRadius: 19, backgroundColor: '#0C192A', borderWidth: 1, borderColor: '#1D3048' }, ocrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, ocrTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, ocrNotice: { color: '#E6C66A', fontSize: 10, lineHeight: 16, marginTop: 8 }, ocrText: { color: '#AAB8C9', fontSize: 11, lineHeight: 18, marginTop: 10, maxHeight: 180 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' }, progressText: { color: '#8293A8', fontSize: 11, fontWeight: '700' },
  questionCard: { padding: 15, borderRadius: 18, backgroundColor: '#0C192A', borderWidth: 1, borderColor: '#1D3048' }, questionMeta: { color: '#70F7D4', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 }, prompt: { color: '#EDF2F8', fontSize: 13, lineHeight: 20, fontWeight: '700', marginTop: 6 },
  decisions: { flexDirection: 'row', gap: 8, marginTop: 13 }, decisionButton: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#33475F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, correctSelected: { backgroundColor: '#70F7D4', borderColor: '#70F7D4' }, incorrectSelected: { backgroundColor: '#FF9CAF', borderColor: '#FF9CAF' }, decisionText: { color: '#AAB8C9', fontSize: 10, fontWeight: '800' }, selectedText: { color: '#07101E' },
  confirmButton: { minHeight: 54, borderRadius: 16, backgroundColor: '#70F7D4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5 }, confirmText: { color: '#07101E', fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.4 },
});
