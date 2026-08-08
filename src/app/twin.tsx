import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  loadLearningTwinState,
  type LearningAction,
  type LearningTwinState,
} from '@/services/learning-twin';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
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

const clamp = (value: number, minimum = 0, maximum = 100) => {
  return Math.min(maximum, Math.max(minimum, value));
};

export default function LearningTwinScreen() {
  const [topic, setTopic] =
    useState('General learning');

  const [skill, setSkill] =
    useState('Understanding');

  const [mastery, setMastery] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [lastAction, setLastAction] =
    useState<LearningAction | null>(null);

  const applyTwinState = (
    state: LearningTwinState
  ) => {
    setTopic(state.topic);
    setSkill(state.skill);
    setMastery(state.mastery);
    setConfidence(state.confidence);
    setAttempts(state.attempts);
    setCorrectAnswers(state.correctAnswers);
    setWrongAnswers(state.wrongAnswers);
    setHintsUsed(state.hintsUsed);
    setLastAction(state.lastAction);
  };

  useEffect(() => {
    let active = true;

    loadLearningTwinState()
      .then((state) => {
        if (active) {
          applyTwinState(state);
        }
      })
      .catch((error) => {
        console.error(
          'Unable to load Learning Twin:',
          error
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const topicIcon = useMemo(() => {
    const value =
      `${topic} ${skill}`.toLowerCase();

    if (value.includes('math')) {
      return 'calculator-outline' as const;
    }

    if (
      value.includes('biology') ||
      value.includes('science') ||
      value.includes('photo')
    ) {
      return 'leaf-outline' as const;
    }

    if (
      value.includes('english') ||
      value.includes('language')
    ) {
      return 'language-outline' as const;
    }

    return 'book-outline' as const;
  }, [skill, topic]);

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

          <View style={styles.headerButton}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color="#70F7D4"
            />
          </View>
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
                {topic}
              </Text>
            </View>

            <View style={styles.subjectIcon}>
              <Ionicons
                name={topicIcon}
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
              Slickk’s Learning Twin runs privately in the app and local
              server. Its model runtime is replaceable and may later become
              an evaluated Slickk-trained model.
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
