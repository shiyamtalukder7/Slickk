import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type LearningAction = 'correct' | 'hint' | 'wrong';

const clamp = (value: number, minimum = 0, maximum = 100) => {
  return Math.min(maximum, Math.max(minimum, value));
};

export default function LearningTwinScreen() {
  const [mastery, setMastery] = useState(24);
  const [confidence, setConfidence] = useState(38);
  const [attempts, setAttempts] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [lastAction, setLastAction] =
    useState<LearningAction | null>(null);

  const teachingStrategy = useMemo(() => {
    if (mastery < 30 || confidence < 30) {
      return {
        name: 'Foundation mode',
        description:
          'Slickk should explain slowly with visual examples and very small steps.',
        icon: 'layers-outline' as const,
      };
    }

    if (mastery < 65 || confidence < 60) {
      return {
        name: 'Guided practice',
        description:
          'Slickk should give hints, worked examples and one question at a time.',
        icon: 'compass-outline' as const,
      };
    }

    if (mastery < 85) {
      return {
        name: 'Independent practice',
        description:
          'Slickk should reduce hints and test whether the skill can be used independently.',
        icon: 'school-outline' as const,
      };
    }

    return {
      name: 'Challenge mode',
      description:
        'Slickk should introduce harder problems and connect this skill to new topics.',
      icon: 'rocket-outline' as const,
    };
  }, [confidence, mastery]);

  const reviewPriority = useMemo(() => {
    const mistakePenalty = wrongAnswers * 8;
    const hintPenalty = hintsUsed * 4;
    const confidencePenalty = 100 - confidence;
    const masteryPenalty = 100 - mastery;

    return clamp(
      Math.round(
        masteryPenalty * 0.45 +
          confidencePenalty * 0.3 +
          mistakePenalty +
          hintPenalty
      )
    );
  }, [
    confidence,
    hintsUsed,
    mastery,
    wrongAnswers,
  ]);

  const accuracy = useMemo(() => {
    if (attempts === 0) {
      return 0;
    }

    return Math.round((correctAnswers / attempts) * 100);
  }, [attempts, correctAnswers]);

  const statusMessage = useMemo(() => {
    if (lastAction === 'correct') {
      return 'Good progress. Slickk increased mastery and confidence.';
    }

    if (lastAction === 'hint') {
      return 'Hint recorded. Slickk will use more guided examples.';
    }

    if (lastAction === 'wrong') {
      return 'Misconception detected. Slickk will slow down and reteach.';
    }

    return 'Complete a learning check to update your Learning Twin.';
  }, [lastAction]);

  const recordLearningAction = (action: LearningAction) => {
    setAttempts((current) => current + 1);
    setLastAction(action);

    if (action === 'correct') {
      setCorrectAnswers((current) => current + 1);
      setMastery((current) => clamp(current + 9));
      setConfidence((current) => clamp(current + 7));
      return;
    }

    if (action === 'hint') {
      setHintsUsed((current) => current + 1);
      setMastery((current) => clamp(current + 3));
      setConfidence((current) => clamp(current + 2));
      return;
    }

    setWrongAnswers((current) => current + 1);
    setMastery((current) => clamp(current - 3));
    setConfidence((current) => clamp(current - 6));
  };

  const resetTwin = () => {
    setMastery(24);
    setConfidence(38);
    setAttempts(0);
    setCorrectAnswers(0);
    setWrongAnswers(0);
    setHintsUsed(0);
    setLastAction(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glow} />

        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#FFFFFF"
            />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.headerLabel}>
              SLICKK INTELLIGENCE
            </Text>

            <Text style={styles.headerTitle}>
              Learning Twin
            </Text>
          </View>

          <Pressable
            onPress={resetTwin}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="refresh"
              size={21}
              color="#70F7D4"
            />
          </Pressable>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.twinAvatar}>
            <Ionicons
              name="sparkles"
              size={31}
              color="#081426"
            />
          </View>

          <View style={styles.identityText}>
            <Text style={styles.identityLabel}>
              YOUR ADAPTIVE LEARNING MODEL
            </Text>

            <Text style={styles.identityTitle}>
              Slickk is learning how you learn
            </Text>

            <Text style={styles.identityDescription}>
              Every answer, mistake and hint changes the way your tutor teaches.
            </Text>
          </View>
        </View>

        <View style={styles.topicCard}>
          <View style={styles.topicHeader}>
            <View>
              <Text style={styles.cardLabel}>
                CURRENT SKILL
              </Text>

              <Text style={styles.topicTitle}>
                Understanding fractions
              </Text>
            </View>

            <View style={styles.subjectIcon}>
              <Ionicons
                name="calculator-outline"
                size={24}
                color="#70F7D4"
              />
            </View>
          </View>

          <View style={styles.metricSection}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricName}>
                Mastery
              </Text>

              <Text style={styles.metricValue}>
                {mastery}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.masteryFill,
                  { width: `${mastery}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.metricSection}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricName}>
                Confidence
              </Text>

              <Text style={styles.metricValue}>
                {confidence}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.confidenceFill,
                  { width: `${confidence}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {attempts}
              </Text>

              <Text style={styles.statLabel}>
                Attempts
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {accuracy}%
              </Text>

              <Text style={styles.statLabel}>
                Accuracy
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {hintsUsed}
              </Text>

              <Text style={styles.statLabel}>
                Hints
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.strategyCard}>
          <View style={styles.strategyIcon}>
            <Ionicons
              name={teachingStrategy.icon}
              size={25}
              color="#70F7D4"
            />
          </View>

          <View style={styles.strategyText}>
            <Text style={styles.cardLabel}>
              SELECTED TEACHING STRATEGY
            </Text>

            <Text style={styles.strategyTitle}>
              {teachingStrategy.name}
            </Text>

            <Text style={styles.strategyDescription}>
              {teachingStrategy.description}
            </Text>
          </View>
        </View>

        <View style={styles.priorityCard}>
          <View style={styles.priorityHeader}>
            <View>
              <Text style={styles.cardLabel}>
                REVIEW PRIORITY
              </Text>

              <Text style={styles.priorityTitle}>
                {reviewPriority >= 70
                  ? 'Review soon'
                  : reviewPriority >= 40
                    ? 'Normal review'
                    : 'Skill is stable'}
              </Text>
            </View>

            <Text style={styles.priorityValue}>
              {reviewPriority}
            </Text>
          </View>

          <Text style={styles.priorityDescription}>
            This score changes using mastery, confidence, mistakes and hints.
          </Text>
        </View>

        <View style={styles.signalCard}>
          <Ionicons
            name={
              lastAction === 'wrong'
                ? 'warning-outline'
                : lastAction === 'correct'
                  ? 'checkmark-circle-outline'
                  : 'pulse-outline'
            }
            size={24}
            color="#70F7D4"
          />

          <Text style={styles.signalText}>
            {statusMessage}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Update the Learning Twin
        </Text>

        <Text style={styles.sectionDescription}>
          Test the local intelligence engine by selecting what happened during
          the lesson.
        </Text>

        <Pressable
          onPress={() =>
            recordLearningAction('correct')
          }
          style={({ pressed }) => [
            styles.actionButton,
            styles.correctButton,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.actionIcon}>
            <Ionicons
              name="checkmark"
              size={23}
              color="#081426"
            />
          </View>

          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>
              I understood it
            </Text>

            <Text style={styles.actionDescription}>
              Increase mastery and confidence
            </Text>
          </View>

          <Ionicons
            name="arrow-forward"
            size={21}
            color="#081426"
          />
        </Pressable>

        <Pressable
          onPress={() => recordLearningAction('hint')}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.secondaryIcon}>
            <Ionicons
              name="bulb-outline"
              size={23}
              color="#70F7D4"
            />
          </View>

          <View style={styles.actionText}>
            <Text style={styles.secondaryTitle}>
              I needed a hint
            </Text>

            <Text style={styles.secondaryDescription}>
              Slickk will provide more guidance
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={20}
            color="#65748A"
          />
        </Pressable>

        <Pressable
          onPress={() => recordLearningAction('wrong')}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.secondaryIcon}>
            <Ionicons
              name="close-outline"
              size={25}
              color="#FF9D9D"
            />
          </View>

          <View style={styles.actionText}>
            <Text style={styles.secondaryTitle}>
              I got it wrong
            </Text>

            <Text style={styles.secondaryDescription}>
              Detect a possible misconception
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={20}
            color="#65748A"
          />
        </Pressable>

        <View style={styles.futureCard}>
          <Ionicons
            name="hardware-chip-outline"
            size={24}
            color="#70F7D4"
          />

          <View style={styles.futureText}>
            <Text style={styles.futureTitle}>
              Running inside your APK
            </Text>

            <Text style={styles.futureDescription}>
              This first engine does not call Gemini, OpenAI or another AI API.
              Later we will connect it to Slickk’s on-device model, lesson
              history and permanent student database.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 20,
    paddingBottom: 42,
    backgroundColor: '#07101E',
    overflow: 'hidden',
  },

  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -150,
    right: -120,
    backgroundColor: 'rgba(56, 238, 201, 0.09)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C192A',
  },

  headerText: {
    flex: 1,
    alignItems: 'center',
  },

  headerLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },

  identityCard: {
    flexDirection: 'row',
    padding: 19,
    marginTop: 27,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1B4144',
    backgroundColor: '#0A222A',
  },

  twinAvatar: {
    width: 57,
    height: 57,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  identityText: {
    flex: 1,
    marginLeft: 15,
  },

  identityLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  identityTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    marginTop: 5,
  },

  identityDescription: {
    color: '#87A0A7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  topicCard: {
    padding: 19,
    marginTop: 17,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1A2D43',
    backgroundColor: '#0B1727',
  },

  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  cardLabel: {
    color: '#718096',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  topicTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
  },

  subjectIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  metricSection: {
    marginTop: 21,
  },

  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  metricName: {
    color: '#A5B2C4',
    fontSize: 12,
    fontWeight: '700',
  },

  metricValue: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '900',
  },

  progressTrack: {
    height: 8,
    borderRadius: 10,
    marginTop: 9,
    backgroundColor: '#17263A',
    overflow: 'hidden',
  },

  masteryFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#70F7D4',
  },

  confidenceFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#6BA7FF',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },

  statLabel: {
    color: '#718096',
    fontSize: 9,
    marginTop: 4,
  },

  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#203047',
  },

  strategyCard: {
    flexDirection: 'row',
    padding: 18,
    marginTop: 17,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1D3945',
    backgroundColor: '#0A2028',
  },

  strategyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#103139',
  },

  strategyText: {
    flex: 1,
    marginLeft: 14,
  },

  strategyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 5,
  },

  strategyDescription: {
    color: '#87A0A7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  priorityCard: {
    padding: 18,
    marginTop: 17,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1A2D43',
    backgroundColor: '#0B1727',
  },

  priorityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  priorityTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 5,
  },

  priorityValue: {
    color: '#70F7D4',
    fontSize: 32,
    fontWeight: '900',
  },

  priorityDescription: {
    color: '#718096',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },

  signalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 17,
    borderRadius: 18,
    backgroundColor: '#102032',
  },

  signalText: {
    flex: 1,
    color: '#A8B5C7',
    fontSize: 12,
    lineHeight: 18,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 31,
  },

  sectionDescription: {
    color: '#8492A8',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 16,
  },

  actionButton: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
  },

  correctButton: {
    backgroundColor: '#70F7D4',
  },

  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 20, 38, 0.10)',
  },

  actionText: {
    flex: 1,
    marginHorizontal: 13,
  },

  actionTitle: {
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
  },

  actionDescription: {
    color: '#315B58',
    fontSize: 11,
    marginTop: 4,
  },

  secondaryAction: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginTop: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A2D43',
    backgroundColor: '#0B1727',
  },

  secondaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  secondaryTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  secondaryDescription: {
    color: '#718096',
    fontSize: 11,
    marginTop: 4,
  },

  futureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 18,
    marginTop: 25,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#1D3945',
    backgroundColor: '#0A2028',
  },

  futureText: {
    flex: 1,
  },

  futureTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  futureDescription: {
    color: '#87A0A7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});