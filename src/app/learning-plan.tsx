import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadPersonalLearningPlan, type LearningPlanItem, type PersonalLearningPlan } from '@/services/learning-plan';

const ACTIONS = {
  'guided-practice': { label: 'Repair a weak skill', icon: 'construct-outline' },
  'spaced-review': { label: 'Review before forgetting', icon: 'repeat-outline' },
  'short-check': { label: 'Quick diagnostic', icon: 'pulse-outline' },
} as const;

export default function LearningPlanScreen() {
  const [plan, setPlan] = useState<PersonalLearningPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const controller = new AbortController();
    try {
      const result = await loadPersonalLearningPlan(controller.signal);
      setPlan(result);
      setError('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Today’s plan could not be loaded.');
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const startLesson = (item: LearningPlanItem) => {
    router.push({ pathname: '/tutor', params: { subject: item.subject, prompt: item.tutorPrompt } } as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load(); }} tintColor="#70F7D4" />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ADAPTIVE DAILY PATH</Text>
            <Text style={styles.title}>Today’s learning plan</Text>
          </View>
        </View>

        {plan ? (
          <View style={styles.summary}>
            <View><Text style={styles.summaryValue}>{plan.items.length}</Text><Text style={styles.summaryLabel}>focused lessons</Text></View>
            <View style={styles.divider} />
            <View><Text style={styles.summaryValue}>{plan.totalMinutes}</Text><Text style={styles.summaryLabel}>minutes total</Text></View>
            <View style={styles.divider} />
            <View><Text style={styles.summaryValue}>{plan.grade || 'Ready'}</Text><Text style={styles.summaryLabel}>personal level</Text></View>
          </View>
        ) : null}

        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        {loading && !plan ? <ActivityIndicator size="large" color="#70F7D4" style={styles.loader} /> : null}

        {plan?.items.map((item) => {
          const action = ACTIONS[item.action];
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.priority}><Text style={styles.priorityText}>{item.priority}</Text></View>
                <View style={styles.cardCopy}>
                  <Text style={styles.subject}>{item.subject}</Text>
                  <Text style={styles.topic}>{item.topic}</Text>
                </View>
                <Text style={styles.minutes}>{item.durationMinutes} min</Text>
              </View>

              <View style={styles.actionRow}>
                <Ionicons name={action.icon} size={17} color="#70F7D4" />
                <Text style={styles.actionText}>{action.label}</Text>
              </View>

              <Text style={styles.reason}>
                {item.reasons.length ? item.reasons.join(' • ') : 'Build enough evidence to personalize this subject.'}
              </Text>

              <Pressable accessibilityRole="button" onPress={() => startLesson(item)} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}>
                <Text style={styles.startText}>Start personalized lesson</Text>
                <Ionicons name="arrow-forward" size={18} color="#07101E" />
              </Pressable>
            </View>
          );
        })}

        {!loading && plan?.items.length === 0 ? (
          <View style={styles.empty}><Ionicons name="school-outline" size={38} color="#70F7D4" /><Text style={styles.emptyTitle}>Add subjects to begin</Text><Text style={styles.reason}>Complete the student profile so Slickk can create a personalized daily path.</Text></View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07101E' }, content: { padding: 20, paddingBottom: 48, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, back: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#122035', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 },
  eyebrow: { color: '#70F7D4', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 3 },
  summary: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0C192A', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#1C3048' },
  summaryValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center' }, summaryLabel: { color: '#8293A8', fontSize: 9, marginTop: 3, textAlign: 'center' }, divider: { width: 1, height: 34, backgroundColor: '#263A52' },
  error: { backgroundColor: '#321B24', borderRadius: 14, padding: 13 }, errorText: { color: '#FFB4C2' }, loader: { marginTop: 60 },
  card: { backgroundColor: '#0C192A', borderRadius: 21, padding: 16, borderWidth: 1, borderColor: '#1C3048' }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  priority: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#70F7D4', alignItems: 'center', justifyContent: 'center' }, priorityText: { color: '#07101E', fontWeight: '900' }, cardCopy: { flex: 1 }, subject: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' }, topic: { color: '#8798AD', fontSize: 11, marginTop: 2 }, minutes: { color: '#70F7D4', fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 }, actionText: { color: '#DDE6F2', fontSize: 13, fontWeight: '800' }, reason: { color: '#8798AD', fontSize: 11, lineHeight: 17, marginTop: 7 },
  startButton: { minHeight: 46, marginTop: 14, borderRadius: 14, backgroundColor: '#70F7D4', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, startText: { color: '#07101E', fontSize: 13, fontWeight: '900' }, pressed: { opacity: 0.75 },
  empty: { alignItems: 'center', gap: 7, backgroundColor: '#0C192A', borderRadius: 20, padding: 28 }, emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
});
